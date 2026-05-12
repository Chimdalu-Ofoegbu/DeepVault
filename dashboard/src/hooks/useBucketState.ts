// dashboard/src/hooks/useBucketState.ts — Plan 04-05 Task 2.
//
// Reads the connected user's per-user RateLimiter token-bucket state from the
// vault's `rate_limiters` Table.
//
// v1 STUBBED (Phase 2 STATE log + RESEARCH Open Q5):
//   Plan 02's WS relay does NOT currently broadcast per-user rate-limiter
//   state — the on-chain `rate_limiters: Table<address, RateLimiter>` is a
//   dynamic-fields Table, and the relay's snapshot is global state only.
//   Per-user reads require a `client.getDynamicFieldObject({ parentId,
//   name: { type: 'address', value: account.address } })` RPC call that
//   Plan 04-07 Task 3 wires (when the wallet flow needs precise state).
//
// For Plan 04-05 this hook ships shape + null-return so:
//   1. BucketGauge can render its three states (disconnected / lazy-init /
//      populated) without panel-level scaffolding churn when Plan 07 lands.
//   2. The TODO is unambiguous about where to add the RPC call.
//   3. The useSuiClient reference is preserved so an unused-import lint
//      regression doesn't fire when Plan 07 wires the live path.
//
// Future plan body for Plan 04-07 Task 3:
//   queryFn: async () => {
//     const field = await client.getDynamicFieldObject({
//       parentId: vault.rate_limiters_uid,
//       name: { type: 'address', value: account.address },
//     });
//     // Parse RateLimiter fields per helpers/rate_limiter.move struct:
//     //   { available, capacity, refill_rate_per_ms, last_refill_ms }
//     // Apply lazy refill: available = min(cap, available + refill_rate * (now - last_refill))
//     return { availableMicro, capacityMicro, refillRatePerMs, utilizationPct };
//   }

import { useQuery } from '@tanstack/react-query';
import { useCurrentAccount, useSuiClient } from '@mysten/dapp-kit';

export type BucketView = {
  availableMicro: bigint;
  capacityMicro: bigint;
  refillRatePerMs: bigint;
  /** 0..100 — available / capacity * 100 (used by BucketGauge color escalation). */
  utilizationPct: number;
} | null;

export type UseBucketStateReturn = {
  view: BucketView;
  loading: boolean;
  error: Error | null;
};

export function useBucketState(): UseBucketStateReturn {
  const account = useCurrentAccount();
  // Reserved for Plan 04-07 Task 3 — client.getDynamicFieldObject lookup.
  // Reading the hook here both documents the integration seam and keeps the
  // dapp-kit import live so a future `useSuiClient()` call inside `queryFn`
  // doesn't trigger a fresh provider-wiring regression.
  const _client = useSuiClient();
  void _client;

  const q = useQuery({
    queryKey: ['user-bucket', account?.address ?? null],
    queryFn: async (): Promise<BucketView> => {
      if (!account) return null;
      // TODO(Plan 04-07 Task 3): replace with getDynamicFieldObject lookup
      // against vault.rate_limiters_uid keyed by `{ type: 'address',
      // value: account.address }`. Parse the RateLimiter Move struct and
      // compute lazy refill. v1 returns null so the panel renders the
      // "lazy-init pending" state gracefully.
      return null;
    },
    enabled: !!account,
    staleTime: 5_000,
    refetchInterval: 15_000,
  });

  return {
    view: q.data ?? null,
    loading: q.isLoading,
    error: q.error ?? null,
  };
}
