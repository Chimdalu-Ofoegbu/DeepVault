// dashboard/src/hooks/useWebSocket.ts — React hook wrapping WsClient with
// the relay-state machine (DASH-13).
//
// Source: 04-RESEARCH.md "React hook wrapper", Plan 04-03 Task 2 must_haves.
//
// State machine (RelayStatusPill consumes this):
//   mount                                 → 'connecting'
//   receive { type:'snapshot' }           → 'live'
//   now - lastHeartbeatMs ∈ [30s, 60s)    → 'reconnecting'
//   now - lastHeartbeatMs >= 60s          → 'down'
//
// Return shape:
//   { state, snapshot, eventCount, lastHeartbeatMs }
//
// The snapshot is RETAINED across reconnects (T-04-03 white-screen guard):
// when the WS server dies, the client schedules an exp-backoff reconnect via
// WsClient but the React state holding the LAST snapshot is never cleared.
// Panels that have rendered will continue to render stale data with stale
// borders applied (UI-SPEC §Staleness).
//
// On `{ type: 'event' }`, we append to ring_buffer client-side. The server
// keeps its own 100-event cap (Plan 02 D-01); we mirror that here so a long-
// running dashboard session doesn't unbounded-grow.

import { useEffect, useRef, useState } from 'react';

import { WsClient } from '@/lib/wsClient';
import type { FullSnapshot, RingEvent, WsState } from '@/lib/types';

const HEARTBEAT_RECONNECT_THRESHOLD_MS = 30_000;
const HEARTBEAT_DOWN_THRESHOLD_MS = 60_000;
const STATE_TICK_MS = 1_000;
const CLIENT_RING_CAP = 100;

export type UseWsReturn = {
  state: WsState;
  snapshot: FullSnapshot | null;
  eventCount: number;
  lastHeartbeatMs: number;
};

/**
 * Append a live event to the snapshot's ring buffer (mirrors server side
 * count-eviction). Returns a NEW snapshot object so React state updates
 * propagate; deep-clone of the ring is required because consumers may snapshot
 * the array reference.
 */
function applyEvent(
  prev: FullSnapshot,
  name: string,
  data: Record<string, unknown>,
): FullSnapshot {
  const entry: RingEvent = {
    name,
    ts_ms: String(Date.now()),
    data,
  };
  const next = [...prev.ring_buffer, entry];
  // Count-cap: drop oldest if we exceed cap (server-side enforces 100 too).
  while (next.length > CLIENT_RING_CAP) next.shift();
  return { ...prev, ring_buffer: next };
}

export function useWebSocket(url: string): UseWsReturn {
  const clientRef = useRef<WsClient | null>(null);
  const [state, setState] = useState<WsState>('connecting');
  const [snapshot, setSnapshot] = useState<FullSnapshot | null>(null);
  const [eventCount, setEventCount] = useState<number>(0);
  const [lastHeartbeatMs, setLastHeartbeatMs] = useState<number>(() => Date.now());

  // Wire up the WS client. Single effect keyed on `url` so changing the
  // relay endpoint mid-session reconnects cleanly.
  useEffect(() => {
    const client = new WsClient(url);
    clientRef.current = client;

    const off = client.on((msg) => {
      switch (msg.type) {
        case 'snapshot':
          setSnapshot(msg.data);
          setLastHeartbeatMs(Date.now());
          setState('live');
          break;
        case 'event':
          setSnapshot((prev) => (prev ? applyEvent(prev, msg.name, msg.data) : prev));
          setEventCount((n) => n + 1);
          // Treat event arrival as a liveness signal too (relay is alive).
          setLastHeartbeatMs(Date.now());
          break;
        case 'heartbeat':
          setLastHeartbeatMs(Date.now());
          break;
      }
    });

    return () => {
      off();
      client.dispose();
      clientRef.current = null;
    };
  }, [url]);

  // State re-evaluation tick: 1s polling against lastHeartbeatMs.
  // Held separately from the connection effect so heartbeat-staleness alone
  // can flip the state machine even if no new messages arrive.
  useEffect(() => {
    const id = setInterval(() => {
      const age = Date.now() - lastHeartbeatMs;
      if (age >= HEARTBEAT_DOWN_THRESHOLD_MS) {
        setState('down');
      } else if (age >= HEARTBEAT_RECONNECT_THRESHOLD_MS) {
        setState('reconnecting');
      } else if (snapshot) {
        setState('live');
      }
      // If neither threshold and no snapshot yet, stay in 'connecting'.
    }, STATE_TICK_MS);
    return () => clearInterval(id);
  }, [lastHeartbeatMs, snapshot]);

  return { state, snapshot, eventCount, lastHeartbeatMs };
}
