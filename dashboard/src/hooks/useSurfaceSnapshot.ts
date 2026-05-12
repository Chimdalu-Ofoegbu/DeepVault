// dashboard/src/hooks/useSurfaceSnapshot.ts — Plan 04-04 Task 1.
//
// Selects the per-oracle SVI surface from the WebSocket full snapshot and
// projects it into the SVIParams bigint shape that Phase 1 `dashboard/src/lib/svi.ts`
// expects (a, b, sigma as bigint at FLOAT_SCALING; rho, m as signed bigint).
//
// CONTEXT.md A9 locks v1 to a SINGLE BTC oracle, so when no `oracleId` is
// passed we return the first oracle in the snapshot. The hook is memoized
// on snapshot reference + oracleId so downstream <Plot> + <LineChart> data
// arrays remain identity-stable across React re-renders that don't actually
// touch the surface (Pitfall 4 mitigation).
//
// Wire strings -> BigInt is the trust boundary: a malformed magnitude
// throws inside BigInt() and propagates up. The ErrorBoundary polish ticket
// catches it; for v1 the throw surfaces as a panel-level crash, which is
// the correct "loud failure" posture for an institutional risk dashboard.

import { useMemo } from 'react';

import type { SVIParams } from '@/lib/svi';
import type { FullSnapshot, SurfaceSnapshot } from '@/lib/types';

export type SurfaceView = {
  raw: SurfaceSnapshot;
  svi: SVIParams;
  lastUpdatedMs: number;
} | null;

export function useSurfaceSnapshot(
  snapshot: FullSnapshot | null,
  oracleId?: string,
): SurfaceView {
  return useMemo(() => {
    if (!snapshot || snapshot.oracles.length === 0) return null;
    const o = oracleId
      ? snapshot.oracles.find((x) => x.oracle_id === oracleId)
      : snapshot.oracles[0]; // v1 single BTC oracle (CONTEXT.md A9)
    if (!o) return null;
    const svi: SVIParams = {
      a: BigInt(o.a),
      b: BigInt(o.b),
      rho: BigInt(o.rho_signed),
      m: BigInt(o.m_signed),
      sigma: BigInt(o.sigma),
    };
    return { raw: o, svi, lastUpdatedMs: Number(o.last_updated_ms) };
  }, [snapshot, oracleId]);
}
