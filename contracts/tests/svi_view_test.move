// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0
//
// MATH-02 PARITY GATE for the Move runtime.
//
// Loops over deepvault::golden_vectors_data (codegen-emitted alongside
// shared/golden-vectors.json by Plan 01-04, populated from the canonical
// Python evaluator at backtest/src/deepvault/svi.py which itself was
// validated against scipy in Plan 01-03) and asserts that
// deepvault::svi_view produces bit-equal output for every Tier-A/B/C/C2
// vector marked params_valid=true. Tolerance: 1 unit at FLOAT_SCALING per
// re-routed D-14.
//
// Vectors with params_valid=false are skipped here; rejection-path
// coverage lives in `rejects_inner_negative` and `total_variance_zero_b_aborts`
// below.

#[test_only]
module deepvault::svi_view_tests;

use deepvault::golden_vectors_data;
use deepvault::helpers::i64;
use deepvault::svi_view;

/// 1 unit at FLOAT_SCALING per re-routed D-14.
const PARITY_TOLERANCE: u64 = 1;

fun within_tolerance(actual: u64, expected: u64, tol: u64): bool {
    if (actual >= expected) {
        actual - expected <= tol
    } else {
        expected - actual <= tol
    }
}

#[test]
fun golden_vectors_total_variance_all_pass() {
    let n = golden_vectors_data::vector_count();
    let inputs = golden_vectors_data::all_inputs();
    let expected_w = golden_vectors_data::all_expected_w();
    let params_valid = golden_vectors_data::all_params_valid();
    let mut i = 0;
    while (i < n) {
        let is_valid = params_valid[i];
        if (is_valid) {
            // Unpack [a, b, rho_mag, rho_neg, m_mag, m_neg, sigma,
            //        k_mag, k_neg, forward, strike].
            let row = inputs[i];
            let a = row[0];
            let b = row[1];
            let rho = i64::from_parts(row[2], row[3] == 1);
            let m = i64::from_parts(row[4], row[5] == 1);
            let sigma = row[6];
            let k = i64::from_parts(row[7], row[8] == 1);
            let actual_w = svi_view::total_variance_from_params(a, b, rho, m, sigma, &k);
            let expected = expected_w[i];
            assert!(within_tolerance(actual_w, expected, PARITY_TOLERANCE), i);
        };
        i = i + 1;
    };
}

#[test]
fun golden_vectors_binary_price_all_pass() {
    let n = golden_vectors_data::vector_count();
    let inputs = golden_vectors_data::all_inputs();
    let expected_bp = golden_vectors_data::all_expected_binary_price();
    let params_valid = golden_vectors_data::all_params_valid();
    let mut i = 0;
    while (i < n) {
        let is_valid = params_valid[i];
        if (is_valid) {
            let row = inputs[i];
            let a = row[0];
            let b = row[1];
            let rho = i64::from_parts(row[2], row[3] == 1);
            let m = i64::from_parts(row[4], row[5] == 1);
            let sigma = row[6];
            let forward = row[9];
            let strike = row[10];
            let actual_bp = svi_view::binary_price_from_params(
                a,
                b,
                rho,
                m,
                sigma,
                forward,
                strike,
            );
            let expected = expected_bp[i];
            assert!(within_tolerance(actual_bp, expected, PARITY_TOLERANCE), i);
        };
        i = i + 1;
    };
}

/// Per-row rejection coverage for B-arb-091..B-arb-100 (closes CR-01 from
/// 01-REVIEW.md). Per scripts/deepbookv3/.claude/rules/code-review.md:
/// "Every generated test vector must be exercised against the contract.
/// If generated data isn't passed to the function under test, delete it."
///
/// The 10 arb-violating Tier-B golden vectors live at zero-indexed array
/// offsets 111..120 in `golden_vectors_data::all_inputs()` (B-arb-091 → 111,
/// B-arb-100 → 120; layout: A 0..20, B-001..B-090 at 21..110, B-arb-* at
/// 111..120, C 121..130, C2 131..140). Each row has `a=0, b=0` per the
/// emitter's deliberate construction in `scripts/golden_emit.py:167-178`:
/// this lands on the only reachable rejection path documented in Plan
/// 01-03/01-04 mathematical analysis. ECannotBeNegative is unreachable for
/// sigma > 0; EZeroVariance via (a=0, b=0) is the reachable path.
///
/// With a=0 and b=0:
///   total_variance_from_params = a + math::mul_div_round_down(b, |inner|, F)
///                              = 0 + 0 = 0
///   binary_price_from_k        → assert!(total_var > 0, EZeroVariance) fires
/// (svi_view.move:104). Therefore the expected abort code for ALL 10 rows is
/// `svi_view::EZeroVariance`.
///
/// The previous test `golden_vectors_arb_violating_all_reject` (which only
/// counted params_valid=false rows without ever calling svi_view::*) violated
/// the vendored DeepBook code-review rule and is DELETED. The 10 per-row
/// tests below replace it.
#[test, expected_failure(abort_code = svi_view::EZeroVariance)]
fun arb_violating_091_aborts_when_passed_to_svi_view() {
    let inputs = golden_vectors_data::all_inputs();
    let row = inputs[111];
    let a = row[0];
    let b = row[1];
    let rho = i64::from_parts(row[2], row[3] == 1);
    let m = i64::from_parts(row[4], row[5] == 1);
    let sigma = row[6];
    let forward = row[9];
    let strike = row[10];
    let _ = svi_view::binary_price_from_params(a, b, rho, m, sigma, forward, strike);
    abort 999
}

#[test, expected_failure(abort_code = svi_view::EZeroVariance)]
fun arb_violating_092_aborts_when_passed_to_svi_view() {
    let inputs = golden_vectors_data::all_inputs();
    let row = inputs[112];
    let a = row[0];
    let b = row[1];
    let rho = i64::from_parts(row[2], row[3] == 1);
    let m = i64::from_parts(row[4], row[5] == 1);
    let sigma = row[6];
    let forward = row[9];
    let strike = row[10];
    let _ = svi_view::binary_price_from_params(a, b, rho, m, sigma, forward, strike);
    abort 999
}

#[test, expected_failure(abort_code = svi_view::EZeroVariance)]
fun arb_violating_093_aborts_when_passed_to_svi_view() {
    let inputs = golden_vectors_data::all_inputs();
    let row = inputs[113];
    let a = row[0];
    let b = row[1];
    let rho = i64::from_parts(row[2], row[3] == 1);
    let m = i64::from_parts(row[4], row[5] == 1);
    let sigma = row[6];
    let forward = row[9];
    let strike = row[10];
    let _ = svi_view::binary_price_from_params(a, b, rho, m, sigma, forward, strike);
    abort 999
}

#[test, expected_failure(abort_code = svi_view::EZeroVariance)]
fun arb_violating_094_aborts_when_passed_to_svi_view() {
    let inputs = golden_vectors_data::all_inputs();
    let row = inputs[114];
    let a = row[0];
    let b = row[1];
    let rho = i64::from_parts(row[2], row[3] == 1);
    let m = i64::from_parts(row[4], row[5] == 1);
    let sigma = row[6];
    let forward = row[9];
    let strike = row[10];
    let _ = svi_view::binary_price_from_params(a, b, rho, m, sigma, forward, strike);
    abort 999
}

#[test, expected_failure(abort_code = svi_view::EZeroVariance)]
fun arb_violating_095_aborts_when_passed_to_svi_view() {
    let inputs = golden_vectors_data::all_inputs();
    let row = inputs[115];
    let a = row[0];
    let b = row[1];
    let rho = i64::from_parts(row[2], row[3] == 1);
    let m = i64::from_parts(row[4], row[5] == 1);
    let sigma = row[6];
    let forward = row[9];
    let strike = row[10];
    let _ = svi_view::binary_price_from_params(a, b, rho, m, sigma, forward, strike);
    abort 999
}

#[test, expected_failure(abort_code = svi_view::EZeroVariance)]
fun arb_violating_096_aborts_when_passed_to_svi_view() {
    let inputs = golden_vectors_data::all_inputs();
    let row = inputs[116];
    let a = row[0];
    let b = row[1];
    let rho = i64::from_parts(row[2], row[3] == 1);
    let m = i64::from_parts(row[4], row[5] == 1);
    let sigma = row[6];
    let forward = row[9];
    let strike = row[10];
    let _ = svi_view::binary_price_from_params(a, b, rho, m, sigma, forward, strike);
    abort 999
}

#[test, expected_failure(abort_code = svi_view::EZeroVariance)]
fun arb_violating_097_aborts_when_passed_to_svi_view() {
    let inputs = golden_vectors_data::all_inputs();
    let row = inputs[117];
    let a = row[0];
    let b = row[1];
    let rho = i64::from_parts(row[2], row[3] == 1);
    let m = i64::from_parts(row[4], row[5] == 1);
    let sigma = row[6];
    let forward = row[9];
    let strike = row[10];
    let _ = svi_view::binary_price_from_params(a, b, rho, m, sigma, forward, strike);
    abort 999
}

#[test, expected_failure(abort_code = svi_view::EZeroVariance)]
fun arb_violating_098_aborts_when_passed_to_svi_view() {
    let inputs = golden_vectors_data::all_inputs();
    let row = inputs[118];
    let a = row[0];
    let b = row[1];
    let rho = i64::from_parts(row[2], row[3] == 1);
    let m = i64::from_parts(row[4], row[5] == 1);
    let sigma = row[6];
    let forward = row[9];
    let strike = row[10];
    let _ = svi_view::binary_price_from_params(a, b, rho, m, sigma, forward, strike);
    abort 999
}

#[test, expected_failure(abort_code = svi_view::EZeroVariance)]
fun arb_violating_099_aborts_when_passed_to_svi_view() {
    let inputs = golden_vectors_data::all_inputs();
    let row = inputs[119];
    let a = row[0];
    let b = row[1];
    let rho = i64::from_parts(row[2], row[3] == 1);
    let m = i64::from_parts(row[4], row[5] == 1);
    let sigma = row[6];
    let forward = row[9];
    let strike = row[10];
    let _ = svi_view::binary_price_from_params(a, b, rho, m, sigma, forward, strike);
    abort 999
}

#[test, expected_failure(abort_code = svi_view::EZeroVariance)]
fun arb_violating_100_aborts_when_passed_to_svi_view() {
    let inputs = golden_vectors_data::all_inputs();
    let row = inputs[120];
    let a = row[0];
    let b = row[1];
    let rho = i64::from_parts(row[2], row[3] == 1);
    let m = i64::from_parts(row[4], row[5] == 1);
    let sigma = row[6];
    let forward = row[9];
    let strike = row[10];
    let _ = svi_view::binary_price_from_params(a, b, rho, m, sigma, forward, strike);
    abort 999
}

/// Direct rejection-path coverage: a=0, b=0 forces total_var = 0 → EZeroVariance.
/// Mirrors Plan 01-04's arb-violating sub-tier construction.
#[test, expected_failure(abort_code = svi_view::EZeroVariance)]
fun zero_a_zero_b_aborts_zero_variance() {
    let rho = i64::zero();
    let m = i64::zero();
    let sigma: u64 = 1_000_000; // valid sigma in [sigma_min, sigma_max]
    // Use binary_price_from_params (which calls binary_price_from_k internally)
    // so we exercise the assert!(total_var > 0, EZeroVariance) path.
    let _ = svi_view::binary_price_from_params(
        0, // a = 0
        0, // b = 0 → total_var = a + b * |inner| / F = 0
        rho,
        m,
        sigma,
        50_000_000_000, // forward
        50_000_000_000, // strike (ATM, k = 0)
    );
    abort 999
}

/// Forward = 0 → EZeroForward.
#[test, expected_failure(abort_code = svi_view::EZeroForward)]
fun zero_forward_aborts() {
    let rho = i64::zero();
    let m = i64::zero();
    let _ = svi_view::binary_price_from_params(
        50_000_000,
        500_000_000,
        rho,
        m,
        500_000_000,
        0, // forward = 0
        50_000_000_000,
    );
    abort 999
}

/// k beyond svi_k_max_log_strike → EKOutOfRange.
#[test, expected_failure(abort_code = svi_view::EKOutOfRange)]
fun k_out_of_range_aborts() {
    let rho = i64::zero();
    let m = i64::zero();
    // Construct k > k_max via strike >> forward such that
    // |ln(strike/forward)| > 2_500_000_000.
    // forward = 1 * F, strike = 2000 * F → k = ln(2000) ~ 7.6 * F = 7_600_000_000.
    let _ = svi_view::binary_price_from_params(
        50_000_000,
        500_000_000,
        rho,
        m,
        500_000_000,
        1_000_000_000,
        2_000_000_000_000,
    );
    abort 999
}
