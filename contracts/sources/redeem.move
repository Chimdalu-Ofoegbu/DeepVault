// Copyright (c) DeepVault.
// SPDX-License-Identifier: MIT
//
// Two-step withdrawal queue with per-user token-bucket limiter.
// Closes VAULT-04. D-01..D-05 from 02-CONTEXT.md.
//
// W1 lock: field/accessor names are `request_slots` / `rate_limiters` —
// the pre-W1 names are forbidden by the Plan 02-03 schema freeze.
// W2 lock: `RequestSlot.shares_escrowed` is `Balance<SHARE>` (NOT u64);
// the slot's Balance<SHARE> is the authoritative escrow store. Cancel
// returns it directly via `coin::from_balance`; partial fulfill uses
// `vault::request_split_shares`.

/// Two-step withdrawal queue + per-user token-bucket limiter.
module deepvault::redeem;

use deepvault::helpers::math;
use deepvault::helpers::rate_limiter::{Self, RateLimiter};
use deepvault::ltv;
use deepvault::share::SHARE;
use deepvault::strategy_constants;
use deepvault::vault::{Self, Vault};
use sui::balance::{Self, Balance};
use sui::clock::Clock;
use sui::coin::{Self, Coin};
use sui::event;

// === Errors ===
// Reserved 300-399 for redeem.move per PATTERNS.md "Error Handling".

const ERequestExists: u64 = 300;
const ERequestMissing: u64 = 301;
const ECooldownNotMet: u64 = 302;
const EInsufficientLiquidity: u64 = 303;
const EZeroSharesRequested: u64 = 304;

// === Constants ===

/// D-01: 1-hour cooldown between redeem_request and redeem_fulfill.
const COOLDOWN_MS: u64 = 3_600_000;

// === Events ===

public struct RedeemRequested has copy, drop, store {
    vault_id: ID,
    user: address,
    shares: u64,
    timestamp_ms: u64,
}

public struct RedeemFulfilled has copy, drop, store {
    vault_id: ID,
    user: address,
    shares_burned: u64,
    quote_paid: u64,
    remainder_shares: u64,
}

public struct RedeemCanceled has copy, drop, store {
    vault_id: ID,
    user: address,
    shares_returned: u64,
}

// === Public Functions ===

/// User locks Coin<SHARE> into a per-user RequestSlot and records the
/// timestamp. After the 1h cooldown (D-01), the user calls redeem_fulfill
/// to drain. D-02: per-user independent slot — second call by same user
/// before fulfill/cancel aborts with ERequestExists.
public fun redeem_request<Quote>(
    vault: &mut Vault<Quote>,
    shares: Coin<SHARE>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let user = ctx.sender();
    let amount = shares.value();
    assert!(amount > 0, EZeroSharesRequested);
    assert!(!vault::request_slots_mut(vault).contains(user), ERequestExists);

    let now_ms = clock.timestamp_ms();

    // W2 LOCK: convert Coin<SHARE> -> Balance<SHARE>; the Balance is the
    // authoritative escrow store inside the slot.
    let shares_balance: Balance<SHARE> = shares.into_balance();
    let slot = vault::new_request_slot(shares_balance, now_ms);
    vault::request_slots_mut(vault).add(user, slot);

    event::emit(RedeemRequested {
        vault_id: object::id(vault),
        user,
        shares: amount,
        timestamp_ms: now_ms,
    });
}

/// After cooldown, user drains the slot. Pays
///   min(pro_rata_NAV, bucket_avail, vault_liquid_quote).
/// D-03 liquidity-short: remainder stays escrowed; timestamp UNTOUCHED so
/// the user can re-call redeem_fulfill once liquidity returns without
/// resetting the cooldown. The slot is removed only when its
/// Balance<SHARE> reaches zero.
public fun redeem_fulfill<Quote>(
    vault: &mut Vault<Quote>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let user = ctx.sender();
    assert!(vault::request_slots_mut(vault).contains(user), ERequestMissing);

    let now_ms = clock.timestamp_ms();
    let outstanding;
    let slot_ts;
    {
        let slot_ref = vault::request_slots_mut(vault).borrow(user);
        slot_ts = vault::request_timestamp_ms(slot_ref);
        outstanding = vault::request_shares_value(slot_ref);
    };
    assert!(now_ms >= slot_ts + COOLDOWN_MS, ECooldownNotMet);
    assert!(outstanding > 0, EZeroSharesRequested);

    // pro_rata = outstanding * nav_per_share / NAV_SCALE (1e9).
    let nav = ltv::nav_per_share(vault);
    let pro_rata =
        math::mul_div_round_down(outstanding, nav, strategy_constants::nav_scale());

    let liquid = vault::balance_value(vault);

    // Bucket consume — lazy-init for first-time user.
    let bucket_avail;
    {
        let bucket = get_or_init_user_bucket(vault, user, clock);
        bucket_avail = rate_limiter::available_withdrawal(bucket, clock);
    };

    let payout = math::min(math::min(pro_rata, bucket_avail), liquid);
    assert!(payout > 0, EInsufficientLiquidity);

    {
        let bucket = vault::rate_limiters_mut(vault).borrow_mut(user);
        rate_limiter::consume(bucket, payout, clock);
    };

    // Compute shares to burn. Ceiling division favors the vault (Pitfall
    // 12) — burns at-least-enough shares to cover the payout so the
    // round-down-in-vault-favor invariant holds.
    // shares_consumed = ceil(payout * NAV_SCALE / nav).
    let shares_consumed = math::mul_div_round_up(
        payout,
        strategy_constants::nav_scale(),
        nav,
    );

    // Move quote payout from vault.balance to user.
    let payout_balance = vault::balance_mut(vault).split(payout);
    let payout_coin = coin::from_balance(payout_balance, ctx);
    transfer::public_transfer(payout_coin, user);

    // W2 LOCK: split shares_consumed off the slot's Balance<SHARE>, wrap
    // in Coin<SHARE>, burn via TreasuryCap.
    let burn_balance: Balance<SHARE>;
    {
        let slot_mut = vault::request_slots_mut(vault).borrow_mut(user);
        burn_balance = vault::request_split_shares(slot_mut, shares_consumed);
    };
    let burn_coin: Coin<SHARE> = coin::from_balance(burn_balance, ctx);
    coin::burn(vault::treasury_cap_mut(vault), burn_coin);

    // Update vault accounting.
    vault::sub_total_assets(vault, payout);
    vault::sub_total_shares(vault, shares_consumed);

    // If the slot's Balance<SHARE> is fully drained, destroy the slot.
    let remainder_after;
    {
        let slot_ref = vault::request_slots_mut(vault).borrow(user);
        remainder_after = vault::request_shares_value(slot_ref);
    };
    if (remainder_after == 0) {
        let slot = vault::request_slots_mut(vault).remove(user);
        let leftover_balance: Balance<SHARE> = vault::request_destroy(slot);
        // Must be zero (request_split_shares already drained it).
        balance::destroy_zero(leftover_balance);
    };
    // D-03: if remainder_after > 0, the slot's request_timestamp_ms is
    // INTENTIONALLY left untouched so the cooldown remains satisfied for
    // subsequent redeem_fulfill calls.

    event::emit(RedeemFulfilled {
        vault_id: object::id(vault),
        user,
        shares_burned: shares_consumed,
        quote_paid: payout,
        remainder_shares: remainder_after,
    });
}

/// D-04: user can cancel any time (before or after cooldown). Returns the
/// escrowed Coin<SHARE> back to the user and removes the slot.
public fun redeem_cancel<Quote>(
    vault: &mut Vault<Quote>,
    ctx: &mut TxContext,
) {
    let user = ctx.sender();
    assert!(vault::request_slots_mut(vault).contains(user), ERequestMissing);

    let slot = vault::request_slots_mut(vault).remove(user);
    // W2 LOCK: request_destroy returns the slot's Balance<SHARE>.
    let return_balance: Balance<SHARE> = vault::request_destroy(slot);
    let returned_amount = return_balance.value();
    let return_coin: Coin<SHARE> = coin::from_balance(return_balance, ctx);
    transfer::public_transfer(return_coin, user);

    event::emit(RedeemCanceled {
        vault_id: object::id(vault),
        user,
        shares_returned: returned_amount,
    });
}

// === Public-Package Functions ===

/// Lazy-init per-user RateLimiter on first redeem_fulfill. Bucket starts
/// FULL via `record_deposit(capacity)` so first-time users are not gated
/// by a 24-hour refill window — D-05's "capacity = 2-days-of-pro-rata"
/// is the BURST cap, not a starting handicap. After the first consume,
/// refill follows the configured rate.
///
/// W1 LOCK: uses `vault::rate_limiters_mut` (the post-W1 accessor).
public(package) fun get_or_init_user_bucket<Quote>(
    vault: &mut Vault<Quote>,
    user: address,
    clock: &Clock,
): &mut RateLimiter {
    if (!vault::rate_limiters_mut(vault).contains(user)) {
        let mut bucket = rate_limiter::new(clock);
        rate_limiter::update_config(
            &mut bucket,
            strategy_constants::token_bucket_capacity(),
            strategy_constants::token_bucket_refill_rate_per_ms(),
            clock,
        );
        rate_limiter::enable(&mut bucket, clock);
        // Seed the bucket full — D-05 capacity is a per-burst CAP.
        rate_limiter::record_deposit(
            &mut bucket,
            strategy_constants::token_bucket_capacity(),
            clock,
        );
        vault::rate_limiters_mut(vault).add(user, bucket);
    };
    vault::rate_limiters_mut(vault).borrow_mut(user)
}
