"""Tests for data_ingest: Binance data-mirror klines fetcher + parquet cache + gap detection.

Per Plan 03-02 (BACK-01), updated 2026-06 to the Binance public data mirror
(the prior CryptoDataDownload CSV feed shipped mixed-unit timestamps + 6-day
gaps that the lookahead-audit guard rejects):
- fetch_btc_hourly() reads from cache if exists; otherwise fetches via requests.
- klines openTime is already milliseconds; stored verbatim as ts_ms.
- Columns normalised to ts_ms/open/high/low/close/volume_btc/volume_usdt/trade_count.
- available_at = ts_ms + 3_600_001 (1 hour + 1 ms; bar observable 1ms after close).
- load_window() raises on consecutive gap > 1h + 1min slack.

Tests use monkeypatched requests.get to avoid network calls in CI.
"""

from __future__ import annotations

import pandas as pd
import pytest

from deepvault import data_ingest
from deepvault.data_ingest import (
    BINANCE_KLINES_URL,
    CACHE_PATH,
    fetch_btc_hourly,
    load_window,
)

# Canonical 3-bar synthetic kline payload (Binance /api/v3/klines array shape).
# Ascending, 1h apart (3_600_000 ms), openTime already in milliseconds.
#   [openTime, open, high, low, close, volume, closeTime, quoteVol, trades, ...]
SAMPLE_KLINES = [
    [1_717_545_600_000, "67000", "67500", "66800", "67200", "150.5",
     1_717_549_199_999, "10103850", 3200, "75", "5051925", "0"],
    [1_717_549_200_000, "67200", "67400", "67000", "67100", "140.2",
     1_717_552_799_999, "9412220", 3000, "70", "4706110", "0"],
    [1_717_552_800_000, "67100", "67300", "66900", "67250", "160.8",
     1_717_556_399_999, "10796670", 3500, "80", "5398335", "0"],
]


class _FakeKlinesResponse:
    """Stand-in for requests.Response in tests; never hits the network."""

    def __init__(self, payload: list, status_code: int = 200):
        self._payload = payload
        self.status_code = status_code

    def json(self) -> list:
        return self._payload

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")


def _single_batch_get(payload=SAMPLE_KLINES):
    """Build a monkeypatch target that returns `payload` once then empties.

    The paginated fetcher stops on a short batch (< 1000), so a single 3-bar
    batch returns exactly those bars.
    """

    def _fake_get(url, params=None, timeout=None):
        assert url == BINANCE_KLINES_URL
        return _FakeKlinesResponse(payload)

    return _fake_get


@pytest.fixture
def clean_cache(monkeypatch, tmp_path):
    """Redirect CACHE_PATH to a tmp_path-isolated location so tests are hermetic."""
    fake_cache = tmp_path / "btcusdt_1h.parquet"
    monkeypatch.setattr(data_ingest, "CACHE_PATH", fake_cache)
    return fake_cache


def test_fetch_btc_hourly_reads_cache_when_exists(clean_cache, monkeypatch):
    """If the parquet cache exists, fetch_btc_hourly returns it without hitting the network."""
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

    def _explode(*args, **kwargs):
        raise AssertionError("requests.get must not be called when cache exists")

    monkeypatch.setattr("deepvault.data_ingest.requests.get", _explode)

    out = fetch_btc_hourly()
    assert len(out) == 2
    assert list(out.columns) == list(cached_df.columns)


def test_fetch_btc_hourly_maps_klines_to_canonical_schema(clean_cache, monkeypatch):
    """Kline arrays are mapped to the canonical ts_ms/OHLCV/volume/trade_count schema."""
    monkeypatch.setattr("deepvault.data_ingest.requests.get", _single_batch_get())

    df = fetch_btc_hourly()
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
    # OHLCV strings coerced to float; ts_ms/trade_count to int.
    assert df["open"].dtype == float
    assert df["ts_ms"].dtype == "int64"
    assert df["trade_count"].dtype == "int64"
    assert len(df) == 3


def test_fetch_btc_hourly_sorts_ascending_by_ts_ms(clean_cache, monkeypatch):
    """fetch_btc_hourly returns bars ascending by ts_ms."""
    monkeypatch.setattr("deepvault.data_ingest.requests.get", _single_batch_get())
    df = fetch_btc_hourly()
    assert df["ts_ms"].is_monotonic_increasing


def test_fetch_btc_hourly_adds_available_at_column(clean_cache, monkeypatch):
    """available_at = ts_ms + 3_600_001 for every row (D-05 / D-08 observation-bar invariant)."""
    monkeypatch.setattr("deepvault.data_ingest.requests.get", _single_batch_get())
    df = fetch_btc_hourly()
    assert (df["available_at"] == df["ts_ms"] + 3_600_001).all()


def test_fetch_btc_hourly_preserves_millisecond_open_time(clean_cache, monkeypatch):
    """Kline openTime is already milliseconds and must be stored verbatim as ts_ms."""
    monkeypatch.setattr("deepvault.data_ingest.requests.get", _single_batch_get())
    df = fetch_btc_hourly()
    # Earliest bar after ascending sort is the first SAMPLE_KLINES openTime.
    assert int(df["ts_ms"].iloc[0]) == 1_717_545_600_000
    # Consecutive bars are 1 hour apart = 3_600_000 ms.
    diffs = df["ts_ms"].diff().dropna().unique().tolist()
    assert diffs == [3_600_000]


def test_fetch_btc_hourly_raises_when_mirror_returns_no_data(clean_cache, monkeypatch):
    """An empty klines payload (mirror down / bad symbol) raises loudly rather than caching junk."""
    monkeypatch.setattr("deepvault.data_ingest.requests.get", _single_batch_get(payload=[]))
    with pytest.raises(RuntimeError, match="no data"):
        fetch_btc_hourly()


def test_load_window_slices_correctly(clean_cache, monkeypatch):
    """Half-open interval (start, end]: bars at ts_ms in (start_ts_ms, end_ts_ms] are returned."""
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

    window = load_window(0, 3_600_000)
    assert len(window) == 1
    assert int(window["ts_ms"].iloc[0]) == 3_600_000


def test_load_window_raises_on_gap(clean_cache, monkeypatch):
    """A consecutive gap > 1h + 1min slack must raise RuntimeError mentioning 'gap'."""
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


def test_binance_url_constant_pins_data_mirror():
    """BINANCE_KLINES_URL pins the Binance public data-mirror klines endpoint."""
    assert BINANCE_KLINES_URL == "https://data-api.binance.vision/api/v3/klines"


def test_cache_path_is_inside_backtest_data():
    """CACHE_PATH lives at backtest/data/btcusdt_1h.parquet (gitignored per .gitignore)."""
    path_str = str(CACHE_PATH).replace("\\", "/")
    assert path_str.endswith("backtest/data/btcusdt_1h.parquet")


def test_force_redownload_bypasses_cache(clean_cache, monkeypatch):
    """force_redownload=True triggers a fresh fetch even when the cache exists."""
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

    def _fake_get(url, params=None, timeout=None):
        called["n"] += 1
        return _FakeKlinesResponse(SAMPLE_KLINES)

    monkeypatch.setattr("deepvault.data_ingest.requests.get", _fake_get)

    df = fetch_btc_hourly(force_redownload=True)
    assert called["n"] >= 1
    assert len(df) == 3
    assert 999_999 not in df["ts_ms"].tolist()
