// Copyright (c) DeepVault.
// SPDX-License-Identifier: MIT
//
// Pure view module: NAV per share + worst-case haircut for Margin LTV.
// Read-only; never holds caps; no event emission. Closes VAULT-06.
//
// Output unit: u64 NAV per share at 1e9 fixed-point (D-15) — matches
// Phase 1 svi_view::binary_price scale.
//
// D-14: worst-case is liquid_balance / total_shares (assumes ALL open
//       hedges expire worthless — pessimistic + bit-equal-deterministic).
// D-16: instantaneous (no time-decay discount).
// D-09: nav uses live data only; worst_case does NOT call svi_view (no
//       SVI math on the haircut path — keeps blast radius zero for the
//       Margin liquidation path consumed in a future phase).

/// Pure view module — NAV per share + worst-case haircut.
module deepvault::ltv;

use deepvault::math;
use deepvault::strategy_constants;
use deepvault::vault::{Self, Vault};

// === Errors ===
// Reserved 500-599 for ltv.move per PATTERNS.md "Error Handling".

const EZeroShares: u64 = 500;

// === Public Functions ===

/// NAV per share at 1e9 fixed-point (D-15).
///
/// `total_assets` includes the hedge cost basis (per supply.move:
/// `add_total_assets` is called with the full deposit amount, of which
/// 10% has been forwarded to PredictManager as cost basis recorded in
/// the hedge registry).
///
/// In v1 the hedge book value is carried at acquisition cost (no SVI
/// re-mark on this path). Full SVI-marked NAV is a future v2 enhancement
/// consumed by the dashboard.
public fun nav_per_share<Quote>(vault: &Vault<Quote>): u64 {
    let total_shares = vault::total_shares(vault);
    assert!(total_shares > 0, EZeroShares);
    math::mul_div_round_down(
        vault::total_assets(vault),
        strategy_constants::nav_scale(),
        total_shares,
    )
}

/// D-14 pessimistic NAV: assumes ALL open hedges expire worthless.
///
/// Output: u64 NAV per share at 1e9 fixed-point (D-15). Consumed by the
/// future Margin liquidation path. D-16: instantaneous; no time-decay
/// discount applied. D-09 / D-16: no svi_view::* call on this path.
///
/// Only the LIQUID quote balance counts here. Hedge cost basis is
/// excluded because the assumption "all hedges expire worthless"
/// translates to "the cost-basis quote that was sent to Predict is gone".
public fun worst_case_nav_per_share<Quote>(vault: &Vault<Quote>): u64 {
    let total_shares = vault::total_shares(vault);
    assert!(total_shares > 0, EZeroShares);
    math::mul_div_round_down(
        vault::balance_value(vault),
        strategy_constants::nav_scale(),
        total_shares,
    )
}

/// Convenience: returns the worst-case haircut as basis points off the
/// current NAV. `haircut_bps = 10_000 * (nav - worst_case) / nav`.
///
/// By construction `worst_case <= nav` (liquid_balance <= total_assets),
/// so the subtraction is safe. Returns 0 when nav is 0 (degenerate
/// vault state).
public fun worst_case_haircut_bps<Quote>(vault: &Vault<Quote>): u64 {
    let nav = nav_per_share(vault);
    if (nav == 0) {
        return 0
    };
    let worst = worst_case_nav_per_share(vault);
    math::mul_div_round_down(nav - worst, 10_000, nav)
}
