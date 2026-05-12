// dashboard/src/components/layout/RelayStatusPill.tsx — sticky-header relay
// state indicator (UI-SPEC §WebSocket reconnect).
//
// Maps the WsState state machine (from useWebSocket, Plan 04-03 Task 2) to:
//   live         → 'LIVE'           cyan
//   connecting   → 'CONNECTING'     cyan (same tone — both are healthy)
//   reconnecting → 'RECONNECTING IN {N}S' amber (with optional countdown)
//   down         → 'RELAY DOWN'     rose
//
// Copy strings are LOCKED per the UI-SPEC §Copywriting Contract — they MUST
// match exactly so the demo video transcription is byte-identical.

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { WsState } from '@/lib/types';

type Props = {
  state: WsState;
  /** Optional countdown to next reconnect attempt (seconds). When provided
   *  and state is 'reconnecting', renders 'RECONNECTING IN {N}S'. */
  secondsUntilReconnect?: number;
};

export function RelayStatusPill({ state, secondsUntilReconnect }: Props) {
  const toneClass =
    state === 'live' || state === 'connecting'
      ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
      : state === 'reconnecting'
        ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
        : 'bg-rose-600/15 text-rose-300 border-rose-600/30';

  let text: string;
  switch (state) {
    case 'live':
      text = 'LIVE';
      break;
    case 'connecting':
      text = 'CONNECTING';
      break;
    case 'reconnecting':
      text =
        secondsUntilReconnect != null
          ? `RECONNECTING IN ${secondsUntilReconnect}S`
          : 'RECONNECTING';
      break;
    case 'down':
      text = 'RELAY DOWN';
      break;
  }

  return (
    <Badge
      className={cn(
        'text-[11px] font-semibold uppercase tracking-wider border',
        toneClass,
      )}
    >
      {text}
    </Badge>
  );
}
