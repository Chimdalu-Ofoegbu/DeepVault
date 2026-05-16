// scripts/mainnet-smoke-test.ts
//
// Mainnet $50-equivalent USDsui smoke test — the TS PTB driver that
// scripts/mainnet-smoke-test.sh invokes after preflight + deploy. Forked
// from scripts/testnet-smoke-test.ts (Plan 05-03, 522 LOC) with mainnet
// divergences listed inline.
//
// Decision lineage:
//   - DEPLOY-02 : Mainnet smoke test (TS driver) written; execution
//                 deferred to post-submission per Phase 5 reshape.
//   - DEPLOY-03 : Validates mainnet vault works end-to-end with the
//                 USDsui quote asset.
//   - D-05      : write-but-don't-execute. This driver is committed and
//                 intentionally NOT invoked at plan-execute time.
//
// References (carried from testnet variant — same shape on mainnet):
//   - 05-CONTEXT.md D-02 (staged checkpoints)
//   - 05-CONTEXT.md D-03 (dual ±10 bps verification — BOTH framings must pass)
//   - 05-CONTEXT.md D-05 (write-but-don't-execute discipline)
//   - 05-RESEARCH.md §"Smoke Test Verification Mechanics" (NAV math, dual gate formula)
//
// The 7 staged checkpoints (each emits a `[CHECKPOINT PASS]` line at runtime):
//   1. [CHECKPOINT PASS] pre-deposit snapshot          — capture navPre
//   2. [CHECKPOINT PASS] supply tx                     — atomic deposit + hedge mint
//   3. [CHECKPOINT PASS] events Supplied+HedgeMinted   — assert both Move events; capture hedge cost
//   4. [CHECKPOINT PASS] redeem_request                — assert RedeemRequested; capture requestTimestampMs
//   5. [CHECKPOINT PASS] cooldown wait                 — wait REDEMPTION_COOLDOWN_MS + 5s slack
//   6. [CHECKPOINT PASS] redeem_fulfill                — assert RedeemFulfilled; capture received Coin<USDsui>
//   7. [CHECKPOINT PASS] dual ±10 bps gate             — Gate A (per-depositor) AND Gate B (vault NAV drift)
//
// Inputs (env vars):
//   - SUI_PRIVATE_KEY   ephemeral mainnet keypair
//   - ORACLE_SVI_ID     BTC-USD OracleSVI shared object id on mainnet
//
// Outputs:
//   stdout — 7 [CHECKPOINT PASS] lines + final dual-gate verdict with
//            actual ratio_bps and nav_delta_bps numeric values.
//   exit 0 on green (both gates PASS), exit 1 on any FAIL.
//
// Mainnet divergences vs scripts/testnet-smoke-test.ts:
//   1. getFullnodeUrl('mainnet') / network: 'mainnet'
//   2. Reads .planning/phases/05-testnet-demo-hardening/MAINNET-DEPLOY.json
//      (NOT the Phase 2 testnet deploy artifact)
//   3. DeployJson.quote_type_tag is the canonical type field (mainnet
//      USDsui). dusdc_type_tag is retained as alias (Phase 4 dashboard
//      back-compat); driver reads quote_type_tag.
//   4. SUPPLY_AMOUNT_MICRO = 50_000_000n (same $50-equivalent size as
//      testnet; both targets identical per CONTEXT.md interfaces).
//   5. Active-env enforcement note: bash wrapper asserts
//      SUI_CONFIG_DIR=~/.sui/sui_config_mainnet before invoking this
//      driver. This file itself only reads RPC URL (mainnet fullnode).
//
// All other math identical to testnet variant: same dual ±10 bps gate
// formula, same NAV-per-share helper, same event-verification idiom,
// same 3-attempt redeem_fulfill retry, same cooldown wait via codegen
// constant. No hardcoded one-hour cooldown literal anywhere in this
// file — all wait math derives from STRATEGY_CONSTANTS.REDEMPTION_COOLDOWN_MS.
//
// Per CLAUDE.md note 5: never `@mysten/sui.js` — canonical SDK is
// `@mysten/sui` 2.16.x. Per Plan 05-03 finding: @mysten/sui 2.16.0 moved
// SuiClient -> SuiJsonRpcClient under /jsonRpc; getFullnodeUrl was
// renamed to getJsonRpcFullnodeUrl. Re-alias both names so the rest of
// this file reads like the analog testnet-smoke-test.ts.

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Transaction } from '@mysten/sui/transactions';
import {
    SuiJsonRpcClient as SuiClient,
    getJsonRpcFullnodeUrl as getFullnodeUrl,
} from '@mysten/sui/jsonRpc';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { STRATEGY_CONSTANTS } from '../dashboard/src/lib/strategy_constants';

// ============================================================
// Types
// ============================================================
// DeployJson mirrors the mainnet schema written by scripts/mainnet-deploy.sh.
// quote_type_tag is canonical; dusdc_type_tag is an alias both populated
// with the same value (mainnet USDsui type tag) for back-compat with
// dashboard code that reads the Phase 2 testnet deploy artifact by
// field name.
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
    quote_type_tag: string;  // canonical mainnet field
    dusdc_type_tag: string;  // alias (back-compat) — same value as quote_type_tag
    oracle_svi_id: string;
};

type SnapshotJson = {
    balance: string;
    total_assets: string;
    total_shares: string;
};

// ============================================================
// Constants
//
// Demo amount locked at $50 USDsui (6 decimals) — same size as testnet
// per 05-CONTEXT.md `<interfaces>` (both targets identical).
// Cooldown comes from Plan 05-04 codegen output — NO hardcoded literal.
// Allocation, NAV-tolerance, and per-depositor slack are all sourced
// from STRATEGY_CONSTANTS / D-03 — single source of truth.
// ============================================================
const SUPPLY_AMOUNT_MICRO = 50_000_000n; // 50 USDsui at 6 decimals
const COOLDOWN_WAIT_MS = Number(STRATEGY_CONSTANTS.REDEMPTION_COOLDOWN_MS) + 5000; // +5s slack (D-CD)
const ALLOC_BPS = BigInt(STRATEGY_CONSTANTS.ALLOCATION_BPS); // 1000n = 10%
const NAV_TOLERANCE_BPS = 10n; // D-03 ±10 bps (Gate B)
const PER_DEPOSITOR_SLACK_BPS = 10n; // matches NAV gate (Gate A)

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================
// Helpers — structural parity with scripts/testnet-smoke-test.ts
// ============================================================
function loadDeploy(): DeployJson {
    const repoRoot = resolve(__dirname, '..');
    const deployPath = resolve(
        repoRoot,
        '.planning/phases/05-testnet-demo-hardening/MAINNET-DEPLOY.json',
    );
    return JSON.parse(readFileSync(deployPath, 'utf-8')) as DeployJson;
}

async function snapshotVault(client: SuiClient, vaultId: string): Promise<SnapshotJson> {
    const obj = await client.getObject({ id: vaultId, options: { showContent: true } });
    const content = obj.data?.content;
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

type CoinLike = { balance: string; coinObjectId: string };

async function findDepositCoin(
    client: SuiClient,
    owner: string,
    coinType: string,
    minBalance: bigint,
): Promise<string> {
    const { data: coins } = await client.getCoins({ owner, coinType });
    const coin = (coins as CoinLike[]).find((c) => BigInt(c.balance) >= minBalance);
    if (!coin) {
        throw new Error(
            `No Coin<${coinType}> with balance >= ${minBalance} found for ${owner}. ` +
                `Fund the deployer via Cetus swap per docs/MAINNET-READINESS.md.`,
        );
    }
    return coin.coinObjectId;
}

async function totalCoinBalance(
    client: SuiClient,
    owner: string,
    coinType: string,
): Promise<bigint> {
    const { data: coins } = await client.getCoins({ owner, coinType });
    return (coins as CoinLike[]).reduce(
        (acc: bigint, c: CoinLike) => acc + BigInt(c.balance),
        0n,
    );
}

// NAV-per-share helper (RESEARCH §"NAV-per-share read mechanics" Plan A).
// Returns (total_assets * 1e9) / total_shares at NAV_SCALE = 1e9.
function navPerShareScaled1e9(snap: SnapshotJson): bigint {
    const ta = BigInt(snap.total_assets);
    const ts = BigInt(snap.total_shares);
    if (ts === 0n) return 0n;
    return (ta * 1_000_000_000n) / ts;
}

// Checkpoint logging helper. Each `[CHECKPOINT PASS]` line is the
// load-bearing signal the bash orchestrator + post-submission operator
// look for.
function checkpoint(name: string, detail = ''): void {
    console.log(`[CHECKPOINT PASS] ${name}${detail ? ' — ' + detail : ''}`);
}

// Parse a u64 field out of a Move event (events are returned as
// Record<string, unknown> via the SDK). Returns 0n on missing/invalid.
function parseU64Field(
    event: { parsedJson?: unknown } | undefined,
    fieldName: string,
): bigint {
    if (!event || !event.parsedJson) return 0n;
    const fields = event.parsedJson as Record<string, unknown>;
    const raw = fields[fieldName];
    if (raw === undefined || raw === null) return 0n;
    try {
        return BigInt(String(raw));
    } catch {
        return 0n;
    }
}

// ============================================================
// Main flow — 7 staged checkpoints (structural parity with testnet)
// ============================================================
async function main(): Promise<void> {
    const deploy = loadDeploy();
    if (deploy.status !== 'deployed') {
        throw new Error(
            `MAINNET-DEPLOY.json status is "${deploy.status}"; expected "deployed". ` +
                'Run scripts/mainnet-deploy.sh first (post-submission, after Predict mainnet ships).',
        );
    }
    if (deploy.network !== 'mainnet') {
        throw new Error(
            `MAINNET-DEPLOY.json network is "${deploy.network}"; expected "mainnet". ` +
                'File schema mismatch — refusing to run.',
        );
    }

    const privateKey = process.env.SUI_PRIVATE_KEY;
    if (!privateKey) {
        throw new Error('SUI_PRIVATE_KEY env var required (mainnet keypair)');
    }
    const oracleSviId = process.env.ORACLE_SVI_ID;
    if (!oracleSviId) {
        throw new Error('ORACLE_SVI_ID env var required (BTC-USD OracleSVI shared object id on mainnet)');
    }

    // MAINNET DIVERGENCE: getFullnodeUrl('mainnet') + network: 'mainnet'
    const client = new SuiClient({
        url: getFullnodeUrl('mainnet'),
        network: 'mainnet',
    });
    const keypair = Ed25519Keypair.fromSecretKey(privateKey);
    const signerAddress = keypair.getPublicKey().toSuiAddress();
    // SUI_PRIVATE_KEY is NEVER logged — only the derived address.
    console.log(`==> signer: ${signerAddress}`);
    console.log(`==> vault:  ${deploy.vault_id}`);

    // Capture pre-supply USDsui balance so received_quote at the end is
    // measured as a delta (more robust than relying on a single coin
    // object surviving the split). MAINNET DIVERGENCE: reads
    // deploy.quote_type_tag instead of deploy.dusdc_type_tag.
    const preSupplyQuoteBalance = await totalCoinBalance(
        client,
        signerAddress,
        deploy.quote_type_tag,
    );

    // ========================================================
    // CHECKPOINT 1: pre-deposit snapshot
    // ========================================================
    const preSnap = await snapshotVault(client, deploy.vault_id);
    const navPre = navPerShareScaled1e9(preSnap);
    checkpoint(
        'pre-deposit snapshot',
        `total_assets=${preSnap.total_assets} total_shares=${preSnap.total_shares} navPre=${navPre}`,
    );

    // ========================================================
    // CHECKPOINT 2: supply tx (atomic deposit + hedge mint)
    //
    // PTB shape verbatim from scripts/testnet-smoke-test.ts — vault::supply
    // takes (vault, predict_top_level, predict_manager, oracle_svi,
    // deposit_coin, clock). Atomically:
    //   - records the deposit into vault.balance + vault.total_assets
    //   - mints SHARE to signer via TreasuryCap
    //   - splits allocation_bps off the deposit and calls predict::mint
    //     to acquire the binary hedge position
    // MAINNET DIVERGENCE: typeArguments uses quote_type_tag (canonical).
    // ========================================================
    const depositCoinId = await findDepositCoin(
        client,
        signerAddress,
        deploy.quote_type_tag,
        SUPPLY_AMOUNT_MICRO,
    );

    const supplyTx = new Transaction();
    const [depositCoin] = supplyTx.splitCoins(supplyTx.object(depositCoinId), [
        supplyTx.pure.u64(SUPPLY_AMOUNT_MICRO),
    ]);
    supplyTx.moveCall({
        target: `${deploy.package_id}::supply::supply`,
        typeArguments: [deploy.quote_type_tag],
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
        throw new Error(`supply tx failed: ${JSON.stringify(supplyResult.effects?.status)}`);
    }
    checkpoint('supply tx', supplyResult.digest);

    // ========================================================
    // CHECKPOINT 3: events Supplied + HedgeMinted
    //
    // Per RESEARCH §"Hedge registry / exposure read (Gate 2)" the
    // HedgeMinted event carries cost_basis_quote — the realized hedge
    // cost in quote micro-units. No Table walk needed.
    // ========================================================
    const suppliedEvent = supplyResult.events?.find(
        (e: { type: string }) => e.type.endsWith('::supply::Supplied'),
    );
    const hedgeMintedEvent = supplyResult.events?.find(
        (e: { type: string }) => e.type.endsWith('::rebalance::HedgeMinted'),
    );
    if (!suppliedEvent) {
        throw new Error(
            'Supplied event missing from supply tx — vault::supply did not emit ::supply::Supplied',
        );
    }
    if (!hedgeMintedEvent) {
        throw new Error(
            'HedgeMinted event missing from supply tx — atomic hedge mint may have been skipped',
        );
    }
    const costBasisQuote = parseU64Field(hedgeMintedEvent, 'cost_basis_quote');
    checkpoint(
        'events Supplied+HedgeMinted',
        `hedge_cost=${costBasisQuote} micro-USDsui`,
    );

    // ========================================================
    // CHECKPOINT 4: redeem_request
    //
    // Locate the Coin<SHARE> minted by supply and escrow it into the
    // per-user RequestSlot via redeem::redeem_request.
    // ========================================================
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
        typeArguments: [deploy.quote_type_tag],
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
            `redeem_request tx failed: ${JSON.stringify(requestResult.effects?.status)}`,
        );
    }
    const requestedEvent = requestResult.events?.find(
        (e: { type: string }) => e.type.endsWith('::redeem::RedeemRequested'),
    );
    if (!requestedEvent) {
        throw new Error('RedeemRequested event missing from redeem_request tx');
    }
    const requestTimestampMs = Date.now();
    checkpoint('redeem_request', `${requestResult.digest} requested_at=${requestTimestampMs}`);

    // ========================================================
    // CHECKPOINT 5: wait COOLDOWN + 5s slack
    //
    // Real wall-clock wait. Progress logged every 10 minutes. The wait
    // is a pure setTimeout — no RPC traffic for the duration.
    // ========================================================
    console.log(
        `==> Waiting ${Math.round(COOLDOWN_WAIT_MS / 1000)}s for redemption cooldown ` +
            `(REDEMPTION_COOLDOWN_MS=${STRATEGY_CONSTANTS.REDEMPTION_COOLDOWN_MS} + 5s slack)...`,
    );
    const tenMinMs = 10 * 60 * 1000;
    const progressInterval = setInterval(() => {
        const elapsedMs = Date.now() - requestTimestampMs;
        const remainingMs = Math.max(0, COOLDOWN_WAIT_MS - elapsedMs);
        console.log(
            `    ...elapsed ${Math.round(elapsedMs / 1000)}s, remaining ${Math.round(remainingMs / 1000)}s`,
        );
    }, tenMinMs);
    await new Promise<void>((r) => setTimeout(r, COOLDOWN_WAIT_MS));
    clearInterval(progressInterval);
    checkpoint('cooldown wait', `${Math.round(COOLDOWN_WAIT_MS / 1000)}s elapsed`);

    // ========================================================
    // CHECKPOINT 6: redeem_fulfill
    //
    // PTB shape verbatim from testnet variant. After execution, the user
    // has a fresh Coin<USDsui> minted by vault::redeem::redeem_fulfill —
    // measured by getCoins delta. Retry on transient RPC errors
    // (3 attempts max, 5s sleep between).
    // ========================================================
    const fulfillTx = new Transaction();
    fulfillTx.moveCall({
        target: `${deploy.package_id}::redeem::redeem_fulfill`,
        typeArguments: [deploy.quote_type_tag],
        arguments: [
            fulfillTx.sharedObjectRef({
                objectId: deploy.vault_id,
                mutable: true,
                initialSharedVersion: deploy.vault_initial_shared_version,
            }),
            fulfillTx.object('0x6'), // Clock
        ],
    });

    let fulfillResult;
    let lastErr: unknown;
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            fulfillResult = await client.signAndExecuteTransaction({
                transaction: fulfillTx,
                signer: keypair,
                options: { showEffects: true, showEvents: true },
            });
            break;
        } catch (err) {
            lastErr = err;
            console.log(`    redeem_fulfill attempt ${attempt}/3 failed; retrying in 5s...`);
            await new Promise<void>((r) => setTimeout(r, 5000));
        }
    }
    if (!fulfillResult) {
        throw new Error(`redeem_fulfill failed after 3 attempts: ${String(lastErr)}`);
    }
    if (fulfillResult.effects?.status?.status !== 'success') {
        throw new Error(
            `redeem_fulfill tx failed: ${JSON.stringify(fulfillResult.effects?.status)}`,
        );
    }
    const fulfilledEvent = fulfillResult.events?.find(
        (e: { type: string }) => e.type.endsWith('::redeem::RedeemFulfilled'),
    );
    if (!fulfilledEvent) {
        throw new Error('RedeemFulfilled event missing from redeem_fulfill tx');
    }

    // Two paths to received_quote — prefer the event field
    // (RedeemFulfilled.quote_paid) since it's a single RPC's-worth of
    // data; cross-check against the getCoins delta to catch silent
    // accounting drift.
    const quotePaidFromEvent = parseU64Field(fulfilledEvent, 'quote_paid');
    const postFulfillQuoteBalance = await totalCoinBalance(
        client,
        signerAddress,
        deploy.quote_type_tag,
    );
    // Net delta accounts for the SUPPLY_AMOUNT_MICRO that was spent
    // earlier: receivedQuote = postBalance - (preBalance - depositAmount).
    const receivedQuote = postFulfillQuoteBalance - (preSupplyQuoteBalance - SUPPLY_AMOUNT_MICRO);
    if (quotePaidFromEvent !== receivedQuote) {
        console.log(
            `    NOTE: quote_paid event=${quotePaidFromEvent} != getCoins delta=${receivedQuote} ` +
                `(may reflect gas-coin movement or a partial fulfill; using event value for gate)`,
        );
    }
    const receivedForGate = quotePaidFromEvent > 0n ? quotePaidFromEvent : receivedQuote;
    checkpoint(
        'redeem_fulfill',
        `${fulfillResult.digest} received=${receivedForGate} micro-USDsui`,
    );

    // ========================================================
    // CHECKPOINT 7: final snapshot + dual ±10 bps verification
    //
    // Gate A — per-depositor return ratio:
    //   minReceived = (deposit * (10_000 - allocBps - slackBps)) / 10_000
    //   For 50 USDsui + 1000 bps alloc + 10 bps slack:
    //     minReceived = 50_000_000 * (10000 - 1000 - 10) / 10000 = 44_950_000 micro-USDsui
    //
    // Gate B — vault NAV-per-share drift:
    //   navDeltaBps = abs(navPost - navPre) * 10_000 / navPre <= NAV_TOLERANCE_BPS
    //
    // BOTH gates must PASS for green run.
    // ========================================================
    const postSnap = await snapshotVault(client, deploy.vault_id);
    const navPost = navPerShareScaled1e9(postSnap);

    // Gate A: per-depositor return ratio
    const minReceived = (SUPPLY_AMOUNT_MICRO * (10_000n - ALLOC_BPS - PER_DEPOSITOR_SLACK_BPS)) / 10_000n;
    if (receivedForGate < minReceived) {
        throw new Error(
            `Gate A FAIL: per-depositor received ${receivedForGate} < min ${minReceived} ` +
                `(deposited ${SUPPLY_AMOUNT_MICRO}, alloc=${ALLOC_BPS}bps, slack=${PER_DEPOSITOR_SLACK_BPS}bps)`,
        );
    }
    const ratioBps = (receivedForGate * 10_000n) / SUPPLY_AMOUNT_MICRO;

    // Gate B: vault NAV-per-share drift
    const navDeltaScaledNumer =
        (navPost > navPre ? navPost - navPre : navPre - navPost) * 10_000n;
    const navDeltaBps = navPre === 0n ? 0n : navDeltaScaledNumer / navPre;
    if (navDeltaBps > NAV_TOLERANCE_BPS) {
        throw new Error(`Gate B FAIL: NAV-per-share moved ${navDeltaBps} bps > ${NAV_TOLERANCE_BPS} bps`);
    }

    const gateAMin = 10_000n - ALLOC_BPS - PER_DEPOSITOR_SLACK_BPS;
    console.log(
        `[CHECKPOINT PASS] dual ±10 bps gate: ` +
            `ratio_bps=${ratioBps} (Gate A min=${gateAMin}, OK) | ` +
            `nav_delta_bps=${navDeltaBps} (Gate B max=${NAV_TOLERANCE_BPS}, OK)`,
    );
    console.log('==> mainnet-smoke-test: GREEN.');
}

main().catch((err) => {
    console.error('[CHECKPOINT FAIL]', err);
    process.exit(1);
});
