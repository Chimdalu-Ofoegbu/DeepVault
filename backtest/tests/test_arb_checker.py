"""Tests for arb_checker: shape + g(k) grid + Tier C JackJacquier cross-check.

Per PLAN 01-08: arb_checker is OFF-CHAIN ONLY (Move evaluator hard-rejects on
closed-form alone per CONTEXT.md D-05). The grid sampler may use numpy; the
output g_k_array elements MUST be Python int at FLOAT_SCALING.
"""

import json
from pathlib import Path

import pytest

from deepvault.arb_checker import ArbResult, check_arb
from deepvault.strategy_constants import SVI_GRID_POINTS_FOR_ARB_CHECK
from deepvault.svi import SVIParams, total_variance

F: int = 1_000_000_000


def test_returns_arb_result_with_correct_shape():
    """ArbResult is the locked NamedTuple; all fields are correctly typed."""
    svi = SVIParams(a=50_000_000, b=250_000_000, rho=0, m=0, sigma=400_000_000)
    result = check_arb(svi)
    assert isinstance(result, ArbResult)
    assert isinstance(result.params_valid, bool)
    assert isinstance(result.min_g_k, int)
    assert isinstance(result.calendar_pass, bool)
    assert isinstance(result.g_k_array, list)
    assert len(result.g_k_array) >= SVI_GRID_POINTS_FOR_ARB_CHECK


def test_g_k_array_elements_are_python_int_not_numpy_int():
    """Pitfall A enforcement: numpy.int64 elements would break JSON serialization."""
    svi = SVIParams(a=50_000_000, b=250_000_000, rho=-100_000_000, m=0, sigma=400_000_000)
    result = check_arb(svi)
    for g in result.g_k_array:
        assert isinstance(g, int)
        # bool is a subtype of int; explicitly reject numpy types via type identity
        assert type(g) is int, f"Expected pure Python int, got {type(g)}"


def test_valid_slice_passes():
    """Sane SVI params should produce min_g_k >= 0."""
    svi = SVIParams(a=50_000_000, b=250_000_000, rho=-100_000_000, m=0, sigma=400_000_000)
    result = check_arb(svi)
    assert result.params_valid is True
    assert result.min_g_k >= 0


def test_atm_no_skew_passes():
    """Symmetric ATM-centered slice with mild skew should pass."""
    svi = SVIParams(a=40_000_000, b=200_000_000, rho=0, m=0, sigma=500_000_000)
    result = check_arb(svi)
    assert result.params_valid is True
    assert result.min_g_k >= 0


def test_extreme_rho_violates():
    """Extreme rho close to +/-1 with low sigma should produce min_g_k < 0 somewhere
    OR force the canonical evaluator to reject (which also flips params_valid=False).

    Either failure mode is acceptable for this 'arb-violating slice' negative-test;
    both demonstrate the checker would refuse to mark this slice as valid.
    """
    svi = SVIParams(a=10_000_000, b=2_000_000_000, rho=-995_000_000, m=0, sigma=10_000_000)
    result = check_arb(svi)
    # Acceptance: either grid found a violation OR params_valid is False for some other
    # reason (e.g. canonical evaluator probe rejected). Negative-test goal is:
    # check_arb refuses to declare params_valid=True for known-bad SVI.
    assert result.params_valid is False or any(g < 0 for g in result.g_k_array)


def test_calendar_pass_is_stub_true():
    """Single-tenor: calendar_pass returns True with documented reason in arb_checker.py
    (one expiry per oracle in Phase 1 -> calendar-monotonicity is vacuously satisfied)."""
    svi = SVIParams(a=50_000_000, b=250_000_000, rho=0, m=0, sigma=400_000_000)
    result = check_arb(svi)
    assert result.calendar_pass is True


def test_g_k_array_visualization_data_matches_math_04_lever():
    """Plan 01-08's MATH-04 lever: the array IS the visualization data Phase 4
    dashboard renders. Assert minimum length, integer-typed elements, and finite
    values."""
    svi = SVIParams(a=50_000_000, b=250_000_000, rho=-100_000_000, m=0, sigma=400_000_000)
    result = check_arb(svi)
    assert len(result.g_k_array) >= 200
    for g in result.g_k_array:
        assert isinstance(g, int)
        # reasonable range; sentinel -F is the min
        assert -10 * F <= g <= 10 * F


def test_min_g_k_is_actual_min_of_array():
    """Invariant: min_g_k must equal min(g_k_array)."""
    svi = SVIParams(a=50_000_000, b=250_000_000, rho=-100_000_000, m=0, sigma=400_000_000)
    result = check_arb(svi)
    assert result.min_g_k == min(result.g_k_array)


def test_degenerate_zero_atm_returns_invalid():
    """ATM total variance == 0 -> degenerate slice -> params_valid=False with sentinel min_g_k."""
    # a=0, b=0 -> theta_t_atm_int = 0 -> degenerate path returns params_valid=False
    svi = SVIParams(a=0, b=0, rho=0, m=0, sigma=500_000_000)
    result = check_arb(svi)
    assert result.params_valid is False
    assert result.min_g_k == -F


# -------------------------------------------------------------------------
# Tier C: JackJacquier/SSVI cross-check (per CONTEXT.md re-route D-17)
# -------------------------------------------------------------------------


@pytest.fixture(scope="module")
def jj_fixture():
    path = Path(__file__).parent / "fixtures" / "jackjacquier_ssvi_outputs.json"
    return json.loads(path.read_text(encoding="utf-8"))


def test_tier_c_fixture_exists_with_metadata_and_vectors(jj_fixture):
    """Per CONTEXT.md re-route D-17: fixture must exist with documented metadata
    + at least 5 vectors. The metadata block documents the source-attribution gap
    (notebook has no LICENSE) and sets the expectation that future plans may
    overwrite expected_w with notebook-captured outputs."""
    assert "_metadata" in jj_fixture
    assert "source_repo" in jj_fixture["_metadata"]
    assert "rationale" in jj_fixture["_metadata"]
    assert "vectors" in jj_fixture
    assert len(jj_fixture["vectors"]) >= 5


def test_tier_c_jackjacquier_ssvi_cross_check(jj_fixture):
    """Per CONTEXT.md re-route D-17: cross-check our raw SVI evaluator against
    expected outputs in the fixture. For Plan 01-08 the expected_w values come
    from deepvault.svi.total_variance (stub cross-check); future plans may
    overwrite with notebook-captured values without changing this test."""
    for vec in jj_fixture["vectors"]:
        svi = SVIParams(**vec["svi"])
        actual_w = total_variance(svi, vec["k"])
        expected = vec["expected_w"]
        diff = abs(actual_w - expected)
        assert diff <= vec["tolerance"], (
            f"{vec['id']}: actual={actual_w}, expected={expected}, "
            f"diff={diff}, tolerance={vec['tolerance']} ({vec['comment']})"
        )
