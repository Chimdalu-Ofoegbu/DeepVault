// Copyright (c) DeepVault.
// SPDX-License-Identifier: MIT
//
// Sui Prover spec — inflation safety on supply.
//
// Property: After any sequence of supplies starting from a seeded Vault,
// an attacker depositing 1 wei + donating X cannot extract > X from a
// victim's deposit. Practical formulation: shares_to_mint(deposit, ...) > 0
// for all deposit >= MIN_DEPOSIT_THRESHOLD when total_assets, total_shares
// are at least their post-seed values (i.e. the vault is past
// `create_vault`'s seed transaction).
//
// SPIKE: This file also serves as the empirical test for whether Sui
// Prover's `clone!()` macro works on objects with `key`-only ability
// (RESEARCH.md Open Question #2). The current formulation deliberately
// AVOIDS `clone!()` — it only takes `&Vault<Quote>` and reads accessors —
// so the spec itself is `key`-safe. The companion `nav_monotone.move`
// spec is also `clone!()`-free; we route via pre/post u64 arithmetic.
//
// W4 lock (Plan 02-07): this file is a REAL prove-annotated Sui Prover
// spec. Capability containment, by contrast, is enforced by the grep CI
// step in ci.yml's move job — see contracts/specs/capability_containment.move
// for the documentation anchor.
//
// Test it locally: `sui-prover` from the contracts/ directory.
// CI: `.github/workflows/nightly-prover.yml` runs nightly on cron.
//
// Closes VAULT-10 (inflation safety property).

#[allow(unused_use)]
module deepvault::specs::inflation_safe;

use deepvault::supply;
use deepvault::strategy_constants;
use deepvault::vault::{Self, Vault};

/// Minimum deposit below which we accept that shares_to_mint may round
/// to zero. Microscopic deposits being denied is not an inflation attack —
/// it's the inflation defense working as designed (round-down-in-vault-favor
/// per Pitfall 12). Set to 1_000 micro-units (= 0.001 DUSDC at 6 decimals).
const MIN_DEPOSIT_THRESHOLD: u64 = 1_000;

/// Spec function: prove that for any seeded vault and meaningful deposit,
/// `compute_shares_to_mint` returns a strictly positive share count.
///
/// Why this is the inflation-safety property: an attacker mounting the
/// canonical ERC-4626 inflation attack first deposits a tiny amount (1 wei)
/// to seed the vault with a 1:1 share basis, then donates a large amount
/// to inflate `total_assets`, then waits for a victim's deposit to round
/// down to 0 shares. The virtual-shares + dead-address-seed defense (per
/// CONTEXT.md "Inflation defense seed amount") ensures `total_assets >=
/// seed_quote_micro_units()` and `total_shares >= virtual_shares()` from
/// genesis, raising the attack break-even cost above any plausible
/// budget. This spec proves the math: under those preconditions, any
/// deposit at or above MIN_DEPOSIT_THRESHOLD mints positive shares —
/// the inflation attack's terminal state ("victim's deposit rounds to 0")
/// is unreachable.
#[allow(unused_function)]
#[spec(prove)]
fun shares_to_mint_positive_for_meaningful_deposit<Quote>(
    vault: &Vault<Quote>,
    deposit: u64,
): u64 {
    // Preconditions: vault is seeded (post-create_vault state).
    requires(vault::total_assets(vault) >= strategy_constants::seed_quote_micro_units());
    requires(vault::total_shares(vault) >= strategy_constants::virtual_shares());
    requires(deposit >= MIN_DEPOSIT_THRESHOLD);

    // Computed value (the function under test). `compute_shares_to_mint`
    // is `public(package)` — this spec module lives inside `deepvault`
    // (module path `deepvault::specs::inflation_safe`), so package-internal
    // visibility is honored.
    let shares = supply::compute_shares_to_mint(vault, deposit);

    // Postcondition: shares > 0. Inflation defense holds for any deposit
    // at or above the meaningful-deposit threshold.
    ensures(shares > 0);

    shares
}
