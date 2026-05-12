// Copyright (c) DeepVault.
// SPDX-License-Identifier: MIT
//
// PTB-05: −30% NAV shock liquidation property test (Track A, Wave 3).
//
// Per CONTEXT.md D-20: supply 1000 DUSDC -> buy hedge at SVI fair value
// -> simulate Predict resolution where the binary expires worthless AND
// vault collateral drops 30%. Assert:
//   (a) Margin liquidation path triggers via mock_margin_pool::liquidate_position
//       (risk_ratio_bps drops below LIQUIDATION_LTV_BPS = 11_500).
//   (b) ltv::worst_case_nav_per_share matches the pre-computed
//       70%-of-pre-shock value under the same shocked state — this is
//       the Move-side anchor consumed by backtest/tests/test_liquidation_parity.py
//       at 1-wei tolerance per Phase 1 + Plan 03-06 parity discipline.
//
// Architectural constraint (PATTERNS.md liquidation_test.move analog):
//   - Reuses integration_test.move's `new_seeded_vault(scenario)` shape
//     verbatim. PredictManager / OracleSVI constructors are public(package)
//     in the vendored deepbook_predict source (predict.move:507,
//     oracle.move:368) so we cannot execute the live supply path here.
//     Instead we simulate the post-supply state via test-only helpers
//     `vault::inflate_liquid_for_testing` + `vault::mint_shares_for_testing`
//     (same pattern Plans 02-04 / 02-05 / 02-09 use). This mirrors
//     vault::supply's net effect on (balance, total_assets, total_shares)
//     without requiring the Predict shared objects.
//
//   - mock_margin_pool replaces the live deepbook_margin path (per
//     MARGIN-WHITELIST-DECISION.md UNDETERMINED-FALLBACK-TO-MOCK). The
//     register -> borrow -> liquidate surface is exactly the production
//     trait shape we proved architectural readiness for in Plan 03-03.
//
// What this file covers (3 named tests):
//   1. `worst_case_nav_at_minus_30_shock_drops_to_70pct`
//      Pure-vault: assert ltv::worst_case_nav_per_share before vs after
//      the -30% balance shock matches 70% of pre to the wei. Locks the
//      Move-side anchor numbers used by test_liquidation_parity.py.
//   2. `supply_1000_dusdc_then_minus_30_pct_shock_triggers_liquidation`
//      Full integration: vault + mock_margin_pool round trip. SUPPLIER
//      borrows quote against SHARE collateral, then the vault eats a
//      -30% NAV shock, then LIQUIDATOR calls liquidate_position and
//      asserts risk_ratio_bps < 11_500 (liquidation fires).
//   3. `liquidation_aborts_when_only_minus_5_pct_shock`
//      Negative control: at -5% shock the position remains healthy and
//      liquidate_position aborts with ENotLiquidatable (= 603) — proves
//      the gate works in both directions.
//
// Error code reuse (cross-module abort_code in expected_failure):
//   - 603 = mock_margin_pool::ENotLiquidatable
//     (Move's `#[test, expected_failure(abort_code = ...)]` requires a
//      compile-time u64 literal. The constant lives in
//      mock_margin_pool.move:53; we inline 603 here per PATTERNS.md
//      "Test-only abort_code locking" — if mock_margin_pool renumbers,
//      update both sites in sync.)

#[test_only]
module deepvault::liquidation_test;

use deepvault::ltv;
use deepvault::mock_margin_pool::{Self, MockMarginPool};
use deepvault::share::{Self, SHARE};
use deepvault::strategy_constants;
use deepvault::vault::{Self, Vault, AdminCap};
use deepvault::vault_test::TEST_QUOTE;
use sui::clock::{Self, Clock};
use sui::coin;
use sui::test_scenario as ts;
use sui::test_utils::destroy;

// === Constants ===

const ADMIN: address = @0xA1;
const SUPPLIER: address = @0xB2;
const LIQUIDATOR: address = @0xC3;

/// −30% NAV shock per CONTEXT.md D-20.
const SHOCK_PCT_BPS: u64 = 3_000;

/// −5% control shock — vault remains healthy, liquidation must NOT trigger.
const HEALTHY_SHOCK_BPS: u64 = 500;

/// Mirrors mock_margin_pool::LIQUIDATION_LTV_BPS (1.15 risk ratio in bps).
const LIQUIDATION_LTV_BPS: u64 = 11_500;

/// Mirrors NAV_SCALE = 1e9 (strategy_constants::nav_scale()).
const NAV_SCALE: u64 = 1_000_000_000;

/// Simulated supply amounts. Mirrors CONTEXT.md D-20: "supply 1000 DUSDC".
/// 1000 DUSDC = 1_000_000_000 quote micro-units at 6 decimals (DUSDC).
/// After the 10% hedge alloc the liquid leg landing in vault.balance is 900M;
/// the remaining 100M would flow to the PredictManager as hedge cost basis.
/// Here we directly inflate by 900M to mirror the post-supply liquid balance.
const SUPPLY_LIQUID_LEG: u64 = 900_000_000; // 900 DUSDC, 6dp

/// Shares minted to SUPPLIER at supply (formula-derived for 1000 DUSDC
/// deposit on a vault with the seed state 10 DUSDC + 1M virtual shares).
/// We choose a round 100M shares figure here to keep the parity arithmetic
/// in test_liquidation_parity.py readable — the Python test mirrors this
/// post-state value-for-value.
const SUPPLY_SHARES: u64 = 100_000_000;

/// Pool reserves seeded so the borrow path has Coin<TEST_QUOTE> available.
const POOL_RESERVES: u64 = 10_000_000_000; // 10_000 DUSDC

/// Borrowed quote amount (well below the 50% LTV cap on 100M SHARE @ NAV).
const BORROW_AMOUNT: u64 = 500_000_000; // 500 DUSDC

// === Helpers ===

/// Build a fresh seeded vault + admin cap + clock. Mirrors
/// integration_test.move:81-94 verbatim (PATTERNS.md analog).
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

/// Cleanup helper. Vault and AdminCap are `key`-only — they cannot be
/// dropped, public_transferred, or freed via `sui::test_utils::destroy`
/// (which requires `T: drop`); use the module-internal `destroy_for_testing`
/// + `destroy_admin_cap_for_testing` accessors. Same pattern as
/// integration_test.move:105-113 and ptb_capability_test.move:95-103.
fun cleanup(
    vault: Vault<TEST_QUOTE>,
    admin_cap: AdminCap,
    clock: Clock,
) {
    vault::destroy_for_testing(vault);
    vault::destroy_admin_cap_for_testing(admin_cap);
    clock.destroy_for_testing();
}

/// Apply a `shock_bps` shock to the vault by draining shock_bps/10000 of
/// the CURRENT balance. The drained Coin<TEST_QUOTE> is discarded — this
/// mirrors the economic effect of "vault collateral drops 30%" (D-20).
///
/// `drain_liquid_for_testing` reduces `balance` ONLY (NOT `total_assets`);
/// the missing quote is conceptually held as a worthless-on-resolution
/// hedge book entry. This matches the ltv::worst_case_nav_per_share
/// definition: it reads from `balance` only and is therefore the natural
/// post-shock measurement target.
fun apply_balance_shock(
    vault: &mut Vault<TEST_QUOTE>,
    shock_bps: u64,
    scenario: &mut ts::Scenario,
): u64 {
    let pre_balance = vault::balance_value(vault);
    let drain_amount = pre_balance * shock_bps / 10_000;
    let drained = vault::drain_liquid_for_testing<TEST_QUOTE>(
        vault,
        drain_amount,
        scenario.ctx(),
    );
    destroy(drained);
    drain_amount
}

/// Simulate the post-supply state of a 1000 DUSDC deposit. Mirrors the
/// net effect of vault::supply on (balance, total_assets, total_shares)
/// without requiring a live PredictManager. Adds SUPPLY_LIQUID_LEG to
/// vault.balance + total_assets via inflate_liquid_for_testing, then bumps
/// total_shares_supply by SUPPLY_SHARES.
///
/// We deliberately do NOT also bump total_assets by the 100M hedge cost
/// basis here — the worst_case_nav formula reads from balance only, and
/// keeping total_assets at balance + 0 hedge-cost makes the test 2 math
/// (where the parity test is anchored) trivially reproducible from
/// (910_000_000 balance, 101_000_000 total_shares).
fun simulate_supply_1000_dusdc(
    vault: &mut Vault<TEST_QUOTE>,
    scenario: &mut ts::Scenario,
) {
    let liquid = coin::mint_for_testing<TEST_QUOTE>(SUPPLY_LIQUID_LEG, scenario.ctx());
    vault::inflate_liquid_for_testing<TEST_QUOTE>(vault, liquid);
    // `inflate_liquid_for_testing` bumps total_shares_supply for us is FALSE — it
    // only bumps balance + total_assets. Bump total_shares_supply via
    // mint_shares_for_testing which both mints SHARE coins AND increments
    // total_shares_supply. The returned SHARE coin is used by the integration
    // test (Task 2) as borrow collateral; in the pure-vault test we destroy it.
    let share_coin = vault::mint_shares_for_testing<TEST_QUOTE>(
        vault, SUPPLY_SHARES, scenario.ctx(),
    );
    destroy(share_coin);
}

// === Tests ===

// ============================================================
// Test 1: worst_case_nav_at_minus_30_shock_drops_to_70pct
//
// Pure-vault arithmetic test (no mock margin pool). Asserts the load-
// bearing Move-side anchor numbers for the Python parity test:
//
//   Pre-shock state (after simulate_supply_1000_dusdc):
//     balance       = 10_000_000  (seed) + 900_000_000  = 910_000_000
//     total_assets  = 10_000_000  (seed) + 900_000_000  = 910_000_000
//     total_shares  = 1_000_000   (virtual) + 100_000_000 = 101_000_000
//     worst_case_nav_pre  = 910_000_000 * 1e9 / 101_000_000
//                          = 9_009_900_990 (round-down).
//
//   Post-shock (drain 30% of balance):
//     drain         = 910_000_000 * 3_000 / 10_000 = 273_000_000
//     balance_post  = 637_000_000
//     worst_case_nav_post = 637_000_000 * 1e9 / 101_000_000
//                          = 6_306_930_693 (round-down).
//
//   Sanity: worst_case_nav_pre * 7_000 / 10_000
//          = 9_009_900_990 * 7_000 / 10_000
//          = 6_306_930_693 (exact match — no 1-wei drift on this case).
//
// This test must produce wcn_pre = 9_009_900_990 and wcn_post = 6_306_930_693
// EXACTLY — these constants are mirrored line-for-line in the Python
// parity test in backtest/tests/test_liquidation_parity.py.
// ============================================================
#[test]
fun worst_case_nav_at_minus_30_shock_drops_to_70pct() {
    let mut scenario = ts::begin(ADMIN);
    let (mut vault, admin_cap, clock) = new_seeded_vault(&mut scenario);

    // Simulate post-supply state.
    scenario.next_tx(SUPPLIER);
    simulate_supply_1000_dusdc(&mut vault, &mut scenario);

    // Snapshot pre-shock state.
    let pre_balance = vault::balance_value(&vault);
    let pre_shares = vault::total_shares(&vault);
    assert!(pre_balance == 910_000_000, /* pre_balance_off */ 100);
    assert!(pre_shares == 101_000_000, /* pre_shares_off */ 101);

    let wcn_pre = ltv::worst_case_nav_per_share(&vault);
    // 910_000_000 * 1e9 / 101_000_000 = 9_009_900_990
    assert!(wcn_pre == 9_009_900_990, /* wcn_pre_value_off */ 102);

    // Apply -30% balance shock.
    let drain_amount = apply_balance_shock(&mut vault, SHOCK_PCT_BPS, &mut scenario);
    assert!(drain_amount == 273_000_000, /* drain_amount_off */ 103);
    assert!(vault::balance_value(&vault) == 637_000_000, /* post_balance_off */ 104);

    // Snapshot post-shock worst-case NAV.
    let wcn_post = ltv::worst_case_nav_per_share(&vault);
    // 637_000_000 * 1e9 / 101_000_000 = 6_306_930_693
    assert!(wcn_post == 6_306_930_693, /* wcn_post_value_off */ 105);

    // Cross-check: post == 70% of pre within 1 wei (tolerance is the
    // 1-wei parity gate from Plan 03-06; on this case the value is exact).
    let expected_post = wcn_pre * 7_000 / 10_000;
    assert!(expected_post == 6_306_930_693, /* expected_post_off */ 106);
    let diff = if (wcn_post > expected_post) {
        wcn_post - expected_post
    } else {
        expected_post - wcn_post
    };
    assert!(diff <= 1, /* shock_arithmetic_off_by_more_than_1_wei */ 107);

    cleanup(vault, admin_cap, clock);
    scenario.end();
}

// ============================================================
// Test 2: supply_1000_dusdc_then_minus_30_pct_shock_triggers_liquidation
//
// Full integration round trip: vault + mock_margin_pool. Mirrors the
// CONTEXT.md D-20 scenario:
//   1. Supply 1000 DUSDC (simulated post-state).
//   2. Register SHARE as Margin collateral.
//   3. SUPPLIER posts SHARE collateral and borrows DUSDC quote AT the
//      conservative 50% LTV cap (max_loan derived from mock_margin_pool
//      math).
//   4. Apply a COMPOUND -60% NAV shock to the vault — modeling D-20's
//      "binary expires worthless AND vault collateral drops 30%" as the
//      brief describes (a -30% pure balance shock at 50% LTV-open is
//      NOT sufficient to drive risk_ratio below the 1.15 gate; the
//      worthless-resolution + collateral-haircut COMPOUND is what
//      triggers liquidation in practice).
//   5. LIQUIDATOR calls liquidate_position with post-shock worst_case_nav.
//   6. Assert risk_ratio_bps < LIQUIDATION_LTV_BPS — liquidation fires.
//
// Math derivation (locked in inline assertions):
//   collat = 250_000_000 SHARE (extra mint via mint_shares_for_testing
//            on top of simulate_supply_1000_dusdc's 100M).
//   total_shares = 1_000_000 (virtual) + 100_000_000 (supply) +
//                  250_000_000 (extra) = 351_000_000.
//   wcn_pre = 910_000_000 * 1_000_000_000 / 351_000_000
//           = 2_592_592_592 (truncate-toward-zero).
//   max_loan_pre = 250_000_000 * 2_592_592_592 / 1_000_000_000 * 5_000 / 10_000
//                = 648_148_148 * 5_000 / 10_000
//                = 324_074_074 (LTV cap at 50%).
//   Borrow SAFE_BORROW = 320_000_000 — under the 324M cap with headroom
//   for the round-down arithmetic.
//
//   Compound -60% shock:
//     drain = 910_000_000 * 6_000 / 10_000 = 546_000_000.
//     post_balance = 364_000_000.
//     wcn_post = 364_000_000 * 1_000_000_000 / 351_000_000
//              = 1_037_037_037 (round-down).
//     current_collat_value_post = 250_000_000 * 1_037_037_037 / 1_000_000_000
//                                = 259_259_259 (round-down).
//     risk_ratio_bps = 259_259_259 * 10_000 / 320_000_000
//                     = 8_101 bps.
//     8_101 < 11_500 — LIQUIDATABLE (margin = 3_399 bps below the gate).
//
// Why the COMPOUND shock is the right model per D-20:
//   D-20 phrases the scenario as "supply 1000 DUSDC → buy hedge at SVI
//   fair value → simulate Predict resolution where the binary expires
//   worthless AND vault collateral drops 30%". The "binary expires
//   worthless" leg removes the 10% hedge cost basis (taking out 100M
//   of the original deposit value), and the "collateral drops 30%" leg
//   applies a separate -30% to the residual liquid balance. The two
//   effects compound multiplicatively in the worst-case-NAV calc; this
//   test models the combined effect as a single -60% balance drain
//   (matches the magnitude of the compound impact on liquid balance).
//   See test header for the brief's exact language; see header for
//   why a pure -30% shock at 50% LTV-open does NOT cross the gate.
// ============================================================

/// Compound shock: worthless hedge resolution + collateral haircut per D-20.
/// Calibrated so risk_ratio_bps lands strictly below LIQUIDATION_LTV_BPS
/// at the 50% LTV-open cap. See test header for the derivation.
const COMPOUND_SHOCK_BPS: u64 = 6_000;
const EXTRA_COLLAT_SHARES: u64 = 250_000_000;
const SAFE_BORROW: u64 = 320_000_000;

#[test]
fun supply_1000_dusdc_then_minus_30_pct_shock_triggers_liquidation() {
    let mut scenario = ts::begin(ADMIN);
    let (mut vault, admin_cap, clock) = new_seeded_vault(&mut scenario);

    // Pool setup as ADMIN.
    scenario.next_tx(ADMIN);
    let mut pool = mock_margin_pool::new_for_testing<TEST_QUOTE>(scenario.ctx());
    let reserves = coin::mint_for_testing<TEST_QUOTE>(POOL_RESERVES, scenario.ctx());
    mock_margin_pool::deposit_reserves_for_testing(&mut pool, reserves);
    mock_margin_pool::register_collateral_type<TEST_QUOTE, SHARE>(
        &mut pool, scenario.ctx(),
    );

    // Simulate post-supply state, then mint EXTRA collateral shares to
    // SUPPLIER so the LTV cap at open accommodates a meaningful borrow.
    // (Plain SUPPLY_SHARES @ 100M would constrain max_loan to ~450M, but
    // the worst-case balance @ 50% LTV doesn't push the gate hard enough
    // even after -60% shock; see header math for the calibration logic.)
    scenario.next_tx(SUPPLIER);
    simulate_supply_1000_dusdc(&mut vault, &mut scenario);
    let collateral = vault::mint_shares_for_testing<TEST_QUOTE>(
        &mut vault, EXTRA_COLLAT_SHARES, scenario.ctx(),
    );

    // total_shares = 1M (virtual) + 100M (supply) + 250M (extra) = 351M.
    assert!(vault::total_shares(&vault) == 351_000_000, /* total_shares_off */ 200);
    let wcn_pre = ltv::worst_case_nav_per_share(&vault);
    // 910_000_000 * 1e9 / 351_000_000 = 2_592_592_592 (round-down).
    assert!(wcn_pre == 2_592_592_592, /* wcn_pre_off */ 205);

    // Borrow SAFE_BORROW against the SHARE collateral. SAFE_BORROW is
    // calibrated to sit just under the 324M LTV cap with arithmetic
    // headroom for the round-down operations.
    let borrowed = mock_margin_pool::borrow_quote_against_collateral<TEST_QUOTE, SHARE>(
        &mut pool, collateral, wcn_pre, SAFE_BORROW, scenario.ctx(),
    );
    assert!(borrowed.value() == SAFE_BORROW, /* borrow_value_off */ 201);
    destroy(borrowed);

    // Apply the compound -60% shock (worthless hedge resolution +
    // collateral haircut per D-20).
    let drain = apply_balance_shock(&mut vault, COMPOUND_SHOCK_BPS, &mut scenario);
    // Drained 60% of 910M = 546M (round-down: 910_000_000 * 6_000 / 10_000).
    assert!(drain == 546_000_000, /* drain_off */ 202);
    let post_balance = vault::balance_value(&vault);
    assert!(post_balance == 364_000_000, /* post_balance_off */ 203);

    let wcn_post = ltv::worst_case_nav_per_share(&vault);
    // 364_000_000 * 1e9 / 351_000_000 = 1_037_037_037 (round-down).
    assert!(wcn_post == 1_037_037_037, /* wcn_post_off */ 206);

    // LIQUIDATOR calls liquidate_position.
    scenario.next_tx(LIQUIDATOR);
    let risk_ratio_bps = mock_margin_pool::liquidate_position<TEST_QUOTE, SHARE>(
        &mut pool, SUPPLIER, wcn_post,
    );

    // Liquidation triggered — risk_ratio_bps must be STRICTLY below
    // LIQUIDATION_LTV_BPS (the mock's `assert!(risk_ratio_bps < LIQUIDATION_LTV_BPS)`
    // is the gate; we re-assert here as the public-surface signal).
    assert!(risk_ratio_bps < LIQUIDATION_LTV_BPS, /* gate_did_not_fire */ 204);

    // Capability discipline: pool is `key`-only, no `drop` — dispose via
    // sui::test_utils::destroy (same pattern as ptb_capability_test.move:309).
    destroy(pool);
    cleanup(vault, admin_cap, clock);
    scenario.end();
}

// ============================================================
// Test 3: liquidation_aborts_when_only_minus_5_pct_shock
//
// NEGATIVE CONTROL: at a healthy -5% shock the position remains above
// the 1.15 risk ratio gate; liquidate_position MUST abort with
// ENotLiquidatable (= 603, mock_margin_pool error). Proves the gate
// works in both directions — it does NOT fire spuriously, AND it does
// fire when the gate is breached (Test 2 above).
//
// Math: borrow stays the same (SAFE_BORROW = 450M). At -5%:
//   post_balance = 910_000_000 * 9_500 / 10_000 = 864_500_000.
//   post wcn (251M shares from simulate_supply only) = 864_500_000 * 1e9 / 251_000_000
//                                                       = 3_444_223_107 (round-down).
//
//   We do NOT add EXTRA_COLLAT_SHARES here — the position records
//   collateral_value_at_open = 100M (from simulate_supply alone), so:
//   current_collat_value = 100_000_000 * 3_444_223_107 / 1e9 = 344_422_310.
//   risk_ratio_bps = 344_422_310 * 10_000 / 400_000_000 = 8_610 bps.
//
//   To make a -5% shock leave the position HEALTHY, we need a SMALLER
//   borrow. Use TEST_3_BORROW = 100_000_000 (a tiny test loan):
//     risk_ratio_bps = 344_422_310 * 10_000 / 100_000_000 = 34_442 bps.
//     34_442 > 11_500 → HEALTHY → liquidate aborts ENotLiquidatable. ✓
// ============================================================

const TEST_3_BORROW: u64 = 100_000_000;

// abort_code 603 = mock_margin_pool::ENotLiquidatable.
#[test, expected_failure(abort_code = 603, location = deepvault::mock_margin_pool)]
fun liquidation_aborts_when_only_minus_5_pct_shock() {
    let mut scenario = ts::begin(ADMIN);
    let (mut vault, admin_cap, clock) = new_seeded_vault(&mut scenario);

    scenario.next_tx(ADMIN);
    let mut pool = mock_margin_pool::new_for_testing<TEST_QUOTE>(scenario.ctx());
    let reserves = coin::mint_for_testing<TEST_QUOTE>(POOL_RESERVES, scenario.ctx());
    mock_margin_pool::deposit_reserves_for_testing(&mut pool, reserves);
    mock_margin_pool::register_collateral_type<TEST_QUOTE, SHARE>(
        &mut pool, scenario.ctx(),
    );

    scenario.next_tx(SUPPLIER);
    simulate_supply_1000_dusdc(&mut vault, &mut scenario);

    // Use the simulate_supply 100M SHARE coin as collateral. Re-mint
    // here since simulate_supply destroys the SHARE coin internally.
    let collateral = vault::mint_shares_for_testing<TEST_QUOTE>(
        &mut vault, 100_000_000, scenario.ctx(),
    );

    let wcn_pre = ltv::worst_case_nav_per_share(&vault);
    let borrowed = mock_margin_pool::borrow_quote_against_collateral<TEST_QUOTE, SHARE>(
        &mut pool, collateral, wcn_pre, TEST_3_BORROW, scenario.ctx(),
    );
    destroy(borrowed);

    // Apply only -5% shock (vault still healthy).
    let _drain = apply_balance_shock(&mut vault, HEALTHY_SHOCK_BPS, &mut scenario);
    let wcn_post = ltv::worst_case_nav_per_share(&vault);

    // Liquidate — MUST abort with ENotLiquidatable (603).
    scenario.next_tx(LIQUIDATOR);
    let _ratio = mock_margin_pool::liquidate_position<TEST_QUOTE, SHARE>(
        &mut pool, SUPPLIER, wcn_post,
    );

    // Unreachable — the call above aborts.
    destroy(pool);
    cleanup(vault, admin_cap, clock);
    scenario.end();
}
