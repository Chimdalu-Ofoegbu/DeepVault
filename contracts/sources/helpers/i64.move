// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0
//
// Cloned line-for-line from vendored Predict source:
//   scripts/deepbookv3/packages/predict/sources/helper/i64.move
// SHA: 1159d79af33c70e09e406310e1d8f067832ede9d
//
// Adaptations from upstream:
//   - Module path renamed deepbook_predict::i64 -> deepvault::helpers::i64.
//   - Replaced `use deepbook::constants::max_u64;` with std::u64::max_value!() macro.
//   - Replaced `use deepbook_predict::constants;` with a local FLOAT_SCALING const
//     equal to 1_000_000_000 (matches strategy_constants::svi_scale() = 9 and
//     shared/svi-spec.md §3 "Fixed-point scale (FLOAT_SCALING)").
//
// Algorithm contract: shared/svi-spec.md §"Sign convention" — sign-magnitude with
// normalized zero (from_parts(0, true) returns zero() with is_negative=false).

/// Signed u64 magnitude with normalized zero.
module deepvault::helpers::i64;

const EOverflow: u64 = 0;
const EZeroDivisor: u64 = 1;

const FLOAT_SCALING: u64 = 1_000_000_000;

public struct I64 has copy, drop, store {
    magnitude: u64,
    is_negative: bool,
}

public fun magnitude(value: &I64): u64 {
    value.magnitude
}

public fun is_negative(value: &I64): bool {
    value.is_negative
}

public fun is_zero(value: &I64): bool {
    value.magnitude == 0
}

public fun zero(): I64 {
    I64 {
        magnitude: 0,
        is_negative: false,
    }
}

public fun from_u64(value: u64): I64 {
    I64 {
        magnitude: value,
        is_negative: false,
    }
}

public fun from_parts(magnitude: u64, is_negative: bool): I64 {
    if (magnitude == 0) {
        zero()
    } else {
        I64 {
            magnitude,
            is_negative,
        }
    }
}

public fun neg(value: &I64): I64 {
    if (value.magnitude == 0) {
        zero()
    } else {
        I64 {
            magnitude: value.magnitude,
            is_negative: !value.is_negative,
        }
    }
}

public fun add(a: &I64, b: &I64): I64 {
    if (a.is_negative == b.is_negative) {
        assert!(a.magnitude <= std::u64::max_value!() - b.magnitude, EOverflow);
        from_parts(a.magnitude + b.magnitude, a.is_negative)
    } else if (a.magnitude >= b.magnitude) {
        from_parts(a.magnitude - b.magnitude, a.is_negative)
    } else {
        from_parts(b.magnitude - a.magnitude, b.is_negative)
    }
}

public fun sub(a: &I64, b: &I64): I64 {
    let neg_b = neg(b);
    add(a, &neg_b)
}

/// Multiplies two FLOAT_SCALING fixed-point signed values.
public fun mul_scaled(a: &I64, b: &I64): I64 {
    let product =
        ((a.magnitude as u128) * (b.magnitude as u128)) / (FLOAT_SCALING as u128);
    assert!(product <= (std::u64::max_value!() as u128), EOverflow);
    from_parts((product as u64), a.is_negative != b.is_negative)
}

public fun div_scaled(a: &I64, b: &I64): I64 {
    assert!(b.magnitude > 0, EZeroDivisor);
    let quotient =
        ((a.magnitude as u128) * (FLOAT_SCALING as u128)) / (b.magnitude as u128);
    assert!(quotient <= (std::u64::max_value!() as u128), EOverflow);
    from_parts((quotient as u64), a.is_negative != b.is_negative)
}

public fun square_scaled(value: &I64): u64 {
    mul_scaled(value, value).magnitude
}
