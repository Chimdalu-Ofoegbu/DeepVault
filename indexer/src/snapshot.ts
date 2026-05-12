// indexer/src/snapshot.ts — In-memory snapshot store + ring buffer + pub-sub.
//
// Source: 04-RESEARCH.md "Snapshot store" + Pattern 3 ring buffer.
//
// Architecture:
//   * `oracles: Map<oracle_id, SurfaceSnapshot>` — latest SVI per oracle.
//     Plan 4 v1 has a single BTC OracleSVI (per CONTEXT.md A9) but the Map
//     keeps the relay multi-oracle ready without code change.
//   * `vault: VaultStateSnapshot | null` — set by the future getObject poller
//     (Plan 03 wires the live read; Plan 02 only exposes the setter slot).
//   * `ring: RingEvent[]` — bounded by 100 events OR 1h age, whichever is
//     smaller (D-01). Drives replay-on-connect so newcomers never see an
//     empty UI (Pitfall 6 mitigation).
//   * `subscribers: Set<(e) => void>` — wsServer attaches one handler per
//     client; unsubscribe on socket close.
//
// All u64 fields cross the boundary as STRINGS (Pitfall 8 / D-03 wire
// protocol). i64 fields are pre-decoded to signed-integer strings via
// decodeI64.ts before being applied.

import type {
  FullSnapshot,
  RingEvent,
  SurfaceSnapshot,
  VaultStateSnapshot,
} from './types';

/** D-01 ring buffer caps — 100 events OR 1h age, whichever is smaller. */
export const RING_MAX_COUNT = 100;
export const RING_MAX_AGE_MS = 60 * 60 * 1000;

/**
 * Parsed OracleSVIUpdated payload — already-decoded i64 fields ready to
 * apply. Producer (`pollOracleSVI.ts`) is responsible for `decodeI64` on
 * rho + m before calling `applyOracleEvent`.
 */
export type ParsedOracleSvi = {
  oracle_id: string;
  a: string;
  b: string;
  rho_signed: string;
  m_signed: string;
  sigma: string;
  timestamp_ms: string;
};

export type EventSubscriber = (e: RingEvent) => void;

export class Snapshot {
  private oracles = new Map<string, SurfaceSnapshot>();
  private vault: VaultStateSnapshot = null;
  private ring: RingEvent[] = [];
  private subscribers = new Set<EventSubscriber>();

  /**
   * Apply a decoded OracleSVIUpdated event.
   *
   * @param parsed   Parsed payload (i64 fields already decoded to signed-string).
   * @param eventTsMs Authoritative event time — typically `BigInt(evt.timestampMs)`
   *                  from the JSON-RPC envelope (some events also carry a
   *                  payload timestamp; the caller picks the right source).
   */
  applyOracleEvent(parsed: ParsedOracleSvi, eventTsMs: bigint): void {
    const snap: SurfaceSnapshot = {
      oracle_id: parsed.oracle_id,
      a: parsed.a,
      b: parsed.b,
      rho_signed: parsed.rho_signed,
      m_signed: parsed.m_signed,
      sigma: parsed.sigma,
      timestamp_ms: eventTsMs.toString(),
      last_updated_ms: String(Date.now()),
    };
    this.oracles.set(parsed.oracle_id, snap);
    const evt: RingEvent = {
      name: 'OracleSVIUpdated',
      ts_ms: snap.timestamp_ms,
      data: { ...snap } as unknown as Record<string, unknown>,
    };
    this.pushRing(evt);
    this.emit(evt);
  }

  /**
   * Apply a vault-package event (Supplied / RedeemRequested / RedeemFulfilled
   * / HedgeMinted / HedgeRolled / HedgeUnwound / RedeemCanceled / Paused /
   * AdminOverride / AdminTune / AdminUnwind).
   *
   * No per-vault Map — the ring buffer drives newcomer replay. The vault
   * state slot (`this.vault`) is replaced explicitly via `setVaultState`
   * after a getObject read.
   *
   * Data is forwarded verbatim (with the proviso that the producer must
   * already have rewritten any i64 fields via decodeI64).
   */
  applyVaultEvent(
    name: string,
    parsedJson: Record<string, unknown>,
    eventTsMs: bigint,
  ): void {
    const evt: RingEvent = {
      name,
      ts_ms: eventTsMs.toString(),
      data: parsedJson,
    };
    this.pushRing(evt);
    this.emit(evt);
  }

  /**
   * Replace the vault-state slot (D-02 reset on every getObject). Future
   * Plan 03 wires the actual poll; Plan 02 exposes the setter so the wire
   * protocol is stable from day one.
   */
  setVaultState(snapshot: VaultStateSnapshot): void {
    this.vault = snapshot;
  }

  /**
   * Push to the ring with combined count+age eviction (D-01).
   *
   * Drop from head while EITHER:
   *   * length > RING_MAX_COUNT, OR
   *   * head event's ts_ms is older than (now - RING_MAX_AGE_MS).
   *
   * `Number(ts_ms)` is safe here — `Date.now()` fits in 2^53 well past 2099.
   */
  private pushRing(e: RingEvent): void {
    this.ring.push(e);
    const cutoff = Date.now() - RING_MAX_AGE_MS;
    while (
      this.ring.length > RING_MAX_COUNT ||
      (this.ring[0] !== undefined && Number(this.ring[0].ts_ms) < cutoff)
    ) {
      this.ring.shift();
    }
  }

  /**
   * Subscribe to live events. Returns an unsubscribe handle. wsServer uses
   * one subscriber per connected client; clients only need their own handler.
   */
  onEvent(fn: EventSubscriber): () => void {
    this.subscribers.add(fn);
    return () => {
      this.subscribers.delete(fn);
    };
  }

  /**
   * Snapshot frame sent on every new WebSocket client connect (D-02 replay).
   */
  fullSnapshot(): FullSnapshot {
    return {
      oracles: [...this.oracles.values()],
      vault: this.vault,
      ring_buffer: [...this.ring],
      served_at_ms: String(Date.now()),
    };
  }

  /** Test/diag accessor — current ring length. */
  ringLength(): number {
    return this.ring.length;
  }

  /** Test/diag accessor — oracle count. */
  oracleCount(): number {
    return this.oracles.size;
  }

  /** Test/diag accessor — subscriber count. */
  subscriberCount(): number {
    return this.subscribers.size;
  }

  private emit(e: RingEvent): void {
    for (const fn of this.subscribers) {
      try {
        fn(e);
      } catch {
        // Subscriber errors must not poison the snapshot loop. wsServer
        // attaches per-client handlers that already swallow socket errors;
        // any other subscriber must be similarly defensive.
      }
    }
  }
}
