// indexer/src/wsServer.ts — WebSocket fan-out + /healthz on a shared port.
//
// Source: 04-RESEARCH.md Pattern 3 + Plan 04-02 must_haves block.
//
// Wire protocol (D-03 — three message kinds, NO auth):
//   { type: 'snapshot',  data: FullSnapshot }          // first frame on connect
//   { type: 'event',     name, data }                  // per-emission
//   { type: 'heartbeat', ts_ms: string }               // every 10s
//
// HTTP surface:
//   GET /healthz  → 200 { status, cursor, clients, uptime_ms }
//   anything else → 404
//
// We use a single `http.createServer()` to host both the HTTP healthz route
// and the WebSocketServer (`noServer: true` + manual `handleUpgrade`). This
// is the canonical pattern from the `ws` README and avoids running on two
// distinct ports (Render free tier exposes one port per service).
//
// `ws.on('error')` is intentionally swallowed at the warn level — a single
// bad client must not be able to crash the entire fan-out. The relay-side
// reconnect-storm guard (Pattern 3) is the dashboard's exp-backoff in Plan
// 04-03; relay is purely reactive.

import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import type { Cursor } from './cursor';
import { logger } from './logger';
import type { Snapshot } from './snapshot';
import type { WsMessage } from './types';

export type EventCursorValue = { txDigest: string; eventSeq: string } | null;

export type CursorBundle = Record<string, Cursor<EventCursorValue>>;

export type StartWsServerArgs = {
  port: number;
  snapshot: Snapshot;
  cursors: CursorBundle;
  startedAt: number;
  /** Heartbeat interval ms (default 10s — D-03). Overridable for tests. */
  heartbeatMs?: number;
};

export type WsServerHandle = {
  wss: WebSocketServer;
  httpServer: http.Server;
  /** Cooperative shutdown — clears heartbeat, closes clients, stops listening. */
  stop: () => Promise<void>;
  /** Test/diag — current bound port (matches `port` arg unless 0 was passed). */
  port: number;
};

function send(ws: WebSocket, msg: WsMessage): void {
  if (ws.readyState !== ws.OPEN) return;
  try {
    ws.send(JSON.stringify(msg));
  } catch (err) {
    logger.warn({ err }, 'ws.send failed');
  }
}

export function startWsServer(args: StartWsServerArgs): WsServerHandle {
  const heartbeatMs = args.heartbeatMs ?? 10_000;
  const { snapshot, cursors, startedAt } = args;

  const httpServer = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/healthz') {
      const oracleCursor = cursors.oracle?.value ?? null;
      const body = JSON.stringify({
        status: 'ok',
        cursor: oracleCursor,
        clients: wss.clients.size,
        uptime_ms: Date.now() - startedAt,
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(body);
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('not found');
  });

  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (req, socket, head) => {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });

  wss.on('connection', (ws) => {
    // 1) Snapshot frame FIRST (replay-on-connect, D-02). Built once per
    //    client so connect time is O(snapshot size), not O(connect/sec).
    send(ws, { type: 'snapshot', data: snapshot.fullSnapshot() });

    // 2) Forward live events for the lifetime of the socket.
    const unsub = snapshot.onEvent((evt) => {
      send(ws, { type: 'event', name: evt.name, data: evt.data });
    });

    ws.on('close', unsub);
    ws.on('error', (err) => {
      logger.warn({ err: String(err) }, 'ws client error (closing)');
      try {
        ws.close();
      } catch {
        // already closing; swallow
      }
    });
  });

  // 3) Heartbeat — broadcast every `heartbeatMs` to every OPEN client.
  //    The dashboard uses heartbeat freshness as its "is the relay alive"
  //    signal (Plan 03's useWebSocket goes 'reconnecting' after 30s without
  //    a heartbeat, 'down' after 60s).
  const heartbeatTimer = setInterval(() => {
    const ts = String(Date.now());
    for (const ws of wss.clients) {
      send(ws, { type: 'heartbeat', ts_ms: ts });
    }
  }, heartbeatMs);
  // setInterval on Node keeps the event loop alive; unref so a test that
  // forgets to call stop() doesn't hang vitest.
  heartbeatTimer.unref?.();

  httpServer.listen(args.port);
  // Resolve the actually-bound port (when caller passes 0 we want the
  // ephemeral choice for test wiring).
  const addr = httpServer.address();
  const boundPort =
    typeof addr === 'object' && addr !== null ? addr.port : args.port;
  logger.info({ port: boundPort }, 'wsServer listening');

  let stopped = false;
  async function stop(): Promise<void> {
    if (stopped) return;
    stopped = true;
    clearInterval(heartbeatTimer);
    for (const ws of wss.clients) {
      try {
        ws.close();
      } catch {
        // socket already closing
      }
    }
    await new Promise<void>((resolve) => {
      wss.close(() => resolve());
    });
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });
  }

  return { wss, httpServer, stop, port: boundPort };
}
