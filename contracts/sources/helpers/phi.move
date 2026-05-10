// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0
//
// Cloned line-for-line from vendored Predict source:
//   scripts/deepbookv3/packages/predict/sources/helper/math.move:109-116 (normal_cdf entry)
//   scripts/deepbookv3/packages/predict/sources/helper/math.move:149-173 (exp_u128)
//   scripts/deepbookv3/packages/predict/sources/helper/math.move:176-187 (exp_series_u128)
//   scripts/deepbookv3/packages/predict/sources/helper/math.move:191-239 (normal_cdf_u128)
// SHA: 1159d79af33c70e09e406310e1d8f067832ede9d
//
// Algorithm contract: shared/svi-spec.md §4 "Phi approximation". Three piecewise
// ranges (small/medium/large) using Cody 1969 rational Chebyshev coefficients.
// All coefficients imported from deepvault::phi_coefficients (codegen-emitted
// in Plan 01-02 from shared/cody_phi_coefficients.toml). NO hand-coded numbers
// in this module besides the local FLOAT_SCALING aliases.

/// Standard normal CDF Phi(x) using Cody 1969 piecewise rational Chebyshev.
module deepvault::phi;

use deepbook_predict::i64;
use deepvault::phi_coefficients;

const FLOAT_SCALING: u64 = 1_000_000_000;
const F: u128 = 1_000_000_000;

// Max input for exp_u128(_, _, false) before u64 overflow.
// Derived: with LN2_U128=693_147_180, at x=23_638_153_700 the bit-shift
// produces 2^64 exactly. One below is the last safe input.
// Source: helper/math.move:29.
const MAX_EXP_INPUT: u64 = 23_638_153_699;

const EExpOverflow: u64 = 1;

/// Standard normal CDF Phi(x) using Cody's rational Chebyshev approximation.
/// Three piecewise ranges for high accuracy (~1e-15 in float, <5 units at 1e9).
/// Cloned from helper/math.move:109-116.
public fun normal_cdf(x: &i64::I64): u64 {
    let x_mag = i64::magnitude(x);
    let x_negative = i64::is_negative(x);
    if (x_mag > 8 * FLOAT_SCALING) {
        return if (x_negative) { 0 } else { FLOAT_SCALING }
    };
    (normal_cdf_u128((x_mag as u128), x_negative) as u64)
}

/// Phi(±x) using Cody's rational Chebyshev approximation in u128.
/// Source: W.J. Cody (1969), as implemented in GSL gauss.c.
/// Cloned from helper/math.move:191-239.
fun normal_cdf_u128(x: u128, x_negative: bool): u128 {
    if (x < phi_coefficients::small_threshold()) {
        // Small range: Phi(x) = 0.5 + x * P(x^2) / Q(x^2)
        let xsq = x * x / F;
        // Horner evaluation following GSL pattern
        let mut xnum = phi_coefficients::small_a4() * xsq / F;
        let mut xden = xsq;
        xnum = (xnum + phi_coefficients::small_a0()) * xsq / F;
        xden = (xden + phi_coefficients::small_b0()) * xsq / F;
        xnum = (xnum + phi_coefficients::small_a1()) * xsq / F;
        xden = (xden + phi_coefficients::small_b1()) * xsq / F;
        xnum = (xnum + phi_coefficients::small_a2()) * xsq / F;
        xden = (xden + phi_coefficients::small_b2()) * xsq / F;
        let ratio = (xnum + phi_coefficients::small_a3()) * F / (xden + phi_coefficients::small_b3());
        let term = x * ratio / F;
        if (x_negative) { F / 2 - term } else { F / 2 + term }
    } else if (x < phi_coefficients::medium_threshold()) {
        // Medium range: complement = exp(-x^2/2) * P(|x|) / Q(|x|)
        let mut xnum = phi_coefficients::medium_c8() * x / F;
        let mut xden = x;
        xnum = (xnum + phi_coefficients::medium_c0()) * x / F;
        xden = (xden + phi_coefficients::medium_d0()) * x / F;
        xnum = (xnum + phi_coefficients::medium_c1()) * x / F;
        xden = (xden + phi_coefficients::medium_d1()) * x / F;
        xnum = (xnum + phi_coefficients::medium_c2()) * x / F;
        xden = (xden + phi_coefficients::medium_d2()) * x / F;
        xnum = (xnum + phi_coefficients::medium_c3()) * x / F;
        xden = (xden + phi_coefficients::medium_d3()) * x / F;
        xnum = (xnum + phi_coefficients::medium_c4()) * x / F;
        xden = (xden + phi_coefficients::medium_d4()) * x / F;
        xnum = (xnum + phi_coefficients::medium_c5()) * x / F;
        xden = (xden + phi_coefficients::medium_d5()) * x / F;
        xnum = (xnum + phi_coefficients::medium_c6()) * x / F;
        xden = (xden + phi_coefficients::medium_d6()) * x / F;
        let rational = (xnum + phi_coefficients::medium_c7()) * F / (xden + phi_coefficients::medium_d7());

        let x_sq_half = x * x / (F * 2);
        let n = x_sq_half / phi_coefficients::ln2_u128();
        let r = x_sq_half - n * phi_coefficients::ln2_u128();
        let exp_val = exp_u128(r, n, true);
        let complement = exp_val * rational / F;

        if (x_negative) { complement } else { F - complement }
    } else {
        // Large range: |x| >= sqrt(32) ~= 5.657, extreme tail
        // Values are < 10 units at F scale. Clamp to 0/F.
        if (x_negative) { 0 } else { F }
    }
}

/// e^(±x) where r is the reduced remainder and n is the shift count.
/// Computes: e^r * 2^(±n).
/// Cloned from helper/math.move:149-173.
fun exp_u128(r: u128, n: u128, x_negative: bool): u128 {
    let exp_r = exp_series_u128(r);

    if (x_negative) {
        let mut result = F * F / exp_r;
        let mut n = n;
        if (n >= 32) { result = result >> 32; if (result == 0) return 0; n = n - 32; };
        if (n >= 16) { result = result >> 16; if (result == 0) return 0; n = n - 16; };
        if (n >= 8) { result = result >> 8; if (result == 0) return 0; n = n - 8; };
        if (n >= 4) { result = result >> 4; if (result == 0) return 0; n = n - 4; };
        if (n >= 2) { result = result >> 2; if (result == 0) return 0; n = n - 2; };
        if (n >= 1) { result = result >> 1; };
        result
    } else {
        let mut result = exp_r;
        let mut n = n;
        if (n >= 32) { result = result << 32; n = n - 32; };
        if (n >= 16) { result = result << 16; n = n - 16; };
        if (n >= 8) { result = result << 8; n = n - 8; };
        if (n >= 4) { result = result << 4; n = n - 4; };
        if (n >= 2) { result = result << 2; n = n - 2; };
        if (n >= 1) { result = result << 1; };
        result
    }
}

/// Taylor series: e^r = 1 + r + r^2/2! + r^3/3! + ...
/// Cloned from helper/math.move:176-187.
fun exp_series_u128(r: u128): u128 {
    let mut sum = F;
    let mut term = F;
    let mut k: u128 = 1;
    while (k <= 12) {
        term = term * r / (k * F);
        if (term == 0) break;
        sum = sum + term;
        k = k + 1;
    };
    sum
}

/// Public exp(x) entry — cloned from helper/math.move:96-105.
/// Returns e^x in FLOAT_SCALING. Required by ln tests + general callers.
public fun exp(x: &i64::I64): u64 {
    let x_mag = i64::magnitude(x);
    let x_negative = i64::is_negative(x);
    if (x_mag == 0) return FLOAT_SCALING;
    if (!x_negative) assert!(x_mag <= MAX_EXP_INPUT, EExpOverflow);

    let n = x_mag / (phi_coefficients::ln2_u128() as u64);
    let r = x_mag - n * (phi_coefficients::ln2_u128() as u64);
    (exp_u128((r as u128), (n as u128), x_negative) as u64)
}
