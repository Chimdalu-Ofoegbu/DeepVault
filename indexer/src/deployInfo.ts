// indexer/src/deployInfo.ts — TESTNET-DEPLOY.json loader + deploy-status gate.
//
// Source-of-truth analog: scripts/e2e-vault-cycle.ts:107-114 loadDeploy().
// Same shape, with Phase 4 superset (`oracle_svi_id?: string`).
//
// CRITICAL: do NOT hardcode any package IDs in indexer/src. All IDs come
// from this file (which itself reads JSON written by Phase 2's deploy
// script). CLAUDE.md "What NOT to Use" makes this a hard rule.

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DeployJson } from './types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Resolution order (first hit wins):
 *   1. `overridePath` argument (used by unit tests with synthetic fixtures)
 *   2. `process.env.DEPLOY_JSON_PATH` (resolved against repo root)
 *   3. The canonical Phase 2 location
 *      `.planning/phases/02-vault-move-package-testnet-deploy/TESTNET-DEPLOY.json`
 *
 * Repo root is computed as `../..` from this file (`indexer/src/deployInfo.ts`).
 */
export function loadDeploy(overridePath?: string): DeployJson {
  const repoRoot = resolve(__dirname, '..', '..');
  const envPath = process.env.DEPLOY_JSON_PATH;
  const deployPath =
    overridePath ??
    (envPath ? resolve(repoRoot, envPath) : null) ??
    resolve(
      repoRoot,
      '.planning/phases/02-vault-move-package-testnet-deploy/TESTNET-DEPLOY.json',
    );
  return JSON.parse(readFileSync(deployPath, 'utf-8')) as DeployJson;
}

/**
 * Live-deploy gate. Returns true iff the deploy json has been populated by
 * Phase 2's `e2e-vault-deploy.sh`. While false, relay.ts must skip the
 * polling loops (snapshot-only mode per CONTEXT.md D-Discretion) but still
 * bind wsServer + /healthz so the dashboard can connect.
 */
export function isDeployed(deploy: DeployJson): boolean {
  return deploy.status === 'deployed' && deploy.package_id !== 'PENDING';
}
