// Copyright (c) DeepVault.
// SPDX-License-Identifier: MIT
//
// SHARE coin type. TreasuryCap quarantine via the PendingTreasury bridge:
// the cap is wrapped at init() and only consumed once by
// deepvault::vault::create_vault. Closes VAULT-02.
//
// The bridge prevents the deployer from ever holding a free TreasuryCap<SHARE>
// in their wallet — the only way to extract the inner cap is the
// `consume_pending` accessor, which is `public(package)` and therefore
// callable only from inside the deepvault package (Pitfall 9).

/// Vault-share coin type. One-time-witness module.
module deepvault::share;

use sui::coin::TreasuryCap;
use sui::coin_registry;

// === Structs ===

/// One-time witness; Move guarantees init() runs exactly once.
public struct SHARE has drop {}

/// Bridge struct moving TreasuryCap<SHARE> from init() to vault::create_vault.
/// `key + store` lets init() transfer it to the deployer; `consume_pending`
/// (package-internal) is the only path that extracts the inner cap.
public struct PendingTreasury has key, store {
    id: UID,
    cap: TreasuryCap<SHARE>,
}

// === Init ===

#[allow(lint(self_transfer))]
fun init(witness: SHARE, ctx: &mut TxContext) {
    let (initializer, treasury_cap) = coin_registry::new_currency_with_otw(
        witness,
        9, // share_decimals (Phase 0 D-13)
        b"dvUSDC".to_string(), // testnet symbol; mainnet swaps to dvUSDsui in Phase 5
        b"DeepVault dvUSDC".to_string(),
        b"Vault share for DeepVault PLP+Hedge structured product".to_string(),
        b"".to_string(), // icon URL deferred to Phase 5 deploy hygiene
        ctx,
    );
    let metadata_cap = initializer.finalize(ctx);
    transfer::public_transfer(metadata_cap, ctx.sender());
    transfer::public_transfer(
        PendingTreasury { id: object::new(ctx), cap: treasury_cap },
        ctx.sender(),
    );
}

// === Public-Package Functions ===

/// Unpack the PendingTreasury and return the inner TreasuryCap<SHARE>.
/// Visibility is `public(package)` — only `deepvault::vault::create_vault`
/// can consume the cap; the deployer never holds a free TreasuryCap.
public(package) fun consume_pending(pending: PendingTreasury): TreasuryCap<SHARE> {
    let PendingTreasury { id, cap } = pending;
    id.delete();
    cap
}

// === Test-only Functions ===

#[test_only]
public fun init_for_testing(ctx: &mut TxContext) {
    init(SHARE {}, ctx);
}
