// indexer/src/pollVaultEvents.ts — Per-module tail for vault package events.
//
// Strategy: one polling loop per emit-site module (supply / redeem /
// rebalance / vault), each with its own cursor file. This is the
// simplest-correct implementation per Plan 04-02 body comment "use one
// cursor per module ... use 4 polling loops one per emit-site module".
//
// Event surface (PATTERNS.md "Pollable event surface"):
//   supply.move    → Supplied
//   redeem.move    → RedeemRequested, RedeemFulfilled, RedeemCanceled
//   rebalance.move → HedgeMinted, HedgeRolled
//   vault.move     → VaultCreated, HedgeUnwound, Paused, AdminOverride,
//                    AdminTune, AdminUnwind
//
// Filter type: `MoveModule: { package, module }` — returns every event
// emitted by transactions calling functions in `${package}::${module}`.
// We use suffix-matching (e.g. `evt.type.endsWith('::supply::Supplied')`)
// to route events into the snapshot, robust to redeploys that change the
// package id (per PATTERNS.md "Shared event find-by-suffix").

// @mysten/sui@2.16.0 moved the JSON-RPC client to `@mysten/sui/jsonRpc`
// (Wave 0 correction). Pollers accept the SuiJsonRpcClient from relay.ts.
import type { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { Cursor } from './cursor';
import { logger } from './logger';
import type { Snapshot } from './snapshot';
import type { EventCursor } from './pollOracleSVI';

export type VaultModule = 'supply' | 'redeem' | 'rebalance' | 'vault';

/**
 * Strip the qualified Move event type down to its `module::EventName` tail.
 * `0x1234::supply::Supplied` → `Supplied`.
 */
function eventNameFromType(t: string): string {
  const segments = t.split('::');
  return segments[segments.length - 1] ?? t;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type PollVaultEventsArgs = {
  client: SuiJsonRpcClient;
  /** Vault package id (the DeepVault package — NOT the Predict package). */
  vaultPkg: string;
  /** Which emit-site module to tail. */
  module: VaultModule;
  cursor: Cursor<EventCursor>;
  snapshot: Snapshot;
  stopSignal: AbortSignal;
  /** Poll cadence override for tests (default 2_000 ms per CLAUDE.md). */
  pollMs?: number;
};

/**
 * Per-module tail. Same backoff + per-event-flush invariants as
 * pollOracleSVI; only the filter and event-name extraction differ.
 *
 * `parsedJson` is forwarded VERBATIM to `snapshot.applyVaultEvent`. This
 * works for all 11 vault events because none of them carry an i64 (the
 * only i64 surface in the relay is `OracleSVIUpdated.rho` + `.m`).
 */
export async function pollVaultEvents(args: PollVaultEventsArgs): Promise<void> {
  const pollMs = args.pollMs ?? 2000;
  let failCount = 0;

  while (!args.stopSignal.aborted) {
    try {
      const result = await args.client.queryEvents({
        query: { MoveModule: { package: args.vaultPkg, module: args.module } },
        cursor: args.cursor.value,
        limit: 50,
        order: 'ascending',
      });

      for (const evt of result.data) {
        if (args.stopSignal.aborted) return;
        const name = eventNameFromType(evt.type);
        const ts = evt.timestampMs ?? '0';
        try {
          args.snapshot.applyVaultEvent(
            name,
            evt.parsedJson as Record<string, unknown>,
            BigInt(ts),
          );
          await args.cursor.set(evt.id);
        } catch (err) {
          logger.error(
            { err: String(err), evt: evt.type, id: evt.id, module: args.module },
            'failed to apply vault event; skipping (cursor NOT advanced)',
          );
          throw err;
        }
      }

      failCount = 0;

      if (!result.hasNextPage) {
        await sleep(pollMs);
      }
    } catch (err) {
      if (args.stopSignal.aborted) return;
      failCount += 1;
      const backoff = Math.min(2000 * 2 ** (failCount - 1), 30_000);
      logger.warn(
        { err: String(err), module: args.module, failCount, backoff_ms: backoff },
        'queryEvents vault module failed; backing off',
      );
      await sleep(backoff);
    }
  }
}
