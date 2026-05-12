// dashboard/src/lib/whatIf.ts — Plan 04-06 Task 1 (DASH-09).
//
// Pure-compute layer behind the WhatIfSimulator. All math at bigint at
// FLOAT_SCALING 1e9; only the slider/UI layer touches Number. Re-uses Phase 1
// SVI lib unchanged (forbidden-token grep on math/isqrt/phi/ln/svi enforces
// no Number/Math.X regressions there).
//
// Phase 1 binaryPrice signature observed in dashboard/src/lib/svi.ts:
//   binaryPrice(svi: SVIParams, forward: bigint, strike: bigint): bigint
// This is a POSITIONAL signature — not the keyed-object shape the plan body
// guessed at. The plan body interface comment carried `tenor_seconds`, but
// Phase 1's binaryPrice DOES NOT take a tenor argument (the OracleSVI emits
// a per-tenor surface; tenor is baked into the SVI params for the v1 single-
// tenor case). whatIf.ts therefore drops `tenor_seconds` from its public
// surface and uses positional binaryPrice(svi, forward, strike).
// This deviation is documented in 04-06-SUMMARY.md.

import { binaryPrice, type SVIParams } from './svi';
import { STRATEGY_CONSTANTS } from './strategy_constants';

const FLOAT_SCALING = STRATEGY_CONSTANTS.NAV_SCALE; // 1_000_000_000n

/** Parallel theta shock: scale `a` (variance level) by (1 + theta_shock_bps/10000).
 *  Other params (b, rho, m, sigma) unchanged. D-07 approximation for v1.
 *  Clamps `a` at 0n to preserve SSVI non-negativity invariant (STRIDE
 *  T-04-06-02 mitigation). */
export function shockSviParallel(svi: SVIParams, thetaShockBps: number): SVIParams {
  if (thetaShockBps === 0) return svi;
  const bps = BigInt(thetaShockBps);
  const delta = (svi.a * bps) / 10000n;
  const a = svi.a + delta;
  return { ...svi, a: a < 0n ? 0n : a };
}

/** Spot shock on forward price: forward * (1 + spot_shock_bps/10000). Clamps
 *  at 1n to keep the EZeroForward invariant of binaryPrice (forward > 0n).
 *  D-08 — ±5σ at fallback 20% σ_F. */
export function shockedForward(forward: bigint, spotShockBps: number): bigint {
  if (spotShockBps === 0) return forward;
  const bps = BigInt(spotShockBps);
  const delta = (forward * bps) / 10000n;
  const out = forward + delta;
  return out < 1n ? 1n : out;
}

/** Per-hedge shocked-PnL output row consumed by the WhatIfSimulator Recharts
 *  BarChart. All quote-side amounts are DUSDC micro-units (6 decimals);
 *  prices are at FLOAT_SCALING 1e9. */
export type ShockedQuote = {
  hedgeKey: string;
  baselinePrice: bigint;
  shockedPrice: bigint;
  baselineNotional: bigint;
  /** (shockedPrice - baselinePrice) * notionalQuote / FLOAT_SCALING. */
  pnlQuote: bigint;
};

/** Per-hedge shocked PnL. Composes shockSviParallel + shockedForward + Phase
 *  1 binaryPrice. The signature is positional matching dashboard/src/lib/svi
 *  .ts::binaryPrice(svi, forward, strike) — NOT keyed-object. */
export function shockedPnL(args: {
  hedgeKey: string;
  svi: SVIParams;
  forward: bigint;
  strike: bigint;
  notionalQuote: bigint;
  thetaShockBps: number;
  spotShockBps: number;
}): ShockedQuote {
  const baselineSvi = args.svi;
  const shockedSvi = shockSviParallel(args.svi, args.thetaShockBps);
  const baselineFwd = args.forward;
  const shockedFwd = shockedForward(args.forward, args.spotShockBps);
  const baselinePrice = binaryPrice(baselineSvi, baselineFwd, args.strike);
  const shockedPrice = binaryPrice(shockedSvi, shockedFwd, args.strike);
  const pnlQuote =
    ((shockedPrice - baselinePrice) * args.notionalQuote) / FLOAT_SCALING;
  return {
    hedgeKey: args.hedgeKey,
    baselinePrice,
    shockedPrice,
    baselineNotional: args.notionalQuote,
    pnlQuote,
  };
}
