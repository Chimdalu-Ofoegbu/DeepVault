// dashboard/src/lib/ln.ts
// Natural log at FLOAT_SCALING — bigint clone of Python deepvault.ln (Plan
// 01-03) and Move deepvault::helpers::ln (Plan 01-05). All clones derived
// from helper/math.move.
//
// lnSigned(x): returns ln(x / F) · F as a signed bigint.
//   For x = F (1.0), returns 0n.
//   For x = 2·F, returns ~LN2_U128 (~693_147_180n).
//   For x < F, returns negative (log of a fraction).
//
// Source: scripts/deepbookv3/packages/predict/sources/helper/math.move:80-93 (public ln)
//         scripts/deepbookv3/packages/predict/sources/helper/math.move:134-145 (ln_u128 body)
//         scripts/deepbookv3/packages/predict/sources/helper/math.move:247-260 (normalize)
//         scripts/deepbookv3/packages/predict/sources/helper/math.move:262-264 (mul_scaled_u128)
// SHA: 1159d79af33c70e09e406310e1d8f067832ede9d
//
// Algorithm:
//   1. If x == F, return 0 (ln(1) = 0).
//   2. If x < F, recurse on inv = F·F / x and negate (ln(1/x) = -ln(x)).
//   3. Else normalize: find (y, n) with x = y · 2^n and y ∈ [F, 2F).
//   4. Compute ln(y) via Padé/Horner using z = (y - F)/(y + F) and
//      ln(y) = 2 · (z + z³/3 + z⁵/5 + ... + z¹³/13).
//   5. Result = n · LN2 + ln(y).
//
// JS BigInt is signed natively; we return signed bigint directly without
// the i64 sign-magnitude wrapper used on-chain. Per shared/svi-spec.md
// §"Sign convention", positive zero is the canonical normalization.
//
// Forbidden: float coercions, parse-float helpers, JS standard math lib.
// Pure bigint only; every numeric literal carries the `n` suffix.

import { FLOAT_SCALING } from './math';
import { PHI_COEFFICIENTS } from './phi_coefficients';

const F = FLOAT_SCALING; // 1_000_000_000n
const LN2_U128 = PHI_COEFFICIENTS.LN2_U128; // 693_147_180n

// Reciprocal constants for Padé/Horner expansion of ln on [F, 2F).
// Source: helper/math.move:67-72 (matches Python deepvault.ln INV_*_U128).
const INV_3_U128: bigint = 333_333_333n;
const INV_5_U128: bigint = 200_000_000n;
const INV_7_U128: bigint = 142_857_143n;
const INV_9_U128: bigint = 111_111_111n;
const INV_11_U128: bigint = 90_909_091n;
const INV_13_U128: bigint = 76_923_077n;

/// x · y / F. Clone of helper/math.move:262-264 mul_scaled_u128.
function _mulScaledU128(x: bigint, y: bigint): bigint {
  return (x * y) / F;
}

/// Normalize x into [F, 2F) via binary search of right-shifts.
/// Returns [y, n] where x = y · 2^n and F ≤ y < 2F.
/// Clone of helper/math.move:247-260 normalize.
/// Caller guarantees x >= F (the public lnSigned handles x < F via inversion).
function _normalize(x: bigint): [bigint, bigint] {
  let y = x;
  let n = 0n;
  if (y >> 32n >= F) { y >>= 32n; n += 32n; }
  if (y >> 16n >= F) { y >>= 16n; n += 16n; }
  if (y >> 8n  >= F) { y >>= 8n;  n += 8n;  }
  if (y >> 4n  >= F) { y >>= 4n;  n += 4n;  }
  if (y >> 2n  >= F) { y >>= 2n;  n += 2n;  }
  if (y >> 1n  >= F) { y >>= 1n;  n += 1n;  }
  return [y, n];
}

/// ln(y) where y is in [F, 2F) and n is the shift count.
/// Computes: n · LN2 + 2 · (z + z³/3 + z⁵/5 + ... + z¹³/13)
/// where z = (y - F) / (y + F).
/// Clone of helper/math.move:134-145 ln_u128.
function _lnU128(y: bigint, n: bigint): bigint {
  const z = ((y - F) * F) / (y + F);
  const w = _mulScaledU128(z, z);
  let h = _mulScaledU128(w, INV_13_U128);
  h = _mulScaledU128(INV_11_U128 + h, w);
  h = _mulScaledU128(INV_9_U128 + h, w);
  h = _mulScaledU128(INV_7_U128 + h, w);
  h = _mulScaledU128(INV_5_U128 + h, w);
  h = _mulScaledU128(INV_3_U128 + h, w);
  const lnY = _mulScaledU128(_mulScaledU128(2n * F, z), F + h);
  return n * LN2_U128 + lnY;
}

/// Natural log of (x / FLOAT_SCALING), returned as signed bigint at
/// FLOAT_SCALING. For x == F, returns 0n. For x < F, returns negative.
/// Clone of helper/math.move:80-93 public ln entry, with the i64 sign
/// wrapper unwrapped to native bigint per shared/svi-spec.md §"Sign convention".
export function lnSigned(x: bigint): bigint {
  if (x <= 0n) {
    throw new Error('lnSigned: input must be > 0 (EInputZero)');
  }
  if (x === F) {
    return 0n;
  }
  if (x < F) {
    // Recurse via inversion: ln(x/F) = -ln(F/x) = -ln((F·F/x)/F).
    const inv = (F * F) / x;
    return -lnSigned(inv);
  }
  const [y, n] = _normalize(x);
  return _lnU128(y, n);
}
