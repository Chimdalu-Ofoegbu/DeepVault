"""Natural log at FLOAT_SCALING.

ln_signed(x): returns ln(x / F) * F as a signed Python int.

For x = F (1.0), returns 0. For x = 2*F, returns ~LN2_U128 (~693_147_180).
For x < F, returns negative (log of a fraction).

Source: scripts/deepbookv3/packages/predict/sources/helper/math.move:80-93 (public entry)
        scripts/deepbookv3/packages/predict/sources/helper/math.move:134-145 (ln_u128 body)
        scripts/deepbookv3/packages/predict/sources/helper/math.move:247-260 (normalize)
SHA: 1159d79af33c70e09e406310e1d8f067832ede9d

Algorithm:
  1. If x == F, return 0 (ln(1) = 0).
  2. If x < F, recurse on inv = F*F / x and negate (ln(1/x) = -ln(x)).
  3. Else normalize: find (y, n) with x = y * 2^n and y in [F, 2F).
  4. Compute ln(y) via Padé/Horner using z = (y - F)/(y + F) and
     ln(y) = 2 * (z + z^3/3 + z^5/5 + ... + z^13/13).
  5. Result = n * LN2 + ln(y).

Python int is signed natively; we return signed int directly without
the i64 sign-magnitude wrapper used on-chain. Per shared/svi-spec.md sec
"Sign convention", positive zero is the canonical normalization.
"""
from .phi_coefficients import LN2_U128

F: int = 1_000_000_000  # FLOAT_SCALING

# Reciprocal constants for Padé/Horner expansion of ln on [F, 2F).
# Source: helper/math.move:67-72.
INV_3_U128: int = 333_333_333
INV_5_U128: int = 200_000_000
INV_7_U128: int = 142_857_143
INV_9_U128: int = 111_111_111
INV_11_U128: int = 90_909_091
INV_13_U128: int = 76_923_077

EInputZero = "ln_signed: input must be > 0 (EInputZero)"


def _mul_scaled_u128(x: int, y: int) -> int:
    """x * y / F. Clone of helper/math.move:262-264 mul_scaled_u128."""
    return x * y // F


def _normalize(x: int) -> tuple[int, int]:
    """Normalize x into [F, 2F) via binary search of right-shifts.

    Returns (y, n) where x = y * 2^n and F <= y < 2F.
    Clone of helper/math.move:247-260 normalize.
    Caller guarantees x >= F (the public ln() handles x < F via inversion).
    """
    y = x
    n = 0
    if y >> 32 >= F:
        y = y >> 32
        n = n + 32
    if y >> 16 >= F:
        y = y >> 16
        n = n + 16
    if y >> 8 >= F:
        y = y >> 8
        n = n + 8
    if y >> 4 >= F:
        y = y >> 4
        n = n + 4
    if y >> 2 >= F:
        y = y >> 2
        n = n + 2
    if y >> 1 >= F:
        y = y >> 1
        n = n + 1
    return (y, n)


def _ln_u128(y: int, n: int) -> int:
    """ln(y) where y is in [F, 2F) and n is the shift count.

    Computes: n * LN2 + 2 * (z + z^3/3 + z^5/5 + ... + z^13/13)
    where z = (y - F) / (y + F).
    Clone of helper/math.move:134-145 ln_u128.
    """
    z = (y - F) * F // (y + F)
    w = _mul_scaled_u128(z, z)
    h = _mul_scaled_u128(w, INV_13_U128)
    h = _mul_scaled_u128((INV_11_U128 + h), w)
    h = _mul_scaled_u128((INV_9_U128 + h), w)
    h = _mul_scaled_u128((INV_7_U128 + h), w)
    h = _mul_scaled_u128((INV_5_U128 + h), w)
    h = _mul_scaled_u128((INV_3_U128 + h), w)
    ln_y = _mul_scaled_u128(_mul_scaled_u128(2 * F, z), F + h)
    return n * LN2_U128 + ln_y


def ln_signed(x: int) -> int:
    """ln(x / F) returned as signed int at FLOAT_SCALING.

    Args:
        x: positive int at FLOAT_SCALING (must be > 0).

    Returns:
        ln(x/F) at FLOAT_SCALING. Signed: negative for x < F (1.0).

    Clone of helper/math.move:80-93 public ln entry, with the i64 sign
    wrapper unwrapped to native Python signed int per shared/svi-spec.md
    sec "Sign convention".
    """
    if x <= 0:
        raise ValueError(EInputZero)
    if x == F:
        return 0
    if x < F:
        # Recurse via inversion: ln(x/F) = -ln(F/x) = -ln((F*F/x)/F).
        inv = (F * F) // x
        return -ln_signed(inv)
    y, n = _normalize(x)
    result = _ln_u128(y, n)
    return result
