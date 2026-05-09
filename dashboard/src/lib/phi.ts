// dashboard/src/lib/phi.ts
// Standard normal CDF Φ(x) — Cody 1969 piecewise rational Chebyshev (bigint
// clone). Bit-equal output with on-chain helpers/phi.move (which clones
// helper/math.move:191-239) AND with backtest/src/deepvault/phi.py.
//
// All 28 Cody coefficients + 2 thresholds + LN2_U128 imported from
// `./phi_coefficients` (codegen-emitted in Plan 01-02 from
// shared/cody_phi_coefficients.toml). NO hand-coded numbers besides the
// FLOAT_SCALING alias `F` re-exported from `./math`.
//
// Source: scripts/deepbookv3/packages/predict/sources/helper/math.move:109-116 (normal_cdf)
//         scripts/deepbookv3/packages/predict/sources/helper/math.move:149-173 (exp_u128)
//         scripts/deepbookv3/packages/predict/sources/helper/math.move:176-187 (exp_series_u128)
//         scripts/deepbookv3/packages/predict/sources/helper/math.move:191-239 (normal_cdf_u128)
// SHA: 1159d79af33c70e09e406310e1d8f067832ede9d
//
// Forbidden: float coercions, parse-float helpers, JS standard math lib.
// Pure bigint only; every numeric literal carries the `n` suffix.

import { FLOAT_SCALING } from './math';
import { PHI_COEFFICIENTS } from './phi_coefficients';

const F = FLOAT_SCALING; // 1_000_000_000n

/// Standard normal CDF Φ(x). x is signed bigint at FLOAT_SCALING.
/// Clones helper/math.move:109-116: clamps |x| > 8 to 0/F, otherwise
/// dispatches to the u128 piecewise body.
export function normalCdf(x: bigint): bigint {
  const xNegative = x < 0n;
  const xMag = xNegative ? -x : x;
  if (xMag > 8n * F) {
    return xNegative ? 0n : F;
  }
  return _normalCdfU128(xMag, xNegative);
}

/// Piecewise body — clones helper/math.move:191-239 verbatim.
/// Three ranges:
///   - small  (|x| < SMALL_THRESHOLD ≈ 0.66): Φ = 0.5 ± x · P(x²)/Q(x²)
///   - medium (SMALL ≤ |x| < MEDIUM ≈ 5.657): Φ via exp(-x²/2) · P(|x|)/Q(|x|)
///   - large  (|x| ≥ MEDIUM): clamp to 0/F
function _normalCdfU128(x: bigint, xNegative: boolean): bigint {
  const c = PHI_COEFFICIENTS;
  if (x < c.SMALL_THRESHOLD) {
    // Small range: Φ(x) = 0.5 + x · P(x²) / Q(x²). Clone of math.move:191-208.
    const xsq = (x * x) / F;
    let xnum = (c.SMALL_A4 * xsq) / F;
    let xden = xsq;
    xnum = ((xnum + c.SMALL_A0) * xsq) / F;
    xden = ((xden + c.SMALL_B0) * xsq) / F;
    xnum = ((xnum + c.SMALL_A1) * xsq) / F;
    xden = ((xden + c.SMALL_B1) * xsq) / F;
    xnum = ((xnum + c.SMALL_A2) * xsq) / F;
    xden = ((xden + c.SMALL_B2) * xsq) / F;
    const ratio = ((xnum + c.SMALL_A3) * F) / (xden + c.SMALL_B3);
    const term = (x * ratio) / F;
    return xNegative ? F / 2n - term : F / 2n + term;
  } else if (x < c.MEDIUM_THRESHOLD) {
    // Medium range: complement = exp(-x²/2) · P(|x|)/Q(|x|).
    // Clone of math.move:209-233.
    let xnum = (c.MEDIUM_C8 * x) / F;
    let xden = x;
    xnum = ((xnum + c.MEDIUM_C0) * x) / F;
    xden = ((xden + c.MEDIUM_D0) * x) / F;
    xnum = ((xnum + c.MEDIUM_C1) * x) / F;
    xden = ((xden + c.MEDIUM_D1) * x) / F;
    xnum = ((xnum + c.MEDIUM_C2) * x) / F;
    xden = ((xden + c.MEDIUM_D2) * x) / F;
    xnum = ((xnum + c.MEDIUM_C3) * x) / F;
    xden = ((xden + c.MEDIUM_D3) * x) / F;
    xnum = ((xnum + c.MEDIUM_C4) * x) / F;
    xden = ((xden + c.MEDIUM_D4) * x) / F;
    xnum = ((xnum + c.MEDIUM_C5) * x) / F;
    xden = ((xden + c.MEDIUM_D5) * x) / F;
    xnum = ((xnum + c.MEDIUM_C6) * x) / F;
    xden = ((xden + c.MEDIUM_D6) * x) / F;
    const rational = ((xnum + c.MEDIUM_C7) * F) / (xden + c.MEDIUM_D7);

    const xSqHalf = (x * x) / (F * 2n);
    const n = xSqHalf / c.LN2_U128;
    const r = xSqHalf - n * c.LN2_U128;
    const expVal = _expU128(r, n, true);
    const complement = (expVal * rational) / F;

    return xNegative ? complement : F - complement;
  } else {
    // Large range: |x| >= sqrt(32) ≈ 5.657 — extreme tail < 1e-7 at 1e9.
    return xNegative ? 0n : F;
  }
}

/// e^(±x) where r is the reduced remainder and n is the shift count.
/// Computes: e^r · 2^(±n). Clone of helper/math.move:149-173.
function _expU128(r: bigint, n: bigint, xNegative: boolean): bigint {
  const expR = _expSeriesU128(r);

  if (xNegative) {
    let result = (F * F) / expR;
    let nn = n;
    if (nn >= 32n) { result >>= 32n; if (result === 0n) return 0n; nn -= 32n; }
    if (nn >= 16n) { result >>= 16n; if (result === 0n) return 0n; nn -= 16n; }
    if (nn >= 8n)  { result >>= 8n;  if (result === 0n) return 0n; nn -= 8n;  }
    if (nn >= 4n)  { result >>= 4n;  if (result === 0n) return 0n; nn -= 4n;  }
    if (nn >= 2n)  { result >>= 2n;  if (result === 0n) return 0n; nn -= 2n;  }
    if (nn >= 1n)  { result >>= 1n; }
    return result;
  } else {
    let result = expR;
    let nn = n;
    if (nn >= 32n) { result <<= 32n; nn -= 32n; }
    if (nn >= 16n) { result <<= 16n; nn -= 16n; }
    if (nn >= 8n)  { result <<= 8n;  nn -= 8n;  }
    if (nn >= 4n)  { result <<= 4n;  nn -= 4n;  }
    if (nn >= 2n)  { result <<= 2n;  nn -= 2n;  }
    if (nn >= 1n)  { result <<= 1n; }
    return result;
  }
}

/// Taylor series: e^r = 1 + r + r²/2! + r³/3! + ... up to k=12.
/// Clone of helper/math.move:176-187.
function _expSeriesU128(r: bigint): bigint {
  let sum = F;
  let term = F;
  let k = 1n;
  while (k <= 12n) {
    term = (term * r) / (k * F);
    if (term === 0n) break;
    sum = sum + term;
    k = k + 1n;
  }
  return sum;
}
