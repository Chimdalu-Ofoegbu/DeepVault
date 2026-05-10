// Copyright (c) DeepVault.
// SPDX-License-Identifier: MIT
//
// Hedge purchase and roll. Calls predict_adapter::mint at the SVI fair
// value (D-09); enforces max_price_premium_bps abstain (Pitfall 2);
// permissionless roll_expiring (D-08). Closes VAULT-05 (rebalance
// portion).
//
// W3 LOCK (Plan 02-04 amendment): predict::mint pulls payment via
// `manager.withdraw<Quote>(cost, ctx).into_balance()` (predict.move:248).
// `buy_hedge_for_deposit` therefore deposits the hedge_alloc Coin into
// the PredictManager BEFORE calling predict_adapter::mint. The Coin is
// consumed by predict_manager::deposit; no `coin::destroy_zero` is
// necessary.
//
// Roll-path note: predict::redeem deposits payout BACK into the manager
// (predict.move:296: `manager.deposit(payout_coin, ctx)`). On the roll
// path the manager balance is therefore already funded by the redeem
// step before the new mint runs.

/// Hedge purchase + roll (atomic with supply.move; permissionless roll).
module deepvault::rebalance;

use deepbook_predict::market_key::{Self, MarketKey};
use deepbook_predict::oracle::{Self, OracleSVI};
use deepbook_predict::predict::{Self, Predict};
use deepbook_predict::predict_manager::{Self, PredictManager};
use deepvault::math;
use deepvault::predict_adapter;
use deepvault::strategy_constants;
use deepvault::svi_view;
use deepvault::vault::{Self, Vault};
use sui::clock::Clock;
use sui::coin::Coin;
use sui::event;

// === Errors ===
// Reserved 400-499 for rebalance.move per PATTERNS.md "Error Handling".

const EHedgeRegistryFull: u64 = 400;
const EPredictMisquote: u64 = 401;
const EZeroQuantity: u64 = 402;
const EFairValueZero: u64 = 403;

// === Constants ===

/// Defensive cap on the hedge-registry size (Pitfall 3). The roll path
/// consolidates by MarketKey so the registry is bounded in normal
/// operation; this is a backstop against pathological mint patterns.
const HEDGE_REGISTRY_CAP: u64 = 100;

/// FLOAT_SCALING for fair-value comparisons. Matches Phase 1
/// svi_view::binary_price output and shared/svi-spec.md sec 1 "Scale".
const FLOAT_SCALING: u64 = 1_000_000_000;

// === Events ===

public struct HedgeMinted has copy, drop, store {
    vault_id: ID,
    market_key: MarketKey,
    quantity: u64,
    cost_basis_quote: u64,
    strike: u64,
    expiry_ms: u64,
}

public struct HedgeRolled has copy, drop, store {
    vault_id: ID,
    old_key: MarketKey,
    new_key: MarketKey,
}

// === Public Functions ===

/// Permissionless hedge roll (D-08). Anyone can call; caller pays gas.
///
/// Iterates `vault.hedge_keys`; for each MarketKey whose remaining time
/// to expiry is below the roll trigger window
/// (`roll_trigger_seconds`, default 2 days per D-03), redeem the old
/// position via predict_adapter::redeem and mint a fresh -15% OTM 14-day
/// replacement at the current SVI fair value.
///
/// W3 note: on the roll path, predict::redeem deposits the payout back
/// into the PredictManager balance (predict.move:296), so the manager
/// is already funded for the subsequent predict::mint without an
/// explicit predict_manager::deposit call. Only `buy_hedge_for_deposit`
/// (the supply path) needs the W3-locked deposit-before-mint sequence.
public fun roll_expiring<Quote>(
    vault: &mut Vault<Quote>,
    predict: &mut Predict,
    predict_manager: &mut PredictManager,
    oracle: &OracleSVI,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let now_ms = clock.timestamp_ms();
    let trigger_ms = strategy_constants::roll_trigger_seconds() * 1_000;

    // First pass: identify keys expiring within the trigger window.
    // Avoid mutating the Table while iterating over its parallel index.
    let mut to_roll = vector[];
    let keys_ref = vault::hedge_keys_ref(vault);
    let n = keys_ref.length();
    let mut i = 0;
    while (i < n) {
        let key = keys_ref[i];
        let h = vault::hedges_ref(vault).borrow(key);
        if (vault::hedge_expiry_ms(h) < now_ms + trigger_ms) {
            to_roll.push_back(key);
        };
        i = i + 1;
    };

    // Second pass: redeem old, mint new at fresh fair value.
    let m = to_roll.length();
    let mut j = 0;
    while (j < m) {
        let old_key = to_roll[j];

        // Remove from registry table + parallel index.
        let old = vault::hedges_mut(vault).remove(old_key);
        let (found, idx) = vector::index_of(vault::hedge_keys_ref(vault), &old_key);
        if (found) {
            vector::remove(vault::hedge_keys_mut(vault), idx);
        };

        let old_quantity = vault::hedge_quantity(&old);
        let alloc_value = vault::hedge_cost_basis(&old);

        // Close old position. Payout lands back in PredictManager.balance
        // (predict.move:294-296: manager.deposit(payout_coin, ctx)).
        predict_adapter::redeem<Quote>(
            predict,
            predict_manager,
            oracle,
            old_key,
            old_quantity,
            clock,
            ctx,
        );

        // Mint replacement at fresh -15% OTM / +14d / fresh fair value.
        // alloc_value is the original cost basis carried forward (sizing
        // anchor); the actual Coin movement is internal to PredictManager.
        // Reads effective_* so admin_tune_strategy mutations take effect
        // on the next roll (Plan 02-06 D-11.3).
        let forward = oracle::forward_price(oracle);
        let strike = math::mul_div_round_down(
            forward,
            10_000 - vault::effective_strike_otm_bps(vault),
            10_000,
        );
        let expiry_ms = now_ms + vault::effective_tenor_seconds(vault) * 1_000;
        let fair_value = svi_view::binary_price(oracle, strike);
        assert!(fair_value > 0, EFairValueZero);

        let oracle_id = oracle::id(oracle);
        let new_key = market_key::down(oracle_id, expiry_ms, strike);
        let new_quantity = math::mul_div_round_down(alloc_value, FLOAT_SCALING, fair_value);
        assert!(new_quantity > 0, EZeroQuantity);

        // Misquote check on roll path (Pitfall 2). Per-unit comparison
        // uses `predict::get_trade_amounts(..., qty=1, ...)` so the units
        // align with svi_view::binary_price (per-unit at FLOAT_SCALING).
        let (predict_ask_unit, _) = predict::get_trade_amounts(
            predict,
            oracle,
            new_key,
            1,
            clock,
        );
        assert!(
            (predict_ask_unit as u128) * 10_000u128
                <= (fair_value as u128)
                    * ((10_000 + strategy_constants::max_price_premium_bps()) as u128),
            EPredictMisquote,
        );

        predict_adapter::mint<Quote>(
            predict,
            predict_manager,
            oracle,
            new_key,
            new_quantity,
            clock,
            ctx,
        );

        insert_or_consolidate_hedge(
            vault,
            new_key,
            oracle_id,
            strike,
            expiry_ms,
            new_quantity,
            alloc_value,
        );

        event::emit(HedgeRolled {
            vault_id: object::id(vault),
            old_key,
            new_key,
        });

        j = j + 1;
    };
}

// === Public-Package Functions ===

/// Atomic hedge purchase invoked by supply.move's supply<Quote> end-leg.
/// D-06: this is the "internal call from supply" that closes the atomic
/// supply+hedge story. Aborts on:
/// - `EPredictMisquote` if Predict's quoted ask exceeds SVI fair value
///   by more than `max_price_premium_bps` (Pitfall 2 abstain).
/// - `EHedgeRegistryFull` if the registry has reached `HEDGE_REGISTRY_CAP`.
/// - Predict-internal aborts (oracle stale 30s gate, ask out of bounds,
///   exposure cap hit) propagate via Move tx atomicity (D-07).
public(package) fun buy_hedge_for_deposit<Quote>(
    vault: &mut Vault<Quote>,
    predict: &mut Predict,
    predict_manager: &mut PredictManager,
    oracle: &OracleSVI,
    hedge_alloc: Coin<Quote>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let alloc_value = hedge_alloc.value();
    assert!(alloc_value > 0, EZeroQuantity);
    assert!(
        vector::length(vault::hedge_keys_ref(vault)) < HEDGE_REGISTRY_CAP,
        EHedgeRegistryFull,
    );

    // 1. Compute strike at -15% OTM (D-02). forward at FLOAT_SCALING.
    // Reads effective_* so admin_tune_strategy mutations apply to the
    // next supply call (Plan 02-06 D-11.3).
    let forward = oracle::forward_price(oracle);
    let strike = math::mul_div_round_down(
        forward,
        10_000 - vault::effective_strike_otm_bps(vault),
        10_000,
    );

    // 2. Compute expiry at +14d (D-03).
    let expiry_ms = clock.timestamp_ms() + vault::effective_tenor_seconds(vault) * 1_000;

    // 3. SVI fair value (Phase 1 evaluator) — used for misquote check + sizing.
    let fair_value = svi_view::binary_price(oracle, strike);
    assert!(fair_value > 0, EFairValueZero);

    // 4. MarketKey for the DOWN binary at strike + expiry.
    let oracle_id = oracle::id(oracle);
    let key = market_key::down(oracle_id, expiry_ms, strike);

    // 5. Size the position from notional / fair_value.
    // alloc_value (quote-decimals) * FLOAT_SCALING / fair_value (FLOAT_SCALING)
    // = quantity at quote-decimals scale.
    let quantity = math::mul_div_round_down(alloc_value, FLOAT_SCALING, fair_value);
    assert!(quantity > 0, EZeroQuantity);

    // 6. Misquote check (Pitfall 2). Per-unit comparison using qty=1 so
    // the units align with svi_view::binary_price.
    let (predict_ask_unit, _) = predict::get_trade_amounts(predict, oracle, key, 1, clock);
    let max_premium_bps = strategy_constants::max_price_premium_bps();
    assert!(
        (predict_ask_unit as u128) * 10_000u128
            <= (fair_value as u128) * ((10_000 + max_premium_bps) as u128),
        EPredictMisquote,
    );

    // 7. W3 LOCK: fund the PredictManager from the hedge_alloc Coin BEFORE
    //    predict_adapter::mint runs. predict::mint internally calls
    //    `manager.withdraw<Quote>(cost, ctx).into_balance()` against this
    //    just-deposited balance (predict.move:248-249). The Coin is
    //    consumed by predict_manager::deposit; no `coin::destroy_zero`.
    predict_manager::deposit<Quote>(predict_manager, hedge_alloc, ctx);

    // 8. Mint via thin adapter (single-file blast radius for Pitfall 6).
    predict_adapter::mint<Quote>(
        predict,
        predict_manager,
        oracle,
        key,
        quantity,
        clock,
        ctx,
    );

    // 9. Insert / consolidate in the per-vault hedge registry.
    insert_or_consolidate_hedge(
        vault,
        key,
        oracle_id,
        strike,
        expiry_ms,
        quantity,
        alloc_value,
    );

    event::emit(HedgeMinted {
        vault_id: object::id(vault),
        market_key: key,
        quantity,
        cost_basis_quote: alloc_value,
        strike,
        expiry_ms,
    });
}

/// Insert a hedge at MarketKey or consolidate with an existing entry
/// (Pitfall 3 mitigation). MarketKey equality by (oracle_id, expiry,
/// strike, direction) so identical -15% OTM 14d hedges from sequential
/// suppliers consolidate into a single registry row.
public(package) fun insert_or_consolidate_hedge<Quote>(
    vault: &mut Vault<Quote>,
    key: MarketKey,
    oracle_id: ID,
    strike: u64,
    expiry_ms: u64,
    quantity: u64,
    cost_basis: u64,
) {
    if (vault::hedges_ref(vault).contains(key)) {
        let existing = vault::hedges_mut(vault).borrow_mut(key);
        let updated_qty = vault::hedge_quantity(existing) + quantity;
        let updated_cost = vault::hedge_cost_basis(existing) + cost_basis;
        let updated_notional = vault::hedge_notional(existing) + quantity;
        // HedgePosition has copy+drop+store; rebuild and overwrite.
        *existing =
            vault::new_hedge_position(
                oracle_id,
                strike,
                expiry_ms,
                updated_notional,
                updated_cost,
                updated_qty,
            );
    } else {
        let h =
            vault::new_hedge_position(oracle_id, strike, expiry_ms, quantity, cost_basis, quantity);
        vault::hedges_mut(vault).add(key, h);
        vault::hedge_keys_mut(vault).push_back(key);
    };
}
