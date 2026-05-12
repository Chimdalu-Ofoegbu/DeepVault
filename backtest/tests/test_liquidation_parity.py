"""Python <-> Move parity at the liquidation path (PTB-05 cross-language).

Mirrors contracts/tests/liquidation_test.move's
`worst_case_nav_at_minus_30_shock_drops_to_70pct` test. Asserts that
VaultState.worst_case_nav() produces the SAME integer value at the same
shocked state, within 1 wei tolerance.

Per CONTEXT.md D-20: supply 1000 DUSDC -> buy hedge at SVI fair value ->
simulate Predict resolution where binary expires worthless AND vault
collateral drops 30%. Assert worst_case_nav_per_share matches Python
within 1 wei.

Per planner critical constraint #7: 1-wei tolerance (1 wei) is the parity
gate, mirroring Plan 03-06's trace-replay tolerance and Phase 1's three-
runtime SVI parity bound.

The hardcoded integer values below MUST match line-for-line with
liquidation_test.move's inline assertions:
  - wcn_pre  == 9_009_900_990
  - wcn_post == 6_306_930_693
  - drain    == 273_000_000
  - post_balance == 637_000_000

If either runtime drifts (Move LTV math or Python VaultState.worst_case_nav),
both this test and the Move analog fail in tandem — the regression cannot
hide in a single runtime.

Source: contracts/tests/liquidation_test.move:172-225
Source: backtest/src/deepvault/vault_state.py (worst_case_nav method)
Source: contracts/sources/ltv.move:60-68 (worst_case_nav_per_share)
"""

from __future__ import annotations

import pytest

from deepvault.strategy_constants import NAV_SCALE
from deepvault.vault_state import VaultState

# ============================================================
# Constants — mirror liquidation_test.move's named constants line-for-line.
# ============================================================

# Per CONTEXT.md D-20: -30% NAV shock as basis points.
SHOCK_PCT_BPS: int = 3_000

# Liquid leg of the simulated 1000 DUSDC supply (matches
# liquidation_test.move::SUPPLY_LIQUID_LEG).
SUPPLY_LIQUID_LEG: int = 900_000_000  # 900 DUSDC at 6dp

# Shares minted on simulated supply (matches
# liquidation_test.move::SUPPLY_SHARES). 100M is chosen so the parity
# arithmetic stays readable; Test 1 in the Move test pins the resulting
# wcn values line-for-line, and this Python test reproduces them.
SUPPLY_SHARES: int = 100_000_000


# ============================================================
# Helpers — mirror liquidation_test.move::simulate_supply_1000_dusdc
# ============================================================


def _simulate_supply_1000_dusdc(vault: VaultState) -> None:
    """Mirror liquidation_test.move::simulate_supply_1000_dusdc.

    Bumps `balance` and `total_assets` by SUPPLY_LIQUID_LEG (mirrors
    vault::inflate_liquid_for_testing which joins a Coin into balance and
    also bumps total_assets). Bumps `total_shares` by SUPPLY_SHARES (mirrors
    vault::mint_shares_for_testing which mints SHARE coins via the
    TreasuryCap and increments total_shares_supply).

    Source: contracts/sources/vault.move:847-855 (inflate_liquid_for_testing)
    Source: contracts/sources/vault.move:815-822 (mint_shares_for_testing)
    """
    vault.balance += SUPPLY_LIQUID_LEG
    vault.total_assets += SUPPLY_LIQUID_LEG
    vault.total_shares += SUPPLY_SHARES


def _apply_balance_shock(vault: VaultState, shock_bps: int) -> int:
    """Drain shock_bps / 10000 of the current balance. Returns drain amount.

    Mirrors liquidation_test.move::apply_balance_shock. Specifically mirrors
    vault::drain_liquid_for_testing which reduces `balance` ONLY (NOT
    `total_assets`). The missing quote is conceptually held in a worthless-
    on-resolution hedge book entry — exactly the state ltv::worst_case_nav_per_share
    is designed to measure (balance only, per Phase 2 D-14).

    Source: contracts/sources/vault.move:862-869 (drain_liquid_for_testing)
    """
    pre_balance = vault.balance
    drain_amount = pre_balance * shock_bps // 10_000
    vault.balance -= drain_amount
    # Do NOT decrement total_assets — Move's drain_liquid_for_testing leaves
    # total_assets unchanged so worst_case_nav (balance-driven) drops while
    # nav_per_share (total_assets-driven) does NOT. This asymmetry is the
    # whole point of the worst-case haircut per Phase 2 D-14.
    return drain_amount


# ============================================================
# Test 1 — parity anchor: Python wcn at -30% shock matches Move EXACTLY.
# ============================================================


def test_worst_case_nav_at_minus_30_shock_drops_to_70pct():
    """Mirror liquidation_test.move::worst_case_nav_at_minus_30_shock_drops_to_70pct.

    The 1-wei tolerance assertion below is the BACK-04 cross-language
    parity gate at the liquidation path — extends Plan 03-06's trace-
    replay 1-wei tolerance discipline to the worst-case NAV calculation.
    """
    v = VaultState.new_seeded()
    _simulate_supply_1000_dusdc(v)

    # Pre-shock state assertions (mirror liquidation_test.move:202-204).
    assert v.balance == 910_000_000, (
        f"pre_balance must mirror Move test 1: got {v.balance}, expected 910_000_000"
    )
    assert v.total_shares == 101_000_000, (
        f"pre_shares must mirror Move test 1: got {v.total_shares}, expected 101_000_000"
    )

    wcn_pre = v.worst_case_nav()
    # 910_000_000 * 1e9 / 101_000_000 = 9_009_900_990 (truncate-toward-zero).
    # MUST match liquidation_test.move:208 assertion EXACTLY.
    assert wcn_pre == 9_009_900_990, (
        f"wcn_pre MUST equal Move test 1's locked value (1-wei parity): "
        f"got {wcn_pre}, expected 9_009_900_990"
    )

    # Apply -30% balance shock.
    drain_amount = _apply_balance_shock(v, SHOCK_PCT_BPS)
    assert drain_amount == 273_000_000, (
        f"drain_amount must mirror Move test 1: got {drain_amount}, expected 273_000_000"
    )
    assert v.balance == 637_000_000, (
        f"post_balance must mirror Move test 1: got {v.balance}, expected 637_000_000"
    )

    # Post-shock wcn.
    wcn_post = v.worst_case_nav()
    # 637_000_000 * 1e9 / 101_000_000 = 6_306_930_693 (truncate-toward-zero).
    # MUST match liquidation_test.move:213 assertion EXACTLY.
    assert wcn_post == 6_306_930_693, (
        f"wcn_post MUST equal Move test 1's locked value (1-wei parity): "
        f"got {wcn_post}, expected 6_306_930_693"
    )

    # Cross-check: post == 70% of pre within 1 wei (mirrors liquidation_test.move:216-225).
    expected_post = wcn_pre * 7_000 // 10_000
    assert expected_post == 6_306_930_693, f"expected_post arithmetic off: got {expected_post}"
    diff = abs(wcn_post - expected_post)
    # 1-wei tolerance per CONTEXT.md D-20 / Plan 03-06 parity discipline.
    assert diff <= 1, (
        f"-30% shock arithmetic off by more than 1 wei: "
        f"wcn_pre={wcn_pre}, wcn_post={wcn_post}, expected_post={expected_post}, "
        f"diff={diff}"
    )


# ============================================================
# Test 2 — hardcoded Move-matching values lock the parity contract.
# ============================================================


def test_python_worst_case_nav_matches_move_test_hardcoded_values():
    """Lock in the EXACT integer values the Move test asserts.

    These four numbers are the BACK-04 1-wei parity contract for the
    liquidation path. If liquidation_test.move's inline assertions and
    this Python test agree, both runtimes' LTV math is bit-equal at the
    -30% shocked state.

    Pre-shock state:
      balance       = SEED + SUPPLY_LIQUID_LEG = 10_000_000 + 900_000_000 = 910_000_000
      total_shares  = VIRTUAL + SUPPLY_SHARES  = 1_000_000  + 100_000_000 = 101_000_000
      worst_case_nav = 910_000_000 * 1e9 / 101_000_000 = 9_009_900_990 (truncated)

    Post-shock (drain 30% of balance):
      drain         = 910_000_000 * 3000 / 10000 = 273_000_000
      balance       = 910_000_000 - 273_000_000  = 637_000_000
      worst_case_nav = 637_000_000 * 1e9 / 101_000_000 = 6_306_930_693
    """
    v = VaultState.new_seeded()
    _simulate_supply_1000_dusdc(v)

    # Lock pre-state.
    assert v.balance == 910_000_000
    assert v.total_shares == 101_000_000
    wcn_pre = v.worst_case_nav()
    assert wcn_pre == (910_000_000 * NAV_SCALE) // 101_000_000
    assert wcn_pre == 9_009_900_990  # The Move-locked value.

    # Apply -30% balance shock.
    drain = v.balance * 3_000 // 10_000
    assert drain == 273_000_000
    v.balance -= drain
    assert v.balance == 637_000_000

    # Lock post-state.
    wcn_post = v.worst_case_nav()
    assert wcn_post == (637_000_000 * NAV_SCALE) // 101_000_000
    assert wcn_post == 6_306_930_693  # The Move-locked value.


# ============================================================
# Test 3 — defense-in-depth: wcn reads from balance, NOT total_assets.
# ============================================================


def test_worst_case_nav_uses_balance_not_total_assets_at_shocked_state():
    """Defense in depth at the liquidation path: even with high
    total_assets (representing hedge cost basis booked from the 10%
    deposit allocation), worst_case_nav reads ONLY from balance. This
    is the key insight of the LTV gate per Phase 2 D-14.

    Mirrors backtest/tests/test_vault_state.py::test_worst_case_nav_uses_balance_not_total_assets
    but at the SHOCKED state (replicates the property under stress).
    """
    v = VaultState.new_seeded()
    _simulate_supply_1000_dusdc(v)

    # Inflate total_assets to simulate post-hedge-mint state (the 10%
    # hedge cost basis that flowed to PredictManager but is still booked
    # in total_assets per vault::supply's `add_total_assets(deposit)` call).
    # SUPPLY_LIQUID_LEG was 900_000_000 (the 90% liquid leg); the hedge
    # leg of 100_000_000 would be the additional total_assets credit.
    v.total_assets += 100_000_000

    # worst_case_nav should use balance (910M), NOT total_assets (1010M+seed).
    wcn = v.worst_case_nav()
    nav = v.nav_per_share()
    assert wcn < nav, (
        f"worst_case_nav must be < current nav (post-hedge-mint): wcn={wcn}, nav={nav}"
    )
    assert wcn == (v.balance * NAV_SCALE) // v.total_shares, (
        "worst_case_nav formula must read from balance"
    )
    assert nav == (v.total_assets * NAV_SCALE) // v.total_shares, (
        "nav_per_share formula must read from total_assets"
    )

    # Apply -30% shock to balance only — mirrors Move's drain_liquid_for_testing
    # which does NOT decrement total_assets.
    drain = v.balance * SHOCK_PCT_BPS // 10_000
    v.balance -= drain

    wcn_post = v.worst_case_nav()
    nav_post = v.nav_per_share()

    # nav_per_share is UNCHANGED by the balance-only shock (total_assets
    # stays put per the drain_liquid_for_testing semantics).
    assert nav_post == nav, (
        f"nav_per_share must be unchanged by balance-only shock: pre={nav}, post={nav_post}"
    )
    # worst_case_nav drops because it reads from balance.
    assert wcn_post < wcn, (
        f"worst_case_nav must drop after balance shock: pre={wcn}, post={wcn_post}"
    )
    # The drop is proportional to the shock.
    expected_wcn_post = wcn * (10_000 - SHOCK_PCT_BPS) // 10_000
    # 1-wei tolerance — the same parity discipline as Test 1.
    assert abs(wcn_post - expected_wcn_post) <= 1, (
        f"worst_case_nav drop must equal shock pct within 1 wei: "
        f"wcn_post={wcn_post}, expected={expected_wcn_post}, "
        f"diff={abs(wcn_post - expected_wcn_post)}"
    )


# ============================================================
# Test 4 — edge case: worst_case_nav undefined when total_shares == 0.
# ============================================================


def test_worst_case_nav_zero_shares_raises_at_shocked_state():
    """Edge case: a vault with zero total_shares cannot compute
    worst_case_nav (division by zero). Mirrors ltv.move:62-63's
    `assert!(total_shares > 0, EZeroShares)` (error code 500).
    """
    v = VaultState()  # NOT seeded — total_shares == 0.
    with pytest.raises(ValueError, match="EZeroShares"):
        v.worst_case_nav()


# ============================================================
# Test 5 — Python and ltv.move match across multiple shock percentages.
# ============================================================


@pytest.mark.parametrize(
    "shock_bps,expected_remaining_balance",
    [
        (500, 864_500_000),  # -5%   -> 95% remaining of 910M
        (1_000, 819_000_000),  # -10%  -> 90% remaining
        (2_000, 728_000_000),  # -20%  -> 80% remaining
        (3_000, 637_000_000),  # -30%  -> 70% remaining (Move test 1 anchor)
        (5_000, 455_000_000),  # -50%  -> 50% remaining
        (6_000, 364_000_000),  # -60%  -> 40% remaining (Move test 2 compound shock)
        (9_000, 91_000_000),  # -90%  -> 10% remaining
    ],
)
def test_worst_case_nav_at_arbitrary_shock_matches_move_formula(
    shock_bps: int, expected_remaining_balance: int
) -> None:
    """Defense in depth: for any shock_bps, the Python worst_case_nav
    formula matches the Move formula bit-for-bit.

    formula: wcn_post = (balance * 1e9) // total_shares,
             where balance = pre_balance * (10_000 - shock_bps) // 10_000.

    This locks the parity contract beyond just the -30% case — any future
    drift in Move's ltv.move or Python's vault_state.worst_case_nav would
    surface here. 1-wei tolerance per the standing parity discipline.
    """
    v = VaultState.new_seeded()
    _simulate_supply_1000_dusdc(v)
    drain = v.balance * shock_bps // 10_000
    v.balance -= drain
    assert v.balance == expected_remaining_balance

    wcn_post = v.worst_case_nav()
    expected_wcn_post = (expected_remaining_balance * NAV_SCALE) // v.total_shares
    # 1-wei tolerance per Plan 03-06 parity discipline.
    assert abs(wcn_post - expected_wcn_post) <= 1, (
        f"shock={shock_bps}bps: wcn_post={wcn_post} vs expected={expected_wcn_post}, "
        f"diff={abs(wcn_post - expected_wcn_post)}"
    )
