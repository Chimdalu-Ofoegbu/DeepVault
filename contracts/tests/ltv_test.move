// Copyright (c) DeepVault.
// SPDX-License-Identifier: MIT
//
// Tests for deepvault::ltv — nav_per_share + worst_case_nav_per_share.
//
// Pure-vault tests: no Predict / OracleSVI / PredictManager required.
// Vault state is constructed via vault::new_vault_for_testing and tuned
// via the existing public(package) accessors (add_total_assets,
// add_total_shares, balance_mut::join).

#[test_only]
module deepvault::ltv_test;

use deepvault::ltv;
use deepvault::share;
use deepvault::strategy_constants;
use deepvault::vault::{Self, Vault};
use deepvault::vault_test::TEST_QUOTE;
use std::unit_test::assert_eq;
use sui::coin;
use sui::test_scenario as ts;

// === Test Helpers ===

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

// === nav_per_share ===

/// After the inflation-defense seed: 10_000_000 quote micro-units in
/// total_assets, 1_000_000 virtual shares. NAV = 10 quote per share at
/// 1e9 fixed-point (D-15) = 10_000_000_000.
///
/// Hand-computed: total_assets * NAV_SCALE / total_shares
///              = 10_000_000 * 1_000_000_000 / 1_000_000
///              = 10_000_000_000_000_000 / 1_000_000
///              = 10_000_000_000.
#[test]
fun nav_per_share_after_seed_returns_seed_ratio_at_1e9() {
    let admin = @0xa1;
    let mut scenario = ts::begin(admin);
    let (vault, cap) = make_seeded_vault(&mut scenario, admin);

    let nav = ltv::nav_per_share(&vault);
    assert_eq!(nav, 10_000_000_000);

    vault::destroy_for_testing(vault);
    vault::destroy_admin_cap_for_testing(cap);
    scenario.end();
}

/// With no open hedges, worst_case_nav (only-liquid-balance assumption)
/// equals nav_per_share because liquid balance == total_assets in that
/// state.
#[test]
fun worst_case_nav_per_share_with_no_open_hedges_equals_nav_per_share() {
    let admin = @0xa1;
    let mut scenario = ts::begin(admin);
    let (vault, cap) = make_seeded_vault(&mut scenario, admin);

    let nav = ltv::nav_per_share(&vault);
    let worst = ltv::worst_case_nav_per_share(&vault);
    assert_eq!(nav, worst);

    vault::destroy_for_testing(vault);
    vault::destroy_admin_cap_for_testing(cap);
    scenario.end();
}

/// Simulate "vault with open hedges": total_assets reflects the full
/// deposit (incl. hedge cost basis), but vault.balance only holds the
/// liquid 90%. Set up:
///   - total_assets = 20_000_000 (10M seed + 10M hypothetical extra deposit)
///   - balance = 18_000_000 (seed 10M + 8M of 10M extra; 2M went to hedge)
///   - total_shares = 2_000_000 (1M virtual + 1M minted to depositor)
///
/// nav = 20_000_000 * 1e9 / 2_000_000 = 10_000_000_000 (10 quote/share)
/// worst_case = 18_000_000 * 1e9 / 2_000_000 = 9_000_000_000 (9 quote/share)
///
/// The 1 quote/share difference equals the per-share allocation that's
/// at hedge risk; this is the "all hedges expire worthless" haircut.
#[test]
fun worst_case_nav_per_share_pessimistically_assumes_hedges_worthless() {
    let admin = @0xa1;
    let mut scenario = ts::begin(admin);
    let (mut vault, cap) = make_seeded_vault(&mut scenario, admin);

    // Add 10M extra "deposit" to total_assets and 1M extra shares,
    // but only 8M to liquid balance — the missing 2M models the
    // hedge cost basis sent to PredictManager.
    vault::add_total_assets<TEST_QUOTE>(&mut vault, 10_000_000);
    vault::add_total_shares<TEST_QUOTE>(&mut vault, 1_000_000);
    let extra_liquid_coin = coin::mint_for_testing<TEST_QUOTE>(8_000_000, scenario.ctx());
    vault::balance_mut<TEST_QUOTE>(&mut vault).join(extra_liquid_coin.into_balance());

    let nav = ltv::nav_per_share(&vault);
    let worst = ltv::worst_case_nav_per_share(&vault);
    assert_eq!(nav, 10_000_000_000);
    assert_eq!(worst, 9_000_000_000);

    // haircut = 10_000 * (10e9 - 9e9) / 10e9 = 10_000 * 1/10 = 1000 bps.
    let haircut = ltv::worst_case_haircut_bps(&vault);
    assert_eq!(haircut, 1_000);

    vault::destroy_for_testing(vault);
    vault::destroy_admin_cap_for_testing(cap);
    scenario.end();
}

/// nav_per_share aborts with EZeroShares if total_shares is 0.
/// Constructed via the test path that bypasses the seed + virtual-shares
/// inflation defense.
#[test, expected_failure(abort_code = deepvault::ltv::EZeroShares)]
fun nav_per_share_aborts_when_total_shares_zero() {
    let admin = @0xa1;
    let mut scenario = ts::begin(admin);
    share::init_for_testing(scenario.ctx());
    scenario.next_tx(admin);
    let pending = scenario.take_from_sender<share::PendingTreasury>();
    let cap = share::consume_pending(pending);
    // Build a vault with NO seed -> total_shares stays 0 after the
    // `sub_total_shares` call below cancels the test-only seed.
    let seed_amt = strategy_constants::seed_quote_micro_units();
    let seed = coin::mint_for_testing<TEST_QUOTE>(seed_amt, scenario.ctx());
    let (mut vault, admin_cap) =
        vault::new_vault_for_testing<TEST_QUOTE>(cap, seed, scenario.ctx());

    // Cancel out the virtual-shares seed so total_shares == 0.
    vault::sub_total_shares<TEST_QUOTE>(&mut vault, strategy_constants::virtual_shares());

    let _nav = ltv::nav_per_share(&vault);

    abort 999 // unreached — distinct code so the guard fails distinctly
}
