// dashboard/src/components/layout/GlobalStalenessPill.tsx — worst-case
// staleness across all panels.
//
// UI-SPEC §Component Inventory: "Sticky-header global pill = worst-case across
// all panels." We derive the oldest `last_updated_ms` from the latest snapshot
// (oracles' min + vault's vs Date.now()), then feed that into StalenessPill so
// the global tone always reflects whichever panel is freshest-stale.
//
// Edge cases:
//   - snapshot null      → render "no data yet" (stale tone)
//   - empty oracles list → use vault timestamp alone
//   - both empty         → effectively returns "stale" via the same path

import { StalenessPill } from '@/components/primitives/StalenessPill';
import type { FullSnapshot } from '@/lib/types';

type Props = { snapshot: FullSnapshot | null };

export function GlobalStalenessPill({ snapshot }: Props) {
  if (!snapshot) return <StalenessPill lastUpdatedMs={null} compact />;

  // Parse u64-as-string at the BigInt boundary, but staleness only needs
  // ms-resolution comparison, so Number() is safe (timestamps fit easily
  // under 2^53 ms — well past the year 9000).
  const oracleStamps = snapshot.oracles
    .map((o) => Number(o.last_updated_ms))
    .filter((n) => Number.isFinite(n));
  const oracleMin = oracleStamps.length === 0 ? null : Math.min(...oracleStamps);
  const vaultTs = snapshot.vault ? Number(snapshot.vault.last_updated_ms) : null;

  // Take the OLDEST of whatever we have. If neither exists, fall through to
  // null which renders "no data yet".
  const candidates: number[] = [];
  if (oracleMin != null) candidates.push(oracleMin);
  if (vaultTs != null && Number.isFinite(vaultTs)) candidates.push(vaultTs);
  const oldest = candidates.length === 0 ? null : Math.min(...candidates);

  return <StalenessPill lastUpdatedMs={oldest} compact />;
}
