// dashboard/src/lib/__tests__/svi.test.ts
// THE MATH-03 PARITY GATE: per-vector loop over shared/golden-vectors.json
// (141 vectors emitted by Plan 01-04) asserting bit-equal output between the
// TypeScript bigint evaluator and the Python canonical evaluator within
// 1 unit at 1e9 (per re-routed D-14).
//
// Combined with Plan 01-05's Move tests (MATH-02) and Plan 01-03's Python
// tests (MATH-01), the three-way parity gate is provably real on 100+
// vectors.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { binaryPrice, totalVariance, type SVIParams } from '../svi';

const REPO_ROOT = resolve(__dirname, '../../../..');
const VECTORS_PATH = resolve(REPO_ROOT, 'shared/golden-vectors.json');

type SignedHex = { mag: string; neg: boolean };
type Vector = {
  id: string;
  tier: 'A' | 'B' | 'C' | 'C2';
  source: string;
  inputs: {
    a: string;
    b: string;
    sigma: string;
    forward: string;
    strike: string;
    rho: SignedHex;
    m: SignedHex;
    k: SignedHex;
    T_seconds: number;
  };
  expected: {
    w: string;
    binary_price: string;
    params_valid: boolean;
    min_g_k: SignedHex | number;
    calendar_pass: boolean;
  };
};

function decodeSigned(s: SignedHex): bigint {
  const mag = BigInt(s.mag);
  return s.neg ? -mag : mag;
}

const vectors: Vector[] = JSON.parse(readFileSync(VECTORS_PATH, 'utf-8'));
const validVectors = vectors.filter((v) => v.expected.params_valid);
const invalidVectors = vectors.filter((v) => !v.expected.params_valid);

// Sanity: catch the threat T-01-33 (test passes vacuously when JSON is `[]`).
describe('SVI golden vectors — fixture sanity', () => {
  it('loaded >= 80 valid vectors from shared/golden-vectors.json', () => {
    expect(validVectors.length).toBeGreaterThanOrEqual(80);
  });

  it('loaded >= 1 arb-violating vector', () => {
    expect(invalidVectors.length).toBeGreaterThanOrEqual(1);
  });
});

describe('SVI golden vectors — total_variance bit-equal within 1 unit at 1e9', () => {
  it.each(validVectors.map((v) => [v.id, v]))('%s', (_id, v) => {
    const vec = v as Vector;
    const svi: SVIParams = {
      a: BigInt(vec.inputs.a),
      b: BigInt(vec.inputs.b),
      sigma: BigInt(vec.inputs.sigma),
      rho: decodeSigned(vec.inputs.rho),
      m: decodeSigned(vec.inputs.m),
    };
    const k = decodeSigned(vec.inputs.k);
    const expected = BigInt(vec.expected.w);
    const actual = totalVariance(svi, k);
    const diff = actual >= expected ? actual - expected : expected - actual;
    expect(
      diff <= 1n,
      `${vec.id}: actual=${actual}, expected=${expected}, diff=${diff}`,
    ).toBe(true);
  });
});

describe('SVI golden vectors — binary_price bit-equal within 1 unit at 1e9', () => {
  it.each(validVectors.map((v) => [v.id, v]))('%s', (_id, v) => {
    const vec = v as Vector;
    const svi: SVIParams = {
      a: BigInt(vec.inputs.a),
      b: BigInt(vec.inputs.b),
      sigma: BigInt(vec.inputs.sigma),
      rho: decodeSigned(vec.inputs.rho),
      m: decodeSigned(vec.inputs.m),
    };
    const forward = BigInt(vec.inputs.forward);
    const strike = BigInt(vec.inputs.strike);
    const expected = BigInt(vec.expected.binary_price);
    const actual = binaryPrice(svi, forward, strike);
    const diff = actual >= expected ? actual - expected : expected - actual;
    expect(
      diff <= 1n,
      `${vec.id}: actual=${actual}, expected=${expected}, diff=${diff}`,
    ).toBe(true);
  });
});

describe('SVI rejects arb-violating params (params_valid=false)', () => {
  // Sample first 3 invalid vectors. Per Plan 01-04 / Plan 01-03 analysis,
  // these are constructed with a=0, b=0 to trigger EZeroVariance (the
  // reachable rejection path; ECannotBeNegative is defensive parity for
  // sigma > 0 per Plan 01-03's mathematical analysis).
  it.each(invalidVectors.slice(0, 3).map((v) => [v.id, v]))('%s throws', (_id, v) => {
    const vec = v as Vector;
    const svi: SVIParams = {
      a: BigInt(vec.inputs.a),
      b: BigInt(vec.inputs.b),
      sigma: BigInt(vec.inputs.sigma),
      rho: decodeSigned(vec.inputs.rho),
      m: decodeSigned(vec.inputs.m),
    };
    const k = decodeSigned(vec.inputs.k);
    expect(() => totalVariance(svi, k)).toThrow();
  });
});
