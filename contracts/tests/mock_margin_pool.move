// Copyright (c) DeepVault.
// SPDX-License-Identifier: MIT
//
// Test-only minimal Margin trait surface — proves architectural readiness
// for VAULT_SHARE-as-collateral (CONTEXT.md D-18) without waiting on
// Mysten governance whitelist (MARGIN-WHITELIST-DECISION.md selected
// UNDETERMINED-FALLBACK-TO-MOCK at 2026-05-12).
//
// This module ships in contracts/tests/ (NOT sources/) per PATTERNS.md —
// the #[test_only] attribute strips it from production builds; the mock
// pool can never leak into Vault state.
//
// Source patterns:
//   - scripts/deepbookv3/packages/deepbook_margin/sources/margin_manager.move
//     (borrow_quote signature shape — return-nothing / internal deposit;
//      our mock simplifies by RETURNING the borrowed Coin so the PTB
//      bridge step is exercisable in tests).
//   - scripts/deepbookv3/packages/deepbook_margin/tests/helper/test_helpers.move
//     (Mysten's own mock-pool test idiom).
//   - contracts/sources/predict_adapter.move (thin-adapter pattern).
//   - contracts/tests/integration_test.move (#[test_only] discipline).
//
// Capability discipline (Phase 2 share.move quarantine pattern):
//   NO public function returns Coin<Collat> by value except where the
//   value-flow is required (borrow burns collat into reserves; liquidate
//   surfaces seized collateral). NO public function returns &mut MockMarginPool
//   outside new_for_testing — the pool is created once per test scenario
//   and shared by reference.
//
// Plan 03-03 (RED phase: failing test stubs only).
// Plan 03-05 capability-flow tests + Plan 03-07 -30% NAV shock liquidation
// test build against this mock.

#[test_only]
module deepvault::mock_margin_pool;

use deepvault::share::SHARE;
use deepvault::vault_test::TEST_QUOTE;
use std::type_name::{Self, TypeName};
use sui::balance::{Self, Balance};
use sui::coin::{Self, Coin};
use sui::table::{Self, Table};
use sui::test_scenario as ts;
use sui::test_utils::destroy;
use sui::transfer;

// === Error codes (range 600-699; collision-free with vault 100-599) ===

const ENotRegistered: u64 = 600;
const EInsufficientCollateral: u64 = 601;
#[allow(unused_const)] // Reserved for GREEN-phase idempotency variant
const EAlreadyRegistered: u64 = 602;
const ENotLiquidatable: u64 = 603;
const ENoPosition: u64 = 604;

// === Constants ===

/// 1.15 risk ratio per Margin docs — liquidation triggers when current
/// collateral value / debt drops BELOW this threshold (bps).
const LIQUIDATION_LTV_BPS: u64 = 11_500;

/// 50% LTV cap (conservative test default; production Margin pools tune
/// per-collateral-type). max_loan = collat_value * nav * 0.5 / NAV_SCALE.
const MARGIN_LTV_CAP_BPS: u64 = 5_000;

/// 1e9 — matches strategy_constants::nav_scale() so worst-case NAV
/// inputs from deepvault::ltv compose cleanly into mock borrow math.
const NAV_SCALE: u64 = 1_000_000_000;

// === Structs ===

/// Minimal Margin trait surface for VAULT_SHARE-as-collateral demonstration.
/// `key` (no `store`) prevents accidental nesting into a Vault field —
/// the mock pool is a top-level shared/owned object only.
public struct MockMarginPool<phantom Quote> has key {
    id: UID,
    /// Reserves the mock lends out; tests deposit_reserves_for_testing
    /// before exercising the borrow path.
    quote_reserves: Balance<Quote>,
    /// type_name witness -> registered flag. Idempotent register semantics.
    registered_collateral: Table<TypeName, bool>,
    /// Per-borrower position state. Set by borrow, read by liquidate.
    positions: Table<address, Position>,
}

/// Internal bookkeeping. `drop` so liquidate can extract the inner
/// fields cleanly.
public struct Position has store, drop {
    /// Captured at borrow-open in collateral_value-units (the value the
    /// caller passed in via Coin<Collat>.value()). Liquidate scales this
    /// by current_worst_case_nav_per_share / NAV_SCALE for the risk-ratio
    /// comparison.
    collateral_value_at_open: u64,
    /// Quote-decimals loan amount.
    debt: u64,
}

// === Constructors (test-only helpers) ===

/// Build an empty pool. Bumps the test scenario context. Pool is returned
/// by value so the test scope owns transfer/share/destroy. No capability
/// is exposed.
public fun new_for_testing<Quote>(ctx: &mut TxContext): MockMarginPool<Quote> {
    MockMarginPool<Quote> {
        id: object::new(ctx),
        quote_reserves: balance::zero<Quote>(),
        registered_collateral: table::new<TypeName, bool>(ctx),
        positions: table::new<address, Position>(ctx),
    }
}

/// Deposit reserves so the borrow path has Coin<Quote> to lend. Test-only.
public fun deposit_reserves_for_testing<Quote>(
    pool: &mut MockMarginPool<Quote>,
    coin: Coin<Quote>,
) {
    balance::join(&mut pool.quote_reserves, coin::into_balance(coin));
}

// === Public API stubs (RED phase — bodies land in GREEN commit) ===

/// Register a collateral type by its TypeName witness. Idempotent
/// (second call against the same type is a no-op; planner's choice
/// per the plan body — preferred over abort-on-duplicate so test
/// orchestration is simpler).
public fun register_collateral_type<Quote, Collat>(
    _pool: &mut MockMarginPool<Quote>,
    _ctx: &mut TxContext,
) {
    abort 999 // RED stub
}

/// Mock borrow against collateral. Asserts Collat type is registered,
/// computes max_loan from worst_case_nav_per_share * collat_value * LTV cap,
/// records a Position, and returns Coin<Quote> from reserves.
///
/// Unlike production Margin::borrow_quote (which auto-deposits the borrowed
/// coin into BalanceManager), the mock RETURNS the coin so the 5-call PTB
/// bridge step is exercisable in tests.
public fun borrow_quote_against_collateral<Quote, Collat>(
    _pool: &mut MockMarginPool<Quote>,
    _collateral: Coin<Collat>,
    _worst_case_nav_per_share: u64,
    _loan_amount: u64,
    _ctx: &mut TxContext,
): Coin<Quote> {
    abort 999 // RED stub
}

/// Mock liquidation. Reads the borrower's open Position, scales
/// collateral_value_at_open by current_worst_case_nav_per_share / NAV_SCALE,
/// compares the resulting risk_ratio (bps) against LIQUIDATION_LTV_BPS.
/// Aborts ENotLiquidatable if the position is healthy; otherwise returns
/// the risk_ratio_bps (caller-visible signal that liquidation fired).
public fun liquidate_position<Quote, Collat>(
    _pool: &mut MockMarginPool<Quote>,
    _user: address,
    _current_worst_case_nav_per_share: u64,
): u64 {
    abort 999 // RED stub
}

// === Inline tests (RED — fail because public stubs abort 999) ===

const TEST_ADDR: address = @0xA1;

#[test]
fun new_for_testing_creates_empty_pool() {
    let mut scenario = ts::begin(TEST_ADDR);
    let pool = new_for_testing<TEST_QUOTE>(scenario.ctx());
    assert!(pool.quote_reserves.value() == 0, 0);
    assert!(pool.registered_collateral.is_empty(), 1);
    assert!(pool.positions.is_empty(), 2);
    transfer::transfer(pool, TEST_ADDR);
    scenario.end();
}

#[test]
fun register_collateral_type_adds_type_witness() {
    let mut scenario = ts::begin(TEST_ADDR);
    let mut pool = new_for_testing<TEST_QUOTE>(scenario.ctx());
    register_collateral_type<TEST_QUOTE, SHARE>(&mut pool, scenario.ctx());
    let collat_type = type_name::with_defining_ids<SHARE>();
    assert!(pool.registered_collateral.contains(collat_type), 100);
    assert!(*pool.registered_collateral.borrow(collat_type), 101);
    transfer::transfer(pool, TEST_ADDR);
    scenario.end();
}

#[test]
fun register_collateral_type_is_idempotent() {
    let mut scenario = ts::begin(TEST_ADDR);
    let mut pool = new_for_testing<TEST_QUOTE>(scenario.ctx());
    register_collateral_type<TEST_QUOTE, SHARE>(&mut pool, scenario.ctx());
    register_collateral_type<TEST_QUOTE, SHARE>(&mut pool, scenario.ctx());
    let collat_type = type_name::with_defining_ids<SHARE>();
    assert!(pool.registered_collateral.contains(collat_type), 200);
    transfer::transfer(pool, TEST_ADDR);
    scenario.end();
}

#[test]
fun borrow_quote_against_collateral_returns_coin_when_registered() {
    let mut scenario = ts::begin(TEST_ADDR);
    let mut pool = new_for_testing<TEST_QUOTE>(scenario.ctx());
    register_collateral_type<TEST_QUOTE, SHARE>(&mut pool, scenario.ctx());

    // Seed reserves so the borrow has something to extract.
    let reserves = coin::mint_for_testing<TEST_QUOTE>(1_000_000_000, scenario.ctx());
    deposit_reserves_for_testing<TEST_QUOTE>(&mut pool, reserves);

    // Collateral: 100 SHARE (in unit-quantity terms).
    let collateral = coin::mint_for_testing<SHARE>(100, scenario.ctx());
    let worst_case_nav: u64 = 10 * NAV_SCALE; // 10 quote/share at 1e9
    // Borrow 100 * 10 = 1000, * 0.5 LTV = 500. Borrow 400 (below cap).
    let borrowed = borrow_quote_against_collateral<TEST_QUOTE, SHARE>(
        &mut pool,
        collateral,
        worst_case_nav,
        400,
        scenario.ctx(),
    );
    assert!(borrowed.value() == 400, 300);

    destroy(borrowed);
    transfer::transfer(pool, TEST_ADDR);
    scenario.end();
}

#[test, expected_failure(abort_code = ENotRegistered)]
fun borrow_aborts_when_collateral_type_unregistered() {
    let mut scenario = ts::begin(TEST_ADDR);
    let mut pool = new_for_testing<TEST_QUOTE>(scenario.ctx());

    let reserves = coin::mint_for_testing<TEST_QUOTE>(1_000_000_000, scenario.ctx());
    deposit_reserves_for_testing<TEST_QUOTE>(&mut pool, reserves);

    let collateral = coin::mint_for_testing<SHARE>(100, scenario.ctx());
    // No register_collateral_type call — should abort.
    let _borrowed = borrow_quote_against_collateral<TEST_QUOTE, SHARE>(
        &mut pool,
        collateral,
        10 * NAV_SCALE,
        400,
        scenario.ctx(),
    );
    abort 0 // unreached
}

#[test, expected_failure(abort_code = EInsufficientCollateral)]
fun borrow_aborts_when_loan_exceeds_max_loan() {
    let mut scenario = ts::begin(TEST_ADDR);
    let mut pool = new_for_testing<TEST_QUOTE>(scenario.ctx());
    register_collateral_type<TEST_QUOTE, SHARE>(&mut pool, scenario.ctx());

    let reserves = coin::mint_for_testing<TEST_QUOTE>(1_000_000_000, scenario.ctx());
    deposit_reserves_for_testing<TEST_QUOTE>(&mut pool, reserves);

    let collateral = coin::mint_for_testing<SHARE>(100, scenario.ctx());
    // max_loan = 100 * 10e9 / 1e9 * 5000 / 10000 = 500. Ask 600 (over cap).
    let _borrowed = borrow_quote_against_collateral<TEST_QUOTE, SHARE>(
        &mut pool,
        collateral,
        10 * NAV_SCALE,
        600,
        scenario.ctx(),
    );
    abort 0
}

#[test, expected_failure(abort_code = ENotLiquidatable)]
fun liquidate_aborts_when_position_healthy() {
    let mut scenario = ts::begin(TEST_ADDR);
    let mut pool = new_for_testing<TEST_QUOTE>(scenario.ctx());
    register_collateral_type<TEST_QUOTE, SHARE>(&mut pool, scenario.ctx());

    let reserves = coin::mint_for_testing<TEST_QUOTE>(1_000_000_000, scenario.ctx());
    deposit_reserves_for_testing<TEST_QUOTE>(&mut pool, reserves);

    let collateral = coin::mint_for_testing<SHARE>(100, scenario.ctx());
    let borrowed = borrow_quote_against_collateral<TEST_QUOTE, SHARE>(
        &mut pool,
        collateral,
        10 * NAV_SCALE,
        400,
        scenario.ctx(),
    );
    destroy(borrowed);

    // current_nav == open_nav: risk_ratio = 100 * 10e9/1e9 = 1000 quote-units
    // collateral value; debt = 400; ratio_bps = 1000 * 10000 / 400 = 25_000 bps
    // 25000 > 11500 (LIQUIDATION_LTV_BPS) → HEALTHY → abort.
    let _ratio = liquidate_position<TEST_QUOTE, SHARE>(
        &mut pool,
        TEST_ADDR,
        10 * NAV_SCALE,
    );
    abort 0
}

#[test]
fun liquidate_returns_ratio_when_position_underwater() {
    let mut scenario = ts::begin(TEST_ADDR);
    let mut pool = new_for_testing<TEST_QUOTE>(scenario.ctx());
    register_collateral_type<TEST_QUOTE, SHARE>(&mut pool, scenario.ctx());

    let reserves = coin::mint_for_testing<TEST_QUOTE>(1_000_000_000, scenario.ctx());
    deposit_reserves_for_testing<TEST_QUOTE>(&mut pool, reserves);

    let collateral = coin::mint_for_testing<SHARE>(100, scenario.ctx());
    let borrowed = borrow_quote_against_collateral<TEST_QUOTE, SHARE>(
        &mut pool,
        collateral,
        10 * NAV_SCALE,
        400,
        scenario.ctx(),
    );
    destroy(borrowed);

    // Shock NAV to 0.04 quote/share (96% drop):
    //   collateral_now = 100 * (0.04 * 1e9) / 1e9 = 4 quote-units
    //   ratio_bps = 4 * 10000 / 400 = 100 bps (way below 11500 → liquidatable)
    let shocked_nav: u64 = 40_000_000; // 0.04 * 1e9
    let ratio = liquidate_position<TEST_QUOTE, SHARE>(
        &mut pool,
        TEST_ADDR,
        shocked_nav,
    );
    assert!(ratio < LIQUIDATION_LTV_BPS, 400);

    transfer::transfer(pool, TEST_ADDR);
    scenario.end();
}

#[test, expected_failure(abort_code = ENoPosition)]
fun liquidate_aborts_when_no_position_exists() {
    let mut scenario = ts::begin(TEST_ADDR);
    let mut pool = new_for_testing<TEST_QUOTE>(scenario.ctx());

    let _ratio = liquidate_position<TEST_QUOTE, SHARE>(
        &mut pool,
        TEST_ADDR,
        10 * NAV_SCALE,
    );
    abort 0
}
