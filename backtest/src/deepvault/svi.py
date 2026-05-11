"""Raw SVI total variance + binary_price evaluator.

Clones on-chain oracle.move::compute_nd2 (oracle.move:400-429).
All inputs/outputs at FLOAT_SCALING = 1e9.

Source: scripts/deepbookv3/packages/predict/sources/oracle.move:400-429
SHA: 1159d79af33c70e09e406310e1d8f067832ede9d

Algorithm (raw 5-param SVI per shared/svi-spec.md sec 6):
  k         = ln(strike * F / forward)                              # signed
  k_minus_m = k - svi.m                                              # signed
  k_minus_m_sq = (k_minus_m * k_minus_m) / F                         # always >= 0
  sigma_sq  = (svi.sigma * svi.sigma) / F                            # >= 0
  sq        = sqrt((k_minus_m_sq + sigma_sq) * F)                    # F-scale sqrt
  rho_km    = (svi.rho * k_minus_m) / F                              # signed
  inner     = rho_km + sq                                            # signed
  assert inner >= 0                                                  # ECannotBeNegative
  total_var = svi.a + (svi.b * |inner|) / F                          # >= 0
  assert total_var > 0                                               # EZeroVariance
  sqrt_var  = sqrt(total_var * F)                                    # F-scale sqrt
  half_var  = total_var / 2                                          # >= 0
  d2_num    = k + half_var                                           # signed
  d2        = -((|d2_num| * F) / sqrt_var) * sign(d2_num)            # truncate-toward-zero
  return Phi(d2)

Forbidden imports: math, numpy, scipy. Pure Python int.

Caller responsibility (per shared/svi-spec.md sec "Max safe input domain"):
  - forward > 0, strike > 0
  - |k| <= SVI_K_MAX_LOG_STRIKE = 2_500_000_000 (Phase 2 vault.rebalance enforces)
"""

from typing import NamedTuple

from .isqrt import isqrt_u128
from .ln import ln_signed
from .phi import normal_cdf

F: int = 1_000_000_000  # FLOAT_SCALING

EZeroForward = "binary_price: forward must be > 0 (EZeroForward)"
EZeroStrike = "binary_price: strike must be > 0"
ECannotBeNegative = "total_variance: rho_km + sqrt(...) was negative (ECannotBeNegative)"
EZeroVariance = "total_variance: result is zero (EZeroVariance)"


class SVIParams(NamedTuple):
    """Raw 5-parameter SVI (Gatheral & Jacquier 2014).

    All values at FLOAT_SCALING = 1e9. `rho` and `m` may be negative
    (native Python signed int); `a`, `b`, `sigma` are non-negative.
    """

    a: int  # u64-equivalent, >= 0; ATM total variance offset
    b: int  # u64-equivalent, >= 0; wing slope
    rho: int  # signed, |rho| < F; skew
    m: int  # signed; smile center (log-strike)
    sigma: int  # u64-equivalent, > 0; curvature


def _signed_div_trunc(num: int, den: int) -> int:
    """Truncate-toward-zero division (matches Move u128 / TS BigInt semantics).

    Python `//` rounds toward negative infinity for negatives; we restore
    truncation by dividing magnitudes. Per shared/svi-spec.md sec
    "Op-order canonical form" / rounding rule.
    """
    if den == 0:
        raise ZeroDivisionError("signed_div_trunc: divide by zero")
    sign = -1 if (num < 0) ^ (den < 0) else 1
    return sign * (abs(num) // abs(den))


def total_variance(svi: SVIParams, k: int) -> int:
    """w(k) = a + b * (rho * (k - m) + sqrt((k - m)^2 + sigma^2)).

    Args:
        svi:  SVIParams.
        k:    signed log-moneyness at FLOAT_SCALING.

    Returns:
        total variance at FLOAT_SCALING (>= 0).

    Raises:
        ValueError: inner < 0 (ECannotBeNegative) or w == 0 (EZeroVariance).
    """
    k_minus_m = k - svi.m  # signed
    k_minus_m_sq = (k_minus_m * k_minus_m) // F  # always >= 0 (squared)
    sigma_sq = (svi.sigma * svi.sigma) // F  # >= 0
    # sqrt at FLOAT_SCALING: sqrt(value * F) per math.move::sqrt(x, F)
    sq = isqrt_u128((k_minus_m_sq + sigma_sq) * F)
    # rho * (k - m): signed, truncate toward zero per Move/TS semantics.
    rho_km = _signed_div_trunc(svi.rho * k_minus_m, F)
    inner = rho_km + sq  # signed
    if inner < 0:
        raise ValueError(ECannotBeNegative)
    w = svi.a + (svi.b * inner) // F
    if w == 0:
        raise ValueError(EZeroVariance)
    return w


def binary_price(svi: SVIParams, forward: int, strike: int) -> int:
    """Theoretical binary call price at FLOAT_SCALING.

    Returns Phi(d2) where d2 = -((k + w/2) / sqrt(w)) and k = ln(strike/forward).

    Args:
        svi:     SVIParams.
        forward: u64-equivalent, > 0; underlying forward price at FLOAT_SCALING.
        strike:  u64-equivalent, > 0; strike at FLOAT_SCALING.

    Returns:
        Phi(d2) at FLOAT_SCALING in [0, F].
    """
    if forward <= 0:
        raise ValueError(EZeroForward)
    if strike <= 0:
        raise ValueError(EZeroStrike)
    # k = ln(strike * F / forward) = predict_math::ln(math::div(strike, forward))
    k = ln_signed((strike * F) // forward)
    w = total_variance(svi, k)
    sqrt_var = isqrt_u128(w * F)  # F-scale sqrt
    half_var = w // 2  # >= 0 (w > 0)
    d2_numerator = k + half_var  # signed
    # i64::div_scaled then i64::neg per oracle.move:425-426.
    # div_scaled(a, b) = a * F / |b| with sign tracked separately; we use
    # truncate-toward-zero to match Move's u128 division on magnitudes.
    d2 = -_signed_div_trunc(d2_numerator * F, sqrt_var)
    return normal_cdf(d2)
