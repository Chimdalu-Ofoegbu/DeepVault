// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0
//
// Cloned line-for-line from vendored Predict source:
//   scripts/deepbookv3/packages/predict/sources/helper/math.move:294-306
// SHA: 1159d79af33c70e09e406310e1d8f067832ede9d
//
// Provides the canonical multiply-then-divide helpers required by
// shared/svi-spec.md §2 "Op-order canonical form": every multiply-then-divide
// in the SVI evaluator MUST go through mul_div_round_down to enforce the u128
// intermediate width.

/// Multiply-then-divide helpers using u128 intermediates for full precision.
module deepvault::helpers::math;

const EZeroDivisor: u64 = 0;

/// (a * b) / c using u128 intermediate for full precision. Rounds down.
public fun mul_div_round_down(a: u64, b: u64, c: u64): u64 {
    assert!(c > 0, EZeroDivisor);
    ((a as u128) * (b as u128) / (c as u128)) as u64
}

/// (a * b) / c using u128 intermediate for full precision. Rounds up
/// (i.e. ceil(a * b / c)).
public fun mul_div_round_up(a: u64, b: u64, c: u64): u64 {
    assert!(c > 0, EZeroDivisor);
    let numerator = (a as u128) * (b as u128);
    let denominator = c as u128;
    let result = numerator / denominator;
    let round = if (numerator % denominator == 0) 0 else 1;
    (result + round) as u64
}
