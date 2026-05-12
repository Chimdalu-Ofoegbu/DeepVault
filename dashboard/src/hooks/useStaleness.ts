// dashboard/src/hooks/useStaleness.ts — per-panel staleness state machine.
//
// Source: 04-UI-SPEC §4 (Staleness state machine) + DASH-10.
//
// Thresholds (LOCKED):
//   delta < 30_000 ms  → 'fresh'    (cyan LIVE pill)
//   delta < 60_000 ms  → 'warning'  (amber STALE pill)
//   delta >= 60_000 ms → 'stale'    (rose STALE pill)
//   lastUpdatedMs null → 'stale'    (no data yet → render stale state)
//
// The hook ticks once per second so a panel that has been mounted for >30s
// transitions to warning without any new data arriving. Consumers read the
// derived status and feed it into <StalenessPill /> (Task 3).

import { useEffect, useState } from 'react';
import type { Staleness } from '@/lib/types';

const FRESH_THRESHOLD_MS = 30_000;
const WARNING_THRESHOLD_MS = 60_000;
const TICK_MS = 1_000;

export function useStaleness(lastUpdatedMs: number | null): Staleness {
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  if (lastUpdatedMs == null) return 'stale';
  const delta = now - lastUpdatedMs;
  if (delta < FRESH_THRESHOLD_MS) return 'fresh';
  if (delta < WARNING_THRESHOLD_MS) return 'warning';
  return 'stale';
}
