// dashboard/src/lib/svi.ts
// Raw 5-parameter SVI evaluator — bigint clone of Python deepvault.svi (Plan
// 01-03) and Move deepvault::svi_view (Plan 01-05). All clones derived from
// oracle.move::compute_nd2.
//
// All inputs/outputs at FLOAT_SCALING = 1e9.
//
// Source: scripts/deepbookv3/packages/predict/sources/oracle.move:400-429
// SHA: 1159d79af33c70e09e406310e1d8f067832ede9d
//
// Algorithm (raw 5-param SVI per shared/svi-spec.md §6):
//   k            = lnSigned(strike · F / forward)
//   k_minus_m    = k - svi.m
//   k_minus_m_sq = (k_minus_m · k_minus_m) / F
//   sigma_sq     = (svi.sigma · svi.sigma) / F
//   sq           = isqrtU128((k_minus_m_sq + sigma_sq) · F)        // F-scale sqrt
//   rho_km       = (svi.rho · k_minus_m) / F                       // truncate toward zero
//   inner        = rho_km + sq                                     // signed
//   assert inner >= 0                                              // ECannotBeNegative (defensive)
//   total_var    = svi.a + (svi.b · |inner|) / F
//   assert total_var > 0                                           // EZeroVariance
//   sqrt_var     = isqrtU128(total_var · F)
//   half_var     = total_var / 2
//   d2_num       = k + half_var
//   d2           = -((d2_num · F) / sqrt_var)                      // truncate toward zero
//   return normalCdf(d2)
//
// JS BigInt `/` truncates toward zero (matches Move u128 + Python
// _signed_div_trunc); plain BigInt arithmetic suffices for sign-correct
// truncation. Per shared/svi-spec.md §"Op-order canonical form" rounding rule.
//
// Forbidden: float coercions, parse-float helpers, JS standard math lib.
// Pure bigint only; every numeric literal carries the `n` suffix.

import { isqrtU128 } from './isqrt';
import { lnSigned } from './ln';
import { FLOAT_SCALING, mulDivRoundDown } from './math';
import { normalCdf } from './phi';
import { STRATEGY_CONSTANTS } from './strategy_constants';

const F = FLOAT_SCALING; // 1_000_000_000n

/// Raw 5-parameter SVI (Gatheral & Jacquier 2014). All values at FLOAT_SCALING.
/// `rho` and `m` may be negative (native bigint); `a`, `b`, `sigma` are
/// non-negative.
export type SVIParams = {
  a: bigint;     // u64-equivalent, >= 0; ATM total variance offset
  b: bigint;     // u64-equivalent, >= 0; wing slope
  rho: bigint;   // signed; |rho| < F (correlation in (-1, 1))
  m: bigint;     // signed; smile center (log-strike)
  sigma: bigint; // u64-equivalent, > 0; curvature
};

/// Validate SVIParams against bounds in shared/strategy.toml [svi]
/// (codegen-emitted into STRATEGY_CONSTANTS).
function _validateParams(svi: SVIParams): void {
  if (svi.a > STRATEGY_CONSTANTS.SVI_A_MAX) {
    throw new Error('SVIParams: a out of range (EParamOutOfRange)');
  }
  if (svi.b > STRATEGY_CONSTANTS.SVI_B_MAX) {
    throw new Error('SVIParams: b out of range (EParamOutOfRange)');
  }
  if (
    svi.sigma < STRATEGY_CONSTANTS.SVI_SIGMA_MIN ||
    svi.sigma > STRATEGY_CONSTANTS.SVI_SIGMA_MAX
  ) {
    throw new Error('SVIParams: sigma out of range (EParamOutOfRange)');
  }
  const rhoMag = svi.rho < 0n ? -svi.rho : svi.rho;
  if (rhoMag >= F) {
    throw new Error('SVIParams: |rho| must be < F (EParamOutOfRange)');
  }
  const mMag = svi.m < 0n ? -svi.m : svi.m;
  if (mMag > STRATEGY_CONSTANTS.SVI_M_ABS_MAX) {
    throw new Error('SVIParams: |m| out of range (EParamOutOfRange)');
  }
}

/// w(k) = a + b · (rho · (k - m) + sqrt((k - m)² + sigma²)).
/// Clones Python total_variance + Move total_variance_from_params.
export function totalVariance(svi: SVIParams, k: bigint): bigint {
  const kMinusM = k - svi.m;                            // signed
  const kMinusMSq = (kMinusM * kMinusM) / F;            // always >= 0 (squared)
  const sigmaSq = mulDivRoundDown(svi.sigma, svi.sigma, F);
  // F-scale sqrt: sqrt((k_minus_m_sq + sigma_sq) · F) — matches Python
  // isqrt_u128((k_minus_m_sq + sigma_sq) * F) and Move sqrt(x, F).
  const sq = isqrtU128((kMinusMSq + sigmaSq) * F);
  // rho · (k - m) at scale F. BigInt `/` truncates toward zero, matching
  // Python _signed_div_trunc and Move u128 division.
  const rhoKm = (svi.rho * kMinusM) / F;                // signed
  const inner = rhoKm + sq;                             // signed
  if (inner < 0n) {
    throw new Error('total_variance: inner < 0 (ECannotBeNegative)');
  }
  // inner >= 0 here, so |inner| === inner.
  const w = svi.a + (svi.b * inner) / F;
  if (w === 0n) {
    throw new Error('total_variance: result is zero (EZeroVariance)');
  }
  return w;
}

/// Theoretical binary call price at FLOAT_SCALING. Returns Φ(d2) where
/// d2 = -((k + w/2) / sqrt(w)) and k = ln(strike/forward).
export function binaryPrice(svi: SVIParams, forward: bigint, strike: bigint): bigint {
  if (forward <= 0n) {
    throw new Error('binary_price: forward must be > 0 (EZeroForward)');
  }
  if (strike <= 0n) {
    throw new Error('binary_price: strike must be > 0 (EZeroStrike)');
  }
  _validateParams(svi);

  // k = lnSigned(strike · F / forward), matching oracle.move:407 op-order
  // via mul_div_round_down + ln (signed bigint at FLOAT_SCALING).
  const strikeOverForward = mulDivRoundDown(strike, F, forward);
  const k = lnSigned(strikeOverForward);

  // Defense-in-depth k bound per shared/svi-spec.md §"Max safe input domain".
  const kMag = k < 0n ? -k : k;
  if (kMag > STRATEGY_CONSTANTS.SVI_K_MAX_LOG_STRIKE) {
    throw new Error('binary_price: |k| out of safe input domain (EKOutOfRange)');
  }

  const w = totalVariance(svi, k);
  // F-scale sqrt: sqrt(w · F) — matches Python isqrt_u128(w * F) and Move sqrt(w, F).
  const sqrtVar = isqrtU128(w * F);
  const halfVar = w / 2n;                               // >= 0 (w > 0)
  const d2Numerator = k + halfVar;                      // signed
  // d2 = -((d2_numerator · F) / sqrt_var). BigInt `/` truncates toward zero.
  const d2 = -((d2Numerator * F) / sqrtVar);
  return normalCdf(d2);
}

/// Convenience entry returning both outputs.
export function evaluateSVI(
  svi: SVIParams,
  forward: bigint,
  strike: bigint,
): { w: bigint; binaryPrice: bigint } {
  if (forward <= 0n) {
    throw new Error('evaluateSVI: forward must be > 0 (EZeroForward)');
  }
  if (strike <= 0n) {
    throw new Error('evaluateSVI: strike must be > 0 (EZeroStrike)');
  }
  const strikeOverForward = mulDivRoundDown(strike, F, forward);
  const k = lnSigned(strikeOverForward);
  const w = totalVariance(svi, k);
  const bp = binaryPrice(svi, forward, strike);
  return { w, binaryPrice: bp };
}
