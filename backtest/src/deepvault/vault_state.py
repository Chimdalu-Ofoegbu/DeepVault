"""VaultState — Python mirror of deepvault::vault semantics.

Mirrors on-chain Move semantics bit-for-bit:
  - vault::create_vault seed transaction (10 DUSDC + 1M virtual shares burned)
  - supply::supply (supply.move:61-117)
  - supply::compute_shares_to_mint (supply.move:143-156)
  - redeem::redeem_request + redeem_fulfill + redeem_cancel (redeem.move:71-220)
  - ltv::nav_per_share (ltv.move:41-49)
  - ltv::worst_case_nav_per_share (ltv.move:60-68)
  - Per-user token bucket (helpers/rate_limiter.move:37-164)

Source: contracts/sources/vault.move
Source: contracts/sources/supply.move
Source: contracts/sources/redeem.move
Source: contracts/sources/ltv.move
Source: contracts/sources/helpers/rate_limiter.move

All NAV / share outputs at NAV_SCALE = 1e9 (matches Phase 1 FLOAT_SCALING).

Forbidden imports: math, numpy, scipy. Pure Python int (arbitrary precision
trivially satisfies the Move u128 intermediates needed by compute_shares_to_mint).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, NamedTuple

from .strategy_constants import (
    ALLOCATION_BPS,
    NAV_SCALE,
    SEED_QUOTE_MICRO_UNITS,
    TOKEN_BUCKET_CAPACITY,
    TOKEN_BUCKET_REFILL_RATE_PER_MS,
    VIRTUAL_SHARES,
)

# D-01 cooldown — 1 hour between redeem_request and redeem_fulfill.
# Source: contracts/sources/redeem.move:40 (`const COOLDOWN_MS: u64 = 3_600_000`).
REDEEM_COOLDOWN_MS: int = 3_600_000


# ============================================================
# HedgePosition — mirrors deepvault::vault::HedgePosition.
# Source: contracts/sources/vault.move:60-67.
# ============================================================


@dataclass
class HedgePosition:
    """Open-hedge registry entry.

    Mirror of `vault::HedgePosition` (vault.move:60-67). Keyed in
    VaultState.hedges by MarketKey JSON-string (the Python analog of Move's
    `MarketKey` struct).
    """

    oracle_id: str
    strike: int
    expiry_ms: int
    notional_quote: int
    cost_basis_quote: int
    quantity: int


# ============================================================
# RequestSlot — mirrors deepvault::vault::RequestSlot (W2 LOCK).
# Source: contracts/sources/vault.move:73-81.
# `shares_escrowed: Balance<SHARE>` in Move; Python mirror uses int holding
# the SHARE u64 value (the Balance is just an integer wrapper on-chain).
# ============================================================


@dataclass
class RequestSlot:
    """Per-user redeem request slot.

    W2 LOCK: `shares_escrowed` is the value of the escrowed Balance<SHARE> in
    SHARE u64 units. Mirror of vault.move:73-81.
    """

    shares_escrowed: int
    request_timestamp_ms: int
    claimed_so_far: int = 0


# ============================================================
# PyRateLimiter — mirrors deepvault::rate_limiter::RateLimiter (W3 LOCK).
# Source: contracts/sources/helpers/rate_limiter.move:37-48.
# Bit-equal time-decay token bucket: refills at `refill_rate_per_ms` tokens
# per ms of `elapsed_ms`, capped at `capacity`.
# ============================================================


@dataclass
class PyRateLimiter:
    """Mirrors deepvault::rate_limiter::RateLimiter (W3 LOCK).

    Bit-equal token bucket with time-decay refill semantics. Fields and method
    signatures are direct ports of helpers/rate_limiter.move.

    Source: contracts/sources/helpers/rate_limiter.move
    """

    available: int = 0
    # `last_refill_ms` mirrors Move's `last_updated_ms` (rate_limiter.move:41).
    last_refill_ms: int = 0
    # `tokens_remaining` is an alias of `available` kept as a stable grep target
    # for the W3 acceptance gate (`grep -E 'last_refill_ms|tokens_remaining'`).
    # Always kept in sync with `available` after refill/consume.
    tokens_remaining: int = 0
    capacity: int = 0
    refill_rate_per_ms: int = 0
    enabled: bool = False

    def refill(self, now_ms: int) -> None:
        """Refills the bucket based on elapsed time, capped at capacity.

        Mirrors rate_limiter::refill (rate_limiter.move:154-164).
        """
        # Guard mirroring elapsed_ms() (rate_limiter.move:167-174):
        # if current_time <= last_updated_ms, elapsed_ms returns 0.
        if now_ms <= self.last_refill_ms:
            return
        elapsed_ms = now_ms - self.last_refill_ms
        if elapsed_ms > 0:
            refill_amount = elapsed_ms * self.refill_rate_per_ms
            new_available = min(self.available + refill_amount, self.capacity)
            self.available = new_available
            self.tokens_remaining = new_available
            self.last_refill_ms = now_ms

    def available_withdrawal(self, now_ms: int) -> int:
        """Returns the currently available withdrawal amount (read-only).

        Mirrors rate_limiter::available_withdrawal (rate_limiter.move:69-80).
        Does NOT mutate the bucket.
        """
        if not self.enabled:
            # Move returns std::u64::max_value!() when disabled
            # (rate_limiter.move:70). Use the same sentinel so callers using
            # min(...) keep parity with on-chain semantics.
            return (1 << 64) - 1
        if now_ms <= self.last_refill_ms:
            return self.available
        elapsed_ms = now_ms - self.last_refill_ms
        refill_amount = elapsed_ms * self.refill_rate_per_ms
        return min(self.available + refill_amount, self.capacity)

    def consume(self, amount: int, now_ms: int) -> None:
        """Attempt to consume `amount` from the bucket. Aborts if rate-limited.

        Mirrors rate_limiter::consume (rate_limiter.move:97-106).
        """
        if not self.enabled or amount == 0:
            return
        self.refill(now_ms)
        # Match Move's abort codes (EExceedsCapacity = 0,
        # EInsufficientWithdrawalBudget = 1).
        assert amount <= self.capacity, "EExceedsCapacity (0)"
        assert amount <= self.available, "EInsufficientWithdrawalBudget (1)"
        self.available -= amount
        self.tokens_remaining = self.available


# ============================================================
# VaultStateSnapshot — frozen tuple consumed by Plan 03-06 trace replay.
# ============================================================


class VaultStateSnapshot(NamedTuple):
    """Frozen snapshot of (balance, total_assets, total_shares).

    Used by replay parity (Plan 03-06) for cheap before/after comparisons
    without copying the full VaultState dataclass.
    """

    balance: int
    total_assets: int
    total_shares: int


# ============================================================
# VaultState — Python mirror of Move `Vault<Quote>` (W1 LOCK 18-field schema).
# Source: contracts/sources/vault.move:91-136.
# ============================================================


@dataclass
class VaultState:
    """Python mirror of the on-chain Vault<Quote> state.

    Bit-equal to Move semantics for supply, redeem, nav, worst_case_nav.
    Consumed by trace-replay parity (Plan 03-06).

    W1 LOCK: field names match Move (`request_slots`, `rate_limiters`).
    W2 LOCK: `RequestSlot.shares_escrowed` mirrors Balance<SHARE> via int.
    W3 LOCK: `rate_limiters` holds per-user `PyRateLimiter` instances.
    """

    # Admin & lifecycle
    admin: str = "0x0"
    paused: bool = False

    # Liquid quote and SHARE escrow.
    balance: int = 0
    escrow_balance: int = 0

    # W1 LOCKED per-user mappings (NAMES MUST NOT CHANGE).
    request_slots: Dict[str, RequestSlot] = field(default_factory=dict)
    rate_limiters: Dict[str, PyRateLimiter] = field(default_factory=dict)

    # Open-hedge registry (keyed by MarketKey string).
    hedges: Dict[str, HedgePosition] = field(default_factory=dict)
    hedge_keys: List[str] = field(default_factory=list)

    # NAV math caches (mirror Move's total_shares_supply / total_assets).
    total_shares: int = 0
    total_assets: int = 0

    # Six tunable runtime parameters (D-11.3 admin_tune_strategy targets).
    tunable_token_bucket_capacity: int = TOKEN_BUCKET_CAPACITY
    tunable_token_bucket_refill_rate_per_ms: int = TOKEN_BUCKET_REFILL_RATE_PER_MS
    tunable_hedge_alloc_bps: int = ALLOCATION_BPS
    tunable_hedge_strike_otm_bps: int = 0
    tunable_hedge_tenor_seconds: int = 0
    tunable_oracle_max_staleness_seconds: int = 0

    # Backtest-only proxy for the PredictManager's quote balance (hedge cost
    # basis flows here at supply time; cost basis is recorded against the
    # hedge registry by rebalance::insert_or_consolidate_hedge in Move).
    _mock_predict_manager_balance: int = 0

    # ============================================================
    # Constructors
    # ============================================================

    @classmethod
    def new_seeded(cls) -> "VaultState":
        """Mirrors vault::create_vault — 10 DUSDC seed + 1M virtual shares burned.

        Source: contracts/sources/vault.move:259-323.
        """
        v = cls()
        v.balance = SEED_QUOTE_MICRO_UNITS
        v.total_assets = SEED_QUOTE_MICRO_UNITS
        v.total_shares = VIRTUAL_SHARES
        return v

    def snapshot(self) -> VaultStateSnapshot:
        return VaultStateSnapshot(self.balance, self.total_assets, self.total_shares)

    # ============================================================
    # Supply
    # ============================================================

    def compute_shares_to_mint(self, deposit: int) -> int:
        """Virtual-shares math (OpenZeppelin ERC-4626 v5).

        Bit-equal to supply::compute_shares_to_mint (supply.move:148-156).
        Truncate-toward-zero division rounds DOWN, in vault's favor.
        Python `//` matches Move u128 `/` for non-negative integers.
        """
        numerator = deposit * (self.total_shares + VIRTUAL_SHARES)
        denominator = self.total_assets + 1
        return numerator // denominator

    def supply(self, deposit_quote: int) -> int:
        """Mirrors supply::supply (supply.move:61-117). Returns shares minted.

        Aborts:
          - ESupplyPaused if vault.paused (D-10).
          - EZeroAmount if deposit_quote == 0.
          - EZeroSharesMinted if rounded shares == 0.
        """
        assert not self.paused, "ESupplyPaused (200)"
        assert deposit_quote > 0, "EZeroAmount (203)"
        shares = self.compute_shares_to_mint(deposit_quote)
        assert shares > 0, "EZeroSharesMinted (201)"

        # Hedge allocation flows to the (mock) PredictManager — the rest stays
        # in vault.balance. NOTE: total_assets is updated with the FULL deposit
        # (the vault tracks both legs); hedge cost basis is recorded against
        # the registry by rebalance.move in Move semantics.
        hedge_alloc_bps = (
            self.tunable_hedge_alloc_bps if self.tunable_hedge_alloc_bps > 0 else ALLOCATION_BPS
        )
        hedge_alloc = deposit_quote * hedge_alloc_bps // 10_000
        self._mock_predict_manager_balance += hedge_alloc
        self.balance += deposit_quote - hedge_alloc
        self.total_assets += deposit_quote
        self.total_shares += shares
        return shares

    # ============================================================
    # NAV math
    # ============================================================

    def nav_per_share(self) -> int:
        """NAV per share at 1e9 fixed-point.

        Bit-equal to ltv::nav_per_share (ltv.move:41-49).
        """
        if self.total_shares == 0:
            raise ValueError("EZeroShares (500)")
        return (self.total_assets * NAV_SCALE) // self.total_shares

    def worst_case_nav(self) -> int:
        """Pessimistic NAV: assumes all open hedges expire worthless.

        Bit-equal to ltv::worst_case_nav_per_share (ltv.move:60-68).
        Uses `balance` (liquid quote only), NOT `total_assets`. D-09: no
        SVI math on this path — keeps blast radius zero for the Margin
        liquidation path.
        """
        if self.total_shares == 0:
            raise ValueError("EZeroShares (500)")
        return (self.balance * NAV_SCALE) // self.total_shares

    # ============================================================
    # Redeem
    # ============================================================

    def redeem_request(self, user: str, shares: int, ts_ms: int) -> None:
        """Mirrors redeem::redeem_request (redeem.move:71-96).

        Aborts:
          - EZeroSharesRequested if shares == 0.
          - ERequestExists if user already has an outstanding slot (D-02).
        """
        assert shares > 0, "EZeroSharesRequested (304)"
        assert user not in self.request_slots, "ERequestExists (300)"
        self.request_slots[user] = RequestSlot(
            shares_escrowed=shares,
            request_timestamp_ms=ts_ms,
            claimed_so_far=0,
        )

    def _get_or_init_user_bucket(self, user: str, now_ms: int) -> PyRateLimiter:
        """Lazy-init the per-user PyRateLimiter on first redeem_fulfill call.

        Mirrors redeem::get_or_init_user_bucket (redeem.move:236-261).
        Bucket starts FULL (record_deposit(capacity)) so first-time users are
        not gated by a 24-hour refill window — D-05's capacity is a BURST cap,
        not a starting handicap.
        """
        if user not in self.rate_limiters:
            cap = (
                self.tunable_token_bucket_capacity
                if self.tunable_token_bucket_capacity > 0
                else TOKEN_BUCKET_CAPACITY
            )
            rate = (
                self.tunable_token_bucket_refill_rate_per_ms
                if self.tunable_token_bucket_refill_rate_per_ms > 0
                else TOKEN_BUCKET_REFILL_RATE_PER_MS
            )
            bucket = PyRateLimiter(
                available=cap,  # seeded full per redeem.move:252-257
                last_refill_ms=now_ms,
                tokens_remaining=cap,
                capacity=cap,
                refill_rate_per_ms=rate,
                enabled=True,
            )
            self.rate_limiters[user] = bucket
        return self.rate_limiters[user]

    def redeem_fulfill(self, user: str, ts_ms: int) -> int:
        """Mirrors redeem::redeem_fulfill (redeem.move:104-197).

        Returns the quote micro-units paid out. Partial fulfill (when
        pro_rata > bucket or pro_rata > liquid) leaves remainder shares
        escrowed and timestamp UNTOUCHED so the user can re-fulfill once
        liquidity returns without resetting the cooldown (D-03 LOCK).
        """
        assert user in self.request_slots, "ERequestSlotMissing (301)"
        slot = self.request_slots[user]
        elapsed = ts_ms - slot.request_timestamp_ms
        assert elapsed >= REDEEM_COOLDOWN_MS, "ECooldownNotElapsed (302)"
        assert slot.shares_escrowed > 0, "EZeroSharesRequested (304)"

        # Pro-rata payout using nav_per_share at 1e9 fixed-point.
        nav = self.nav_per_share()
        pro_rata_value = (slot.shares_escrowed * nav) // NAV_SCALE

        # W3 LOCK — consume from the PER-USER time-decay bucket (NOT the
        # static TOKEN_BUCKET_CAPACITY constant). Plan 03-06 trace replay
        # depends on this: any captured testnet trace with a second redeem
        # by the same user reflects time-decay refill, so a stateless
        # capacity check would diverge by exactly the refill amount.
        bucket = self._get_or_init_user_bucket(user, ts_ms)
        bucket_avail = bucket.available_withdrawal(ts_ms)

        payable = min(pro_rata_value, self.balance, bucket_avail)
        assert payable > 0, "EInsufficientLiquidity (303)"

        # Ceiling division on shares burned favors the vault (Pitfall 12) —
        # mirrors math::mul_div_round_up in redeem.move:149-153.
        # shares_consumed = ceil(payable * NAV_SCALE / nav).
        shares_consumed = (payable * NAV_SCALE + nav - 1) // nav

        # Consume from the bucket (mutates state).
        bucket.consume(payable, ts_ms)

        # Burn the corresponding share amount; update vault accounting.
        slot.shares_escrowed -= shares_consumed
        slot.claimed_so_far += payable
        self.balance -= payable
        self.total_assets -= payable
        self.total_shares -= shares_consumed

        if slot.shares_escrowed == 0:
            del self.request_slots[user]
        # D-03 LOCK (redeem.move:186-188): if remainder > 0, the slot's
        # `request_timestamp_ms` is INTENTIONALLY left untouched so the
        # cooldown remains satisfied for subsequent redeem_fulfill calls.

        return payable

    def redeem_cancel(self, user: str) -> int:
        """Mirrors redeem::redeem_cancel (redeem.move:201-220).

        Returns the escrowed shares to the user and removes the slot.
        D-04: cancel is always allowed (before or after cooldown).
        """
        assert user in self.request_slots, "ERequestSlotMissing (301)"
        slot = self.request_slots.pop(user)
        return slot.shares_escrowed

    # ============================================================
    # Trace replay (Plan 03-06 entry point)
    # ============================================================

    def replay(self, action: dict) -> None:
        """Consumes one action; asserts pre-state; applies; asserts post.

        Loop invariant per RESEARCH.md Pitfall 2: the FIRST action's pre must
        match self.new_seeded() exactly; SUBSEQUENT actions' pre must be the
        post of the prior action as computed by THIS VaultState instance. We
        never read pre from the trace to overwrite self.

        Tolerance: 1-wei per CONTEXT.md D-15 / Phase 1 parity discipline.
        """
        pre = {k: int(v) for k, v in action["pre"].items()}
        assert self.balance == pre["balance"], (
            f"pre balance drift: {self.balance} != {pre['balance']}"
        )
        assert self.total_assets == pre["total_assets"], (
            f"pre total_assets drift: {self.total_assets} != {pre['total_assets']}"
        )
        assert self.total_shares == pre["total_shares"], (
            f"pre total_shares drift: {self.total_shares} != {pre['total_shares']}"
        )

        kind = action["kind"]
        if kind == "supply":
            self.supply(int(action["args"]["deposit_quote"]))
        elif kind == "redeem_request":
            self.redeem_request(
                action["args"]["user"],
                int(action["args"]["shares"]),
                int(action["ts_ms"]),
            )
        elif kind == "redeem_fulfill":
            self.redeem_fulfill(action["args"]["user"], int(action["ts_ms"]))
        elif kind == "redeem_cancel":
            self.redeem_cancel(action["args"]["user"])
        elif kind == "hedge_mint":
            self._apply_hedge_mint(action)
        elif kind == "roll":
            self._apply_roll(action)
        else:
            raise ValueError(f"Unknown action kind: {kind!r}")

        post = action["post"]
        assert abs(self.balance - int(post["balance"])) <= 1, (
            f"post balance mismatch: {self.balance} vs {post['balance']}"
        )
        assert abs(self.total_assets - int(post["total_assets"])) <= 1, (
            f"post total_assets mismatch: {self.total_assets} vs {post['total_assets']}"
        )
        assert abs(self.total_shares - int(post["total_shares"])) <= 1, (
            f"post total_shares mismatch: {self.total_shares} vs {post['total_shares']}"
        )

    def _apply_hedge_mint(self, action: dict) -> None:
        """Mirrors rebalance::buy_hedge_for_deposit (rebalance.move:219+).

        Wave 2 stub: only updates the mock predict-manager balance. Full
        HedgePosition registry mutation lands in Plan 03-06 trace replay
        once cycle-full.json carries the emitted HedgeMinted event payload.
        """
        cost = int(action["args"].get("cost_basis_quote", 0))
        self._mock_predict_manager_balance += cost

    def _apply_roll(self, action: dict) -> None:
        """Mirrors rebalance::roll_expiring (rebalance.move per Phase 2 D-08).

        Wave 2 stub: applies the net (payoff - new_cost) to balance and
        total_assets so post-state assertions can flow. Full registry
        mutation lands in Plan 03-06.
        """
        payoff = int(action["args"].get("payoff_quote", 0))
        new_cost = int(action["args"].get("new_cost_basis_quote", 0))
        delta = payoff - new_cost
        self.balance += delta
        self.total_assets += delta
