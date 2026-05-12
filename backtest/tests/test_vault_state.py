"""VaultState unit tests — Python <-> Move parity at the state-machine level.

These tests are independent of trace replay (Plan 03-06); they assert that
each VaultState method produces the SAME integer output as the corresponding
Move function for the same input parameters.

Pure-Python integer math only — no numpy, no float (in the module under test).

Source: contracts/sources/{vault,supply,redeem,ltv}.move + helpers/rate_limiter.move
"""

from __future__ import annotations

import pytest

from deepvault.strategy_constants import (
    ALLOCATION_BPS,
    NAV_SCALE,
    SEED_QUOTE_MICRO_UNITS,
    TOKEN_BUCKET_CAPACITY,
    TOKEN_BUCKET_REFILL_RATE_PER_MS,
    VIRTUAL_SHARES,
)
from deepvault.vault_state import (
    HedgePosition,
    PyRateLimiter,
    RequestSlot,
    VaultState,
    VaultStateSnapshot,
)

# === Helpers ===


def _seeded_vault() -> VaultState:
    return VaultState.new_seeded()


# === new_seeded ===


def test_new_seeded_matches_create_vault_seed_state():
    v = _seeded_vault()
    assert v.balance == SEED_QUOTE_MICRO_UNITS
    assert v.total_assets == SEED_QUOTE_MICRO_UNITS
    assert v.total_shares == VIRTUAL_SHARES
    assert not v.paused
    assert v.hedges == {}
    assert v.hedge_keys == []
    assert v.request_slots == {}
    assert v.rate_limiters == {}


def test_snapshot_returns_immutable_tuple():
    v = _seeded_vault()
    snap = v.snapshot()
    assert isinstance(snap, VaultStateSnapshot)
    assert snap.balance == SEED_QUOTE_MICRO_UNITS
    assert snap.total_assets == SEED_QUOTE_MICRO_UNITS
    assert snap.total_shares == VIRTUAL_SHARES


# === compute_shares_to_mint parity ===


def test_compute_shares_to_mint_zero_deposit_returns_zero():
    v = _seeded_vault()
    assert v.compute_shares_to_mint(0) == 0


def test_compute_shares_to_mint_matches_move_formula():
    # Formula: numerator = deposit * (total_shares + VIRTUAL_SHARES)
    #         denominator = total_assets + 1
    v = _seeded_vault()
    deposit = 100_000_000  # 100 DUSDC
    expected = (deposit * (VIRTUAL_SHARES + VIRTUAL_SHARES)) // (SEED_QUOTE_MICRO_UNITS + 1)
    assert v.compute_shares_to_mint(deposit) == expected


def test_compute_shares_to_mint_50_randomized_cases_match_formula():
    """Bit-equal to supply.move:143-156 across 50 randomized inputs (seed=42)."""
    import random

    rng = random.Random(42)
    v = _seeded_vault()
    for _ in range(50):
        deposit = rng.randint(1, 10**12)
        ta_extra = rng.randint(0, 10**11)
        ts_extra = rng.randint(0, 10**11)
        v.total_assets = SEED_QUOTE_MICRO_UNITS + ta_extra
        v.total_shares = VIRTUAL_SHARES + ts_extra
        expected = (deposit * (v.total_shares + VIRTUAL_SHARES)) // (v.total_assets + 1)
        assert v.compute_shares_to_mint(deposit) == expected


# === supply ===


def test_supply_when_paused_raises():
    v = _seeded_vault()
    v.paused = True
    with pytest.raises(AssertionError, match="ESupplyPaused"):
        v.supply(100_000_000)


def test_supply_zero_amount_raises():
    v = _seeded_vault()
    with pytest.raises(AssertionError, match="EZeroAmount"):
        v.supply(0)


def test_supply_updates_state_correctly():
    v = _seeded_vault()
    deposit = 100_000_000
    pre_shares = v.total_shares
    shares = v.supply(deposit)
    assert shares > 0
    hedge_alloc = deposit * ALLOCATION_BPS // 10_000
    assert v.balance == SEED_QUOTE_MICRO_UNITS + deposit - hedge_alloc
    assert v.total_assets == SEED_QUOTE_MICRO_UNITS + deposit
    assert v.total_shares == pre_shares + shares


def test_supply_eventually_raises_zero_shares_minted_when_share_rounding_to_zero():
    """A 1-microunit deposit on a freshly seeded vault rounds to 0 shares -> abort."""
    v = _seeded_vault()
    with pytest.raises(AssertionError, match="EZeroSharesMinted"):
        v.supply(1)


# === nav_per_share + worst_case_nav ===


def test_nav_per_share_on_empty_vault_raises():
    v = VaultState()  # NOT seeded — zero shares
    with pytest.raises(ValueError, match="EZeroShares"):
        v.nav_per_share()


def test_nav_per_share_seeded_equals_expected_ratio():
    v = _seeded_vault()
    # balance=10M, total_assets=10M, total_shares=1M, NAV_SCALE=1e9
    # nav = 10M * 1e9 / 1M = 10_000_000_000
    assert v.nav_per_share() == (SEED_QUOTE_MICRO_UNITS * NAV_SCALE) // VIRTUAL_SHARES


def test_worst_case_nav_on_empty_vault_raises():
    v = VaultState()
    with pytest.raises(ValueError, match="EZeroShares"):
        v.worst_case_nav()


def test_worst_case_nav_uses_balance_not_total_assets():
    v = _seeded_vault()
    # Inflate total_assets without inflating balance (simulates hedge cost basis booked).
    v.total_assets += 5_000_000
    nav = v.nav_per_share()
    wcn = v.worst_case_nav()
    assert wcn < nav  # worst_case strictly less than current NAV


# === round-down-in-vault-favor (matches Move property test) ===


def test_supply_round_down_in_vault_favor():
    """For any deposit, shares * (total_assets + 1) <= deposit * (total_shares + VIRTUAL_SHARES).
    The vault never gives MORE shares than the exact ratio."""
    v = _seeded_vault()
    deposit = 12_345_678  # awkward number to provoke rounding
    pre_ta = v.total_assets
    pre_ts = v.total_shares
    shares = v.compute_shares_to_mint(deposit)
    assert shares * (pre_ta + 1) <= deposit * (pre_ts + VIRTUAL_SHARES)


def test_inflation_defense_smallest_deposit_produces_zero_shares():
    """Depositing 1 micro-unit on a freshly seeded vault produces 0 shares.

    numerator = 1 * (1M + 1M) = 2_000_000
    denominator = 10M + 1 = 10_000_001
    shares = 2_000_000 // 10_000_001 = 0
    """
    v = _seeded_vault()
    assert v.compute_shares_to_mint(1) == 0


# === redeem cycle ===


def test_redeem_request_creates_slot():
    v = _seeded_vault()
    user = "0xa1b2c3"
    v.total_shares += 1_000  # simulated user shares
    v.redeem_request(user, 500, ts_ms=1_000_000_000_000)
    slot = v.request_slots[user]
    assert isinstance(slot, RequestSlot)
    assert slot.shares_escrowed == 500
    assert slot.request_timestamp_ms == 1_000_000_000_000
    assert slot.claimed_so_far == 0


def test_redeem_request_zero_shares_raises():
    v = _seeded_vault()
    with pytest.raises(AssertionError, match="EZeroSharesRequested"):
        v.redeem_request("0xa1", 0, ts_ms=1)


def test_redeem_request_uniqueness():
    """Second redeem_request from the same user before fulfill/cancel aborts (D-02)."""
    v = _seeded_vault()
    v.total_shares += 1_000
    v.redeem_request("0xa1", 500, ts_ms=1_000_000_000_000)
    with pytest.raises(AssertionError, match="ERequestExists"):
        v.redeem_request("0xa1", 250, ts_ms=1_000_000_001_000)


def test_redeem_fulfill_before_cooldown_raises():
    v = _seeded_vault()
    user = "0xa1b2c3"
    v.total_shares += 1_000
    v.redeem_request(user, 500, ts_ms=1_000_000_000_000)
    with pytest.raises(AssertionError, match="ECooldownNotElapsed"):
        v.redeem_fulfill(user, ts_ms=1_000_000_000_000 + 1_800_000)


def test_redeem_fulfill_missing_request_raises():
    v = _seeded_vault()
    with pytest.raises(AssertionError, match="ERequestSlotMissing"):
        v.redeem_fulfill("nobody", ts_ms=10_000_000_000)


def test_redeem_cancel_returns_escrowed_shares():
    """D-04 — cancel returns the escrowed shares to the user (slot is destroyed)."""
    v = _seeded_vault()
    user = "0xcaf"
    v.total_shares += 750
    v.redeem_request(user, 600, ts_ms=10_000)
    assert user in v.request_slots
    returned = v.redeem_cancel(user)
    assert returned == 600
    assert user not in v.request_slots


def test_redeem_cancel_missing_raises():
    v = _seeded_vault()
    with pytest.raises(AssertionError, match="ERequestSlotMissing"):
        v.redeem_cancel("ghost")


def test_redeem_fulfill_happy_path_pays_pro_rata():
    """Seeded vault, single user with shares; after cooldown fulfill pays pro_rata payout."""
    v = _seeded_vault()
    user = "0xdead"
    # Mint shares via supply to keep accounting consistent.
    v.supply(100_000_000)  # 100 DUSDC supplied -> shares minted to "the user"
    # Move some of those shares into a request slot. We can simulate by reading
    # the latest total_shares delta and using that as the user's claim.
    user_shares = v.total_shares - VIRTUAL_SHARES  # everything beyond the seed
    v.redeem_request(user, user_shares, ts_ms=1_000_000_000_000)
    paid = v.redeem_fulfill(user, ts_ms=1_000_000_000_000 + 3_600_000)
    assert paid > 0
    # bucket should now exist for the user
    assert user in v.rate_limiters


def test_redeem_fulfill_partial_leaves_timestamp_untouched():
    """D-03 — when payout is throttled (bucket / liquidity), the slot remains
    escrowed and request_timestamp_ms is NOT bumped.
    """
    v = _seeded_vault()
    user = "0xpart"
    # Build a vault state where pro_rata >> bucket capacity to force partial payout.
    v.supply(1_000_000_000_000)  # 1M DUSDC -> huge share mint
    user_shares = v.total_shares - VIRTUAL_SHARES
    ts0 = 1_000_000_000_000
    v.redeem_request(user, user_shares, ts_ms=ts0)
    pre_ts = v.request_slots[user].request_timestamp_ms
    ts1 = ts0 + 3_600_000
    paid = v.redeem_fulfill(user, ts_ms=ts1)
    assert paid > 0
    # If a slot remains, timestamp must be unchanged (D-03 invariance).
    if user in v.request_slots:
        assert v.request_slots[user].request_timestamp_ms == pre_ts


def test_redeem_fulfill_bucket_refill():
    """W3 LOCK — per-user bucket refills with elapsed time per Move
    rate_limiter::refill semantics. Mirrors contracts/sources/helpers/rate_limiter.move:154-164.
    """
    v = _seeded_vault()
    user = "0xfeed"
    # Mint shares via supply so we have a redeemable position.
    v.supply(1_000_000_000_000)  # 1M DUSDC -> very large pro_rata vs bucket
    user_shares = v.total_shares - VIRTUAL_SHARES
    ts0 = 1_000_000_000_000
    # First redeem cycle.
    v.redeem_request(user, user_shares // 2, ts_ms=ts0)
    ts1 = ts0 + 3_600_000  # cooldown elapsed
    v.redeem_fulfill(user, ts_ms=ts1)
    bucket = v.rate_limiters[user]
    # After consume, bucket must be active and have been touched.
    assert bucket.enabled
    assert bucket.last_refill_ms == ts1
    assert bucket.available <= TOKEN_BUCKET_CAPACITY
    # Re-request if previous slot fully drained; ensure refill timestamp advances.
    if user not in v.request_slots:
        v.redeem_request(user, max(1, user_shares // 4), ts_ms=ts1 + 100)
    ts2 = ts1 + 3_600_000 + 100
    v.redeem_fulfill(user, ts_ms=ts2)
    assert v.rate_limiters[user].last_refill_ms == ts2  # refill() bumped the timestamp


# === PyRateLimiter direct tests ===


def test_py_rate_limiter_refill_caps_at_capacity():
    rl = PyRateLimiter(
        available=0,
        last_refill_ms=0,
        tokens_remaining=0,
        capacity=1_000,
        refill_rate_per_ms=10,
        enabled=True,
    )
    # 200ms elapsed -> 200 * 10 = 2000 tokens proposed, capped at capacity 1000.
    rl.refill(now_ms=200)
    assert rl.available == 1_000
    assert rl.last_refill_ms == 200
    assert rl.tokens_remaining == 1_000


def test_py_rate_limiter_available_withdrawal_readonly():
    rl = PyRateLimiter(
        available=500,
        last_refill_ms=100,
        tokens_remaining=500,
        capacity=1_000,
        refill_rate_per_ms=10,
        enabled=True,
    )
    pre = rl.available
    out = rl.available_withdrawal(now_ms=200)
    # 100ms elapsed * 10 = 1000 refill -> capped at 1000
    assert out == 1_000
    # mutation MUST NOT happen on read-only view
    assert rl.available == pre


def test_py_rate_limiter_consume_drains_available():
    rl = PyRateLimiter(
        available=900,
        last_refill_ms=100,
        tokens_remaining=900,
        capacity=1_000,
        refill_rate_per_ms=10,
        enabled=True,
    )
    # consume() refills first, then decrements.
    rl.consume(amount=400, now_ms=110)
    # After refill at t=110: available = min(900 + 10*10, 1000) = 1000, then -400 = 600.
    assert rl.available == 600
    assert rl.tokens_remaining == 600


def test_py_rate_limiter_disabled_returns_u64_max_sentinel():
    rl = PyRateLimiter(capacity=1_000, refill_rate_per_ms=10)
    # default enabled=False
    assert rl.available_withdrawal(now_ms=999_999) == (1 << 64) - 1


def test_py_rate_limiter_consume_zero_is_noop():
    rl = PyRateLimiter(
        available=10,
        last_refill_ms=0,
        tokens_remaining=10,
        capacity=100,
        refill_rate_per_ms=1,
        enabled=True,
    )
    rl.consume(amount=0, now_ms=10)
    # zero is a noop — bucket should not even be refilled.
    assert rl.available == 10


def test_py_rate_limiter_consume_exceeds_capacity_aborts():
    rl = PyRateLimiter(
        available=50,
        last_refill_ms=0,
        tokens_remaining=50,
        capacity=100,
        refill_rate_per_ms=1,
        enabled=True,
    )
    with pytest.raises(AssertionError, match="EExceedsCapacity"):
        rl.consume(amount=200, now_ms=0)


def test_py_rate_limiter_consume_insufficient_aborts():
    rl = PyRateLimiter(
        available=10,
        last_refill_ms=10,
        tokens_remaining=10,
        capacity=100,
        refill_rate_per_ms=1,
        enabled=True,
    )
    # At t=10, no elapsed since last_refill_ms, so available stays at 10.
    with pytest.raises(AssertionError, match="EInsufficientWithdrawalBudget"):
        rl.consume(amount=20, now_ms=10)


# === HedgePosition dataclass ===


def test_hedge_position_constructs_with_expected_fields():
    h = HedgePosition(
        oracle_id="0xoracle",
        strike=85_000_000_000,
        expiry_ms=2_000_000_000_000,
        notional_quote=10_000_000,
        cost_basis_quote=10_000_000,
        quantity=5_000_000,
    )
    assert h.oracle_id == "0xoracle"
    assert h.cost_basis_quote == 10_000_000


# === replay invariant ===


def test_replay_consumes_supply_action_and_asserts_state():
    """Per CONTEXT.md D-15 / Phase 1 parity discipline — 1-wei tolerance."""
    v = _seeded_vault()
    deposit = 100_000_000
    expected_shares = v.compute_shares_to_mint(deposit)
    hedge_alloc = deposit * ALLOCATION_BPS // 10_000
    action = {
        "kind": "supply",
        "tx_digest": "0xfake",
        "ts_ms": 0,
        "args": {"deposit_quote": str(deposit)},  # u64 as string per WAVE0-DECISION Q5
        "pre": {
            "balance": str(SEED_QUOTE_MICRO_UNITS),
            "total_assets": str(SEED_QUOTE_MICRO_UNITS),
            "total_shares": str(VIRTUAL_SHARES),
        },
        "post": {
            "balance": str(SEED_QUOTE_MICRO_UNITS + deposit - hedge_alloc),
            "total_assets": str(SEED_QUOTE_MICRO_UNITS + deposit),
            "total_shares": str(VIRTUAL_SHARES + expected_shares),
        },
    }
    v.replay(action)
    assert v.total_shares == VIRTUAL_SHARES + expected_shares


def test_replay_pre_state_mismatch_raises():
    v = _seeded_vault()
    action = {
        "kind": "supply",
        "tx_digest": "0xfake",
        "ts_ms": 0,
        "args": {"deposit_quote": "100000000"},
        "pre": {
            "balance": "999999999",  # wrong
            "total_assets": str(SEED_QUOTE_MICRO_UNITS),
            "total_shares": str(VIRTUAL_SHARES),
        },
        "post": {"balance": "0", "total_assets": "0", "total_shares": "0"},
    }
    with pytest.raises(AssertionError, match="pre balance drift"):
        v.replay(action)


def test_replay_unknown_action_kind_raises():
    v = _seeded_vault()
    action = {
        "kind": "mystery",
        "ts_ms": 0,
        "args": {},
        "pre": {
            "balance": str(SEED_QUOTE_MICRO_UNITS),
            "total_assets": str(SEED_QUOTE_MICRO_UNITS),
            "total_shares": str(VIRTUAL_SHARES),
        },
        "post": {
            "balance": str(SEED_QUOTE_MICRO_UNITS),
            "total_assets": str(SEED_QUOTE_MICRO_UNITS),
            "total_shares": str(VIRTUAL_SHARES),
        },
    }
    with pytest.raises(ValueError, match="Unknown action kind"):
        v.replay(action)


def test_redeem_fulfill_burn_consistent_with_payout():
    """If payable > 0, total_shares decreases by exactly the burned share amount
    and total_assets decreases by exactly the quote paid out."""
    v = _seeded_vault()
    user = "0xb1"
    v.supply(500_000_000)
    user_shares = v.total_shares - VIRTUAL_SHARES
    v.redeem_request(user, user_shares, ts_ms=1_000_000_000_000)
    pre_ts = v.total_shares
    pre_ta = v.total_assets
    pre_bal = v.balance
    paid = v.redeem_fulfill(user, ts_ms=1_000_000_000_000 + 3_600_000)
    assert paid > 0
    assert pre_bal - v.balance == paid
    assert pre_ta - v.total_assets == paid
    # Shares burned must be > 0
    assert pre_ts - v.total_shares > 0


# Use TOKEN_BUCKET_REFILL_RATE_PER_MS to silence unused-import; ensures the
# import path is exercised so the audit grep over imports stays accurate.
_ = TOKEN_BUCKET_REFILL_RATE_PER_MS
