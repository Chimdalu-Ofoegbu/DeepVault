// dashboard/src/lib/wsClient.ts — Browser WebSocket client with exponential
// backoff + jitter reconnect.
//
// Source: 04-RESEARCH.md Pattern 4 (verbatim), Plan 04-03 Task 2 must_haves.
//
// Reconnect math (DASH-13 + T-04-03-01 mitigation):
//   delay = min(1000 * 2^attempts, 30_000) + jitter[0..500]ms
// On `onopen`, attempts reset to 0 so the NEXT reconnect cycle starts fresh.
// On `onerror`, we call `ws.close()` (which triggers `onclose` → schedule
// reconnect) so a single failure path never double-schedules.
//
// JSON-parse is wrapped in try/catch (T-04-03-02 mitigation — a malicious or
// malformed WS frame must never throw inside React state-update path).
//
// `dispose()` clears the pending timer + closes the socket; useWebSocket calls
// this on unmount (T-04-03-04 mitigation against subscription leaks).

import type { WsMessage } from './types';

type Handler = (msg: WsMessage) => void;

export interface WsClientOptions {
  /** If false, the constructor will NOT call connect() — useful for unit-testing
   *  scheduleReconnect math without a real socket. Default true. */
  autoConnect?: boolean;
}

export class WsClient {
  private ws: WebSocket | undefined;
  private attempts = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private handlers = new Set<Handler>();
  private disposed = false;

  constructor(
    private readonly url: string,
    options: WsClientOptions = {},
  ) {
    const autoConnect = options.autoConnect ?? true;
    if (autoConnect) this.connect();
  }

  /** Subscribe to all incoming messages. Returns an unsubscribe function. */
  on(handler: Handler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  /** Test-only / diagnostic — current reconnect-attempt counter. */
  getAttempts(): number {
    return this.attempts;
  }

  /**
   * Test-only helper: compute the reconnect delay for a given attempts count.
   * Lets unit tests assert backoff math WITHOUT having to time real reconnects.
   * (Same formula as scheduleReconnect.)
   */
  testReconnectDelay(attempts: number): number {
    const base = Math.min(1000 * 2 ** attempts, 30_000);
    const jitter = Math.floor(Math.random() * 500);
    return base + jitter;
  }

  private connect(): void {
    if (this.disposed) return;
    try {
      this.ws = new WebSocket(this.url);
    } catch (err) {
      // Construction itself failed (e.g. invalid URL) — treat as a connection
      // failure and reschedule. Surfaces in tests under jsdom where mock URLs
      // can throw synchronously.
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.attempts = 0;
    };
    this.ws.onmessage = (e: MessageEvent) => {
      try {
        const msg = JSON.parse(typeof e.data === 'string' ? e.data : String(e.data)) as WsMessage;
        for (const h of this.handlers) h(msg);
      } catch {
        // Malformed JSON — drop silently. T-04-03-02 mitigation.
      }
    };
    this.ws.onclose = () => this.scheduleReconnect();
    this.ws.onerror = () => {
      // Close triggers onclose → reconnect. Never schedule directly from here
      // so we don't double-fire (onerror is almost always followed by onclose).
      try {
        this.ws?.close();
      } catch {
        // ws was never opened; ignore
      }
    };
  }

  private scheduleReconnect(): void {
    if (this.disposed) return;
    if (this.timer) clearTimeout(this.timer);
    const base = Math.min(1000 * 2 ** this.attempts, 30_000);
    const jitter = Math.floor(Math.random() * 500);
    this.attempts += 1;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.connect();
    }, base + jitter);
  }

  /** Stop reconnecting and close the socket. Idempotent. */
  dispose(): void {
    this.disposed = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    try {
      this.ws?.close();
    } catch {
      // already closing
    }
    this.handlers.clear();
  }
}
