// dashboard/src/lib/__tests__/isqrt.test.ts
// Tests for the bigint Newton-sqrt clone. Includes a cross-runtime parity
// suite that ingests Plan 01-03's Python snapshot
// (backtest/tests/test_isqrt_random_snapshot.txt) and asserts bit-equal output
// on all 100 deterministic random u128 inputs.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isqrtInitialGuess, isqrtU128 } from '../isqrt';

const REPO_ROOT = resolve(__dirname, '../../../..');
const SNAPSHOT_PATH = resolve(REPO_ROOT, 'backtest/tests/test_isqrt_random_snapshot.txt');

describe('isqrtU128 — basic', () => {
  it('zero returns zero', () => {
    expect(isqrtU128(0n)).toBe(0n);
  });

  it('1, 2, 3 return 1', () => {
    expect(isqrtU128(1n)).toBe(1n);
    expect(isqrtU128(2n)).toBe(1n);
    expect(isqrtU128(3n)).toBe(1n);
  });

  it.each([
    [4n, 2n],
    [9n, 3n],
    [16n, 4n],
    [25n, 5n],
    [100n, 10n],
    [10_000n, 100n],
    [1_000_000n, 1_000n],
    [10n ** 18n, 10n ** 9n],
  ])('isqrtU128(%s) === %s', (input, expected) => {
    expect(isqrtU128(input)).toBe(expected);
  });

  it('floor: isqrtU128(n*n + 1) === n; isqrtU128(n*n - 1) === n - 1', () => {
    for (const n of [10n, 100n, 1_000n, 1_000_000n]) {
      expect(isqrtU128(n * n + 1n)).toBe(n);
      expect(isqrtU128(n * n - 1n)).toBe(n - 1n);
    }
  });

  it('u128 max returns 2^64 - 1', () => {
    const u128Max = (1n << 128n) - 1n;
    expect(isqrtU128(u128Max)).toBe(18_446_744_073_709_551_615n);
  });

  it('initial guess is a power of two for non-zero x', () => {
    for (const x of [1n, 4n, 100n, 10n ** 18n, (1n << 64n) - 1n, (1n << 128n) - 1n]) {
      const g = isqrtInitialGuess(x);
      expect(g > 0n).toBe(true);
      expect(g & (g - 1n)).toBe(0n); // power of two
    }
  });
});

describe('isqrtU128 — cross-runtime parity vs Plan 01-03 Python snapshot', () => {
  it('matches Python on the same 100 random u128 inputs', () => {
    const snapshot = readFileSync(SNAPSHOT_PATH, 'utf-8');
    const lines = snapshot.trim().split(/\r?\n/);
    expect(lines.length).toBe(100);
    for (const line of lines) {
      const [xHex, sHex] = line.split('=');
      const x = BigInt('0x' + xHex);
      const expected = BigInt('0x' + sHex);
      const actual = isqrtU128(x);
      expect(actual, `isqrtU128(0x${xHex}) drift: actual=${actual}, expected=${expected}`).toBe(expected);
    }
  });
});
