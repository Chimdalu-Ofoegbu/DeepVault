// dashboard/src/components/panels/EventStreamPanel.tsx — Plan 04.1-05 Task 1.
//
// NEW panel (UI-SPEC Per-Panel Mapping #9, D-03, LD-5). The relay's live event
// ring buffer already arrives in `FullSnapshot.ring_buffer` and is kept live by
// `useWebSocket.ts` `applyEvent` (100-cap). This panel is a pure CONSUMER of
// that array — no new hook, no second WebSocket. D-03's "wire to live WSS" is
// satisfied by consuming the existing data spine (PATTERNS.md confirms).
//
// Renders the handoff `§ Stream` "Recent events" `db-card.events.pad`: a
// `db-h` header + a `ul.ev-list` (CSS grid 76px/80px/1fr per row) = timestamp /
// `ev-k` type label / description. The `.db-card`/`.db-h`/`.db-mark`/`.ev-list`/
// `.ev-k` classes resolve in globals.css (Plan 04.1-01 Task 2).
//
// Ticker behavior (UI-SPEC §Interaction): newest-first, capped at 14 rows; the
// newest row flashes a fading accent highlight for 700ms when a new event
// arrives. Implemented as React render state (track newest ts_ms) bound to the
// real WS array — NOT the handoff `dashboard.js` synthetic timer generator.
//
// SECURITY (threat T-04.1-13): event `name`/`data` strings come from the relay
// WSS feed (an external, untrusted source). They are rendered as plain React
// children — React escapes them by default. This component never opts out of
// React escaping (no raw-HTML injection API is used); a malicious relay payload
// cannot inject markup.

import { useEffect, useMemo, useRef, useState } from 'react';

import type { RingEvent } from '@/lib/types';

type Props = { events: RingEvent[] };

// Max rendered rows (UI-SPEC #9 — "list caps at ~14 rows"). The ring buffer
// itself is server-capped at 100 (useWebSocket applyEvent) — this is the
// render-side cap so the DOM stays bounded (threat T-04.1-15).
const MAX_ROWS = 14;

// Accent-flash duration on the newest row (UI-SPEC §Interaction — 700ms).
const FLASH_MS = 700;

/** A rendered event row — the raw RingEvent mapped to display fields. */
type DisplayEvent = {
  key: string;
  tsMs: number;
  time: string;
  label: string;
  description: string;
  accent: boolean;
};

/** Format a millisecond epoch string to a UTC `HH:MM:SS` clock label. */
function formatClock(tsMs: number): string {
  if (!Number.isFinite(tsMs) || tsMs <= 0) return '--:--:--';
  const d = new Date(tsMs);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

/**
 * Map a raw relay event `name` to a short uppercase-able type label. The relay
 * emits event names like `OracleSVIUpdated`, `Supplied`, `HedgeMinted`,
 * `Rebalanced`, `HedgeRolled`, `RedeemRequested` — collapse them to the
 * handoff's short labels (SVI / supply / mint / rebalance / roll / withdraw).
 * Unknown names fall through to a lowercased form of the raw name.
 */
function eventLabel(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('svi') || n.includes('oracle')) return 'SVI';
  if (n.includes('rebalanc')) return 'rebalance';
  if (n.includes('mint')) return 'mint';
  if (n.includes('roll')) return 'roll';
  if (n.includes('supply') || n.includes('supplied')) return 'supply';
  if (n.includes('redeem') || n.includes('withdraw')) return 'withdraw';
  return name || 'event';
}

/** `ev-k.acc` mint accent is reserved for rebalance + mint events (UI-SPEC #9). */
function isAccentEvent(label: string): boolean {
  return label === 'rebalance' || label === 'mint';
}

/**
 * Best-effort human description from the event `data` payload. The relay
 * `data` is an untrusted `Record<string, unknown>`; we read a couple of common
 * descriptive keys defensively and fall back to the event name. All output is
 * rendered as escaped React text.
 */
function eventDescription(ev: RingEvent, label: string): string {
  const data = ev.data ?? {};
  // Common descriptive keys the relay may attach.
  for (const key of ['description', 'detail', 'message', 'summary']) {
    const v = data[key];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  // SVI updates: surface the oracle if present.
  if (label === 'SVI') {
    const oracle = data['oracle_id'] ?? data['oracle'];
    if (typeof oracle === 'string' && oracle.length > 0) {
      return `OracleSVIUpdated · ${oracle}`;
    }
    return `OracleSVIUpdated · ${ev.name}`;
  }
  return ev.name;
}

export function EventStreamPanel({ events }: Props) {
  // Newest-first, capped render list derived from the live ring buffer.
  const rows = useMemo<DisplayEvent[]>(() => {
    return [...events]
      .sort((a, b) => Number(b.ts_ms) - Number(a.ts_ms))
      .slice(0, MAX_ROWS)
      .map((ev, idx) => {
        const label = eventLabel(ev.name);
        const tsMs = Number(ev.ts_ms);
        return {
          // ts_ms + name + index is stable enough for React keys; the relay
          // does not emit a per-event id.
          key: `${ev.ts_ms}-${ev.name}-${idx}`,
          tsMs,
          time: formatClock(tsMs),
          label,
          description: eventDescription(ev, label),
          accent: isAccentEvent(label),
        };
      });
  }, [events]);

  // Ticker flash: when the newest ts_ms changes, flash the newest row for
  // 700ms. Tracked as render state driven by the real WS array — no synthetic
  // polling timer.
  const newestTsMs = rows.length > 0 ? rows[0].tsMs : null;
  const [flashKey, setFlashKey] = useState<string | null>(null);
  const prevNewestRef = useRef<number | null>(null);

  useEffect(() => {
    if (newestTsMs == null) return;
    // First render (prev unset) does not flash — only genuinely new events do.
    if (
      prevNewestRef.current != null &&
      newestTsMs > prevNewestRef.current &&
      rows.length > 0
    ) {
      const key = rows[0].key;
      setFlashKey(key);
      const id = window.setTimeout(() => setFlashKey(null), FLASH_MS);
      prevNewestRef.current = newestTsMs;
      return () => window.clearTimeout(id);
    }
    prevNewestRef.current = newestTsMs;
  }, [newestTsMs, rows]);

  return (
    <div className="db-card events pad" data-section="event-stream">
      <header className="db-h">
        <div>
          <span className="db-mark">§ Stream</span>
          <h2>Recent events</h2>
        </div>
        <span className="mono dim">
          <i className="live-dot" aria-hidden="true" />
          WSS
        </span>
      </header>

      {rows.length === 0 ? (
        // Empty state — the real testnet state until `make demo` runs
        // (UI-SPEC Copywriting verbatim).
        <p className="mt-3 text-sm" style={{ color: 'var(--muted)' }}>
          No events yet. Vault activity and OracleSVIUpdated events appear here
          in real time.
        </p>
      ) : (
        <ul className="ev-list" data-testid="event-stream-list">
          {rows.map((row) => (
            <li
              key={row.key}
              style={
                row.key === flashKey
                  ? {
                      background:
                        'color-mix(in oklab, var(--accent) 8%, transparent)',
                      transition: 'background 700ms ease-out',
                    }
                  : { transition: 'background 700ms ease-out' }
              }
            >
              <i className="mono">{row.time}</i>
              <span className={row.accent ? 'ev-k acc' : 'ev-k'}>
                {row.label}
              </span>
              <span>{row.description}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
