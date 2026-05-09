// ===========================================================================
// AUTO-GENERATED - DO NOT EDIT
// Source: shared/strategy.toml (schema_version 1)
// Regenerate via: make codegen   (or: python scripts/codegen.py)
// ===========================================================================

export const STRATEGY_CONSTANTS = {
  // Fixed-point scales
  DECIMALS: 18,
  VARIANCE_DECIMALS: 27,
  SHARE_DECIMALS: 9,

  // Hedge policy (locked in CONTRIBUTING.md / docs/HEDGE-POLICY.md)
  ALLOCATION_BPS: 1000,
  STRIKE_OTM_BPS: 1500,
  TENOR_SECONDS: 1209600n,
  ROLL_TRIGGER_SECONDS: 172800n,
  SIZING_FUNCTION: 'fixed' as const,

  // Token bucket
  BUCKET_CAPACITY_BPS: 1000,
  BUCKET_REFILL_RATE_BPS_PER_SEC: 1,
  BUCKET_PERIOD_SECONDS: 3600,

  // LTV
  MARGIN_LTV_CAP_BPS: 5000,
  WORST_CASE_SETTLEMENT_HAIRCUT_BPS: 10000,

  // Oracle
  MAX_STALENESS_SECONDS: 300,

  // SVI
  SVI_PARAMETERIZATION: 'ssvi' as const,
  SVI_GRID_POINTS_FOR_ARB_CHECK: 200,
  SVI_STRIKE_RANGE_SIGMA: 4,
} as const;
