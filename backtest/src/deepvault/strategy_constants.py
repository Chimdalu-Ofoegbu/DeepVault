# ===========================================================================
# AUTO-GENERATED - DO NOT EDIT
# Source: shared/strategy.toml (schema_version 1)
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

# Token bucket
BUCKET_CAPACITY_BPS: Final[int] = 1000
BUCKET_REFILL_RATE_BPS_PER_SEC: Final[int] = 1
BUCKET_PERIOD_SECONDS: Final[int] = 3600

# LTV
MARGIN_LTV_CAP_BPS: Final[int] = 5000
WORST_CASE_SETTLEMENT_HAIRCUT_BPS: Final[int] = 10000

# Oracle
MAX_STALENESS_SECONDS: Final[int] = 300

# SVI
SVI_PARAMETERIZATION: Final[str] = "ssvi"
SVI_GRID_POINTS_FOR_ARB_CHECK: Final[int] = 200
SVI_STRIKE_RANGE_SIGMA: Final[int] = 4
