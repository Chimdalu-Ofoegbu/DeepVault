"""Standard normal CDF using Cody 1969 rational Chebyshev approximation.

Three piecewise ranges; ~1e-15 in float, <5 units at 1e9 fixed-point.
Bit-equal output with on-chain normal_cdf_u128 (helper/math.move:191-239).

Forbidden imports: math, numpy, scipy. Pure Python int arithmetic only.

Source: scripts/deepbookv3/packages/predict/sources/helper/math.move:191-239
        plus exp_u128 (math.move:149-173) + exp_series_u128 (math.move:176-187)
SHA: 1159d79af33c70e09e406310e1d8f067832ede9d
"""
from .phi_coefficients import (
    LN2_U128,
    MEDIUM_C0,
    MEDIUM_C1,
    MEDIUM_C2,
    MEDIUM_C3,
    MEDIUM_C4,
    MEDIUM_C5,
    MEDIUM_C6,
    MEDIUM_C7,
    MEDIUM_C8,
    MEDIUM_D0,
    MEDIUM_D1,
    MEDIUM_D2,
    MEDIUM_D3,
    MEDIUM_D4,
    MEDIUM_D5,
    MEDIUM_D6,
    MEDIUM_D7,
    MEDIUM_THRESHOLD,
    SMALL_A0,
    SMALL_A1,
    SMALL_A2,
    SMALL_A3,
    SMALL_A4,
    SMALL_B0,
    SMALL_B1,
    SMALL_B2,
    SMALL_B3,
    SMALL_THRESHOLD,
)

F: int = 1_000_000_000  # FLOAT_SCALING — must match deepvault::math_constants::float_scaling


def normal_cdf(x: int) -> int:
    """Phi(x): standard normal CDF in fixed-point.

    Args:
        x: signed log-moneyness or d2 at FLOAT_SCALING (1e9).

    Returns:
        Phi(x) at FLOAT_SCALING in [0, F].

    Clones helper/math.move:109-116 public entry: clamps |x| > 8 to 0/F,
    otherwise dispatches to the u128 piecewise body.
    """
    x_negative = x < 0
    x_mag = -x if x_negative else x
    if x_mag > 8 * F:
        return 0 if x_negative else F
    return _normal_cdf_u128(x_mag, x_negative)


def _normal_cdf_u128(x: int, x_negative: bool) -> int:
    """Piecewise body — clones helper/math.move:191-239 verbatim.

    Three ranges:
      - small  (|x| < SMALL_THRESHOLD ~= 0.66): Phi = 0.5 +/- x * P(x^2)/Q(x^2)
      - medium (SMALL <= |x| < MEDIUM ~= 5.657): Phi via exp(-x^2/2) * P(|x|)/Q(|x|)
      - large  (|x| >= MEDIUM): clamp to 0/F
    """
    if x < SMALL_THRESHOLD:
        # Small range: Phi(x) = 0.5 + x * P(x^2) / Q(x^2)
        # Clone helper/math.move:191-208 verbatim.
        xsq = x * x // F
        xnum = SMALL_A4 * xsq // F
        xden = xsq
        xnum = (xnum + SMALL_A0) * xsq // F
        xden = (xden + SMALL_B0) * xsq // F
        xnum = (xnum + SMALL_A1) * xsq // F
        xden = (xden + SMALL_B1) * xsq // F
        xnum = (xnum + SMALL_A2) * xsq // F
        xden = (xden + SMALL_B2) * xsq // F
        ratio = (xnum + SMALL_A3) * F // (xden + SMALL_B3)
        term = x * ratio // F
        return F // 2 - term if x_negative else F // 2 + term
    elif x < MEDIUM_THRESHOLD:
        # Medium range: complement = exp(-x^2/2) * P(|x|) / Q(|x|)
        # Clone helper/math.move:209-233 verbatim.
        xnum = MEDIUM_C8 * x // F
        xden = x
        xnum = (xnum + MEDIUM_C0) * x // F
        xden = (xden + MEDIUM_D0) * x // F
        xnum = (xnum + MEDIUM_C1) * x // F
        xden = (xden + MEDIUM_D1) * x // F
        xnum = (xnum + MEDIUM_C2) * x // F
        xden = (xden + MEDIUM_D2) * x // F
        xnum = (xnum + MEDIUM_C3) * x // F
        xden = (xden + MEDIUM_D3) * x // F
        xnum = (xnum + MEDIUM_C4) * x // F
        xden = (xden + MEDIUM_D4) * x // F
        xnum = (xnum + MEDIUM_C5) * x // F
        xden = (xden + MEDIUM_D5) * x // F
        xnum = (xnum + MEDIUM_C6) * x // F
        xden = (xden + MEDIUM_D6) * x // F
        rational = (xnum + MEDIUM_C7) * F // (xden + MEDIUM_D7)

        x_sq_half = x * x // (F * 2)
        n = x_sq_half // LN2_U128
        r = x_sq_half - n * LN2_U128
        exp_val = _exp_u128(r, n, True)
        complement = exp_val * rational // F

        return complement if x_negative else F - complement
    else:
        # Large range: |x| >= sqrt(32) ~ 5.657 — extreme tail < 1e-7 at 1e9 scale
        return 0 if x_negative else F


def _exp_u128(r: int, n: int, x_negative: bool) -> int:
    """e^(+/-x) where r is the reduced remainder and n is the shift count.

    Computes: e^r * 2^(+/-n).
    Clone of helper/math.move:149-173 (exp_u128).
    """
    exp_r = _exp_series_u128(r)

    if x_negative:
        result = F * F // exp_r
        if n >= 32:
            result = result >> 32
            if result == 0:
                return 0
            n = n - 32
        if n >= 16:
            result = result >> 16
            if result == 0:
                return 0
            n = n - 16
        if n >= 8:
            result = result >> 8
            if result == 0:
                return 0
            n = n - 8
        if n >= 4:
            result = result >> 4
            if result == 0:
                return 0
            n = n - 4
        if n >= 2:
            result = result >> 2
            if result == 0:
                return 0
            n = n - 2
        if n >= 1:
            result = result >> 1
        return result
    else:
        result = exp_r
        if n >= 32:
            result = result << 32
            n = n - 32
        if n >= 16:
            result = result << 16
            n = n - 16
        if n >= 8:
            result = result << 8
            n = n - 8
        if n >= 4:
            result = result << 4
            n = n - 4
        if n >= 2:
            result = result << 2
            n = n - 2
        if n >= 1:
            result = result << 1
        return result


def _exp_series_u128(r: int) -> int:
    """Taylor series: e^r = 1 + r + r^2/2! + r^3/3! + ...

    Clone of helper/math.move:176-187 (exp_series_u128).
    """
    sum_ = F
    term = F
    k = 1
    while k <= 12:
        term = term * r // (k * F)
        if term == 0:
            break
        sum_ = sum_ + term
        k = k + 1
    return sum_
