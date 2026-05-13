// dashboard/src/hooks/useWebSocket.ts — React hook wrapping WsClient with
// the relay-state machine (DASH-13).
//
// Source: 04-RESEARCH.md "React hook wrapper", Plan 04-03 Task 2 must_haves.
//
// State machine (RelayStatusPill consumes this):
//   mount                                       → 'connecting'
//   receive { type:'snapshot' } AND connected   → 'live'
//   WsClient 'closed' status event              → 'reconnecting'  (immediate)
//   reconnect succeeds + new snapshot arrives   → 'live'
//   age >= 60s with no heartbeat                → 'down'
//
// **Close-event binding (real-bug fix):** the previous implementation derived
// transitions purely from heartbeat-staleness (>=30s → reconnecting, >=60s →
// down), which meant a user killing the relay saw the LIVE pill stay green
// for ~30 seconds. Now WsClient emits 'open'/'closed' lifecycle events on the
// actual `onopen`/`onclose` callbacks, and this hook flips `state` to
// 'reconnecting' the moment 'closed' fires. Heartbeat-staleness remains as a
// fallback signal (in case the TCP socket looks alive but no data flows) and
// drives the 'reconnecting' → 'down' transition at 60s.
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

// Fallback heartbeat-staleness thresholds — used when the socket *appears*
// alive but no data flows. Primary 'reconnecting' signal now comes from the
// WsClient 'closed' status event (sub-second response).
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
  // Connection-lifecycle tracking — flips on WsClient 'open'/'closed' status
  // events. Used by both the immediate transition path AND the interval-tick
  // fallback so a dead socket can never be misread as live.
  const [isConnected, setIsConnected] = useState<boolean>(false);

  // Wire up the WS client. Single effect keyed on `url` so changing the
  // relay endpoint mid-session reconnects cleanly.
  useEffect(() => {
    const client = new WsClient(url);
    clientRef.current = client;

    const offMsg = client.on((msg) => {
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

    const offStatus = client.onStatus((status) => {
      if (status === 'open') {
        // Socket opened — but we don't have data yet. Mark connected; the
        // snapshot handler above will flip state to 'live' once the relay's
        // replay-on-connect frame arrives.
        setIsConnected(true);
      } else {
        // 'closed' — immediate flip to 'reconnecting'. The exp-backoff timer
        // inside WsClient is already scheduled; the UI just needs to reflect
        // the dropped connection without waiting 30s for heartbeat staleness.
        setIsConnected(false);
        setState((prev) => (prev === 'down' ? 'down' : 'reconnecting'));
      }
    });

    return () => {
      offMsg();
      offStatus();
      client.dispose();
      clientRef.current = null;
    };
  }, [url]);

  // State re-evaluation tick: 1s polling. Heartbeat-staleness drives the
  // 'reconnecting' → 'down' transition at 60s. `isConnected` is a hard
  // override: if the socket isn't open, we can never be 'live'.
  useEffect(() => {
    const id = setInterval(() => {
      const age = Date.now() - lastHeartbeatMs;
      if (!isConnected) {
        // Socket is down. Promote to 'down' only after 60s of no recovery.
        if (age >= HEARTBEAT_DOWN_THRESHOLD_MS) {
          setState('down');
        } else {
          setState('reconnecting');
        }
        return;
      }
      // Socket is open. Use heartbeat-staleness as the fallback signal in
      // case the connection is alive but the relay stopped sending data.
      if (age >= HEARTBEAT_DOWN_THRESHOLD_MS) {
        setState('down');
      } else if (age >= HEARTBEAT_RECONNECT_THRESHOLD_MS) {
        setState('reconnecting');
      } else if (snapshot) {
        setState('live');
      }
      // If connected but no snapshot yet, stay in 'connecting'.
    }, STATE_TICK_MS);
    return () => clearInterval(id);
  }, [lastHeartbeatMs, snapshot, isConnected]);

  return { state, snapshot, eventCount, lastHeartbeatMs };
}
