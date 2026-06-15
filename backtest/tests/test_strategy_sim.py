"""Strategy-simulation tests (Plan 03-10).

Covers the PLP + rolling-hedge economic model in
``deepvault.strategy_sim.simulate_strategy``:
  - NAV actually MOVES (the bug Plan 03-10 fixes: previously flat-zero).
  - Attribution is additive: total_return == plp_yield − plp_lvr − hedge_cost
    + hedge_payoff (to float tolerance).
  - Lookahead safety: a decision's realized-vol estimate uses only bars
    observable at the cycle-open decision time; a future crash cannot change a
    past decision.
  - A known-input crash case fires the hedge and the payoff equals the notional.
  - Binary put pricing is monotone and lands in a sane OTM range.
  - The warm-up guard prevents the degenerate zero-vol first cycle from sizing
    an absurd notional.
  - The input frame is consumed READ-ONLY.
"""

from __future__ import annotations

import math

import numpy as np
import pandas as pd
import pytest

from deepvault.strategy_sim import (
    PLP_APY,
    binary_put_price,
    simulate_strategy,
    unhedged_max_drawdown_bps,
)

_HOUR_MS = 3_600_000
_AVAIL_LAG = 3_600_001  # ts_ms + 1h + 1ms (matches data_ingest D-05)


def _frame(close: np.ndarray, start_ts: int = 1_700_000_000_000) -> pd.DataFrame:
    n = len(close)
    ts = np.arange(n, dtype=np.int64) * _HOUR_MS + start_ts
    return pd.DataFrame(
        {
            "ts_ms": ts,
            "available_at": ts + _AVAIL_LAG,
            "open": close,
            "high": close * 1.001,
            "low": close * 0.999,
            "close": close.astype(float),
            "volume_btc": np.full(n, 100.0),
            "volume_usdt": np.full(n, 6_000_000.0),
        }
    )


def _gbm_close(n: int, seed: int, sigma_hourly: float = 0.01, s0: float = 60_000.0) -> np.ndarray:
    rng = np.random.default_rng(seed)
    lr = rng.normal(0.0, sigma_hourly, n)
    return s0 * np.exp(np.cumsum(lr))


# --------------------------------------------------------------------- NAV moves


def test_nav_starts_at_one_and_moves():
    """NAV begins at 1.0 and is NOT a flat line (the Plan 03-10 fix)."""
    data = _frame(_gbm_close(60 * 24, seed=1))
    res = simulate_strategy(data, hedge_ratio=0.10)
    nav = res["per_bar_nav"]
    assert len(nav) == len(data)
    assert abs(nav.iloc[0] - 1.0) < 0.05  # first bar near 1.0 (one bar of accrual)
    # The series must actually vary — a flat NAV is the bug we are fixing.
    assert float(nav.max() - nav.min()) > 1e-6
    assert res["total_return"] != 0.0


def test_plp_only_accrues_positive_with_zero_hedge_and_flat_price():
    """With hedge_ratio≈0 and a flat price (no LVR, no hedge), NAV grows by the
    PLP yield only — a monotone increase."""
    n = 30 * 24
    flat = np.full(n, 60_000.0)
    data = _frame(flat)
    res = simulate_strategy(data, hedge_ratio=0.0, plp_apy=PLP_APY)
    nav = res["per_bar_nav"].to_numpy()
    # Strictly non-decreasing (yield only, flat price => no LVR drag).
    assert np.all(np.diff(nav) >= -1e-15)
    # ~30 days of 8% APY ≈ 0.08 * 30/365 ≈ 0.66%.
    expected = (1.0 + PLP_APY) ** (n / (24 * 365)) - 1.0
    assert res["total_return"] == pytest.approx(expected, rel=1e-6)


# --------------------------------------------------------------------- attribution identity


def test_attribution_sums_to_total_return():
    """total_return == plp_yield − plp_lvr − hedge_cost + hedge_payoff."""
    for seed in (1, 7, 42, 100):
        data = _frame(_gbm_close(180 * 24, seed=seed))
        res = simulate_strategy(data, hedge_ratio=0.10)
        att = res["attribution"]
        recon = (
            att["plp_yield"] - att["plp_lvr"] - att["hedge_cost"] + att["hedge_payoff"]
        )
        assert recon == pytest.approx(res["total_return"], abs=1e-9)
        assert att["total_return"] == pytest.approx(res["total_return"], abs=1e-9)


def test_attribution_components_have_expected_signs():
    data = _frame(_gbm_close(180 * 24, seed=3))
    att = simulate_strategy(data, hedge_ratio=0.10)["attribution"]
    assert att["plp_yield"] >= 0.0  # gross yield is positive
    assert att["plp_lvr"] >= 0.0  # drag magnitude (subtracted)
    assert att["hedge_cost"] >= 0.0  # premium spend (subtracted)
    assert att["hedge_payoff"] >= 0.0  # payoff (added)


# --------------------------------------------------------------------- known-input payoff


def test_hedge_payoff_fires_on_known_crash():
    """Construct a path that is calm for the first cycle (so vol is estimable),
    then crashes >15% during the SECOND cycle's life → that hedge must pay off,
    and the payoff equals the cycle's notional."""
    bars_per_cycle = 14 * 24
    # Cycle 0: calm warm-up wiggle (gives a non-degenerate vol estimate).
    calm = _gbm_close(bars_per_cycle, seed=5, sigma_hourly=0.01)
    # Cycle 1 opens at index bars_per_cycle and EXPIRES at 2*bars_per_cycle; the
    # crash must complete by that expiry bar (a hedge only settles when its
    # expiry index is strictly inside the frame, so we need a third cycle's
    # worth of trailing bars after the crash for the settlement bar to exist).
    s_open = calm[-1]
    crash = np.linspace(s_open, s_open * 0.80, bars_per_cycle)  # -20% over the cycle
    tail = np.full(bars_per_cycle, s_open * 0.80)  # stays crashed past expiry
    close = np.concatenate([calm, crash, tail])
    data = _frame(close)
    res = simulate_strategy(data, hedge_ratio=0.10)
    cyc = res["attribution"]["cycles"]
    assert res["n_payoffs"] >= 1
    # The cycle whose strike was breached has payoff == notional.
    paid = cyc[cyc["payoff"] > 0.0]
    assert len(paid) >= 1
    row = paid.iloc[0]
    assert row["payoff"] == pytest.approx(row["notional"], rel=1e-9)
    # And the spot at expiry was indeed below the strike.
    assert row["spot_at_expiry"] < row["strike"]


def test_no_payoff_when_price_never_breaches_strike():
    """A gently RISING price never breaches a -15% strike → zero payoffs."""
    n = 120 * 24
    rising = np.linspace(60_000.0, 66_000.0, n)  # +10%, monotone
    data = _frame(rising)
    res = simulate_strategy(data, hedge_ratio=0.10)
    assert res["n_payoffs"] == 0
    assert res["attribution"]["hedge_payoff"] == 0.0


# --------------------------------------------------------------------- lookahead safety


def test_future_crash_does_not_change_past_decision():
    """The realized-vol estimate (hence strike/premium/notional) at each cycle
    open must be invariant to data that lands AFTER that cycle opens.

    We simulate a base path, then mutate ONLY bars strictly after the second
    cycle's open and assert every cycle row at or before that open is
    bit-identical (sigma, premium, notional)."""
    bars_per_cycle = 14 * 24
    base = _gbm_close(90 * 24, seed=11, sigma_hourly=0.012)
    data_a = _frame(base.copy())
    res_a = simulate_strategy(data_a, hedge_ratio=0.10)

    second_open = bars_per_cycle  # index where cycle 1 opens
    mutated = base.copy()
    # Slam everything strictly AFTER the second cycle's open to a deep crash.
    mutated[second_open + 1 :] *= 0.5
    data_b = _frame(mutated)
    res_b = simulate_strategy(data_b, hedge_ratio=0.10)

    cyc_a = res_a["attribution"]["cycles"]
    cyc_b = res_b["attribution"]["cycles"]
    # Cycles whose OPEN index <= second_open must be identical in their decision
    # inputs/outputs (vol, premium, notional, strike) — they cannot see the
    # future mutation.
    for col in ("sigma_ann", "premium", "notional", "strike", "binary_price"):
        a = cyc_a[cyc_a["open_idx"] <= second_open][col].to_numpy()
        b = cyc_b[cyc_b["open_idx"] <= second_open][col].to_numpy()
        np.testing.assert_allclose(a, b, rtol=0, atol=0, err_msg=f"{col} leaked future data")


def test_input_frame_is_not_mutated():
    """simulate_strategy must treat market_data as READ-ONLY (OOS-purity)."""
    data = _frame(_gbm_close(60 * 24, seed=9))
    before = data.copy(deep=True)
    _ = simulate_strategy(data, hedge_ratio=0.10)
    pd.testing.assert_frame_equal(before, data)


# --------------------------------------------------------------------- warm-up guard


def test_first_cycle_warmup_skip_no_absurd_notional():
    """The first cycle (no trailing history) must NOT size a notional from a
    floored binary price — it is skipped (warmup), so notional == 0."""
    data = _frame(_gbm_close(60 * 24, seed=2))
    cyc = simulate_strategy(data, hedge_ratio=0.10)["attribution"]["cycles"]
    first = cyc.iloc[0]
    assert bool(first["warmup_skip"]) is True
    assert first["notional"] == 0.0
    assert first["premium"] == 0.0
    # No priced cycle should carry a wildly leveraged notional (coverage cap).
    priced = cyc[~cyc["warmup_skip"]]
    if len(priced) > 0:
        # notional is bounded by coverage = hedge_ratio * NAV (~0.10) plus the
        # budget/p escape; a sane ceiling well under 1.0 for hedge_ratio=0.10.
        assert priced["notional"].max() < 1.0


# --------------------------------------------------------------------- binary pricing


def test_binary_put_price_in_sane_range_and_monotone_in_vol():
    s0 = 60_000.0
    # Higher vol => higher probability of breaching a -15% strike.
    p_low = binary_put_price(s0, 0.15, 0.30, 14)
    p_mid = binary_put_price(s0, 0.15, 0.50, 14)
    p_high = binary_put_price(s0, 0.15, 0.80, 14)
    assert 0.0 < p_low < p_mid < p_high < 0.5
    # At a believable BTC vol the -15%/14d digital sits in a low-single-digit
    # to ~10% range (sanity gate from the objective).
    assert 0.001 < binary_put_price(s0, 0.15, 0.40, 14) < 0.20


def test_binary_put_price_guards_degenerate_inputs():
    # Zero vol / zero tenor / nonpositive spot return the floor, not NaN/inf.
    assert binary_put_price(60_000.0, 0.15, 0.0, 14) > 0.0
    assert binary_put_price(60_000.0, 0.15, 0.4, 0) > 0.0
    assert binary_put_price(0.0, 0.15, 0.4, 14) > 0.0
    assert math.isfinite(binary_put_price(60_000.0, 0.15, 0.4, 14))


# --------------------------------------------------------------------- unhedged baseline


def test_unhedged_max_drawdown_matches_manual():
    # Peak 100 -> trough 60 -> recover: max DD = -40%.
    close = np.array([100.0, 100.0, 80.0, 60.0, 70.0, 90.0])
    data = _frame(close)
    dd = unhedged_max_drawdown_bps(data)
    assert dd == pytest.approx(int((60 - 100) / 100 * 10_000), abs=1)


def test_hedge_reduces_drawdown_versus_unhedged_on_crash():
    """Over a crashing path the hedged equity must draw down LESS than spot."""
    bars_per_cycle = 14 * 24
    calm = _gbm_close(bars_per_cycle, seed=8, sigma_hourly=0.01)
    crash = np.linspace(calm[-1], calm[-1] * 0.75, bars_per_cycle)
    data = _frame(np.concatenate([calm, crash]))
    res = simulate_strategy(data, hedge_ratio=0.10)
    eq = res["equity_curve"].to_numpy()
    rm = np.maximum.accumulate(eq)
    hedged_dd_bps = int(float(((eq - rm) / rm).min()) * 10_000)
    unhedged_dd_bps = unhedged_max_drawdown_bps(data)
    assert hedged_dd_bps > unhedged_dd_bps  # less negative == shallower drawdown


# --------------------------------------------------------------------- empty / degenerate


def test_empty_frame_returns_zeroed_result():
    empty = _frame(np.array([], dtype=float))
    res = simulate_strategy(empty, hedge_ratio=0.10)
    assert res["total_return"] == 0.0
    assert res["n_cycles"] == 0
    assert len(res["per_bar_nav"]) == 0
