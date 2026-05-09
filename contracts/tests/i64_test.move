// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0
//
// Unit tests for deepvault::helpers::i64 (sign-magnitude signed integer with
// normalized zero). Targets the public API surface used by svi_view + Phase 2
// vault: zero, from_u64, from_parts, neg, add, sub, mul_scaled, div_scaled,
// square_scaled.
//
// Expected values are independently derived (hand-computed from the
// sign-magnitude algebra) per .claude/rules/unit-tests.md rule 1.

#[test_only]
module deepvault::i64_tests;

use deepvault::helpers::i64;
use std::unit_test::assert_eq;

const FLOAT_SCALING: u64 = 1_000_000_000;

#[test]
fun zero_is_normalized() {
    let z = i64::from_parts(0, true);
    assert!(!i64::is_negative(&z));
    assert_eq!(i64::magnitude(&z), 0);
    assert!(i64::is_zero(&z));
}

#[test]
fun zero_from_zero_constructor() {
    let z = i64::zero();
    assert!(!i64::is_negative(&z));
    assert_eq!(i64::magnitude(&z), 0);
}

#[test]
fun add_same_sign_positive() {
    let a = i64::from_u64(100);
    let b = i64::from_u64(200);
    let r = i64::add(&a, &b);
    assert_eq!(i64::magnitude(&r), 300);
    assert!(!i64::is_negative(&r));
}

#[test]
fun add_same_sign_negative() {
    let a = i64::from_parts(100, true);
    let b = i64::from_parts(200, true);
    let r = i64::add(&a, &b);
    assert_eq!(i64::magnitude(&r), 300);
    assert!(i64::is_negative(&r));
}

#[test]
fun add_opposite_signs_positive_wins() {
    let a = i64::from_u64(300);
    let b = i64::from_parts(100, true);
    let r = i64::add(&a, &b);
    assert_eq!(i64::magnitude(&r), 200);
    assert!(!i64::is_negative(&r));
}

#[test]
fun add_opposite_signs_negative_wins() {
    let a = i64::from_u64(100);
    let b = i64::from_parts(300, true);
    let r = i64::add(&a, &b);
    assert_eq!(i64::magnitude(&r), 200);
    assert!(i64::is_negative(&r));
}

#[test]
fun add_opposite_signs_equal_magnitude_yields_zero() {
    let a = i64::from_u64(500);
    let b = i64::from_parts(500, true);
    let r = i64::add(&a, &b);
    assert_eq!(i64::magnitude(&r), 0);
    assert!(!i64::is_negative(&r));
}

#[test]
fun sub_basic() {
    let a = i64::from_u64(500);
    let b = i64::from_u64(300);
    let r = i64::sub(&a, &b);
    assert_eq!(i64::magnitude(&r), 200);
    assert!(!i64::is_negative(&r));
}

#[test]
fun sub_underflows_to_negative() {
    let a = i64::from_u64(100);
    let b = i64::from_u64(400);
    let r = i64::sub(&a, &b);
    assert_eq!(i64::magnitude(&r), 300);
    assert!(i64::is_negative(&r));
}

#[test]
fun mul_scaled_truncates() {
    // (700_000_000 * 500_000_000) / 1_000_000_000 = 350_000_000 (= 0.7 * 0.5 = 0.35)
    let a = i64::from_u64(700_000_000);
    let b = i64::from_u64(500_000_000);
    let r = i64::mul_scaled(&a, &b);
    assert_eq!(i64::magnitude(&r), 350_000_000);
    assert!(!i64::is_negative(&r));
}

#[test]
fun mul_scaled_signs_xor() {
    // 0.7 * (-0.5) = -0.35
    let a = i64::from_u64(700_000_000);
    let b = i64::from_parts(500_000_000, true);
    let r = i64::mul_scaled(&a, &b);
    assert_eq!(i64::magnitude(&r), 350_000_000);
    assert!(i64::is_negative(&r));
}

#[test]
fun mul_scaled_two_negatives_positive() {
    // (-0.5) * (-0.5) = 0.25
    let a = i64::from_parts(500_000_000, true);
    let b = i64::from_parts(500_000_000, true);
    let r = i64::mul_scaled(&a, &b);
    assert_eq!(i64::magnitude(&r), 250_000_000);
    assert!(!i64::is_negative(&r));
}

#[test]
fun div_scaled_basic() {
    // (1_000_000_000 * F) / 2_000_000_000 = 500_000_000 (= 1 / 2 = 0.5)
    let a = i64::from_u64(FLOAT_SCALING);
    let b = i64::from_u64(2 * FLOAT_SCALING);
    let r = i64::div_scaled(&a, &b);
    assert_eq!(i64::magnitude(&r), 500_000_000);
    assert!(!i64::is_negative(&r));
}

#[test]
fun div_scaled_negative_dividend() {
    // -1 / 2 = -0.5
    let a = i64::from_parts(FLOAT_SCALING, true);
    let b = i64::from_u64(2 * FLOAT_SCALING);
    let r = i64::div_scaled(&a, &b);
    assert_eq!(i64::magnitude(&r), 500_000_000);
    assert!(i64::is_negative(&r));
}

#[test]
fun square_scaled_always_positive() {
    // (-0.7)^2 = 0.49
    let a = i64::from_parts(700_000_000, true);
    let s = i64::square_scaled(&a);
    assert_eq!(s, 490_000_000);
}

#[test]
fun neg_of_zero_is_zero() {
    let z = i64::zero();
    let nz = i64::neg(&z);
    assert!(!i64::is_negative(&nz));
    assert_eq!(i64::magnitude(&nz), 0);
}

#[test]
fun neg_flips_positive_to_negative() {
    let a = i64::from_u64(123);
    let r = i64::neg(&a);
    assert!(i64::is_negative(&r));
    assert_eq!(i64::magnitude(&r), 123);
}

#[test]
fun neg_flips_negative_to_positive() {
    let a = i64::from_parts(123, true);
    let r = i64::neg(&a);
    assert!(!i64::is_negative(&r));
    assert_eq!(i64::magnitude(&r), 123);
}

#[test, expected_failure(abort_code = i64::EZeroDivisor)]
fun div_scaled_by_zero_aborts() {
    let a = i64::from_u64(FLOAT_SCALING);
    let b = i64::zero();
    let _ = i64::div_scaled(&a, &b);
    abort 999
}
