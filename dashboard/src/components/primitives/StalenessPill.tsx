// dashboard/src/components/primitives/StalenessPill.tsx — per-panel + global
// staleness pill (UI-SPEC §Component Inventory).
//
// Phase 04.1 reskin (UI-SPEC #12): recolor-only pass — the tone tokens move
// from the Phase-4 cyan/amber/rose Tailwind ramp to the handoff mint/coral
// OKLCH tokens. `useStaleness` and the state machine are UNCHANGED.
//
// Color contract (UI-SPEC §Color): fresh → mint (`--accent`); warning/stale →
// coral (`--hedge`). mint = healthy/live, coral = stale/loss.
//
// Copywriting contract (LOCKED):
//   fresh   → 'LIVE'   (mint)
//   warning → 'STALE'  (coral)
//   stale   → 'STALE'  (coral)
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
  // fresh → mint (--accent); warning/stale → coral (--hedge). UI-SPEC §Color.
  const isFresh = status === 'fresh';
  const toneStyle = isFresh
    ? {
        background: 'color-mix(in oklab, var(--accent) 15%, transparent)',
        color: 'var(--accent)',
        borderColor: 'color-mix(in oklab, var(--accent) 40%, transparent)',
      }
    : {
        background: 'color-mix(in oklab, var(--hedge) 15%, transparent)',
        color: 'var(--hedge)',
        borderColor: 'color-mix(in oklab, var(--hedge) 40%, transparent)',
      };
  const text = isFresh ? 'LIVE' : 'STALE';
  const caption =
    lastUpdatedMs == null
      ? 'no data yet'
      : formatDistanceToNow(lastUpdatedMs, { addSuffix: true });
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <Badge
        data-tone={isFresh ? 'mint' : 'coral'}
        className="text-[11px] font-semibold uppercase tracking-wider border"
        style={toneStyle}
      >
        {text}
      </Badge>
      {!compact && (
        <span className="text-xs" style={{ color: 'var(--muted)' }}>
          {caption}
        </span>
      )}
    </span>
  );
}
