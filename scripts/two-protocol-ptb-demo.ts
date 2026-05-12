// scripts/two-protocol-ptb-demo.ts
//
// Phase 3 Track A — TWO-PROTOCOL PTB DEMO (SKELETON, Plan 03-03).
//
// SKELETON ONLY. The complete 5-call PTB body — signing, signAndExecuteTransaction
// invocation, and event extraction — lands in Plan 03-05. This file ships:
//   (1) Type imports + DeployJson augmentation for Margin pool IDs.
//   (2) The 5-call PTB shape STUB — every moveCall target string is present so
//       grep gates and TS imports compile against @mysten/sui 2.16.0 + the SDK
//       pin (@mysten/deepbook-v3@1.3.6 — see WAVE0-DECISION.md "SDK introspection
//       evidence").
//   (3) Deploy-JSON read + graceful-skip dispatch (mirrors scripts/e2e-vault-cycle.ts
//       per Phase 2 Plan 02-09 pattern).
//   (4) The Margin shared-object reference scaffolding (initialSharedVersion +
//       mutability flags lifted from RESEARCH.md Pattern 1).
//
// CANONICAL PTB shape (locked by WAVE0-DECISION.md, replaces CONTEXT.md D-17 literal):
//
//   Step 1.  margin_manager::deposit<BTC, DUSDC, BTC>(...)        — collateral in
//   Step 2.  margin_manager::borrow_quote<BTC, DUSDC>(...)        — borrows DUSDC, auto-deposits
//   Step 3.  borrowed_coin: Coin<DUSDC> = margin_manager::withdraw<BTC, DUSDC, DUSDC>(...)
//                                                                 — BRIDGE: extract borrowed DUSDC
//   Step 4.  vault::supply::supply<DUSDC>(..., borrowed_coin, ...)
//                                                                 — atomic deposit + hedge mint
//   Step 5.  (OPTIONAL) margin_manager::deposit<BTC, DUSDC, SHARE>(...)
//                                                                 — D-18 hot-upgrade; SKIP in v1
//
// Per WAVE0-DECISION.md:
//   - `margin_manager::borrow_quote` returns void (auto-deposits via
//     `self.deposit_int<BaseAsset, QuoteAsset, QuoteAsset>(coin, ctx)` at
//     margin_manager.move:625). The explicit withdraw step is the load-bearing
//     bridge — without it the supply step has no Coin<DUSDC> to consume.
//   - `rebalance::buy_hedge_for_deposit` is public(package); the supply path
//     invokes it internally (supply.move:89-97). We do NOT call rebalance
//     directly from this PTB; atomicity is preserved by Move tx semantics.
//
// Capability discipline (D-19): TradeCap is created inside the MarginManager's
// wrapped BalanceManager and never escapes PTB scope. setupBalanceManagerWithTradeCap()
// returns ONLY the MarginManager object reference — no &mut TradeCap, no Coin<TradeCap>.
//
// Live-testnet gating (CONTEXT.md D-18 + MARGIN-WHITELIST-DECISION.md):
//   - The DUSDC margin pool is UNDETERMINED-FALLBACK-TO-MOCK at the time of this
//     skeleton landing (testnet has DBUSDC, not DUSDC; see
//     MARGIN-WHITELIST-DECISION.md "Crucial caveat").
//   - When deploy.status !== 'deployed' OR Margin pool IDs are absent, this
//     script exits 0 with a workflow warning. Plan 03-05 will integration-test
//     against contracts/tests/mock_margin_pool.move instead.
//
// JSON convention (WAVE0-DECISION.md Q5): u64 fields serialized as strings to
// survive JS Number safe-max (2^53-1). 0x-prefixed lowercase hex for object IDs.

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Transaction } from '@mysten/sui/transactions';
// @mysten/sui@2.16.0 renamed SuiClient → SuiJsonRpcClient and
// getFullnodeUrl → getJsonRpcFullnodeUrl; both live in /jsonRpc subpath.
// Plan 03-05 will update scripts/e2e-vault-cycle.ts to match when it bumps
// to 2.16.0+; this skeleton uses the canonical 2.16.0 surface directly.
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

// SDK pin verified by WAVE0-DECISION.md "SDK introspection evidence":
// @mysten/deepbook-v3@1.3.6 exposes MarginPoolContract + MarginManagerContract +
// testnetMarginPools. We import for type provenance; the actual builder calls
// land in Plan 03-05 (raw tx.moveCall is the safest path regardless).
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- skeleton import for Plan 03-05
import type {} from '@mysten/deepbook-v3';

// ============================================================
// Type definitions
// ============================================================

/** DeployJson augmented with Phase 3 Margin pool fields (filled by
 *  MARGIN-WHITELIST-DECISION.md once the DUSDC pool exists, OR left
 *  undefined while the mock pool fallback path is exercised).
 *
 *  Phase 2 fields mirror scripts/e2e-vault-cycle.ts:37-50 verbatim.
 *  Phase 3 Margin fields are all optional — absence triggers graceful
 *  skip in main(). */
export type DeployJson = {
    // Phase 2 fields (from scripts/e2e-vault-cycle.ts)
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

    // Phase 3 Margin fields — UNDETERMINED at skeleton time;
    // MARGIN-WHITELIST-DECISION.md drives population.
    margin_pkg?: string;
    margin_registry_id?: string;
    margin_registry_initial_shared_version?: number;
    btc_margin_pool_id?: string;
    btc_margin_pool_initial_shared_version?: number;
    dusdc_margin_pool_id?: string;
    dusdc_margin_pool_initial_shared_version?: number;
    btc_oracle_id?: string;
    usdc_oracle_id?: string;
    deepbook_pool_id?: string;
    deepbook_pool_initial_shared_version?: number;
    btc_type_tag?: string;
};

// ============================================================
// Constants
// ============================================================

/** 100 DUSDC at 6 decimals. Mirrors scripts/e2e-vault-cycle.ts SUPPLY_AMOUNT_MICRO. */
export const SUPPLY_AMOUNT_MICRO = 100_000_000n;

/** ~0.002 BTC at 11 decimals (Sui BTC convention per Mysten docs). Reviewed in Plan 03-05. */
export const COLLATERAL_AMOUNT_MICRO = 200_000_000_000n;

/** 100 DUSDC borrow against BTC collateral. Matches SUPPLY_AMOUNT_MICRO so the
 *  borrowed coin maps 1:1 into the supply step. */
export const BORROW_AMOUNT_MICRO = 100_000_000n;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================
// Deploy-JSON loader (mirrors scripts/e2e-vault-cycle.ts:58-65)
// ============================================================

export function loadDeploy(): DeployJson {
    const repoRoot = resolve(__dirname, '..');
    const deployPath = resolve(
        repoRoot,
        '.planning/phases/02-vault-move-package-testnet-deploy/TESTNET-DEPLOY.json',
    );
    return JSON.parse(readFileSync(deployPath, 'utf-8')) as DeployJson;
}

// ============================================================
// PTB step stubs — bodies filled in Plan 03-05
// ============================================================

/** Step 0: Set up MarginManager + BalanceManager + TradeCap. Per D-19, the
 *  TradeCap is created inside the wrapped BalanceManager and never escapes —
 *  this function returns ONLY the MarginManager object ID. Body in Plan 03-05. */
export async function setupBalanceManagerWithTradeCap(
    _client: SuiJsonRpcClient,
    _keypair: Ed25519Keypair,
    _deploy: DeployJson,
): Promise<{ marginManagerId: string }> {
    throw new Error('setupBalanceManagerWithTradeCap: body lands in Plan 03-05');
}

/** Build the 5-call PTB per WAVE0-DECISION.md.
 *
 *  STEP-BY-STEP (skeleton): each moveCall has the target string and shared
 *  object scaffolding present so grep gates pass. The TODO markers indicate
 *  where Plan 03-05 fills in real arguments (coin objects, oracle refs, etc.). */
export function buildPtb(deploy: DeployJson, marginManagerId: string): Transaction {
    const tx = new Transaction();

    // Required margin field gate — TS narrowing for the strict deploys.
    if (
        !deploy.margin_pkg ||
        !deploy.margin_registry_id ||
        !deploy.margin_registry_initial_shared_version ||
        !deploy.btc_margin_pool_id ||
        !deploy.btc_margin_pool_initial_shared_version ||
        !deploy.dusdc_margin_pool_id ||
        !deploy.dusdc_margin_pool_initial_shared_version ||
        !deploy.btc_oracle_id ||
        !deploy.usdc_oracle_id ||
        !deploy.deepbook_pool_id ||
        !deploy.deepbook_pool_initial_shared_version ||
        !deploy.btc_type_tag
    ) {
        throw new Error(
            'buildPtb: TESTNET-DEPLOY.json missing Margin fields; ' +
                'see MARGIN-WHITELIST-DECISION.md fallback path.',
        );
    }

    const marginRegistryArg = tx.sharedObjectRef({
        objectId: deploy.margin_registry_id,
        mutable: false,
        initialSharedVersion: deploy.margin_registry_initial_shared_version,
    });
    const btcMarginPoolArg = tx.sharedObjectRef({
        objectId: deploy.btc_margin_pool_id,
        mutable: true,
        initialSharedVersion: deploy.btc_margin_pool_initial_shared_version,
    });
    const dusdcMarginPoolArg = tx.sharedObjectRef({
        objectId: deploy.dusdc_margin_pool_id,
        mutable: true,
        initialSharedVersion: deploy.dusdc_margin_pool_initial_shared_version,
    });
    const btcOracleArg = tx.object(deploy.btc_oracle_id);
    const usdcOracleArg = tx.object(deploy.usdc_oracle_id);
    const deepbookPoolArg = tx.sharedObjectRef({
        objectId: deploy.deepbook_pool_id,
        mutable: true,
        initialSharedVersion: deploy.deepbook_pool_initial_shared_version,
    });
    const marginManagerArg = tx.object(marginManagerId);
    const clockArg = tx.object('0x6');

    // ─────────────────────────────────────────────────────────
    // Step 1: margin_manager::deposit<BTC, DUSDC, BTC>
    //   Deposits user BTC into MarginManager's wrapped BalanceManager.
    //   Vendored source: margin_manager.move:417-431 (calls deposit_int).
    //   See WAVE0-DECISION.md step 1.
    // ─────────────────────────────────────────────────────────
    tx.moveCall({
        target: `${deploy.margin_pkg}::margin_manager::deposit`,
        typeArguments: [deploy.btc_type_tag, deploy.dusdc_type_tag, deploy.btc_type_tag],
        arguments: [
            marginManagerArg,
            marginRegistryArg,
            btcOracleArg,
            usdcOracleArg,
            // TODO Plan 03-05: split COLLATERAL_AMOUNT_MICRO BTC coin
            tx.pure.u64(COLLATERAL_AMOUNT_MICRO),
            clockArg,
        ],
    });

    // ─────────────────────────────────────────────────────────
    // Step 2: margin_manager::borrow_quote<BTC, DUSDC>
    //   Borrows DUSDC against deposited BTC. NO RETURN VALUE — the
    //   borrowed coin is auto-deposited via deposit_int at margin_manager.move:625.
    //   See WAVE0-DECISION.md step 2.
    // ─────────────────────────────────────────────────────────
    tx.moveCall({
        target: `${deploy.margin_pkg}::margin_manager::borrow_quote`,
        typeArguments: [deploy.btc_type_tag, deploy.dusdc_type_tag],
        arguments: [
            marginManagerArg,
            marginRegistryArg,
            dusdcMarginPoolArg,
            btcOracleArg,
            usdcOracleArg,
            deepbookPoolArg,
            tx.pure.u64(BORROW_AMOUNT_MICRO),
            clockArg,
        ],
    });

    // ─────────────────────────────────────────────────────────
    // Step 3: borrowed_coin = margin_manager::withdraw<BTC, DUSDC, DUSDC>
    //   BRIDGE: extracts a free Coin<DUSDC> we can route to vault::supply.
    //   This step is load-bearing per WAVE0-DECISION.md "Why CONTEXT.md D-17
    //   was non-compilable": without it, the supply call has no Coin<DUSDC>
    //   to consume because borrow_quote auto-deposits.
    //   Vendored source: margin_manager.move:458-555.
    // ─────────────────────────────────────────────────────────
    const [borrowedCoin] = tx.moveCall({
        target: `${deploy.margin_pkg}::margin_manager::withdraw`,
        typeArguments: [deploy.btc_type_tag, deploy.dusdc_type_tag, deploy.dusdc_type_tag],
        arguments: [
            marginManagerArg,
            marginRegistryArg,
            btcMarginPoolArg,
            dusdcMarginPoolArg,
            btcOracleArg,
            usdcOracleArg,
            deepbookPoolArg,
            tx.pure.u64(BORROW_AMOUNT_MICRO),
            clockArg,
        ],
    });

    // ─────────────────────────────────────────────────────────
    // Step 4: vault::supply::supply<DUSDC>(..., borrowed_coin, ...)
    //   Atomic deposit + hedge mint per Phase 2 D-06. The borrowed Coin<DUSDC>
    //   from Step 3 is consumed by-value here — this is the bridge that
    //   wires the two protocols together (WAVE0-DECISION.md "5-call PTB shape").
    //   rebalance::buy_hedge_for_deposit is called internally at
    //   supply.move:89-97 (public(package)); we do NOT invoke it directly.
    // ─────────────────────────────────────────────────────────
    tx.moveCall({
        target: `${deploy.package_id}::supply::supply`,
        typeArguments: [deploy.dusdc_type_tag],
        arguments: [
            tx.sharedObjectRef({
                objectId: deploy.vault_id,
                mutable: true,
                initialSharedVersion: deploy.vault_initial_shared_version,
            }),
            tx.object(deploy.predict_top_level_id),
            tx.sharedObjectRef({
                objectId: deploy.predict_manager_id,
                mutable: true,
                initialSharedVersion: deploy.predict_manager_initial_shared_version,
            }),
            // TODO Plan 03-05: oracle SVI ref (ORACLE_SVI_ID env var per
            // scripts/e2e-vault-cycle.ts:97-100).
            btcOracleArg,
            borrowedCoin,
            clockArg,
        ],
    });

    // ─────────────────────────────────────────────────────────
    // Step 5 (OPTIONAL — D-18 hot-upgrade): margin_manager::deposit<BTC, DUSDC, SHARE>
    //   Re-deposit VAULT_SHARE as additional collateral. SKIP in v1 per
    //   WAVE0-DECISION.md (DUSDC margin pool not yet deployed; MARGIN-WHITELIST-DECISION.md
    //   selected UNDETERMINED-FALLBACK-TO-MOCK). Plan 03-05 leaves this gated by
    //   a feature flag.
    // ─────────────────────────────────────────────────────────
    // tx.moveCall({ target: `${deploy.margin_pkg}::margin_manager::deposit`, ... });

    return tx;
}

/** Sign + execute the PTB. Body in Plan 03-05 — calls
 *  client.signAndExecuteTransaction with showEffects + showEvents and asserts
 *  effects.status.status === 'success'. */
export async function signAndExecute(
    _client: SuiJsonRpcClient,
    _keypair: Ed25519Keypair,
    _tx: Transaction,
): Promise<{ digest: string; events: unknown[] }> {
    throw new Error('signAndExecute: body lands in Plan 03-05');
}

/** Extract + assert the expected event surface from the executed PTB.
 *  Plan 03-05 fills in: Supplied + HedgeMinted (from vault) +
 *  MarginPositionOpened (from margin_manager). Returns the parsed JSON
 *  payload for action-trace consumption by Plan 03-06 (replay.py). */
export async function extractAndAssertEvents(_events: unknown[]): Promise<unknown> {
    throw new Error('extractAndAssertEvents: body lands in Plan 03-05');
}

// ============================================================
// main entry
// ============================================================

export async function main(): Promise<void> {
    const deploy = loadDeploy();

    // Graceful-skip gate 1: vault not deployed yet (pre-Plan 02-09 deploy state).
    // Pattern mirrors scripts/e2e-vault-cycle.sh:71-81 (status check + exit 0).
    if (deploy.status !== 'deployed') {
        console.warn(
            `::warning::TESTNET-DEPLOY.json status='${deploy.status}'; ` +
                "expected 'deployed'. Skipping live-testnet PTB demo (graceful exit 0). " +
                'Run scripts/e2e-vault-deploy.sh first.',
        );
        process.exit(0);
    }

    // Graceful-skip gate 2: Margin testnet pool not yet recorded (D-18 fallback).
    // See MARGIN-WHITELIST-DECISION.md — DUSDC margin pool is
    // UNDETERMINED-FALLBACK-TO-MOCK as of 2026-05-12.
    if (!deploy.margin_pkg || !deploy.dusdc_margin_pool_id) {
        console.warn(
            '::warning::Margin testnet pool not yet recorded in TESTNET-DEPLOY.json; ' +
                'see MARGIN-WHITELIST-DECISION.md fallback path. ' +
                'Plan 03-05 will integration-test against contracts/tests/mock_margin_pool.move.',
        );
        process.exit(0);
    }

    const privateKey = process.env.SUI_PRIVATE_KEY;
    if (!privateKey) {
        throw new Error('SUI_PRIVATE_KEY env var required for live two-protocol-ptb-demo');
    }

    const client = new SuiJsonRpcClient({
        url: getJsonRpcFullnodeUrl('testnet'),
        network: 'testnet',
    });
    const keypair = Ed25519Keypair.fromSecretKey(privateKey);
    const signerAddress = keypair.getPublicKey().toSuiAddress();
    console.log(`==> two-protocol-ptb-demo signer: ${signerAddress}`);

    // ─────────────────────────────────────────────────────────
    // The four-step skeleton flow (bodies in Plan 03-05):
    //   (a) setupBalanceManagerWithTradeCap — creates MarginManager + BalanceManager
    //   (b) buildPtb                        — composes the 5-call PTB
    //   (c) signAndExecute                  — submits the PTB
    //   (d) extractAndAssertEvents          — asserts event surface
    // ─────────────────────────────────────────────────────────
    const { marginManagerId } = await setupBalanceManagerWithTradeCap(client, keypair, deploy);
    const tx = buildPtb(deploy, marginManagerId);
    const { events } = await signAndExecute(client, keypair, tx);
    await extractAndAssertEvents(events);

    console.log('OK: two-protocol-ptb-demo cycle complete.');
}

// Module-vs-direct-invocation guard so importing this file (e.g. from tests)
// doesn't run main(). Same pattern as scripts/e2e-vault-cycle.ts:270-273 but
// gated so test imports don't trigger.
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('two-protocol-ptb-demo.ts')) {
    main().catch((err) => {
        console.error(err);
        process.exit(1);
    });
}
