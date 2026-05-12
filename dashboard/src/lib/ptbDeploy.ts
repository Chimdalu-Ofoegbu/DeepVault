// dashboard/src/lib/ptbDeploy.ts — Plan 04-07 Task 1.
//
// Build-time import of TESTNET-DEPLOY.json from Phase 2. Vite bakes the file
// content into the dashboard bundle; updates to the JSON require a rebuild
// (Vercel auto-rebuilds on every push to master, so the dashboard always
// ships with the latest deploy info from the default branch).
//
// Per CLAUDE.md "No hardcoded Predict package IDs in source": the IDs come
// from this JSON, which is the single source of truth for the deployed vault
// surface. No literal package IDs appear in dashboard TypeScript.
//
// Per UI-SPEC §Error states: when status === 'pending_first_deploy' the
// dashboard panels render "Vault not yet deployed to testnet. The dashboard
// is in snapshot-only mode — live events resume after deploy." `isDeployed`
// is the gate that switches panel behavior between snapshot-only and live.

import deployRaw from '../../../.planning/phases/02-vault-move-package-testnet-deploy/TESTNET-DEPLOY.json';

/**
 * The deploy JSON shape. We widen the inferred type so consumers can use it
 * even when the on-disk JSON still has 'PENDING' placeholders — TypeScript
 * narrows `package_id` to the literal `"PENDING"` otherwise, which makes
 * downstream `${deploy.package_id}::supply::supply` template strings break.
 */
export type DeployJson = {
  network: string;
  status: string;
  deployed_at_iso: string;
  deploy_tx_digest: string;
  deployer: string;
  package_id: string;
  vault_id: string;
  vault_initial_shared_version: number;
  admin_cap_id: string;
  predict_manager_id: string;
  predict_manager_initial_shared_version: number;
  predict_package_id: string;
  predict_registry_id: string;
  predict_top_level_id: string;
  dusdc_type_tag: string;
  /** Optional — populated by the Phase 2 deploy script when the oracle is provisioned. */
  oracle_svi_id?: string;
};

export const DEPLOY: DeployJson = deployRaw as DeployJson;

/**
 * Gate for live vs snapshot-only mode. `pending_first_deploy` indicates the
 * Phase 2 deploy has not landed yet; the dashboard renders an empty-state
 * panel rather than wiring PTBs against PENDING placeholders. When the
 * deploy lands and the JSON's status flips to `deployed`, every panel
 * auto-activates — no code change required.
 */
export function isDeployed(d: DeployJson = DEPLOY): boolean {
  return d.status === 'deployed' && d.package_id !== 'PENDING';
}

/**
 * React hook variant for components that need to react to deploy-status
 * changes (currently the JSON is build-time baked, so the value never
 * changes at runtime — this exists for API symmetry with the Plan 04-07
 * Task 2 components that consume it).
 */
export function useDeploy(): { DEPLOY: DeployJson; isDeployed: () => boolean } {
  return { DEPLOY, isDeployed: () => isDeployed(DEPLOY) };
}
