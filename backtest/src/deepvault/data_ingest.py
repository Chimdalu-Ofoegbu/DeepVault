"""BTC OHLCV ingestion from CryptoDataDownload Binance (BACK-01).

Fetches the full BTCUSDT 1h history (Binance launched 2017-07; ~70k bars as
of 2026-05); caller slices to the desired window via load_window().

Per CONTEXT.md D-01: 365-day hourly is the active window.
Per CONTEXT.md D-05: every bar's data is observable 1 ms after close;
  available_at = ts_ms + 3_600_001 (1 hour + 1 ms).

Source: https://www.cryptodatadownload.com/cdd/Binance_BTCUSDT_1h.csv
Verified 2026-05-11 (RESEARCH.md A6, A7).

CSV header: Unix,Date,Symbol,Open,High,Low,Close,Volume BTC,Volume USDT,tradecount
Format note: CryptoDataDownload prepends a "Disclaimer" line — skiprows=1.

Convention: the CSV's `Unix` column is seconds (Binance epoch). We rename to
`ts_ms` AND multiply by 1000 so downstream code uniformly works in milliseconds
(matches strategy_constants.TOKEN_BUCKET_REFILL_RATE_PER_MS and Move's u64 ms
timestamps in vault events).

Note: this module ships in Plan 03-02 (Wave 1) and is the foundation for Plans
03-04 (vault_state), 03-06 (replay parity), and 03-08 (walk-forward).
"""

from __future__ import annotations

from io import BytesIO
from pathlib import Path

import pandas as pd
import requests

# REPO_ROOT discovery follows parity_runner.py:39 idiom.
#   backtest/src/deepvault/data_ingest.py -> parents[3] is the repo root.
REPO_ROOT = Path(__file__).resolve().parents[3]
CACHE_PATH = REPO_ROOT / "backtest" / "data" / "btcusdt_1h.parquet"
URL_BTCUSDT_1H = "https://www.cryptodatadownload.com/cdd/Binance_BTCUSDT_1h.csv"

# Time constants (milliseconds).
_ONE_HOUR_MS: int = 3_600_000
_ONE_MS: int = 1
_GAP_SLACK_MS: int = 60_000  # 1-minute slack on top of 1-hour bar cadence.


def fetch_btc_hourly(force_redownload: bool = False) -> pd.DataFrame:
    """Fetch the full BTCUSDT hourly history from CryptoDataDownload Binance.

    Caches to parquet on first run; subsequent calls read from cache. Returns
    a DataFrame sorted ASCENDING by ts_ms (CryptoDataDownload ships descending;
    we flip).

    Per CONTEXT.md D-01, the caller (typically load_window) slices to the
    desired 365-day window. This function fetches the FULL history.

    Columns returned (canonical schema):
        ts_ms          int64   bar open timestamp in milliseconds (CSV Unix × 1000)
        open / high / low / close   float64
        volume_btc     float64
        volume_usdt    float64
        trade_count    int64
        available_at   int64   ts_ms + 3_600_001 (D-05 observation-bar invariant)

    Args:
        force_redownload: when True, bypass the cache and fetch fresh data.

    Raises:
        AssertionError: if the CSV's first column after skiprows=1 is not
            "Unix" — load-bearing format-drift guard (T-03-05; RESEARCH.md A7).
        requests.HTTPError: if the upstream returns a non-2xx status.
    """
    if CACHE_PATH.exists() and not force_redownload:
        return pd.read_parquet(CACHE_PATH)

    resp = requests.get(URL_BTCUSDT_1H, timeout=60)
    resp.raise_for_status()

    # CryptoDataDownload prepends a "Disclaimer" row before the header.
    df = pd.read_csv(BytesIO(resp.content), skiprows=1)

    # Format-drift guard (T-03-05 mitigation). If the column order or naming
    # changes upstream, fail LOUDLY at fetch time rather than silently producing
    # wrong numbers downstream.
    assert df.columns[0] == "Unix", (
        f"unexpected column[0]={df.columns[0]!r}; expected 'Unix' — "
        f"CryptoDataDownload CSV format may have changed (RESEARCH.md A7)"
    )

    # Normalise column names to the canonical schema.
    df = df.rename(
        columns={
            "Unix": "ts_ms",
            "Open": "open",
            "High": "high",
            "Low": "low",
            "Close": "close",
            "Volume BTC": "volume_btc",
            "Volume USDT": "volume_usdt",
            "tradecount": "trade_count",
        }
    )

    # Convert CSV-seconds to milliseconds so the column name matches its unit
    # AND aligns with the Move-side u64 ms convention (vault events emit ms).
    df["ts_ms"] = (df["ts_ms"].astype("int64")) * 1000

    df = df.sort_values("ts_ms", ascending=True).reset_index(drop=True)

    # available_at: a bar with open ts_ms = T closes at T + 1h; data is
    # queryable 1 ms after close, so available_at = T + 3_600_001. Every join
    # condition downstream enforces `available_at <= decision_time` (D-05/D-08).
    df["available_at"] = df["ts_ms"] + _ONE_HOUR_MS + _ONE_MS

    # Persist to parquet. snappy compression is the pyarrow default and is
    # smaller than gzip for this column shape (mostly numeric).
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(CACHE_PATH, compression="snappy", index=False)
    return df


def load_window(start_ts_ms: int, end_ts_ms: int) -> pd.DataFrame:
    """Slice the cached BTC tape to the half-open interval (start_ts_ms, end_ts_ms].

    Loudly raises RuntimeError if any consecutive gap in the window exceeds
    1 hour + 60 s slack (Binance maintenance windows are rare; we want to fail
    LOUDLY rather than silently produce a backtest run on a holed tape — see
    threat T-03-06).

    Args:
        start_ts_ms: exclusive lower bound (ts_ms > start_ts_ms).
        end_ts_ms: inclusive upper bound (ts_ms <= end_ts_ms).

    Returns:
        DataFrame with the same canonical schema as fetch_btc_hourly(), sliced
        and re-indexed.

    Raises:
        RuntimeError: if any consecutive gap exceeds _ONE_HOUR_MS + _GAP_SLACK_MS.
    """
    df = fetch_btc_hourly()
    mask = (df["ts_ms"] > start_ts_ms) & (df["ts_ms"] <= end_ts_ms)
    window = df.loc[mask].reset_index(drop=True)

    ts_gaps = window["ts_ms"].diff().dropna()
    bad_gaps = ts_gaps[ts_gaps > _ONE_HOUR_MS + _GAP_SLACK_MS]
    if not bad_gaps.empty:
        raise RuntimeError(
            f"BTC data has {len(bad_gaps)} gap(s) > 1 hour in window "
            f"({start_ts_ms}, {end_ts_ms}] — max gap = {int(bad_gaps.max())} ms"
        )
    return window
