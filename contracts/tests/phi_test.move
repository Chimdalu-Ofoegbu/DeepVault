// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0
//
// Unit tests for deepvault::helpers::phi (Cody 1969 normal CDF).
//
// Expected values at integer-x test points come from scipy.stats.norm.cdf
// (independently verified ground truth — see backtest/tests/test_phi_against_scipy.py
// from Plan 01-03, which asserts the Python clone matches scipy at <1e-7).
// Tolerance on Move side is 5 units at 1e9 per Cody 1969 accuracy claim
// (shared/svi-spec.md sec "Phi approximation").

#[test_only]
module deepvault::phi_tests;

use deepvault::helpers::i64;
use deepvault::helpers::phi;
use std::unit_test::assert_eq;

const FLOAT_SCALING: u64 = 1_000_000_000;

// scipy.stats.norm.cdf reference values, scaled to 1e9 (rounded).
// Independently derived per .claude/rules/unit-tests.md rule 1.
const PHI_AT_PLUS_HALF: u64 = 691_462_461; // Φ(0.5)
const PHI_AT_PLUS_ONE: u64 = 841_344_746; // Φ(1.0)
const PHI_AT_PLUS_TWO: u64 = 977_249_868; // Φ(2.0)
const PHI_AT_PLUS_THREE: u64 = 998_650_102; // Φ(3.0)

// Cody 1969 absolute tolerance at 1e9 fixed-point scale.
const PHI_TOLERANCE: u64 = 5;

fun within_tolerance(actual: u64, expected: u64, tol: u64): bool {
    if (actual >= expected) {
        actual - expected <= tol
    } else {
        expected - actual <= tol
    }
}

#[test]
fun phi_at_zero_is_half() {
    let z = i64::zero();
    let p = phi::normal_cdf(&z);
    assert_eq!(p, FLOAT_SCALING / 2);
}

#[test]
fun phi_extreme_negative_clamps_zero() {
    // |x| > 8 must return 0 for negative x.
    let x = i64::from_parts(10 * FLOAT_SCALING, true);
    assert_eq!(phi::normal_cdf(&x), 0);
}

#[test]
fun phi_extreme_positive_clamps_F() {
    let x = i64::from_u64(10 * FLOAT_SCALING);
    assert_eq!(phi::normal_cdf(&x), FLOAT_SCALING);
}

#[test]
fun phi_symmetry_around_zero_at_half() {
    // Φ(x) + Φ(-x) = 1 (exact in fixed-point only when both branches preserve
    // the F/2 ± term symmetry; tolerate 1 unit for division asymmetry).
    let x = i64::from_u64(500_000_000);
    let neg_x = i64::from_parts(500_000_000, true);
    let p = phi::normal_cdf(&x);
    let np = phi::normal_cdf(&neg_x);
    let sum = p + np;
    // Allow 1-unit slack for round-down asymmetry.
    assert!(within_tolerance(sum, FLOAT_SCALING, 1));
}

#[test]
fun phi_at_plus_half_matches_scipy() {
    let x = i64::from_u64(500_000_000);
    let p = phi::normal_cdf(&x);
    assert!(within_tolerance(p, PHI_AT_PLUS_HALF, PHI_TOLERANCE));
}

#[test]
fun phi_at_plus_one_matches_scipy() {
    let x = i64::from_u64(FLOAT_SCALING);
    let p = phi::normal_cdf(&x);
    assert!(within_tolerance(p, PHI_AT_PLUS_ONE, PHI_TOLERANCE));
}

#[test]
fun phi_at_plus_two_matches_scipy() {
    let x = i64::from_u64(2 * FLOAT_SCALING);
    let p = phi::normal_cdf(&x);
    assert!(within_tolerance(p, PHI_AT_PLUS_TWO, PHI_TOLERANCE));
}

#[test]
fun phi_at_plus_three_matches_scipy() {
    let x = i64::from_u64(3 * FLOAT_SCALING);
    let p = phi::normal_cdf(&x);
    assert!(within_tolerance(p, PHI_AT_PLUS_THREE, PHI_TOLERANCE));
}

#[test]
fun phi_at_minus_one_complements() {
    // Φ(-1) = 1 - Φ(1) ~ 158_655_254
    let x = i64::from_parts(FLOAT_SCALING, true);
    let p = phi::normal_cdf(&x);
    let expected = FLOAT_SCALING - PHI_AT_PLUS_ONE;
    assert!(within_tolerance(p, expected, PHI_TOLERANCE));
}

#[test]
fun phi_continuity_at_small_threshold() {
    // SMALL_THRESHOLD = 662_910_000. Verify continuity by comparing values
    // just below and just above the threshold; difference should be tiny.
    let x_lo = i64::from_u64(662_909_000);
    let x_hi = i64::from_u64(662_911_000);
    let p_lo = phi::normal_cdf(&x_lo);
    let p_hi = phi::normal_cdf(&x_hi);
    // Across a 2_000 input gap at this region, Phi changes by roughly
    // 2000 * pdf(0.66) ~ 2000 * 3.2e-1 = 640 units. Allow 1000 for slack.
    assert!(within_tolerance(p_lo, p_hi, 1000));
}

#[test]
fun exp_at_zero_returns_one() {
    // exp(0) = 1 = FLOAT_SCALING.
    let z = i64::zero();
    assert_eq!(phi::exp(&z), FLOAT_SCALING);
}

#[test]
fun exp_at_ln2_returns_two() {
    // exp(ln(2)) = 2.0 = 2 * F. LN2 ~ 693_147_180; expect ~ 2_000_000_000
    // within a few units due to truncation in the series.
    let x = i64::from_u64(693_147_180);
    let r = phi::exp(&x);
    assert!(within_tolerance(r, 2 * FLOAT_SCALING, 100));
}

#[test, expected_failure(abort_code = phi::EExpOverflow)]
fun exp_overflow_aborts() {
    let x = i64::from_u64(23_638_153_700);
    let _ = phi::exp(&x);
    abort 999
}
