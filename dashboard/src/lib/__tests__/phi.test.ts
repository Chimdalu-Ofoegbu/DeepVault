// dashboard/src/lib/__tests__/phi.test.ts
// Tests for the Cody 1969 normal-CDF clone. Asserts known reference values
// (scipy-derived) within 5 units at 1e9 — Cody's published precision bound.

import { describe, expect, it } from 'vitest';
import { normalCdf } from '../phi';
import { lnSigned } from '../ln';

const F = 1_000_000_000n;

describe('normalCdf — basic', () => {
  it('Φ(0) === F/2', () => {
    expect(normalCdf(0n)).toBe(F / 2n);
  });

  it('Φ(-10·F) clamps to 0', () => {
    expect(normalCdf(-10n * F)).toBe(0n);
  });

  it('Φ(+10·F) clamps to F', () => {
    expect(normalCdf(10n * F)).toBe(F);
  });

  it.each([100_000_000n, 500_000_000n, 1_500_000_000n, 3_000_000_000n])(
    'symmetry: Φ(%s) + Φ(-%s) === F',
    (x) => {
      expect(normalCdf(x) + normalCdf(-x)).toBe(F);
    },
  );

  it('returns bigint', () => {
    const r = normalCdf(123_456_789n);
    expect(typeof r).toBe('bigint');
  });
});

describe('normalCdf — known reference values within 5 units at 1e9', () => {
  // scipy.stats.norm.cdf reference values, published by Plan 01-03 (verified
  // via test_phi_against_scipy.py). 5-unit tolerance is the published Cody 1969
  // accuracy bound at 1e9 fixed point.
  it.each([
    // [x · F, expected Φ(x) · F]
    [500_000_000n, 691_462_461n],   // Φ(0.5)  ≈ 0.6914625
    [1_000_000_000n, 841_344_746n], // Φ(1.0)  ≈ 0.8413447
    [2_000_000_000n, 977_249_868n], // Φ(2.0)  ≈ 0.9772499
    [3_000_000_000n, 998_650_102n], // Φ(3.0)  ≈ 0.9986501
  ])('Φ(%s) within 5 units of %s', (x, expected) => {
    const actual = normalCdf(x);
    const diff = actual >= expected ? actual - expected : expected - actual;
    expect(diff <= 5n, `Φ(${x}): actual=${actual}, expected=${expected}, diff=${diff}`).toBe(true);
  });

  it.each([
    [-500_000_000n, 308_537_539n],  // Φ(-0.5) ≈ 0.3085375
    [-1_000_000_000n, 158_655_254n], // Φ(-1.0) ≈ 0.1586553
    [-2_000_000_000n, 22_750_132n],  // Φ(-2.0) ≈ 0.0227501
    [-3_000_000_000n, 1_349_898n],   // Φ(-3.0) ≈ 0.0013499
  ])('Φ(%s) within 5 units of %s', (x, expected) => {
    const actual = normalCdf(x);
    const diff = actual >= expected ? actual - expected : expected - actual;
    expect(diff <= 5n, `Φ(${x}): actual=${actual}, expected=${expected}, diff=${diff}`).toBe(true);
  });
});

describe('lnSigned — basic', () => {
  it('ln(1) === 0', () => {
    expect(lnSigned(F)).toBe(0n);
  });

  it('ln(2) ≈ LN2', () => {
    const r = lnSigned(2n * F);
    // Tolerance 5 units at 1e9 (Padé approximation precision).
    const expected = 693_147_180n;
    const diff = r >= expected ? r - expected : expected - r;
    expect(diff <= 5n, `ln(2): actual=${r}, expected≈${expected}, diff=${diff}`).toBe(true);
  });

  it('ln(0.5) ≈ -LN2', () => {
    const r = lnSigned(F / 2n);
    const expected = -693_147_180n;
    const diff = r >= expected ? r - expected : expected - r;
    expect(diff <= 5n, `ln(0.5): actual=${r}, expected≈${expected}, diff=${diff}`).toBe(true);
  });

  it('ln(e) ≈ F', () => {
    // e ≈ 2.718281828 → at 1e9 → 2_718_281_828
    const r = lnSigned(2_718_281_828n);
    const expected = F;
    const diff = r >= expected ? r - expected : expected - r;
    expect(diff <= 10n, `ln(e): actual=${r}, expected≈F, diff=${diff}`).toBe(true);
  });

  it('throws on x <= 0', () => {
    expect(() => lnSigned(0n)).toThrow();
    expect(() => lnSigned(-1n)).toThrow();
  });

  it('returns bigint', () => {
    const r = lnSigned(2n * F);
    expect(typeof r).toBe('bigint');
  });
});
