# Phase 2: Vault Move Package + Testnet Deploy — Discussion Log

**Date:** 2026-05-09
**Mode:** /gsd-discuss-phase (default mode)
**For:** Human reference (audits, retrospectives). NOT consumed by downstream agents — they read CONTEXT.md.

## Gray Areas Presented

Phase domain: A deployed `deepvault::` Move package on Sui testnet supporting end-to-end supply→hedge→redeem.

The user was presented with 4 gray areas to choose from:
1. Withdrawal queue mechanics
2. Hedge purchase timing & rebalance trigger
3. AdminCap scope & pause semantics
4. Worst-case haircut formula (worst_case_haircut)

Plus a separate locking question for token-bucket parameters (couldn't reasonably defer to discretion since they end up in `strategy.toml`).

User chose all 4 areas to discuss. User chose **Conservative** for token-bucket (per-user 2 days pro-rata, refill = capacity / 86400 per second).

## Pre-Discussion Lock

**Token-bucket withdrawal limiter — Conservative (Recommended)**
- Options: Conservative / Permissive / Aggregate (not per-user) / Discuss
- Selected: Conservative
- Effect: Per-user capacity = 2 days pro-rata equal-share; refill = capacity / 86400 per second. Numbers go into `shared/strategy.toml [token_bucket]`.

## Area 1: Withdrawal Queue Mechanics

### Q1.1 — Cooldown between request and earliest fulfill
- Options: 0 (instant) / 1 hour fixed (Recommended) / Configurable in strategy.toml
- Selected: **1 hour fixed**
- → D-01

### Q1.2 — Order policy when multiple users have outstanding requests
- Options: Per-user independent (Recommended) / Global FIFO / Pro-rata when short
- Selected: **Per-user independent**
- → D-02

### Q1.3 — Vault is short of liquid quote — what happens at fulfill?
- Options: Pay only what's liquid (Recommended) / Auto-unwind hedge / Fail with EInsufficientLiquidity
- Selected: **Pay only what's liquid; rest stays queued**
- → D-03

### Q1.4 — Cancellation policy
- Options: Yes, free cancel (Recommended) / No / Yes but burn fee
- Selected: **Yes, free cancel via `redeem_cancel`**
- → D-04

## Area 2: Hedge Purchase Timing & Rebalance Trigger

### Q2.1 — Hedge purchase timing relative to supply
- Options: Atomic in same PTB (Recommended) / Deferred permissionless / Hybrid
- Selected: **Atomic in same PTB**
- → D-06 (single-PTB demo moment preserved)

### Q2.2 — `predict::mint` failure handling
- Options: Abort whole supply (Recommended) / Keep deposit + queue hedge / Configurable abstain threshold
- Selected: **Abort whole supply (atomic rollback)**
- → D-07

### Q2.3 — Roll trigger caller
- Options: Permissionless `roll_expiring` (Recommended) / AdminCap-gated / Solver/keeper pattern
- Selected: **Permissionless `vault::rebalance::roll_expiring`**
- → D-08 (solver/keeper reward deferred to v2)

### Q2.4 — How is hedge marked into NAV?
- Options: Theoretical SSVI binary price (Recommended) / Predict market price / Cost basis
- Selected: **Theoretical SSVI binary price** (uses Phase 1's `svi_view::binary_price`)
- → D-09

## Area 3: AdminCap Scope & Pause Semantics

### Q3.1 — What does `pause` halt?
- Options: Supply only (Recommended) / Supply + rebalance / Everything / Two-level pause
- Selected: **Supply only — redeems and rolls flow**
- → D-10

### Q3.2 — AdminCap powers (multi-select, beyond pause + oracle-stale override)
- Options: Tune strategy params / Force-unwind / Replace AdminCap holder / Withdraw fees
- Selected (initially): ALL FOUR
- → triggered conflict-resolution sub-questions

### Q3.2a — Replace AdminCap holder vs VAULT-08 (non-transferable v1)
- Options: Add `admin_transfer_cap` (override REQUIREMENTS.md) / Honor non-transferable per VAULT-08 (Recommended)
- Selected: **Honor VAULT-08 — drop `admin_transfer_cap`**
- → D-12 (key rotation = redeploy in v1)

### Q3.2b — Fee structure (PROJECT.md is silent)
- Options: No fees in v1 (Recommended) / 0.5%/yr management / 10% performance
- Selected: **No fees in v1 — drop `admin_withdraw_fees`**
- → D-13 (treasury / fee model is v2)

**Net AdminCap power list (D-11):**
1. `admin_pause(cap, vault, paused)`
2. `admin_oracle_staleness_override(cap, vault, max_seconds)`
3. `admin_tune_strategy(cap, vault, key, value)`
4. `admin_emergency_unwind(cap, vault, hedge_id)`

NOT included: `admin_transfer_cap` (D-12), `admin_withdraw_fees` (D-13).

## Area 4: Worst-Case Haircut Formula

### Q4.1 — Formula choice
- Options: Sum-of-payouts / NAV (Recommended) / Per-oracle worst then sum / Joint distribution
- Selected: **Sum-of-worst-payouts / total_shares** (vault BUYS hedges → worst case is hedges expire worthless → worst NAV = current liquid balance)
- → D-14

### Q4.2 — Output unit
- Options: u64 NAV per share at u128 fixed-point (Recommended) / u64 bps haircut / Tuple
- Selected: **u64 NAV per share at 10⁹ fixed-point** (matches Phase 1 D-14 / `svi_view::binary_price` scale)
- → D-15

### Q4.3 — Time-decay handling
- Options: Instantaneous worst (Recommended) / Expected worst given T_remaining / Pessimistic but expiry-decayed
- Selected: **Instantaneous worst (no time-decay discount)**
- → D-16

## Conflicts Captured

1. **REQUIREMENTS.md VAULT-08 vs user's initial multi-select** — User initially selected "Replace AdminCap holder" which conflicted with VAULT-08's "non-transferable in v1". Resolved by reaffirming VAULT-08 (D-12).
2. **PROJECT.md silence on fees vs user's initial multi-select** — User initially selected "Withdraw fees / treasury" but PROJECT.md has no fee model. Resolved by deferring fees to v2 (D-13).

## Deferred Ideas (Captured, Not in Phase 2)

- Solver/keeper reward for `roll_expiring`
- `admin_transfer_cap` for key rotation
- Fee structure (management or performance)
- Two-level pause (`pause_supply` + `pause_all`)
- Joint-distribution worst-case haircut
- Auto-unwind hedge during `redeem_fulfill`
- Multi-asset hedges (ETH, SOL)
- Live delta/gamma/vega panels
- Permissionless vault factory

## Claude's Discretion (Recorded for Downstream Agents)

These were chosen by Claude as builder, no user decision needed — see CONTEXT.md `<decisions>` § "Claude's Discretion":
- Module layout (vault/share/supply/redeem/rebalance/ltv/predict_adapter, ≤200 lines each)
- Hedge registry as `Table<ID, HedgePosition>` inside the shared Vault object
- Quote asset abstraction: `Vault<Quote>` generic; testnet = DUSDC, mainnet = USDsui
- Inflation defense seed: 10 DUSDC, shares burned to `@0xdead`
- Sui Prover spec scope: 3 properties (inflation_safe, nav_monotone_after_supply, capability_containment)
- Property test scope: round-down-in-vault-favor, deposit-then-redeem ≤ deposited, seed-once-only
- E2E CI script: bash + `sui client`, new `e2e-vault` job in `.github/workflows/ci.yml`
- Event surface: 10 events covering all state transitions
- Coin metadata: `dvUSDC` (testnet) / `dvUSDsui` (mainnet), 9 decimals
