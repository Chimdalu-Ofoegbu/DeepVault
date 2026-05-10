// Copyright (c) DeepVault.
// SPDX-License-Identifier: MIT
//
// Tests for deepvault::rebalance — pure-vault invariants only.
//
// Plan 02-04 Task 2 PASS criterion = `insert_or_consolidate_hedge_consolidates_same_market_key`
// passes against a pure-vault test scenario (no Predict / OracleSVI /
// PredictManager required).
//
// Integration tests for buy_hedge_for_deposit + roll_expiring with full
// Predict + PredictManager + OracleSVI setup live in Plan 02-09 Task 3
// (`contracts/tests/integration_test.move`) per the B5 cross-reference
// in 02-04-PLAN's plan_amendments_iteration_1 block. The deferred test
// names are:
//   - atomic_supply_and_hedge_mint_succeeds
//   - atomic_supply_aborts_on_predict_misquote
//   - roll_expiring_clock_warped_replaces_old_hedge_with_new_14d

#[test_only]
module deepvault::rebalance_test;

use deepbook_predict::market_key;
use deepvault::rebalance;
use deepvault::share;
use deepvault::strategy_constants;
use deepvault::vault::{Self, Vault};
use deepvault::vault_test::TEST_QUOTE;
use std::unit_test::assert_eq;
use sui::coin;
use sui::object;
use sui::test_scenario as ts;

// === Test Helpers ===

/// Build a fresh Vault<TEST_QUOTE> seeded to inflation-defense state,
/// suitable for unit tests that don't touch Predict.
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

/// Synthesize a deterministic `ID` for tests. We need a real-looking
/// oracle_id so MarketKey equality holds — use a fresh UID, capture its
/// inner `ID`, then delete the UID so the resource is consumed.
fun synthetic_id(scenario: &mut ts::Scenario): object::ID {
    let uid = object::new(scenario.ctx());
    let id = uid.to_inner();
    uid.delete();
    id
}

// === insert_or_consolidate_hedge invariant ===

/// Two inserts at the same MarketKey K should consolidate into a single
/// HedgePosition with summed quantity, summed cost_basis, summed
/// notional_quote (Pitfall 3). The hedge_keys parallel index should
/// have exactly ONE entry afterwards (no duplicates).
#[test]
fun insert_or_consolidate_hedge_consolidates_same_market_key() {
    let admin = @0xa1;
    let mut scenario = ts::begin(admin);
    let (mut vault, cap) = make_seeded_vault(&mut scenario, admin);

    let oracle_id = synthetic_id(&mut scenario);
    let strike = 50_000_000_000_000u64; // arbitrary -15% OTM strike
    let expiry_ms = 1_000_000_000_000u64; // arbitrary +14d expiry
    let key = market_key::down(oracle_id, expiry_ms, strike);

    // First insert: quantity 100, cost_basis 1_000_000.
    rebalance::insert_or_consolidate_hedge<TEST_QUOTE>(
        &mut vault,
        key,
        oracle_id,
        strike,
        expiry_ms,
        100,
        1_000_000,
    );

    // Second insert at the SAME MarketKey: quantity 50, cost_basis 500_000.
    rebalance::insert_or_consolidate_hedge<TEST_QUOTE>(
        &mut vault,
        key,
        oracle_id,
        strike,
        expiry_ms,
        50,
        500_000,
    );

    // Registry must have exactly one entry (no duplicate row).
    assert_eq!(vault::hedge_keys_len(&vault), 1);

    // Position fields are summed.
    let h = vault::hedges_ref(&vault).borrow(key);
    assert_eq!(vault::hedge_quantity(h), 150);
    assert_eq!(vault::hedge_cost_basis(h), 1_500_000);
    assert_eq!(vault::hedge_notional(h), 150);
    assert_eq!(vault::hedge_strike(h), strike);
    assert_eq!(vault::hedge_expiry_ms(h), expiry_ms);

    vault::destroy_for_testing(vault);
    vault::destroy_admin_cap_for_testing(cap);
    scenario.end();
}

/// Distinct MarketKeys (different strikes) are tracked as independent
/// rows in the registry.
#[test]
fun insert_or_consolidate_hedge_distinct_keys_create_separate_rows() {
    let admin = @0xa1;
    let mut scenario = ts::begin(admin);
    let (mut vault, cap) = make_seeded_vault(&mut scenario, admin);

    let oracle_id = synthetic_id(&mut scenario);
    let expiry_ms = 1_000_000_000_000u64;
    let strike_a = 50_000_000_000_000u64;
    let strike_b = 51_000_000_000_000u64;
    let key_a = market_key::down(oracle_id, expiry_ms, strike_a);
    let key_b = market_key::down(oracle_id, expiry_ms, strike_b);

    rebalance::insert_or_consolidate_hedge<TEST_QUOTE>(
        &mut vault,
        key_a,
        oracle_id,
        strike_a,
        expiry_ms,
        100,
        1_000_000,
    );
    rebalance::insert_or_consolidate_hedge<TEST_QUOTE>(
        &mut vault,
        key_b,
        oracle_id,
        strike_b,
        expiry_ms,
        200,
        2_000_000,
    );

    assert_eq!(vault::hedge_keys_len(&vault), 2);

    let h_a = vault::hedges_ref(&vault).borrow(key_a);
    let h_b = vault::hedges_ref(&vault).borrow(key_b);
    assert_eq!(vault::hedge_quantity(h_a), 100);
    assert_eq!(vault::hedge_quantity(h_b), 200);

    vault::destroy_for_testing(vault);
    vault::destroy_admin_cap_for_testing(cap);
    scenario.end();
}
