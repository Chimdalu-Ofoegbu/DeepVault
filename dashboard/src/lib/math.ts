// dashboard/src/lib/math.ts
// Canonical mul-div helper. ALL svi/phi/isqrt/ln arithmetic uses this; never
// inline `a * b / c`.
//
// Mirrors deepvault::helpers::math::mul_div_round_down (Move).
// See shared/svi-spec.md §2 "Op-order canonical form".
//
// Source: scripts/deepbookv3/packages/predict/sources/helper/math.move:294-306
// SHA: 1159d79af33c70e09e406310e1d8f067832ede9d
//
// Forbidden in this file: float coercions, parse-float helpers, and the
// JS standard math lib (sqrt/exp/log/pow). Pure bigint only; every numeric
// literal carries the `n` suffix.

/// FLOAT_SCALING for the SVI math layer. Matches on-chain
/// predict::constants::float_scaling!() and Python deepvault.svi F.
export const FLOAT_SCALING: bigint = 1_000_000_000n;

/// (a * b) / c using BigInt arbitrary precision. Truncates toward zero
/// (BigInt `/` is truncation), matching Move u128 division.
export function mulDivRoundDown(a: bigint, b: bigint, c: bigint): bigint {
  if (c === 0n) {
    throw new Error('mulDivRoundDown: divisor is zero');
  }
  return (a * b) / c;
}

/// (a * b) / c rounded up (ceil).
export function mulDivRoundUp(a: bigint, b: bigint, c: bigint): bigint {
  if (c === 0n) {
    throw new Error('mulDivRoundUp: divisor is zero');
  }
  const prod = a * b;
  const q = prod / c;
  const r = prod % c;
  return r > 0n ? q + 1n : q;
}
