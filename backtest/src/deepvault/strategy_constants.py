# ===========================================================================
# AUTO-GENERATED - DO NOT EDIT
# Source: shared/strategy.toml (schema_version 2)
# Regenerate via: make codegen   (or: python scripts/codegen.py)
# ===========================================================================
"""Strategy constants emitted from shared/strategy.toml."""
from typing import Final

# Fixed-point scales
DECIMALS: Final[int] = 18
VARIANCE_DECIMALS: Final[int] = 27
SHARE_DECIMALS: Final[int] = 9

# Hedge policy (locked in CONTRIBUTING.md / docs/HEDGE-POLICY.md)
ALLOCATION_BPS: Final[int] = 1000
STRIKE_OTM_BPS: Final[int] = 1500
TENOR_SECONDS: Final[int] = 1209600
ROLL_TRIGGER_SECONDS: Final[int] = 172800
SIZING_FUNCTION: Final[str] = "fixed"
MAX_PRICE_PREMIUM_BPS: Final[int] = 50

# Token bucket (absolute u64; matches helpers/rate_limiter.move)
TOKEN_BUCKET_CAPACITY: Final[int] = 100000000
TOKEN_BUCKET_REFILL_RATE_PER_MS: Final[int] = 1200

# Inflation defense (OpenZeppelin ERC-4626 v5)
SEED_QUOTE_MICRO_UNITS: Final[int] = 10000000
VIRTUAL_SHARES: Final[int] = 1000000

# NAV scale (matches Phase 1 D-14/D-15 1e9 fixed-point)
NAV_SCALE: Final[int] = 1_000_000_000

# LTV
MARGIN_LTV_CAP_BPS: Final[int] = 5000
WORST_CASE_SETTLEMENT_HAIRCUT_BPS: Final[int] = 10000

# Oracle
MAX_STALENESS_SECONDS: Final[int] = 300

# Redemption (1h cooldown between redeem_request and redeem_fulfill)
REDEMPTION_COOLDOWN_MS: Final[int] = 3600000

# SVI (locked per re-routes D-01, D-10, D-13, D-14)
SVI_PARAMETERIZATION: Final[str] = "raw_svi_5param"
SVI_SCALE: Final[int] = 9
SVI_GRID_POINTS_FOR_ARB_CHECK: Final[int] = 200
SVI_STRIKE_RANGE_SIGMA: Final[int] = 4
SVI_K_MAX_LOG_STRIKE: Final[int] = 2500000000
SVI_A_MAX: Final[int] = 4000000000
SVI_B_MAX: Final[int] = 8000000000
SVI_SIGMA_MIN: Final[int] = 1
SVI_SIGMA_MAX: Final[int] = 4000000000
SVI_M_ABS_MAX: Final[int] = 2500000000
