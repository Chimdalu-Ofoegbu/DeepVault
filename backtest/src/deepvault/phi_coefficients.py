# ===========================================================================
# AUTO-GENERATED - DO NOT EDIT
# Source: shared/cody_phi_coefficients.toml (schema_version 1)
# Regenerate via: make codegen   (or: python scripts/codegen.py)
# ===========================================================================
"""Cody 1969 normal-CDF coefficients (clone of helper/math.move:31-65)."""
from typing import Final

# Small range threshold (|x| < 0.66291)
SMALL_THRESHOLD: Final[int] = 662_910_000

# Small range numerator P(x^2)
SMALL_A0: Final[int] = 2_235_252_035
SMALL_A1: Final[int] = 161_028_231_069
SMALL_A2: Final[int] = 1_067_689_485_460
SMALL_A3: Final[int] = 18_154_981_253_344
SMALL_A4: Final[int] = 65_682_338

# Small range denominator Q(x^2)
SMALL_B0: Final[int] = 47_202_581_905
SMALL_B1: Final[int] = 976_098_551_738
SMALL_B2: Final[int] = 10_260_932_208_619
SMALL_B3: Final[int] = 45_507_789_335_027

# Medium range threshold (0.66291 <= |x| < sqrt(32))
MEDIUM_THRESHOLD: Final[int] = 5_656_854_249

# Medium range numerator P(|x|)
MEDIUM_C0: Final[int] = 398_941_512
MEDIUM_C1: Final[int] = 8_883_149_794
MEDIUM_C2: Final[int] = 93_506_656_132
MEDIUM_C3: Final[int] = 597_270_276_395
MEDIUM_C4: Final[int] = 2_494_537_585_290
MEDIUM_C5: Final[int] = 6_848_190_450_536
MEDIUM_C6: Final[int] = 11_602_651_437_647
MEDIUM_C7: Final[int] = 9_842_714_838_384
MEDIUM_C8: Final[int] = 11

# Medium range denominator Q(|x|)
MEDIUM_D0: Final[int] = 22_266_688_044
MEDIUM_D1: Final[int] = 235_387_901_782
MEDIUM_D2: Final[int] = 1_519_377_599_408
MEDIUM_D3: Final[int] = 6_485_558_298_267
MEDIUM_D4: Final[int] = 18_615_571_640_885
MEDIUM_D5: Final[int] = 34_900_952_721_146
MEDIUM_D6: Final[int] = 38_912_003_286_093
MEDIUM_D7: Final[int] = 19_685_429_676_860

# Auxiliary constants (LN2 etc.)
LN2_U128: Final[int] = 693_147_180
