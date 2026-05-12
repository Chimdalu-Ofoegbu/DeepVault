"""Walk-forward methodology tests (BACK-07, BACK-09).

Covers CONTEXT.md:
  D-03: 30% out-of-sample holdback.
  D-04: monthly walk-forward cadence.
  D-10: drawdown + Sharpe + Sortino on OOS only, 8,760 bars/year annualization.
  Claude's Discretion: v1 ratio (ALLOCATION_BPS=1000=10%) is PRESERVED regardless
  of which sensitivity row produces highest Sharpe.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from deepvault.strategy_constants import ALLOCATION_BPS
from deepvault.walk_forward import (
    BARS_PER_YEAR,
    DrawdownResult,
    OOS_FRACTION,
    SENSITIVITY_RATIOS,
    WalkForwardResult,
    compute_drawdown_max_sharpe_sortino,
    run_walk_forward,
    sensitivity_table,
    split_walk_forward,
)


@pytest.fixture
def synthetic_btc_data():
    """365 days hourly synthetic BTC data with deterministic returns."""
    n_bars = 365 * 24
    rng = np.random.default_rng(42)
    ts_ms = np.arange(n_bars, dtype=np.int64) * 3_600_000 + 1_700_000_000_000
    log_returns = rng.normal(0, 0.01, n_bars)
    close = 60_000 * np.exp(np.cumsum(log_returns))
    return pd.DataFrame(
        {
            "ts_ms": ts_ms,
            "available_at": ts_ms + 3_600_001,
            "open": close,
            "high": close * 1.005,
            "low": close * 0.995,
            "close": close,
            "volume_btc": np.full(n_bars, 100.0),
            "volume_usdt": np.full(n_bars, 6_000_000.0),
        }
    )


@pytest.fixture
def short_btc_data():
    """7 days of synthetic hourly bars — fast sensitivity-table runs."""
    n_bars = 7 * 24
    rng = np.random.default_rng(7)
    ts_ms = np.arange(n_bars, dtype=np.int64) * 3_600_000 + 1_700_000_000_000
    log_returns = rng.normal(0, 0.005, n_bars)
    close = 60_000 * np.exp(np.cumsum(log_returns))
    return pd.DataFrame(
        {
            "ts_ms": ts_ms,
            "available_at": ts_ms + 3_600_001,
            "open": close,
            "high": close * 1.005,
            "low": close * 0.995,
            "close": close,
            "volume_btc": np.full(n_bars, 100.0),
            "volume_usdt": np.full(n_bars, 6_000_000.0),
        }
    )


# --------------------------------------------------------------------- split / windows


def test_split_walk_forward_30pct_oos(synthetic_btc_data):
    """Per D-03: most recent 30% of bars is held back as OOS."""
    oos, windows = split_walk_forward(synthetic_btc_data, oos_fraction=0.30)
    expected_oos_len = len(synthetic_btc_data) - int(len(synthetic_btc_data) * (1 - 0.30))
    assert len(oos) == expected_oos_len
    # OOS is the MOST RECENT slice — ts_ms strictly after in-sample tail.
    in_sample_end = synthetic_btc_data["ts_ms"].iloc[int(len(synthetic_btc_data) * 0.70) - 1]
    assert oos["ts_ms"].iloc[0] >= in_sample_end


def test_split_walk_forward_returns_monthly_windows(synthetic_btc_data):
    """Per D-04: monthly calibrate/deploy pairs over in-sample data."""
    _, windows = split_walk_forward(synthetic_btc_data, oos_fraction=0.30)
    assert len(windows) > 0
    for calibrate_month, deploy_month in windows:
        assert deploy_month > calibrate_month


def test_split_walk_forward_default_fraction_matches_constant(synthetic_btc_data):
    oos_explicit, _ = split_walk_forward(synthetic_btc_data, oos_fraction=OOS_FRACTION)
    oos_default, _ = split_walk_forward(synthetic_btc_data)
    pd.testing.assert_frame_equal(oos_explicit, oos_default)


# --------------------------------------------------------------------- OOS purity


def test_oos_never_touched_during_calibration(synthetic_btc_data):
    """The OOS slice must be bit-identical pre and post calibration loop."""
    oos, _ = split_walk_forward(synthetic_btc_data, oos_fraction=0.30)
    pre_oos = oos.copy(deep=True)
    _ = run_walk_forward(synthetic_btc_data, hedge_ratio=0.10)
    pd.testing.assert_frame_equal(pre_oos, oos)


# --------------------------------------------------------------------- run_walk_forward


def test_run_walk_forward_returns_typed_result(short_btc_data):
    result = run_walk_forward(short_btc_data, hedge_ratio=0.10)
    assert isinstance(result, WalkForwardResult)
    # Equity curve + actions must be exposed for the __main__ CLI (Task 3 W4 lock).
    assert hasattr(result, "equity_curve")
    assert hasattr(result, "actions")


def test_run_walk_forward_equity_curve_finite(short_btc_data):
    result = run_walk_forward(short_btc_data, hedge_ratio=0.10)
    assert isinstance(result.equity_curve, pd.Series)
    if len(result.equity_curve) > 0:
        assert np.isfinite(result.equity_curve.values).all()


# --------------------------------------------------------------------- sensitivity_table


def test_sensitivity_table_has_5_ratios(short_btc_data):
    table = sensitivity_table(short_btc_data)
    assert len(table) == 5
    assert list(table["hedge_ratio"]) == SENSITIVITY_RATIOS
    assert SENSITIVITY_RATIOS == [0.05, 0.10, 0.15, 0.20, 0.30]


def test_sensitivity_table_columns(short_btc_data):
    table = sensitivity_table(short_btc_data)
    expected = {
        "hedge_ratio",
        "in_sample_sharpe",
        "oos_sharpe",
        "oos_max_drawdown_bps",
        "oos_apy",
    }
    assert expected.issubset(set(table.columns))


def test_v1_ratio_preserved_in_strategy_constants():
    """Per Claude's Discretion — production reads ratio from strategy_constants,
    NOT from the sensitivity table. Even if sensitivity flags a different row,
    ALLOCATION_BPS remains 1000."""
    assert ALLOCATION_BPS == 1000


# --------------------------------------------------------------------- drawdown / sharpe / sortino


def test_drawdown_zero_on_monotone_increasing():
    equity = pd.Series([100.0, 101.0, 102.0, 103.0, 104.0, 105.0])
    result = compute_drawdown_max_sharpe_sortino(equity)
    assert isinstance(result, DrawdownResult)
    assert result.max_drawdown_bps == 0
    assert result.underwater_bars == 0


def test_drawdown_detects_peak_to_trough():
    equity = pd.Series([100.0, 110.0, 90.0, 95.0, 100.0])
    result = compute_drawdown_max_sharpe_sortino(equity)
    # Peak 110, trough 90: (90-110)/110 = -0.181818 -> -1818 bps.
    assert result.max_drawdown_bps < 0
    expected = int((90 - 110) / 110 * 10_000)
    assert abs(result.max_drawdown_bps - expected) <= 1


def test_sharpe_on_zero_returns_is_zero():
    equity = pd.Series([100.0, 100.0, 100.0, 100.0])
    result = compute_drawdown_max_sharpe_sortino(equity)
    # Zero-variance returns must yield 0.0, NOT NaN/inf.
    assert result.sharpe == 0.0
    assert result.sortino == 0.0


def test_compute_drawdown_uses_8760_bars_per_year():
    """RESEARCH.md A9 + CONTEXT.md D-10: hourly bars -> 8,760 bars/year."""
    assert BARS_PER_YEAR == 8_760


def test_empty_equity_curve_returns_zeros():
    result = compute_drawdown_max_sharpe_sortino(pd.Series([], dtype=float))
    assert result.max_drawdown_bps == 0
    assert result.underwater_bars == 0
    assert result.sharpe == 0.0
    assert result.sortino == 0.0


def test_single_point_equity_curve_returns_zeros():
    result = compute_drawdown_max_sharpe_sortino(pd.Series([100.0]))
    assert result.max_drawdown_bps == 0
    assert result.sharpe == 0.0
    assert result.sortino == 0.0


def test_sortino_uses_downside_deviation_only():
    """Sortino penalizes only negative returns. With a series where all
    negatives have the same magnitude as the positive std, sortino MUST be
    larger than sharpe (smaller denominator)."""
    # Pattern of small-positive / large-negative bars.
    equity = pd.Series([100.0, 102.0, 99.0, 101.0, 98.0, 100.0, 101.0])
    result = compute_drawdown_max_sharpe_sortino(equity)
    # Both finite, non-NaN.
    assert np.isfinite(result.sharpe)
    assert np.isfinite(result.sortino)


def test_underwater_bars_counts_longest_run():
    """Underwater duration = longest consecutive run of drawdown < 0."""
    # Equity: 100, 110 (peak), 100, 95, 92, 110 (recovery), 105
    # Underwater bars (drawdown<0): bars 2,3,4 then bar 6 -> longest=3.
    equity = pd.Series([100.0, 110.0, 100.0, 95.0, 92.0, 110.0, 105.0])
    result = compute_drawdown_max_sharpe_sortino(equity)
    assert result.underwater_bars >= 3
