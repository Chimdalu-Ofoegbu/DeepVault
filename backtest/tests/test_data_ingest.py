"""Tests for data_ingest: CryptoDataDownload Binance CSV fetcher + parquet cache + gap detection.

Per Plan 03-02 (BACK-01):
- fetch_btc_hourly() reads from cache if exists; otherwise downloads via requests.
- CSV has a "Disclaimer" prefix line — skiprows=1.
- Columns normalised to ts_ms/open/high/low/close/volume_btc/volume_usdt/trade_count.
- ts_ms stores milliseconds (CSV ships seconds — we multiply by 1000 on ingest).
- available_at = ts_ms + 3_600_001 (1 hour + 1 ms; bar's data is observable 1ms after close).
- load_window() raises on consecutive gap > 1h + 1min slack.
- assert df.columns[0] == 'Unix' is the format-drift guard (T-03-05 mitigation).

Tests use monkeypatched requests.get to avoid network calls in CI.
"""

from __future__ import annotations

import pandas as pd
import pytest

from deepvault import data_ingest
from deepvault.data_ingest import (
    CACHE_PATH,
    URL_BTCUSDT_1H,
    fetch_btc_hourly,
    load_window,
)

# Canonical 3-bar synthetic CSV with CryptoDataDownload "Disclaimer" prefix line.
# Header columns: Unix, Date, Symbol, Open, High, Low, Close,
# Volume BTC, Volume USDT, tradecount (CDD-verified format).
SAMPLE_CSV = (
    b"Disclaimer line ignored\n"
    b"Unix,Date,Symbol,Open,High,Low,Close,Volume BTC,Volume USDT,tradecount\n"
    b"1717552800,2024-06-05 02:00,BTCUSDT,67100,67300,66900,67250,160.8,10796670,3500\n"
    b"1717545600,2024-06-05 00:00,BTCUSDT,67000,67500,66800,67200,150.5,10103850,3200\n"
    b"1717549200,2024-06-05 01:00,BTCUSDT,67200,67400,67000,67100,140.2,9412220,3000\n"
)


class _FakeResponse:
    """Stand-in for requests.Response in tests; never hits the network."""

    def __init__(self, content: bytes, status_code: int = 200):
        self.content = content
        self.status_code = status_code

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")


@pytest.fixture
def clean_cache(monkeypatch, tmp_path):
    """Redirect CACHE_PATH to a tmp_path-isolated location so tests are hermetic.

    monkeypatch.setattr replaces the module-level CACHE_PATH constant; this is
    safe because data_ingest reads it via the module attribute (not closure).
    """
    fake_cache = tmp_path / "btcusdt_1h.parquet"
    monkeypatch.setattr(data_ingest, "CACHE_PATH", fake_cache)
    return fake_cache


def test_fetch_btc_hourly_reads_cache_when_exists(clean_cache, monkeypatch):
    """If the parquet cache exists, fetch_btc_hourly returns it without hitting the network."""
    # Pre-write a parquet to the redirected cache path.
    cached_df = pd.DataFrame(
        {
            "ts_ms": [0, 3_600_000],
            "open": [100.0, 101.0],
            "high": [102.0, 103.0],
            "low": [99.0, 100.0],
            "close": [101.0, 102.0],
            "volume_btc": [1.0, 2.0],
            "volume_usdt": [101.0, 204.0],
            "trade_count": [10, 20],
            "available_at": [3_600_001, 7_200_001],
        }
    )
    clean_cache.parent.mkdir(parents=True, exist_ok=True)
    cached_df.to_parquet(clean_cache, compression="snappy", index=False)

    # Sentinel: if requests.get is called, fail loudly.
    def _explode(*args, **kwargs):
        raise AssertionError("requests.get must not be called when cache exists")

    monkeypatch.setattr("deepvault.data_ingest.requests.get", _explode)

    out = fetch_btc_hourly()
    assert len(out) == 2
    assert list(out.columns) == list(cached_df.columns)


def test_fetch_btc_hourly_skips_disclaimer_line_and_renames_columns(clean_cache, monkeypatch):
    """Disclaimer prefix line is skipped via skiprows=1; columns renamed to canonical schema."""

    def _fake_get(url, timeout=None):
        assert url == URL_BTCUSDT_1H
        return _FakeResponse(SAMPLE_CSV)

    monkeypatch.setattr("deepvault.data_ingest.requests.get", _fake_get)

    df = fetch_btc_hourly()
    # Canonical schema — Unix/Open/High/Low/Close/Volume BTC/Volume USDT/tradecount renamed.
    expected_cols = {
        "ts_ms",
        "open",
        "high",
        "low",
        "close",
        "volume_btc",
        "volume_usdt",
        "trade_count",
        "available_at",
    }
    assert expected_cols.issubset(set(df.columns))
    # The raw CSV header names must NOT survive.
    assert "Unix" not in df.columns
    assert "Volume BTC" not in df.columns


def test_fetch_btc_hourly_sorts_ascending_by_ts_ms(clean_cache, monkeypatch):
    """CSV ships in descending order — fetch_btc_hourly must flip to ascending."""

    def _fake_get(url, timeout=None):
        return _FakeResponse(SAMPLE_CSV)

    monkeypatch.setattr("deepvault.data_ingest.requests.get", _fake_get)

    df = fetch_btc_hourly()
    assert df["ts_ms"].is_monotonic_increasing


def test_fetch_btc_hourly_adds_available_at_column(clean_cache, monkeypatch):
    """available_at = ts_ms + 3_600_001 for every row (D-05 / D-08 observation-bar invariant)."""

    def _fake_get(url, timeout=None):
        return _FakeResponse(SAMPLE_CSV)

    monkeypatch.setattr("deepvault.data_ingest.requests.get", _fake_get)

    df = fetch_btc_hourly()
    assert (df["available_at"] == df["ts_ms"] + 3_600_001).all()


def test_fetch_btc_hourly_converts_seconds_to_milliseconds(clean_cache, monkeypatch):
    """CSV Unix column is seconds; ts_ms must be milliseconds (×1000) for the harness convention."""

    def _fake_get(url, timeout=None):
        return _FakeResponse(SAMPLE_CSV)

    monkeypatch.setattr("deepvault.data_ingest.requests.get", _fake_get)

    df = fetch_btc_hourly()
    # 1717545600 s -> 1_717_545_600_000 ms (the earliest bar after ascending sort).
    assert int(df["ts_ms"].iloc[0]) == 1_717_545_600_000
    # Consecutive bars are 1 hour apart = 3_600_000 ms.
    diffs = df["ts_ms"].diff().dropna().unique().tolist()
    assert diffs == [3_600_000]


def test_load_window_slices_correctly(clean_cache, monkeypatch):
    """Half-open interval (start, end]: bars at ts_ms in (start_ts_ms, end_ts_ms] are returned."""
    # Pre-write a cache with bars at 0, 3_600_000, 7_200_000 ms (no gaps).
    cached = pd.DataFrame(
        {
            "ts_ms": [0, 3_600_000, 7_200_000],
            "open": [1.0, 2.0, 3.0],
            "high": [1.0, 2.0, 3.0],
            "low": [1.0, 2.0, 3.0],
            "close": [1.0, 2.0, 3.0],
            "volume_btc": [0.1, 0.2, 0.3],
            "volume_usdt": [1.0, 2.0, 3.0],
            "trade_count": [1, 2, 3],
            "available_at": [3_600_001, 7_200_001, 10_800_001],
        }
    )
    clean_cache.parent.mkdir(parents=True, exist_ok=True)
    cached.to_parquet(clean_cache, compression="snappy", index=False)

    # (0, 3_600_000] → exactly one bar (ts_ms = 3_600_000).
    window = load_window(0, 3_600_000)
    assert len(window) == 1
    assert int(window["ts_ms"].iloc[0]) == 3_600_000


def test_load_window_raises_on_gap(clean_cache, monkeypatch):
    """A consecutive gap > 1h + 1min slack must raise RuntimeError mentioning 'gap'."""
    # Bars at 0, 3_600_000, 14_400_000 ms — gap from 3.6e6 to 14.4e6 = 10.8e6 ms = 3 hours.
    cached = pd.DataFrame(
        {
            "ts_ms": [0, 3_600_000, 14_400_000],
            "open": [1.0, 2.0, 3.0],
            "high": [1.0, 2.0, 3.0],
            "low": [1.0, 2.0, 3.0],
            "close": [1.0, 2.0, 3.0],
            "volume_btc": [0.1, 0.2, 0.3],
            "volume_usdt": [1.0, 2.0, 3.0],
            "trade_count": [1, 2, 3],
            "available_at": [3_600_001, 7_200_001, 18_000_001],
        }
    )
    clean_cache.parent.mkdir(parents=True, exist_ok=True)
    cached.to_parquet(clean_cache, compression="snappy", index=False)

    with pytest.raises(RuntimeError, match="gap"):
        load_window(0, 14_400_000)


def test_assert_unexpected_csv_format_raises(clean_cache, monkeypatch):
    """If CryptoDataDownload changes column order, the assert in fetch fires loudly (T-03-05)."""
    bogus_csv = (
        b"Disclaimer\n"
        b"Timestamp,Date,Symbol,Open,High,Low,Close,Volume BTC,Volume USDT,tradecount\n"
        b"1717545600,2024-06-05 00:00,BTCUSDT,67000,67500,66800,67200,150.5,10103850,3200\n"
    )

    def _fake_get(url, timeout=None):
        return _FakeResponse(bogus_csv)

    monkeypatch.setattr("deepvault.data_ingest.requests.get", _fake_get)

    with pytest.raises(AssertionError, match="Unix"):
        fetch_btc_hourly()


def test_url_constant_matches_cryptodatadownload():
    """URL_BTCUSDT_1H pins the CryptoDataDownload Binance 1h CSV endpoint (RESEARCH.md A6)."""
    assert URL_BTCUSDT_1H == "https://www.cryptodatadownload.com/cdd/Binance_BTCUSDT_1h.csv"


def test_cache_path_is_inside_backtest_data():
    """CACHE_PATH lives at backtest/data/btcusdt_1h.parquet (gitignored per .gitignore)."""
    # The constant is a Path; coerce to string for portable substring assertion.
    path_str = str(CACHE_PATH).replace("\\", "/")
    assert path_str.endswith("backtest/data/btcusdt_1h.parquet")


def test_force_redownload_bypasses_cache(clean_cache, monkeypatch):
    """force_redownload=True triggers a fresh fetch even when the cache exists."""
    # Pre-write a stale cache that should be overwritten.
    stale = pd.DataFrame(
        {
            "ts_ms": [999_999],
            "open": [0.0],
            "high": [0.0],
            "low": [0.0],
            "close": [0.0],
            "volume_btc": [0.0],
            "volume_usdt": [0.0],
            "trade_count": [0],
            "available_at": [3_600_999],
        }
    )
    clean_cache.parent.mkdir(parents=True, exist_ok=True)
    stale.to_parquet(clean_cache, compression="snappy", index=False)

    called = {"n": 0}

    def _fake_get(url, timeout=None):
        called["n"] += 1
        return _FakeResponse(SAMPLE_CSV)

    monkeypatch.setattr("deepvault.data_ingest.requests.get", _fake_get)

    df = fetch_btc_hourly(force_redownload=True)
    assert called["n"] == 1
    # Fresh data is the 3 SAMPLE_CSV bars, not the stale 999_999 row.
    assert len(df) == 3
    assert 999_999 not in df["ts_ms"].tolist()
