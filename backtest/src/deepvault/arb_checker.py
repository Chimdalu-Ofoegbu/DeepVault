"""Arb-free checker: closed-form butterfly bound + 200-point g(k) grid scan + calendar test.

Off-chain only (Move evaluator hard-rejects on closed-form alone per CONTEXT.md D-05).
Returns full g(k) array for dashboard visualization (MATH-04 lever — Phase 4 dashboard
renders gK as a visible curve so institutional LPs see *why* a surface is unsafe).

Source for raw-SVI g(k) closed form:
  Gatheral & Jacquier (2014), "Arbitrage-free SVI volatility surfaces", §3.2 / Eqn 2.2
  (mirrored in 01-RESEARCH.md "Pattern 4: g(k) array as visible diagnostic", lines 432-441).

For raw SVI w(k) = a + b * (rho * (k - m) + sqrt((k - m)^2 + sigma^2)):
    t = k - m
    r = sqrt(t^2 + sigma^2)
    w(k)   = a + b * (rho * t + r)
    w'(k)  = b * (rho + t / r)
    w''(k) = b * sigma^2 / r^3
    g(k)   = (1 - k * w'(k) / (2 * w(k)))^2
            - (w'(k))^2 / 4 * (1 / w(k) + 1 / 4)
            + w''(k) / 2

g(k) >= 0 is the no-butterfly-arbitrage condition.

Type discipline (01-RESEARCH.md "Common Pitfalls A"): arb_checker is the ONLY
numpy-allowed module in the Python evaluator codebase. numpy is used for the
visualization-bound grid generation; OUTPUT g_k_array elements are converted to
Python int at FLOAT_SCALING before returning. The parity_runner discipline (no
floats anywhere) does NOT cover this module — arb_checker is for visualization,
not parity.

Source SHA for citations: 1159d79af33c70e09e406310e1d8f067832ede9d
"""

from __future__ import annotations

import math
from typing import NamedTuple

import numpy as np  # ALLOWED HERE (visualization-bound, not parity-bound)

from .strategy_constants import (
    SVI_GRID_POINTS_FOR_ARB_CHECK,
    SVI_STRIKE_RANGE_SIGMA,
)
from .svi import SVIParams, total_variance

F: int = 1_000_000_000  # FLOAT_SCALING


class ArbResult(NamedTuple):
    """Output of check_arb.

    Attributes:
        params_valid: True iff min(g(k)) >= 0 across the grid AND total_variance
            evaluates without raising on every sampled k.
        min_g_k: int at FLOAT_SCALING; if negative -> arb violation. The strike at
            which the minimum occurs is recoverable as g_k_array.index(min_g_k).
        calendar_pass: single-tenor stub returning True; documented reason in
            shared/svi-spec.md (one expiry per oracle in Phase 1, so calendar-monotonicity
            is vacuously satisfied — no two tenors to monotonically compare).
        g_k_array: length >= SVI_GRID_POINTS_FOR_ARB_CHECK (=200); int at FLOAT_SCALING.
            Phase 4 dashboard renders this as the visible g(k) curve (MATH-04 lever).
    """

    params_valid: bool
    min_g_k: int
    calendar_pass: bool
    g_k_array: list[int]


def _w_float(svi: SVIParams, k_float: float) -> float:
    """w(k) in real units (svi params dequantized from FLOAT_SCALING).

    Used for the visualization grid only; the canonical evaluator is total_variance().
    """
    a = svi.a / F
    b = svi.b / F
    rho = svi.rho / F
    m = svi.m / F
    sigma = svi.sigma / F
    t = k_float - m
    r = math.sqrt(t * t + sigma * sigma)
    return a + b * (rho * t + r)


def _w_prime_float(svi: SVIParams, k_float: float) -> float:
    b = svi.b / F
    rho = svi.rho / F
    m = svi.m / F
    sigma = svi.sigma / F
    t = k_float - m
    r = math.sqrt(t * t + sigma * sigma)
    if r == 0.0:
        return 0.0
    return b * (rho + t / r)


def _w_double_prime_float(svi: SVIParams, k_float: float) -> float:
    b = svi.b / F
    m = svi.m / F
    sigma = svi.sigma / F
    t = k_float - m
    r = math.sqrt(t * t + sigma * sigma)
    if r == 0.0:
        return 0.0
    return b * (sigma * sigma) / (r * r * r)


def _g_of_k_float(svi: SVIParams, k_float: float) -> float:
    """Gatheral 2014 Eqn 2.2 g(k) for raw SVI in real units.

    Returns NaN-safe sentinel (large negative) when w <= 0 (degenerate slice).
    """
    w = _w_float(svi, k_float)
    if w <= 0.0:
        return -1.0  # signal arb-violation / degenerate (will round to -F at FLOAT_SCALING)
    wp = _w_prime_float(svi, k_float)
    wpp = _w_double_prime_float(svi, k_float)
    term1 = (1.0 - k_float * wp / (2.0 * w)) ** 2
    term2 = (wp * wp) / 4.0 * (1.0 / w + 0.25)
    term3 = wpp / 2.0
    return term1 - term2 + term3


def check_arb(svi: SVIParams) -> ArbResult:
    """Compute the g(k) curve over +/- strike_range_sigma * sqrt(theta_T) and check >= 0.

    Args:
        svi: raw SVI parameters at FLOAT_SCALING.

    Returns:
        ArbResult with full g(k) array (Phase 4 dashboard renders this as a curve).
    """
    n = SVI_GRID_POINTS_FOR_ARB_CHECK

    # ATM total variance estimate: w(m) = a + b * sigma. At FLOAT_SCALING.
    # In real units: theta_t_atm_float = (a + b*sigma/F) / F.
    theta_t_atm_int = svi.a + (svi.b * svi.sigma) // F  # at FLOAT_SCALING
    if theta_t_atm_int <= 0:
        # Degenerate ATM variance — no defined ATM scale; treat as invalid.
        return ArbResult(
            params_valid=False,
            min_g_k=-F,
            calendar_pass=True,
            g_k_array=[-F] * n,
        )

    # k_max in real units: SVI_STRIKE_RANGE_SIGMA * sqrt(theta_t_atm_float)
    theta_t_atm_float = theta_t_atm_int / F
    k_max_float = float(SVI_STRIKE_RANGE_SIGMA) * math.sqrt(theta_t_atm_float)
    if k_max_float <= 0.0:
        return ArbResult(
            params_valid=False,
            min_g_k=-F,
            calendar_pass=True,
            g_k_array=[-F] * n,
        )

    # Build the linear k grid in real units (numpy ALLOWED here for vectorized sampling).
    k_grid = np.linspace(-k_max_float, k_max_float, n)

    # Track whether the canonical integer evaluator would reject any sampled k.
    # If it would, params_valid is False even if the float g(k) curve is non-negative.
    canonical_evaluator_ok = True

    g_k_floats: list[float] = []
    for k_val_float in k_grid.tolist():
        # Float g(k) for visualization curve.
        g_float = _g_of_k_float(svi, float(k_val_float))
        g_k_floats.append(g_float)

        # Canonical-evaluator probe: does total_variance() raise on this k?
        # If it does anywhere on the grid, the slice is not-evaluator-clean.
        if canonical_evaluator_ok:
            k_int = int(round(float(k_val_float) * F))
            try:
                _ = total_variance(svi, k_int)
            except ValueError:
                canonical_evaluator_ok = False

    # Convert g(k) floats to int at FLOAT_SCALING (Pitfall A: int output, not numpy.int64).
    g_k_array: list[int] = [int(round(g * F)) for g in g_k_floats]

    min_g = min(g_k_array)

    # params_valid AND-clauses min_g_k >= 0 with canonical-evaluator OK.
    params_valid = (min_g >= 0) and canonical_evaluator_ok

    return ArbResult(
        params_valid=params_valid,
        min_g_k=int(min_g),
        calendar_pass=True,  # single-tenor stub; svi-spec.md "Phase 1 single-tenor"
        g_k_array=g_k_array,
    )
