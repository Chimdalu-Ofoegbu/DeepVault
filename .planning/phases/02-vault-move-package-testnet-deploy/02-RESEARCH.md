# Phase 2: Vault Move Package + Testnet Deploy - Research

**Researched:** 2026-05-09
**Domain:** Sui Move 2024 vault package — virtual-shares ERC-4626-style supply/redeem, capability quarantine, atomic predict::mint composition, permissionless roll, token-bucket withdrawal queue, Sui Prover spec, testnet deploy + E2E CI
**Confidence:** HIGH on cloned-from-vendored patterns; MEDIUM on Sui Prover spec runtime budget; LOW on a few oracle-config + currency-creation deploy details (verified-locally items below).

## Summary

This phase ports an institutional-grade ERC-4626-style vault to Move 2024 on Sui, composes it atomically with DeepBook Predict's binary mint, and ships a testnet deploy + E2E CI cycle. CONTEXT.md locks 16 design decisions covering withdrawal queue mechanics, hedge timing, AdminCap scope, worst-case haircut formula, module layout, hedge registry storage, quote-asset abstraction, seed amount, Sui Prover scope, property test scope, and event surface. The planner's job is no longer "what to build" but "how to make these locked decisions Move-2024-idiomatic without re-litigating them."

Two cross-cutting findings materially change implementation tactics — neither contradicts CONTEXT.md but both must drive the plan:

1. **Predict's `predict::mint` is gated by `oracle_config::assert_live_oracle`, which enforces a 30-second on-chain staleness threshold** (`constants::staleness_threshold_ms!() = 30_000`) — strictly tighter than vault's `[oracle].max_staleness_seconds = 300`. Atomic supply→hedge will revert with `EOracleStale` (Predict abort) before the vault's own staleness check kicks in. Vault's `max_staleness_seconds=300` is functionally a *display* parameter for the dashboard, never a gating parameter at mint time. AdminCap's `admin_oracle_staleness_override` (D-11.2) cannot relax Predict's hard 30s ceiling. This must be documented in the abort-code mapping and the whitepaper.

2. **The vendored Predict source includes a working, audited `rate_limiter.move` implementing exactly the token-bucket pattern CONTEXT.md D-05 specifies.** The vault's per-user `RateLimiter` (D-02 + D-05) should be cloned line-for-line from `scripts/deepbookv3/packages/predict/sources/helper/rate_limiter.move` with one signature change (per-user keyed via `Table<address, RateLimiter>`). Saves a day of from-scratch implementation and removes a class of clock-arithmetic bugs (Pitfall 13 in PITFALLS.md).

**Primary recommendation:** Plan ships in 6-8 plans clustered around four waves — (1) shared-object skeleton + share/coin OTW + AdminCap, (2) supply with virtual-shares + seed + atomic predict::mint, (3) redeem queue + token-bucket + cancel, (4) rebalance::roll_expiring + ltv::worst_case_haircut + Sui Prover spec, with the E2E testnet cycle and CI job as the closing plan. Sui Prover spec lands in its own plan (separate CI job, runs nightly only).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Vault state custody (Coin balance, hedge book, params) | API/Backend (Move shared object) | — | Settlement layer; only canonical source per ARCHITECTURE.md §6 trust boundaries |
| Vault share token issuance/burn | API/Backend (Move TreasuryCap quarantined in shared Vault) | — | TreasuryCap escape = catastrophic mint authority leak (Pitfall 9); never crosses module boundary |
| Atomic supply+hedge composition | API/Backend (single Move entry function calling internal predict_adapter) | Browser (PTB constructor as future-proofing only) | Atomic rollback only achievable via single Move entry; PTB-level composition introduces non-atomic intermediate states |
| Per-user redemption request slot | API/Backend (Move `Table<address, RequestSlot>`) | — | On-chain only; cooldown semantics must be tamper-proof |
| Per-user token-bucket limiter | API/Backend (Move `Table<address, RateLimiter>`) | — | Read-only off-chain via dashboard query; clock-arithmetic must be on-chain |
| Permissionless `roll_expiring` | API/Backend (Move public entry, anyone calls) | — | Caller pays gas; rebalancer trust = permissionless |
| Worst-case haircut for Margin LTV | API/Backend (Move pure view function) | Database/Storage (cached in dashboard) | Read-only; consumed by future Margin liquidator and dashboard |
| Pause authority | API/Backend (Move AdminCap, single key) | — | Single-actor escape hatch; non-transferable bound |
| E2E testnet cycle script | CI/CD (GitHub Actions on Bash + `sui client`) | — | Verifies the package against the testnet's currently-deployed Predict; weekly Monday churn detection |
| Sui Prover spec | CI/CD (`sui-prover` invocation) | — | Compile-time-style guarantee; runs nightly to bound runtime budget |

## Standard Stack

### Core (already pinned by Phase 0; verify before plan opens)

| Library | Version | Purpose | Why Standard | Source |
|---------|---------|---------|--------------|--------|
| Sui CLI | `mainnet-v1.71.1` | Move toolchain, build/test/publish, local validator | Pinned in `.github/workflows/ci.yml` lines 39-49; mainnet-v1.71.1 == testnet-v1.71.1 protocol version 123 | [VERIFIED: ci.yml] |
| Move Edition | `2024.beta` | Smart contract language | Pinned in `contracts/Move.toml:8`; required by current sui-framework | [VERIFIED: Move.toml] |
| sui-framework | matches network | stdlib (Coin, Balance, Clock, event, Table, dynamic_field) | Comes from network protocol version; pinned via `rev = "framework/mainnet"` | [VERIFIED: Move.toml:12] |
| DeepBookV3 (vendored Move dep) | SHA `1159d79af33c70e09e406310e1d8f067832ede9d` | `deepbook_predict::predict`, `oracle::OracleSVI`, `predict_manager::PredictManager`, `market_key::MarketKey` | Pinned in `contracts/Move.toml:17`; same SHA as Phase 1 — no Monday-sweep delta required for Phase 2 to open | [VERIFIED: Move.toml:17] |
| `@mysten/sui` | `2.16.2` | TS PTB construction in E2E script | Latest stable; supersedes 2.16.0 in Phase 0 STACK.md (point release) | [VERIFIED: npm view 2026-05-09] |
| `@mysten/dapp-kit` | `1.0.6` | Reserved for Phase 4 (not consumed in Phase 2 directly) | Out-of-scope for vault package; flag for Phase 4 plan | [VERIFIED: npm view 2026-05-09] |
| `@mysten/deepbook-v3` | `1.3.6` | Reserved for Phase 3 (Margin SDK); referenced by Phase 2 only for E2E script's BalanceManager setup | Major version bump (0.17 → 1.3.6) from STACK.md captured 2026-05-08 — flag for plan-checker; verify ABI compat before E2E uses it | [VERIFIED: npm view 2026-05-09] |

**npm version drift since STACK.md (2026-05-08):** `@mysten/sui` 2.16.0 → 2.16.2 (point release, low risk); `@mysten/dapp-kit` 1.0.4 → 1.0.6 (point release); `@mysten/deepbook-v3` 0.17.0 → 1.3.6 (**major bump — must verify Margin SDK ABI compat in Phase 3 plan, irrelevant to Phase 2 unless E2E script imports it for BalanceManager creation**). [VERIFIED: npm registry queries 2026-05-09]

### Phase-2-specific (new vendored Move helpers from Predict)

| Module to clone | Source path (vendored) | Purpose | Adapter file |
|-----------------|------------------------|---------|--------------|
| `helper/rate_limiter.move` | `scripts/deepbookv3/packages/predict/sources/helper/rate_limiter.move` | Token-bucket withdrawal limiter (per-user) | Clone into `contracts/sources/helpers/rate_limiter.move`; Phase 2 wraps in `Table<address, RateLimiter>` storage [VERIFIED: file read] |
| `predict::mint<Quote>` ABI | `scripts/deepbookv3/packages/predict/sources/predict.move:219-266` | Binary hedge purchase | Wrapped in `vault::predict_adapter` thin wrapper per VAULT-07 [VERIFIED: file read] |
| `predict::redeem<Quote>` ABI | `scripts/deepbookv3/packages/predict/sources/predict.move:285-297` | Close-out for `roll_expiring` | Same adapter [VERIFIED: file read] |
| `oracle::OracleSVI`, `oracle::svi()`, `oracle::svi_*()`, `oracle::forward_price()`, `oracle::timestamp()`, `oracle::expiry()`, `oracle::is_settled()` | `oracle.move:235-282` | SVI parameter reads + staleness inspection | Used by `vault::rebalance::buy_hedge_for_deposit` to feed `svi_view::binary_price` [VERIFIED: file read] |
| `oracle_config::assert_live_oracle` | `oracle_config.move:200-209` | 30s on-chain staleness gate | Cannot be relaxed by AdminCap; vault inherits this constraint [VERIFIED: file read] |
| `predict_manager::PredictManager` | `predict_manager.move:31-41` | Holds vault's hedge positions + balance for Predict | Vault stores `manager_id: ID` and passes the shared object by reference at every `predict::mint` call [VERIFIED: file read] |
| `market_key::MarketKey` (`up`, `down`, `new`) | `market_key/market_key.move:30-43` | Identifies binary position by (oracle_id, expiry, strike, direction) | `vault::rebalance` constructs DOWN binary at `strike = forward * (10000 - 1500) / 10000` [VERIFIED: file read] |

**Why these are clones, not custom**: Pitfall 6 (Predict contract churn) demands a thin-adapter pattern. Cloning rate_limiter and reusing oracle/predict accessors directly means Phase 2 inherits Predict's bug fixes via SHA bump, not a manual rewrite. [CITED: PITFALLS.md §"Pitfall 6"]

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Move 2024 entry function for atomic supply+hedge | Client-side TS PTB chaining `tx.moveCall` twice | **Reject:** PTBs are atomic but each `moveCall` is a separate Move-runtime invocation; `predict::mint` failure inside the second moveCall reverts ALL preceding effects (PTB atomicity). Either approach satisfies D-07. **HOWEVER**, Move-internal call captures the demo's "single-PTB composability" claim more cleanly because the user signs ONE `tx.moveCall(::vault::supply)` not TWO. **Pick: Move-internal entry function** for the user-facing path; PTB-builder pattern reserved for Phase 4 dashboard if a power-user wants to chain supply with another protocol. [ASSUMED] |
| `coin_registry::new_currency_with_otw` for VAULT_SHARE | `coin::create_currency` (legacy) | **Use new pattern:** Predict's own `plp.move:12-25` uses `coin_registry::new_currency_with_otw`; the vendored deepbookv3 `move.md` rule explicitly flags `coin::create_currency` as deprecated. Vault must mirror Predict's idiom for symmetry. [VERIFIED: plp.move + deepbookv3/.claude/rules/move.md] |
| `Table<address, RequestSlot>` per-user request slot | `Table<address, vector<RequestSlot>>` (multiple outstanding requests per user) | **Reject:** D-02 says one outstanding request per user; multiple requests add UX complexity (which slot does `redeem_fulfill` drain?) without clear product win. Single slot per user is industry standard for queued-redemption vaults. [CITED: CONTEXT.md D-02] |
| `dynamic_field` for hedge registry | `Table<ID, HedgePosition>` | **Reject per CONTEXT.md "Claude's Discretion" → "Hedge registry storage"**: Table avoids dynamic-field overhead, keeps `nav` reads cheap. [CITED: CONTEXT.md] |
| `vector<HedgePosition>` for hedge registry | `Table<ID, HedgePosition>` + parallel `vector<ID>` index | **Use Table + parallel vector**: Pure vector forces O(n) lookup for `roll_expiring` and `admin_emergency_unwind`. Sui community pattern (per Sui Move Intro Course "Heterogeneous Collections") for iteration over a Table is to maintain a parallel `vector<ID>` of keys. Cost: one extra `vector::push_back` per `predict::mint`, one extra `vector::remove` per redeem. Gas cost is negligible at v1's hedge-count scale (≤ ~50 open hedges target per CONTEXT.md `[hedge_policy]`). [VERIFIED: Sui Move Intro Course] |

**Installation (no new packages — all vendored):**
```bash
# No npm/uv changes needed for Phase 2 vault module proper.
# E2E script in scripts/e2e-vault-cycle.sh uses the existing
# @mysten/sui pin from dashboard/ workspace plus sui CLI directly.
```

**Version verification:** All Move dep SHAs already pinned in `contracts/Move.toml`. The npm pins above are flagged for Phase 2's E2E plan only — verify before that plan ships.

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          USER WALLET (Sui)                                  │
│    holds: Coin<DUSDC>, Coin<VAULT_SHARE> (= dvUSDC), maybe AdminCap         │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │ signs PTB
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    ENTRY: vault::supply (atomic single tx)                  │
│  inputs: &mut Vault<DUSDC>, Coin<DUSDC>, &mut PredictManager,               │
│          &mut Predict, &OracleSVI, &Clock, ctx                              │
│                                                                             │
│  flow:                                                                      │
│  1. assert !vault.paused                              [VAULT-08 D-10]       │
│  2. read svi_view::binary_price(oracle, strike) → fair_value                │
│  3. compute shares_to_mint via virtual-shares math    [VAULT-03]            │
│  4. call vault::rebalance::buy_hedge_for_deposit(...) [VAULT-05 D-06,D-07]  │
│      └─ predict_adapter::mint(predict_manager,                              │
│            oracle, market_key::down(oracle_id, expiry, strike), qty, clock) │
│         └─ Predict ABORTS if oracle stale (>30s) → entire supply REVERTS    │
│  5. record HedgePosition in Table<ID, HedgePosition> + parallel vector<ID>  │
│  6. mint Coin<VAULT_SHARE> via quarantined TreasuryCap                      │
│  7. emit Supplied + HedgeMinted events                                      │
└──────────┬──────────────────────────────────────┬───────────────────────────┘
           │                                      │
           ▼                                      ▼
┌────────────────────────┐         ┌──────────────────────────────────┐
│  REDEEM PATH (2-step)  │         │  ROLL PATH (permissionless)      │
│                        │         │                                  │
│  redeem_request:       │         │  rebalance::roll_expiring:       │
│  - escrow shares       │         │  - iterate hedge_ids: vector<ID> │
│  - record timestamp    │         │  - for each whose                │
│  - per-user RequestSlot│         │    expiry_ms - now_ms < 2d:      │
│                        │         │    predict::redeem(hedge)        │
│  redeem_fulfill (≥1h): │         │    predict::mint(new 14d hedge)  │
│  - rate_limiter consume│         │  - caller pays gas               │
│  - pay min(NAV, liquid,│         │  - emits HedgeRolled event       │
│    bucket)             │         │                                  │
│  - leftover stays in   │         │  Tested via clock.increment_     │
│    queue (D-03)        │         │  for_testing past expiry         │
└────────────────────────┘         └──────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      VIEW: vault::ltv::worst_case_haircut                   │
│  Formula (D-14): worst_NAV_per_share = liquid_balance / total_shares        │
│  (Pessimistic: assumes ALL open hedges expire worthless)                    │
│  Output: u64 NAV per share at 1e9 fixed-point (D-15)                        │
│  Consumers: future Margin liquidator (Phase 3+) + dashboard (Phase 4)       │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

```
contracts/sources/
├── vault.move                  # shared Vault<Quote>, AdminCap, lifecycle, paused flag
├── share.move                  # VAULT_SHARE OTW + coin_registry::new_currency_with_otw
├── supply.move                 # vault::supply entry + virtual-shares math
├── redeem.move                 # request/fulfill/cancel + per-user Table<address, RequestSlot>
├── rebalance.move              # buy_hedge_for_deposit + roll_expiring + hedge registry CRUD
├── ltv.move                    # nav + worst_case_haircut (pure view)
├── predict_adapter.move        # thin wrapper around predict::mint/redeem (single-file blast radius for Pitfall 6)
├── helpers/
│   ├── rate_limiter.move       # CLONED from vendored Predict helper/rate_limiter.move
│   ├── i64.move                # Phase 1 (already exists)
│   ├── isqrt.move              # Phase 1 (already exists)
│   ├── ln.move                 # Phase 1 (already exists)
│   ├── math.move               # Phase 1 (already exists)
│   └── phi.move                # Phase 1 (already exists)
├── phi_coefficients.move       # Phase 1 codegen output (already exists)
├── strategy_constants.move     # Phase 0 codegen output (already exists; Phase 2 may extend)
└── svi_view.move               # Phase 1 evaluator (already exists)

contracts/specs/                # NEW — Sui Prover specs (VAULT-10)
├── inflation_safe.move         # spec on vault::supply
├── nav_monotone.move           # spec on supply (post-state NAV >= pre-state NAV)
└── capability_containment.move # spec on TreasuryCap and AdminCap

contracts/tests/
├── vault_test.move
├── supply_test.move
├── redeem_test.move
├── rebalance_test.move
├── ltv_test.move
├── predict_adapter_test.move
└── e2e_test.move               # in-Move multi-step flow (NOT the bash CI script)

scripts/
├── e2e-vault-cycle.sh          # NEW — bash + sui client, drives testnet wallet through full cycle
└── (existing scripts)

.github/workflows/
├── ci.yml                      # ADD `e2e-vault` job (6th)
└── nightly-prover.yml          # NEW — nightly sui-prover run (separate from ci.yml)
```

### Pattern 1: TreasuryCap Quarantine via OTW + `coin_registry::new_currency_with_otw`

**What:** Vault share is a standard Sui `Coin<VAULT_SHARE>`. Issuance authority (`TreasuryCap<VAULT_SHARE>`) is CREATED inside the package's `init` function (driven by the OTW), then immediately moved into the shared `Vault<Quote>` struct as a private field. The TreasuryCap is never returned by reference outside the `vault` module — only `supply::deposit` and `redeem::redeem_fulfill` (within the same package) borrow it `&mut` to mint and burn.

**When to use:** Any vault token whose issuance must be invariant-gated (only `supply` can mint, only `redeem` can burn).

**Reference implementation:** Predict's own PLP token at `scripts/deepbookv3/packages/predict/sources/vault/plp.move:6-30`. Note that Predict transfers TreasuryCap to the deployer in `plp.move` and only LATER moves it into the shared `Predict` object via `predict::create<Quote>` at `predict.move:507-534`. **For DeepVault, plan a slightly different pattern:** keep TreasuryCap in `init`'s scope, defer the share-OTW to a separate `share.move` module, and have `vault::create_vault` consume both the TreasuryCap AND the deployer's seed Coin atomically — never let TreasuryCap touch the deployer's wallet.

**Code sketch (extends pattern from `plp.move:12-25`):**
```move
module deepvault::share;

use sui::coin_registry;

/// One-time witness for VAULT_SHARE. Phantom — never instantiated outside init.
public struct SHARE has drop {}

fun init(witness: SHARE, ctx: &mut TxContext) {
    let (mut currency, treasury_cap) = coin_registry::new_currency_with_otw(
        witness,
        9,                                // share_decimals = 9 (Phase 0 D-13)
        b"dvUSDC".to_string(),            // testnet symbol per CONTEXT.md "Coin metadata"
        b"DeepVault dvUSDC".to_string(),
        b"Vault share for DeepVault PLP+Hedge".to_string(),
        b"".to_string(),                  // icon URL deferred to Phase 5
        ctx,
    );
    let metadata_cap = currency.finalize(ctx);
    transfer::public_transfer(metadata_cap, ctx.sender());
    // CRITICAL: TreasuryCap goes to a "pre-shared" PendingTreasury object that
    // ONLY vault::create_vault can consume. NEVER transfer to ctx.sender().
    transfer::public_transfer(
        PendingTreasury { id: object::new(ctx), cap: treasury_cap },
        ctx.sender(),
    );
}

public struct PendingTreasury has key, store { id: UID, cap: TreasuryCap<SHARE> }
```

Then in `vault::create_vault`:
```move
public entry fun create_vault<Quote>(
    pending: PendingTreasury,
    seed: Coin<Quote>,             // 10_000_000 quote micro-units (10 DUSDC)
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let PendingTreasury { id, cap } = pending;
    object::delete(id);
    assert!(seed.value() == strategy_constants::seed_quote_micro_units(), ESeedAmountMismatch);

    let mut vault = Vault<Quote> {
        id: object::new(ctx),
        treasury_cap: cap,             // QUARANTINED — never leaves Vault
        // ... other fields ...
    };

    // Mint seed shares = decimals_offset = 10^6 (per CONTEXT.md "Inflation defense seed")
    let seed_shares = coin::mint(&mut vault.treasury_cap, 10u64.pow(6), ctx);
    // Burn-equivalent: transfer to dead address @0xdead. Sui has no native burn-without-cap.
    transfer::public_transfer(seed_shares, @0xdead);

    // Lock seed assets into vault state
    vault.balance.join(seed.into_balance());
    vault.total_assets = strategy_constants::seed_quote_micro_units();
    vault.total_shares = 10u64.pow(6);

    transfer::share_object(vault);
    transfer::transfer(AdminCap { id: object::new(ctx) }, ctx.sender());
}
```

The `PendingTreasury` wrapper makes the TreasuryCap untransferable (no `store` ability on `PendingTreasury` if we want to lock it tighter — but `key, store` are needed for `transfer::public_transfer` from `init`). Plan should evaluate this tradeoff: if `PendingTreasury` has `store`, deployer COULD transfer it elsewhere before calling `create_vault`. **Mitigation:** name and document; treat as a deploy-discipline matter not a security one (only the deployer holds it for a single block between `init` and `create_vault`). [ASSUMED — verify pattern with sui-framework docs]

### Pattern 2: Virtual-Shares Inflation Defense — Move u128 Arithmetic

**What:** Adapt OpenZeppelin ERC-4626 v5 inflation defense to Move. The formula CONTEXT.md "Inflation defense seed amount" specifies `decimals_offset = 10⁶` and 10 DUSDC seed combine to make a $10M attack break-even.

**The math (u128 intermediates required to avoid overflow):**

```
shares_out = (deposit_quote * (total_shares + 10^decimals_offset)) / (total_assets + 1)
```

Becomes in Move:

```move
public(package) fun shares_to_mint(
    vault: &Vault<Quote>,
    deposit_quote: u64,
): u64 {
    // Use u128 for the multiplication; result still fits u64 because
    // deposit ≤ vault size in practice ≤ 10^15 micro-units (~$10^9 vault),
    // total_shares + offset ≤ 10^15 (vault shares at 9-dec scale),
    // product ≤ 10^30 (fits u128 = 2^127 ≈ 3.4*10^38), divided by total_assets
    // (≥ 1 by seed guarantee) → result ≤ u64::MAX.
    let virtual_shares: u64 = strategy_constants::virtual_shares(); // = 10^6
    let numerator = (deposit_quote as u128)
        * ((vault.total_shares as u128) + (virtual_shares as u128));
    let denominator = (vault.total_assets as u128) + 1u128;
    let shares = numerator / denominator;
    assert!(shares > 0, EZeroSharesMinted);
    assert!(shares <= (std::u64::max_value!() as u128), EShareOverflow);
    shares as u64
}
```

**Rounding rule:** Move u128 division truncates toward zero. This rounds DOWN, in the vault's favor (user gets ≤ fair share). Symmetric on redeem: `assets_out = (shares_burned * (total_assets + 1)) / (total_shares + virtual_shares)` truncates DOWN, user gets ≤ fair assets. Both directions favor the vault. [CITED: PITFALLS.md §"Pitfall 12"]

**Where overflow risk lives:** The multiplication step. With `deposit ≤ 10^15` and `total_shares + virtual_shares ≤ 10^15`, product fits well inside u128. Plan should add a property test that asserts `(deposit_quote as u128) * (total_shares + virtual_shares as u128) < u128::MAX / 2` for all reachable states.

**Seed transaction enforcement:** D-04 says cancel "is a pure inverse of request, no token-supply movement"; pair with the seed-once invariant: `vault::create_vault` aborts with `EAlreadyInitialized` if called twice. Practically, `Vault<Quote>` is a **shared** object — once shared via `transfer::share_object`, the same object cannot be re-created. The `init`-then-`create_vault` flow is a single deploy moment; no second call possible. [VERIFIED: Sui shared object semantics]

**Reference for math:** OpenZeppelin's [ERC-4626 v5 implementation](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/token/ERC20/extensions/ERC4626.sol) is the canonical source. Plan should cite the line `_decimalsOffset()` returning 6 as the OZ default, which matches our 10^6.

### Pattern 3: Atomic supply→hedge as Single Move Entry Function

**What:** `vault::supply` is a `public entry` function that internally invokes `vault::rebalance::buy_hedge_for_deposit`, which internally invokes `vault::predict_adapter::mint`. All three calls execute inside the same Move transaction; any abort propagates and reverts the whole tx.

**Function signature:**
```move
public entry fun supply<Quote>(
    vault: &mut Vault<Quote>,
    predict: &mut deepbook_predict::predict::Predict,
    predict_manager: &mut deepbook_predict::predict_manager::PredictManager,
    oracle: &deepbook_predict::oracle::OracleSVI,
    deposit: Coin<Quote>,
    clock: &Clock,
    ctx: &mut TxContext,
)
```

**Why entry, not just public:** Per deepbookv3/.claude/rules/move.md "No `public entry`, Only `public` or `entry`": `entry` is for transaction-callable functions that don't compose. Since `supply` IS the user-facing PTB call and we want to prevent another module from re-entering it with a fake `Vault`, `entry` is correct. Counter-argument: a future composability use case (vault inside another product) may want `public fun supply<Quote>(...): Coin<VAULT_SHARE>` (composable, returns share). **Plan should pick `public entry` for v1** and leave a TODO comment that a v2 may add a `public fun supply_composable` returning the share for power-users. [CITED: deepbookv3/.claude/rules/move.md]

**Atomic rollback semantics — concrete trace:**
1. User signs PTB containing one `tx.moveCall(::vault::supply)`.
2. Move runtime executes `vault::supply`, which:
   - reads vault.paused → asserts not paused
   - splits deposit: 90% to vault.balance, 10% to hedge purchase
   - calls `vault::rebalance::buy_hedge_for_deposit(...)`
3. Inside `buy_hedge_for_deposit`, the internal call to `predict::mint` invokes Predict's `oracle_config::assert_live_oracle(oracle, clock)` at `oracle_config.move:200`.
4. If `clock.timestamp_ms() > oracle.timestamp() + 30_000`, Predict raises `EOracleStale = 6`.
5. Move runtime unwinds: vault.balance reverts, no shares minted, no Coin<VAULT_SHARE> in caller's wallet, deposit Coin returned (atomic Move tx semantics). User sees an aborted tx with abort code 6 from `deepbook_predict::oracle_config`.

**Plan should:** Document the abort-code-to-cause table in `vault::supply` doc comments AND in `docs/ABORTS.md` (plan creates) so dashboard error-display can map abort codes to user-friendly messages.

**Client-side TS sketch (for E2E script):**
```typescript
// scripts/e2e-vault-cycle.sh's TS wrapper or an embedded TypeScript test
import { Transaction } from '@mysten/sui/transactions';
const tx = new Transaction();
tx.moveCall({
  target: `${DEEPVAULT_PKG}::supply::supply`,
  arguments: [
    tx.sharedObjectRef({ objectId: VAULT, mutable: true, initialSharedVersion: VAULT_INIT_VER }),
    tx.sharedObjectRef({ objectId: PREDICT, mutable: true, initialSharedVersion: PREDICT_INIT_VER }),
    tx.sharedObjectRef({ objectId: PREDICT_MANAGER, mutable: true, initialSharedVersion: PM_INIT_VER }),
    tx.sharedObjectRef({ objectId: ORACLE_SVI, mutable: false, initialSharedVersion: ORA_INIT_VER }),
    tx.object(deposit_coin_id),
    tx.object('0x6'),
  ],
  typeArguments: ['0xe9..::dusdc::DUSDC'],
});
```

The `initialSharedVersion` values are captured at deploy time (`vault::create_vault` shared the Vault) and stored in `config/testnet.toml`. Pitfall 14 mitigation already covered in Phase 0 config scaffolding. [VERIFIED: ARCHITECTURE.md §4 + @mysten/sui Transaction docs]

### Pattern 4: Per-User Token-Bucket via `Table<address, RateLimiter>`

**What:** Clone the vendored `helper/rate_limiter.move` (already audited) and host one `RateLimiter` per user inside a `Table<address, RateLimiter>` field on `Vault<Quote>`.

**The clone target (vendored at `scripts/deepbookv3/packages/predict/sources/helper/rate_limiter.move:24-35`):**
```move
public struct RateLimiter has store {
    available: u64,
    last_updated_ms: u64,
    capacity: u64,
    refill_rate_per_ms: u64,
    enabled: bool,
}
```
And `consume`, `record_deposit`, `enable`, `available`, `refill` all already implement Pitfall 13 mitigations (u128 intermediates for the `(elapsed * refill_rate)` math, capacity cap, refill on every operation). [VERIFIED: rate_limiter.move]

**Vault wrapping:**
```move
public struct Vault<phantom Quote> has key {
    id: UID,
    // ... other fields ...
    user_buckets: Table<address, helpers::rate_limiter::RateLimiter>,
    // ...
}

public(package) fun get_or_init_user_bucket(
    vault: &mut Vault<Quote>,
    user: address,
    clock: &Clock,
): &mut helpers::rate_limiter::RateLimiter {
    if (!vault.user_buckets.contains(user)) {
        let mut bucket = helpers::rate_limiter::new(clock);
        helpers::rate_limiter::update_config(
            &mut bucket,
            strategy_constants::token_bucket_capacity(),
            strategy_constants::token_bucket_refill_rate_per_ms(),
        );
        helpers::rate_limiter::enable(&mut bucket, clock);
        vault.user_buckets.add(user, bucket);
    };
    vault.user_buckets.borrow_mut(user)
}
```

**Gas cost per entry:** Sui's `Table` entries are object-system-backed; ~80-200 gas per `add`/`borrow_mut`/`contains` call (rough estimate). Negligible at v1 user counts. Plan should NOT prematurely optimize; the audit story for "per-user bucket" is more important than gas at this scale.

**No-bucket-yet semantics:** First `redeem_fulfill` for a user sees no bucket → init with full capacity. This means a brand-new redeem caller has full bucket allowance. Acceptable per CONTEXT.md D-05 ("Initial values are conservative defaults"); document explicitly.

**Testing via clock warping:** `clock::create_for_testing(ctx)` then `clock.increment_for_testing(60_000)` (= 60 seconds). [VERIFIED: rate_limiter_tests.move:147-156]

**Token-bucket parameter values to fill in `[token_bucket]` (D-05 says "conservative defaults — AdminCap can tune"):**
- `capacity_quote_micro_units`: Conservative default = 2× (vault TVL / target user count). Plan-time guess at v1 launch: `capacity = 100_000_000` (100 DUSDC at 6dp) — generous enough for the demo's $50 supply→redeem cycle (DEPLOY-04), tight enough that a 100-user coordinated drain takes ≥48h. AdminCap retunes via `admin_tune_strategy("[token_bucket].capacity")` (D-11.3).
- `refill_rate_quote_micro_units_per_ms`: `capacity / (24 * 3600 * 1000)` ≈ `1157` (full bucket regenerates over 24h per CONTEXT.md D-05). Round up to `1200` for cleaner numbers.

These values must land in `shared/strategy.toml [token_bucket]` and be codegen'd to `strategy_constants.move`. **Plan should extend `scripts/codegen.py` to emit `token_bucket_capacity` and `token_bucket_refill_rate_per_ms` if not already.** [VERIFIED: existing strategy.toml shows `capacity_bps`/`refill_rate_bps_per_sec`/`period_seconds` fields — the BPS framing needs replacement with absolute u64 micro-units to match rate_limiter.move's u64 absolute fields. **Plan must update strategy.toml schema to absolute u64 form.**]

### Pattern 5: Permissionless `roll_expiring` — Iterate `vector<ID>` Parallel Index

**What:** `Table<ID, HedgePosition>` doesn't expose iterator methods. Sui community convention is to maintain a parallel `vector<ID>` of Table keys. `roll_expiring` walks the vector, looks up each entry, and rolls those past the threshold.

**Storage on Vault<Quote>:**
```move
public struct HedgePosition has copy, drop, store {
    oracle_id: ID,
    market_key: deepbook_predict::market_key::MarketKey,
    strike: u64,
    expiry_ms: u64,
    notional_quote: u64,
    cost_basis_quote: u64,
    quantity: u64, // the quantity passed to predict::mint
}

public struct Vault<phantom Quote> has key {
    // ...
    hedges: Table<ID, HedgePosition>,
    hedge_ids: vector<ID>,         // parallel index for iteration
    // ...
}
```

**`roll_expiring` body sketch:**
```move
public entry fun roll_expiring<Quote>(
    vault: &mut Vault<Quote>,
    predict: &mut deepbook_predict::predict::Predict,
    predict_manager: &mut deepbook_predict::predict_manager::PredictManager,
    oracle: &deepbook_predict::oracle::OracleSVI,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let now_ms = clock.timestamp_ms();
    let trigger_ms = strategy_constants::roll_trigger_seconds() * 1000;
    let mut i = 0;
    let n = vector::length(&vault.hedge_ids);
    let mut to_roll = vector::empty<ID>();
    // First pass: identify expiring (immutable scan)
    while (i < n) {
        let id = *vector::borrow(&vault.hedge_ids, i);
        let h = vault.hedges.borrow(id);
        if (h.expiry_ms < now_ms + trigger_ms) {
            vector::push_back(&mut to_roll, id);
        };
        i = i + 1;
    };
    // Second pass: redeem old, mint new
    let mut j = 0;
    let m = vector::length(&to_roll);
    while (j < m) {
        let id = *vector::borrow(&to_roll, j);
        let old = vault.hedges.remove(id);
        // remove from parallel vector
        let (found, idx) = vector::index_of(&vault.hedge_ids, &id);
        if (found) { vector::remove(&mut vault.hedge_ids, idx); };
        // Close old position
        predict_adapter::redeem(predict, predict_manager, oracle, old.market_key, old.quantity, clock, ctx);
        // Mint replacement at fresh SVI fair value
        let new_position = rebalance::mint_hedge_internal(vault, predict, predict_manager, oracle, old.notional_quote, clock, ctx);
        let new_id = object::id_from_address(...); // synthesize new ID
        vault.hedges.add(new_id, new_position);
        vector::push_back(&mut vault.hedge_ids, new_id);
        event::emit(HedgeRolled { vault_id: object::id(vault), old_id: id, new_id });
        j = j + 1;
    };
}
```

**Gas cost concern:** Each iteration is O(n) for `vector::index_of` (scan the parallel vector). With ≤ 50 open hedges per vault per day target, this is fine. **Plan should add a defensive cap on `n`** (e.g., `assert!(n < 100, EHedgeRegistryTooLarge)`) to prevent runaway gas; if hit, AdminCap can manually unwind via `admin_emergency_unwind` (D-11.4).

**Hedge ID generation:** Move doesn't synthesize IDs from arbitrary inputs. Standard pattern: use a UID's `object::id` for first-class objects, or for "logical" registry entries use a counter `vault.next_hedge_id: u64` cast to ID via `object::id_from_address` (with a deterministic prefix). Plan-level decision: **use `object::new(ctx)` to create a phantom UID-bearing struct per hedge**, then immediately `object::delete` it after extracting the ID. Wasteful but standard. Or — simpler — store hedges keyed by `MarketKey` instead of `ID`, since MarketKey already encodes (oracle_id, expiry, strike, direction) uniquely. **Recommended: `Table<MarketKey, HedgePosition>` + `vector<MarketKey>`**, eliminates the ID-synthesis dance entirely. MarketKey has `copy + drop + store` (verified at `market_key.move:20`), so it's a valid Table key. [VERIFIED: market_key.move]

### Pattern 6: Sui Prover Spec — Three Properties in `contracts/specs/`

**What:** Sui Prover (asymptotic-code/sui-prover, open-sourced Jan 2026) consumes `#[spec(prove)]` annotated functions in your codebase. Each spec is a "shadow" function that calls the real function, captures pre-state via `clone!`, and asserts post-state via `requires` (preconditions) and `ensures` (postconditions). [VERIFIED: github.com/asymptotic-code/sui-prover README + blog.sui.io article]

**Canonical example (from sui-prover README, paraphrased for vault context):**

```move
// contracts/specs/nav_monotone.move (or appended to supply.move)
#[spec(prove)]
fun nav_monotone_after_supply_spec<Quote>(
    vault: &mut Vault<Quote>,
    predict: &mut Predict,
    predict_manager: &mut PredictManager,
    oracle: &OracleSVI,
    deposit: Coin<Quote>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    requires(deposit.value() > 0);
    requires(vault.total_shares > 0);     // seed has happened
    requires(vault.total_assets > 0);     // seed has happened

    let old_vault = clone!(vault);
    let old_nav_per_share_x9 = (old_vault.total_assets as u128) * 1_000_000_000u128
        / (old_vault.total_shares as u128);

    supply(vault, predict, predict_manager, oracle, deposit, clock, ctx);

    let new_nav_per_share_x9 = (vault.total_assets as u128) * 1_000_000_000u128
        / (vault.total_shares as u128);

    // NAV per share never decreases on supply (modulo hedge cost = 10% of deposit
    // expected to come back as fair-value hedge book asset, so net change ~ 0)
    ensures(new_nav_per_share_x9 >= old_nav_per_share_x9 - hedge_cost_tolerance_x9);
}
```

**The three CONTEXT.md properties translated:**

| Property | Spec function name | What it asserts |
|----------|-------------------|-----------------|
| `inflation_safe` | `inflation_safe_spec` | After any sequence of (supply, redeem) starting from seeded state, attacker who deposits 1 wei + donates X cannot extract > X from a victim's deposit. Practically: `shares_to_mint(deposit, total_shares + virtual_shares, total_assets + 1) > 0` for all `deposit >= MIN_DEPOSIT_THRESHOLD`. |
| `nav_monotone_after_supply` | `nav_monotone_after_supply_spec` | NAV per share post-supply ≥ NAV per share pre-supply, modulo hedge cost (= 10% of deposit, expected book-fair). |
| `capability_containment` | `capability_containment_spec` | TreasuryCap<SHARE> and AdminCap never appear in any function's return value across the package. **This isn't a runtime spec — it's a structural property best enforced by `grep` + manual review, supplemented by sui-prover for any function path that touches `vault.treasury_cap` field.** |

**`capability_containment` actually**: Sui Prover proves runtime properties; "TreasuryCap never escapes" is a structural type property. Plan should ship TWO mechanisms:
1. A grep-based CI check (lightweight, runs in `move` job): `grep -rE 'TreasuryCap|AdminCap' contracts/sources/ | grep -E ': &?(mut )?(TreasuryCap|AdminCap)' | grep -v '_test.move' | grep 'public fun'` — should return empty. Anything matching means a public function exposes a cap. ~5 lines of bash.
2. A sui-prover spec that proves `vault.treasury_cap` field address (in serialized form) is never written to ctx.sender's owned objects after any reachable function call. This is harder to express; plan should treat it as a stretch goal and rely on (1) as the load-bearing check.

**CI cost budget:** Sui Prover runtime varies per spec. Anecdotal evidence (from blog.kunalabs.io and the asymptotic blog) puts vault-grade specs at 30s-5min each on a typical CI runner. **Three specs × ~3min = ~10min.** Vs. the existing `move` job at ~2-3min, this is ~3-5x increase. **Plan recommendation:** Add a SEPARATE `nightly-prover.yml` workflow that runs `sui-prover` on a cron (e.g., daily at 03:00 UTC) and on workflow_dispatch. Do NOT add to ci.yml's per-push critical path — it would slow every commit unacceptably. Phase 6 docs reference the nightly badge for the audit story. [ASSUMED: runtime estimate from 3rd-party blogs, not benchmarked]

**Install + invocation:**
```bash
# Install (nightly job step)
brew install asymptotic-code/sui-prover/sui-prover     # macOS
# OR
curl -L https://github.com/asymptotic-code/sui-prover/releases/latest/download/sui-prover-linux-x86_64 -o sui-prover && chmod +x sui-prover && sudo mv sui-prover /usr/local/bin/

# Run from contracts/ directory
cd contracts && sui-prover
```

**[CITED: github.com/asymptotic-code/sui-prover README]**

### Anti-Patterns to Avoid

- **Do NOT store `TreasuryCap<SHARE>` outside the shared `Vault<Quote>` object.** Even briefly — including in `init` — risks an attacker observing the un-shared object before it gets moved into the vault. Use the `PendingTreasury` wrapper pattern (Pattern 1) to bridge `init` → `create_vault`.

- **Do NOT compute `shares_to_mint` without u128 intermediates.** `(deposit * (total_shares + offset)) / (total_assets + 1)` with all u64 will silently wrap around. Use `(x as u128) * (y as u128)`.

- **Do NOT relax `oracle_config::assert_live_oracle`'s 30s gate via AdminCap.** It's not in your codebase; you can't override it. AdminCap's `admin_oracle_staleness_override` (D-11.2) only adjusts vault's *display* staleness, not Predict's mint gate. **Document this explicitly in the AdminCap spec.**

- **Do NOT call `predict::mint` directly from `vault::supply`.** Always go through `vault::predict_adapter::mint` (D-07's "thin wrapper" requirement) — single-file blast radius for Predict ABI churn. (Pitfall 6.)

- **Do NOT use `coin::create_currency` for SHARE.** Deprecated per deepbookv3 rules; use `coin_registry::new_currency_with_otw`. (See Pattern 1.)

- **Do NOT store hedges keyed by an `ID` you synthesize manually.** Use `MarketKey` directly (it has `copy + drop + store`). Saves a UID-create-and-delete dance per hedge.

- **Do NOT iterate Table directly.** Maintain parallel `vector<MarketKey>`. (See Pattern 5.)

- **Do NOT mint VAULT_SHARE inside `vault::create_vault` to `ctx.sender()`.** Only burn-to-`@0xdead`. The seed shares (= 10⁶) must NOT enter circulation, or the inflation defense breaks for the second depositor.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Token-bucket withdrawal limiter | Custom u64 refill math from scratch | Clone `scripts/deepbookv3/packages/predict/sources/helper/rate_limiter.move` | Audited (Chainlink CCIP RateLimiter port), already handles u128 intermediates for `(elapsed * rate)` overflow + capacity caps + lazy refill. **Pitfall 13 list of bugs all already mitigated.** |
| Vault share token type | Custom Coin issuer + manual `decimals` field | `coin_registry::new_currency_with_otw` | Sui-canonical, integrates with wallet displays + Sui Explorer + future Margin price-feed. (Predict's PLP uses this exact pattern.) |
| Inflation defense | Custom virtual-shares scheme | OpenZeppelin ERC-4626 v5 formula, ported to Move | Battle-tested (5+ years of EVM exploitation history closed); the canonical reference cited in Pitfall 4. |
| SVI-to-binary pricing | Re-implementing in `vault::rebalance` | Call `svi_view::binary_price(oracle, strike)` (Phase 1) | Already 3-runtime parity-gated, golden-vector-tested. |
| Predict ABI consumption | Importing predict types throughout vault modules | `vault::predict_adapter` thin wrapper, single import surface | Pitfall 6: contract churn blast radius is 1 file, not the whole package. |
| OTW-driven currency creation | Hand-rolled `Coin::create_currency` (deprecated) | `coin_registry::new_currency_with_otw` | Per deepbookv3 move.md rules: deprecated functions block PRs. |
| Test clock warping | Sleep-based or cron-driven Move tests | `clock::create_for_testing(ctx)` + `clock.increment_for_testing(ms)` | Standard sui-framework test_utils pattern. (See vendored `rate_limiter_tests.move:147-156`.) |
| Sui Prover spec syntax | Custom test-runner DSL | `#[spec(prove)]` + `requires()` + `ensures()` + `clone!()` from asymptotic-code/sui-prover | Open-source since Jan 2026; community standard. |
| Iterating `Table<K, V>` | Building a custom iterator type | `vector<K>` parallel index | Sui community convention; documented at intro.sui-book.com Unit Four. |

**Key insight:** Phase 2's value-add is composing these audited primitives correctly, not reinventing any of them. Every line of custom math (virtual-shares formula, NAV computation, worst-case haircut) must be paired with a property test or Sui Prover spec.

## Runtime State Inventory

> Phase 2 is a greenfield package on a clean repo state — no rename, no refactor, no migration. There is no pre-existing `deepvault` package on testnet. **Skipping detailed Runtime State Inventory.**

The package's *post-deploy* state will include shared object IDs that Phase 4 dashboard and Phase 5 mainnet redeploy depend on. Plan must store these in `config/testnet.toml`:
- `[deepvault].package_id` (post-publish)
- `[deepvault].vault_id` (post-create-vault)
- `[deepvault].vault_initial_shared_version`
- `[deepvault].admin_cap_id`
- `[deepvault].predict_manager_id` (created during deploy: `vault::create_vault` calls `predict::create_manager` internally → returns ID)

## Common Pitfalls

### Pitfall 1: Vault initialized but seed never burned

**What goes wrong:** Deployer calls `vault::create_vault` with the seed coin, but the resulting seed shares get transferred to the deployer's wallet (or, worse, made transferable via `transfer::public_transfer(coin, ctx.sender())` in a typo). Inflation defense is broken; second depositor still vulnerable.

**Why it happens:** Move makes `transfer::public_transfer` ergonomic; mistyping `@0xdead` as `ctx.sender()` is one character.

**How to avoid:**
- Burn-to-`@0xdead` is the canonical pattern; document in module doc comment with a code reference.
- Property test: `vault::create_vault` → assert `vault.total_shares == strategy_constants::virtual_shares()` AND assert no `Coin<SHARE>` exists in the deployer's owned objects post-tx.
- Sui Prover spec: `inflation_safe` includes a precondition `requires(coin::value_owned_by_sender_for<SHARE>(ctx) == 0)` after `create_vault`.

**Warning signs:**
- Test sees a `Coin<SHARE>` returned from `create_vault` to the test scenario's address inventory.
- Property test for "second supply gets > 0 shares from a 1-DUSDC deposit" passes (it should pass — but if it passes for a 0.000001 DUSDC deposit too, defense is broken).

### Pitfall 2: `predict::mint` price slippage between SVI fair-value and Predict's quoted ask

**What goes wrong:** `vault::rebalance` computes the SVI fair value via `svi_view::binary_price` (Phase 1's deliverable, theoretical price). Then it calls `predict::mint`, which uses Predict's INTERNAL pricing (post-trade-state-aware ask) — which can differ. If Predict's ask exceeds vault's fair value materially, the vault overpays.

**Why it happens:** D-08 of Phase 1 says "vault.rebalance compares to Predict's quote and abstains if Predict mis-prices — that gate is **Phase 2's call**." Phase 2 hasn't decided HOW to gate yet.

**How to avoid:**
- Add a `max_price_premium_bps` config field (e.g., 50 bps = 0.5%): if `predict_ask > svi_fair_value * (10000 + 50) / 10000`, abort with `EPredictMisquote`.
- Read Predict's ask via `predict::ask_bounds(predict, oracle_id)` or `predict::get_trade_amounts(...)` BEFORE calling `predict::mint`.
- Document the abstain logic in the strategy whitepaper (Phase 6).

**Warning signs:**
- Hedge cost line in backtest grows wildly during high-vol regimes (Predict's spread widens; vault accepts).
- Per-hedge `cost_basis_quote / notional_quote` ratio > theoretical implied probability + 10%.

**Plan should:** add `max_price_premium_bps = 50` to `[hedge_policy]` in `strategy.toml`; `vault::rebalance` enforces.

### Pitfall 3: Hedge registry grows unbounded

**What goes wrong:** Every supply mints a new hedge; `vault.hedge_ids: vector<ID>` grows. After 1000 supplies, `roll_expiring`'s O(n) scan costs 1000 × table lookup ≈ unaffordable gas. Worse: if the hedge registry exceeds Sui's per-tx storage rebate budget, every supply starts costing more.

**Why it happens:** No consolidation mechanism. CONTEXT.md doesn't specify whether multiple supplies onto the same `(oracle_id, expiry, strike, direction)` MarketKey produce one accumulated entry or many.

**How to avoid:**
- **Consolidate by MarketKey.** When `buy_hedge_for_deposit` would create a hedge whose `MarketKey` already exists in `vault.hedges`, ADD to the existing entry's quantity instead of pushing a new ID. This caps `hedge_ids.length()` at ≤ (1 oracle) × (1 active expiry at a time given the 14-day rolling) × (1 strike per supply per oracle) ≈ 1-2 entries at v1.
- After every `roll_expiring`, the consolidated entry's quantity rolls atomically.
- Defensive cap `assert!(vector::length(&vault.hedge_ids) < 100, EHedgeRegistryTooLarge)`.

**Warning signs:**
- `vault.hedge_ids.length()` grows linearly with supply count.
- Per-supply gas cost rising over time.

### Pitfall 4: AdminCap accidentally used in non-admin operation

**What goes wrong:** A vault function takes `&AdminCap` as an argument "for safety" but isn't actually admin-gated. Caller accidentally uses it; or worse, admin's transaction reverts because the cap reference is mutably borrowed elsewhere.

**Why it happens:** Move's reference rules around `&AdminCap` are subtle in nested-call scenarios.

**How to avoid:**
- AdminCap is consumed BY VALUE for sensitive ops (e.g., `admin_emergency_unwind` takes `cap: &AdminCap`, not `cap: AdminCap`).
- Audit every `&AdminCap` parameter — is the function actually admin-only? If yes, gate. If no, remove the parameter.
- Sui Prover spec: `pause_only_admin_can_set_paused`: `requires(...)`; `ensures(vault.paused == new_paused_value || aborted)`.

### Pitfall 5: Quote-asset type-tag mismatch on shared object reference

**What goes wrong:** `Vault<DUSDC>` is shared. E2E script passes `Vault<DUSDC>` correctly, but a future test or the dashboard accidentally constructs `Vault<USDsui>` typeArguments — `sui client` fails with "Type mismatch" but error message is cryptic.

**Why it happens:** Sui shared object ID + typeArguments are independent on the client side.

**How to avoid:**
- E2E script reads typeArguments from `config/testnet.toml [assets].quote_type_tag`, never hard-codes.
- Dashboard PTB construction also reads from the same config (Phase 4 concern, but flag now).

### Pitfall 6: DeepBookV3 SHA pin drift between Move.toml and vendored subtree

**What goes wrong:** `contracts/Move.toml:17` pins `1159d79af33c70e09e406310e1d8f067832ede9d`. `git fetch && git log` for the vendored subtree returns parent-repo HEAD `8250375ada8c6898414ffe3a5648682449bb2c64` (subtree squash commit, NOT the upstream SHA). These are DIFFERENT IDs but SHOULD point to identical Move source. **If they ever diverge** — e.g., a Monday Predict-diff sweep updates the subtree but forgets to bump `Move.toml:17` — `sui move build` resolves the Git rev (which IS the upstream SHA at fetch time), while local code-reading sees the squashed copy. Tests pass locally but break on CI.

**Why it happens:** `git subtree --squash` rewrites history; `git log` on the parent repo shows the merge commit, not the pulled SHA.

**How to avoid:**
- `scripts/predict-diff.sh` (Phase 0) MUST verify that `Move.toml`'s pinned `rev` matches the upstream SHA the subtree was last pulled from. Add this assertion.
- Plan should add a CI check: `move-toml-sha-matches-subtree.yml` that runs `git show :scripts/deepbookv3/.gitattributes` (or equivalent subtree metadata) and asserts equality.

**Warning signs:**
- Local `sui move build` succeeds; CI `sui move build` fails with "module not found" or "ABI mismatch."
- Phase 1's vendored evaluator code references different field names than `Move.toml`-resolved Predict source.

## Code Examples

### `vault::create_vault` (deploy entry, including seed)

```move
module deepvault::vault;

use sui::{coin::{Self, Coin, TreasuryCap}, balance::{Self, Balance}, table::{Self, Table}, clock::Clock};
use deepvault::share::SHARE;
use deepvault::strategy_constants;
use deepvault::helpers::rate_limiter::RateLimiter;

const ESeedAmountMismatch: u64 = 100;
const EAlreadyInitialized: u64 = 101;
const EBadDeadAddress: u64 = 102;

const DEAD_ADDRESS: address = @0xdead;
const VIRTUAL_SHARES: u64 = 1_000_000;        // = 10^6 (decimals_offset)
const SEED_QUOTE_MICRO_UNITS: u64 = 10_000_000; // = 10 DUSDC at 6dp

public struct Vault<phantom Quote> has key {
    id: UID,
    treasury_cap: TreasuryCap<SHARE>,
    balance: Balance<Quote>,
    total_assets: u64,
    total_shares: u64,
    paused: bool,
    hedges: Table<deepbook_predict::market_key::MarketKey, HedgePosition>,
    hedge_keys: vector<deepbook_predict::market_key::MarketKey>,
    user_buckets: Table<address, RateLimiter>,
    user_requests: Table<address, RequestSlot>,
    predict_manager_id: ID,
    max_staleness_seconds: u64, // initial = 300; AdminCap can override
}

public struct AdminCap has key { id: UID }

public struct PendingTreasury has key, store { id: UID, cap: TreasuryCap<SHARE> }

public struct HedgePosition has copy, drop, store { /* see Pattern 5 */ }
public struct RequestSlot has copy, drop, store { /* see redeem.move */ }

public entry fun create_vault<Quote>(
    pending: PendingTreasury,
    seed: Coin<Quote>,
    predict: &mut deepbook_predict::predict::Predict,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let PendingTreasury { id: pending_id, cap } = pending;
    pending_id.delete();

    assert!(seed.value() == SEED_QUOTE_MICRO_UNITS, ESeedAmountMismatch);

    // Create predict manager (vault holds its ID; manager is a shared object)
    let predict_manager_id = deepbook_predict::predict::create_manager(ctx);

    let mut vault = Vault<Quote> {
        id: object::new(ctx),
        treasury_cap: cap,
        balance: balance::zero(),
        total_assets: 0,
        total_shares: 0,
        paused: false,
        hedges: table::new(ctx),
        hedge_keys: vector[],
        user_buckets: table::new(ctx),
        user_requests: table::new(ctx),
        predict_manager_id,
        max_staleness_seconds: strategy_constants::max_staleness_seconds(),
    };

    // Mint seed shares = VIRTUAL_SHARES (10^6) and send to dead address
    let seed_shares = coin::mint(&mut vault.treasury_cap, VIRTUAL_SHARES, ctx);
    transfer::public_transfer(seed_shares, DEAD_ADDRESS);

    // Lock seed assets into vault
    vault.balance.join(seed.into_balance());
    vault.total_assets = SEED_QUOTE_MICRO_UNITS;
    vault.total_shares = VIRTUAL_SHARES;

    let admin_cap = AdminCap { id: object::new(ctx) };
    transfer::transfer(admin_cap, ctx.sender());
    transfer::share_object(vault);
}
```

[Source: synthesized from vendored `plp.move:12-25`, `predict.move:507-534`, OpenZeppelin ERC-4626 v5, Sui shared-object semantics] [VERIFIED — pattern composition; specific code unverified by compiler]

### `vault::supply` (atomic supply + hedge)

```move
module deepvault::supply;

use deepvault::vault::Vault;
use deepvault::share::SHARE;
use deepvault::rebalance;
use deepvault::strategy_constants;

const ESupplyPaused: u64 = 200;
const EZeroSharesMinted: u64 = 201;
const EShareOverflow: u64 = 202;

public entry fun supply<Quote>(
    vault: &mut Vault<Quote>,
    predict: &mut deepbook_predict::predict::Predict,
    predict_manager: &mut deepbook_predict::predict_manager::PredictManager,
    oracle: &deepbook_predict::oracle::OracleSVI,
    deposit: Coin<Quote>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(!vault::is_paused(vault), ESupplyPaused);

    let deposit_amount = deposit.value();
    let shares_to_mint = compute_shares_to_mint(vault, deposit_amount);
    assert!(shares_to_mint > 0, EZeroSharesMinted);

    // Split: 90% to vault.balance, 10% to hedge purchase
    let hedge_alloc_bps = strategy_constants::allocation_bps();
    let hedge_amount = (deposit_amount as u128) * (hedge_alloc_bps as u128) / 10000u128;
    let mut deposit_balance = deposit.into_balance();
    let hedge_balance = deposit_balance.split(hedge_amount as u64);

    // Buy hedge atomically (aborts whole tx on Predict failure)
    rebalance::buy_hedge_for_deposit<Quote>(
        vault, predict, predict_manager, oracle,
        hedge_balance.into_coin(ctx),
        clock, ctx,
    );

    // Update accounting
    vault::update_balance_and_shares<Quote>(vault, deposit_balance, shares_to_mint);

    // Mint share coin to user
    let share_coin = coin::mint(vault::treasury_cap_mut(vault), shares_to_mint, ctx);
    transfer::public_transfer(share_coin, ctx.sender());

    sui::event::emit(Supplied {
        vault_id: object::id(vault),
        depositor: ctx.sender(),
        deposit_quote: deposit_amount,
        shares_minted: shares_to_mint,
    });
}

fun compute_shares_to_mint<Quote>(vault: &Vault<Quote>, deposit: u64): u64 {
    let virtual_shares = strategy_constants::virtual_shares();
    let numerator = (deposit as u128)
        * ((vault::total_shares(vault) as u128) + (virtual_shares as u128));
    let denominator = (vault::total_assets(vault) as u128) + 1u128;
    let shares = numerator / denominator;
    assert!(shares <= (std::u64::max_value!() as u128), EShareOverflow);
    shares as u64
}
```

### Test: clock-warped roll path

```move
module deepvault::rebalance_test;

use sui::{clock, test_scenario, test_utils::destroy};
use deepvault::vault;
use deepvault::rebalance;

#[test]
fun roll_expiring_warps_clock_past_expiry() {
    let admin = @0xa;
    let mut ts = test_scenario::begin(admin);
    let ctx = ts.ctx();

    let mut clk = clock::create_for_testing(ctx);

    // ... setup vault with one open hedge expiring at t=14d ...
    let (vault, predict, manager, oracle) = setup_vault_with_hedge(&mut clk, ctx);

    // Advance clock to within roll trigger window: 14d - 1d = 13d in
    clk.increment_for_testing(13 * 86400 * 1000);

    rebalance::roll_expiring(&mut vault, &mut predict, &mut manager, &oracle, &clk, ctx);

    // Assert: old hedge gone, new hedge with expiry = 13d + 14d = 27d in
    assert_eq!(vault::open_hedge_count(&vault), 1);
    let new_hedge = vault::peek_first_hedge(&vault);
    assert_eq!(new_hedge.expiry_ms(), 27 * 86400 * 1000);

    destroy(vault); destroy(predict); destroy(manager); destroy(oracle);
    clk.destroy_for_testing();
    ts.end();
}
```

[Source: pattern from `rate_limiter_tests.move:147-156`] [VERIFIED — pattern reuse]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `coin::create_currency` | `coin_registry::new_currency_with_otw` | ~Sui 1.45+ (2025) | Plan must use the new API; deepbookv3 rules block PRs using the deprecated form |
| Manual struct + `transfer::transfer` for currency creation | OTW + `coin_registry::new_currency_with_otw` + `finalize` + `MetadataCap` | ~Sui 1.45+ | Cleaner; plan ships exact pattern from `plp.move:12-25` |
| `subscribeEvent` WebSocket | `queryEvents` polling | ~Sui 1.62+ | Out of scope for Phase 2 (vault doesn't subscribe); flag for Phase 4 dashboard |
| `coin::create_currency_for_testing` for unit tests | Real `init` driven OTW + dummy registry | Sui 1.66+ | Plan should use real OTW where the test is genuinely production-behavior; permissive helpers only for pure-math tests (per deepbookv3 unit-tests.md rule 12) |
| `move::table::Table` with manual key iteration | `Table` + parallel `vector<K>` | Stable since ~2024 | Plan uses this pattern (Pattern 5) |
| `coin::create_treasury_cap_for_testing` shortcut | Real init + extract via test scenario | Sui 1.71+ | Plan should use real init for the inflation-safe property test |
| `entry public fun` (combined) | Either `entry fun` or `public fun` (never both) | Move 2024 | Plan must avoid the combined form; deepbookv3 move.md rules will catch it |

**Deprecated/outdated:**
- `coin::create_currency` (use `coin_registry::new_currency_with_otw`)
- `Move 2023` edition (`Move.toml` already `2024.beta`)
- `Sui CLI ≤ 1.66.x` (protocol mismatch with mainnet 1.71)
- Module label syntax `module pkg::mod { ... }` — use `module pkg::mod;` then top-level decls (per deepbookv3 move.md "Using Module Label")

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `PendingTreasury` (with `key, store`) is a viable bridge between `init` and `create_vault` for the TreasuryCap quarantine pattern | Pattern 1 | If Sui requires TreasuryCap to be transferred immediately on init (no holding patterns allowed), the plan must move directly to `transfer::public_transfer(treasury_cap, ctx.sender())` and rely on social-trust that deployer calls `create_vault` next. Acceptable — single deployer, single block. |
| A2 | Sui Prover runtime per spec is 30s-5min on stock CI runner | Pattern 6 | If actual runtime is >30min per spec, even a nightly CI job becomes inconvenient. Mitigation: run prover on workflow_dispatch only (manual trigger), drop nightly cron. |
| A3 | `Table<MarketKey, HedgePosition>` works as a key (MarketKey has copy+drop+store verified) | Pattern 5 | Verified at `market_key.move:20`. Risk = 0. [VERIFIED] |
| A4 | A future v2 will want a composable `public fun supply(...) -> Coin<SHARE>` form; v1 ships `entry` only | Pattern 3 | Low risk — v2 can add the composable variant alongside the entry. No migration needed. |
| A5 | Predict's `predict_manager_id` from `create_manager(ctx)` is captured + storable in `Vault.predict_manager_id: ID` | Code Examples → `create_vault` | Verified at `predict_manager.move:88-114`: `new(ctx)` shares the manager and returns its ID. **Caveat:** the manager is owned by `ctx.sender()` (the vault deployer), not the vault itself. This means future `predict::mint<Quote>` calls require `manager_owner == ctx.sender()` — and the **VAULT** is the one calling `predict::mint`, but vaults don't have a "sender." **Critical issue — see Open Question #1 below.** |
| A6 | The vault can be the OWNER of its `PredictManager` (by calling `predict::create_manager(ctx)` from within `create_vault`, where `ctx.sender()` is the deployer) | Code Examples → `create_vault` | The deployer's address would be the `manager.owner`. Then `predict::mint` requires `ctx.sender() == manager.owner()` at every mint — but `vault::supply` is called by the SUPPLIER (random user), not the deployer. **This appears to be a blocker. Plan must resolve this — see Open Questions.** |
| A7 | `max_price_premium_bps = 50` (0.5%) is a sensible Predict-mis-quote abstain threshold | Pitfall 2 | Backtest (Phase 3) will tune; v1 ships conservative 50 bps. Low risk. |
| A8 | E2E script's TS wrapper uses the existing `dashboard/` workspace's `@mysten/sui` install (currently 2.16.0 → bumped to 2.16.2) | Pattern 3 | Verified in package.json; point release low-risk. [VERIFIED via npm view] |
| A9 | Sui Prover's `clone!()` macro deep-copies the `&mut Vault` reference, including its inner Table fields | Pattern 6 | Asymptotic blog implies `clone!` works on Move structs with `copy + drop + store`. Vault has none of these (it has `key`). **`clone!` semantics for `key`-only objects is unverified.** Plan should resolve in a Wave 0 spike with the prover. |
| A10 | Token-bucket capacity `100_000_000` (100 DUSDC) is a sensible v1 default | Pattern 4 | Plan-time guess; real default is post-Phase 3 backtest. AdminCap retunes. |

**Critical assumptions A5+A6 are blockers — see Open Question #1.**

## Open Questions

1. **Who owns the PredictManager? (BLOCKER — must resolve in Wave 0 spike)**
   - What we know: `predict::create_manager(ctx)` creates a `PredictManager` shared object with `manager.owner = ctx.sender()`. `predict::mint` asserts `ctx.sender() == manager.owner()` at line 228.
   - What's unclear: If `create_manager` is called inside `vault::create_vault`, the deployer is the owner. Then `vault::supply` (called by a random supplier) tries to call `predict::mint` against this manager — fails the owner check.
   - **Three resolution options:**
     - **(a) Vault holds the BalanceManager directly, NOT PredictManager.** The vault calls `predict::mint` with its OWN `BalanceManager` (via a custom internal cap, similar to TreasuryCap quarantine). **Problem:** `predict::mint<Quote>` signature is hard-coded to take `&mut PredictManager`, not `&mut BalanceManager`. Cannot bypass.
     - **(b) Each supplier creates their own PredictManager via the PTB, then transfers ownership during the same transaction.** **Problem:** Adds complexity to user UX; supplier needs to construct a multi-call PTB. Breaks the "single tx digest" demo claim.
     - **(c) The PredictManager's owner is a vault-controlled "service address" (e.g., the AdminCap holder, or a programmatically derived address).** Then `predict::mint` asserts the caller-as-sender matches the service address. **Problem:** Sui's `ctx.sender()` is the user signing the PTB; cannot fake.
     - **(d) ⭐ RECOMMENDED: Vault is the owner; supplier calls a vault entry function that, within the same tx, has the VAULT call `predict::mint`.** Verify whether `manager.owner` can be set to a "service" or admin-cap address at create time AND whether `predict::mint` can be invoked from within a Move function where `ctx.sender()` returns the original signer (the user). **This is incompatible — `ctx.sender()` is always the original signer.** Hence (d) doesn't work either.
     - **(e) Plan-required: read predict::mint internals more carefully or contact Mysten team.** Predict was launched 2026-05-05; Mysten's design intent for PLP-LP-style integrations may include a path we haven't found.
   - **Recommendation:** Wave 0 spike to write a Move test that:
     1. Creates a `PredictManager` owned by a "vault service address" (the AdminCap holder).
     2. Has the vault call `predict::mint` from inside `vault::supply`.
     3. Observes whether the assert at `predict.move:228` passes or fails.
     - If FAIL: fall back to a different composability story — supplier's wallet IS the manager owner; supplier directly calls `predict::mint` post-supply, and vault tracks the resulting position via a callback. **Less elegant; affects the "single PTB" demo.** Mitigation: the user signs ONE PTB containing TWO `tx.moveCall`s — `vault::supply` then `predict::mint` — and Move's PTB-level atomicity still holds. We trade "single Move entry" for "single PTB" but keep the composability story.

2. **Does Sui Prover's `clone!()` work on objects with only `key` (no `copy/drop/store`)?**
   - What we know: Asymptotic README shows `clone!()` on `Pool<T>` (a struct that presumably has `key`).
   - What's unclear: Whether `clone!` does a structural deep-copy (works) or requires `copy` ability (fails for `Vault<Quote>`).
   - Recommendation: Wave 0 spike — write a trivial spec on a struct with `key` only and run `sui-prover`. If unsupported, refactor specs to compute pre-state values via field reads + arithmetic and pass them as `requires`.

3. **Should `vault::create_vault` be the ONLY shared-object-creating entry, or split into `create_vault` + `create_predict_manager` two-step?**
   - What we know: Predict's `create_manager` shares a manager object; that manager must be shared before `predict::mint` can be called.
   - What's unclear: Move's PTB semantics around creating-then-using a freshly-shared object in the same tx. (Sui historically requires shared objects to exist with a `initial_shared_version` BEFORE the tx that uses them.)
   - Recommendation: Plan uses two-step: Plan 02-X is `vault::create_vault` (deploy + share vault). Plan 02-Y is `vault::create_predict_manager` (separately shares a manager owned by AdminCap). Both happen as separate txs during deployment, captured to `config/testnet.toml`. **This is consistent with how Sui shared objects work and avoids the "use freshly-shared object" PTB anti-pattern.**

4. **DeepBookV3 SHA pin alignment between vendored subtree and Move.toml `rev`** — already flagged in Pitfall 6. Plan should add a CI assertion. Not a Wave 0 spike, but an early plan task.

5. **`@mysten/deepbook-v3` 0.17.0 → 1.3.6 major bump impact on E2E script** — Phase 2 E2E script imports BalanceManager creation utilities. Plan-checker should verify the `1.3.6` ABI doesn't break Phase 0's lockfile assumptions.

6. **`max_price_premium_bps` value** — Plan defaults to 50 bps, Phase 3 backtest tunes. Document the v1 default + tuning protocol in HEDGE-POLICY.md.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Sui CLI mainnet-v1.71.1 | Move build/test, E2E script | ✗ (per Phase 1 STATE.md note "Sui CLI unavailable in execution environment") | — | CI/GitHub Actions runs the build; local execution skipped during research |
| `sui-prover` | VAULT-10 Sui Prover spec | ✗ | — | Nightly CI runs the prover; local development relies on `sui move test` for property-test coverage |
| Node 22+ | E2E script TS wrapper | ✓ (CI installs via `actions/setup-node@v6`) | 22 | — |
| pnpm | E2E script TS wrapper deps | ✓ (CI installs via `pnpm/action-setup@v4`) | 10 | — |
| `@mysten/sui` | E2E PTB construction | ✓ (already in dashboard/ workspace) | 2.16.2 | — |
| `@mysten/deepbook-v3` | E2E script's BalanceManager creation | ✓ (latest 1.3.6) | 1.3.6 | If Margin SDK has API breakage in 1.x, drop the BalanceManager creation from E2E script — it's not actually needed for Phase 2's vault-only flow (Margin integration is Phase 3) |
| Testnet faucet for `dUSDC` | E2E script supplies real DUSDC | ✓ (per Phase 0 D-06: testnet wallet faucet-fed) | — | — |
| Testnet wallet provisioning (Plan 00-02 Task 4) | E2E script needs a funded testnet keypair | ⚠ (BLOCKED-on-human per STATE.md) | — | E2E job in CI uses ephemeral generated keypair (per Phase 0 D-09: "fresh-wallet PTB tests use ephemeral generated keypairs in CI") |
| Vendored DeepBookV3 source at SHA `1159d79a` (in `scripts/deepbookv3/`) | All Move tests + plan | ✓ (subtree at `8250375a` parent commit, content matches) | — | — |

**Missing dependencies with no fallback:**
- Local Sui CLI: research/plan can't run `sui move test` interactively. Plan must rely on CI for end-to-end verification. Acceptable per Phase 1 precedent.

**Missing dependencies with fallback:**
- `sui-prover` runs in nightly CI only.
- Wallet provisioning falls back to ephemeral keypairs.

## Project Constraints (from CLAUDE.md)

These directives have the same authority as locked decisions; plans MUST honor them.

1. **Sui CLI version pin: `mainnet-v1.71.1` exact.** Older versions reject txs due to protocol mismatch.
2. **Move Edition: `2024.beta` (or `"2024"`).** Required by current sui-framework.
3. **`Move.toml [dependencies]` MUST pin DeepBookV3 by branch+rev (the SHA `1159d79af33c70e09e406310e1d8f067832ede9d`).** No "latest"; bump only after Monday Predict-diff sweep.
4. **Wallet via `@mysten/dapp-kit` `WalletProvider` + `ConnectButton`** (not consumed in Phase 2 directly; Phase 4 concern but Phase 2's E2E script's TS wrapper should use the dapp-kit-compatible `Transaction` builder pattern from `@mysten/sui`).
5. **`@mysten/sui` 2.x — never `@mysten/sui.js` (legacy).**
6. **PTB construction: `tx.sharedObjectRef({ objectId, mutable, initialSharedVersion })`** — deploy MUST capture `initialSharedVersion` for the Vault.
7. **`queryEvents` polling, NOT `subscribeEvent` WebSocket** (Phase 4 concern; Phase 2's events are emitted, not subscribed).
8. **No hardcoded Predict package IDs in source.** Use `[addresses]` block in `Move.toml` + `.env`/config files.
9. **Dashboard reads OK; live raw on-chain reads to dashboard are forbidden.** (Phase 4 concern.)
10. **Hedge policy params (allocation_bps=1000, strike_otm_bps=1500, tenor_seconds=1209600, roll_trigger_seconds=172800) are LOCKED in `shared/strategy.toml`.** No `vault::rebalance` may hard-code these — must read from `strategy_constants`.
11. **Code freeze: 2026-05-30.** Phase 2 is Days 8-15 of the 39-day window — well before freeze. Plan all 6-8 sub-plans to land before freeze.
12. **Sui Prover spec is required for VAULT-10 — three properties.** (Pattern 6 above.)
13. **MIT license, public repo from day 1, MIT headers on every Move file** (matches Phase 1's existing license headers).
14. **Avoid deprecated Sui framework functions.** `coin_registry::new_currency_with_otw` ✓; `coin::create_currency` ✗.
15. **Move test gas limit: `--gas-limit 100000000000`** (100 billion, per deepbookv3 move.md tool calling instructions).
16. **`bunx prettier-move -c *.move --write` formats Move code** before commit.
17. **Test naming convention: do NOT prefix test functions with `test_`** (per deepbookv3 move.md). Tests modules already named `_test`.
18. **`assert_eq!`, never `assert!(... == ...)`** (per deepbookv3 unit-tests.md rule 10).

## Security Domain

> `security_enforcement: true` per `.planning/config.json` workflow → must include this section. ASVS L1.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | yes | Sui's tx-signing model + `ctx.sender()` is the authentication primitive. AdminCap = "ownership = authority"; no separate auth token required. |
| V3 Session Management | no | Stateless; no sessions. |
| V4 Access Control | yes | Capability-based: AdminCap, TreasuryCap, PendingTreasury — each has a single owner. |
| V5 Input Validation | yes | All `entry` function inputs MUST be validated: positive deposit, non-zero shares minted, oracle params in bound (delegated to svi_view), seed amount exact. |
| V6 Cryptography | no | No custom crypto. Sui's tx signing + Block Scholes oracle authority handle it. |

### Known Threat Patterns for Sui Move 2024

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| First-deposit inflation attack | Tampering | Virtual-shares + decimals_offset + dead-address seed (Pattern 2) |
| TreasuryCap escape | Elevation of Privilege | Quarantine inside shared object (Pattern 1); `capability_containment` Sui Prover spec |
| AdminCap theft via `transfer::public_transfer` | Spoofing | AdminCap is `key` only (no `store`); cannot use `public_transfer`. Only `transfer::transfer` from within the `vault` module — already non-transferable to deployers. **Plan should verify `AdminCap` ability constraints exclude `store`.** |
| Predict ABI-churn-induced wrong-call | Tampering | Single-file blast radius via `predict_adapter` (Pattern; Pitfall 6) |
| Oracle staleness exploit | Tampering | Inherited from Predict's 30s on-chain check (`assert_live_oracle`) — atomic supply→hedge cannot succeed against a stale oracle |
| Token-bucket bypass | DoS-on-victim | Per-user bucket (D-02), refill-on-every-op (rate_limiter.move pattern), u128 intermediates (Pitfall 13 mitigations all in vendored code) |
| Round-up exploitation in supply/redeem math | Tampering | Truncate-toward-zero everywhere (verified in Move u128 division semantics); property test `vault gains ≥ 0 wei per op` |
| Hedge registry growth DoS | DoS | Consolidate by MarketKey + cap at 100 entries (Pitfall 3) |
| Cross-module capability pass-through | EoP | TreasuryCap is `&mut`-only inside vault; no public function returns it (grep CI check) |
| Deployer-controlled config drift testnet → mainnet | Tampering | `config/{testnet,mainnet}.toml` with explicit `[deepvault]` section (deferred to Phase 5; Phase 2 sets up the `[testnet.deepvault]` template) (Pitfall 14) |
| Re-entrancy via Predict callback | Tampering | Move's no-reentrancy guarantee (transaction execution is single-threaded, no callbacks possible) eliminates this entire class. Only need to defend against in-tx state aliasing — handled by Move's borrow checker. |
| Front-running deploy → supply window | Spoofing | Seed transaction in `create_vault` closes the empty-vault window. Atomic with package publish (technically two txs: `sui client publish` + `vault::create_vault`; **between them, vault doesn't exist yet — no front-run target**). |

## Sources

### Primary (HIGH confidence)
- `contracts/Move.toml` — DeepBookV3 SHA pin, Sui CLI version, edition (verified by direct read 2026-05-09)
- `contracts/sources/svi_view.move` — Phase 1 entry signatures consumed by Phase 2 (verified by direct read)
- `contracts/sources/strategy_constants.move` — codegen output; existing fields + missing fields for Phase 2 (verified by direct read)
- `shared/strategy.toml` — token bucket section needs absolute u64 conversion (verified by direct read)
- `scripts/deepbookv3/packages/predict/sources/predict.move` lines 169-188 (`Predict` struct), 219-266 (`mint`), 285-297 (`redeem`), 437-468 (`supply`), 507-534 (`create`) (verified)
- `scripts/deepbookv3/packages/predict/sources/oracle.move` lines 58-66 (`OracleSVIUpdated`), 96-114 (`OracleSVI`), 220-282 (public accessors), 331 (`compute_price` is `public(package)`) (verified)
- `scripts/deepbookv3/packages/predict/sources/oracle_config.move` lines 200-209 (`assert_live_oracle` + 30s constant), 216-225 (`assert_quoteable_oracle`) (verified)
- `scripts/deepbookv3/packages/predict/sources/predict_manager.move` lines 31-114 (`PredictManager` struct + `new` + ownership) (verified)
- `scripts/deepbookv3/packages/predict/sources/market_key/market_key.move` lines 20-43 (`MarketKey` + constructors) (verified)
- `scripts/deepbookv3/packages/predict/sources/helper/rate_limiter.move` lines 24-120 (full token-bucket impl) (verified)
- `scripts/deepbookv3/packages/predict/sources/helper/constants.move` line 46 (`staleness_threshold_ms!() = 30_000`) (verified — strict 30s gate)
- `scripts/deepbookv3/packages/predict/sources/vault/plp.move` lines 12-25 (canonical OTW + `coin_registry::new_currency_with_otw` pattern) (verified)
- `scripts/deepbookv3/packages/predict/tests/helper/rate_limiter_tests.move` lines 140-200 (canonical clock-warping test patterns) (verified)
- `scripts/deepbookv3/.claude/rules/move.md` (Sui Move idioms enforced via PR review on the upstream repo) (verified)
- `scripts/deepbookv3/.claude/rules/unit-tests.md` (test discipline rules) (verified)
- `.github/workflows/ci.yml` (5-job matrix; Phase 2 adds 6th `e2e-vault` job) (verified)
- `.planning/research/PITFALLS.md` Pitfalls 4, 6, 8 (12 in PITFALLS, 13 token-bucket bugs), 9, 12, 14 (verified by direct read)
- `.planning/research/ARCHITECTURE.md` §2-§9 (verified)
- `.planning/research/STACK.md` (verified — npm versions captured 2026-05-08; updated in this research as of 2026-05-09 npm view)
- `.planning/phases/02-vault-move-package-testnet-deploy/02-CONTEXT.md` — 16 D-decisions (verified)
- npm registry queries 2026-05-09: `@mysten/sui` 2.16.2, `@mysten/dapp-kit` 1.0.6, `@mysten/deepbook-v3` 1.3.6 (verified via `npm view`)

### Secondary (MEDIUM confidence)
- [Sui Prover GitHub repo](https://github.com/asymptotic-code/sui-prover) — `#[spec(prove)]` syntax + `requires` + `ensures` + `clone!` (verified via WebFetch)
- [Sui Prover blog post](https://blog.sui.io/asymptotic-move-prover-formal-verification/) — vault share-price monotonicity citation (mentioned, not benchmarked) (cited)
- [kunalabs blog: Sui Prover developer perspective](https://blog.kunalabs.io/p/sui-prover-a-smart-contract-developers) — partial vault function spec example (cited)
- [Sui Currency Standard docs](https://docs.sui.io/standards/currency) — canonical `coin_registry::new_currency_with_otw` pattern (verified via WebFetch)
- [Sui Move Intro Course Unit Four](https://github.com/sui-foundation/sui-move-intro-course/blob/main/unit-four/lessons/1_homogeneous_collections.md) — Table iteration via parallel vector pattern (cited)
- [OpenZeppelin ERC-4626 v5 implementation](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/token/ERC20/extensions/ERC4626.sol) — virtual-shares + decimals_offset reference math (cited)
- [Sui Clock testing docs](https://docs.sui.io/references/framework/sui_sui/clock) — `increment_for_testing`, `set_for_testing` semantics (cited)

### Tertiary (LOW confidence — flagged for plan-time validation)
- Sui Prover runtime estimate (30s-5min per spec) — anecdotal from blog posts; **first plan execution should benchmark and adjust nightly job cron schedule**.
- `PendingTreasury` bridge pattern — synthesized; **Wave 0 spike can validate by writing the actual `init` + `create_vault` flow and running `sui move test`**.
- AdminCap-controlled `PredictManager` ownership — **Open Question #1 above; CRITICAL spike**.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all Move deps already pinned + verified by file reads + npm registry queries.
- Architecture patterns: MEDIUM-HIGH — Patterns 1, 2, 4, 5 are direct clones/ports of audited code; Patterns 3, 6 are synthesized but well-grounded in vendored examples.
- Pitfalls: HIGH — three of six are direct citations from PITFALLS.md (load-bearing); three are domain-specific extensions documented with mitigations.
- **Open Question #1 (PredictManager ownership):** LOW confidence on resolution path — this is the single biggest risk to Phase 2 plan, and the planner should make it the FIRST Wave 0 spike before any vault module is written.

**Research date:** 2026-05-09
**Valid until:** 2026-05-16 (7 days; revisit after Monday 2026-05-12 Predict-diff sweep — if SHA bumps, the entire vendored-clone surface needs re-validation).
