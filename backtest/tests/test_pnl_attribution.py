"""PnL attribution six-column tests (BACK-08, CONTEXT.md D-09).

Tests confirm:
  - 7 columns emitted: plp_yield_bps, hedge_cost_bps, hedge_payoff_bps, fees_bps,
    slippage_bps, gas_bps, total_bps.
  - total_bps == sum(other 6 columns) within 1 bp (sum invariant).
  - plp_yield_bps = 0 in v1 (we BUY hedges per WAVE0-DECISION.md Q3).
  - hedge_cost_bps for supply = ALLOCATION_BPS (10% of deposit goes to hedge).
  - fees_bps = 0 in v1 (Phase 2 D-13).
  - slippage_bps uses next-bar VWAP minus next-bar open.
  - gas_bps assumed model.
  - Empty actions list returns empty DataFrame with the 7 columns.
"""

from __future__ import annotations

import pandas as pd
import pytest

from deepvault.pnl_attribution import (
    PNL_COLUMNS,
    compute_attribution,
    compute_risk_metrics,
)
from deepvault.strategy_constants import ALLOCATION_BPS

# --------------------------------------------------------------------- fixtures


@pytest.fixture
def synthetic_market_data():
    """Minimal market data with volume_btc + volume_usdt for slippage computation."""
    return pd.DataFrame(
        {
            "ts_ms": [0, 3_600_000, 7_200_000, 10_800_000],
            "open": [60_000.0, 60_100.0, 60_200.0, 60_300.0],
            "close": [60_100.0, 60_200.0, 60_300.0, 60_400.0],
            "volume_btc": [100.0, 110.0, 120.0, 130.0],
            "volume_usdt": [6_005_000.0, 6_610_000.0, 7_222_000.0, 7_839_000.0],
        }
    )


def _supply_action(
    ts_ms: int, deposit_quote: int, pre_total_assets: int, pre_total_shares: int
) -> dict:
    return {
        "kind": "supply",
        "tx_digest": "0xabc",
        "ts_ms": ts_ms,
        "args": {"deposit_quote": str(deposit_quote)},
        "pre": {
            "balance": "0",
            "total_assets": str(pre_total_assets),
            "total_shares": str(pre_total_shares),
        },
        "post": {"balance": "0", "total_assets": "0", "total_shares": "0"},
        "events": [],
    }


def _roll_action(
    ts_ms: int, payoff_quote: int, new_cost_basis_quote: int, pre_total_assets: int
) -> dict:
    return {
        "kind": "roll",
        "tx_digest": "0xdef",
        "ts_ms": ts_ms,
        "args": {
            "payoff_quote": str(payoff_quote),
            "new_cost_basis_quote": str(new_cost_basis_quote),
        },
        "pre": {"balance": "0", "total_assets": str(pre_total_assets), "total_shares": "0"},
        "post": {"balance": "0", "total_assets": "0", "total_shares": "0"},
        "events": [],
    }


# --------------------------------------------------------------------- column shape


def test_attribution_returns_seven_columns(synthetic_market_data):
    actions = [_supply_action(0, 100_000_000, 10_000_000, 1_000_000)]
    df = compute_attribution(actions, synthetic_market_data)
    expected = set(PNL_COLUMNS) | {"total_bps"}
    assert expected.issubset(set(df.columns))


def test_pnl_columns_constant_has_six_entries():
    assert len(PNL_COLUMNS) == 6
    expected = {
        "plp_yield_bps",
        "hedge_cost_bps",
        "hedge_payoff_bps",
        "fees_bps",
        "slippage_bps",
        "gas_bps",
    }
    assert set(PNL_COLUMNS) == expected


# --------------------------------------------------------------------- sum invariant


def test_total_bps_equals_sum_of_six_columns(synthetic_market_data):
    actions = [
        _supply_action(0, 100_000_000, 10_000_000, 1_000_000),
        _roll_action(7_200_000, 5_000_000, 4_500_000, 100_000_000),
    ]
    df = compute_attribution(actions, synthetic_market_data)
    six_sum = df[list(PNL_COLUMNS)].sum(axis=1)
    drift = (six_sum - df["total_bps"]).abs().max()
    assert drift <= 1, f"six-column sum vs total_bps drift: {drift}"


# --------------------------------------------------------------------- per-column semantics


def test_v1_plp_yield_bps_is_zero(synthetic_market_data):
    """Per WAVE0-DECISION.md Q3 + RESEARCH.md A3: we BUY hedges, not provide PLP."""
    actions = [
        _supply_action(0, 100_000_000, 10_000_000, 1_000_000),
        _roll_action(3_600_000, 1_000_000, 800_000, 100_000_000),
        {
            "kind": "redeem_request",
            "ts_ms": 7_200_000,
            "args": {"user": "0xUSER", "shares": "100"},
            "pre": {"balance": "0", "total_assets": "0", "total_shares": "0"},
            "post": {"balance": "0", "total_assets": "0", "total_shares": "0"},
            "events": [],
        },
    ]
    df = compute_attribution(actions, synthetic_market_data)
    assert (df["plp_yield_bps"] == 0).all()


def test_supply_hedge_cost_bps_matches_allocation(synthetic_market_data):
    """For a supply, hedge_cost_bps = ALLOCATION_BPS (1000 = 10% of deposit)."""
    actions = [_supply_action(0, 100_000_000, 10_000_000, 1_000_000)]
    df = compute_attribution(actions, synthetic_market_data)
    # hedge_alloc = 100_000_000 * 1000 / 10000 = 10_000_000
    # hedge_cost_bps = 10_000_000 * 10000 / 100_000_000 = 1000.
    assert df.loc[0, "hedge_cost_bps"] == ALLOCATION_BPS


def test_v1_fees_bps_is_zero(synthetic_market_data):
    """Per Phase 2 D-13: no strategy-level fees in v1."""
    actions = [
        _supply_action(0, 100_000_000, 10_000_000, 1_000_000),
        _roll_action(3_600_000, 1_000_000, 800_000, 100_000_000),
    ]
    df = compute_attribution(actions, synthetic_market_data)
    assert (df["fees_bps"] == 0).all()


def test_supply_gas_bps_assumption(synthetic_market_data):
    """Per .planning/backtest-assumptions.md PnL attribution gas model: 1 bp per PTB."""
    actions = [_supply_action(0, 100_000_000, 10_000_000, 1_000_000)]
    df = compute_attribution(actions, synthetic_market_data)
    assert df.loc[0, "gas_bps"] == 1


def test_roll_records_payoff_and_new_cost(synthetic_market_data):
    """Roll has positive payoff_bps and positive hedge_cost_bps for new leg."""
    actions = [_roll_action(0, 5_000_000, 4_500_000, 100_000_000)]
    df = compute_attribution(actions, synthetic_market_data)
    assert df.loc[0, "hedge_payoff_bps"] > 0
    assert df.loc[0, "hedge_cost_bps"] > 0


def test_redeem_actions_only_pay_gas(synthetic_market_data):
    """redeem_request / redeem_fulfill / redeem_cancel touch gas only."""
    for kind in ("redeem_request", "redeem_fulfill", "redeem_cancel"):
        action = {
            "kind": kind,
            "ts_ms": 0,
            "args": {"user": "0xUSER"},
            "pre": {"balance": "0", "total_assets": "0", "total_shares": "0"},
            "post": {"balance": "0", "total_assets": "0", "total_shares": "0"},
            "events": [],
        }
        df = compute_attribution([action], synthetic_market_data)
        assert df.loc[0, "gas_bps"] == 1
        for col in (
            "plp_yield_bps",
            "hedge_cost_bps",
            "hedge_payoff_bps",
            "fees_bps",
            "slippage_bps",
        ):
            assert df.loc[0, col] == 0


def test_slippage_uses_next_bar_vwap_minus_open():
    """slippage_bps = (next-bar VWAP - next-bar open) / next-bar open × 10000.

    With next-bar volume_usdt = 6_005_000 and volume_btc = 100 ->
    VWAP = 60_050; open = 60_100; slippage = (60050-60100)/60100 ≈ -8.32 bps."""
    md = pd.DataFrame(
        {
            "ts_ms": [0, 3_600_000],
            "open": [60_000.0, 60_100.0],
            "close": [60_050.0, 60_150.0],
            "volume_btc": [100.0, 100.0],
            "volume_usdt": [6_000_000.0, 6_005_000.0],
        }
    )
    actions = [_supply_action(0, 100_000_000, 10_000_000, 1_000_000)]
    df = compute_attribution(actions, md)
    # Slippage in this fixture is negative (next-bar VWAP < next-bar open).
    assert df.loc[0, "slippage_bps"] < 0


# --------------------------------------------------------------------- empty / edge cases


def test_empty_actions_returns_empty_df():
    md = pd.DataFrame({"ts_ms": [], "open": [], "close": [], "volume_btc": [], "volume_usdt": []})
    df = compute_attribution([], md)
    expected = set(PNL_COLUMNS) | {"total_bps"}
    assert expected.issubset(set(df.columns))
    assert len(df) == 0


def test_attribution_handles_missing_next_bar(synthetic_market_data):
    """If action is at the LAST bar, there is no next-bar VWAP — slippage = 0."""
    last_ts = int(synthetic_market_data["ts_ms"].iloc[-1])
    actions = [_supply_action(last_ts, 100_000_000, 10_000_000, 1_000_000)]
    df = compute_attribution(actions, synthetic_market_data)
    assert df.loc[0, "slippage_bps"] == 0


# --------------------------------------------------------------------- compute_risk_metrics


def test_compute_risk_metrics_returns_required_keys():
    pnl_series = pd.Series([0.001, -0.0005, 0.002, -0.0008, 0.0015])
    metrics = compute_risk_metrics(pnl_series)
    assert "sharpe" in metrics
    assert "sortino" in metrics
    assert "max_drawdown_bps" in metrics


def test_compute_risk_metrics_zero_returns_yields_zeros():
    metrics = compute_risk_metrics(pd.Series([0.0, 0.0, 0.0, 0.0]))
    assert metrics["sharpe"] == 0.0
    assert metrics["sortino"] == 0.0


def test_compute_risk_metrics_uses_8760_default():
    """OOS-only annualization default per D-10 — 8,760 bars/year."""
    pnl = pd.Series([0.001, 0.001, 0.001])
    # bars_per_year as positional / keyword toggle.
    m_default = compute_risk_metrics(pnl)
    m_explicit = compute_risk_metrics(pnl, bars_per_year=8_760)
    assert m_default["sharpe"] == m_explicit["sharpe"]


def test_compute_risk_metrics_rf_zero_default():
    """Risk-free = 0 by default per D-10."""
    pnl = pd.Series([0.001, 0.002, -0.001, 0.0005])
    m_default = compute_risk_metrics(pnl)
    m_explicit = compute_risk_metrics(pnl, rf=0.0)
    assert m_default["sharpe"] == m_explicit["sharpe"]
