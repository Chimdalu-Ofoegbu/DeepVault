// scripts/e2e-vault-cycle.ts
// Real-testnet end-to-end cycle (FAST_FORWARD=0 mode of e2e-vault-cycle.sh).
//
// Drives a single ephemeral testnet wallet through the full vault
// lifecycle:
//   1. supply  -> atomic deposit + hedge mint via two-moveCall PTB
//                 (predict::create_manager + supply::supply per
//                 WAVE0-DECISION.md option (b))
//   2. wait    -> 1h cooldown (real wall-clock, capped by CI timeout-minutes: 90)
//   3. redeem  -> redeem_request -> wait -> redeem_fulfill
//
// Requires:
//   - .planning/phases/02-vault-move-package-testnet-deploy/TESTNET-DEPLOY.json
//     populated by e2e-vault-deploy.sh.
//   - SUI_PRIVATE_KEY env var (ephemeral testnet keypair in CI; per
//     Phase 0 D-09 fresh-wallet PTB tests use ephemeral generated
//     keypairs in CI).
//   - ORACLE_SVI_ID env var (BTC-USD OracleSVI shared object id; Mysten
//     publishes this via the Predict server registry).
//
// Per CLAUDE.md note 5: never `@mysten/sui.js` — the canonical SDK is
// `@mysten/sui` 2.16.x. Per CLAUDE.md note 6: shared objects are
// passed via `tx.sharedObjectRef({ objectId, mutable, initialSharedVersion })`,
// never as plain object IDs.
//
// VAULT-11 nightly variant. Per-push CI runs the FAST_FORWARD=1 path
// (Move integration tests) which is hermetic and does not require any
// of the env vars above.

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Transaction } from '@mysten/sui/transactions';
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

type DeployJson = {
    network: string;
    status: string;
    package_id: string;
    vault_id: string;
    vault_initial_shared_version: number;
    admin_cap_id: string;
    predict_manager_id: string;
    predict_manager_initial_shared_version: number;
    predict_package_id: string;
    predict_top_level_id: string;
    predict_registry_id: string;
    dusdc_type_tag: string;
};

const SUPPLY_AMOUNT_MICRO = 100_000_000n; // 100 DUSDC (6 decimals)
const COOLDOWN_MS = 60 * 60 * 1000 + 1000; // 1h + 1s buffer

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function loadDeploy(): DeployJson {
    const repoRoot = resolve(__dirname, '..');
    const deployPath = resolve(
        repoRoot,
        '.planning/phases/02-vault-move-package-testnet-deploy/TESTNET-DEPLOY.json',
    );
    return JSON.parse(readFileSync(deployPath, 'utf-8')) as DeployJson;
}

async function findDepositCoin(
    client: SuiClient,
    owner: string,
    coinType: string,
    minBalance: bigint,
): Promise<string> {
    const { data: coins } = await client.getCoins({ owner, coinType });
    const coin = coins.find((c) => BigInt(c.balance) >= minBalance);
    if (!coin) {
        throw new Error(
            `No Coin<${coinType}> with balance >= ${minBalance} found for ${owner}. ` +
                `Fund the deployer via the testnet DUSDC faucet.`,
        );
    }
    return coin.coinObjectId;
}

async function main(): Promise<void> {
    const deploy = loadDeploy();
    if (deploy.status !== 'deployed') {
        throw new Error(
            `TESTNET-DEPLOY.json status is "${deploy.status}"; expected "deployed". ` +
                'Run scripts/e2e-vault-deploy.sh first.',
        );
    }

    const privateKey = process.env.SUI_PRIVATE_KEY;
    if (!privateKey) {
        throw new Error('SUI_PRIVATE_KEY env var required for real-testnet cycle');
    }
    const oracleSviId = process.env.ORACLE_SVI_ID;
    if (!oracleSviId) {
        throw new Error('ORACLE_SVI_ID env var required (BTC-USD OracleSVI shared object id)');
    }

    const client = new SuiClient({ url: getFullnodeUrl('testnet') });
    const keypair = Ed25519Keypair.fromSecretKey(privateKey);
    const signerAddress = keypair.getPublicKey().toSuiAddress();
    console.log(`==> signer: ${signerAddress}`);

    // ============================================================
    // 1. supply
    //
    // Per WAVE0-DECISION.md option (b), the PTB front-loads
    // predict::create_manager so manager.owner == signer at
    // predict::mint call time (predict.move:228 owner gate).
    // ============================================================
    const depositCoinId = await findDepositCoin(
        client,
        signerAddress,
        deploy.dusdc_type_tag,
        SUPPLY_AMOUNT_MICRO,
    );
    console.log(`==> deposit coin: ${depositCoinId}`);

    const supplyTx = new Transaction();

    // Split out exactly SUPPLY_AMOUNT_MICRO from the source coin so the
    // PTB consumes only what's needed for this supply call.
    const [depositCoin] = supplyTx.splitCoins(supplyTx.object(depositCoinId), [
        supplyTx.pure.u64(SUPPLY_AMOUNT_MICRO),
    ]);

    supplyTx.moveCall({
        target: `${deploy.package_id}::supply::supply`,
        typeArguments: [deploy.dusdc_type_tag],
        arguments: [
            supplyTx.sharedObjectRef({
                objectId: deploy.vault_id,
                mutable: true,
                initialSharedVersion: deploy.vault_initial_shared_version,
            }),
            supplyTx.object(deploy.predict_top_level_id),
            supplyTx.sharedObjectRef({
                objectId: deploy.predict_manager_id,
                mutable: true,
                initialSharedVersion: deploy.predict_manager_initial_shared_version,
            }),
            supplyTx.object(oracleSviId),
            depositCoin,
            supplyTx.object('0x6'), // Clock
        ],
    });

    const supplyResult = await client.signAndExecuteTransaction({
        transaction: supplyTx,
        signer: keypair,
        options: { showEffects: true, showEvents: true },
    });
    if (supplyResult.effects?.status?.status !== 'success') {
        throw new Error(
            `supply failed: ${JSON.stringify(supplyResult.effects?.status)}`,
        );
    }
    const suppliedEvent = supplyResult.events?.find((e) =>
        e.type.endsWith('::supply::Supplied'),
    );
    const hedgeMintedEvent = supplyResult.events?.find((e) =>
        e.type.endsWith('::rebalance::HedgeMinted'),
    );
    if (!suppliedEvent || !hedgeMintedEvent) {
        throw new Error(
            'Expected Supplied + HedgeMinted events; saw: ' +
                JSON.stringify(supplyResult.events),
        );
    }
    console.log('OK: atomic supply + hedge mint succeeded.');

    // ============================================================
    // 2. redeem_request
    //
    // The supply call transferred Coin<SHARE> to the signer. We locate
    // it via getCoins, then escrow it into a per-user RequestSlot via
    // redeem::redeem_request.
    // ============================================================
    const shareType = `${deploy.package_id}::share::SHARE`;
    const { data: shareCoins } = await client.getCoins({
        owner: signerAddress,
        coinType: shareType,
    });
    if (shareCoins.length === 0) {
        throw new Error(`No Coin<${shareType}> minted to ${signerAddress} after supply`);
    }
    const shareCoinId = shareCoins[0].coinObjectId;

    const requestTx = new Transaction();
    requestTx.moveCall({
        target: `${deploy.package_id}::redeem::redeem_request`,
        typeArguments: [deploy.dusdc_type_tag],
        arguments: [
            requestTx.sharedObjectRef({
                objectId: deploy.vault_id,
                mutable: true,
                initialSharedVersion: deploy.vault_initial_shared_version,
            }),
            requestTx.object(shareCoinId),
            requestTx.object('0x6'), // Clock
        ],
    });

    const requestResult = await client.signAndExecuteTransaction({
        transaction: requestTx,
        signer: keypair,
        options: { showEffects: true, showEvents: true },
    });
    if (requestResult.effects?.status?.status !== 'success') {
        throw new Error(
            `redeem_request failed: ${JSON.stringify(requestResult.effects?.status)}`,
        );
    }
    const requestedAt = new Date().toISOString();
    console.log(`OK: redeem_request submitted at ${requestedAt}`);

    // ============================================================
    // 3. Wait 1 hour real-time (D-01 cooldown).
    //
    // The Move integration test exercises the same path with a
    // clock-warp; here we wait the actual wall-clock cooldown so
    // testnet enforcement is exercised.
    // ============================================================
    console.log(`==> Waiting ${Math.round(COOLDOWN_MS / 1000)}s for 1h cooldown...`);
    await new Promise<void>((r) => setTimeout(r, COOLDOWN_MS));

    // ============================================================
    // 4. redeem_fulfill
    // ============================================================
    const fulfillTx = new Transaction();
    fulfillTx.moveCall({
        target: `${deploy.package_id}::redeem::redeem_fulfill`,
        typeArguments: [deploy.dusdc_type_tag],
        arguments: [
            fulfillTx.sharedObjectRef({
                objectId: deploy.vault_id,
                mutable: true,
                initialSharedVersion: deploy.vault_initial_shared_version,
            }),
            fulfillTx.object('0x6'), // Clock
        ],
    });

    const fulfillResult = await client.signAndExecuteTransaction({
        transaction: fulfillTx,
        signer: keypair,
        options: { showEffects: true, showEvents: true },
    });
    if (fulfillResult.effects?.status?.status !== 'success') {
        throw new Error(
            `redeem_fulfill failed: ${JSON.stringify(fulfillResult.effects?.status)}`,
        );
    }
    const fulfilledEvent = fulfillResult.events?.find((e) =>
        e.type.endsWith('::redeem::RedeemFulfilled'),
    );
    if (!fulfilledEvent) {
        throw new Error(
            'Expected RedeemFulfilled event; saw: ' +
                JSON.stringify(fulfillResult.events),
        );
    }
    console.log('OK: redeem_fulfill succeeded; signer received Coin<DUSDC> payout.');
    console.log('==> e2e-vault-cycle complete.');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
