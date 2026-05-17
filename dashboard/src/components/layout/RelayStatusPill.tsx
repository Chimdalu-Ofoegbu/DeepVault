// dashboard/src/components/layout/RelayStatusPill.tsx — sticky-header relay
// state indicator (UI-SPEC §WebSocket reconnect).
//
// Phase 04.1 reskin (UI-SPEC #12): recolor-only pass — the tone tokens move
// from the Phase-4 cyan/amber/rose Tailwind ramp to the handoff mint/coral
// OKLCH tokens, and the connected state gains the handoff `live-dot` element
// (the pulse keyframe lands in Plan 06's motion pass; this plan ships the
// mint dot + color). The WsState state machine is UNCHANGED.
//
// Maps the WsState state machine (from useWebSocket, Plan 04-03 Task 2) to:
//   live         → 'LIVE'                 mint + live-dot
//   connecting   → 'CONNECTING'           mint (both states are healthy)
//   reconnecting → 'RECONNECTING IN {N}S' coral (with optional countdown)
//   down         → 'RELAY DOWN'           coral
//
// Copy strings are LOCKED per the UI-SPEC §Copywriting Contract — they MUST
// match exactly so the demo video transcription is byte-identical.

import { Badge } from '@/components/ui/badge';
import type { WsState } from '@/lib/types';

type Props = {
  state: WsState;
  /** Optional countdown to next reconnect attempt (seconds). When provided
   *  and state is 'reconnecting', renders 'RECONNECTING IN {N}S'. */
  secondsUntilReconnect?: number;
};

export function RelayStatusPill({ state, secondsUntilReconnect }: Props) {
  // healthy (live/connecting) → mint (--accent); reconnecting/down → coral
  // (--hedge). UI-SPEC §Color.
  const isHealthy = state === 'live' || state === 'connecting';
  const toneStyle = isHealthy
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
      data-tone={isHealthy ? 'mint' : 'coral'}
      className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider border"
      style={toneStyle}
    >
      {/* Connected state shows the handoff live-dot (pulse keyframe lands in
          Plan 06's motion pass). */}
      {state === 'live' && (
        <i
          aria-hidden="true"
          style={{
            width: 5,
            height: 5,
            borderRadius: '50%',
            background: 'var(--accent)',
            display: 'inline-block',
          }}
        />
      )}
      {text}
    </Badge>
  );
}
