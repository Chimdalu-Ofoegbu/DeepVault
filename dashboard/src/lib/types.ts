// dashboard/src/lib/types.ts — Phase 4 Plan 03 wire-format types.
//
// Mirrors `indexer/src/types.ts` — the relay is the source of truth for the
// JSON shapes that flow over WebSocket. All u64 fields cross the wire as
// STRINGS (Pitfall 8 / Phase 3 D-15) and are parsed via `BigInt()` at the
// boundary; we never let a u64 touch a JS `Number`.
//
// Keep this file in lockstep with indexer/src/types.ts. Whenever the relay
// adds a new field, mirror it here AND in any consuming hook.

/**
 * Raw I64 shape emitted in @mysten/sui `parsedJson` (decoded by the indexer
 * before broadcast — see `indexer/src/decodeI64.ts`). Kept here for any
 * downstream hook that wants to deal with the raw struct directly.
 */
export type RawI64 = { magnitude: string; is_negative: boolean };

/**
 * Per-oracle SVI surface snapshot, broadcast by the relay's `Snapshot`.
 * `rho_signed` and `m_signed` are pre-decoded signed-integer strings (the
 * indexer ran `decodeI64` so dashboards consume `BigInt(rho_signed)` directly).
 */
export type SurfaceSnapshot = {
  oracle_id: string;
  a: string; // u64-as-string
  b: string; // u64-as-string
  rho_signed: string; // signed-int-as-string (decoded from i64)
  m_signed: string; // signed-int-as-string (decoded from i64)
  sigma: string; // u64-as-string
  timestamp_ms: string; // u64-as-string (chain time)
  last_updated_ms: string; // u64-as-string (relay wall-clock at apply time)
};

/**
 * Vault state snapshot — populated by Plan 03 getObject pollers (relay side).
 * v1 broadcasts `null` until the live poll is wired; dashboard panels render
 * a "Waiting on first vault snapshot" pill in the interim (UI-SPEC §Empty).
 */
export type VaultStateSnapshot = {
  vault_id: string;
  balance: string;
  total_assets: string;
  total_shares: string;
  paused: boolean;
  last_updated_ms: string;
} | null;

/**
 * Ring buffer entry pushed on every `applyOracleEvent` / `applyVaultEvent`
 * (D-01 — 100 events or 1h, whichever bites first).
 */
export type RingEvent = {
  name: string;
  ts_ms: string;
  data: Record<string, unknown>;
};

/**
 * Full snapshot frame sent on every new WebSocket client connect (D-02 —
 * replay-on-connect contract). The relay sends this BEFORE any live events.
 */
export type FullSnapshot = {
  oracles: SurfaceSnapshot[];
  vault: VaultStateSnapshot;
  ring_buffer: RingEvent[];
  served_at_ms: string;
};

/**
 * Wire-protocol message kinds — three kinds only (D-03):
 *   snapshot   — first frame on connect, atomic replace on client
 *   event      — per-emission, appended to ring buffer client-side
 *   heartbeat  — every 10s; freshness drives state machine
 */
export type WsMessage =
  | { type: 'snapshot'; data: FullSnapshot }
  | { type: 'event'; name: string; data: Record<string, unknown> }
  | { type: 'heartbeat'; ts_ms: string };

/**
 * WebSocket client state machine (consumed by RelayStatusPill):
 *   connecting     — initial socket open in flight (no snapshot yet)
 *   live           — snapshot received AND heartbeat fresh (<30s)
 *   reconnecting   — heartbeat age >=30s and <60s (or socket closed,
 *                    waiting for exp-backoff timer)
 *   down           — heartbeat age >=60s (relay considered dead)
 */
export type WsState = 'connecting' | 'live' | 'reconnecting' | 'down';

/**
 * Per-panel staleness category derived from `last_updated_ms` (UI-SPEC §4).
 * Thresholds: 0-30s fresh, 30-60s warning, >=60s stale.
 */
export type Staleness = 'fresh' | 'warning' | 'stale';
