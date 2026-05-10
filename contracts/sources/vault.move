// Copyright (c) DeepVault.
// SPDX-License-Identifier: MIT
//
// Shared Vault<Quote> object — custodian of TreasuryCap<SHARE>, AdminCap,
// hedge registry, per-user RateLimiters, and per-user RequestSlots.
// Closes VAULT-01.
//
// Plan 02-03 W1 lock: the Vault<Quote> struct schema is FROZEN here. Plans
// 02-05 (redeem) and 02-06 (admin) MUST NOT add or remove fields — they may
// only add function bodies that read/mutate fields already declared.
//
// Plan 02-03 W2 lock: RequestSlot.shares_escrowed is `Balance<SHARE>`. The
// per-slot Balance is the authoritative store; `escrow_balance: Balance<SHARE>`
// on Vault is a sum-of-records mirror used by the dashboard.

/// DeepVault shared object + lifecycle.
module deepvault::vault;

use deepbook_predict::market_key::MarketKey;
use deepbook_predict::predict::{Self};
use deepvault::helpers::rate_limiter::RateLimiter;
use deepvault::share::{Self, SHARE, PendingTreasury};
use deepvault::strategy_constants;
use sui::balance::{Self, Balance};
use sui::coin::{Self, Coin, TreasuryCap};
use sui::event;
use sui::table::{Self, Table};

// === Errors ===
// Reserved 100-199 for vault.move per PATTERNS.md "Error Handling".

const ESeedAmountMismatch: u64 = 100;
#[allow(unused_const)]
const EAlreadyInitialized: u64 = 101;
#[allow(unused_const)]
const ENotPaused: u64 = 102;
#[allow(unused_const)]
const EZeroShares: u64 = 103;

// === Constants ===

const DEAD_ADDRESS: address = @0xdead;

// === Structs ===

/// Open-hedge registry entry. Keyed by `MarketKey` in the `hedges` Table
/// (RESEARCH.md Pattern 5 — avoids ID synthesis). `quantity` is the
/// position-shares returned by `predict::mint`.
public struct HedgePosition has copy, drop, store {
    oracle_id: ID,
    strike: u64,
    expiry_ms: u64,
    notional_quote: u64,
    cost_basis_quote: u64,
    quantity: u64,
}

/// Per-user redemption-request slot — W2 LOCKED form.
/// `shares_escrowed` is `Balance<SHARE>` (NOT `u64`); the balance lives
/// physically inside the slot. Cancel returns it directly via
/// `coin::from_balance`; partial fulfill uses `request_split_shares`.
public struct RequestSlot has store {
    /// Escrowed SHARE balance — backs every outstanding redeem request.
    shares_escrowed: Balance<SHARE>,
    /// Wall-clock millis at which redeem_request was called; D-01 cooldown = 1h.
    request_timestamp_ms: u64,
    /// Cumulative quote micro-units already paid out across multiple
    /// redeem_fulfill calls (D-03 partial-payout liquidity-short fulfill).
    claimed_so_far: u64,
}

/// Single-key, non-transferable in v1 (VAULT-08 D-12). `key`-only — no
/// `store` — so `transfer::public_transfer<T: store>` cannot apply. Only
/// `transfer::transfer` from inside this module can move it; that path is
/// gated by AdminCap-bearing functions in Plan 02-06.
public struct AdminCap has key { id: UID }

/// Main shared object — W1 LOCKED schema. ALL fields enumerated upfront.
/// Plans 02-05 and 02-06 add only function bodies; struct schema is FROZEN.
public struct Vault<phantom Quote> has key {
    id: UID,
    /// TreasuryCap<SHARE> quarantined as a private field (VAULT-02). Only
    /// `treasury_cap_mut` (public(package)) hands out a mutable reference.
    treasury_cap: TreasuryCap<SHARE>,
    /// Admin address — set at create_vault, immutable in v1 (D-12).
    admin: address,
    /// D-10: pause halts supply only; redeems and rolls always flow.
    paused: bool,
    /// Liquid quote balance (DUSDC on testnet, USDsui on mainnet).
    balance: Balance<Quote>,
    /// Sum-of-records mirror of all `RequestSlot.shares_escrowed`. Dashboards
    /// read this for the "total shares queued for redemption" panel without
    /// iterating request_slots.
    escrow_balance: Balance<SHARE>,
    /// D-02 per-user redeem-request slots — independent slot per address;
    /// no global queue.
    request_slots: Table<address, RequestSlot>,
    /// D-05 per-user token buckets — cloned helper in deepvault::helpers.
    rate_limiters: Table<address, RateLimiter>,
    /// Open-hedge registry keyed by MarketKey (RESEARCH.md Pattern 5).
    hedges: Table<MarketKey, HedgePosition>,
    /// Parallel iteration index — Sui Table has no native iterator.
    hedge_keys: vector<MarketKey>,
    /// PredictManager shared-object ID resolved at create_vault. Per
    /// WAVE0-DECISION.md option (b), suppliers own their own managers at
    /// supply-time; this stored ID is the deploy-time admin reference.
    predict_manager_id: ID,
    /// Cached for NAV math; mirrors `treasury_cap.total_supply()`.
    total_shares_supply: u64,
    /// Cached for NAV math; sum of `balance` + cost-basis of all open hedges.
    total_assets: u64,
    // === Six tunable_* runtime parameters (D-11.3 admin_tune_strategy targets). ===
    /// Token-bucket capacity (quote micro-units).
    tunable_token_bucket_capacity_quote_micro_units: u64,
    /// Token-bucket refill rate (quote micro-units per millisecond).
    tunable_token_bucket_refill_rate_quote_micro_units_per_ms: u64,
    /// Hedge allocation in basis points of deposit (e.g. 1000 = 10%).
    tunable_hedge_policy_allocation_bps: u64,
    /// Strike OTM offset in basis points (e.g. 1500 = 15% OTM).
    tunable_hedge_policy_strike_otm_bps: u64,
    /// Tenor in seconds (e.g. 1209600 = 14d).
    tunable_hedge_policy_tenor_seconds: u64,
    /// Oracle staleness threshold in seconds (e.g. 300 = 5min).
    tunable_oracle_max_staleness_seconds: u64,
}

// === Events ===

/// Emitted exactly once per vault at create_vault. Records the seed quote,
/// the seed shares burned to @0xdead, and the resolved PredictManager ID.
public struct VaultCreated has copy, drop, store {
    vault_id: ID,
    admin: address,
    seed_quote: u64,
    seed_shares_burned: u64,
    predict_manager_id: ID,
}

/// Wave 2 / Wave 3 plans emit these — declared empty here to lock the event
/// surface (per CONTEXT.md "Claude's Discretion: Event surface").

#[allow(unused_field)]
public struct Supplied has copy, drop, store {
    vault_id: ID,
    supplier: address,
    deposit_quote: u64,
    shares_minted: u64,
}

#[allow(unused_field)]
public struct RedeemRequested has copy, drop, store {
    vault_id: ID,
    user: address,
    shares: u64,
    timestamp_ms: u64,
}

#[allow(unused_field)]
public struct RedeemFulfilled has copy, drop, store {
    vault_id: ID,
    user: address,
    shares_burned: u64,
    quote_paid: u64,
}

#[allow(unused_field)]
public struct RedeemCanceled has copy, drop, store {
    vault_id: ID,
    user: address,
    shares_returned: u64,
}

#[allow(unused_field)]
public struct HedgeMinted has copy, drop, store {
    vault_id: ID,
    oracle_id: ID,
    strike: u64,
    expiry_ms: u64,
    notional_quote: u64,
    cost_basis_quote: u64,
}

#[allow(unused_field)]
public struct HedgeRolled has copy, drop, store {
    vault_id: ID,
    closed_oracle_id: ID,
    new_oracle_id: ID,
    new_strike: u64,
    new_expiry_ms: u64,
}

#[allow(unused_field)]
public struct HedgeUnwound has copy, drop, store {
    vault_id: ID,
    oracle_id: ID,
    payout_quote: u64,
}

#[allow(unused_field)]
public struct Paused has copy, drop, store {
    vault_id: ID,
    paused: bool,
}

#[allow(unused_field)]
public struct AdminOverride has copy, drop, store {
    vault_id: ID,
    old_value: u64,
    new_value: u64,
}

#[allow(unused_field)]
public struct AdminTune has copy, drop, store {
    vault_id: ID,
    key: vector<u8>,
    new_value: u64,
}

#[allow(unused_field)]
public struct AdminUnwind has copy, drop, store {
    vault_id: ID,
    oracle_id: ID,
}

// === Public Functions: Lifecycle ===

/// Deploy entry: consumes the PendingTreasury, performs the inflation-defense
/// seed transaction, shares the Vault, and mints AdminCap to the deployer.
///
/// Per Plan 02-03 W1 amendment, the six `tunable_*` runtime parameters are
/// initialized from `strategy_constants` defaults; Plan 02-06 adds the
/// `admin_tune_strategy` mutator.
///
/// Per WAVE0-DECISION.md option (b) — supplier-owned PredictManager — the
/// `predict_manager_id` recorded here is created via `predict::create_manager`
/// (the public entry, since `predict_manager::new` is `public(package)` and
/// unreachable from this package). Suppliers create their own manager at
/// supply-time; this stored ID is the deploy-time admin reference and is
/// surfaced to dashboards.
public fun create_vault<Quote>(
    pending: PendingTreasury,
    seed: Coin<Quote>,
    ctx: &mut TxContext,
) {
    let cap = share::consume_pending(pending);

    assert!(
        seed.value() == strategy_constants::seed_quote_micro_units(),
        ESeedAmountMismatch,
    );

    // Public Predict entry — `predict_manager::new` is package-internal so
    // we must go through `predict::create_manager` (Rule 3 plan-deviation:
    // the action body's `predict_manager::new(ctx)` is unreachable).
    let predict_manager_id = predict::create_manager(ctx);
    let admin_addr = ctx.sender();

    let mut vault = Vault<Quote> {
        id: object::new(ctx),
        treasury_cap: cap,
        admin: admin_addr,
        paused: false,
        balance: balance::zero(),
        escrow_balance: balance::zero(),
        request_slots: table::new(ctx),
        rate_limiters: table::new(ctx),
        hedges: table::new(ctx),
        hedge_keys: vector[],
        predict_manager_id,
        total_shares_supply: 0,
        total_assets: 0,
        tunable_token_bucket_capacity_quote_micro_units: strategy_constants::token_bucket_capacity(),
        tunable_token_bucket_refill_rate_quote_micro_units_per_ms: strategy_constants::token_bucket_refill_rate_per_ms(),
        tunable_hedge_policy_allocation_bps: strategy_constants::allocation_bps(),
        tunable_hedge_policy_strike_otm_bps: strategy_constants::strike_otm_bps(),
        tunable_hedge_policy_tenor_seconds: strategy_constants::tenor_seconds(),
        tunable_oracle_max_staleness_seconds: strategy_constants::max_staleness_seconds(),
    };

    // Inflation-defense seed: lock seed quote into balance, mint
    // virtual_shares SHARE coins, and burn them to @0xdead.
    let seed_amt = seed.value();
    vault.balance.join(seed.into_balance());
    vault.total_assets = seed_amt;

    let seed_shares_amt = strategy_constants::virtual_shares();
    let seed_shares = coin::mint(&mut vault.treasury_cap, seed_shares_amt, ctx);
    transfer::public_transfer(seed_shares, DEAD_ADDRESS);
    vault.total_shares_supply = seed_shares_amt;

    let vault_id = object::id(&vault);

    let admin_cap = AdminCap { id: object::new(ctx) };
    transfer::transfer(admin_cap, admin_addr);
    transfer::share_object(vault);

    event::emit(VaultCreated {
        vault_id,
        admin: admin_addr,
        seed_quote: seed_amt,
        seed_shares_burned: seed_shares_amt,
        predict_manager_id,
    });
}

// === Public Functions: Read Accessors ===

public fun is_paused<Quote>(self: &Vault<Quote>): bool { self.paused }

public fun total_assets<Quote>(self: &Vault<Quote>): u64 { self.total_assets }

public fun total_shares<Quote>(self: &Vault<Quote>): u64 { self.total_shares_supply }

public fun balance_value<Quote>(self: &Vault<Quote>): u64 { self.balance.value() }

public fun escrow_balance_value<Quote>(self: &Vault<Quote>): u64 { self.escrow_balance.value() }

public fun max_staleness_seconds<Quote>(self: &Vault<Quote>): u64 {
    self.tunable_oracle_max_staleness_seconds
}

public fun predict_manager_id<Quote>(self: &Vault<Quote>): ID { self.predict_manager_id }

public fun admin_address<Quote>(self: &Vault<Quote>): address { self.admin }

public fun hedge_keys_len<Quote>(self: &Vault<Quote>): u64 {
    vector::length(&self.hedge_keys)
}

public fun tunable_token_bucket_capacity<Quote>(self: &Vault<Quote>): u64 {
    self.tunable_token_bucket_capacity_quote_micro_units
}

public fun tunable_token_bucket_refill_rate<Quote>(self: &Vault<Quote>): u64 {
    self.tunable_token_bucket_refill_rate_quote_micro_units_per_ms
}

public fun tunable_hedge_alloc_bps<Quote>(self: &Vault<Quote>): u64 {
    self.tunable_hedge_policy_allocation_bps
}

public fun tunable_strike_otm_bps<Quote>(self: &Vault<Quote>): u64 {
    self.tunable_hedge_policy_strike_otm_bps
}

public fun tunable_tenor_seconds<Quote>(self: &Vault<Quote>): u64 {
    self.tunable_hedge_policy_tenor_seconds
}

// === HedgePosition Read Accessors ===

public fun hedge_expiry_ms(h: &HedgePosition): u64 { h.expiry_ms }
public fun hedge_quantity(h: &HedgePosition): u64 { h.quantity }
public fun hedge_strike(h: &HedgePosition): u64 { h.strike }
public fun hedge_notional(h: &HedgePosition): u64 { h.notional_quote }
public fun hedge_cost_basis(h: &HedgePosition): u64 { h.cost_basis_quote }
public fun hedge_oracle_id(h: &HedgePosition): ID { h.oracle_id }

// === Public-Package Mutators ===
// All capability-bearing references are package-internal so external modules
// cannot extract them. AdminCap-gated mutations live in Plan 02-06.

public(package) fun treasury_cap_mut<Quote>(self: &mut Vault<Quote>): &mut TreasuryCap<SHARE> {
    &mut self.treasury_cap
}

public(package) fun balance_mut<Quote>(self: &mut Vault<Quote>): &mut Balance<Quote> {
    &mut self.balance
}

public(package) fun escrow_balance_mut<Quote>(self: &mut Vault<Quote>): &mut Balance<SHARE> {
    &mut self.escrow_balance
}

public(package) fun add_total_assets<Quote>(self: &mut Vault<Quote>, delta: u64) {
    self.total_assets = self.total_assets + delta;
}

public(package) fun add_total_shares<Quote>(self: &mut Vault<Quote>, delta: u64) {
    self.total_shares_supply = self.total_shares_supply + delta;
}

public(package) fun sub_total_assets<Quote>(self: &mut Vault<Quote>, delta: u64) {
    self.total_assets = self.total_assets - delta;
}

public(package) fun sub_total_shares<Quote>(self: &mut Vault<Quote>, delta: u64) {
    self.total_shares_supply = self.total_shares_supply - delta;
}

public(package) fun set_paused<Quote>(self: &mut Vault<Quote>, paused: bool) {
    self.paused = paused;
}

public(package) fun set_max_staleness<Quote>(self: &mut Vault<Quote>, secs: u64) {
    self.tunable_oracle_max_staleness_seconds = secs;
}

public(package) fun set_tunable_token_bucket_capacity<Quote>(
    self: &mut Vault<Quote>,
    v: u64,
) {
    self.tunable_token_bucket_capacity_quote_micro_units = v;
}

public(package) fun set_tunable_token_bucket_refill_rate<Quote>(
    self: &mut Vault<Quote>,
    v: u64,
) {
    self.tunable_token_bucket_refill_rate_quote_micro_units_per_ms = v;
}

public(package) fun set_tunable_hedge_alloc_bps<Quote>(self: &mut Vault<Quote>, v: u64) {
    self.tunable_hedge_policy_allocation_bps = v;
}

public(package) fun set_tunable_strike_otm_bps<Quote>(self: &mut Vault<Quote>, v: u64) {
    self.tunable_hedge_policy_strike_otm_bps = v;
}

public(package) fun set_tunable_tenor_seconds<Quote>(self: &mut Vault<Quote>, v: u64) {
    self.tunable_hedge_policy_tenor_seconds = v;
}

public(package) fun hedges_mut<Quote>(self: &mut Vault<Quote>): &mut Table<MarketKey, HedgePosition> {
    &mut self.hedges
}

public(package) fun hedges_ref<Quote>(self: &Vault<Quote>): &Table<MarketKey, HedgePosition> {
    &self.hedges
}

public(package) fun hedge_keys_mut<Quote>(self: &mut Vault<Quote>): &mut vector<MarketKey> {
    &mut self.hedge_keys
}

public(package) fun hedge_keys_ref<Quote>(self: &Vault<Quote>): &vector<MarketKey> {
    &self.hedge_keys
}

public(package) fun rate_limiters_mut<Quote>(self: &mut Vault<Quote>): &mut Table<address, RateLimiter> {
    &mut self.rate_limiters
}

public(package) fun request_slots_mut<Quote>(self: &mut Vault<Quote>): &mut Table<address, RequestSlot> {
    &mut self.request_slots
}

public(package) fun request_slots_ref<Quote>(self: &Vault<Quote>): &Table<address, RequestSlot> {
    &self.request_slots
}

// === Public-Package: HedgePosition Constructor ===

public(package) fun new_hedge_position(
    oracle_id: ID,
    strike: u64,
    expiry_ms: u64,
    notional_quote: u64,
    cost_basis_quote: u64,
    quantity: u64,
): HedgePosition {
    HedgePosition {
        oracle_id,
        strike,
        expiry_ms,
        notional_quote,
        cost_basis_quote,
        quantity,
    }
}

// === Public-Package: RequestSlot Constructors / Accessors (W2 LOCKED — Balance<SHARE>) ===

public(package) fun new_request_slot(
    shares: Balance<SHARE>,
    timestamp_ms: u64,
): RequestSlot {
    RequestSlot {
        shares_escrowed: shares,
        request_timestamp_ms: timestamp_ms,
        claimed_so_far: 0,
    }
}

public(package) fun request_shares_value(slot: &RequestSlot): u64 {
    slot.shares_escrowed.value()
}

public(package) fun request_timestamp_ms(slot: &RequestSlot): u64 {
    slot.request_timestamp_ms
}

public(package) fun request_claimed_so_far(slot: &RequestSlot): u64 {
    slot.claimed_so_far
}

public(package) fun request_add_claimed(slot: &mut RequestSlot, delta: u64) {
    slot.claimed_so_far = slot.claimed_so_far + delta;
}

/// Destroys the slot and returns the escrowed Balance for the caller to
/// dispose of (typically `coin::from_balance(bal, ctx)`).
public(package) fun request_destroy(slot: RequestSlot): Balance<SHARE> {
    let RequestSlot {
        shares_escrowed,
        request_timestamp_ms: _,
        claimed_so_far: _,
    } = slot;
    shares_escrowed
}

/// Splits `amount` shares off the slot's escrow for partial fulfill.
public(package) fun request_split_shares(
    slot: &mut RequestSlot,
    amount: u64,
): Balance<SHARE> {
    slot.shares_escrowed.split(amount)
}

// === Test-only ===

/// Test-only Vault<Quote> constructor that bypasses `predict::create_manager`.
///
/// `create_vault` calls `predict::create_manager(ctx)` which constructs a
/// real PredictManager (sharing it as a side-effect) — that's only viable in
/// a Plan 02-09 E2E test with a live Predict shared object. For pure-vault
/// unit tests (Plan 02-04 supply.move math, ltv.move math, rebalance.move
/// insert_or_consolidate_hedge invariants), we need a constructor that
/// produces a Vault<Quote> without touching Predict.
///
/// W1 lock-compatible: this function does not change the Vault struct schema;
/// it only constructs an instance of the existing schema for test scenarios.
///
/// `predict_manager_id` is set to a synthetic dummy ID; tests that exercise
/// it directly should construct a real one via the E2E path.
#[test_only]
public fun new_vault_for_testing<Quote>(
    cap: TreasuryCap<SHARE>,
    seed: Coin<Quote>,
    ctx: &mut TxContext,
): (Vault<Quote>, AdminCap) {
    let admin_addr = ctx.sender();
    let dummy_uid = object::new(ctx);
    let predict_manager_id = dummy_uid.to_inner();
    dummy_uid.delete();

    let mut vault = Vault<Quote> {
        id: object::new(ctx),
        treasury_cap: cap,
        admin: admin_addr,
        paused: false,
        balance: balance::zero(),
        escrow_balance: balance::zero(),
        request_slots: table::new(ctx),
        rate_limiters: table::new(ctx),
        hedges: table::new(ctx),
        hedge_keys: vector[],
        predict_manager_id,
        total_shares_supply: 0,
        total_assets: 0,
        tunable_token_bucket_capacity_quote_micro_units: strategy_constants::token_bucket_capacity(),
        tunable_token_bucket_refill_rate_quote_micro_units_per_ms: strategy_constants::token_bucket_refill_rate_per_ms(),
        tunable_hedge_policy_allocation_bps: strategy_constants::allocation_bps(),
        tunable_hedge_policy_strike_otm_bps: strategy_constants::strike_otm_bps(),
        tunable_hedge_policy_tenor_seconds: strategy_constants::tenor_seconds(),
        tunable_oracle_max_staleness_seconds: strategy_constants::max_staleness_seconds(),
    };

    // Seed transaction: lock seed quote + mint virtual shares to vault state
    // (test path; the real `create_vault` mints to @0xdead).
    let seed_amt = seed.value();
    vault.balance.join(seed.into_balance());
    vault.total_assets = seed_amt;
    let seed_shares_amt = strategy_constants::virtual_shares();
    let seed_shares = coin::mint(&mut vault.treasury_cap, seed_shares_amt, ctx);
    transfer::public_transfer(seed_shares, DEAD_ADDRESS);
    vault.total_shares_supply = seed_shares_amt;

    let admin_cap = AdminCap { id: object::new(ctx) };
    (vault, admin_cap)
}

#[test_only]
public fun set_paused_for_testing<Quote>(self: &mut Vault<Quote>, paused: bool) {
    self.paused = paused;
}

/// Test-only mint of SHARE coins via the vault's quarantined TreasuryCap.
/// Used by Plan 02-05's redeem_test to construct a user holding SHARE
/// tokens without going through the supply path (which requires a live
/// PredictManager). Updates `total_shares_supply` to keep NAV math
/// consistent.
#[test_only]
public fun mint_shares_for_testing<Quote>(
    self: &mut Vault<Quote>,
    amount: u64,
    ctx: &mut TxContext,
): Coin<SHARE> {
    self.total_shares_supply = self.total_shares_supply + amount;
    coin::mint(&mut self.treasury_cap, amount, ctx)
}

/// Test-only liquid quote inflation. Used by Plan 02-05 redeem_fulfill
/// tests to simulate "vault has N quote liquid" without going through
/// the supply path. Updates `total_assets` to keep NAV math consistent.
#[test_only]
public fun inflate_liquid_for_testing<Quote>(
    self: &mut Vault<Quote>,
    quote: Coin<Quote>,
) {
    let amount = quote.value();
    self.balance.join(quote.into_balance());
    self.total_assets = self.total_assets + amount;
}

/// Test-only liquid quote drain. Used by Plan 02-05 to simulate the D-03
/// liquidity-short fulfill path (where vault.balance < pro_rata payout).
/// Reduces `balance` only; `total_assets` is NOT reduced (the missing
/// quote is conceptually held in the hedge book).
#[test_only]
public fun drain_liquid_for_testing<Quote>(
    self: &mut Vault<Quote>,
    amount: u64,
    ctx: &mut TxContext,
): Coin<Quote> {
    let drained = self.balance.split(amount);
    coin::from_balance(drained, ctx)
}

#[test_only]
public fun destroy_for_testing<Quote>(vault: Vault<Quote>) {
    let Vault {
        id,
        treasury_cap,
        admin: _,
        paused: _,
        balance,
        escrow_balance,
        request_slots,
        rate_limiters,
        hedges,
        hedge_keys: _,
        predict_manager_id: _,
        total_shares_supply: _,
        total_assets: _,
        tunable_token_bucket_capacity_quote_micro_units: _,
        tunable_token_bucket_refill_rate_quote_micro_units_per_ms: _,
        tunable_hedge_policy_allocation_bps: _,
        tunable_hedge_policy_strike_otm_bps: _,
        tunable_hedge_policy_tenor_seconds: _,
        tunable_oracle_max_staleness_seconds: _,
    } = vault;
    id.delete();
    sui::test_utils::destroy(treasury_cap);
    balance.destroy_for_testing();
    escrow_balance.destroy_for_testing();
    sui::test_utils::destroy(request_slots);
    sui::test_utils::destroy(rate_limiters);
    sui::test_utils::destroy(hedges);
}

#[test_only]
public fun destroy_admin_cap_for_testing(cap: AdminCap) {
    let AdminCap { id } = cap;
    id.delete();
}
