// decodeI64.test.ts — locks the `is_negative` field-name correction
// (PATTERNS.md from 04-RESEARCH.md A2 misread) and the bigint-precision
// guarantee for magnitudes greater than 2^53.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { decodeI64 } from '../decodeI64';
import type { RawI64 } from '../types';

describe('decodeI64', () => {
  it('returns "0" for {magnitude:"0", is_negative:false}', () => {
    expect(decodeI64({ magnitude: '0', is_negative: false })).toBe('0');
  });

  it('returns positive integer string for is_negative=false', () => {
    expect(decodeI64({ magnitude: '1234', is_negative: false })).toBe('1234');
  });

  it('returns negative integer string for is_negative=true', () => {
    expect(decodeI64({ magnitude: '1234', is_negative: true })).toBe('-1234');
  });

  it('preserves precision for magnitudes greater than 2^53', () => {
    const raw: RawI64 = { magnitude: '99999999999999999999', is_negative: true };
    expect(decodeI64(raw)).toBe('-99999999999999999999');
  });

  it('preserves precision for very large positive magnitudes', () => {
    const raw: RawI64 = { magnitude: '18446744073709551615', is_negative: false }; // u64 max
    expect(decodeI64(raw)).toBe('18446744073709551615');
  });

  it('zero with is_negative=true normalizes to "0" (BigInt -0n is 0n)', () => {
    expect(decodeI64({ magnitude: '0', is_negative: true })).toBe('0');
  });

  it('decodes the rho.is_negative=true field from a captured OracleSVIUpdated fixture', () => {
    const fixture = JSON.parse(
      readFileSync(
        resolve(__dirname, 'fixtures/oracle-svi-updated.json'),
        'utf-8',
      ),
    );
    const parsed = fixture.parsedJson as {
      rho: RawI64;
      m: RawI64;
    };
    // rho is { magnitude: "300000000", is_negative: true } in the fixture
    expect(decodeI64(parsed.rho)).toBe('-300000000');
    // m is { magnitude: "100000000", is_negative: false }
    expect(decodeI64(parsed.m)).toBe('100000000');
  });

  it('FIELD-NAME CORRECTNESS: ignores `negative` (the wrong RESEARCH.md A2 name) and reads `is_negative`', () => {
    // If a future refactor regresses to `raw.negative`, decodeI64 would
    // silently always evaluate the ternary as `mag` (because `negative` is
    // `undefined` → falsy) and EVERY negative rho would be emitted POSITIVE.
    // This test feeds a struct with `negative: true` present alongside
    // `is_negative: false` and asserts decodeI64 honors `is_negative`.
    const rawWithDecoy = {
      magnitude: '42',
      is_negative: false,
      negative: true,
    } as RawI64 & { negative: boolean };
    expect(decodeI64(rawWithDecoy)).toBe('42');
  });
});
