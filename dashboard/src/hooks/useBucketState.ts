// dashboard/src/hooks/useBucketState.ts — Plan 04-07 Task 2 live wiring.
//
// Reads the connected user's per-user RateLimiter token-bucket state from the
// vault's `rate_limiters` Table via `client.getDynamicFieldObject(...)`.
//
// Move struct source-of-truth (contracts/sources/helpers/rate_limiter.move:37-48):
//   public struct RateLimiter has store {
//     available: u64,
//     last_updated_ms: u64,
//     capacity: u64,
//     refill_rate_per_ms: u64,
//     enabled: bool,
//   }
//
// Lazy-init pattern (redeem.move::get_or_init_user_bucket): the dynamic field
// does not exist until the user's first redeem_request. The hook returns
// `null` gracefully via React Query's queryFn — the BucketGauge renders its
// "Bucket lazy-init pending" state.
//
// Lazy-refill semantics: the on-chain refill happens at redeem-time, so the
// hook applies the same refill formula client-side for a fresher available
// readout: available = min(capacity, available + refill_rate_per_ms * (now - last_updated_ms))

import { useQuery } from '@tanstack/react-query';
import { useCurrentAccount, useSuiClient } from '@mysten/dapp-kit';

import { DEPLOY, isDeployed } from '@/lib/ptbDeploy';

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

/** Apply client-side lazy refill matching rate_limiter.move's refill() math. */
function applyLazyRefill(
  available: bigint,
  capacity: bigint,
  refillRatePerMs: bigint,
  lastUpdatedMs: bigint,
  nowMs: bigint,
): bigint {
  if (capacity === 0n) return 0n;
  const elapsed = nowMs > lastUpdatedMs ? nowMs - lastUpdatedMs : 0n;
  const refillAmount = elapsed * refillRatePerMs;
  const newAvail = available + refillAmount;
  return newAvail < capacity ? newAvail : capacity;
}

export function useBucketState(): UseBucketStateReturn {
  const account = useCurrentAccount();
  const client = useSuiClient();
  const enabled = !!account && isDeployed();

  const q = useQuery({
    queryKey: ['user-bucket', account?.address ?? null, DEPLOY.vault_id],
    queryFn: async (): Promise<BucketView> => {
      if (!account) return null;
      // Step 1: read the vault to extract rate_limiters Table parent id.
      const vaultObj = await client.getObject({
        id: DEPLOY.vault_id,
        options: { showContent: true },
      });
      const content = vaultObj.data?.content;
      if (!content || content.dataType !== 'moveObject') return null;
      // The Move type `Table<address, RateLimiter>` is reified as a Move object
      // whose `fields.id.id` is the dynamic-field parent. We probe a few common
      // field-name shapes since the on-chain struct field name (`rate_limiters`)
      // is the canonical key per W1 lock (Plan 02-03 schema freeze).
      const fields = (content as { fields: Record<string, unknown> }).fields ?? {};
      const rateLimiters =
        (fields.rate_limiters as { fields?: { id?: { id?: string } } } | undefined) ??
        (fields.rate_limiters_table as { fields?: { id?: { id?: string } } } | undefined);
      const parentId = rateLimiters?.fields?.id?.id;
      if (!parentId) return null;
      // Step 2: lookup the user's RateLimiter dynamic field.
      try {
        const dyn = await client.getDynamicFieldObject({
          parentId,
          name: { type: 'address', value: account.address },
        });
        const dynContent = dyn.data?.content;
        if (!dynContent || dynContent.dataType !== 'moveObject') return null;
        // The dynamic field is `Field<address, RateLimiter>` — the actual
        // RateLimiter struct sits under `fields.value.fields` (the standard
        // dynamic-field nesting). Defensively probe both nesting shapes.
        const dynFields = (dynContent as { fields: Record<string, unknown> }).fields ?? {};
        const rl =
          (dynFields.value as { fields?: Record<string, unknown> } | undefined)?.fields ??
          (dynFields as Record<string, unknown>);
        const availableRaw = BigInt(String((rl as Record<string, unknown>).available ?? '0'));
        const capacityRaw = BigInt(String((rl as Record<string, unknown>).capacity ?? '0'));
        const refillRate = BigInt(
          String((rl as Record<string, unknown>).refill_rate_per_ms ?? '0'),
        );
        const lastUpdated = BigInt(
          String((rl as Record<string, unknown>).last_updated_ms ?? '0'),
        );
        const nowMs = BigInt(Date.now());
        const availMicro = applyLazyRefill(
          availableRaw,
          capacityRaw,
          refillRate,
          lastUpdated,
          nowMs,
        );
        const utilizationPct =
          capacityRaw === 0n ? 0 : Number((availMicro * 100n) / capacityRaw);
        return {
          availableMicro: availMicro,
          capacityMicro: capacityRaw,
          refillRatePerMs: refillRate,
          utilizationPct,
        };
      } catch {
        // Bucket not yet lazy-initialized — first redeem_request seeds it.
        // (See redeem.move::get_or_init_user_bucket lines 236-261.)
        return null;
      }
    },
    enabled,
    staleTime: 5_000,
    refetchInterval: 15_000,
  });

  return {
    view: q.data ?? null,
    loading: q.isLoading,
    error: q.error ?? null,
  };
}
