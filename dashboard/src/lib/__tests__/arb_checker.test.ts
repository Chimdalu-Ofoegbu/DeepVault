// dashboard/src/lib/__tests__/arb_checker.test.ts
// Mirror of backtest/tests/test_arb_checker.py. Asserts shape + valid/invalid
// slice behavior + visualization data invariants. Per CONTEXT.md D-05, this
// is a visualization tool, not a parity-bound module -- the cross-runtime
// claim hangs on the EVALUATOR not on bit-equal arb_checker output.

import { describe, expect, it } from 'vitest';
import { checkArb } from '../arb_checker';
import type { SVIParams } from '../svi';

const F = 1_000_000_000n;

describe('checkArb - shape', () => {
  it('returns ArbResult with correct types', () => {
    const svi: SVIParams = {
      a: 50_000_000n,
      b: 250_000_000n,
      rho: 0n,
      m: 0n,
      sigma: 400_000_000n,
    };
    const r = checkArb(svi);
    expect(typeof r.paramsValid).toBe('boolean');
    expect(typeof r.minGk).toBe('bigint');
    expect(typeof r.calendarPass).toBe('boolean');
    expect(Array.isArray(r.gK)).toBe(true);
    expect(r.gK.length).toBeGreaterThanOrEqual(200);
    for (const g of r.gK) {
      expect(typeof g).toBe('bigint');
    }
  });
});

describe('checkArb - valid slice passes', () => {
  it('sane params produce minGk >= 0', () => {
    const svi: SVIParams = {
      a: 50_000_000n,
      b: 250_000_000n,
      rho: -100_000_000n,
      m: 0n,
      sigma: 400_000_000n,
    };
    const r = checkArb(svi);
    expect(r.paramsValid).toBe(true);
    expect(r.minGk >= 0n).toBe(true);
  });

  it('ATM no-skew baseline passes', () => {
    const svi: SVIParams = {
      a: 40_000_000n,
      b: 200_000_000n,
      rho: 0n,
      m: 0n,
      sigma: 500_000_000n,
    };
    const r = checkArb(svi);
    expect(r.paramsValid).toBe(true);
    expect(r.minGk >= 0n).toBe(true);
  });
});

describe('checkArb - extreme params refuse to validate', () => {
  it('extreme rho with low sigma fails to validate', () => {
    const svi: SVIParams = {
      a: 10_000_000n,
      b: 2_000_000_000n,
      rho: -995_000_000n,
      m: 0n,
      sigma: 10_000_000n,
    };
    const r = checkArb(svi);
    // Either grid found a violation OR canonical evaluator rejected somewhere.
    // Both are acceptable failure modes for this negative test.
    expect(r.paramsValid === false || r.gK.some((g) => g < 0n)).toBe(true);
  });
});

describe('checkArb - calendar stub', () => {
  it('single-tenor returns calendarPass=true', () => {
    const svi: SVIParams = {
      a: 50_000_000n,
      b: 250_000_000n,
      rho: 0n,
      m: 0n,
      sigma: 400_000_000n,
    };
    expect(checkArb(svi).calendarPass).toBe(true);
  });
});

describe('checkArb - visualization data invariants (MATH-04 lever)', () => {
  it('gK array length >= 200 with bigint elements within reasonable range', () => {
    const svi: SVIParams = {
      a: 50_000_000n,
      b: 250_000_000n,
      rho: -100_000_000n,
      m: 0n,
      sigma: 400_000_000n,
    };
    const r = checkArb(svi);
    expect(r.gK.length).toBeGreaterThanOrEqual(200);
    for (const g of r.gK) {
      expect(typeof g).toBe('bigint');
      // reasonable range; sentinel -F is the min
      expect(g >= -10n * F && g <= 10n * F).toBe(true);
    }
  });

  it('minGk equals min of gK array', () => {
    const svi: SVIParams = {
      a: 50_000_000n,
      b: 250_000_000n,
      rho: -100_000_000n,
      m: 0n,
      sigma: 400_000_000n,
    };
    const r = checkArb(svi);
    let actualMin = r.gK[0];
    for (const g of r.gK) {
      if (g < actualMin) actualMin = g;
    }
    expect(r.minGk).toBe(actualMin);
  });
});

describe('checkArb - degenerate slice', () => {
  it('zero ATM total variance returns invalid with sentinel minGk', () => {
    const svi: SVIParams = {
      a: 0n,
      b: 0n,
      rho: 0n,
      m: 0n,
      sigma: 500_000_000n,
    };
    const r = checkArb(svi);
    expect(r.paramsValid).toBe(false);
    expect(r.minGk).toBe(-F);
  });
});
