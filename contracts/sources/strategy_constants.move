// ===========================================================================
// AUTO-GENERATED - DO NOT EDIT
// Source: shared/strategy.toml (schema_version 1)
// Regenerate via: make codegen   (or: python scripts/codegen.py)
// ===========================================================================

module deepvault::strategy_constants {
    // Fixed-point scales
    public fun decimals(): u8 { 18 }
    public fun variance_decimals(): u8 { 27 }
    public fun share_decimals(): u8 { 9 }

    // Hedge policy (locked in CONTRIBUTING.md / docs/HEDGE-POLICY.md)
    public fun allocation_bps(): u64 { 1000 }
    public fun strike_otm_bps(): u64 { 1500 }
    public fun tenor_seconds(): u64 { 1209600 }
    public fun roll_trigger_seconds(): u64 { 172800 }

    // Token bucket
    public fun bucket_capacity_bps(): u64 { 1000 }
    public fun bucket_refill_rate_bps_per_sec(): u64 { 1 }
    public fun bucket_period_seconds(): u64 { 3600 }

    // LTV
    public fun margin_ltv_cap_bps(): u64 { 5000 }
    public fun worst_case_settlement_haircut_bps(): u64 { 10000 }

    // Oracle
    public fun max_staleness_seconds(): u64 { 300 }

    // SVI placeholders (Phase 1 may extend)
    public fun svi_grid_points_for_arb_check(): u64 { 200 }
    public fun svi_strike_range_sigma(): u64 { 4 }
}
