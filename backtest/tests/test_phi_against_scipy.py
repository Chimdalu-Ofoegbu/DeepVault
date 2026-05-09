"""Cody Phi cross-check tests.

scipy is the ground truth here; our Cody clone in deepvault.phi is the unit under test.
THIS IS THE ONLY test file allowed to import scipy in evaluator code paths
(Pitfall A: scipy must NEVER be imported by deepvault.svi/phi/isqrt/ln).
"""
import pytest
import scipy.stats  # noqa: I001 — exception per file docstring above

from deepvault.phi import normal_cdf
from deepvault.phi_coefficients import SMALL_THRESHOLD

F: int = 1_000_000_000  # FLOAT_SCALING


def test_zero():
    assert normal_cdf(0) == F // 2


def test_returns_int_type():
    result = normal_cdf(123_456_789)
    assert isinstance(result, int)
    assert not isinstance(result, bool)


def test_extreme_negative_clamps_to_zero():
    assert normal_cdf(-10 * F) == 0


def test_extreme_positive_clamps_to_F():
    assert normal_cdf(10 * F) == F


@pytest.mark.parametrize(
    "x_float", [-3.0, -2.0, -1.0, -0.5, 0.0, 0.5, 1.0, 2.0, 3.0]
)
def test_against_scipy(x_float: float):
    """Cody coefficient transcription correctness — proves Plan 01-02's TOML."""
    x_int = round(x_float * F)
    actual = normal_cdf(x_int) / F  # convert to float ONLY for comparison display
    expected = scipy.stats.norm.cdf(x_float)
    assert abs(actual - expected) < 1e-7, (
        f"Cody Phi at x={x_float}: actual={actual}, scipy={expected}, "
        f"diff={abs(actual - expected):.3e}"
    )


def test_continuity_at_small_threshold():
    just_below = SMALL_THRESHOLD - 1
    just_above = SMALL_THRESHOLD + 1
    diff = abs(normal_cdf(just_above) - normal_cdf(just_below))
    assert diff <= 2, f"Discontinuity at SMALL_THRESHOLD: diff={diff} units at 1e9"


@pytest.mark.parametrize("x", [100_000_000, 500_000_000, 1_500_000_000, 3_000_000_000])
def test_symmetry_around_zero(x: int):
    assert normal_cdf(x) + normal_cdf(-x) == F
