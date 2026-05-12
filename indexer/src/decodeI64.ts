// indexer/src/decodeI64.ts — Move i64::I64 decoder.
//
// Source-of-truth (CANONICAL):
//   scripts/deepbookv3/packages/predict/sources/helper/i64.move:13-16
//     public struct I64 has copy, drop, store {
//         magnitude: u64,
//         is_negative: bool,
//     }
//
// FIELD-NAME CORRECTION:
//   04-RESEARCH.md A2 + Pitfall 7 (line ~888) say the struct is `{magnitude,
//   negative}`. The actual Move source uses `is_negative`. PATTERNS.md
//   propagates the correction; the unit test in __tests__/decodeI64.test.ts
//   asserts the literal `is_negative` field name to lock the regression.
//
// Why this matters: @mysten/sui's `parsedJson` returns the struct verbatim
// from BCS-decoded layout. If the relay reads the WRONG-NAMED field, it
// silently always evaluates to `undefined` (falsy) and EVERY negative rho/m
// would be emitted as POSITIVE — a correctness bug invisible to typecheck.
//
// Output: signed-integer string at full bigint precision. Browser-side
// consumers BigInt() the result; never float through Number.

import type { RawI64 } from './types';

/**
 * Decode a Move `I64` value parsed by @mysten/sui into a signed-integer
 * string suitable for u64-as-string wire payloads.
 *
 * Examples:
 *   decodeI64({ magnitude: "0",    is_negative: false }) === "0"
 *   decodeI64({ magnitude: "1234", is_negative: false }) === "1234"
 *   decodeI64({ magnitude: "1234", is_negative: true  }) === "-1234"
 *
 * Precision is preserved for magnitudes greater than 2^53 (BigInt
 * arithmetic).
 */
export function decodeI64(raw: RawI64): string {
  const mag = BigInt(raw.magnitude);
  const signed = raw.is_negative ? -mag : mag;
  return signed.toString();
}
