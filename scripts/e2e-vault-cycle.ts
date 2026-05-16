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

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Transaction } from '@mysten/sui/transactions';
// @mysten/sui 2.16.0 moved SuiClient -> SuiJsonRpcClient under /jsonRpc;
// getFullnodeUrl was renamed to getJsonRpcFullnodeUrl. Re-alias both names
// so the rest of this file reads identically to the pre-2.16.0 shape.
// Matches scripts/testnet-smoke-test.ts and scripts/two-protocol-ptb-demo.ts.
import {
    SuiJsonRpcClient as SuiClient,
    getJsonRpcFullnodeUrl as getFullnodeUrl,
} from '@mysten/sui/jsonRpc';
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

// ============================================================
// Action-trace JSON capture (Plan 03-06 / BACK-04 / BACK-05).
//
// Per CONTEXT.md D-15/D-16: the trace is captured from a LIVE testnet
// run of this cycle, then consumed by backtest/src/deepvault/replay.py
// for 1-wei Move<->Python parity verification.
//
// Per WAVE0-DECISION.md Q5: all u64 fields are serialized as JSON
// STRINGS (BigInt cannot round-trip through JSON.stringify natively;
// strings avoid downstream `BigInt(...)` parsing ambiguity).
// ============================================================

type SnapshotJson = {
    balance: string;
    total_assets: string;
    total_shares: string;
};

type Action = {
    kind: 'supply' | 'hedge_mint' | 'roll' | 'redeem_request' | 'redeem_fulfill';
    tx_digest: string;
    ts_ms: number;
    args: Record<string, string | number>;
    pre: SnapshotJson;
    post: SnapshotJson;
    events: unknown[];
};

type Trace = {
    vault_id: string;
    package_id: string;
    actions: Action[];
};

async function snapshotVault(client: SuiClient, vaultId: string): Promise<SnapshotJson> {
    const obj = await client.getObject({ id: vaultId, options: { showContent: true } });
    const content = obj.data?.content;
    // Move object content is { dataType: 'moveObject', fields: {...} }.
    const fields =
        content && content.dataType === 'moveObject'
            ? ((content.fields as Record<string, unknown>) ?? {})
            : {};
    return {
        balance: String(fields.balance ?? '0'),
        total_assets: String(fields.total_assets ?? '0'),
        total_shares: String(fields.total_shares_supply ?? '0'),
    };
}

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

    // SuiJsonRpcClient (aliased as SuiClient above) requires `network` alongside `url`
    // in @mysten/sui 2.16.0 — see SuiJsonRpcClientOptions definition.
    const client = new SuiClient({
        url: getFullnodeUrl('testnet'),
        network: 'testnet',
    });
    const keypair = Ed25519Keypair.fromSecretKey(privateKey);
    const signerAddress = keypair.getPublicKey().toSuiAddress();
    console.log(`==> signer: ${signerAddress}`);

    // Action-trace accumulator (Plan 03-06). Each signAndExecuteTransaction
    // call below is sandwiched between snapshotVault() calls so trace.actions
    // carries pre+post for every state transition.
    const trace: Trace = {
        vault_id: deploy.vault_id,
        package_id: deploy.package_id,
        actions: [],
    };

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

    const preSupply = await snapshotVault(client, deploy.vault_id);
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
    const postSupply = await snapshotVault(client, deploy.vault_id);
    trace.actions.push({
        kind: 'supply',
        tx_digest: supplyResult.digest,
        ts_ms: Date.now(),
        args: { deposit_quote: SUPPLY_AMOUNT_MICRO.toString() },
        pre: preSupply,
        post: postSupply,
        events: supplyResult.events ?? [],
    });
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

    const preRequest = await snapshotVault(client, deploy.vault_id);
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
    const postRequest = await snapshotVault(client, deploy.vault_id);
    const requestedAt = new Date().toISOString();
    // redeem_request escrows ALL share coins held by the signer into the
    // per-user RequestSlot — we don't surface the exact share-count arg
    // because the on-chain call consumes the whole Coin<SHARE>. The
    // post.total_shares delta captures it for parity replay.
    trace.actions.push({
        kind: 'redeem_request',
        tx_digest: requestResult.digest,
        ts_ms: Date.now(),
        args: { user: signerAddress, share_coin_id: shareCoinId },
        pre: preRequest,
        post: postRequest,
        events: requestResult.events ?? [],
    });
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

    const preFulfill = await snapshotVault(client, deploy.vault_id);
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
    const postFulfill = await snapshotVault(client, deploy.vault_id);
    trace.actions.push({
        kind: 'redeem_fulfill',
        tx_digest: fulfillResult.digest,
        ts_ms: Date.now(),
        args: { user: signerAddress },
        pre: preFulfill,
        post: postFulfill,
        events: fulfillResult.events ?? [],
    });
    console.log('OK: redeem_fulfill succeeded; signer received Coin<DUSDC> payout.');

    // ============================================================
    // 5. Dump captured trace to backtest/traces/cycle-full.json.
    //
    // Path is configurable via TRACE_OUT_PATH so CI can route the
    // artifact to a known upload location. Per Plan 03-06 acceptance,
    // the file lands at backtest/traces/cycle-full.json by default.
    // ============================================================
    const traceOutPath =
        process.env.TRACE_OUT_PATH ??
        resolve(__dirname, '..', 'backtest', 'traces', 'cycle-full.json');
    mkdirSync(dirname(traceOutPath), { recursive: true });
    writeFileSync(traceOutPath, JSON.stringify(trace, null, 2));
    console.log(`==> Trace written to ${traceOutPath} (${trace.actions.length} actions)`);
    console.log('==> e2e-vault-cycle complete.');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
