// Copyright (c) DeepVault.
// SPDX-License-Identifier: MIT
//
// Tests for deepvault::redeem — request/fulfill/cancel + per-user
// token-bucket lazy-init.
//
// Pure-vault tests: no Predict / OracleSVI / PredictManager required.
// SHARE coins are minted via `vault::mint_shares_for_testing`; vault
// liquid balance is inflated via `vault::inflate_liquid_for_testing`
// and drained to model D-03 liquidity-short via
// `vault::drain_liquid_for_testing`. Clock is warped via
// `clock::increment_for_testing` per the rate_limiter_tests.move idiom.
//
// W1 LOCK: tests use `vault::request_slots_mut` / `vault::rate_limiters_mut`
// exclusively — pre-W1 names are forbidden by the Plan 02-03 schema freeze.
// W2 LOCK: tests use `vault::request_shares_value` /
// `vault::request_timestamp_ms` for slot-state assertions; never
// `request_shares_escrowed`.

#[test_only]
module deepvault::redeem_test;

use deepvault::helpers::rate_limiter;
use deepvault::redeem;
use deepvault::share::{Self, SHARE};
use deepvault::strategy_constants;
use deepvault::vault::{Self, Vault, AdminCap};
use deepvault::vault_test::TEST_QUOTE;
use std::unit_test::assert_eq;
use sui::clock::{Self, Clock};
use sui::coin::{Self, Coin};
use sui::test_scenario as ts;
use sui::test_utils::destroy;

// === Constants used by tests ===

const ADMIN: address = @0xA1;
const USER: address = @0xB2;

/// 1h cooldown plus 1ms safety margin.
const COOLDOWN_PLUS_1MS: u64 = 3_600_001;

// === Test Helpers ===

/// Build a seeded vault and clock. After this returns, scenario sender
/// is back to ADMIN at the next `next_tx`.
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

/// Inflate vault liquid balance + total_assets by `liquid_extra` and
/// mint `share_extra` shares to keep NAV at the seed-baseline 10 quote
/// per share (10e9 at 1e9 fixed-point). Caller is responsible for
/// `liquid_extra == 10 * share_extra` to preserve that NAV.
fun inflate_keep_nav(
    vault: &mut Vault<TEST_QUOTE>,
    liquid_extra: u64,
    share_extra: u64,
    ctx: &mut TxContext,
) {
    let extra_liquid = coin::mint_for_testing<TEST_QUOTE>(liquid_extra, ctx);
    vault::inflate_liquid_for_testing<TEST_QUOTE>(vault, extra_liquid);
    vault::add_total_shares<TEST_QUOTE>(vault, share_extra);
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

// === redeem_request ===

/// After redeem_request, the slot exists with the recorded share amount
/// and timestamp. W2: read via `vault::request_shares_value` /
/// `vault::request_timestamp_ms`.
#[test]
fun redeem_request_escrows_shares_and_records_timestamp() {
    let mut scenario = ts::begin(ADMIN);
    let (mut vault, admin_cap, mut clock) = new_seeded_vault(&mut scenario);

    inflate_keep_nav(&mut vault, 1_000, 100, scenario.ctx());

    // User mints 100 shares.
    scenario.next_tx(USER);
    let user_shares =
        vault::mint_shares_for_testing<TEST_QUOTE>(&mut vault, 100, scenario.ctx());

    let request_time_ms = 12_345;
    clock.set_for_testing(request_time_ms);
    redeem::redeem_request<TEST_QUOTE>(&mut vault, user_shares, &clock, scenario.ctx());

    // Assert slot exists with expected state.
    assert!(vault::request_slots_mut<TEST_QUOTE>(&mut vault).contains(USER));
    let escrowed;
    let recorded_ts;
    {
        let slot_ref = vault::request_slots_mut<TEST_QUOTE>(&mut vault).borrow(USER);
        escrowed = vault::request_shares_value(slot_ref);
        recorded_ts = vault::request_timestamp_ms(slot_ref);
    };
    assert_eq!(escrowed, 100);
    assert_eq!(recorded_ts, request_time_ms);

    cleanup(vault, admin_cap, clock);
    scenario.end();
}

/// D-02: per-user single slot. Second redeem_request before fulfill or
/// cancel aborts with ERequestExists.
#[test, expected_failure(abort_code = deepvault::redeem::ERequestExists)]
fun redeem_request_aborts_when_request_already_exists() {
    let mut scenario = ts::begin(ADMIN);
    let (mut vault, admin_cap, clock) = new_seeded_vault(&mut scenario);

    inflate_keep_nav(&mut vault, 2_000, 200, scenario.ctx());

    scenario.next_tx(USER);
    let first_shares =
        vault::mint_shares_for_testing<TEST_QUOTE>(&mut vault, 100, scenario.ctx());
    redeem::redeem_request<TEST_QUOTE>(&mut vault, first_shares, &clock, scenario.ctx());

    let second_shares =
        vault::mint_shares_for_testing<TEST_QUOTE>(&mut vault, 100, scenario.ctx());
    redeem::redeem_request<TEST_QUOTE>(&mut vault, second_shares, &clock, scenario.ctx());

    abort 999
}

// === redeem_fulfill ===

/// D-01: redeem_fulfill aborts before the 1h cooldown elapses.
#[test, expected_failure(abort_code = deepvault::redeem::ECooldownNotMet)]
fun redeem_fulfill_aborts_before_cooldown() {
    let mut scenario = ts::begin(ADMIN);
    let (mut vault, admin_cap, mut clock) = new_seeded_vault(&mut scenario);

    inflate_keep_nav(&mut vault, 1_000, 100, scenario.ctx());

    scenario.next_tx(USER);
    let user_shares =
        vault::mint_shares_for_testing<TEST_QUOTE>(&mut vault, 100, scenario.ctx());

    clock.set_for_testing(0);
    redeem::redeem_request<TEST_QUOTE>(&mut vault, user_shares, &clock, scenario.ctx());

    // Advance only 30 minutes (< 1h cooldown).
    clock.increment_for_testing(30 * 60 * 1_000);
    redeem::redeem_fulfill<TEST_QUOTE>(&mut vault, &clock, scenario.ctx());

    abort 999
}

/// Happy path: NAV = 10 quote/share. User redeems 100 shares → receives
/// 1000 quote (pro_rata); slot is removed; total_shares decreases by 100;
/// total_assets decreases by 1000.
#[test]
fun redeem_fulfill_pays_pro_rata_after_cooldown() {
    let mut scenario = ts::begin(ADMIN);
    let (mut vault, admin_cap, mut clock) = new_seeded_vault(&mut scenario);

    // Total assets = 11M, total_shares = 1.1M, NAV = 10e9 (10 quote/share).
    inflate_keep_nav(&mut vault, 1_000_000, 100_000, scenario.ctx());

    scenario.next_tx(USER);
    let user_shares =
        vault::mint_shares_for_testing<TEST_QUOTE>(&mut vault, 100, scenario.ctx());
    // total_assets = 11_000_000, total_shares = 1_100_100, but mint adds
    // 100 shares without quote → NAV slightly perturbed. Account for it
    // with a matching liquid inflation of 1_000.
    let user_quote_match = coin::mint_for_testing<TEST_QUOTE>(1_000, scenario.ctx());
    vault::inflate_liquid_for_testing<TEST_QUOTE>(&mut vault, user_quote_match);
    // Now total_assets = 11_001_000, total_shares = 1_100_100, balance =
    // 11_001_000. NAV = 11_001_000 * 1e9 / 1_100_100 = 10_000_000_000.

    clock.set_for_testing(0);
    redeem::redeem_request<TEST_QUOTE>(&mut vault, user_shares, &clock, scenario.ctx());

    let assets_before = vault::total_assets(&vault);
    let shares_before = vault::total_shares(&vault);
    let balance_before = vault::balance_value(&vault);

    clock.increment_for_testing(COOLDOWN_PLUS_1MS);
    redeem::redeem_fulfill<TEST_QUOTE>(&mut vault, &clock, scenario.ctx());

    // pro_rata = 100 * 10e9 / 1e9 = 1000. payout = min(1000, capacity, balance).
    let payout: u64 = 1_000;
    assert_eq!(vault::balance_value(&vault), balance_before - payout);
    assert_eq!(vault::total_assets(&vault), assets_before - payout);
    assert_eq!(vault::total_shares(&vault), shares_before - 100);
    // Slot removed (full drain).
    assert!(!vault::request_slots_mut<TEST_QUOTE>(&mut vault).contains(USER));

    // User received 1000 quote.
    scenario.next_tx(USER);
    let received = scenario.take_from_sender<Coin<TEST_QUOTE>>();
    assert_eq!(received.value(), payout);
    destroy(received);

    cleanup(vault, admin_cap, clock);
    scenario.end();
}

/// D-03: when balance < pro_rata, fulfill pays balance, leaves remainder
/// escrowed, and does NOT bump the slot's request_timestamp_ms.
#[test]
fun redeem_fulfill_liquidity_short_leaves_remainder_escrowed_with_unchanged_timestamp() {
    let mut scenario = ts::begin(ADMIN);
    let (mut vault, admin_cap, mut clock) = new_seeded_vault(&mut scenario);

    // Build a 10x-NAV vault: total_assets=11M, total_shares=1.1M.
    inflate_keep_nav(&mut vault, 1_000_000, 100_000, scenario.ctx());
    // Match user's 100 SHARE mint with 1000 quote inflation.
    let match_quote = coin::mint_for_testing<TEST_QUOTE>(1_000, scenario.ctx());
    vault::inflate_liquid_for_testing<TEST_QUOTE>(&mut vault, match_quote);
    // total_assets = 11_001_000, total_shares = 1_100_100 (pre-mint).

    scenario.next_tx(USER);
    let user_shares =
        vault::mint_shares_for_testing<TEST_QUOTE>(&mut vault, 100, scenario.ctx());
    // total_shares = 1_100_200, total_assets = 11_001_000.
    // Drain liquid down to exactly 50 quote so pro_rata > balance.
    // pro_rata for 100 shares at NAV~10 ≈ 1000, but 50 < 1000 → liquidity short.
    let liquid_now = vault::balance_value(&vault);
    let drain_amt = liquid_now - 50;
    let drained = vault::drain_liquid_for_testing<TEST_QUOTE>(&mut vault, drain_amt, scenario.ctx());
    destroy(drained);

    let request_time_ms = 5_000;
    clock.set_for_testing(request_time_ms);
    redeem::redeem_request<TEST_QUOTE>(&mut vault, user_shares, &clock, scenario.ctx());

    clock.increment_for_testing(COOLDOWN_PLUS_1MS);
    redeem::redeem_fulfill<TEST_QUOTE>(&mut vault, &clock, scenario.ctx());

    // Vault balance was 50 → entirely consumed by payout.
    assert_eq!(vault::balance_value(&vault), 0);

    // Slot still exists with reduced shares; timestamp UNCHANGED.
    assert!(vault::request_slots_mut<TEST_QUOTE>(&mut vault).contains(USER));
    let remainder;
    let slot_ts;
    {
        let slot_ref = vault::request_slots_mut<TEST_QUOTE>(&mut vault).borrow(USER);
        remainder = vault::request_shares_value(slot_ref);
        slot_ts = vault::request_timestamp_ms(slot_ref);
    };
    // shares_consumed = ceil(payout * 1e9 / nav). With payout = 50, nav
    // close to 10e9, shares_consumed ≈ 5 (exact NAV depends on residuals).
    assert!(remainder > 0);
    assert!(remainder < 100);
    assert_eq!(slot_ts, request_time_ms);

    // User received 50 quote.
    scenario.next_tx(USER);
    let received = scenario.take_from_sender<Coin<TEST_QUOTE>>();
    assert_eq!(received.value(), 50);
    destroy(received);

    cleanup(vault, admin_cap, clock);
    scenario.end();
}

/// D-05: token-bucket consume reduces `available_withdrawal` by the
/// payout amount.
#[test]
fun redeem_fulfill_consumes_token_bucket() {
    let mut scenario = ts::begin(ADMIN);
    let (mut vault, admin_cap, mut clock) = new_seeded_vault(&mut scenario);

    // Same 10x NAV setup with matching quote.
    inflate_keep_nav(&mut vault, 1_000_000, 100_000, scenario.ctx());
    let match_quote = coin::mint_for_testing<TEST_QUOTE>(1_000, scenario.ctx());
    vault::inflate_liquid_for_testing<TEST_QUOTE>(&mut vault, match_quote);

    scenario.next_tx(USER);
    let user_shares =
        vault::mint_shares_for_testing<TEST_QUOTE>(&mut vault, 100, scenario.ctx());

    clock.set_for_testing(0);
    redeem::redeem_request<TEST_QUOTE>(&mut vault, user_shares, &clock, scenario.ctx());

    clock.increment_for_testing(COOLDOWN_PLUS_1MS);
    redeem::redeem_fulfill<TEST_QUOTE>(&mut vault, &clock, scenario.ctx());

    // Payout = 1000 quote. Bucket capacity = 100M. After consume,
    // available_withdrawal = capacity - payout (no further refill since
    // we don't advance the clock between consume and the read).
    let capacity = strategy_constants::token_bucket_capacity();
    {
        let bucket = vault::rate_limiters_mut<TEST_QUOTE>(&mut vault).borrow(USER);
        assert_eq!(rate_limiter::available_withdrawal(bucket, &clock), capacity - 1_000);
    };

    cleanup(vault, admin_cap, clock);
    scenario.end();
}

// === redeem_cancel ===

/// D-04: cancel-anytime — works BEFORE the 1h cooldown. User receives
/// Coin<SHARE> equal to escrowed amount; slot removed.
#[test]
fun redeem_cancel_returns_escrowed_shares_anytime() {
    let mut scenario = ts::begin(ADMIN);
    let (mut vault, admin_cap, clock) = new_seeded_vault(&mut scenario);

    inflate_keep_nav(&mut vault, 1_000, 100, scenario.ctx());

    scenario.next_tx(USER);
    let user_shares =
        vault::mint_shares_for_testing<TEST_QUOTE>(&mut vault, 100, scenario.ctx());

    redeem::redeem_request<TEST_QUOTE>(&mut vault, user_shares, &clock, scenario.ctx());
    // Cancel IMMEDIATELY — before any cooldown elapses.
    redeem::redeem_cancel<TEST_QUOTE>(&mut vault, scenario.ctx());

    assert!(!vault::request_slots_mut<TEST_QUOTE>(&mut vault).contains(USER));

    scenario.next_tx(USER);
    let returned = scenario.take_from_sender<Coin<SHARE>>();
    assert_eq!(returned.value(), 100);
    destroy(returned);

    cleanup(vault, admin_cap, clock);
    scenario.end();
}

/// After a partial liquidity-short fulfill, cancel returns the
/// remainder Balance<SHARE>. Demonstrates the full request →
/// liquidity-short fulfill → cancel-remaining flow.
#[test]
fun redeem_cancel_after_partial_fulfill_returns_remainder() {
    let mut scenario = ts::begin(ADMIN);
    let (mut vault, admin_cap, mut clock) = new_seeded_vault(&mut scenario);

    inflate_keep_nav(&mut vault, 1_000_000, 100_000, scenario.ctx());
    let match_quote = coin::mint_for_testing<TEST_QUOTE>(1_000, scenario.ctx());
    vault::inflate_liquid_for_testing<TEST_QUOTE>(&mut vault, match_quote);

    scenario.next_tx(USER);
    let user_shares =
        vault::mint_shares_for_testing<TEST_QUOTE>(&mut vault, 100, scenario.ctx());
    // Drain to 50 quote (will be partial fulfill).
    let liquid_now = vault::balance_value(&vault);
    let drained = vault::drain_liquid_for_testing<TEST_QUOTE>(&mut vault, liquid_now - 50, scenario.ctx());
    destroy(drained);

    clock.set_for_testing(0);
    redeem::redeem_request<TEST_QUOTE>(&mut vault, user_shares, &clock, scenario.ctx());

    clock.increment_for_testing(COOLDOWN_PLUS_1MS);
    redeem::redeem_fulfill<TEST_QUOTE>(&mut vault, &clock, scenario.ctx());

    // Snapshot remainder via the W2 accessor (scoped so the borrow
    // releases before redeem_cancel re-borrows &mut vault).
    let remainder;
    {
        let slot_ref = vault::request_slots_mut<TEST_QUOTE>(&mut vault).borrow(USER);
        remainder = vault::request_shares_value(slot_ref);
    };
    assert!(remainder > 0);
    assert!(remainder < 100);

    redeem::redeem_cancel<TEST_QUOTE>(&mut vault, scenario.ctx());
    assert!(!vault::request_slots_mut<TEST_QUOTE>(&mut vault).contains(USER));

    // Drain the user's wallet — receives Coin<TEST_QUOTE> from fulfill
    // and Coin<SHARE> from cancel.
    scenario.next_tx(USER);
    let returned_shares = scenario.take_from_sender<Coin<SHARE>>();
    assert_eq!(returned_shares.value(), remainder);
    destroy(returned_shares);
    let received_quote = scenario.take_from_sender<Coin<TEST_QUOTE>>();
    assert_eq!(received_quote.value(), 50);
    destroy(received_quote);

    cleanup(vault, admin_cap, clock);
    scenario.end();
}
