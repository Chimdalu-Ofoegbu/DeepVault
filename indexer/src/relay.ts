// indexer/src/relay.ts — Phase 4 Wave 1 entry point.
//
// Boot sequence:
//   1. Load .env (PORT, SUI_RPC_URL, DEPLOY_JSON_PATH, LOG_LEVEL,
//      ORACLE_SVI_ID override).
//   2. Load TESTNET-DEPLOY.json + create Snapshot store + Cursor handles.
//   3. ALWAYS start wsServer FIRST — snapshot-only mode is graceful and the
//      dashboard's reconnect logic needs SOMETHING to connect to.
//   4. If !isDeployed(deploy) → log `::warning::` annotation, return after
//      wsServer is bound (snapshot-only mode, D-Discretion).
//   5. Otherwise → spawn the 5 polling loops (1 oracle + 4 vault modules),
//      each with its own atomic-write cursor file.
//   6. SIGINT / SIGTERM → AbortController.abort() + server.stop() + flush.
//
// Module-vs-direct-invocation guard at the bottom mirrors PATTERNS.md (copy
// from `scripts/two-protocol-ptb-demo.ts:701-709`).

import 'dotenv/config';
// NOTE: @mysten/sui@2.16.0 renamed `getFullnodeUrl` → `getJsonRpcFullnodeUrl`
// and moved both that helper + the JSON-RPC SuiClient into `@mysten/sui/jsonRpc`.
// Same correction Wave 0's dashboard/src/main.tsx applies (see 04-01-SUMMARY.md
// deviation #1). CLAUDE.md pins 2.16.0; using the legacy path crashes at boot.
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { Cursor } from './cursor';
import { loadDeploy, isDeployed } from './deployInfo';
import { logger } from './logger';
import { pollOracleSVI, type EventCursor } from './pollOracleSVI';
import { pollVaultEvents, type VaultModule } from './pollVaultEvents';
import { Snapshot } from './snapshot';
import { startWsServer } from './wsServer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Resolve `indexer/data/<file>` relative to the indexer workspace root.
 * `indexer/src/relay.ts` lives at `../..` from this file.
 */
function dataPath(file: string): string {
  return resolvePath(__dirname, '..', 'data', file);
}

export async function main(): Promise<void> {
  const startedAt = Date.now();
  const port = Number(process.env.PORT ?? 8080);
  const rpcUrl = process.env.SUI_RPC_URL ?? getJsonRpcFullnodeUrl('testnet');

  const deploy = loadDeploy();
  const snapshot = new Snapshot();

  const cursors = {
    oracle: new Cursor<EventCursor>(dataPath('cursor_oracle.json')),
    supply: new Cursor<EventCursor>(dataPath('cursor_supply.json')),
    redeem: new Cursor<EventCursor>(dataPath('cursor_redeem.json')),
    rebalance: new Cursor<EventCursor>(dataPath('cursor_rebalance.json')),
    vault: new Cursor<EventCursor>(dataPath('cursor_vault.json')),
  };
  await Promise.all(Object.values(cursors).map((c) => c.load()));

  // ALWAYS bind wsServer first — snapshot-only mode still serves /healthz
  // and replay-on-connect to any dashboard client. wsServer logs its own
  // 'wsServer listening' line on startup; no need to duplicate it here.
  const server = startWsServer({ port, snapshot, cursors, startedAt });

  if (!isDeployed(deploy)) {
    logger.warn(
      { status: deploy.status, package_id: deploy.package_id },
      'TESTNET-DEPLOY.json not deployed; snapshot-only mode (graceful)',
    );
    console.warn(
      `::warning::TESTNET-DEPLOY.json status='${deploy.status}'; expected 'deployed'. ` +
        'Snapshot-only mode; no live polling. Run scripts/e2e-vault-deploy.sh to enable.',
    );
    // Stay alive until SIGINT / SIGTERM. Heartbeats keep dashboard alive.
    await new Promise<void>((resolve) => {
      const onShutdown = (): void => {
        void server.stop().finally(() => resolve());
      };
      process.once('SIGINT', onShutdown);
      process.once('SIGTERM', onShutdown);
    });
    return;
  }

  // Live mode: start polling loops.
  const client = new SuiJsonRpcClient({ url: rpcUrl, network: 'testnet' });
  const oracleSviId = deploy.oracle_svi_id ?? process.env.ORACLE_SVI_ID;
  if (!oracleSviId) {
    logger.warn(
      'oracle_svi_id missing from TESTNET-DEPLOY.json and ORACLE_SVI_ID env; OracleSVI poll filter is package-wide (will still receive events)',
    );
  }

  const stopController = new AbortController();
  const polls: Promise<void>[] = [
    pollOracleSVI({
      client,
      predictPkg: deploy.predict_package_id,
      cursor: cursors.oracle,
      snapshot,
      stopSignal: stopController.signal,
    }),
    ...(['supply', 'redeem', 'rebalance', 'vault'] as VaultModule[]).map((mod) =>
      pollVaultEvents({
        client,
        vaultPkg: deploy.package_id,
        module: mod,
        cursor: cursors[mod],
        snapshot,
        stopSignal: stopController.signal,
      }),
    ),
  ];

  const onShutdown = (): void => {
    logger.info('shutting down');
    stopController.abort();
    void server.stop();
  };
  process.once('SIGINT', onShutdown);
  process.once('SIGTERM', onShutdown);

  await Promise.all(polls);
}

// Module-vs-direct-invocation guard. Without this, importing this module
// (e.g. from tests) would spawn the polling loops as a side effect.
// Mirrors scripts/two-protocol-ptb-demo.ts:701-709.
const isDirectInvocation =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('relay.ts') ||
  process.argv[1]?.endsWith('relay.js') ||
  false;

if (isDirectInvocation) {
  main().catch((err) => {
    logger.error({ err: String(err) }, 'relay crashed');
    process.exit(1);
  });
}
