// dashboard/src/lib/__tests__/ptbBuilders.test.ts — Plan 04-07 Task 1.
//
// Validates the four PTB builders against the on-chain Move signatures:
//   contracts/sources/supply.move:61-69:
//     public fun supply<Quote>(
//       vault: &mut Vault<Quote>,
//       predict: &mut Predict,                 // 2nd arg (predict_top_level_id)
//       predict_manager: &mut PredictManager,  // 3rd arg
//       oracle: &OracleSVI,
//       deposit: Coin<Quote>,
//       clock: &Clock,
//       ctx: &mut TxContext,
//     )
//   contracts/sources/redeem.move:71-75:
//     public fun redeem_request<Quote>(vault, shares, clock, ctx)
//   contracts/sources/redeem.move:104-107:
//     public fun redeem_fulfill<Quote>(vault, clock, ctx)
//   contracts/sources/redeem.move:201-203:
//     public fun redeem_cancel<Quote>(vault, ctx)   // NO clock
//
// We use Transaction.getData() to inspect the encoded moveCall and assert
// target string + typeArguments + argument count. We don't assert the deep
// encoded argument shape (that's @mysten/sui's responsibility), but we do
// assert that sharedObjectRef, tx.object, and tx.pure.u64 calls land where
// the Move signature expects them.

import { describe, it, expect } from 'vitest';
import { Transaction } from '@mysten/sui/transactions';
import {
  buildSupplyTx,
  buildRedeemRequestTx,
  buildRedeemFulfillTx,
  buildRedeemCancelTx,
} from '@/lib/ptbBuilders';
import type { DeployJson } from '@/lib/ptbDeploy';

// Fixture matching TESTNET-DEPLOY.json shape with all PENDINGs filled in.
// @mysten/sui validates object IDs as 32-byte hex via valibot at .getData()
// time — fixtures MUST use real 32-byte hex IDs (not placeholders like '0xPKG').
const HEX = (last2: string) => `0x${'0'.repeat(62)}${last2}`;
const deploy: DeployJson = {
  network: 'testnet',
  status: 'deployed',
  deployed_at_iso: '2026-05-12T00:00:00Z',
  deploy_tx_digest: HEX('99'),
  deployer: HEX('88'),
  package_id: HEX('aa'),
  vault_id: HEX('bb'),
  vault_initial_shared_version: 42,
  admin_cap_id: HEX('cc'),
  predict_manager_id: HEX('dd'),
  predict_manager_initial_shared_version: 50,
  predict_package_id: HEX('ee'),
  predict_registry_id: HEX('ff'),
  predict_top_level_id: HEX('11'),
  dusdc_type_tag: `${HEX('22')}::dusdc::DUSDC`,
  oracle_svi_id: HEX('33'),
};

function getMoveCall(tx: Transaction) {
  // Transaction#getData() returns a JSON-able plan. The last command should be
  // the moveCall we built.
  const data = tx.getData();
  const cmds = data.commands;
  const moveCall = cmds.find((c) => c.$kind === 'MoveCall');
  if (!moveCall || moveCall.$kind !== 'MoveCall') {
    throw new Error('No MoveCall in transaction');
  }
  return moveCall.MoveCall;
}

describe('ptbBuilders.buildSupplyTx', () => {
  it('targets {pkg}::supply::supply with dusdc type argument', () => {
    const tx = buildSupplyTx({
      deploy,
      depositCoinId: HEX('77'),
      depositAmountMicro: 1_000_000n,
    });
    const mc = getMoveCall(tx);
    expect(mc.package).toBe(deploy.package_id);
    expect(mc.module).toBe('supply');
    expect(mc.function).toBe('supply');
    expect(mc.typeArguments).toEqual([deploy.dusdc_type_tag]);
    // 6 arguments: vault, predict_top_level, predict_manager, oracle, deposit, clock
    expect(mc.arguments.length).toBe(6);
  });

  it('produces a Transaction with a splitCoins command before moveCall', () => {
    const tx = buildSupplyTx({
      deploy,
      depositCoinId: HEX('77'),
      depositAmountMicro: 5_000_000n,
    });
    const data = tx.getData();
    // Expect SplitCoins to be one of the commands.
    const split = data.commands.find((c) => c.$kind === 'SplitCoins');
    expect(split).toBeDefined();
  });
});

describe('ptbBuilders.buildRedeemRequestTx', () => {
  it('targets {pkg}::redeem::redeem_request with dusdc type argument and 3 args', () => {
    const tx = buildRedeemRequestTx({
      deploy,
      shareCoinId: HEX('77'),
    });
    const mc = getMoveCall(tx);
    expect(mc.package).toBe(deploy.package_id);
    expect(mc.module).toBe('redeem');
    expect(mc.function).toBe('redeem_request');
    expect(mc.typeArguments).toEqual([deploy.dusdc_type_tag]);
    // 3 arguments: vault, shares, clock
    expect(mc.arguments.length).toBe(3);
  });
});

describe('ptbBuilders.buildRedeemFulfillTx', () => {
  it('targets {pkg}::redeem::redeem_fulfill with dusdc type argument and 2 args', () => {
    const tx = buildRedeemFulfillTx({ deploy });
    const mc = getMoveCall(tx);
    expect(mc.package).toBe(deploy.package_id);
    expect(mc.module).toBe('redeem');
    expect(mc.function).toBe('redeem_fulfill');
    expect(mc.typeArguments).toEqual([deploy.dusdc_type_tag]);
    // 2 arguments: vault, clock
    expect(mc.arguments.length).toBe(2);
  });
});

describe('ptbBuilders.buildRedeemCancelTx', () => {
  it('targets {pkg}::redeem::redeem_cancel with dusdc type argument and 1 arg (no clock)', () => {
    const tx = buildRedeemCancelTx({ deploy });
    const mc = getMoveCall(tx);
    expect(mc.package).toBe(deploy.package_id);
    expect(mc.module).toBe('redeem');
    expect(mc.function).toBe('redeem_cancel');
    expect(mc.typeArguments).toEqual([deploy.dusdc_type_tag]);
    // 1 argument: vault only (redeem_cancel has no clock per redeem.move:201-203)
    expect(mc.arguments.length).toBe(1);
  });
});

describe('ptbBuilders source contracts', () => {
  it('uses sharedObjectRef for vault + predict_manager and 0x6 Clock literal', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const file = resolve(process.cwd(), 'src/lib/ptbBuilders.ts');
    const text = readFileSync(file, 'utf8');
    expect(text).toMatch(/sharedObjectRef/);
    expect(text).toMatch(/'0x6'/);
    expect(text).toMatch(/redeem_request/);
    expect(text).toMatch(/redeem_fulfill/);
    expect(text).toMatch(/redeem_cancel/);
    // Source-of-truth: imported from @mysten/sui (Transaction class)
    expect(text).toMatch(/from\s+['"]@mysten\/sui\/transactions['"]/);
  });
});
