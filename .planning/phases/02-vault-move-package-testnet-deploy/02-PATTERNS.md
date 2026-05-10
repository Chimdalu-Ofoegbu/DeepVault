# Phase 2: Vault Move Package + Testnet Deploy - Pattern Map

**Mapped:** 2026-05-09
**Files analyzed:** 14 (12 new, 2 modified)
**Analogs found:** 14 / 14 (every file has a strong vendored or in-repo analog)

This map binds each file Phase 2 will create or modify to a concrete analog
already audited in `scripts/deepbookv3/packages/predict/sources/` (vendored at
SHA `1159d79af33c70e09e406310e1d8f067832ede9d`) or in
`contracts/sources/` (Phase 0/1 deliverables). Citations use
`path:line-range` so the planner can copy idioms directly. **All Move modules
must follow `scripts/deepbookv3/.claude/rules/move.md` and `unit-tests.md`** —
notably: module-label syntax (`module pkg::mod;`), `EPascalCase` error
constants, `public(package)` over `public entry` where composable, `assert_eq!`
in tests, no `test_` prefix, capabilities suffixed `Cap`, events past-tense.

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `contracts/sources/vault.move` | shared-object module + capability custodian | state-custody (lifecycle: create → share) | `scripts/deepbookv3/packages/predict/sources/predict.move` (Predict struct + create + share_object) | exact |
| `contracts/sources/share.move` | capability-quarantine OTW module | one-shot init (OTW → currency → PendingTreasury) | `scripts/deepbookv3/packages/predict/sources/vault/plp.move` | exact |
| `contracts/sources/supply.move` | math/business-logic module | request-response (Coin in → shares + atomic hedge out) | `scripts/deepbookv3/packages/predict/sources/predict.move:437-468` (`predict::supply` PLP path) | role-match |
| `contracts/sources/redeem.move` | math/business-logic module | event-driven (request escrow → cooldown → fulfill drain) | `scripts/deepbookv3/packages/predict/sources/predict.move:474-502` (`predict::withdraw`) + `helper/rate_limiter.move` | role-match |
| `contracts/sources/rebalance.move` | thin-adapter / orchestration module | request-response + iteration (mint hedge; iterate registry on roll) | `scripts/deepbookv3/packages/predict/sources/predict.move:219-266` (`predict::mint`) | role-match |
| `contracts/sources/ltv.move` | pure math/view module | read-only computation (vault state → u64) | `contracts/sources/svi_view.move` (Phase 1 in-repo style guide) | role-match |
| `contracts/sources/predict_adapter.move` | thin-adapter module | request-response (single-file blast radius wrapper) | `contracts/sources/svi_view.move` (single-file ABI containment for OracleSVI) | role-match |
| `contracts/sources/helpers/rate_limiter.move` | utility module (cloned) | state-machine refill | `scripts/deepbookv3/packages/predict/sources/helper/rate_limiter.move` | exact (line-for-line clone) |
| `contracts/specs/inflation_safe.move` | test/spec module (Sui Prover) | property assertion | None in-repo. External: asymptotic-code/sui-prover README | new pattern |
| `contracts/specs/nav_monotone.move` | test/spec module (Sui Prover) | property assertion | None in-repo (same as above) | new pattern |
| `contracts/specs/capability_containment.move` | test/spec module (Sui Prover) + grep CI | structural property | None in-repo (same as above) | new pattern |
| `scripts/e2e-vault-cycle.sh` | infra/CI script (Bash + sui client) | sequential transaction driver | `.github/workflows/ci.yml` (Phase 0 install pattern) + `@mysten/sui` Transaction docs | role-match |
| `.github/workflows/ci.yml` (modified) | infra/CI module | job-graph definition | `.github/workflows/ci.yml` itself (extend the 5-job matrix) | exact |
| `.github/workflows/nightly-prover.yml` (NEW) | infra/CI module | cron job | `.github/workflows/ci.yml` `move` job (copy install steps) | role-match |
| `shared/strategy.toml` (modified) | codegen/config module | input-only | itself (extend the `[token_bucket]` section) | exact |
| `scripts/codegen.py` (modified) | codegen/config module | TOML → Move/Python/TS emit | itself (extend `emit_move`/`emit_python`/`emit_typescript`) | exact |

**Total:** 12 new files + 4 modified existing files.

---

## Pattern Assignments

### `contracts/sources/vault.move` (shared-object + capability custodian, lifecycle)

**Analog:** `scripts/deepbookv3/packages/predict/sources/predict.move` (struct + `create` + `share_object`).

**Imports pattern** — copy module-label syntax + grouped imports
(`predict.move:1-34`):

```move
// Copyright (c) DeepVault.
// SPDX-License-Identifier: MIT

/// Shared Vault<Quote> object. Custodian of TreasuryCap<SHARE>, AdminCap,
/// hedge registry, per-user RateLimiters, and per-user RequestSlots.
module deepvault::vault;

use deepvault::{share::SHARE, strategy_constants};
use deepvault::helpers::rate_limiter::RateLimiter;
use deepbook_predict::market_key::MarketKey;
use sui::{
    balance::{Self, Balance},
    coin::{Self, Coin, TreasuryCap},
    clock::Clock,
    event,
    table::{Self, Table},
};
```

**Error-code preamble** — copy in-repo style from
`contracts/sources/svi_view.move:30-35` (one block of `EPascalCase` constants
near top of file, no value collisions):

```move
const ESeedAmountMismatch: u64 = 100;
const EAlreadyInitialized: u64 = 101;
const ESupplyPaused: u64 = 102;
const EBadDeadAddress: u64 = 103;
const ENotAdmin: u64 = 104;
```

**Shared-object struct** — clone the field-comment style from
`predict.move:168-187`:

```move
/// Main shared object for the DeepVault PLP+Hedge product.
public struct Vault<phantom Quote> has key {
    id: UID,
    /// TreasuryCap quarantined here; never returned by reference outside this package.
    treasury_cap: TreasuryCap<SHARE>,
    /// Quote-asset reserve (DUSDC on testnet).
    balance: Balance<Quote>,
    /// Total deposit-equivalent quote backing minted shares (incl. seed).
    total_assets: u64,
    /// Outstanding share supply (incl. virtual-shares burned to @0xdead).
    total_shares: u64,
    /// When true, supply is halted; redeems and rolls keep flowing (D-10).
    paused: bool,
    /// Open-hedge registry keyed by MarketKey (Pattern 5: avoids ID synthesis).
    hedges: Table<MarketKey, HedgePosition>,
    /// Parallel iteration index (Sui pattern; Table has no iterator).
    hedge_keys: vector<MarketKey>,
    /// Per-user withdrawal rate limiters.
    user_buckets: Table<address, RateLimiter>,
    /// Per-user redemption request slots (1-per-user; D-02).
    user_requests: Table<address, RequestSlot>,
    /// PredictManager shared-object ID (resolved at create_vault time).
    predict_manager_id: ID,
    /// AdminCap-mutable display-only oracle staleness; Predict's hard 30s gate is unaffected.
    max_staleness_seconds: u64,
}
```

**AdminCap pattern** — `key`-only (no `store`) so it cannot be
`public_transfer`'d (research §"AdminCap theft"). Compare to Predict's
mintable `OracleSVICap` (`oracle.move`) — that one DOES have `store` because
it's transferable to oracle operators. Vault's AdminCap is intentionally bound:

```move
public struct AdminCap has key { id: UID }
```

**Lifecycle / share pattern** — direct port of `predict.move:507-534`
(`create`):

```move
public(package) fun create_vault<Quote>(
    pending: PendingTreasury,
    seed: Coin<Quote>,
    predict: &mut deepbook_predict::predict::Predict,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let PendingTreasury { id: pending_id, cap } = pending;
    pending_id.delete();

    assert!(seed.value() == strategy_constants::seed_quote_micro_units(), ESeedAmountMismatch);

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

    // Mint seed shares (= virtual-shares decimals_offset = 10^6) burned to @0xdead.
    let seed_shares = coin::mint(&mut vault.treasury_cap, strategy_constants::virtual_shares(), ctx);
    transfer::public_transfer(seed_shares, @0xdead);

    vault.balance.join(seed.into_balance());
    vault.total_assets = strategy_constants::seed_quote_micro_units();
    vault.total_shares = strategy_constants::virtual_shares();

    transfer::transfer(AdminCap { id: object::new(ctx) }, ctx.sender());
    transfer::share_object(vault);
}
```

**Event pattern** — past-tense names (per `move.md` "Events Should Be Named in
Past Tense"); structs `has copy, drop, store`; emit via `event::emit`.
Compare `predict.move:50-62` (`PositionMinted`):

```move
public struct Supplied has copy, drop, store {
    vault_id: ID,
    depositor: address,
    deposit_quote: u64,
    shares_minted: u64,
}
public struct Paused has copy, drop, store { vault_id: ID, paused: bool }
public struct AdminOverride has copy, drop, store { vault_id: ID, old_value: u64, new_value: u64 }
public struct AdminTune has copy, drop, store { vault_id: ID, key: std::string::String, old_value: u64, new_value: u64 }
public struct AdminUnwind has copy, drop, store { vault_id: ID, market_key: MarketKey }
```

---

### `contracts/sources/share.move` (capability-quarantine OTW module)

**Analog:** `scripts/deepbookv3/packages/predict/sources/vault/plp.move:1-30`
(complete file). RESEARCH.md Pattern 1 says clone this directly with one
deviation: bridge the TreasuryCap via `PendingTreasury` so it never enters
deployer's wallet as a free `TreasuryCap<SHARE>`.

**Excerpt to clone** (`plp.move:6-25`):

```move
module deepbook_predict::plp;

use sui::coin_registry;

public struct PLP has drop {}

fun init(witness: PLP, ctx: &mut TxContext) {
    let (initializer, treasury_cap) = coin_registry::new_currency_with_otw(
        witness,
        6,
        b"PLP".to_string(),
        b"Predict LP".to_string(),
        b"LP token representing shares in the DeepBook Predict vault".to_string(),
        b"".to_string(),
        ctx,
    );
    let metadata_cap = initializer.finalize(ctx);
    transfer::public_transfer(metadata_cap, ctx.sender());
    transfer::public_transfer(treasury_cap, ctx.sender());
}
```

**DeepVault adaptation** — substitute decimals (9 per Phase 0 D-13), symbol
(`dvUSDC`), and replace the final `treasury_cap` transfer with the
`PendingTreasury` bridge wrapper so `create_vault` is the only path that can
unwrap it:

```move
module deepvault::share;

use sui::coin_registry;

public struct SHARE has drop {}

public struct PendingTreasury has key, store {
    id: UID,
    cap: sui::coin::TreasuryCap<SHARE>,
}

fun init(witness: SHARE, ctx: &mut TxContext) {
    let (initializer, treasury_cap) = coin_registry::new_currency_with_otw(
        witness,
        9,
        b"dvUSDC".to_string(),
        b"DeepVault dvUSDC".to_string(),
        b"Vault share for DeepVault PLP+Hedge".to_string(),
        b"".to_string(),
        ctx,
    );
    let metadata_cap = initializer.finalize(ctx);
    transfer::public_transfer(metadata_cap, ctx.sender());
    transfer::public_transfer(
        PendingTreasury { id: object::new(ctx), cap: treasury_cap },
        ctx.sender(),
    );
}

#[test_only]
public fun init_for_testing(ctx: &mut TxContext) { init(SHARE {}, ctx); }
```

**`init_for_testing` pattern** mirrors `plp.move:27-30`.

---

### `contracts/sources/supply.move` (entry + virtual-shares math)

**Analog:** `scripts/deepbookv3/packages/predict/sources/predict.move:437-468`
(`predict::supply`, the closest existing PLP-style mint flow). DeepVault's
supply differs in two ways: virtual-shares math (vs. 1:1 first-deposit) and
atomic hedge purchase appended after share mint.

**Imports + entry signature** — `predict.move:437-442` shape:

```move
module deepvault::supply;

use deepvault::{vault::{Self, Vault}, rebalance, strategy_constants};
use deepvault::helpers::math;
use sui::{coin::{Self, Coin}, clock::Clock, event};

const ESupplyPaused: u64 = 200;
const EZeroSharesMinted: u64 = 201;
const EShareOverflow: u64 = 202;

public fun supply<Quote>(
    vault: &mut Vault<Quote>,
    predict: &mut deepbook_predict::predict::Predict,
    predict_manager: &mut deepbook_predict::predict_manager::PredictManager,
    oracle: &deepbook_predict::oracle::OracleSVI,
    deposit: Coin<Quote>,
    clock: &Clock,
    ctx: &mut TxContext,
)
```

> Note: per `move.md` "No `public entry`, Only `public` or `entry`" — choose
> `public fun` (composable) or `entry fun` (intentionally non-composable).
> RESEARCH.md Pattern 3 picks `public fun` for v1 to keep PTB chaining open.

**Core CRUD pattern** — clone the supply→state-update→event flow from
`predict.move:443-467`:

```move
let amount = deposit.value();
assert!(!vault::is_paused(vault), ESupplyPaused);
assert!(amount > 0, /* EZeroAmount */);

let shares_to_mint = compute_shares_to_mint(vault, amount);
assert!(shares_to_mint > 0, EZeroSharesMinted);

// Split: 90% to vault.balance, 10% to hedge purchase (Phase 0 D-01).
let hedge_alloc_bps = strategy_constants::allocation_bps();
let mut deposit_balance = deposit.into_balance();
let hedge_balance = deposit_balance.split(
    math::mul_div_round_down(amount, hedge_alloc_bps, 10000)
);

// Atomic hedge purchase — aborts whole tx if Predict's 30s staleness gate fires.
rebalance::buy_hedge_for_deposit<Quote>(
    vault, predict, predict_manager, oracle,
    hedge_balance.into_coin(ctx), clock, ctx,
);

vault::update_balance_and_shares<Quote>(vault, deposit_balance, shares_to_mint);
let share_coin = coin::mint(vault::treasury_cap_mut(vault), shares_to_mint, ctx);
transfer::public_transfer(share_coin, ctx.sender());

event::emit(Supplied { vault_id: object::id(vault), depositor: ctx.sender(),
    deposit_quote: amount, shares_minted: shares_to_mint });
```

**Virtual-shares math** — u128-intermediate pattern from
`predict.move:451-457` extended to use `total_assets + 1` denominator
(OpenZeppelin ERC-4626 v5):

```move
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

**Validation pattern** — `predict.move:443-446` `assert!(amount > 0, EZeroAmount)`
+ `predict.treasury_config.assert_quote_asset<Quote>()`. DeepVault's vault
generic-on-`Quote` makes the type already correct; only the value-positivity
guard is needed.

---

### `contracts/sources/redeem.move` (request/fulfill/cancel + token-bucket)

**Analog (queue mechanics):** `scripts/deepbookv3/packages/predict/sources/predict.move:474-502`
(`predict::withdraw` — closest single-step redeem flow).
**Analog (rate limiter integration):** `predict.move:492` —
`predict.withdrawal_limiter.consume(amount, clock)`.

**Two-step queue with per-user RequestSlot** — no direct in-repo analog;
synthesize from D-01..D-04:

```move
public struct RequestSlot has copy, drop, store {
    shares_escrowed: u64,
    request_timestamp_ms: u64,
    claimed_so_far: u64,
}

const ERequestExists: u64 = 300;
const ERequestMissing: u64 = 301;
const ECooldownNotMet: u64 = 302;
const EInsufficientLiquidity: u64 = 303;

const COOLDOWN_MS: u64 = 3_600_000; // 1 hour, D-01

public fun redeem_request<Quote>(
    vault: &mut Vault<Quote>,
    shares: Coin<SHARE>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let user = ctx.sender();
    assert!(!vault::user_requests(vault).contains(user), ERequestExists);

    let slot = RequestSlot {
        shares_escrowed: shares.value(),
        request_timestamp_ms: clock.timestamp_ms(),
        claimed_so_far: 0,
    };
    vault::add_user_request(vault, user, slot);
    // Escrow shares inside the vault by storing the Coin in a side table or burning
    // and re-minting on cancel; simpler: hold Coin<SHARE> in the slot via
    // a separate Table<address, Coin<SHARE>> field on Vault.
    vault::escrow_shares(vault, user, shares);

    event::emit(RedeemRequested { vault_id: object::id(vault), user,
        shares: slot.shares_escrowed });
}
```

**Token-bucket consume pattern** — directly clone
`predict.move:492` with per-user lookup substituted for the global limiter:

```move
public fun redeem_fulfill<Quote>(
    vault: &mut Vault<Quote>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let user = ctx.sender();
    assert!(vault::user_requests(vault).contains(user), ERequestMissing);

    let now_ms = clock.timestamp_ms();
    let slot = vault::user_request(vault, user);
    assert!(now_ms - slot.request_timestamp_ms >= COOLDOWN_MS, ECooldownNotMet);

    let nav_per_share = vault::nav_per_share<Quote>(vault); // see ltv.move
    let pro_rata = math::mul_div_round_down(
        slot.shares_escrowed - slot.claimed_so_far,
        nav_per_share,
        strategy_constants::nav_scale(), // 1e9 fixed-point
    );

    let bucket = vault::user_bucket_mut(vault, user, clock);
    let bucket_avail = deepvault::helpers::rate_limiter::available_withdrawal(bucket, clock);
    let liquid = vault::balance_value(vault);
    let payout = math::min(pro_rata, math::min(bucket_avail, liquid));
    assert!(payout > 0, EInsufficientLiquidity);

    deepvault::helpers::rate_limiter::consume(bucket, payout, clock);
    let coin = vault::dispense_payout<Quote>(vault, payout, ctx);
    transfer::public_transfer(coin, user);

    event::emit(RedeemFulfilled { vault_id: object::id(vault), user, paid: payout });
}
```

**Error-code naming** — follows code-review rule "Error constant names must
cover all cases they guard against": `ECooldownNotMet`, `EInsufficientLiquidity`
are correctly neutral (not e.g. `ETooSoon`).

---

### `contracts/sources/rebalance.move` (buy_hedge_for_deposit + roll_expiring)

**Analog (mint flow):** `scripts/deepbookv3/packages/predict/sources/predict.move:219-266`
(`predict::mint`).
**Analog (iteration on Table+vector):** none in vendored Predict — Sui Move
Intro Course pattern. RESEARCH.md Pattern 5.

**Imports + non-composable thin-wrapper signature** — match `predict.move:219-227`:

```move
module deepvault::rebalance;

use deepvault::{vault::{Self, Vault}, predict_adapter, svi_view, strategy_constants};
use deepvault::helpers::math;
use deepbook_predict::{
    market_key::{Self, MarketKey},
    oracle::OracleSVI,
    predict::Predict,
    predict_manager::PredictManager,
};
use sui::{coin::{Self, Coin}, clock::Clock, event};

const EHedgeRegistryFull: u64 = 400;
const EPredictMisquote: u64 = 401;

public(package) fun buy_hedge_for_deposit<Quote>(
    vault: &mut Vault<Quote>,
    predict: &mut Predict,
    predict_manager: &mut PredictManager,
    oracle: &OracleSVI,
    hedge_alloc: Coin<Quote>,
    clock: &Clock,
    ctx: &mut TxContext,
)
```

**Core mint pattern** — copy `predict.move:236-265` shape (read forward,
construct MarketKey, call mint, capture cost, emit event):

```move
let forward = deepbook_predict::oracle::forward_price(oracle);
let strike = math::mul_div_round_down(
    forward,
    10_000 - strategy_constants::strike_otm_bps(), // -15% OTM (D-02)
    10_000,
);
let expiry_ms = clock.timestamp_ms() + strategy_constants::tenor_seconds() * 1000;

// Theoretical fair value via Phase 1 evaluator (single-file ABI surface).
let fair_value = svi_view::binary_price(oracle, strike);

// Predict mis-quote abstain (RESEARCH.md Pitfall 2) — read ask before mint.
let key = market_key::down(deepbook_predict::oracle::id(oracle), expiry_ms, strike);
let (predict_ask, _) = deepbook_predict::predict::get_trade_amounts(
    predict, oracle, key, /*qty*/ 1, clock,
);
let max_premium_bps = strategy_constants::max_price_premium_bps();
assert!(
    (predict_ask as u128) * 10_000u128
        <= (fair_value as u128) * ((10_000 + max_premium_bps) as u128),
    EPredictMisquote,
);

let quantity = math::mul_div_round_down(hedge_alloc.value(), 10_000_000_000, predict_ask);
predict_adapter::mint<Quote>(predict, predict_manager, oracle, key, quantity, clock, ctx);

vault::insert_or_consolidate_hedge(vault, key, /*notional=*/quantity, /*cost=*/hedge_alloc.value());
balance::destroy_zero(hedge_alloc.into_balance()); // expect zero residual; or actually pay manager

event::emit(HedgeMinted { vault_id: object::id(vault), market_key: key,
    quantity, cost_basis_quote: hedge_alloc.value(), strike, expiry_ms });
```

**Iteration pattern for `roll_expiring`** — Sui Move Intro Course (no direct
vendored example):

```move
public fun roll_expiring<Quote>(
    vault: &mut Vault<Quote>,
    predict: &mut Predict,
    predict_manager: &mut PredictManager,
    oracle: &OracleSVI,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let now_ms = clock.timestamp_ms();
    let trigger_ms = strategy_constants::roll_trigger_seconds() * 1000;

    // First pass: identify expiring keys (no mutation of Table during scan).
    let n = vault::hedge_keys_len(vault);
    let mut to_roll = vector[];
    let mut i = 0;
    while (i < n) {
        let key = *vault::hedge_key_at(vault, i);
        let h = vault::hedge_at(vault, key);
        if (h.expiry_ms < now_ms + trigger_ms) {
            vector::push_back(&mut to_roll, key);
        };
        i = i + 1;
    };

    // Second pass: redeem old + mint new at fresh fair value.
    to_roll.do!(|old_key| {
        let old = vault::remove_hedge(vault, old_key);
        predict_adapter::redeem<Quote>(predict, predict_manager, oracle, old_key,
            old.quantity, clock, ctx);
        // Mint replacement (recurse via internal helper)…
        event::emit(HedgeRolled { vault_id: object::id(vault), old_key, /* new_key */ });
    });
}
```

> Use the `vector::do!` macro per `move.md` "Do Operation on Every Element of
> a Vector" — not a hand-rolled `while`.

---

### `contracts/sources/ltv.move` (worst_case_haircut + nav)

**Analog:** `contracts/sources/svi_view.move` (in-repo style guide for pure
read-only modules).

**Imports + module doc style** — `svi_view.move:1-28`:

```move
// Copyright (c) DeepVault.
// SPDX-License-Identifier: MIT
//
// Pure view module: NAV per share + worst-case haircut for Margin LTV.
// Read-only; never holds caps; no event emission.

module deepvault::ltv;

use deepvault::{vault::{Self, Vault}, strategy_constants};
use deepvault::helpers::math;
```

**Pure-function pattern** — clone `svi_view.move:46-94` shape (single public
function, internal helper for shared math):

```move
const EZeroShares: u64 = 500;

const NAV_SCALE: u64 = 1_000_000_000; // 1e9, matches Phase 1 D-14/D-15.

public fun nav_per_share<Quote>(vault: &Vault<Quote>): u64 {
    let total_shares = vault::total_shares(vault);
    assert!(total_shares > 0, EZeroShares);
    // NAV in quote micro-units; output scaled by 1e9 to match dashboard.
    math::mul_div_round_down(vault::total_assets(vault), NAV_SCALE, total_shares)
}

public fun worst_case_nav_per_share<Quote>(vault: &Vault<Quote>): u64 {
    let total_shares = vault::total_shares(vault);
    assert!(total_shares > 0, EZeroShares);
    // D-14 pessimistic: all open hedges expire worthless → only liquid balance counts.
    math::mul_div_round_down(vault::balance_value(vault), NAV_SCALE, total_shares)
}
```

**Validation pattern** — `svi_view.move:75-87` style: assert all inputs
positive, then compute. Math comments must match the function called
(per `code-review.md` "Math comments must match the actual function being
called"): write `total_assets * NAV_SCALE / total_shares`, never an invented
two-step.

---

### `contracts/sources/predict_adapter.move` (thin wrapper over Predict ABI)

**Analog:** `contracts/sources/svi_view.move` (Phase 1's single-file
ABI containment for OracleSVI — same blast-radius pattern, applied to
predict::mint/redeem now).

**Module doc explaining blast-radius** — clone `svi_view.move:1-17` shape:

```move
// Copyright (c) DeepVault.
// SPDX-License-Identifier: MIT
//
// Single-file blast radius for predict::mint / predict::redeem ABI churn
// (PITFALLS.md Pitfall 6). All vault modules go through this adapter; if
// Mysten changes the predict signature, this is the ONE file that needs
// updating.
//
// Source: scripts/deepbookv3/packages/predict/sources/predict.move:219-297
// SHA: 1159d79af33c70e09e406310e1d8f067832ede9d
module deepvault::predict_adapter;

use deepbook_predict::{
    market_key::MarketKey,
    oracle::OracleSVI,
    predict::{Self, Predict},
    predict_manager::PredictManager,
};
use sui::{clock::Clock};
```

**Wrapper pattern** — direct passthrough; no logic added (the value is the
indirection itself):

```move
public(package) fun mint<Quote>(
    predict: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    key: MarketKey,
    quantity: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    predict::mint<Quote>(predict, manager, oracle, key, quantity, clock, ctx);
}

public(package) fun redeem<Quote>(
    predict: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    key: MarketKey,
    quantity: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    predict::redeem<Quote>(predict, manager, oracle, key, quantity, clock, ctx);
}
```

> **Note on PredictManager ownership** (RESEARCH.md Open Question #1):
> `predict::mint` asserts `ctx.sender() == manager.owner()` at
> `predict.move:228`. The adapter does NOT add logic to bypass — that
> resolution lives in the Wave 0 spike. The adapter just forwards.

---

### `contracts/sources/helpers/rate_limiter.move` (cloned utility)

**Analog:** `scripts/deepbookv3/packages/predict/sources/helper/rate_limiter.move`
(complete file). RESEARCH.md "Don't Hand-Roll" table mandates clone.

**Excerpt to copy line-for-line** — `rate_limiter.move:24-67` (struct + accessors
+ `available_withdrawal` u128 overflow protection):

```move
public struct RateLimiter has store {
    available: u64,
    last_updated_ms: u64,
    capacity: u64,
    refill_rate_per_ms: u64,
    enabled: bool,
}

public(package) fun available_withdrawal(self: &RateLimiter, clock: &Clock): u64 {
    if (!self.enabled) return std::u64::max_value!();
    let elapsed = elapsed_ms(self.last_updated_ms, clock);
    let refill_amount = (elapsed as u128) * (self.refill_rate_per_ms as u128);
    let new_available = (self.available as u128) + refill_amount;
    new_available.min(self.capacity as u128) as u64
}
```

**Consume + refill pattern** — `rate_limiter.move:84-107`:

```move
public(package) fun consume(self: &mut RateLimiter, amount: u64, clock: &Clock) {
    if (!self.enabled || amount == 0) return;
    self.refill(clock);
    assert!(amount <= self.capacity, EExceedsCapacity);
    assert!(amount <= self.available, EInsufficientWithdrawalBudget);
    self.available = self.available - amount;
}
```

**Cloning rules:**
- Module path becomes `deepvault::helpers::rate_limiter`.
- Keep `public(package)` visibility — this matches the in-repo `helpers/math.move`
  visibility pattern (see `contracts/sources/helpers/math.move:14-22`).
- Add MIT/Apache header pointing to source SHA — the same pattern
  `contracts/sources/helpers/math.move:1-12` uses.
- Test-only helpers (`new_for_testing`, `destroy_for_testing`) carry over.

---

### `contracts/specs/inflation_safe.move`, `nav_monotone.move`, `capability_containment.move`

**Analog:** None in-repo. External: asymptotic-code/sui-prover README pattern
(RESEARCH.md Pattern 6).

**Spec syntax** (synthesized from RESEARCH.md and Sui Prover docs):

```move
module deepvault::specs::nav_monotone;

use deepvault::{vault::Vault, supply};
use deepvault::strategy_constants;
use sui::{coin::Coin, clock::Clock};

#[spec(prove)]
fun nav_monotone_after_supply_spec<Quote>(
    vault: &mut Vault<Quote>,
    predict: &mut deepbook_predict::predict::Predict,
    predict_manager: &mut deepbook_predict::predict_manager::PredictManager,
    oracle: &deepbook_predict::oracle::OracleSVI,
    deposit: Coin<Quote>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    requires(deposit.value() > 0);
    requires(vault.total_shares() > 0);
    requires(vault.total_assets() > 0);

    let old = clone!(vault);
    let old_nav_x9 = (old.total_assets() as u128) * 1_000_000_000u128
        / (old.total_shares() as u128);

    supply::supply(vault, predict, predict_manager, oracle, deposit, clock, ctx);

    let new_nav_x9 = (vault.total_assets() as u128) * 1_000_000_000u128
        / (vault.total_shares() as u128);

    ensures(new_nav_x9 + hedge_cost_tolerance_x9() >= old_nav_x9);
}
```

**Capability-containment grep CI** — RESEARCH.md says ship grep + spec. Bash
analog from `.github/workflows/ci.yml:222-234` (forbidden-token grep on TS
evaluator):

```yaml
- name: Capability containment grep
  run: |
    set -euo pipefail
    if grep -nE 'public fun .*: (&?(mut )?TreasuryCap|&?(mut )?AdminCap)' \
        contracts/sources/*.move | grep -v '_test.move'; then
      echo "::error::A public function exposes TreasuryCap/AdminCap by reference."
      exit 1
    fi
```

---

### `scripts/e2e-vault-cycle.sh` (E2E testnet cycle)

**Analog:** `.github/workflows/ci.yml:34-49` (Sui CLI install) +
`@mysten/sui` Transaction-builder docs.

**Sui CLI install pattern** — clone exactly (`ci.yml:37-49`):

```bash
SUI_VERSION="mainnet-v1.71.1"
ASSET="sui-${SUI_VERSION}-ubuntu-x86_64.tgz"
URL="https://github.com/MystenLabs/sui/releases/download/${SUI_VERSION}/${ASSET}"
curl -fsSL "${URL}" -o /tmp/sui.tgz
mkdir -p "$HOME/.sui/bin"
tar -xzf /tmp/sui.tgz -C "$HOME/.sui/bin"
export PATH="$HOME/.sui/bin:$PATH"
```

**Transaction shape** (from RESEARCH.md Pattern 3 + CLAUDE.md PTB
construction). Use `tx.sharedObjectRef({ objectId, mutable, initialSharedVersion })`:

```typescript
import { Transaction } from '@mysten/sui/transactions';

const tx = new Transaction();
tx.moveCall({
  target: `${DEEPVAULT_PKG}::supply::supply`,
  arguments: [
    tx.sharedObjectRef({ objectId: VAULT, mutable: true, initialSharedVersion: VAULT_INIT_VER }),
    tx.sharedObjectRef({ objectId: PREDICT, mutable: true, initialSharedVersion: PREDICT_INIT_VER }),
    tx.sharedObjectRef({ objectId: PREDICT_MANAGER, mutable: true, initialSharedVersion: PM_INIT_VER }),
    tx.sharedObjectRef({ objectId: ORACLE_SVI, mutable: false, initialSharedVersion: ORA_INIT_VER }),
    tx.object(DEPOSIT_COIN_ID),
    tx.object('0x6'),
  ],
  typeArguments: [QUOTE_TYPE_TAG],
});
```

---

### `.github/workflows/ci.yml` (modified — add `e2e-vault` job)

**Analog:** the file itself; copy the `move` job's Sui-install steps and add
a new job `e2e-vault` after `parity`.

**Excerpt (from `ci.yml:30-60`)** — copy the install + working-directory pattern:

```yaml
e2e-vault:
  name: E2E vault cycle (testnet)
  runs-on: ubuntu-latest
  needs: [move, parity]
  steps:
    - uses: actions/checkout@v4
    - name: Install Sui CLI (mainnet-v1.71.1)
      run: |
        SUI_VERSION="mainnet-v1.71.1"
        ASSET="sui-${SUI_VERSION}-ubuntu-x86_64.tgz"
        URL="https://github.com/MystenLabs/sui/releases/download/${SUI_VERSION}/${ASSET}"
        curl -fsSL "${URL}" -o /tmp/sui.tgz
        mkdir -p "$HOME/.sui/bin"
        tar -xzf /tmp/sui.tgz -C "$HOME/.sui/bin"
        echo "$HOME/.sui/bin" >> "$GITHUB_PATH"
    - name: Run E2E vault cycle
      env:
        TESTNET_KEY: ${{ secrets.TESTNET_E2E_KEY }}
      run: bash scripts/e2e-vault-cycle.sh
```

> Pattern: every CI job clones the `move` job's install block (compare
> `ci.yml:174-186` for the `parity` job's identical copy).

---

### `.github/workflows/nightly-prover.yml` (new file)

**Analog:** `.github/workflows/ci.yml` `move` job (copy install steps); cron
schedule synthesized from RESEARCH.md Pattern 6.

**Skeleton:**

```yaml
name: Nightly Sui Prover

on:
  schedule:
    - cron: '0 3 * * *'   # 03:00 UTC daily
  workflow_dispatch: {}

jobs:
  prover:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install Sui CLI (mainnet-v1.71.1)
        run: |
          # ... copy from ci.yml:37-49 ...
      - name: Install sui-prover
        run: |
          curl -L https://github.com/asymptotic-code/sui-prover/releases/latest/download/sui-prover-linux-x86_64 \
            -o /tmp/sui-prover && chmod +x /tmp/sui-prover && sudo mv /tmp/sui-prover /usr/local/bin/
      - name: Run prover
        working-directory: contracts
        run: sui-prover
```

---

### `shared/strategy.toml` (modified — `[token_bucket]` schema shift)

**Analog:** the file itself. RESEARCH.md says replace BPS framing with absolute
u64 micro-units to match `rate_limiter.move`'s field types (u64 absolute).

**Current** (`shared/strategy.toml:30-34`):

```toml
[token_bucket]
capacity_bps = 1000
refill_rate_bps_per_sec = 1
period_seconds = 3600
```

**Replace with** (per RESEARCH.md Pattern 4 + section "Token-bucket parameter
values"):

```toml
[token_bucket]
# Absolute u64 micro-units to match deepvault::helpers::rate_limiter.move
# (cloned from vendored Predict). Per CONTEXT.md D-05: AdminCap can retune.
capacity_quote_micro_units = 100_000_000          # 100 DUSDC at 6dp
refill_rate_quote_micro_units_per_ms = 1200       # ≈ capacity / 24h in ms

[inflation_defense]
# OpenZeppelin ERC-4626 v5 ports — referenced by vault::create_vault.
seed_quote_micro_units = 10_000_000               # 10 DUSDC at 6dp
virtual_shares = 1_000_000                         # 10^6 = decimals_offset

[hedge_policy]
# (existing fields preserved)
max_price_premium_bps = 50                        # NEW: Predict mis-quote abstain
```

---

### `scripts/codegen.py` (modified — emit new `[token_bucket]` keys)

**Analog:** the file itself. Edits go in `emit_move`, `emit_python`,
`emit_typescript`.

**Current Move emit** (`scripts/codegen.py:103-109`):

```python
parts.append("\n    // Token bucket\n")
parts.append(f"    public fun bucket_capacity_bps(): u64 {{ {tb['capacity_bps']} }}\n")
parts.append(
    f"    public fun bucket_refill_rate_bps_per_sec(): u64 "
    f"{{ {tb['refill_rate_bps_per_sec']} }}\n"
)
parts.append(f"    public fun bucket_period_seconds(): u64 {{ {tb['period_seconds']} }}\n")
```

**Replace with** (matching new TOML schema and adding inflation-defense block):

```python
parts.append("\n    // Token bucket (absolute u64; matches helper/rate_limiter.move)\n")
parts.append(
    f"    public fun token_bucket_capacity(): u64 "
    f"{{ {tb['capacity_quote_micro_units']} }}\n"
)
parts.append(
    f"    public fun token_bucket_refill_rate_per_ms(): u64 "
    f"{{ {tb['refill_rate_quote_micro_units_per_ms']} }}\n"
)
parts.append("\n    // Inflation defense (OpenZeppelin ERC-4626 v5)\n")
infl = data["inflation_defense"]
parts.append(f"    public fun seed_quote_micro_units(): u64 {{ {infl['seed_quote_micro_units']} }}\n")
parts.append(f"    public fun virtual_shares(): u64 {{ {infl['virtual_shares']} }}\n")
parts.append("\n    // NAV scale (matches Phase 1 D-14/D-15 1e9 fixed-point)\n")
parts.append("    public fun nav_scale(): u64 { 1_000_000_000 }\n")
parts.append(
    f"    public fun max_price_premium_bps(): u64 "
    f"{{ {hp.get('max_price_premium_bps', 50)} }}\n"
)
```

The Python and TypeScript emitters get parallel updates — same pattern as
`emit_python` (`scripts/codegen.py:157-162`) and `emit_typescript`
(`scripts/codegen.py:207-210`).

---

## Shared Patterns

### Authentication / Capability Discipline

**Source:** `scripts/deepbookv3/packages/predict/sources/predict.move:228, 294`
+ `predict_manager.move:75-83`
**Apply to:** All admin-gated functions in `vault.move`, all owner-gated
operations on PredictManager.

```move
// Pattern: cap-as-second-arg per move.md "Capabilities Go Second"
public fun admin_pause<Quote>(vault: &mut Vault<Quote>, _cap: &AdminCap, paused: bool) {
    vault.paused = paused;
    event::emit(Paused { vault_id: object::id(vault), paused });
}
```

> Capability ownership is enforced by Sui's transfer system, not by an
> `assert!(ctx.sender() == ...)` check inside the function. Holding `&AdminCap`
> as an argument is sufficient — Sui guarantees the caller owns the cap.

### Error Handling

**Source:** `contracts/sources/svi_view.move:30-35` +
`scripts/deepbookv3/packages/predict/sources/predict.move:36-46`
**Apply to:** All vault modules (top-of-file `EPascalCase` constants, value
ranges segregated per module so Move's abort-code-merge in tests is unique).

Suggested numbering convention (planner can adjust):
- `vault.move`: 100-199
- `supply.move`: 200-299
- `redeem.move`: 300-399
- `rebalance.move`: 400-499
- `ltv.move`: 500-599
- `predict_adapter.move`: (passthrough; relies on Predict's own codes)
- `share.move`: 700-799
- `helpers/rate_limiter.move`: cloned `EExceedsCapacity = 0`,
  `EInsufficientWithdrawalBudget = 1`, `EInvalidConfig = 2` (verbatim)

### Validation

**Source:** `scripts/deepbookv3/packages/predict/sources/predict.move:229-234`
**Apply to:** Every `entry` / `public fun` taking a value argument.

```move
assert!(!predict.trading_paused, ETradingPaused);    // pause first
assert!(quantity > 0, EZeroQuantity);                 // positivity
predict.treasury_config.assert_quote_asset<Quote>();  // type-tag whitelist (DV doesn't need this)
predict.oracle_config.assert_key_matches(oracle, &key);
oracle_config::assert_live_oracle(oracle, clock);     // 30s gate (inherited)
```

### Event Emission

**Source:** `scripts/deepbookv3/packages/predict/sources/predict.move:253-265`
**Apply to:** All state-mutating entry functions.

```move
event::emit(EventName {
    vault_id: object::id(vault),
    actor: ctx.sender(),
    /* relevant amounts */
});
```

Event names are past-tense (`Supplied`, not `Supply`) per `move.md` "Events
Should Be Named in Past Tense"; structs have `copy, drop, store`.

### Testing

**Source:** `scripts/deepbookv3/packages/predict/tests/helper/rate_limiter_tests.move:143-167`
+ `scripts/deepbookv3/.claude/rules/unit-tests.md` (loaded as context).

**Clock warping idiom** — `rate_limiter_tests.move:147-156`:

```move
let mut clock = clock::create_for_testing(ctx);
limiter.consume(TEST_CAPACITY, &clock);
clock.increment_for_testing(60_000);  // +60 seconds
limiter.consume(1, &clock);
assert_eq!(limiter.available(), expected_refill - 1);
limiter.destroy_for_testing();
clock.destroy_for_testing();
```

**Required test discipline (from `unit-tests.md`):**

1. **Never compute expected values via the function under test.** Use scipy /
   hand-calc / cross-runtime parity vectors. (Phase 1's
   `golden_vectors_data.move` is the model.)
2. **Cover every `E*` abort code with `expected_failure`.** No bare `expected_failure`
   — always `expected_failure(abort_code = module::EThing)`.
3. Use `assert_eq!`, never `assert!(... == ...)`.
4. Test names must NOT prefix `test_`. Module is already named `_test`.
5. Test names must match what the test verifies (code-review rule).
6. Clock-warped roll path test belongs in `rebalance_test.move` (per
   RESEARCH.md "Test: clock-warped roll path").

### Imports / Module Style

**Source:** `scripts/deepbookv3/.claude/rules/move.md` "Module Label",
"Imports", "Structs", "Functions" sections; `contracts/sources/svi_view.move`
already complies.

```move
// One-line module-label form (no nested braces).
module deepvault::xxx;

// Group imports with Self when the module token itself is also imported.
use deepvault::{vault::{Self, Vault}, share::SHARE};
use sui::{coin::{Self, Coin}, clock::Clock, event};
```

### Math Helpers

**Source:** `contracts/sources/helpers/math.move:14-33`.
**Apply to:** Any `mul-then-div` in supply/redeem/rebalance/ltv. Never inline
`(a * b) / c` with raw u64 — it overflows; always go through
`math::mul_div_round_down`. Round direction in comments must match the
function called (per `code-review.md`).

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `contracts/specs/{inflation_safe,nav_monotone,capability_containment}.move` | Sui Prover spec | property assertion | Sui Prover (asymptotic-code) is open-source since Jan 2026; no prior in-repo spec; vendored Predict has no `#[spec(prove)]` annotations. RESEARCH.md Pattern 6 synthesizes from external README — planner should treat first spec as a Wave-0 spike to verify `clone!()` works on a `key`-only Vault struct (RESEARCH.md Open Question #2). |
| `scripts/e2e-vault-cycle.sh` | bash + sui-client driver | sequential transactions | No prior bash scripts in `.github/workflows/` directly drive testnet; the closest pattern is the install steps in `ci.yml:34-60`. RESEARCH.md provides TS PTB pattern; bash side is glue. |
| `contracts/sources/redeem.move` two-step queue (`request → fulfill`) | math/business-logic | event-driven | No vendored two-step queue; Predict's `withdraw` (`predict.move:474-502`) is single-step. Synthesize from CONTEXT.md D-01..D-04. **Token-bucket consume + per-user storage IS analogous** (rate_limiter clone) — only the queue-state machine is new. |

---

## Cross-Referencing Locked Decisions to Patterns

For the planner: each CONTEXT.md decision maps to a single primary file.

| Decision | Primary file | Pattern excerpt |
|----------|-------------|-----------------|
| D-01 1h cooldown | `redeem.move` | `assert!(now_ms - slot.request_timestamp_ms >= COOLDOWN_MS, ECooldownNotMet)` |
| D-02 per-user request slot | `redeem.move` | `Table<address, RequestSlot>` |
| D-03 liquidity-short fulfill | `redeem.move` | `payout = min(pro_rata, bucket_avail, liquid)` |
| D-04 free cancel | `redeem.move` | `redeem_cancel` returns escrowed shares |
| D-05 token-bucket | `helpers/rate_limiter.move` (cloned) + `strategy.toml` `[token_bucket]` |
| D-06 atomic supply→hedge | `supply.move` calls `rebalance::buy_hedge_for_deposit` in same `public fun` |
| D-07 abort whole supply on mint failure | (no code; Move atomicity guarantees it) |
| D-08 permissionless roll | `rebalance::roll_expiring` (no AdminCap arg) |
| D-09 NAV via SVI fair value | `ltv.move` calls `svi_view::binary_price` (Phase 1) |
| D-10 pause halts supply only | `supply.move` checks `vault.paused`; `redeem.move` does NOT check |
| D-11 four AdminCap powers | `vault.move` `admin_pause` / `admin_oracle_staleness_override` / `admin_tune_strategy` / `admin_emergency_unwind` |
| D-12 cap non-transferable | `vault.move` `AdminCap has key` (no `store`) |
| D-13 no fees | (no code; absent fields prove decision) |
| D-14 worst-case haircut formula | `ltv.move::worst_case_nav_per_share` |
| D-15 1e9 fixed-point output | `ltv.move::NAV_SCALE = 1_000_000_000` |
| D-16 instantaneous worst case | `ltv.move` does NOT call `svi_view::binary_price` |

---

## Metadata

**Analog search scope:**
- `scripts/deepbookv3/packages/predict/sources/` (vendored at SHA `1159d79a`)
- `contracts/sources/` (Phase 0/1 deliverables)
- `.github/workflows/`
- `shared/`
- `scripts/`

**Files scanned:**
`predict.move`, `plp.move`, `helper/rate_limiter.move`,
`market_key/market_key.move`, `oracle_config.move`, `predict_manager.move`,
`svi_view.move`, `strategy_constants.move`, `phi_coefficients.move`,
`helpers/math.move`, `Move.toml`, `ci.yml`, `strategy.toml`, `codegen.py`,
plus `rate_limiter_tests.move` for test idioms.

**Project skill rules consulted:**
`scripts/deepbookv3/.claude/rules/move.md`,
`scripts/deepbookv3/.claude/rules/unit-tests.md`,
`scripts/deepbookv3/.claude/rules/code-review.md` (loaded as system context).

**Pattern extraction date:** 2026-05-09
