// dashboard/src/hooks/useVaultState.ts — Plan 04-05 Task 1.
//
// Selects the VaultStateSnapshot from a FullSnapshot and derives:
//   - navPerShareScaled : bigint @ NAV_SCALE (10^9) — total_assets * NAV_SCALE / total_shares
//   - utilizationBps    : bigint 0..10000        — (total_assets - balance) * 10000 / total_assets
//
// All math is BigInt at the math layer (Pitfall 8 + T-04-05-02 mitigation).
// `Number()` coercion only happens at the display boundary in VaultPanel —
// never inside this hook. This is the load-bearing correctness contract:
// total_shares can legally exceed 2^53 (SHARE u64 ceiling 2^64 - 1) and the
// dashboard must NOT silently lose precision en route to the formatter.
//
// Special cases:
//   - total_shares === 0n: navPerShareScaled = NAV_SCALE (1.0 by convention,
//     so the empty-vault state displays "1.00" rather than NaN).
//   - total_assets === 0n: utilizationBps = 0n (avoid divide-by-zero).
//
// v1 reads from snapshot.vault only — Plan 02's WS relay sets this slot via
// the future Plan 03 (Phase 2 deploy) getObject poller. Plan 04-07 Task 3 may
// extend this hook with a direct RPC fallback via useSuiClient when the
// wallet-connected flow needs precise state outside the snapshot cadence.

import { useMemo } from 'react';

import type { FullSnapshot, VaultStateSnapshot } from '@/lib/types';
import { STRATEGY_CONSTANTS } from '@/lib/strategy_constants';

export type VaultView = {
  vault: NonNullable<VaultStateSnapshot>;
  /** NAV per share at NAV_SCALE (1e9). 1.0 by convention when total_shares=0. */
  navPerShareScaled: bigint;
  /** Utilization in basis points (0..10000). Deployed (= total_assets - balance) / total_assets. */
  utilizationBps: bigint;
  /** Convenience: vault.last_updated_ms parsed to Number (fits in 2^53 well past 2099). */
  lastUpdatedMs: number;
} | null;

const NAV_SCALE = STRATEGY_CONSTANTS.NAV_SCALE;

export function useVaultState(snapshot: FullSnapshot | null): VaultView {
  return useMemo(() => {
    if (!snapshot?.vault) return null;
    const v = snapshot.vault;
    const totalAssets = BigInt(v.total_assets);
    const totalShares = BigInt(v.total_shares);
    const balance = BigInt(v.balance);

    const navPerShareScaled =
      totalShares === 0n ? NAV_SCALE : (totalAssets * NAV_SCALE) / totalShares;

    const utilizationBps =
      totalAssets === 0n ? 0n : ((totalAssets - balance) * 10000n) / totalAssets;

    return {
      vault: v,
      navPerShareScaled,
      utilizationBps,
      lastUpdatedMs: Number(v.last_updated_ms),
    };
  }, [snapshot]);
}
