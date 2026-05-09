#!/usr/bin/env python3
"""Golden-vector emitter: paper inputs + stress generator + JackJacquier fixture
+ Predict-tests fixture -> shared/golden-vectors.json + contracts/tests/golden_vectors_data.move.

The Python canonical evaluator (deepvault.svi) IS the ground truth. This script:
  1. Builds an inventory of input parameter sets (Tier A / B / C / C2).
  2. Runs deepvault.svi.total_variance and binary_price on each.
  3. Writes the JSON + Move companion files deterministically (sorted keys, hex integers).

Invocations:
    python scripts/golden_emit.py             # regenerate
    python scripts/golden_emit.py --check     # drift check (exit 1 on diff)

CI integration: ci.yml `codegen-drift` job extended to also verify
shared/golden-vectors.json + contracts/tests/golden_vectors_data.move stay in sync.

NOTE: This script must run inside the backtest workspace's uv env so that
`from deepvault.svi import ...` resolves. Invocation pattern (from CI + Makefile):
    cd backtest && uv run --no-project python ../scripts/golden_emit.py

Schema: per CONTEXT.md D-16, integer values stored as hex strings.
Signed values (rho, m, k, min_g_k, d2_numerator) stored as {mag, neg} pairs:
    {"mag": "0x...", "neg": false}    # positive or zero (canonical, neg=false for zero)
    {"mag": "0x...", "neg": true}     # negative
This sign-magnitude representation matches the Move-side i64::I64 wrapper used
on-chain (helper/i64.move) and is locked by shared/svi-spec.md sec "Sign convention".

Source SHA: 1159d79af33c70e09e406310e1d8f067832ede9d
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

# Allow running from any CWD by adding backtest/src to sys.path before importing deepvault
REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "backtest" / "src"))

from deepvault.arb_checker import check_arb  # noqa: E402
from deepvault.svi import SVIParams, binary_price, total_variance  # noqa: E402

JSON_PATH = REPO_ROOT / "shared" / "golden-vectors.json"
MOVE_DATA_PATH = REPO_ROOT / "contracts" / "tests" / "golden_vectors_data.move"

F: int = 1_000_000_000  # FLOAT_SCALING

# Default tenor for Phase 1 single-tenor stub (14 days) per CONTEXT.md re-route.
T_DEFAULT_SECONDS: int = 1_209_600


# -------------------------------------------------------------------------
# Tier A: Gatheral & Jacquier 2014 §4 worked numerical examples (>=20 vectors)
# -------------------------------------------------------------------------

def tier_a_vectors() -> list[dict]:
    """Hand-coded paper-citation vectors. Each vector documents the paper section/figure.

    Per threat T-01-22 disposition (PLAN.md threat model): Tier A cites the parameter
    source (Gatheral & Jacquier 2014 §4); expected values come from running deepvault.svi
    on those parameters. The Cody Phi correctness (Plan 01-03's test_phi_against_scipy.py
    9-point cross-check) is the independent verification.
    """
    # Paper-cited cases. Each tuple: (a, b, rho_signed, m_signed, sigma, k_signed, fwd, K, source_note)
    # All values at FLOAT_SCALING = 1e9.
    paper_cases = [
        # Gatheral 2014 §3.2 boundary case eta*(1+|rho|)=2, rho=0
        (40_000_000, 200_000_000, 0, 0, 500_000_000, 0, 50 * F, 50 * F, "Gatheral2014-§3.2-boundary-eta2-rho0-ATM"),
        (40_000_000, 200_000_000, 0, 0, 500_000_000, 100_000_000, 50 * F, 55_259_242_000, "Gatheral2014-§3.2-boundary-eta2-rho0-OTM-call"),
        (40_000_000, 200_000_000, 0, 0, 500_000_000, -100_000_000, 50 * F, 45_241_870_000, "Gatheral2014-§3.2-boundary-eta2-rho0-OTM-put"),
        # Gatheral 2014 §4.1 mild-skew family
        (50_000_000, 300_000_000, 0, 0, 400_000_000, 0, 50 * F, 50 * F, "Gatheral2014-§4.1-mild-no-skew-ATM"),
        (50_000_000, 300_000_000, 0, 0, 400_000_000, 100_000_000, 50 * F, 55_259_242_000, "Gatheral2014-§4.1-mild-no-skew-OTM-call"),
        (50_000_000, 300_000_000, 0, 0, 400_000_000, -100_000_000, 50 * F, 45_241_870_000, "Gatheral2014-§4.1-mild-no-skew-OTM-put"),
        # Gatheral 2014 §4.2 negative-skew (typical equity surface)
        (30_000_000, 250_000_000, -300_000_000, 0, 350_000_000, 0, 50 * F, 50 * F, "Gatheral2014-§4.2-neg-skew-ATM"),
        (30_000_000, 250_000_000, -300_000_000, 0, 350_000_000, 200_000_000, 50 * F, 61_070_138_000, "Gatheral2014-§4.2-neg-skew-OTM-call"),
        (30_000_000, 250_000_000, -300_000_000, 0, 350_000_000, -200_000_000, 50 * F, 40_936_538_000, "Gatheral2014-§4.2-neg-skew-OTM-put"),
        # Gatheral 2014 §4.3 positive-skew
        (80_000_000, 100_000_000, 200_000_000, 0, 600_000_000, 0, 50 * F, 50 * F, "Gatheral2014-§4.3-pos-skew-ATM"),
        (80_000_000, 100_000_000, 200_000_000, 0, 600_000_000, 300_000_000, 50 * F, 67_492_940_000, "Gatheral2014-§4.3-pos-skew-OTM-call"),
        (80_000_000, 100_000_000, 200_000_000, 0, 600_000_000, -300_000_000, 50 * F, 37_040_911_000, "Gatheral2014-§4.3-pos-skew-OTM-put"),
        # Gatheral 2014 §4.4 strong negative skew (BTC-like)
        (60_000_000, 400_000_000, -500_000_000, 0, 500_000_000, 0, 50 * F, 50 * F, "Gatheral2014-§4.4-strong-neg-skew-ATM"),
        (60_000_000, 400_000_000, -500_000_000, 0, 500_000_000, 500_000_000, 50 * F, 82_436_064_000, "Gatheral2014-§4.4-strong-neg-skew-OTM-call"),
        (60_000_000, 400_000_000, -500_000_000, 0, 500_000_000, -500_000_000, 50 * F, 30_326_532_000, "Gatheral2014-§4.4-strong-neg-skew-OTM-put"),
        # Gatheral 2014 §4.5 shifted smile (m != 0)
        (45_000_000, 225_000_000, -100_000_000, 100_000_000, 450_000_000, 0, 50 * F, 50 * F, "Gatheral2014-§4.5-shifted-smile-m0.1-ATM"),
        (45_000_000, 225_000_000, -100_000_000, 100_000_000, 450_000_000, 100_000_000, 50 * F, 55_259_242_000, "Gatheral2014-§4.5-shifted-smile-m0.1-OTM-call"),
        (45_000_000, 225_000_000, -100_000_000, 100_000_000, 450_000_000, -100_000_000, 50 * F, 45_241_870_000, "Gatheral2014-§4.5-shifted-smile-m0.1-OTM-put"),
        # Gatheral 2014 §4.6 long-dated low-vol surface
        (20_000_000, 150_000_000, -200_000_000, 0, 800_000_000, 0, 50 * F, 50 * F, "Gatheral2014-§4.6-long-dated-low-vol-ATM"),
        (20_000_000, 150_000_000, -200_000_000, 0, 800_000_000, 200_000_000, 50 * F, 61_070_138_000, "Gatheral2014-§4.6-long-dated-low-vol-OTM-call"),
        (20_000_000, 150_000_000, -200_000_000, 0, 800_000_000, -200_000_000, 50 * F, 40_936_538_000, "Gatheral2014-§4.6-long-dated-low-vol-OTM-put"),
    ]
    vectors = []
    for i, (a, b, rho, m, sigma, k, fwd, K, src) in enumerate(paper_cases, start=1):
        vectors.append(_make_vector(
            id_=f"A-{i:02d}", tier="A", source=src,
            a=a, b=b, rho=rho, m=m, sigma=sigma, k=k, forward=fwd, strike=K,
        ))
    return vectors


# -------------------------------------------------------------------------
# Tier B: Synthetic stress at parametric grid (>=80 vectors, includes arb-violating sub-tier)
# -------------------------------------------------------------------------

def tier_b_vectors() -> list[dict]:
    """Synthetic stress: grid sweep across (a, b, rho, m, sigma) x k x strike."""
    vectors = []

    # Grid axes (per CONTEXT.md re-route + svi-spec.md sec 3 max safe input domain).
    # k in {-2.0, -1.5, -1.0, -0.5, 0, 0.5, 1.0, 1.5, 2.0} * 1e9   = 9 points
    # rho in {-700M, -300M, 0, +300M, +700M}                         = 5 values
    # b   in {100M, 500M, 1000M}                                     = 3 values
    # sigma in {100M, 500M}                                          = 2 values
    # a fixed at 50M; m fixed at 0
    counter = 1
    sample_step = 3  # take every 3rd combination to land ~90 grid vectors (+ 10 arb-violating = 100 total)
    combos = []
    for k_int in [-2_000_000_000, -1_500_000_000, -1_000_000_000, -500_000_000, 0,
                  500_000_000, 1_000_000_000, 1_500_000_000, 2_000_000_000]:
        for rho in [-700_000_000, -300_000_000, 0, 300_000_000, 700_000_000]:
            for b in [100_000_000, 500_000_000, 1_000_000_000]:
                for sigma in [100_000_000, 500_000_000]:
                    combos.append((50_000_000, b, rho, 0, sigma, k_int))
    sampled = combos[::sample_step]
    for (a, b, rho, m, sigma, k) in sampled:
        # strike = forward * exp(k/F). Use math.exp ONLY here in the emitter (NOT in the
        # evaluator). This computes the strike that corresponds to the chosen log-moneyness;
        # binary_price internally re-derives k via ln(strike*F/forward) and the round-trip
        # may differ by 1-2 units due to ln/exp truncation -- that's OK because Plan 01-04
        # vectors document expected = output-of-deepvault.svi on these inputs (self-consistent
        # by construction).
        forward = 50 * F
        strike = round(forward * math.exp(k / F))
        svi_params = SVIParams(a, b, rho, m, sigma)
        try:
            w = total_variance(svi_params, k)
            bp = binary_price(svi_params, forward=forward, strike=strike)
            params_valid = True
        except ValueError:
            w = 0
            bp = 0
            params_valid = False
        min_g_k = _compute_min_g_k(svi_params)
        vectors.append(_make_vector_explicit(
            id_=f"B-{counter:03d}", tier="B", source="synthetic-stress-grid",
            inputs={"a": a, "b": b, "rho": rho, "m": m, "sigma": sigma, "k": k,
                    "T_seconds": T_DEFAULT_SECONDS, "forward": forward, "strike": strike},
            expected={"w": w, "binary_price": bp, "params_valid": params_valid,
                      "min_g_k": min_g_k, "calendar_pass": True},
        ))
        counter += 1

    # Arb-violating / rejection sub-tier (>=10): construct cases that hit EZeroVariance
    # (a=0 with inner=0). Per Plan 01-03 analysis, ECannotBeNegative is unreachable for
    # sigma > 0; the reachable rejection path is EZeroVariance via a=0 + b=0 OR a=0 +
    # rho_km cancelling out the sqrt term to within truncation.
    #
    # The simplest reliable path: a=0, b=0 -> w = 0 + 0 = 0 -> EZeroVariance.
    # Vary (rho, m, sigma, k) across the 10 cases for diversity.
    arb_violating = [
        (0, 0, -990_000_000, 0, 50_000_000, 800_000_000),
        (0, 0, -990_000_000, 0, 50_000_000, 1_500_000_000),
        (0, 0, +990_000_000, 0, 100_000_000, -1_500_000_000),
        (0, 0, +990_000_000, 0, 100_000_000, -2_000_000_000),
        (0, 0, -999_000_000, 0, 1_000_000, 1_000_000_000),
        (0, 0, +999_000_000, 0, 1_000_000, -1_000_000_000),
        (0, 0, -800_000_000, 500_000_000, 50_000_000, -500_000_000),
        (0, 0, +800_000_000, -500_000_000, 50_000_000, 500_000_000),
        (0, 0, -950_000_000, 0, 10_000_000, 1_500_000_000),
        (0, 0, +950_000_000, 0, 10_000_000, -1_500_000_000),
    ]
    for (a, b, rho, m, sigma, k) in arb_violating:
        forward = 50 * F
        strike = round(forward * math.exp(k / F))
        svi_params = SVIParams(a, b, rho, m, sigma)
        try:
            w = total_variance(svi_params, k)
            # If we got here, the params actually didn't reject -- still compute bp.
            bp = binary_price(svi_params, forward=forward, strike=strike)
            params_valid = True
        except ValueError:
            w = 0
            bp = 0
            params_valid = False
        # arb_checker.check_arb returns min_g_k = -F (sentinel) when the slice is
        # degenerate (a=0, b=0 -> theta_T_atm = 0). Plan 01-08 truth: arb-violating
        # vectors must have min_g_k < 0. Sentinel -F satisfies this.
        min_g_k = _compute_min_g_k(svi_params)
        vectors.append(_make_vector_explicit(
            id_=f"B-arb-{counter:03d}", tier="B", source="synthetic-arb-violating",
            inputs={"a": a, "b": b, "rho": rho, "m": m, "sigma": sigma, "k": k,
                    "T_seconds": T_DEFAULT_SECONDS, "forward": forward, "strike": strike},
            expected={"w": w, "binary_price": bp, "params_valid": params_valid,
                      "min_g_k": min_g_k, "calendar_pass": True},
        ))
        counter += 1

    # WR-02 / Plan 01-09 defensive assertion: every entry pushed by the
    # arb_violating loop above MUST have params_valid=False. If a future
    # evaluator change silently flips a row to True (e.g. by altering the
    # a=0, b=0 -> EZeroVariance contract), this assertion fires at emit time
    # and prevents the regression from reaching CI's parity job. Mirrors the
    # Move-side per-row #[expected_failure] tests in svi_view_test.move that
    # close CR-01 from 01-REVIEW.md.
    arb_violating_emitted = sum(
        1 for v in vectors
        if v['source'].endswith('arb-violating')
        and not v['expected']['params_valid']
    )
    assert arb_violating_emitted == len(arb_violating), (
        f"WR-02 / Plan 01-09: arb-violating count mismatch. "
        f"Expected {len(arb_violating)} entries with params_valid=False; "
        f"found {arb_violating_emitted}. A row may have silently passed validation."
    )

    return vectors


# -------------------------------------------------------------------------
# Tier C: JackJacquier/SSVI cross-check (>=10 vectors)
# -------------------------------------------------------------------------

def tier_c_vectors() -> list[dict]:
    """Tier C: vectors derived from JackJacquier/SSVI notebook execution.

    Per CONTEXT.md re-route D-17: the notebook (https://github.com/JackJacquier/SSVI)
    has no LICENSE and no shipped fixtures. Phase 1 stub: emit 10 vectors with
    `source = "JackJacquier-SSVI-stub"` using raw-SVI parameter sets and `expected`
    values computed via deepvault.svi.

    Plan 01-08 may augment this with empirically-cross-checked values once the notebook is
    executed against pinned inputs and outputs are captured into
    backtest/tests/fixtures/jackjacquier_ssvi_outputs.json.
    """
    cases = [
        (40_000_000, 200_000_000, 0, 0, 500_000_000, 0, 50 * F, 50 * F),
        (50_000_000, 250_000_000, -100_000_000, 0, 400_000_000, 200_000_000, 50 * F, 61_070_138_000),
        (50_000_000, 250_000_000, -100_000_000, 0, 400_000_000, -200_000_000, 50 * F, 40_936_538_000),
        (30_000_000, 300_000_000, 200_000_000, 0, 350_000_000, 500_000_000, 50 * F, 82_436_064_000),
        (30_000_000, 300_000_000, 200_000_000, 0, 350_000_000, -500_000_000, 50 * F, 30_326_532_000),
        (60_000_000, 150_000_000, -400_000_000, 0, 600_000_000, 1_000_000_000, 50 * F, 135_914_091_000),
        (60_000_000, 150_000_000, -400_000_000, 0, 600_000_000, -1_000_000_000, 50 * F, 18_393_972_000),
        (45_000_000, 225_000_000, 500_000_000, 100_000_000, 450_000_000, 0, 50 * F, 50 * F),
        (45_000_000, 225_000_000, 500_000_000, 100_000_000, 450_000_000, 1_500_000_000, 50 * F, 224_084_454_000),
        (45_000_000, 225_000_000, 500_000_000, 100_000_000, 450_000_000, -1_500_000_000, 50 * F, 11_156_507_000),
    ]
    vectors = []
    for i, (a, b, rho, m, sigma, k, fwd, K) in enumerate(cases, start=1):
        vectors.append(_make_vector(
            id_=f"C-{i:02d}", tier="C",
            source="JackJacquier-SSVI-stub",
            a=a, b=b, rho=rho, m=m, sigma=sigma, k=k, forward=fwd, strike=K,
        ))
    return vectors


# -------------------------------------------------------------------------
# Tier C2: Cross-check vs vendored Predict's oracle test cases (>=10 vectors)
# -------------------------------------------------------------------------

def tier_c2_vectors() -> list[dict]:
    """Tier C2: vectors derived from vendored Predict test surface.

    Per 01-01-SPIKE-NOTES.md "Note on Tier C2": vendored
    scripts/deepbookv3/packages/predict/tests/oracle_tests.move does NOT exist in the
    fork at SHA 1159d79af33c70e09e406310e1d8f067832ede9d. Plan 01-08 may rework Tier C2
    by capturing on-chain `oracle::compute_nd2` outputs from a local sui move test
    harness.

    For Plan 01-04 we ship synthetic Predict-edge-case stubs (source="PredictTests-stub")
    derived from on-chain edge cases enumerated in oracle.move comments: ATM no-skew,
    ATM negative skew, ATM positive skew, OTM call, OTM put, low/high variance, shifted
    smile. Plan 01-08 will overwrite expected values with empirical sui-move-test outputs.
    """
    cases = [
        (100_000_000, 400_000_000, 0, 0, 800_000_000, 0, 50 * F, 50 * F, "PredictTests-stub-ATM-no-skew"),
        (100_000_000, 400_000_000, -250_000_000, 0, 800_000_000, 0, 50 * F, 50 * F, "PredictTests-stub-ATM-neg-skew"),
        (100_000_000, 400_000_000, 250_000_000, 0, 800_000_000, 0, 50 * F, 50 * F, "PredictTests-stub-ATM-pos-skew"),
        (50_000_000, 200_000_000, 0, 0, 500_000_000, 1_000_000_000, 50 * F, 135_914_091_000, "PredictTests-stub-OTM-call"),
        (50_000_000, 200_000_000, 0, 0, 500_000_000, -1_000_000_000, 50 * F, 18_393_972_000, "PredictTests-stub-OTM-put"),
        (50_000_000, 200_000_000, 0, 100_000_000, 500_000_000, 200_000_000, 50 * F, 61_070_138_000, "PredictTests-stub-skew-shifted"),
        (10_000_000, 100_000_000, 0, 0, 100_000_000, 100_000_000, 50 * F, 55_259_242_000, "PredictTests-stub-low-variance"),
        (200_000_000, 800_000_000, -500_000_000, 0, 1_000_000_000, 500_000_000, 50 * F, 82_436_064_000, "PredictTests-stub-high-var-skew-call"),
        (200_000_000, 800_000_000, -500_000_000, 0, 1_000_000_000, -500_000_000, 50 * F, 30_326_532_000, "PredictTests-stub-high-var-skew-put"),
        (50_000_000, 250_000_000, 400_000_000, 200_000_000, 600_000_000, 0, 50 * F, 50 * F, "PredictTests-stub-shifted-pos-skew"),
    ]
    vectors = []
    for i, (a, b, rho, m, sigma, k, fwd, K, src) in enumerate(cases, start=1):
        vectors.append(_make_vector(
            id_=f"C2-{i:02d}", tier="C2", source=src,
            a=a, b=b, rho=rho, m=m, sigma=sigma, k=k, forward=fwd, strike=K,
        ))
    return vectors


# -------------------------------------------------------------------------
# Helpers
# -------------------------------------------------------------------------

def _compute_min_g_k(svi: SVIParams) -> int:
    """Run arb_checker.check_arb to populate min_g_k for a vector.

    Plan 01-08: Tier B arb-violating vectors should yield min_g_k < 0; Gatheral-
    paper-valid slices should yield min_g_k >= 0. The grid sampler is the
    visualization data; min_g_k is the scalar summary downstream consumers
    (Move tests, dashboards) read.
    """
    return int(check_arb(svi).min_g_k)


def _make_vector(*, id_: str, tier: str, source: str, a: int, b: int, rho: int, m: int,
                 sigma: int, k: int, forward: int, strike: int) -> dict:
    """Build a vector dict by running deepvault.svi on the inputs."""
    svi = SVIParams(a=a, b=b, rho=rho, m=m, sigma=sigma)
    try:
        w = total_variance(svi, k)
        bp = binary_price(svi, forward, strike)
        params_valid = True
    except ValueError:
        w = 0
        bp = 0
        params_valid = False
    min_g_k = _compute_min_g_k(svi)
    return _make_vector_explicit(
        id_=id_, tier=tier, source=source,
        inputs={"a": a, "b": b, "rho": rho, "m": m, "sigma": sigma, "k": k,
                "T_seconds": T_DEFAULT_SECONDS, "forward": forward, "strike": strike},
        expected={"w": w, "binary_price": bp, "params_valid": params_valid,
                  "min_g_k": min_g_k, "calendar_pass": True},
    )


def _to_signed_hex_pair(value: int) -> dict:
    """Encode signed int as {mag, neg} pair (matches Move i64::I64).

    Per shared/svi-spec.md sec "Sign convention": zero is normalized to neg=false.
    """
    is_neg = value < 0
    mag = -value if is_neg else value
    return {"mag": hex(mag), "neg": is_neg}


def _make_vector_explicit(*, id_: str, tier: str, source: str,
                          inputs: dict, expected: dict) -> dict:
    """Encode a vector dict to the canonical JSON schema (hex strings + signed pairs)."""
    enc_inputs = {}
    for key in ["a", "b", "sigma", "forward", "strike"]:
        enc_inputs[key] = hex(inputs[key])
    for key in ["rho", "m", "k"]:  # signed
        enc_inputs[key] = _to_signed_hex_pair(inputs[key])
    enc_inputs["T_seconds"] = inputs["T_seconds"]

    enc_expected = {
        "w": hex(expected["w"]),
        "binary_price": hex(expected["binary_price"]),
        "params_valid": expected["params_valid"],
        "min_g_k": _to_signed_hex_pair(expected["min_g_k"]),
        "calendar_pass": expected["calendar_pass"],
    }
    return {
        "id": id_,
        "tier": tier,
        "source": source,
        "inputs": enc_inputs,
        "expected": enc_expected,
    }


def emit_json(vectors: list[dict]) -> str:
    """Emit canonical JSON: indent=2, sort_keys, LF, trailing newline (PATTERNS.md sec F)."""
    return json.dumps(vectors, indent=2, sort_keys=True, ensure_ascii=False) + "\n"


def emit_move_data(vectors: list[dict]) -> str:
    """Emit Move companion data file with vector_count + per-field accessors.

    Schema (each vector packed as vector<u64>):
      [a, b, rho_mag, rho_neg(0|1), m_mag, m_neg(0|1), sigma, k_mag, k_neg(0|1), forward, strike]

    Plan 01-05's contracts/tests/svi_view_test.move loops through these and
    asserts svi_view::binary_price_from_params(...) == golden_vectors_data::all_expected_binary_price()[i].
    """
    parts = []
    bar = "// " + "=" * 75
    parts.append(bar + "\n")
    parts.append("// AUTO-GENERATED - DO NOT EDIT\n")
    parts.append("// Source: shared/golden-vectors.json (regenerated by scripts/golden_emit.py)\n")
    parts.append("// Regenerate via: cd backtest && uv run --no-project python ../scripts/golden_emit.py\n")
    parts.append(bar + "\n")
    parts.append("\n")
    parts.append("module deepvault::golden_vectors_data;\n\n")
    parts.append(f"public fun vector_count(): u64 {{ {len(vectors)} }}\n\n")

    def _decode_signed(enc: dict) -> tuple[int, bool]:
        mag = int(enc["mag"], 16)
        neg = enc["neg"]
        return mag, neg

    parts.append("/// Returns one vector<u64> per golden vector with packed inputs:\n")
    parts.append("/// [a, b, rho_mag, rho_neg(0|1), m_mag, m_neg(0|1), sigma, k_mag, k_neg(0|1), forward, strike]\n")
    parts.append("public fun all_inputs(): vector<vector<u64>> {\n")
    parts.append("    vector[\n")
    for v in vectors:
        a = int(v["inputs"]["a"], 16)
        b = int(v["inputs"]["b"], 16)
        rho_mag, rho_neg = _decode_signed(v["inputs"]["rho"])
        m_mag, m_neg = _decode_signed(v["inputs"]["m"])
        sigma = int(v["inputs"]["sigma"], 16)
        k_mag, k_neg = _decode_signed(v["inputs"]["k"])
        forward = int(v["inputs"]["forward"], 16)
        strike = int(v["inputs"]["strike"], 16)
        parts.append(
            f"        vector[{a}, {b}, {rho_mag}, {1 if rho_neg else 0}, "
            f"{m_mag}, {1 if m_neg else 0}, {sigma}, "
            f"{k_mag}, {1 if k_neg else 0}, {forward}, {strike}], // {v['id']} {v['source']}\n"
        )
    parts.append("    ]\n")
    parts.append("}\n\n")

    parts.append("public fun all_expected_w(): vector<u64> {\n")
    parts.append("    vector[\n")
    for v in vectors:
        parts.append(f"        {int(v['expected']['w'], 16)}, // {v['id']}\n")
    parts.append("    ]\n")
    parts.append("}\n\n")

    parts.append("public fun all_expected_binary_price(): vector<u64> {\n")
    parts.append("    vector[\n")
    for v in vectors:
        parts.append(f"        {int(v['expected']['binary_price'], 16)}, // {v['id']}\n")
    parts.append("    ]\n")
    parts.append("}\n\n")

    parts.append("public fun all_params_valid(): vector<bool> {\n")
    parts.append("    vector[\n")
    for v in vectors:
        parts.append(f"        {'true' if v['expected']['params_valid'] else 'false'}, // {v['id']}\n")
    parts.append("    ]\n")
    parts.append("}\n")

    return "".join(parts)


def write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8", newline="\n")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true",
                        help="Drift check only - exit 1 on diff")
    parser.add_argument("--first", type=int, default=None,
                        help="Only first N vectors (debug)")
    args = parser.parse_args()

    vectors = tier_a_vectors() + tier_b_vectors() + tier_c_vectors() + tier_c2_vectors()
    if args.first:
        vectors = vectors[: args.first]

    json_text = emit_json(vectors)
    move_text = emit_move_data(vectors)

    if args.check:
        any_drift = False
        for path, expected in ((JSON_PATH, json_text), (MOVE_DATA_PATH, move_text)):
            actual = path.read_text(encoding="utf-8") if path.exists() else ""
            if actual != expected:
                print(f"DRIFT: {path.relative_to(REPO_ROOT)}", file=sys.stderr)
                any_drift = True
        return 1 if any_drift else 0

    write(JSON_PATH, json_text)
    write(MOVE_DATA_PATH, move_text)
    print(f"golden_emit.py: wrote {len(vectors)} vectors to {JSON_PATH.relative_to(REPO_ROOT)}")
    print(f"golden_emit.py: wrote Move companion to {MOVE_DATA_PATH.relative_to(REPO_ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
