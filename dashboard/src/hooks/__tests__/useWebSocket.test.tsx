// dashboard/src/hooks/__tests__/useWebSocket.test.tsx — Plan 04-03 Task 2 TDD.
//
// Validates the WebSocket client + state machine in tandem (DASH-13):
//   1. Initial state is 'connecting'; transitions to 'live' on snapshot frame.
//   2. Server.close() mid-stream → client schedules reconnect with exp backoff
//      (1000-1500ms first attempt, jittered).
//   3. After server restart on the SAME port, client reconnects and returns to
//      'live' with a fresh snapshot.
//   4. Old snapshot persists across reconnect — no white-screen guard (UI keeps
//      rendering stale data while 'reconnecting').
//   5. wsClient unit-level: exponential backoff math (1000 * 2^attempts capped
//      at 30s) verified by tapping into scheduleReconnect's setTimeout delays.
//
// Uses a real `ws` WebSocketServer bound on port 0 (ephemeral). jsdom ships
// the WebSocket constructor; the `ws` package's server side talks to that
// client over a real TCP socket.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { WebSocketServer, type WebSocket } from 'ws';
import { AddressInfo } from 'node:net';

import { WsClient } from '@/lib/wsClient';
import { useWebSocket } from '@/hooks/useWebSocket';
import type { FullSnapshot } from '@/lib/types';

function makeFullSnapshot(servedAt: number): FullSnapshot {
  return {
    oracles: [
      {
        oracle_id: '0xORACLE',
        a: '1000000000',
        b: '500000000',
        rho_signed: '-100000000',
        m_signed: '0',
        sigma: '300000000',
        timestamp_ms: String(servedAt),
        last_updated_ms: String(servedAt),
      },
    ],
    vault: null,
    ring_buffer: [],
    served_at_ms: String(servedAt),
  };
}

/** Spawn a test WS server that sends a snapshot on connect + optional heartbeat. */
function spawnServer(opts: {
  port?: number;
  withHeartbeat?: boolean;
  snapshotAt?: number;
}): Promise<{ wss: WebSocketServer; port: number; stop: () => Promise<void> }> {
  return new Promise((resolve) => {
    const wss = new WebSocketServer({ port: opts.port ?? 0 });
    const heartbeats: NodeJS.Timeout[] = [];
    wss.on('connection', (ws: WebSocket) => {
      const snap = makeFullSnapshot(opts.snapshotAt ?? Date.now());
      ws.send(JSON.stringify({ type: 'snapshot', data: snap }));
      if (opts.withHeartbeat) {
        const t = setInterval(() => {
          if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({ type: 'heartbeat', ts_ms: String(Date.now()) }));
          }
        }, 100);
        heartbeats.push(t);
        ws.on('close', () => clearInterval(t));
      }
    });
    wss.on('listening', () => {
      const addr = wss.address() as AddressInfo;
      resolve({
        wss,
        port: addr.port,
        stop: async () => {
          for (const t of heartbeats) clearInterval(t);
          await new Promise<void>((res) => {
            for (const c of wss.clients) {
              try {
                c.close();
              } catch {
                // already closing
              }
            }
            wss.close(() => res());
          });
        },
      });
    });
  });
}

describe('WsClient (exp backoff + jitter)', () => {
  it('reset attempts to 0 after onopen', async () => {
    const srv = await spawnServer({});
    const client = new WsClient(`ws://localhost:${srv.port}`);
    // Wait for onopen to fire.
    await new Promise((resolve) => setTimeout(resolve, 200));
    // attempts is private; expose via the dispose/close cycle: after a clean
    // disconnect + reconnect, the FIRST reconnect delay must be ~1s, not 2s+.
    expect(client.getAttempts()).toBe(0);
    client.dispose();
    await srv.stop();
  });

  it('computes exp-backoff delay = min(1000 * 2^attempts, 30000) + jitter[0..500]', () => {
    // Drive scheduleReconnect via the public testReconnectDelay() helper.
    const client = new WsClient('ws://localhost:1', { autoConnect: false });
    const samples: number[] = [];
    for (let i = 0; i < 5; i++) {
      samples.push(client.testReconnectDelay(i));
    }
    // attempts=0 → 1000-1500, attempts=1 → 2000-2500, etc.
    expect(samples[0]).toBeGreaterThanOrEqual(1000);
    expect(samples[0]).toBeLessThan(1500);
    expect(samples[1]).toBeGreaterThanOrEqual(2000);
    expect(samples[1]).toBeLessThan(2500);
    expect(samples[2]).toBeGreaterThanOrEqual(4000);
    expect(samples[2]).toBeLessThan(4500);
    expect(samples[3]).toBeGreaterThanOrEqual(8000);
    expect(samples[3]).toBeLessThan(8500);
    expect(samples[4]).toBeGreaterThanOrEqual(16000);
    expect(samples[4]).toBeLessThan(16500);
    // attempts=10 → 1000 * 2^10 = 1_024_000 > 30_000 → capped 30_000-30_500.
    const cap = client.testReconnectDelay(10);
    expect(cap).toBeGreaterThanOrEqual(30_000);
    expect(cap).toBeLessThan(30_500);
    client.dispose();
  });

  it('drops malformed JSON frames silently (T-04-03-02 mitigation)', async () => {
    const wss = new WebSocketServer({ port: 0 });
    await new Promise<void>((res) => wss.on('listening', () => res()));
    const port = (wss.address() as AddressInfo).port;
    wss.on('connection', (ws: WebSocket) => {
      ws.send('not-json-at-all');
    });

    const received: unknown[] = [];
    const client = new WsClient(`ws://localhost:${port}`);
    const off = client.on((m) => received.push(m));
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(received).toHaveLength(0);
    off();
    client.dispose();
    await new Promise<void>((res) => wss.close(() => res()));
  });
});

describe('useWebSocket (DASH-13 state machine + reconnect)', () => {
  beforeEach(() => {
    // Use real timers so the real WS handshake + onopen fire naturally.
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("transitions 'connecting' -> 'live' on snapshot frame", async () => {
    const srv = await spawnServer({});
    const { result, unmount } = renderHook(() =>
      useWebSocket(`ws://localhost:${srv.port}`),
    );

    // Initial state may be 'connecting' or briefly 'live' depending on timing
    // — assert that 'live' is reached and snapshot is populated.
    await waitFor(() => {
      expect(result.current.state).toBe('live');
      expect(result.current.snapshot).not.toBeNull();
      expect(result.current.snapshot?.oracles).toHaveLength(1);
    });

    unmount();
    await srv.stop();
  });

  it('retains last snapshot across reconnect (no white screen)', async () => {
    const srv = await spawnServer({ snapshotAt: 1_000_000_000 });
    const port = srv.port;

    const { result, unmount } = renderHook(() =>
      useWebSocket(`ws://localhost:${port}`),
    );

    await waitFor(() => expect(result.current.state).toBe('live'));
    const snap1 = result.current.snapshot;
    expect(snap1?.served_at_ms).toBe('1000000000');

    // Kill the server. Client should schedule reconnect; snapshot stays.
    await srv.stop();

    // Give the client a moment to detect close + start backing off.
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Snapshot persists (no white screen).
    expect(result.current.snapshot).not.toBeNull();
    expect(result.current.snapshot?.served_at_ms).toBe('1000000000');

    unmount();
  }, 10_000);

  it("flips state to 'reconnecting' immediately on socket close (not 30s later)", async () => {
    // Real-bug regression test: prior implementation derived 'reconnecting'
    // from heartbeat-staleness only (>=30s threshold), so the UI stayed on
    // LIVE for ~30 seconds after the relay died. The fix binds the state
    // machine to WsClient's actual 'closed' lifecycle event — flip should
    // happen within one React render tick, well under 2s.
    const srv = await spawnServer({ snapshotAt: 1_234_567_890 });
    const port = srv.port;
    const { result, unmount } = renderHook(() =>
      useWebSocket(`ws://localhost:${port}`),
    );

    await waitFor(() => expect(result.current.state).toBe('live'));
    const liveAt = Date.now();

    await srv.stop();

    await waitFor(
      () => expect(result.current.state).toBe('reconnecting'),
      { timeout: 2_000, interval: 50 },
    );
    const reconnectAt = Date.now();

    // Must transition in well under the old 30s heartbeat threshold.
    expect(reconnectAt - liveAt).toBeLessThan(2_000);

    // And the snapshot is still there — no white screen.
    expect(result.current.snapshot?.served_at_ms).toBe('1234567890');

    unmount();
  }, 10_000);

  it('reconnects to a fresh server on the same port and re-enters live', async () => {
    const srv1 = await spawnServer({ snapshotAt: 1_111_111_111 });
    const port = srv1.port;

    const { result, unmount } = renderHook(() =>
      useWebSocket(`ws://localhost:${port}`),
    );

    await waitFor(() => expect(result.current.state).toBe('live'));
    expect(result.current.snapshot?.served_at_ms).toBe('1111111111');

    // Kill srv1; client schedules first reconnect at 1000-1500ms.
    await srv1.stop();

    // Bring up srv2 on the SAME port, then wait for client backoff to fire.
    // The exponential backoff first attempt is 1000-1500ms, so by 3s we should
    // have observed at least one reconnect cycle.
    await new Promise((resolve) => setTimeout(resolve, 100));
    const srv2 = await spawnServer({ port, snapshotAt: 2_222_222_222 });

    await waitFor(
      () => {
        expect(result.current.snapshot?.served_at_ms).toBe('2222222222');
        expect(result.current.state).toBe('live');
      },
      { timeout: 5_000, interval: 100 },
    );

    unmount();
    await srv2.stop();
  }, 15_000);
});
