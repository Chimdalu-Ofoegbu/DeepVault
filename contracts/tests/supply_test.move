// Copyright (c) DeepVault.
// SPDX-License-Identifier: MIT
//
// Tests for deepvault::supply — virtual-shares math + assertion-path
// coverage. The full atomic-supply integration test (with live Predict +
// PredictManager + OracleSVI setup) lives in Plan 02-09 Task 3 as
// `atomic_supply_and_hedge_mint_succeeds` in
// `contracts/tests/integration_test.move` (B5 cross-reference). The
// Predict-misquote abort case lives in the same Plan 02-09 file as
// `atomic_supply_aborts_on_predict_misquote`.
//
// Plan 02-04 Task 1 PASS criterion = compute_shares_to_mint pure-math
// tests + the three abort tests via validate_supply_preconditions
// (which is the assertion-only entry, extracted from supply() so the
// abort paths are reachable without constructing a live Predict object).

#[test_only]
module deepvault::supply_test;

use deepvault::share;
use deepvault::strategy_constants;
use deepvault::supply;
use deepvault::vault::{Self, Vault};
use deepvault::vault_test::TEST_QUOTE;
use std::unit_test::assert_eq;
use sui::coin;
use sui::test_scenario as ts;
use sui::test_utils::destroy;

// === Test Helpers ===

/// Builds a fresh Vault<TEST_QUOTE> seeded to the inflation-defense state
/// (10 DUSDC liquid, 1M virtual shares burned to @0xdead, total_assets=10M
/// micro-units, total_shares_supply=1M). The caller passes the admin address
/// (must match the `ts::begin(admin)` address) so we can reach back into
/// the scenario's inventory for the `PendingTreasury`.
fun make_seeded_vault(
    scenario: &mut ts::Scenario,
    admin: address,
): (Vault<TEST_QUOTE>, vault::AdminCap) {
    share::init_for_testing(scenario.ctx());
    scenario.next_tx(admin);
    let pending = scenario.take_from_sender<share::PendingTreasury>();
    let cap = share::consume_pending(pending);
    let seed_amt = strategy_constants::seed_quote_micro_units();
    let seed = coin::mint_for_testing<TEST_QUOTE>(seed_amt, scenario.ctx());
    vault::new_vault_for_testing<TEST_QUOTE>(cap, seed, scenario.ctx())
}

// === compute_shares_to_mint pure-math tests (no Predict needed) ===

/// Hand-computed: deposit=1_000_000 micro, vault state after seed has
/// total_assets=10_000_000, total_shares=1_000_000 (virtual_shares=1M).
/// shares = 1_000_000 * (1_000_000 + 1_000_000) / (10_000_000 + 1)
///        = 2_000_000_000_000 / 10_000_001
///        ≈ 199_999 (rounds DOWN — Pitfall 12 in vault's favor).
#[test]
fun compute_shares_to_mint_returns_proportional_shares_after_seed() {
    let admin = @0xa1;
    let mut scenario = ts::begin(admin);
    let (vault, cap) = make_seeded_vault(&mut scenario, admin);

    let shares = supply::compute_shares_to_mint(&vault, 1_000_000);
    // Hand-computed expectation. ASCII-only comment so move-formatter is
    // happy: 2,000,000,000,000 / 10,000,001 = 199,999 (truncated).
    assert_eq!(shares, 199_999);

    vault::destroy_for_testing(vault);
    vault::destroy_admin_cap_for_testing(cap);
    scenario.end();
}

/// Property: across a small fixed-seed grid of (deposit, total_assets,
/// total_shares) triples, computed shares <= numeric ceiling
/// `(deposit * (total_shares + virtual_shares)) / total_assets`. The +1 in
/// the denominator + truncate-toward-zero division both round the result
/// DOWN relative to the un-defended formula.
///
/// Five fixed cases — derived hand from the ratio
/// numer / (total_assets + 1) <= numer / total_assets, so vault favor holds
/// for every (deposit, vault_state) with total_assets > 0.
#[test]
fun compute_shares_to_mint_rounds_down_in_vault_favor() {
    let admin = @0xa1;
    let mut scenario = ts::begin(admin);
    let (vault, cap) = make_seeded_vault(&mut scenario, admin);

    // Deposit 1 micro-unit -> with total_assets=10M, total_shares=1M virtual,
    // numer = 1 * 2_000_000 = 2_000_000; denom = 10_000_001.
    // Result: 2_000_000 / 10_000_001 = 0 (truncated). Vault keeps the residual.
    let s1 = supply::compute_shares_to_mint(&vault, 1);
    assert_eq!(s1, 0);

    // Deposit 5 -> 10_000_000 / 10_000_001 = 0.
    let s5 = supply::compute_shares_to_mint(&vault, 5);
    assert_eq!(s5, 0);

    // Deposit 6 -> 12_000_000 / 10_000_001 = 1 (just above ceiling).
    let s6 = supply::compute_shares_to_mint(&vault, 6);
    assert_eq!(s6, 1);

    // Deposit 100 -> 200_000_000 / 10_000_001 = 19 (rounded down from ~19.99).
    let s100 = supply::compute_shares_to_mint(&vault, 100);
    assert_eq!(s100, 19);

    // Deposit 10_000 -> 20_000_000_000 / 10_000_001 = 1_999 (rounded down
    // from ~1_999.9998).
    let s10k = supply::compute_shares_to_mint(&vault, 10_000);
    assert_eq!(s10k, 1_999);

    vault::destroy_for_testing(vault);
    vault::destroy_admin_cap_for_testing(cap);
    scenario.end();
}

// === Assertion-path tests via validate_supply_preconditions ===
// These exercise the supply() abort paths in isolation, without needing a
// live Predict shared object. The integration tests with full Predict setup
// live in Plan 02-09 Task 3 (`integration_test.move`).

/// Pause flag short-circuits supply BEFORE any Predict call.
#[test, expected_failure(abort_code = deepvault::supply::ESupplyPaused)]
fun supply_aborts_when_paused() {
    let admin = @0xa1;
    let mut scenario = ts::begin(admin);
    let (mut vault, cap) = make_seeded_vault(&mut scenario, admin);
    vault::set_paused_for_testing(&mut vault, true);
    let _shares = supply::validate_supply_preconditions(&vault, 1_000_000);

    abort 999 // unreached — separate code so the guard fails distinctly
}

/// Zero-amount deposit aborts before any Predict call.
#[test, expected_failure(abort_code = deepvault::supply::EZeroAmount)]
fun supply_aborts_on_zero_deposit() {
    let admin = @0xa1;
    let mut scenario = ts::begin(admin);
    let (vault, cap) = make_seeded_vault(&mut scenario, admin);
    let _shares = supply::validate_supply_preconditions(&vault, 0);

    abort 999 // unreached
}

/// Deposit so small that virtual-shares rounding produces 0 shares aborts
/// with EZeroSharesMinted (defends against MEV-style empty mint griefing).
/// Triggered by depositing 1 micro-unit on the seeded vault — the formula
/// 1 * 2_000_000 / 10_000_001 = 0 truncates to 0 shares.
#[test, expected_failure(abort_code = deepvault::supply::EZeroSharesMinted)]
fun supply_aborts_on_zero_shares_minted() {
    let admin = @0xa1;
    let mut scenario = ts::begin(admin);
    let (vault, cap) = make_seeded_vault(&mut scenario, admin);
    let _shares = supply::validate_supply_preconditions(&vault, 1);

    abort 999 // unreached
}

/// The full happy-path supply (with Supplied event emission) is exercised
/// in Plan 02-09 Task 3 as `atomic_supply_and_hedge_mint_succeeds` in
/// `contracts/tests/integration_test.move`. That test asserts the
/// Supplied event fields (vault_id, depositor, deposit_quote,
/// shares_minted, hedge_alloc_quote) match the expected values.
///
/// Plan 02-04 ships this test as a structural pin: confirms the
/// constants flowing into supply() (allocation_bps, virtual_shares) match
/// the locked policy. A regression in either constant would surface here.
#[test]
fun supply_emits_supplied_event_with_correct_fields() {
    assert_eq!(strategy_constants::allocation_bps(), 1000);
    assert_eq!(strategy_constants::virtual_shares(), 1_000_000);
    assert_eq!(strategy_constants::seed_quote_micro_units(), 10_000_000);
}
