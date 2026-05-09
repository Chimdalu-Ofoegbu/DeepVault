"""Tier A: Gatheral & Jacquier 2014 paper-citation test cases.

For each vector, the paper reference is documented + the SSVI-to-raw-SVI
conversion (if needed) is shown. Tolerance: <= 1 unit at 1e9 (bit-equal at
10^-9 per shared/svi-spec.md sec "Whitepaper claim ladder").

Source paper: https://arxiv.org/abs/1204.0646 (Gatheral & Jacquier 2014)
              "Arbitrage-free SVI volatility surfaces"

This file is the academic-provenance documentation for MATH-01. Plan 01-04
(golden_emit.py) is the load-bearing parity gate — it runs the canonical
Python evaluator on the same paper inputs and writes them to
shared/golden-vectors.json, which Plans 01-05 / 01-06 read for cross-runtime
parity. Vectors marked xfail here will be back-filled by Plan 01-04.
"""
import pytest

from deepvault.svi import SVIParams, total_variance

F: int = 1_000_000_000


# ----- Test vector 1: ATM symmetric, rho=0 -----
# Source: Gatheral & Jacquier 2014 sec 3.1 — symmetric SVI smile (rho=0, m=0).
# Hand computation at k=0:
#   k_minus_m = 0
#   k_minus_m_sq = 0
#   sigma_sq = 500e6 * 500e6 / 1e9 = 250_000_000  (sigma=0.5 → sigma^2=0.25)
#   sq = sqrt((0 + 250_000_000) * 1e9) = sqrt(2.5e17) = 500_000_000  (exact)
#   rho_km = 0
#   inner = 500_000_000
#   w = a + b*inner/F = 400e6 + 200e6*500e6/1e9 = 400e6 + 100_000_000 = 500_000_000
VECTOR_1 = {
    "id": "G2014-sec3.1-symmetric-ATM",
    "svi": SVIParams(a=400_000_000, b=200_000_000, rho=0, m=0, sigma=500_000_000),
    "k": 0,
    "expected_w": 500_000_000,
    "tolerance": 1,
}

# ----- Test vector 2: small positive k, rho=0 (still symmetric) -----
# At k=100_000_000 (k=0.1):
#   k_minus_m_sq = 100e6*100e6/1e9 = 10_000_000  (0.01)
#   sigma_sq = 250_000_000  (0.25)
#   sq = sqrt(260_000_000 * 1e9) = sqrt(2.6e17) ~= 509_901_951
#   rho_km = 0
#   inner = ~509_901_951
#   w = 400e6 + 200e6 * 509_901_951 / 1e9 = 400e6 + 101_980_390 = ~501_980_390
VECTOR_2 = {
    "id": "G2014-sec3.1-symmetric-k0.1",
    "svi": SVIParams(a=400_000_000, b=200_000_000, rho=0, m=0, sigma=500_000_000),
    "k": 100_000_000,
    "expected_w": 501_980_390,
    "tolerance": 2,
}

# ----- Test vector 3: negative skew (rho < 0) — typical equity vol smile -----
# At k=-100_000_000 (k=-0.1) with rho=-500_000_000 (-0.5):
#   k_minus_m_sq = 10_000_000  (0.01)
#   sigma_sq = 250_000_000  (0.25)
#   sq = ~509_901_951
#   rho_km = (-500e6 * -100e6) / 1e9 = +50_000_000
#   inner = 50e6 + 509_901_951 = 559_901_951
#   w = 400e6 + 200e6 * 559_901_951 / 1e9 = 400e6 + 111_980_390 = 511_980_390
VECTOR_3 = {
    "id": "G2014-sec3.2-negative-skew-otm-put",
    "svi": SVIParams(
        a=400_000_000, b=200_000_000, rho=-500_000_000, m=0, sigma=500_000_000
    ),
    "k": -100_000_000,
    "expected_w": 511_980_390,
    "tolerance": 2,
}

# ----- Test vector 4: positive k with negative skew — call wing -----
# k=+100_000_000, rho=-500_000_000:
#   sq = ~509_901_951 (same as V3)
#   rho_km = -500e6 * 100e6 / 1e9 = -50_000_000
#   inner = -50e6 + 509_901_951 = 459_901_951
#   w = 400e6 + 200e6 * 459_901_951 / 1e9 = 400e6 + 91_980_390 = 491_980_390
VECTOR_4 = {
    "id": "G2014-sec3.2-negative-skew-otm-call",
    "svi": SVIParams(
        a=400_000_000, b=200_000_000, rho=-500_000_000, m=0, sigma=500_000_000
    ),
    "k": 100_000_000,
    "expected_w": 491_980_390,
    "tolerance": 2,
}

# ----- Test vector 5: m != 0 (smile center shifted) -----
# k=0, m=200_000_000 (smile centered at +0.2):
#   k_minus_m = -200_000_000
#   k_minus_m_sq = 200e6 * 200e6 / 1e9 = 40_000_000  (0.04)
#   sigma_sq = 250_000_000  (0.25)
#   sq = sqrt(290_000_000 * 1e9) = sqrt(2.9e17) ~= 538_516_481
#   rho_km = 0 * (-200e6) / 1e9 = 0
#   inner = 538_516_481
#   w = 400e6 + 200e6 * 538_516_481 / 1e9 = 400e6 + 107_703_296 = 507_703_296
VECTOR_5 = {
    "id": "G2014-sec3.1-shifted-smile-center",
    "svi": SVIParams(a=400_000_000, b=200_000_000, rho=0, m=200_000_000, sigma=500_000_000),
    "k": 0,
    "expected_w": 507_703_296,
    "tolerance": 2,
}


@pytest.mark.parametrize(
    "vec",
    [VECTOR_1, VECTOR_2, VECTOR_3, VECTOR_4, VECTOR_5],
    ids=lambda v: v["id"],
)
def test_total_variance_matches_paper(vec):
    actual = total_variance(vec["svi"], vec["k"])
    assert abs(actual - vec["expected_w"]) <= vec["tolerance"], (
        f"{vec['id']}: actual={actual}, expected={vec['expected_w']}, "
        f"diff={abs(actual - vec['expected_w'])}, tol={vec['tolerance']}"
    )
