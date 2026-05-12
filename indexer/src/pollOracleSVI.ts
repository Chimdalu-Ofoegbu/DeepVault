// indexer/src/pollOracleSVI.ts — Sui RPC tail for OracleSVIUpdated events.
//
// Source: 04-RESEARCH.md Pattern 1 ("queryEvents polling with persisted
// cursor"). Plan body must_haves: 2s polling cadence, per-event cursor flush
// (NOT per-page — Pitfall 6 mitigation), exponential backoff on error
// capped at 30s.
//
// CLAUDE.md "What NOT to Use" forbids the deprecated subscribe-event call
// (see CLAUDE.md WebSocket JSON-RPC entry). JSON-RPC sunsets 2026-07-31, so
// we tail via `client.queryEvents` until then. We poll at 2s cadence and
// persist the cursor on every successful event apply.
//
// Field decoding:
//   * `rho` and `m` are Move `i64::I64` (decoded via decodeI64 to signed
//     integer strings; PATTERNS.md `is_negative` correction enforced).
//   * `a`, `b`, `sigma`, `timestamp_ms` are Move `u64` — kept as strings.

// @mysten/sui@2.16.0 moved the JSON-RPC client to `@mysten/sui/jsonRpc`
// (Wave 0 correction; 04-01-SUMMARY.md deviation #1). Pollers accept the
// SuiJsonRpcClient instance constructed by relay.ts.
import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { Cursor } from './cursor';
import { decodeI64 } from './decodeI64';
import { logger } from './logger';
import type { Snapshot } from './snapshot';
import type { RawI64 } from './types';

export type EventCursor = { txDigest: string; eventSeq: string } | null;

/**
 * Shape of `evt.parsedJson` for an OracleSVIUpdated event. u64 fields
 * arrive as numeric STRINGS (per @mysten/sui Move-to-JSON convention);
 * i64 fields as `{magnitude, is_negative}` structs.
 */
type RawOracleSviUpdated = {
  oracle_id: string;
  a: string;
  b: string;
  rho: RawI64;
  m: RawI64;
  sigma: string;
  timestamp_ms?: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type PollOracleSVIArgs = {
  client: SuiJsonRpcClient;
  /** Predict package id (`oracle::OracleSVIUpdated` is emitted from here). */
  predictPkg: string;
  cursor: Cursor<EventCursor>;
  snapshot: Snapshot;
  stopSignal: AbortSignal;
  /** Poll cadence override for tests (default 2_000 ms per CLAUDE.md). */
  pollMs?: number;
};

/**
 * Long-running tail poller. Returns when `stopSignal` fires.
 *
 * Behavior:
 *   1. Build `MoveEventType: ${predictPkg}::oracle::OracleSVIUpdated`.
 *   2. While not aborted:
 *      a. queryEvents({ query, cursor: cursor.value, limit: 50, order: 'ascending' }).
 *      b. For each event: decode rho/m via decodeI64, apply to snapshot,
 *         flush cursor to disk (per-event durability — Pitfall 6).
 *      c. If !hasNextPage → sleep(pollMs).
 *      d. On RPC error → exponential backoff capped at 30s; cursor stays.
 */
export async function pollOracleSVI(args: PollOracleSVIArgs): Promise<void> {
  const ORACLE_SVI_TYPE = `${args.predictPkg}::oracle::OracleSVIUpdated`;
  const pollMs = args.pollMs ?? 2000;
  let failCount = 0;

  while (!args.stopSignal.aborted) {
    try {
      const result = await args.client.queryEvents({
        query: { MoveEventType: ORACLE_SVI_TYPE },
        cursor: args.cursor.value,
        limit: 50,
        order: 'ascending',
      });

      for (const evt of result.data) {
        if (args.stopSignal.aborted) return;
        const parsed = evt.parsedJson as RawOracleSviUpdated;
        const payloadTs = parsed.timestamp_ms ?? evt.timestampMs ?? '0';
        try {
          args.snapshot.applyOracleEvent(
            {
              oracle_id: parsed.oracle_id,
              a: parsed.a,
              b: parsed.b,
              rho_signed: decodeI64(parsed.rho),
              m_signed: decodeI64(parsed.m),
              sigma: parsed.sigma,
              timestamp_ms: payloadTs,
            },
            BigInt(payloadTs),
          );
          // Per-event cursor flush — Pitfall 6 + D-Discretion. A crash mid-page
          // resumes from the LAST APPLIED event, never re-applies, never skips.
          await args.cursor.set(evt.id);
        } catch (err) {
          logger.error(
            { err: String(err), evt: evt.type, id: evt.id },
            'failed to apply OracleSVIUpdated event; skipping (cursor NOT advanced)',
          );
          // Do NOT advance cursor on apply failure — retry on next poll.
          // Break out of the page so the backoff path runs.
          throw err;
        }
      }

      failCount = 0; // reset backoff after a clean page

      if (!result.hasNextPage) {
        await sleep(pollMs);
      }
    } catch (err) {
      if (args.stopSignal.aborted) return;
      failCount += 1;
      const backoff = Math.min(2000 * 2 ** (failCount - 1), 30_000);
      logger.warn(
        { err: String(err), failCount, backoff_ms: backoff },
        'queryEvents OracleSVIUpdated failed; backing off',
      );
      await sleep(backoff);
    }
  }
}
