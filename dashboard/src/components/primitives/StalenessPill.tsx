// dashboard/src/components/primitives/StalenessPill.tsx — per-panel + global
// staleness pill (UI-SPEC §Component Inventory).
//
// Consumes useStaleness to derive status from `lastUpdatedMs`; renders a
// shadcn <Badge> with cyan/amber/rose tone per UI-SPEC §4 state machine.
//
// Copywriting contract (LOCKED):
//   fresh   → 'LIVE'
//   warning → 'STALE'  (amber border)
//   stale   → 'STALE'  (rose border)
//
// `compact` mode hides the relative-time caption (used on the global header
// pill where space is tight).

import { formatDistanceToNow } from 'date-fns';

import { Badge } from '@/components/ui/badge';
import { useStaleness } from '@/hooks/useStaleness';
import { cn } from '@/lib/utils';

type Props = {
  lastUpdatedMs: number | null;
  compact?: boolean;
  className?: string;
};

export function StalenessPill({ lastUpdatedMs, compact = false, className }: Props) {
  const status = useStaleness(lastUpdatedMs);
  const variantClass =
    status === 'fresh'
      ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
      : status === 'warning'
        ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
        : 'bg-rose-600/15 text-rose-300 border-rose-600/30';
  const text = status === 'fresh' ? 'LIVE' : 'STALE';
  const caption =
    lastUpdatedMs == null
      ? 'no data yet'
      : formatDistanceToNow(lastUpdatedMs, { addSuffix: true });
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <Badge
        className={cn(
          'text-[11px] font-semibold uppercase tracking-wider border',
          variantClass,
        )}
      >
        {text}
      </Badge>
      {!compact && <span className="text-xs text-slate-400">{caption}</span>}
    </span>
  );
}
