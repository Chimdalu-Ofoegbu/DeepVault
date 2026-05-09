// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0
//
// Cloned line-for-line from vendored Predict source:
//   scripts/deepbookv3/packages/predict/sources/helper/math.move:80-93 (public ln entry)
//   scripts/deepbookv3/packages/predict/sources/helper/math.move:134-145 (ln_u128 body)
//   scripts/deepbookv3/packages/predict/sources/helper/math.move:247-260 (normalize)
//   scripts/deepbookv3/packages/predict/sources/helper/math.move:262-264 (mul_scaled_u128)
//   scripts/deepbookv3/packages/predict/sources/helper/math.move:67-72 (INV_*_U128 reciprocals)
// SHA: 1159d79af33c70e09e406310e1d8f067832ede9d
//
// Algorithm:
//   1. If x == F, return 0 (ln(1) = 0).
//   2. If x < F, recurse on inv = F*F / x and negate (ln(1/x) = -ln(x)).
//   3. Else normalize: find (y, n) with x = y * 2^n and y in [F, 2F).
//   4. Compute ln(y) via Padé/Horner using z = (y - F)/(y + F) and
//      ln(y) = 2 * (z + z^3/3 + z^5/5 + ... + z^13/13).
//   5. Result = n * LN2 + ln(y).
//
// LN2_U128 is imported from deepvault::phi_coefficients (Plan 01-02 emitted the
// auxiliary section). The inverse reciprocals INV_3..INV_13 live inline because
// they are too narrow-purpose for a TOML round-trip (matches the Python clone
// at backtest/src/deepvault/ln.py per Plan 01-03 key-decisions).

/// Natural logarithm at FLOAT_SCALING (1e9), returning a signed I64.
module deepvault::helpers::ln;

use deepvault::helpers::i64;
use deepvault::phi_coefficients;

const EInputZero: u64 = 0;

const FLOAT_SCALING: u64 = 1_000_000_000;
const F: u128 = 1_000_000_000;

// Reciprocal constants for ln Horner evaluation.
// Source: helper/math.move:67-72.
const INV_3_U128: u128 = 333_333_333;
const INV_5_U128: u128 = 200_000_000;
const INV_7_U128: u128 = 142_857_143;
const INV_9_U128: u128 = 111_111_111;
const INV_11_U128: u128 = 90_909_091;
const INV_13_U128: u128 = 76_923_077;

/// Natural logarithm of x (in FLOAT_SCALING 1e9).
/// Returns a signed fixed-point result.
/// Cloned from helper/math.move:80-93.
public fun ln(x: u64): i64::I64 {
    assert!(x > 0, EInputZero);
    if (x == FLOAT_SCALING) return i64::zero();

    if (x < FLOAT_SCALING) {
        let inv = ((F * F / (x as u128)) as u64);
        let result = ln(inv);
        return i64::neg(&result)
    };

    let (y, n) = normalize(x);
    let result = ln_u128(y as u128, n as u128);
    i64::from_u64((result as u64))
}

/// Normalize x into [FLOAT_SCALING, 2*FLOAT_SCALING) via binary search.
/// Returns (y, n) where x = y * 2^n.
/// Cloned from helper/math.move:247-260.
fun normalize(x: u64): (u64, u64) {
    let mut y = x;
    let mut n: u64 = 0;
    let scale = FLOAT_SCALING;

    if (y >> 32 >= scale) { y = y >> 32; n = n + 32; };
    if (y >> 16 >= scale) { y = y >> 16; n = n + 16; };
    if (y >> 8 >= scale) { y = y >> 8; n = n + 8; };
    if (y >> 4 >= scale) { y = y >> 4; n = n + 4; };
    if (y >> 2 >= scale) { y = y >> 2; n = n + 2; };
    if (y >> 1 >= scale) { y = y >> 1; n = n + 1; };

    (y, n)
}

/// ln(y) where y is normalized to [F, 2F) and n is the shift count.
/// Computes: n * ln(2) + 2 * (z + z^3/3 + z^5/5 + ... + z^13/13)
/// where z = (y - F) / (y + F).
/// Cloned from helper/math.move:134-145.
fun ln_u128(y: u128, n: u128): u128 {
    let z = (y - F) * F / (y + F);
    let w = mul_scaled_u128(z, z);
    let mut h = mul_scaled_u128(w, INV_13_U128);
    h = mul_scaled_u128((INV_11_U128 + h), w);
    h = mul_scaled_u128((INV_9_U128 + h), w);
    h = mul_scaled_u128((INV_7_U128 + h), w);
    h = mul_scaled_u128((INV_5_U128 + h), w);
    h = mul_scaled_u128((INV_3_U128 + h), w);
    let ln_y = mul_scaled_u128(mul_scaled_u128(2 * F, z), F + h);
    n * phi_coefficients::ln2_u128() + ln_y
}

fun mul_scaled_u128(x: u128, y: u128): u128 {
    x * y / F
}
