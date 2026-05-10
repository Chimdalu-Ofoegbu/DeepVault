// Copyright (c) DeepVault.
// SPDX-License-Identifier: MIT
//
// Atomic supply path: deposit Coin<Quote>, mint Coin<SHARE>, purchase
// binary hedge via predict_adapter::mint — all in one Move transaction.
// Closes VAULT-03 + the supply portion of VAULT-05.
//
// Per WAVE0-DECISION.md option (b) — supplier-owned PredictManager — the
// supplier brings their own &mut PredictManager. The vault never owns a
// manager; predict::mint's `ctx.sender() == manager.owner()` assert
// (predict.move:228) holds because the supplier signed the PTB.
//
// Per CONTEXT.md D-06: vault::supply ends with an internal call to
// rebalance::buy_hedge_for_deposit in the same Move tx. Per D-07:
// abort propagation reverts the whole supply if predict::mint fails
// (oracle stale, ask out of bounds, exposure cap hit).

/// Atomic supply + hedge entry.
module deepvault::supply;

use deepbook_predict::oracle::OracleSVI;
use deepbook_predict::predict::Predict;
use deepbook_predict::predict_manager::PredictManager;
use deepvault::helpers::math;
use deepvault::rebalance;
use deepvault::strategy_constants;
use deepvault::vault::{Self, Vault};
use sui::balance::Balance;
use sui::clock::Clock;
use sui::coin::{Self, Coin};
use sui::event;

// === Errors ===
// Reserved 200-299 for supply.move per PATTERNS.md "Error Handling".

const ESupplyPaused: u64 = 200;
const EZeroSharesMinted: u64 = 201;
const EShareOverflow: u64 = 202;
const EZeroAmount: u64 = 203;

// === Events ===

/// Emitted on every successful supply. `hedge_alloc_quote` is the 10%
/// allocation forwarded to predict_adapter::mint; the remainder is
/// joined into vault.balance.
public struct Supplied has copy, drop, store {
    vault_id: ID,
    depositor: address,
    deposit_quote: u64,
    shares_minted: u64,
    hedge_alloc_quote: u64,
}

// === Public Functions ===

/// Atomic supply + hedge entry. `public fun` (NOT `entry`) per RESEARCH.md
/// Pattern 3 — keeps PTB chaining open for Phase 4's two-protocol PTB.
///
/// Per WAVE0-DECISION.md option (b), the supplier passes their own
/// &mut PredictManager. predict::mint asserts ctx.sender() == manager.owner.
public fun supply<Quote>(
    vault: &mut Vault<Quote>,
    predict: &mut Predict,
    predict_manager: &mut PredictManager,
    oracle: &OracleSVI,
    deposit: Coin<Quote>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let amount = deposit.value();
    let shares_to_mint = validate_supply_preconditions(vault, amount);

    // Split: hedge_alloc (10% per D-01) goes to predict_adapter::mint via
    // PredictManager; remainder lands in vault.balance. Reads the
    // effective allocation_bps so admin_tune_strategy mutations take
    // effect on the next supply call (Plan 02-06 D-11.3).
    let hedge_alloc_bps = vault::effective_hedge_alloc_bps(vault);
    let hedge_amount = math::mul_div_round_down(amount, hedge_alloc_bps, 10_000);
    let mut deposit_balance: Balance<Quote> = deposit.into_balance();
    let hedge_balance = deposit_balance.split(hedge_amount);
    let hedge_alloc_value = hedge_balance.value();

    // Atomic hedge purchase. Aborts whole tx on Predict's 30s staleness gate
    // (oracle_config::assert_live_oracle) or our max_price_premium_bps abstain.
    // Bind the Coin to a local before the call so the &mut TxContext borrow
    // for `coin::from_balance` releases cleanly before being re-borrowed by
    // the rebalance call.
    let hedge_coin = coin::from_balance(hedge_balance, ctx);
    rebalance::buy_hedge_for_deposit<Quote>(
        vault,
        predict,
        predict_manager,
        oracle,
        hedge_coin,
        clock,
        ctx,
    );

    // Update vault accounting. total_assets accounts for the FULL deposit
    // (vault tracks both legs — the hedge cost basis is recorded against
    // the registry by rebalance::insert_or_consolidate_hedge).
    vault::balance_mut(vault).join(deposit_balance);
    vault::add_total_assets(vault, amount);
    vault::add_total_shares(vault, shares_to_mint);

    // Mint share coin and transfer to depositor.
    let share_coin = coin::mint(vault::treasury_cap_mut(vault), shares_to_mint, ctx);
    transfer::public_transfer(share_coin, ctx.sender());

    event::emit(Supplied {
        vault_id: object::id(vault),
        depositor: ctx.sender(),
        deposit_quote: amount,
        shares_minted: shares_to_mint,
        hedge_alloc_quote: hedge_alloc_value,
    });
}

// === Public-Package Functions ===

/// Runs the three Move-internal assertions guarding `supply` BEFORE any
/// Predict objects are touched. Extracted so unit tests can exercise the
/// abort paths without constructing a live Predict shared object (which
/// is only viable in the Plan 02-09 E2E script).
///
/// Aborts with:
/// - `ESupplyPaused` if vault is paused (D-10).
/// - `EZeroAmount` if deposit amount is 0.
/// - `EZeroSharesMinted` if rounding produces 0 shares for this deposit.
///
/// Returns the shares-to-mint computed via virtual-shares math.
public(package) fun validate_supply_preconditions<Quote>(
    vault: &Vault<Quote>,
    amount: u64,
): u64 {
    assert!(!vault::is_paused(vault), ESupplyPaused);
    assert!(amount > 0, EZeroAmount);
    let shares_to_mint = compute_shares_to_mint(vault, amount);
    assert!(shares_to_mint > 0, EZeroSharesMinted);
    shares_to_mint
}

/// Virtual-shares math (OpenZeppelin ERC-4626 v5).
///
/// Formula: `(deposit * (total_shares + virtual_shares)) / (total_assets + 1)`.
/// Truncate-toward-zero division rounds DOWN, in vault's favor (Pitfall 12).
/// u128 intermediates everywhere; downcast guarded by EShareOverflow.
public(package) fun compute_shares_to_mint<Quote>(vault: &Vault<Quote>, deposit: u64): u64 {
    let virtual_shares = strategy_constants::virtual_shares();
    let numerator =
        (deposit as u128) * ((vault::total_shares(vault) as u128) + (virtual_shares as u128));
    let denominator = (vault::total_assets(vault) as u128) + 1u128;
    let shares = numerator / denominator;
    assert!(shares <= (std::u64::max_value!() as u128), EShareOverflow);
    shares as u64
}
