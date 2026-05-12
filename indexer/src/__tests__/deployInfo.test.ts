// deployInfo.test.ts — exercises loadDeploy(path) round-trip + isDeployed().

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isDeployed, loadDeploy } from '../deployInfo';
import type { DeployJson } from '../types';

const PENDING_FIXTURE: DeployJson = {
  network: 'testnet',
  status: 'pending_first_deploy',
  deployed_at_iso: 'PENDING',
  deploy_tx_digest: 'PENDING',
  deployer: 'PENDING',
  package_id: 'PENDING',
  vault_id: 'PENDING',
  vault_initial_shared_version: 0,
  admin_cap_id: 'PENDING',
  predict_manager_id: 'PENDING',
  predict_manager_initial_shared_version: 0,
  predict_package_id:
    '0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138',
  predict_registry_id:
    '0x43af14fed5480c20ff77e2263d5f794c35b9fab7e2212903127062f4fe2a6e64',
  predict_top_level_id:
    '0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a',
  dusdc_type_tag:
    '0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC',
};

const DEPLOYED_FIXTURE: DeployJson = {
  ...PENDING_FIXTURE,
  status: 'deployed',
  deployed_at_iso: '2026-05-30T12:00:00Z',
  deploy_tx_digest: '5z',
  deployer: '0xdeployer',
  package_id: '0xabc',
  vault_id: '0xvault',
  vault_initial_shared_version: 100,
  admin_cap_id: '0xadmin',
  predict_manager_id: '0xmanager',
  predict_manager_initial_shared_version: 101,
  oracle_svi_id: '0xoracle',
};

let workDir: string;

beforeEach(async () => {
  const stamp = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
  workDir = join(tmpdir(), 'deepvault-deploy-' + stamp);
  await fs.mkdir(workDir, { recursive: true });
});

afterEach(async () => {
  await fs.rm(workDir, { recursive: true, force: true });
});

describe('loadDeploy + isDeployed', () => {
  it('loadDeploy(overridePath) round-trips the parsed JSON shape', async () => {
    const filePath = join(workDir, 'deploy.json');
    await fs.writeFile(filePath, JSON.stringify(PENDING_FIXTURE), 'utf-8');
    const deploy = loadDeploy(filePath);
    expect(deploy).toEqual(PENDING_FIXTURE);
  });

  it('loadDeploy includes the optional oracle_svi_id from the deployed fixture', async () => {
    const filePath = join(workDir, 'deploy.json');
    await fs.writeFile(filePath, JSON.stringify(DEPLOYED_FIXTURE), 'utf-8');
    const deploy = loadDeploy(filePath);
    expect(deploy.oracle_svi_id).toBe('0xoracle');
    expect(deploy.package_id).toBe('0xabc');
  });

  it('isDeployed === false for the canonical pending_first_deploy fixture', () => {
    expect(isDeployed(PENDING_FIXTURE)).toBe(false);
  });

  it('isDeployed === false when status is "deployed" but package_id is still PENDING', () => {
    const half: DeployJson = { ...DEPLOYED_FIXTURE, package_id: 'PENDING' };
    expect(isDeployed(half)).toBe(false);
  });

  it('isDeployed === false when package_id is real but status is still pending', () => {
    const half: DeployJson = { ...DEPLOYED_FIXTURE, status: 'pending_first_deploy' };
    expect(isDeployed(half)).toBe(false);
  });

  it('isDeployed === true only when status=="deployed" AND package_id!="PENDING"', () => {
    expect(isDeployed(DEPLOYED_FIXTURE)).toBe(true);
  });

  it('loads the canonical Phase 2 path when no override / env given (current pending fixture)', () => {
    // No overridePath, no DEPLOY_JSON_PATH env → default resolves to
    // .planning/phases/02-vault-move-package-testnet-deploy/TESTNET-DEPLOY.json
    // which CURRENTLY ships with status="pending_first_deploy".
    delete process.env.DEPLOY_JSON_PATH;
    const deploy = loadDeploy();
    expect(deploy.network).toBe('testnet');
    expect(isDeployed(deploy)).toBe(false);
  });

  it('honors DEPLOY_JSON_PATH env when overridePath omitted', async () => {
    const filePath = join(workDir, 'env-deploy.json');
    await fs.writeFile(filePath, JSON.stringify(DEPLOYED_FIXTURE), 'utf-8');
    // env path is resolved relative to repo root by deployInfo, so use absolute
    process.env.DEPLOY_JSON_PATH = filePath;
    try {
      const deploy = loadDeploy();
      expect(deploy.status).toBe('deployed');
    } finally {
      delete process.env.DEPLOY_JSON_PATH;
    }
  });
});
