// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0
//
// Read-only SVI evaluator. svi_view::binary_price is the single-file blast
// radius for OracleSVI ABI churn (see 01-PATTERNS.md sec D). All Phase 1
// internals (helpers/{i64,phi,isqrt,ln,math}) take unpacked params directly so
// this is the ONLY module in the deepvault package that imports OracleSVI.
//
// Algorithm: clones oracle.move:400-429 compute_nd2 line-for-line.
// Source: scripts/deepbookv3/packages/predict/sources/oracle.move:400-429
// SHA: 1159d79af33c70e09e406310e1d8f067832ede9d
//
// Per Spike 1 (01-01-SPIKE-NOTES.md): the on-chain `oracle::compute_price` is
// `public(package)` and not callable from this package, but
// `oracle::svi(...)` and the SVIParams field accessors (svi_a, svi_b, svi_rho,
// svi_m, svi_sigma) ARE public — verified at oracle.move:235-262. We
// therefore expose a fully functional production entry here, no stubs.

/// Read-only SVI evaluator over &OracleSVI + a strike.
module deepvault::svi_view;

use deepbook_predict::oracle::{Self, OracleSVI};
use deepvault::helpers::i64::{Self, I64};
use deepvault::helpers::isqrt;
use deepvault::helpers::ln;
use deepvault::helpers::math;
use deepvault::helpers::phi;
use deepvault::strategy_constants;

const EZeroForward: u64 = 3;
const ECannotBeNegative: u64 = 4;
const EZeroVariance: u64 = 5;
const EParamOutOfRange: u64 = 6;
const EKOutOfRange: u64 = 7;
const EZeroStrike: u64 = 8;

const FLOAT_SCALING: u64 = 1_000_000_000;

/// Production entry: compute theoretical fair value of an OTM binary call from
/// an OracleSVI shared object + strike.
///
/// Reads oracle.forward_price() and oracle.svi(); decomposes the SVIParams via
/// oracle::svi_{a,b,rho,m,sigma}() (public accessors); calls
/// binary_price_from_params for the actual math. Single-file blast radius for
/// OracleSVI ABI churn — Phase 2 vault::rebalance imports this entry only.
public fun binary_price(oracle: &OracleSVI, strike: u64): u64 {
    let forward = oracle::forward_price(oracle);
    let svi = oracle::svi(oracle);
    binary_price_from_params(
        oracle::svi_a(&svi),
        oracle::svi_b(&svi),
        oracle::svi_rho(&svi),
        oracle::svi_m(&svi),
        oracle::svi_sigma(&svi),
        forward,
        strike,
    )
}

/// Test-friendly entry: accepts unpacked SVIParams + forward + strike.
/// Used by golden_vectors_data tests in Wave 4 (does NOT need a real
/// OracleSVI shared object).
///
/// Validates parameters against shared/strategy.toml [svi] bounds and
/// k_max_log_strike per shared/svi-spec.md sec "Max safe input domain".
public fun binary_price_from_params(
    a: u64,
    b: u64,
    rho: I64,
    m: I64,
    sigma: u64,
    forward: u64,
    strike: u64,
): u64 {
    assert!(forward > 0, EZeroForward);
    assert!(strike > 0, EZeroStrike);
    // Validate parameter bounds per shared/strategy.toml [svi]
    assert!(a <= strategy_constants::svi_a_max(), EParamOutOfRange);
    assert!(b <= strategy_constants::svi_b_max(), EParamOutOfRange);
    assert!(
        sigma >= strategy_constants::svi_sigma_min()
            && sigma <= strategy_constants::svi_sigma_max(),
        EParamOutOfRange,
    );
    assert!(i64::magnitude(&m) <= strategy_constants::svi_m_abs_max(), EParamOutOfRange);
    // |rho| < F strict (rho is a correlation parameter in (-1, 1))
    assert!(i64::magnitude(&rho) < FLOAT_SCALING, EParamOutOfRange);

    // k = ln(strike * F / forward), matching oracle.move:407 op-order via
    // mul_div_round_down + ln (signed I64 at FLOAT_SCALING).
    let strike_over_forward = math::mul_div_round_down(strike, FLOAT_SCALING, forward);
    let k = ln::ln(strike_over_forward);
    binary_price_from_k(a, b, rho, m, sigma, &k)
}

/// Innermost evaluator: takes pre-computed signed k. Used internally by both
/// entries above.
fun binary_price_from_k(a: u64, b: u64, rho: I64, m: I64, sigma: u64, k: &I64): u64 {
    // Range-check k (Phase 2 vault enforces this; svi_view does it as
    // defense-in-depth per shared/svi-spec.md sec "Max safe input domain").
    assert!(i64::magnitude(k) <= strategy_constants::svi_k_max_log_strike(), EKOutOfRange);

    let total_var = total_variance_from_params(a, b, rho, m, sigma, k);
    assert!(total_var > 0, EZeroVariance);

    // d2 = -((k + total_var/2) / sqrt(total_var)), then N(±d2). Cloned from
    // oracle.move:421-428 verbatim.
    let sqrt_var = isqrt::sqrt(total_var, FLOAT_SCALING);
    let sqrt_var_i64 = i64::from_u64(sqrt_var);
    let half_var_i64 = i64::from_u64(total_var / 2);
    let d2_numerator = i64::add(k, &half_var_i64);
    let d2 = i64::div_scaled(&d2_numerator, &sqrt_var_i64);
    let d2 = i64::neg(&d2);
    phi::normal_cdf(&d2)
}

/// Public test entry: total_variance for golden-vector assertions.
///
/// Implements raw 5-parameter SVI: w(k) = a + b * (rho * (k - m) + sqrt((k - m)^2 + sigma^2)).
/// Cloned from oracle.move:407-417 verbatim.
public fun total_variance_from_params(a: u64, b: u64, rho: I64, m: I64, sigma: u64, k: &I64): u64 {
    let k_minus_m = i64::sub(k, &m);
    let k_minus_m_squared = i64::square_scaled(&k_minus_m);
    let sigma_squared = math::mul_div_round_down(sigma, sigma, FLOAT_SCALING);
    let sq = isqrt::sqrt(k_minus_m_squared + sigma_squared, FLOAT_SCALING);
    let sq_i64 = i64::from_u64(sq);
    let rho_km = i64::mul_scaled(&rho, &k_minus_m);
    let inner = i64::add(&rho_km, &sq_i64);
    assert!(!i64::is_negative(&inner), ECannotBeNegative);
    a + math::mul_div_round_down(b, i64::magnitude(&inner), FLOAT_SCALING)
}
