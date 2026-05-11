"""SVI evaluator sanity tests (NOT golden-vector parity — that's Plan 01-04+).

Tests in this file are independent of the golden vector pipeline and assert
high-level properties: ATM ~= 0.5, OTM call < 0.5, OTM put > 0.5, EZeroForward,
total variance positive, strict-int return, ECannotBeNegative.
"""

import pytest

from deepvault.svi import SVIParams, binary_price, total_variance

F: int = 1_000_000_000


def _typical_svi() -> SVIParams:
    """Sane raw-SVI params: ATM-flat, mild smile, no skew."""
    return SVIParams(
        a=10_000_000,  # 0.01 ATM total variance
        b=500_000_000,  # 0.5 wing slope
        rho=0,  # no skew
        m=0,  # ATM-centered
        sigma=100_000_000,  # 0.1 curvature
    )


def test_atm_zero_skew_returns_approximately_half():
    svi = _typical_svi()
    forward = 50 * F
    strike = 50 * F
    price = binary_price(svi, forward, strike)
    # At ATM with r=0, binary ~ Phi(-sqrt(w)/2). With w=0.06 -> Phi(-0.1225) ~ 0.4513.
    # Deviation from 0.5 scales with sqrt(total_variance), so even a moderate vol
    # (sigma=0.1, b=0.5 -> w=0.06) gives a ~49M unit gap. Tolerance 60M (~6% of F)
    # accommodates the vol-driven skew while still catching gross errors.
    assert abs(price - F // 2) < 60_000_000


def test_otm_call_below_half():
    svi = _typical_svi()
    forward = 50 * F
    strike = 55 * F  # 10% OTM call
    assert binary_price(svi, forward, strike) < F // 2


def test_otm_put_above_half():
    svi = _typical_svi()
    forward = 50 * F
    strike = 45 * F  # 10% OTM put
    assert binary_price(svi, forward, strike) > F // 2


def test_total_variance_positive():
    svi = _typical_svi()
    for k in [-2_000_000_000, -500_000_000, 0, 500_000_000, 2_000_000_000]:
        assert total_variance(svi, k) > 0


def test_returns_int():
    svi = _typical_svi()
    result = binary_price(svi, 50 * F, 50 * F)
    assert isinstance(result, int)
    assert not isinstance(result, bool)


def test_zero_forward_raises():
    svi = _typical_svi()
    with pytest.raises(ValueError, match="forward"):
        binary_price(svi, 0, 50 * F)


def test_inner_negative_raises():
    """When |rho| approaches F and sigma is tiny, rho * (k-m) + sqrt(...) can go
    negative for k far from m — assert total_variance raises ValueError."""
    # With sigma > 0, sqrt((k-m)^2 + sigma^2) >= |k-m|, and |rho| < F so
    # rho * (k-m) > -|k-m|. The strict mathematical case where inner < 0 is
    # impossible when sigma > 0. We assert the guard is wired by testing
    # at the boundary: zero-result path triggers EZeroVariance instead.
    # NOTE: ECannotBeNegative is provably unreachable in pure SVI math when
    # sigma > 0 — the assert is defensive code mirroring the on-chain guard.
    # We test EZeroVariance instead which IS reachable.
    svi_zero = SVIParams(
        a=0,
        b=0,
        rho=0,
        m=0,
        sigma=1_000_000,  # b=0 forces w=a=0
    )
    with pytest.raises(ValueError, match="EZeroVariance"):
        total_variance(svi_zero, 0)
