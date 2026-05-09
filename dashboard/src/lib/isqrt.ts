// dashboard/src/lib/isqrt.ts
// Integer Newton-Raphson sqrt — bigint clone of helper/math.move:266-292.
// Algorithm locked in shared/svi-spec.md §5: bit-length seed (shifts
// 64,32,16,8,4,2,1 → power-of-two) + 7 unrolled Newton iterations + final
// overshoot correction.
//
// Determinism is the parity invariant: NO early termination, NO convergence
// detection. Bit-equality with Python deepvault.isqrt + Move
// deepvault::helpers::isqrt is verified at backtest/tests/test_isqrt_random_snapshot.txt
// against the same 100 deterministic random u128 inputs.
//
// Source: scripts/deepbookv3/packages/predict/sources/helper/math.move:266-292
// SHA: 1159d79af33c70e09e406310e1d8f067832ede9d
//
// Forbidden: float coercions, parse-float helpers, JS standard math lib.
// Pure bigint only; every numeric literal carries the `n` suffix.

/// Bit-length-based initial guess: 1 << ((bits + 1) / 2).
/// Mirrors helper/math.move:281-292 sqrt_initial_guess_u128 bit-shift sequence.
/// Returns a power of two by construction.
export function isqrtInitialGuess(x: bigint): bigint {
  if (x === 0n) return 0n;
  let bits = 0n;
  let val = x;
  if (val >= 1n << 64n) { val >>= 64n; bits += 64n; }
  if (val >= 1n << 32n) { val >>= 32n; bits += 32n; }
  if (val >= 1n << 16n) { val >>= 16n; bits += 16n; }
  if (val >= 1n << 8n)  { val >>= 8n;  bits += 8n;  }
  if (val >= 1n << 4n)  { val >>= 4n;  bits += 4n;  }
  if (val >= 1n << 2n)  { val >>= 2n;  bits += 2n;  }
  if (val >= 1n << 1n)  {              bits += 1n; }
  return 1n << ((bits + 1n) / 2n);
}

/// Integer Newton sqrt for u128-equivalent inputs. Deterministic 7-iteration
/// unroll + overshoot correction. Matches helper/math.move:266-279 sqrt_u128.
export function isqrtU128(x: bigint): bigint {
  if (x === 0n) return 0n;
  if (x < 4n) return 1n;
  let g = isqrtInitialGuess(x);
  g = (g + x / g) / 2n;
  g = (g + x / g) / 2n;
  g = (g + x / g) / 2n;
  g = (g + x / g) / 2n;
  g = (g + x / g) / 2n;
  g = (g + x / g) / 2n;
  g = (g + x / g) / 2n;
  if (g * g > x) g -= 1n;
  return g;
}
