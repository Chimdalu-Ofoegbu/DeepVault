// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0
//
// Cloned line-for-line from vendored Predict source:
//   scripts/deepbookv3/packages/predict/sources/helper/math.move:120-125 (sqrt wrapper)
//   scripts/deepbookv3/packages/predict/sources/helper/math.move:266-292 (sqrt_u128 + initial guess)
// SHA: 1159d79af33c70e09e406310e1d8f067832ede9d
//
// Algorithm locked in shared/svi-spec.md §5 "Integer Newton sqrt":
//   - bit-length seed (shifts 64,32,16,8,4,2,1) → power-of-two initial guess
//   - 7 unrolled Newton iterations: g = (g + x / g) / 2
//   - final overshoot correction: if g*g > x, g -= 1
//
// Determinism is the parity invariant. NO early termination, NO convergence
// detection. Identical 100-input random snapshot is verified against the
// Python clone at backtest/tests/test_isqrt_random_snapshot.txt.

/// Fixed-point square root using a bit-length initial guess and unrolled
/// Newton iterations.
module deepvault::helpers::isqrt;

const EInvalidPrecision: u64 = 0;

const FLOAT_SCALING: u64 = 1_000_000_000;
const F_U128: u128 = 1_000_000_000;

/// Integer Newton sqrt for u128 inputs. Deterministic 7-iteration unroll +
/// overshoot correction.
public fun sqrt_u128(x: u128): u128 {
    if (x == 0) return 0;
    if (x < 4) return 1;
    let mut g = sqrt_initial_guess_u128(x);
    g = (g + x / g) / 2;
    g = (g + x / g) / 2;
    g = (g + x / g) / 2;
    g = (g + x / g) / 2;
    g = (g + x / g) / 2;
    g = (g + x / g) / 2;
    g = (g + x / g) / 2;
    if (g * g > x) { g = g - 1; };
    g
}

/// Bit-length-based initial guess: 1 << ((bits + 1) / 2).
/// Shift sequence (64, 32, 16, 8, 4, 2, 1) verified in 01-01-SPIKE-NOTES.md
/// Spike 2.
public fun sqrt_initial_guess_u128(x: u128): u128 {
    let mut bits: u8 = 0;
    let mut val = x;
    if (val >= 1u128 << 64) { val = val >> 64; bits = bits + 64; };
    if (val >= 1u128 << 32) { val = val >> 32; bits = bits + 32; };
    if (val >= 1u128 << 16) { val = val >> 16; bits = bits + 16; };
    if (val >= 1u128 << 8) { val = val >> 8; bits = bits + 8; };
    if (val >= 1u128 << 4) { val = val >> 4; bits = bits + 4; };
    if (val >= 1u128 << 2) { val = val >> 2; bits = bits + 2; };
    if (val >= 1u128 << 1) { bits = bits + 1; };
    1u128 << (((bits + 1) / 2) as u8)
}

/// FLOAT_SCALING-aware sqrt wrapper: x and precision both at scale FLOAT_SCALING.
/// Cloned from helper/math.move:120-125.
public fun sqrt(x: u64, precision: u64): u64 {
    assert!(precision > 0 && precision <= FLOAT_SCALING, EInvalidPrecision);
    let multiplier = (FLOAT_SCALING / precision) as u128;
    let scaled = (x as u128) * multiplier * F_U128;
    (sqrt_u128(scaled) / multiplier) as u64
}
