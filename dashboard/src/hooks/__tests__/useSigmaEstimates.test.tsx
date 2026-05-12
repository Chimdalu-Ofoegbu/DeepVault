// dashboard/src/hooks/__tests__/useSigmaEstimates.test.tsx — Plan 04-06 Task 1.
//
// Validates the D-08 partial-delivery contract:
//   - snapshot=null returns bootstrap for both legs
//   - <BOOTSTRAP_MIN_OBSERVATIONS in-window events returns bootstrap for both legs
//   - >=BOOTSTRAP_MIN_OBSERVATIONS returns live theta + bootstrap spot
//   - isBootstrap is ALWAYS true (spot leg dominates)
//   - observationCount reflects the in-window count

import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';

import { useSigmaEstimates } from '@/hooks/useSigmaEstimates';
import {
  BOOTSTRAP_MIN_OBSERVATIONS,
  BOOTSTRAP_SIGMA_SPOT_PCT,
  BOOTSTRAP_SIGMA_THETA_PCT,
} from '@/lib/dashboard_constants';
import type { FullSnapshot, RingEvent } from '@/lib/types';

function makeOracleEvent(aValue: bigint, tsMs: number): RingEvent {
  return {
    name: 'OracleSVIUpdated',
    ts_ms: String(tsMs),
    data: { a: aValue.toString() },
  };
}

function makeSnapshot(ringEvents: RingEvent[]): FullSnapshot {
  return {
    oracles: [],
    vault: null,
    ring_buffer: ringEvents,
    served_at_ms: '0',
  };
}

describe('useSigmaEstimates', () => {
  it('returns bootstrap for both legs when snapshot is null', () => {
    const { result } = renderHook(() => useSigmaEstimates(null));
    expect(result.current.sigmaThetaPct).toBe(BOOTSTRAP_SIGMA_THETA_PCT);
    expect(result.current.sigmaSpotPct).toBe(BOOTSTRAP_SIGMA_SPOT_PCT);
    expect(result.current.isBootstrap).toBe(true);
    expect(result.current.isThetaBootstrap).toBe(true);
    expect(result.current.observationCount).toBe(0);
  });

  it('returns bootstrap for both legs when ring buffer has <7 in-window events', () => {
    const now = Date.now();
    const events: RingEvent[] = [
      makeOracleEvent(1_500_000_000n, now - 1000),
      makeOracleEvent(1_550_000_000n, now - 2000),
      makeOracleEvent(1_600_000_000n, now - 3000),
    ];
    const { result } = renderHook(() =>
      useSigmaEstimates(makeSnapshot(events)),
    );
    expect(result.current.sigmaThetaPct).toBe(BOOTSTRAP_SIGMA_THETA_PCT);
    expect(result.current.isBootstrap).toBe(true);
    expect(result.current.isThetaBootstrap).toBe(true);
    expect(result.current.observationCount).toBe(3);
  });

  it('with >=7 in-window events: theta is live; spot is still bootstrap; isBootstrap=true', () => {
    const now = Date.now();
    const aValues = [
      1_500_000_000n,
      1_550_000_000n,
      1_600_000_000n,
      1_650_000_000n,
      1_700_000_000n,
      1_750_000_000n,
      1_800_000_000n,
    ];
    const events: RingEvent[] = aValues.map((a, i) =>
      makeOracleEvent(a, now - (i + 1) * 1000),
    );
    const { result } = renderHook(() =>
      useSigmaEstimates(makeSnapshot(events)),
    );
    // theta-leg computed (live): mean=1_650_000_000n/1e9=1.65, stdev~0.108,
    // sigmaThetaPct ~= 6.55%, NOT the 20% bootstrap.
    expect(result.current.sigmaThetaPct).not.toBe(BOOTSTRAP_SIGMA_THETA_PCT);
    expect(result.current.sigmaThetaPct).toBeGreaterThan(0);
    expect(result.current.sigmaThetaPct).toBeLessThan(20);
    // Spot leg stays bootstrap (D-08 partial-delivery constraint).
    expect(result.current.sigmaSpotPct).toBe(BOOTSTRAP_SIGMA_SPOT_PCT);
    // isBootstrap is ALWAYS true because spot leg dominates the OR.
    expect(result.current.isBootstrap).toBe(true);
    expect(result.current.isThetaBootstrap).toBe(false);
    expect(result.current.observationCount).toBe(7);
    expect(result.current.observationCount).toBeGreaterThanOrEqual(
      BOOTSTRAP_MIN_OBSERVATIONS,
    );
  });

  it('filters out events older than the 30-day window', () => {
    const now = Date.now();
    const oldTs = now - 35 * 24 * 60 * 60 * 1000; // 35 days ago
    const events: RingEvent[] = [
      makeOracleEvent(1_500_000_000n, oldTs),
      makeOracleEvent(1_550_000_000n, oldTs),
      makeOracleEvent(1_600_000_000n, oldTs),
      makeOracleEvent(1_500_000_000n, now),
    ];
    const { result } = renderHook(() =>
      useSigmaEstimates(makeSnapshot(events)),
    );
    // Only 1 in-window event -> bootstrap.
    expect(result.current.observationCount).toBe(1);
    expect(result.current.isThetaBootstrap).toBe(true);
  });
});
