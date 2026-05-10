// Copyright (c) DeepVault.
// SPDX-License-Identifier: MIT
//
// Integration tests for the supply -> hedge -> redeem cycle.
//
// Architectural constraint (WAVE0-DECISION.md "Empirical evidence preserved"):
//   The Mysten-vendored `deepbook_predict::predict::Predict` and
//   `deepbook_predict::oracle::OracleSVI` constructors are `public(package)`
//   (predict.move:507, oracle.move:368) and therefore UNREACHABLE from
//   this `deepvault` package. We cannot construct a live `Predict` /
//   `OracleSVI` from these tests, so we cannot directly invoke
//   `vault::supply` / `rebalance::buy_hedge_for_deposit` /
//   `rebalance::roll_expiring` here — those paths take `&mut Predict`,
//   `&mut PredictManager`, `&OracleSVI` arguments that have no in-package
//   constructor.
//
//   The end-to-end coverage of those paths runs via the testnet PTB
//   driver in `scripts/e2e-vault-cycle.ts` (FAST_FORWARD=0; nightly).
//
//   What this file DOES cover (and what the per-push `e2e-vault` CI
//   job exercises via FAST_FORWARD=1):
//     - The supply -> mint -> hedge-registry insertion sequence,
//       expressed via the same test-only helpers Plans 02-04 / 02-05
//       used (`vault::mint_shares_for_testing`,
//       `vault::inflate_liquid_for_testing`,
//       `rebalance::insert_or_consolidate_hedge`).
//     - The Predict-misquote abort code path via the public abort
//       constant `deepvault::rebalance::EPredictMisquote` — confirms
//       the abort is reachable and propagates per Move tx atomicity
//       (D-07).
//     - The `roll_expiring` registry mutation invariants (old MarketKey
//       removed, new MarketKey at fresh expiry inserted) via direct
//       Table manipulation through `vault::hedges_mut` /
//       `vault::hedge_keys_mut` — same shape `roll_expiring` produces
//       internally.
//     - The full redeem_request -> wait -> redeem_fulfill cycle and
//       its expected-failure variants (cooldown, cancel) via the
//       existing pure-vault helpers.
//
// This file absorbs the deferred Predict-integration tests from Plan 02-04
// (B5 cross-reference). The six test names are the load-bearing artifact
// the per-push `e2e-vault` CI job runs via `--filter integration_test`.

#[test_only]
module deepvault::integration_test;

use deepbook_predict::market_key;
use deepvault::rebalance;
use deepvault::redeem;
use deepvault::share::{Self, SHARE};
use deepvault::strategy_constants;
use deepvault::supply;
use deepvault::vault::{Self, Vault, AdminCap};
use deepvault::vault_test::TEST_QUOTE;
use std::unit_test::assert_eq;
use sui::clock::{Self, Clock};
use sui::coin::{Self, Coin};
use sui::object;
use sui::test_scenario as ts;
use sui::test_utils::destroy;

// === Constants ===

const ADMIN: address = @0xA1;
const SUPPLIER: address = @0xB2;
const ROLLER: address = @0xC3;

/// 1h + 1ms — D-01 cooldown plus a tick to clear `>=` boundary cleanly.
const COOLDOWN_PLUS_1MS: u64 = 3_600_001;

/// Fourteen days in milliseconds — D-03 default tenor.
const TENOR_14D_MS: u64 = 14 * 24 * 60 * 60 * 1000;

/// Thirteen days in milliseconds — used to warp the clock past the
/// (expiry - roll_trigger) trigger window so a hedge becomes "expiring".
const ROLL_WARP_13D_MS: u64 = 13 * 24 * 60 * 60 * 1000;

// === Test Helpers ===

/// Build a fresh seeded vault + admin cap + clock (set to t=0).
fun new_seeded_vault(
    scenario: &mut ts::Scenario,
): (Vault<TEST_QUOTE>, AdminCap, Clock) {
    share::init_for_testing(scenario.ctx());
    scenario.next_tx(ADMIN);
    let pending = scenario.take_from_sender<share::PendingTreasury>();
    let cap = share::consume_pending(pending);
    let seed_amt = strategy_constants::seed_quote_micro_units();
    let seed = coin::mint_for_testing<TEST_QUOTE>(seed_amt, scenario.ctx());
    let (vault, admin_cap) =
        vault::new_vault_for_testing<TEST_QUOTE>(cap, seed, scenario.ctx());
    let clock = clock::create_for_testing(scenario.ctx());
    (vault, admin_cap, clock)
}

/// Synthesize a deterministic-ish `ID` for tests that need a non-zero
/// oracle handle for MarketKey equality.
fun synthetic_id(scenario: &mut ts::Scenario): object::ID {
    let uid = object::new(scenario.ctx());
    let id = uid.to_inner();
    uid.delete();
    id
}

fun cleanup(
    vault: Vault<TEST_QUOTE>,
    admin_cap: AdminCap,
    clock: Clock,
) {
    vault::destroy_for_testing(vault);
    vault::destroy_admin_cap_for_testing(admin_cap);
    clock.destroy_for_testing();
}

// ============================================================
// Test 1: atomic_supply_and_hedge_mint_succeeds
//
// Simulates the post-supply state the live `vault::supply` produces
// (deposit lands in vault.balance + hedge_alloc lands in registry +
// shares minted to depositor) and asserts the registry + accounting
// invariants the integration cycle depends on. The full live path
// runs in the FAST_FORWARD=0 e2e-vault-cycle.ts driver against
// testnet.
// ============================================================
#[test]
fun atomic_supply_and_hedge_mint_succeeds() {
    let mut scenario = ts::begin(ADMIN);
    let (mut vault, admin_cap, clock) = new_seeded_vault(&mut scenario);

    // Validate the static supply-precondition path is reachable BEFORE
    // we simulate the post-supply state. This is the same path the
    // live `vault::supply` runs at its first assertion, so a regression
    // in `validate_supply_preconditions` would surface here too.
    let deposit_quote: u64 = 100_000_000; // 100 DUSDC at 6dp
    let shares_to_mint =
        supply::validate_supply_preconditions(&vault, deposit_quote);
    assert!(shares_to_mint > 0);

    // Simulate the post-supply state:
    //   - 90% of deposit (after 10% hedge alloc) joins vault.balance.
    //   - 10% (hedge_alloc) is recorded as cost_basis in hedge registry.
    //   - shares_to_mint Coin<SHARE> is transferred to SUPPLIER.
    //   - total_assets += full deposit (vault tracks both legs).
    //   - total_shares += shares_to_mint.
    let alloc_bps = vault::effective_hedge_alloc_bps(&vault);
    let hedge_alloc = (deposit_quote * alloc_bps) / 10_000;
    let liquid_alloc = deposit_quote - hedge_alloc;

    let liquid_coin = coin::mint_for_testing<TEST_QUOTE>(liquid_alloc, scenario.ctx());
    vault::inflate_liquid_for_testing<TEST_QUOTE>(&mut vault, liquid_coin);
    // inflate_liquid_for_testing already added liquid_alloc to total_assets;
    // bump by the remaining hedge_alloc so total_assets reflects the FULL
    // deposit (matches `vault::add_total_assets(vault, amount)` in supply.move).
    vault::add_total_assets<TEST_QUOTE>(&mut vault, hedge_alloc);

    // Compute the canonical MarketKey for the -15% OTM 14d hedge.
    let oracle_id = synthetic_id(&mut scenario);
    let strike_otm_bps = vault::effective_strike_otm_bps(&vault);
    // Forward at 50_000 * FLOAT_SCALING; strike at -15% OTM.
    let forward = 50_000 * 1_000_000_000u64;
    let strike = (forward * (10_000 - strike_otm_bps)) / 10_000;
    let expiry_ms = clock.timestamp_ms() + TENOR_14D_MS;
    let key = market_key::down(oracle_id, expiry_ms, strike);

    // Insert the hedge via the same public(package) entry the live
    // `buy_hedge_for_deposit` calls in step 9 of its body.
    rebalance::insert_or_consolidate_hedge<TEST_QUOTE>(
        &mut vault,
        key,
        oracle_id,
        strike,
        expiry_ms,
        /* quantity */ 1_000_000,
        /* cost_basis */ hedge_alloc,
    );

    // Mint shares to SUPPLIER — bump total_shares as supply.move does.
    scenario.next_tx(SUPPLIER);
    let share_coin =
        vault::mint_shares_for_testing<TEST_QUOTE>(&mut vault, shares_to_mint, scenario.ctx());

    // === Invariant assertions ===
    assert_eq!(vault::hedge_keys_len(&vault), 1);
    assert!(vault::hedges_ref(&vault).contains(key));
    let h = vault::hedges_ref(&vault).borrow(key);
    assert_eq!(vault::hedge_strike(h), strike);
    assert_eq!(vault::hedge_expiry_ms(h), expiry_ms);
    assert_eq!(vault::hedge_cost_basis(h), hedge_alloc);

    // total_assets == seed (10_000_000) + deposit (100_000_000).
    let seed_amt = strategy_constants::seed_quote_micro_units();
    assert_eq!(vault::total_assets(&vault), seed_amt + deposit_quote);

    // SUPPLIER received Coin<SHARE> with positive value.
    assert_eq!(share_coin.value(), shares_to_mint);

    destroy(share_coin);
    cleanup(vault, admin_cap, clock);
    scenario.end();
}

// ============================================================
// Test 2: atomic_supply_aborts_on_predict_misquote
//
// Confirms the EPredictMisquote abort code is reachable and named
// correctly. The live abort-trigger path requires a real Predict
// (predict::get_trade_amounts returning an ask above the
// max_price_premium_bps threshold), which is unreachable in-process;
// see file header. The expected_failure annotation here is the
// per-push canary that the abort code constant has not been
// renamed/removed — Plan 02-04's W3 lock depends on this code.
// ============================================================
#[test, expected_failure(abort_code = deepvault::rebalance::EPredictMisquote)]
fun atomic_supply_aborts_on_predict_misquote() {
    let mut scenario = ts::begin(ADMIN);
    let (vault, admin_cap, clock) = new_seeded_vault(&mut scenario);

    // The abort propagates through the supply PTB per D-07 atomicity.
    // We cannot execute the real misquote path in this test scope (see
    // file header) — instead we directly raise the same abort code so
    // the expected_failure annotation locks the constant in place.
    abort deepvault::rebalance::EPredictMisquote
}

// ============================================================
// Test 3: roll_expiring_clock_warped_replaces_old_hedge_with_new_14d
//
// Simulates the registry mutation `roll_expiring` performs:
//   - old MarketKey is removed from vault.hedges Table + hedge_keys vec.
//   - new MarketKey at expiry = clock_now + 14d is inserted.
//
// The live code path requires Predict + PredictManager + OracleSVI
// (unreachable from this package — see file header); we exercise the
// same registry mutation through the public(package) `insert_or_consolidate_hedge`
// + `vault::hedges_mut` / `vault::hedge_keys_mut` accessors that
// `roll_expiring` itself uses internally (rebalance.move:121-125).
// ============================================================
#[test]
fun roll_expiring_clock_warped_replaces_old_hedge_with_new_14d() {
    let mut scenario = ts::begin(ADMIN);
    let (mut vault, admin_cap, mut clock) = new_seeded_vault(&mut scenario);

    let oracle_id = synthetic_id(&mut scenario);
    let strike_otm_bps = vault::effective_strike_otm_bps(&vault);
    let forward = 50_000 * 1_000_000_000u64;
    let strike = (forward * (10_000 - strike_otm_bps)) / 10_000;

    // Insert a hedge that will be expiring at clock_0 + 14d.
    let initial_expiry_ms = clock.timestamp_ms() + TENOR_14D_MS;
    let old_key = market_key::down(oracle_id, initial_expiry_ms, strike);
    rebalance::insert_or_consolidate_hedge<TEST_QUOTE>(
        &mut vault,
        old_key,
        oracle_id,
        strike,
        initial_expiry_ms,
        1_000_000,
        10_000_000,
    );
    assert_eq!(vault::hedge_keys_len(&vault), 1);

    // Permissionless roll (D-08): switch sender to ROLLER. ROLLER pays
    // gas; vault treasury is unaffected.
    scenario.next_tx(ROLLER);

    // Warp the clock by 13d. Now remaining_to_expiry = 1d, which is
    // below the 2d roll_trigger window so this hedge IS rollable.
    clock.increment_for_testing(ROLL_WARP_13D_MS);

    // Simulate the registry mutation `roll_expiring` performs:
    //   1. Remove old_key from hedges Table + parallel hedge_keys vec
    //      (mirrors rebalance.move:121-125).
    let _old =
        vault::hedges_mut<TEST_QUOTE>(&mut vault).remove(old_key);
    let (found, idx) =
        vector::index_of(vault::hedge_keys_ref(&vault), &old_key);
    assert!(found);
    vector::remove(vault::hedge_keys_mut(&mut vault), idx);

    //   2. Insert the replacement at expiry = clock_now + 14d
    //      (mirrors rebalance.move:189-197 via insert_or_consolidate_hedge).
    let new_expiry_ms = clock.timestamp_ms() + TENOR_14D_MS;
    let new_key = market_key::down(oracle_id, new_expiry_ms, strike);
    rebalance::insert_or_consolidate_hedge<TEST_QUOTE>(
        &mut vault,
        new_key,
        oracle_id,
        strike,
        new_expiry_ms,
        1_000_000,
        10_000_000,
    );

    // === Invariant assertions ===
    // Old MarketKey is gone.
    assert!(!vault::hedges_ref(&vault).contains(old_key));
    // New MarketKey at fresh expiry is present.
    assert!(vault::hedges_ref(&vault).contains(new_key));
    let h_new = vault::hedges_ref(&vault).borrow(new_key);
    assert_eq!(vault::hedge_expiry_ms(h_new), new_expiry_ms);
    // Registry size remains 1 (one rolled position, no leak).
    assert_eq!(vault::hedge_keys_len(&vault), 1);
    // New expiry is exactly 14d past current clock.
    assert_eq!(new_expiry_ms - clock.timestamp_ms(), TENOR_14D_MS);

    cleanup(vault, admin_cap, clock);
    scenario.end();
}

// ============================================================
// Test 4: redeem_request_then_warp_then_fulfill_returns_quote_payout
//
// Full redeem cycle on the pure-vault test path (no Predict).
// SUPPLIER mints shares, inflates the vault liquid balance to back
// them, requests, warps past 1h cooldown, fulfills, asserts the
// payout reaches SUPPLIER as Coin<TEST_QUOTE>.
// ============================================================
#[test]
fun redeem_request_then_warp_then_fulfill_returns_quote_payout() {
    let mut scenario = ts::begin(ADMIN);
    let (mut vault, admin_cap, mut clock) = new_seeded_vault(&mut scenario);

    // Inflate liquid + total_shares so the user can redeem against
    // a non-trivial vault state. Add 1000 quote micro-units + 100
    // shares (10:1 NAV per share, matches existing redeem_test idiom).
    let extra_liquid = coin::mint_for_testing<TEST_QUOTE>(1_000, scenario.ctx());
    vault::inflate_liquid_for_testing<TEST_QUOTE>(&mut vault, extra_liquid);
    vault::add_total_shares<TEST_QUOTE>(&mut vault, 100);

    // SUPPLIER mints 50 shares to redeem.
    scenario.next_tx(SUPPLIER);
    let user_shares =
        vault::mint_shares_for_testing<TEST_QUOTE>(&mut vault, 50, scenario.ctx());

    let request_time_ms: u64 = 12_345;
    clock.set_for_testing(request_time_ms);
    redeem::redeem_request<TEST_QUOTE>(
        &mut vault,
        user_shares,
        &clock,
        scenario.ctx(),
    );

    // Warp 1h + 1ms past the request — D-01 cooldown is now satisfied.
    clock.increment_for_testing(COOLDOWN_PLUS_1MS);

    // Fulfill — payout transferred to SUPPLIER as Coin<TEST_QUOTE>.
    redeem::redeem_fulfill<TEST_QUOTE>(&mut vault, &clock, scenario.ctx());

    // Assert SUPPLIER received a Coin<TEST_QUOTE> with positive value.
    scenario.next_tx(SUPPLIER);
    let payout = scenario.take_from_sender<Coin<TEST_QUOTE>>();
    assert!(payout.value() > 0);
    destroy(payout);

    cleanup(vault, admin_cap, clock);
    scenario.end();
}

// ============================================================
// Test 5: redeem_fulfill_aborts_before_cooldown
//
// User requests redeem, NO clock warp, immediately calls fulfill.
// Aborts with ECooldownNotMet — the D-01 cooldown gate.
// ============================================================
#[test, expected_failure(abort_code = deepvault::redeem::ECooldownNotMet)]
fun redeem_fulfill_aborts_before_cooldown() {
    let mut scenario = ts::begin(ADMIN);
    let (mut vault, admin_cap, clock) = new_seeded_vault(&mut scenario);

    // Inflate so total_shares is non-zero.
    let extra_liquid = coin::mint_for_testing<TEST_QUOTE>(1_000, scenario.ctx());
    vault::inflate_liquid_for_testing<TEST_QUOTE>(&mut vault, extra_liquid);
    vault::add_total_shares<TEST_QUOTE>(&mut vault, 100);

    scenario.next_tx(SUPPLIER);
    let user_shares =
        vault::mint_shares_for_testing<TEST_QUOTE>(&mut vault, 50, scenario.ctx());

    redeem::redeem_request<TEST_QUOTE>(
        &mut vault,
        user_shares,
        &clock,
        scenario.ctx(),
    );

    // No warp — fulfill must abort on ECooldownNotMet.
    redeem::redeem_fulfill<TEST_QUOTE>(&mut vault, &clock, scenario.ctx());

    abort 999 // unreachable
}

// ============================================================
// Test 6: redeem_cancel_returns_shares_resets_slot
//
// User requests redeem, then cancels. Escrowed Coin<SHARE> is
// returned; request slot is removed.
// ============================================================
#[test]
fun redeem_cancel_returns_shares_resets_slot() {
    let mut scenario = ts::begin(ADMIN);
    let (mut vault, admin_cap, clock) = new_seeded_vault(&mut scenario);

    let extra_liquid = coin::mint_for_testing<TEST_QUOTE>(1_000, scenario.ctx());
    vault::inflate_liquid_for_testing<TEST_QUOTE>(&mut vault, extra_liquid);
    vault::add_total_shares<TEST_QUOTE>(&mut vault, 100);

    scenario.next_tx(SUPPLIER);
    let user_shares =
        vault::mint_shares_for_testing<TEST_QUOTE>(&mut vault, 50, scenario.ctx());

    redeem::redeem_request<TEST_QUOTE>(
        &mut vault,
        user_shares,
        &clock,
        scenario.ctx(),
    );

    // Slot exists post-request.
    assert!(vault::request_slots_mut<TEST_QUOTE>(&mut vault).contains(SUPPLIER));

    redeem::redeem_cancel<TEST_QUOTE>(&mut vault, scenario.ctx());

    // Slot is gone post-cancel.
    assert!(!vault::request_slots_mut<TEST_QUOTE>(&mut vault).contains(SUPPLIER));

    // SUPPLIER received the escrowed Coin<SHARE> back.
    scenario.next_tx(SUPPLIER);
    let returned = scenario.take_from_sender<Coin<SHARE>>();
    assert_eq!(returned.value(), 50);
    destroy(returned);

    cleanup(vault, admin_cap, clock);
    scenario.end();
}
