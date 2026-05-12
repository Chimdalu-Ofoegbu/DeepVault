// wsServer.test.ts — replay-on-connect + broadcast + heartbeat + /healthz
// + DASH-13 server-side reconnect smoke.
//
// Each test binds wsServer on port 0 (OS picks ephemeral). We use the
// `ws` library as the test CLIENT too (avoids needing the browser global).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocket } from 'ws';
import { Cursor } from '../cursor';
import {
  Snapshot,
  type ParsedOracleSvi,
} from '../snapshot';
import { startWsServer, type WsServerHandle } from '../wsServer';
import type { WsMessage } from '../types';

type EventCursor = { txDigest: string; eventSeq: string } | null;

function mkOracleEvent(oracle_id: string, ts_ms: string): ParsedOracleSvi {
  return {
    oracle_id,
    a: '1500000000',
    b: '200000000',
    rho_signed: '-300000000',
    m_signed: '100000000',
    sigma: '400000000',
    timestamp_ms: ts_ms,
  };
}

/**
 * Buffer every message received on the socket from the moment it is wrapped.
 * `attachRecorder` MUST be called BEFORE `waitForOpen` so we never miss the
 * snapshot frame (which the server sends synchronously in its connection
 * handler — if the test only attaches `once('message')` after `await waitForOpen`,
 * a fast heartbeat interval can sneak in front of the snapshot).
 */
function attachRecorder(client: WebSocket): {
  next: (filter?: (m: WsMessage) => boolean) => Promise<WsMessage>;
} {
  const queue: WsMessage[] = [];
  const waiters: Array<{ filter?: (m: WsMessage) => boolean; resolve: (m: WsMessage) => void; reject: (e: unknown) => void }> = [];

  function flush(): void {
    for (let i = waiters.length - 1; i >= 0; i--) {
      const w = waiters[i]!;
      const idx = queue.findIndex((m) => (w.filter ? w.filter(m) : true));
      if (idx >= 0) {
        const [msg] = queue.splice(idx, 1);
        waiters.splice(i, 1);
        w.resolve(msg!);
      }
    }
  }

  client.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString('utf-8')) as WsMessage;
      queue.push(msg);
      flush();
    } catch {
      // ignore malformed (won't happen with our own server)
    }
  });
  client.on('error', (err) => {
    for (const w of waiters.splice(0)) w.reject(err);
  });

  return {
    next: (filter?: (m: WsMessage) => boolean) =>
      new Promise<WsMessage>((resolve, reject) => {
        waiters.push({ filter, resolve, reject });
        flush();
      }),
  };
}

function waitForOpen(client: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (client.readyState === client.OPEN) {
      resolve();
      return;
    }
    client.once('open', () => resolve());
    client.once('error', reject);
  });
}

function waitForClose(client: WebSocket): Promise<void> {
  return new Promise((resolve) => {
    if (client.readyState === client.CLOSED) {
      resolve();
      return;
    }
    client.once('close', () => resolve());
  });
}

let workDir: string;
let server: WsServerHandle | undefined;

beforeEach(async () => {
  vi.useRealTimers();
  const stamp = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
  workDir = join(tmpdir(), 'deepvault-wsserver-' + stamp);
  await fs.mkdir(workDir, { recursive: true });
  server = undefined;
});

afterEach(async () => {
  vi.useRealTimers();
  if (server) await server.stop();
  await fs.rm(workDir, { recursive: true, force: true });
});

async function bootServer(opts?: {
  snapshot?: Snapshot;
  cursors?: Record<string, Cursor<EventCursor>>;
  heartbeatMs?: number;
}): Promise<{ srv: WsServerHandle; snapshot: Snapshot; cursors: Record<string, Cursor<EventCursor>>; port: number }> {
  const snapshot = opts?.snapshot ?? new Snapshot();
  const cursors =
    opts?.cursors ??
    ({
      oracle: new Cursor<EventCursor>(join(workDir, 'cursor_oracle.json')),
    } as Record<string, Cursor<EventCursor>>);
  // Preload cursors so /healthz has a non-error path.
  await Promise.all(Object.values(cursors).map((c) => c.load()));
  const srv = startWsServer({
    port: 0,
    snapshot,
    cursors,
    startedAt: Date.now(),
    heartbeatMs: opts?.heartbeatMs,
  });
  server = srv;
  return { srv, snapshot, cursors, port: srv.port };
}

describe('wsServer replay-on-connect', () => {
  it('sends {type:"snapshot"} as the first frame on every new client connection', async () => {
    const { srv, snapshot } = await bootServer();
    snapshot.applyOracleEvent(mkOracleEvent('0xBTC', '1000'), 1000n);

    const client = new WebSocket(`ws://localhost:${srv.port}`);
    const rec = attachRecorder(client);
    await waitForOpen(client);
    const msg = await rec.next((m) => m.type === 'snapshot');
    expect(msg.type).toBe('snapshot');
    if (msg.type !== 'snapshot') throw new Error('unreachable');
    expect(msg.data.oracles).toHaveLength(1);
    expect(msg.data.oracles[0]!.oracle_id).toBe('0xBTC');
    client.close();
  });

  it('broadcasts {type:"event"} to all connected clients on applyOracleEvent', async () => {
    const { srv, snapshot } = await bootServer();
    const c1 = new WebSocket(`ws://localhost:${srv.port}`);
    const c2 = new WebSocket(`ws://localhost:${srv.port}`);
    const r1 = attachRecorder(c1);
    const r2 = attachRecorder(c2);
    await Promise.all([waitForOpen(c1), waitForOpen(c2)]);
    // Wait for snapshot on both
    await Promise.all([
      r1.next((m) => m.type === 'snapshot'),
      r2.next((m) => m.type === 'snapshot'),
    ]);

    const got1 = r1.next((m) => m.type === 'event');
    const got2 = r2.next((m) => m.type === 'event');
    snapshot.applyOracleEvent(mkOracleEvent('0xBTC', '2000'), 2000n);
    const [m1, m2] = await Promise.all([got1, got2]);
    expect(m1.type).toBe('event');
    expect(m2.type).toBe('event');
    if (m1.type !== 'event' || m2.type !== 'event') throw new Error('unreachable');
    expect(m1.name).toBe('OracleSVIUpdated');
    expect(m2.name).toBe('OracleSVIUpdated');

    c1.close();
    c2.close();
  });

  it('does not throw when a client disconnects mid-broadcast', async () => {
    const { srv, snapshot } = await bootServer();
    const c = new WebSocket(`ws://localhost:${srv.port}`);
    const rec = attachRecorder(c);
    await waitForOpen(c);
    await rec.next((m) => m.type === 'snapshot');
    c.close();
    await waitForClose(c);
    // The broadcast should be a no-op on the closed socket — relay must not crash.
    expect(() =>
      snapshot.applyOracleEvent(mkOracleEvent('0xBTC', '3000'), 3000n),
    ).not.toThrow();
  });
});

describe('wsServer heartbeat', () => {
  it('emits {type:"heartbeat"} on the configured cadence', async () => {
    const { srv } = await bootServer({ heartbeatMs: 50 });
    const c = new WebSocket(`ws://localhost:${srv.port}`);
    const rec = attachRecorder(c);
    await waitForOpen(c);

    // Snapshot then heartbeat — assert each.
    const initial = await rec.next((m) => m.type === 'snapshot');
    expect(initial.type).toBe('snapshot');

    const hb = await rec.next((m) => m.type === 'heartbeat');
    expect(hb.type).toBe('heartbeat');
    if (hb.type !== 'heartbeat') throw new Error('unreachable');
    expect(hb.ts_ms).toMatch(/^\d+$/);
    c.close();
  });
});

describe('wsServer /healthz', () => {
  it('returns 200 JSON with {status, cursor, clients, uptime_ms}', async () => {
    const { srv, cursors } = await bootServer();
    // Force a non-null cursor value so the body is fully exercised.
    await cursors.oracle!.set({ txDigest: 'abc', eventSeq: '1' });

    const res = await fetch(`http://localhost:${srv.port}/healthz`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/json');
    const body = (await res.json()) as {
      status: string;
      cursor: unknown;
      clients: number;
      uptime_ms: number;
    };
    expect(body.status).toBe('ok');
    expect(body.cursor).toEqual({ txDigest: 'abc', eventSeq: '1' });
    expect(typeof body.clients).toBe('number');
    expect(typeof body.uptime_ms).toBe('number');
  });

  it('returns 404 for non-/healthz GET requests', async () => {
    const { srv } = await bootServer();
    const res = await fetch(`http://localhost:${srv.port}/other`);
    expect(res.status).toBe(404);
  });
});

describe('wsServer DASH-13 reconnect smoke', () => {
  it('stop() + restart on the same logical relay surface delivers a fresh snapshot to a new client', async () => {
    // Round 1: boot, connect, drain snapshot, then stop the server.
    const round1 = await bootServer();
    const c1 = new WebSocket(`ws://localhost:${round1.srv.port}`);
    const r1 = attachRecorder(c1);
    await waitForOpen(c1);
    const first = await r1.next((m) => m.type === 'snapshot');
    expect(first.type).toBe('snapshot');
    await round1.srv.stop();
    await waitForClose(c1);
    server = undefined;

    // Round 2: boot a fresh server (port 0 → new ephemeral port). The
    // dashboard's client-side reconnect logic in Plan 04-03 will retry
    // with exponential backoff; this test asserts the SERVER side delivers
    // a snapshot frame on the new connection within 1s.
    const snapshot = new Snapshot();
    snapshot.applyOracleEvent(mkOracleEvent('0xBTC-postrestart', '9999'), 9999n);
    const round2 = await bootServer({ snapshot });

    const c2 = new WebSocket(`ws://localhost:${round2.srv.port}`);
    const r2 = attachRecorder(c2);
    await waitForOpen(c2);
    const replay = await Promise.race([
      r2.next((m) => m.type === 'snapshot'),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('snapshot not received within 1s')), 1000),
      ),
    ]);
    expect(replay.type).toBe('snapshot');
    if (replay.type !== 'snapshot') throw new Error('unreachable');
    expect(replay.data.oracles[0]!.oracle_id).toBe('0xBTC-postrestart');
    c2.close();
  });
});
