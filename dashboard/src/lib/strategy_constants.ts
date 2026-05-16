// ===========================================================================
// AUTO-GENERATED - DO NOT EDIT
// Source: shared/strategy.toml (schema_version 2)
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
  MAX_PRICE_PREMIUM_BPS: 50,

  // Token bucket (absolute u64; matches helpers/rate_limiter.move)
  TOKEN_BUCKET_CAPACITY: 100000000n,
  TOKEN_BUCKET_REFILL_RATE_PER_MS: 1200n,

  // Inflation defense (OpenZeppelin ERC-4626 v5)
  SEED_QUOTE_MICRO_UNITS: 10000000n,
  VIRTUAL_SHARES: 1000000n,

  // NAV scale (matches Phase 1 D-14/D-15 1e9 fixed-point)
  NAV_SCALE: 1_000_000_000n,

  // LTV
  MARGIN_LTV_CAP_BPS: 5000,
  WORST_CASE_SETTLEMENT_HAIRCUT_BPS: 10000,

  // Oracle
  MAX_STALENESS_SECONDS: 300,

  // Redemption (1h cooldown between redeem_request and redeem_fulfill)
  REDEMPTION_COOLDOWN_MS: 3600000n,

  // SVI (locked per re-routes D-01, D-10, D-13, D-14)
  SVI_PARAMETERIZATION: 'raw_svi_5param' as const,
  SVI_SCALE: 9,
  SVI_GRID_POINTS_FOR_ARB_CHECK: 200,
  SVI_STRIKE_RANGE_SIGMA: 4,
  SVI_K_MAX_LOG_STRIKE: 2500000000n,
  SVI_A_MAX: 4000000000n,
  SVI_B_MAX: 8000000000n,
  SVI_SIGMA_MIN: 1n,
  SVI_SIGMA_MAX: 4000000000n,
  SVI_M_ABS_MAX: 2500000000n,
} as const;
