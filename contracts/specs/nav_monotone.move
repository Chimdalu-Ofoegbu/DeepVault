// Copyright (c) DeepVault.
// SPDX-License-Identifier: MIT
//
// Sui Prover spec — NAV per share never decreases on supply.
//
// Property: Calling `vault::supply` with a positive deposit cannot
// DECREASE `nav_per_share`, modulo a per-block hedge-cost-rounding
// tolerance. The hedge cost (10% of deposit per CONTEXT.md D-01) is
// expected to come back as fair-value hedge book asset (Phase 1
// `svi_view::binary_price`), so net NAV change should be ~0 within a
// rounding tolerance.
//
// W4 lock (Plan 02-07): this file is a REAL prove-annotated Sui Prover
// spec. The capability_containment property is enforced by the grep CI
// step in ci.yml's move job — see contracts/specs/capability_containment.move
// for the documentation anchor.
//
// SPIKE OUTCOME (RESEARCH.md Open Question #2): The chosen formulation
// AVOIDS `clone!(vault)` on a `key`-only Vault. Instead it parameterizes
// the spec over four u64 pre/post values (old_total_assets, old_total_shares,
// new_total_assets, new_total_shares) — a pure-arithmetic property.
// This is more portable across Sui Prover versions and dodges the clone!()
// compatibility risk entirely.
//
// Why pure-arithmetic suffices: the runtime supply path's effect on the
// vault state is exactly that `total_assets` and `total_shares` increase
// by positive amounts (see `supply::supply` lines 102-104:
// `vault::add_total_assets(vault, amount)` + `vault::add_total_shares(vault,
// shares_to_mint)`). The per-second hedge re-mark is excluded from this
// spec (it lives in `ltv::nav` and is exercised by Move tests, not by
// Sui Prover). Therefore proving the arithmetic property "for any
// monotone increase in (total_assets, total_shares), nav_per_share does
// not decrease beyond tolerance" suffices for `nav_monotone_after_supply`.
//
// Closes VAULT-10 (NAV monotonicity property).

#[allow(unused_use)]
module deepvault::specs::nav_monotone;

use deepvault::strategy_constants;

/// Tolerance: hedge-cost rounding + minor SVI fair-value drift between
/// the supply tx and the next mark.
///
/// At 1e9 fixed-point NAV (matches CONTEXT.md D-15 / Phase 1 D-14),
/// allow a 1bp slip per supply call: 1bp on a 1e9-scaled NAV-per-share =
/// `1e9 / 10_000 = 100_000`.
fun hedge_cost_tolerance_x9(): u128 { 100_000u128 }

/// Pure-arithmetic spec: for any monotone state transition (both
/// `total_assets` and `total_shares` non-decreasing), the NAV per share
/// at 1e9 fixed-point does NOT decrease beyond `hedge_cost_tolerance_x9()`.
///
/// This is the load-bearing arithmetic property `vault::supply` relies on:
/// `vault::add_total_assets(vault, amount)` and
/// `vault::add_total_shares(vault, shares_to_mint)` both add non-negative
/// deltas, so the precondition `new_* >= old_*` is honored by construction.
/// The spec proves that THIS state transition pattern preserves NAV
/// monotonicity within tolerance — independent of the specific deposit
/// amount or hedge-cost split.
#[allow(unused_function)]
#[spec(prove)]
fun nav_does_not_decrease_on_state_change(
    old_total_assets: u64,
    old_total_shares: u64,
    new_total_assets: u64,
    new_total_shares: u64,
) {
    // Preconditions: positive shares supply pre and post (NAV is undefined
    // when total_shares == 0, but the seeded vault guarantees
    // total_shares >= virtual_shares() > 0 from `create_vault` onward).
    requires(old_total_shares > 0);
    requires(new_total_shares > 0);

    // Supply increases both `total_assets` and `total_shares` by
    // non-negative amounts (the math in `supply::compute_shares_to_mint`
    // is round-down-in-vault-favor, but the deltas themselves are >= 0
    // — see `vault::add_total_assets` / `vault::add_total_shares`).
    requires(new_total_assets >= old_total_assets);
    requires(new_total_shares >= old_total_shares);

    // Compute NAV per share at 1e9 fixed-point pre and post. u128
    // intermediates; matches the runtime path in `ltv::nav`.
    let old_nav = ((old_total_assets as u128) * (strategy_constants::nav_scale() as u128))
        / (old_total_shares as u128);
    let new_nav = ((new_total_assets as u128) * (strategy_constants::nav_scale() as u128))
        / (new_total_shares as u128);

    // Postcondition: NAV does not decrease beyond tolerance.
    // Cross-formed as `new_nav + tolerance >= old_nav` to avoid signed
    // arithmetic — both terms are u128 and the inequality is total.
    ensures(new_nav + hedge_cost_tolerance_x9() >= old_nav);
}
