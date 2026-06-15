"""BTC OHLCV ingestion from the Binance public data mirror (BACK-01).

Fetches gap-free BTCUSDT 1h klines and caches them to parquet; callers slice to
the desired window via load_window().

Per CONTEXT.md D-01: 365-day hourly is the active window.
Per CONTEXT.md D-05: every bar's data is observable 1 ms after close;
  available_at = ts_ms + 3_600_001 (1 hour + 1 ms).

Source: https://data-api.binance.vision/api/v3/klines  (symbol=BTCUSDT,
interval=1h). This is Binance's official public market-data mirror — no auth,
no API key, market data only. We use it instead of the CryptoDataDownload CSV
(the prior source) because the free CDD feed shipped (a) mixed-unit timestamps
and (b) 409 gaps > 1h across its history, including recurring 6-day holes, which
the lookahead-audit gap guard in load_window() correctly rejects. Binance klines
are contiguous (crypto trades 24/7), so the audit-integrity guard passes on real
data without any gap-filling that would compromise BACK-06.

Kline payload (array per bar):
  [0] openTime ms · [1] open · [2] high · [3] low · [4] close · [5] volume(BTC)
  [6] closeTime ms · [7] quoteAssetVolume(USDT) · [8] numberOfTrades · ...

Convention: openTime is already milliseconds; we store it as ts_ms verbatim so
downstream code uniformly works in ms (matches Move's u64 ms vault-event
timestamps and strategy_constants.TOKEN_BUCKET_REFILL_RATE_PER_MS).

This module ships in Plan 03-02 (Wave 1) and is the foundation for Plans 03-04
(vault_state), 03-06 (replay parity), and 03-08 (walk-forward).
"""

from __future__ import annotations

import time
from pathlib import Path

import pandas as pd
import requests

# REPO_ROOT discovery follows parity_runner.py:39 idiom.
#   backtest/src/deepvault/data_ingest.py -> parents[3] is the repo root.
REPO_ROOT = Path(__file__).resolve().parents[3]
CACHE_PATH = REPO_ROOT / "backtest" / "data" / "btcusdt_1h.parquet"

# Binance public market-data mirror (reachable where api.binance.com is geo-blocked).
BINANCE_KLINES_URL = "https://data-api.binance.vision/api/v3/klines"
SYMBOL = "BTCUSDT"
INTERVAL = "1h"

# How much history to fetch: the 365-day active window (D-01) plus headroom for
# the walk-forward's monthly calibration windows over the in-sample portion.
FETCH_WINDOW_DAYS: int = 420

# Time constants (milliseconds).
_ONE_HOUR_MS: int = 3_600_000
_ONE_MS: int = 1
_ONE_DAY_MS: int = 86_400_000
_GAP_SLACK_MS: int = 60_000  # 1-minute slack on top of 1-hour bar cadence.
_KLINES_LIMIT: int = 1000  # Binance max bars per request.

# Canonical column order of the raw kline array (12 fields).
_KLINE_COLUMNS = [
    "ts_ms",
    "open",
    "high",
    "low",
    "close",
    "volume_btc",
    "_close_time",
    "volume_usdt",
    "trade_count",
    "_taker_base",
    "_taker_quote",
    "_ignore",
]


def _now_ms() -> int:
    """Wall-clock now in milliseconds (the upper bound of the fetch window)."""
    return int(time.time() * 1000)


def _fetch_binance_klines(start_ms: int, end_ms: int) -> list:
    """Paginated, gap-free klines from the Binance data mirror over [start, end).

    Walks forward 1000 bars per request (the Binance cap), advancing the cursor
    to one hour past the last bar of each batch. Stops when a short or empty
    batch signals the end of available data.
    """
    rows: list = []
    cursor = start_ms
    while cursor < end_ms:
        resp = requests.get(
            BINANCE_KLINES_URL,
            params={
                "symbol": SYMBOL,
                "interval": INTERVAL,
                "startTime": cursor,
                "endTime": end_ms,
                "limit": _KLINES_LIMIT,
            },
            timeout=30,
        )
        resp.raise_for_status()
        batch = resp.json()
        if not batch:
            break
        rows.extend(batch)
        nxt = int(batch[-1][0]) + _ONE_HOUR_MS
        if nxt <= cursor:  # safety: no forward progress
            break
        cursor = nxt
        if len(batch) < _KLINES_LIMIT:  # reached the end of available data
            break
    return rows


def fetch_btc_hourly(force_redownload: bool = False) -> pd.DataFrame:
    """Fetch gap-free BTCUSDT hourly klines from the Binance data mirror.

    Caches to parquet on first run; subsequent calls read from cache. Returns a
    DataFrame sorted ASCENDING by ts_ms. Fetches the trailing FETCH_WINDOW_DAYS
    of history; the caller (typically load_window) slices to the desired window.

    Columns returned (canonical schema):
        ts_ms          int64   bar open timestamp in milliseconds
        open / high / low / close   float64
        volume_btc     float64
        volume_usdt    float64
        trade_count    int64
        available_at   int64   ts_ms + 3_600_001 (D-05 observation-bar invariant)

    Args:
        force_redownload: when True, bypass the cache and fetch fresh data.

    Raises:
        RuntimeError: if the mirror returns no data.
        requests.HTTPError: if the upstream returns a non-2xx status.
    """
    if CACHE_PATH.exists() and not force_redownload:
        return pd.read_parquet(CACHE_PATH)

    end_ms = _now_ms()
    start_ms = end_ms - FETCH_WINDOW_DAYS * _ONE_DAY_MS
    raw = _fetch_binance_klines(start_ms, end_ms)
    if not raw:
        raise RuntimeError(
            f"Binance klines fetch returned no data for {SYMBOL} {INTERVAL} "
            f"over ({start_ms}, {end_ms}] — mirror unreachable or symbol changed?"
        )

    df = pd.DataFrame(raw, columns=_KLINE_COLUMNS)
    df = df[
        [
            "ts_ms",
            "open",
            "high",
            "low",
            "close",
            "volume_btc",
            "volume_usdt",
            "trade_count",
        ]
    ].copy()

    # openTime is already milliseconds; OHLCV fields arrive as strings.
    df["ts_ms"] = df["ts_ms"].astype("int64")
    for col in ("open", "high", "low", "close", "volume_btc", "volume_usdt"):
        df[col] = df[col].astype(float)
    df["trade_count"] = df["trade_count"].astype("int64")

    # Dedupe defensively (overlapping page boundaries) and sort ascending.
    df = (
        df.drop_duplicates(subset="ts_ms", keep="first")
        .sort_values("ts_ms", ascending=True)
        .reset_index(drop=True)
    )

    # available_at: a bar with open ts_ms = T closes at T + 1h; data is queryable
    # 1 ms after close, so available_at = T + 3_600_001. Every join condition
    # downstream enforces `available_at <= decision_time` (D-05/D-08).
    df["available_at"] = df["ts_ms"] + _ONE_HOUR_MS + _ONE_MS

    # Persist to parquet (snappy — pyarrow default, compact for numeric columns).
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(CACHE_PATH, compression="snappy", index=False)
    return df


def load_window(start_ts_ms: int, end_ts_ms: int) -> pd.DataFrame:
    """Slice the cached BTC tape to the half-open interval (start_ts_ms, end_ts_ms].

    Loudly raises RuntimeError if any consecutive gap in the window exceeds
    1 hour + 60 s slack. This protects the lookahead-audit invariant (BACK-06 /
    T-03-06): a holed tape would let the replay's decision/observation split
    silently skip bars. Binance klines are contiguous, so a real gap here signals
    a genuine data problem rather than feed format noise.

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
