// dashboard/src/lib/ptbBuilders.ts — Plan 04-07 Task 1.
//
// PTB construction for vault::supply, vault::redeem (request / fulfill / cancel).
// Analog: scripts/e2e-vault-cycle.ts:180-329, scripts/two-protocol-ptb-demo.ts:286-457.
//
// Move signature source-of-truth (verified during Plan 04-07 Task 1):
//   contracts/sources/supply.move:61-69:
//     public fun supply<Quote>(
//       vault: &mut Vault<Quote>,
//       predict: &mut Predict,                  // predict_top_level
//       predict_manager: &mut PredictManager,
//       oracle: &OracleSVI,
//       deposit: Coin<Quote>,
//       clock: &Clock,
//       ctx: &mut TxContext,
//     )
//   contracts/sources/redeem.move:71-75:
//     public fun redeem_request<Quote>(vault, shares: Coin<SHARE>, clock, ctx)
//   contracts/sources/redeem.move:104-107:
//     public fun redeem_fulfill<Quote>(vault, clock, ctx)
//   contracts/sources/redeem.move:201-203:
//     public fun redeem_cancel<Quote>(vault, ctx)
//       NOTE: redeem_cancel does NOT take a Clock argument (unlike the other
//             three) — cancel can fire any time per D-04 from Phase 2.
//
// Shared-object-ref discipline (PATTERNS.md):
//   - vault + predict_manager are SHARED objects → tx.sharedObjectRef with
//     `mutable: true` and the `initialSharedVersion` from TESTNET-DEPLOY.json
//   - predict_top_level + oracle_svi are passed via tx.object (their shared
//     status is encoded inside the Predict package object metadata; the SDK
//     looks up `initialSharedVersion` for them — matches the e2e analog)
//   - Clock `0x6` uses tx.object('0x6') — sui-framework handles it implicitly

import { Transaction } from '@mysten/sui/transactions';
import type { DeployJson } from './ptbDeploy';

/**
 * Build a PTB that calls `vault::supply::supply<DUSDC>`. The caller must
 * supply a Coin<DUSDC> object id with at least `depositAmountMicro` balance;
 * the builder splits exactly `depositAmountMicro` off the source coin to feed
 * the supply call. Aborts whole tx if Predict's 30s staleness gate fires or
 * the oracle ask is out of bounds — atomic per supply.move:56-59.
 */
export function buildSupplyTx(args: {
  deploy: DeployJson;
  /** Pre-existing Coin<DUSDC> objectId owned by the sender. */
  depositCoinId: string;
  /** Amount in DUSDC micro-units (6 decimals). */
  depositAmountMicro: bigint;
}): Transaction {
  const tx = new Transaction();
  const [deposit] = tx.splitCoins(tx.object(args.depositCoinId), [
    tx.pure.u64(args.depositAmountMicro),
  ]);
  // Arg order matches contracts/sources/supply.move:61-69 (verified at
  // implementation time): vault, predict (top_level), predict_manager,
  // oracle, deposit, clock.
  tx.moveCall({
    target: `${args.deploy.package_id}::supply::supply`,
    typeArguments: [args.deploy.dusdc_type_tag],
    arguments: [
      tx.sharedObjectRef({
        objectId: args.deploy.vault_id,
        mutable: true,
        initialSharedVersion: args.deploy.vault_initial_shared_version,
      }),
      tx.object(args.deploy.predict_top_level_id),
      tx.sharedObjectRef({
        objectId: args.deploy.predict_manager_id,
        mutable: true,
        initialSharedVersion: args.deploy.predict_manager_initial_shared_version,
      }),
      tx.object(args.deploy.oracle_svi_id ?? ''),
      deposit,
      tx.object('0x6'),
    ],
  });
  return tx;
}

/**
 * Build a PTB that calls `vault::redeem::redeem_request<DUSDC>`. Escrows the
 * caller's Coin<SHARE> into a per-user RequestSlot and starts the 1-hour
 * cooldown timer (redeem.move:71-96). The caller passes a Coin<SHARE>
 * object id — the entire coin balance is moved into the slot.
 */
export function buildRedeemRequestTx(args: {
  deploy: DeployJson;
  /** Existing Coin<SHARE> objectId owned by sender. */
  shareCoinId: string;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${args.deploy.package_id}::redeem::redeem_request`,
    typeArguments: [args.deploy.dusdc_type_tag],
    arguments: [
      tx.sharedObjectRef({
        objectId: args.deploy.vault_id,
        mutable: true,
        initialSharedVersion: args.deploy.vault_initial_shared_version,
      }),
      tx.object(args.shareCoinId),
      tx.object('0x6'),
    ],
  });
  return tx;
}

/**
 * Build a PTB that calls `vault::redeem::redeem_fulfill<DUSDC>`. Drains the
 * caller's RequestSlot subject to bucket + liquidity constraints (redeem.move
 * :104-197). Must be called at least COOLDOWN_MS (1 hour) after the matching
 * redeem_request — aborts with ECooldownNotMet otherwise.
 */
export function buildRedeemFulfillTx(args: { deploy: DeployJson }): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${args.deploy.package_id}::redeem::redeem_fulfill`,
    typeArguments: [args.deploy.dusdc_type_tag],
    arguments: [
      tx.sharedObjectRef({
        objectId: args.deploy.vault_id,
        mutable: true,
        initialSharedVersion: args.deploy.vault_initial_shared_version,
      }),
      tx.object('0x6'),
    ],
  });
  return tx;
}

/**
 * Build a PTB that calls `vault::redeem::redeem_cancel<DUSDC>`. Returns the
 * escrowed Coin<SHARE> to the caller's wallet and removes the RequestSlot
 * (redeem.move:201-220). NO clock argument — cancel works any time per D-04.
 */
export function buildRedeemCancelTx(args: { deploy: DeployJson }): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${args.deploy.package_id}::redeem::redeem_cancel`,
    typeArguments: [args.deploy.dusdc_type_tag],
    arguments: [
      tx.sharedObjectRef({
        objectId: args.deploy.vault_id,
        mutable: true,
        initialSharedVersion: args.deploy.vault_initial_shared_version,
      }),
    ],
  });
  return tx;
}
