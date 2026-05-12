// dashboard/src/hooks/useSigmaEstimates.ts — Plan 04-06 Task 1 (DASH-09).
//
// Rolling 30-day σ estimates that feed the WhatIfSimulator slider captions.
// Implements CONTEXT.md D-07 (theta-leg σ from rolling stdev of `a`) and the
// PARTIAL-DELIVERY contract for D-08 (spot-leg σ is always bootstrap in v1
// because OracleSVIUpdated does not carry forward price).
//
// Return shape is documented and load-bearing: the WhatIfSimulator caller
// renders distinct amber Badges based on `isBootstrap` vs `isThetaBootstrap`
// vs synthetic-forward fallback. The hook never hides the bootstrap state —
// every caller MUST see whether σ is live or fallback (STRIDE T-04-06-04
// mitigation).

import { useMemo } from 'react';

import {
  BOOTSTRAP_MIN_OBSERVATIONS,
  BOOTSTRAP_SIGMA_SPOT_PCT,
  BOOTSTRAP_SIGMA_THETA_PCT,
  SIGMA_ROLLING_WINDOW_MS,
  SIGMA_THETA_PCT_CAP,
} from '@/lib/dashboard_constants';
import type { FullSnapshot } from '@/lib/types';

export type SigmaEstimates = {
  /** Theta-leg σ (percent). Computed from rolling 30-day stdev of `a` when
   *  ≥ BOOTSTRAP_MIN_OBSERVATIONS observations are present; otherwise
   *  BOOTSTRAP_SIGMA_THETA_PCT. */
  sigmaThetaPct: number;
  /** Spot-leg σ (percent). v1: ALWAYS BOOTSTRAP_SIGMA_SPOT_PCT — see file
   *  header re: D-08 partial delivery. */
  sigmaSpotPct: number;
  /** True when EITHER leg is on its bootstrap fallback. In v1 the spot leg
   *  is ALWAYS bootstrapped, so isBootstrap is always true. Caller renders
   *  an amber "Bootstrap σ" Badge in WhatIfSimulator. */
  isBootstrap: boolean;
  /** True when the theta-leg specifically is on bootstrap (subset of
   *  isBootstrap; lets the WhatIfSimulator tooltip distinguish theta-vs-
   *  spot bootstrap reasons). */
  isThetaBootstrap: boolean;
  /** Theta-leg observation count from the rolling 30-day window. 0 when
   *  snapshot is null. Surface this in the UI alongside isBootstrap so the
   *  user sees "using bootstrap because only 3 observations" vs "using
   *  bootstrap because spot stream missing". */
  observationCount: number;
};

export function useSigmaEstimates(snapshot: FullSnapshot | null): SigmaEstimates {
  return useMemo(() => {
    if (!snapshot) {
      return {
        sigmaThetaPct: BOOTSTRAP_SIGMA_THETA_PCT,
        sigmaSpotPct: BOOTSTRAP_SIGMA_SPOT_PCT,
        isBootstrap: true,
        isThetaBootstrap: true,
        observationCount: 0,
      };
    }

    const cutoff = Date.now() - SIGMA_ROLLING_WINDOW_MS;
    const oracleEvents = snapshot.ring_buffer.filter(
      (e) => e.name.endsWith('OracleSVIUpdated') && Number(e.ts_ms) >= cutoff,
    );

    if (oracleEvents.length < BOOTSTRAP_MIN_OBSERVATIONS) {
      return {
        sigmaThetaPct: BOOTSTRAP_SIGMA_THETA_PCT,
        sigmaSpotPct: BOOTSTRAP_SIGMA_SPOT_PCT,
        isBootstrap: true,
        isThetaBootstrap: true,
        observationCount: oracleEvents.length,
      };
    }

    // Theta-leg: live rolling stdev of `a` across observations. NOTE the
    // 1e9 divisor — the wire-format `a` is a u64 string at FLOAT_SCALING.
    // The relay broadcasts decoded values; we treat them as numbers ONLY
    // for the stdev computation (display + slider), which is bounded well
    // under 2^53 (SVI_A_MAX = 4e9 per strategy_constants.ts).
    const aValues = oracleEvents.map((e) => {
      const raw = (e.data as Record<string, unknown>).a;
      const asNum = typeof raw === 'string' ? Number(raw) : Number(raw ?? 0);
      return asNum / 1e9;
    });
    const mean = aValues.reduce((acc, v) => acc + v, 0) / aValues.length;
    const variance =
      aValues.reduce((acc, v) => acc + (v - mean) ** 2, 0) /
      Math.max(1, aValues.length - 1);
    const stdev = Math.sqrt(variance);
    const sigmaThetaPct =
      mean === 0
        ? BOOTSTRAP_SIGMA_THETA_PCT
        : Math.min(SIGMA_THETA_PCT_CAP, (stdev / mean) * 100);

    // Spot leg: D-08 partial delivery — OracleSVIUpdated does NOT carry
    // forward price, so rolling 30-day stdev of forward price is unavailable
    // from the event stream alone. Always return bootstrap value and force
    // isBootstrap=true so the WhatIfSimulator can render the amber Badge.
    return {
      sigmaThetaPct,
      sigmaSpotPct: BOOTSTRAP_SIGMA_SPOT_PCT,
      isBootstrap: true, // spot-leg constraint dominates
      isThetaBootstrap: false,
      observationCount: oracleEvents.length,
    };
  }, [snapshot]);
}
