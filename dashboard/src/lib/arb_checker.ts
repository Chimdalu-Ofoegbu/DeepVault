// dashboard/src/lib/arb_checker.ts
// Off-chain arbitrage-free checker -- bigint mirror of backtest/src/deepvault/arb_checker.py.
//
// Returns full g(k) array for Phase 4 dashboard visualization (MATH-04 lever -- the
// dashboard renders gK as a visible curve so institutional LPs see *why* a surface
// is unsafe).
//
// Source for raw-SVI g(k) closed form:
//   Gatheral & Jacquier (2014), "Arbitrage-free SVI volatility surfaces", §3.2 / Eqn 2.2
//   (mirrored in 01-RESEARCH.md "Pattern 4", lines 432-441).
//
// Type discipline: arb_checker is NOT parity-bound (CONTEXT.md D-05 -- Move runs
// closed-form only on-chain). The grid sampler may use Number/Math.* for
// visualization; OUTPUT gK elements are bigint at FLOAT_SCALING. The CI parity
// job's forbidden-token grep (Plan 01-07) targets svi/phi/isqrt/ln/math.ts only;
// arb_checker.ts is intentionally excluded.

import { totalVariance, type SVIParams } from './svi';
import { FLOAT_SCALING } from './math';
import { STRATEGY_CONSTANTS } from './strategy_constants';

const F = FLOAT_SCALING; // 1_000_000_000n

export type ArbResult = {
  paramsValid: boolean;
  minGk: bigint;
  calendarPass: boolean;
  gK: bigint[];
};

const F_NUM = 1_000_000_000;

function wFloat(svi: SVIParams, kFloat: number): number {
  const a = Number(svi.a) / F_NUM;
  const b = Number(svi.b) / F_NUM;
  const rho = Number(svi.rho) / F_NUM;
  const m = Number(svi.m) / F_NUM;
  const sigma = Number(svi.sigma) / F_NUM;
  const t = kFloat - m;
  const r = Math.sqrt(t * t + sigma * sigma);
  return a + b * (rho * t + r);
}

function wPrimeFloat(svi: SVIParams, kFloat: number): number {
  const b = Number(svi.b) / F_NUM;
  const rho = Number(svi.rho) / F_NUM;
  const m = Number(svi.m) / F_NUM;
  const sigma = Number(svi.sigma) / F_NUM;
  const t = kFloat - m;
  const r = Math.sqrt(t * t + sigma * sigma);
  if (r === 0) return 0;
  return b * (rho + t / r);
}

function wDoublePrimeFloat(svi: SVIParams, kFloat: number): number {
  const b = Number(svi.b) / F_NUM;
  const m = Number(svi.m) / F_NUM;
  const sigma = Number(svi.sigma) / F_NUM;
  const t = kFloat - m;
  const r = Math.sqrt(t * t + sigma * sigma);
  if (r === 0) return 0;
  return (b * sigma * sigma) / (r * r * r);
}

function gOfKFloat(svi: SVIParams, kFloat: number): number {
  const w = wFloat(svi, kFloat);
  if (w <= 0) return -1; // sentinel: degenerate / arb violation
  const wp = wPrimeFloat(svi, kFloat);
  const wpp = wDoublePrimeFloat(svi, kFloat);
  const term1 = (1 - (kFloat * wp) / (2 * w)) ** 2;
  const term2 = ((wp * wp) / 4) * (1 / w + 0.25);
  const term3 = wpp / 2;
  return term1 - term2 + term3;
}

/// Compute the g(k) curve over +/- strike_range_sigma * sqrt(theta_T) and
/// check >= 0. Mirrors backtest/src/deepvault/arb_checker.py::check_arb.
export function checkArb(svi: SVIParams): ArbResult {
  const n = STRATEGY_CONSTANTS.SVI_GRID_POINTS_FOR_ARB_CHECK; // 200
  const strikeRangeSigma = STRATEGY_CONSTANTS.SVI_STRIKE_RANGE_SIGMA; // 4

  // ATM total variance estimate at FLOAT_SCALING: a + (b * sigma) / F.
  const thetaTAtmInt = svi.a + (svi.b * svi.sigma) / F;
  if (thetaTAtmInt <= 0n) {
    return {
      paramsValid: false,
      minGk: -F,
      calendarPass: true,
      gK: new Array<bigint>(n).fill(-F),
    };
  }

  const thetaTAtmFloat = Number(thetaTAtmInt) / F_NUM;
  const kMaxFloat = strikeRangeSigma * Math.sqrt(thetaTAtmFloat);
  if (!(kMaxFloat > 0)) {
    return {
      paramsValid: false,
      minGk: -F,
      calendarPass: true,
      gK: new Array<bigint>(n).fill(-F),
    };
  }

  // Track whether the canonical bigint evaluator would reject any sampled k.
  let canonicalEvaluatorOk = true;

  const gKFloats: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const kFloat = -kMaxFloat + (2 * kMaxFloat * i) / (n - 1);
    gKFloats[i] = gOfKFloat(svi, kFloat);

    // Canonical-evaluator probe: does totalVariance() throw on this k (as bigint)?
    if (canonicalEvaluatorOk) {
      const kInt = BigInt(Math.round(kFloat * F_NUM));
      try {
        totalVariance(svi, kInt);
      } catch {
        canonicalEvaluatorOk = false;
      }
    }
  }

  // Convert to bigint at FLOAT_SCALING (Pitfall mirror: bigint output, not Number).
  const gK: bigint[] = gKFloats.map((g) => BigInt(Math.round(g * F_NUM)));

  let minG = gK[0];
  for (const g of gK) {
    if (g < minG) minG = g;
  }

  const paramsValid = minG >= 0n && canonicalEvaluatorOk;

  return {
    paramsValid,
    minGk: minG,
    calendarPass: true,
    gK,
  };
}
