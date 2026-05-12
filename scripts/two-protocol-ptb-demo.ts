// scripts/two-protocol-ptb-demo.ts
//
// Phase 3 Track A — TWO-PROTOCOL PTB DEMO (COMPLETE, Plan 03-05).
//
// Plan 03-05 fills the four function bodies left as stubs in the Plan 03-03
// skeleton (setupBalanceManagerWithTradeCap, buildPtb args, signAndExecute,
// extractAndAssertEvents) with the canonical signing + execution + event
// extraction + trace dump flow.
//
// CANONICAL PTB shape (locked by WAVE0-DECISION.md "5-call PTB shape" — five-call
// shape; replaces CONTEXT.md D-17 literal):
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
// wrapped BalanceManager and never escapes PTB scope.
// setupBalanceManagerWithTradeCap() returns ONLY the MarginManager object
// reference — no &mut TradeCap, no Coin<TradeCap>. The capability-flow Move
// test (contracts/tests/ptb_capability_test.move) and Python grep gate
// (backtest/tests/test_ptb_capability_grep.py) enforce this at three layers
// (Move type system + Move test + Python grep).
//
// Live-testnet gating (CONTEXT.md D-18 + MARGIN-WHITELIST-DECISION.md):
//   - The DUSDC margin pool is UNDETERMINED-FALLBACK-TO-MOCK at the time of
//     this code landing (testnet has DBUSDC, not DUSDC; see
//     MARGIN-WHITELIST-DECISION.md "Crucial caveat").
//   - When deploy.status !== 'deployed' OR Margin pool IDs are absent, this
//     script exits 0 with a workflow warning. Plan 03-05's Move-side
//     capability tests exercise the path against contracts/tests/mock_margin_pool.move.
//
// JSON convention (WAVE0-DECISION.md Q5): u64 fields serialized as strings
// to survive JS Number safe-max (2^53-1). 0x-prefixed lowercase hex for object IDs.
//
// Source citations:
//   - 5-call PTB shape: WAVE0-DECISION.md (this file IS the implementation of
//     the locked shape; replaces CONTEXT.md D-17 non-compilable literal)
//   - Event extraction idiom: scripts/e2e-vault-cycle.ts:151-173 (Supplied +
//     HedgeMinted event find-by-suffix pattern)
//   - Coin discovery + split pattern: scripts/e2e-vault-cycle.ts:67-82 +
//     scripts/e2e-vault-cycle.ts:124-128 (findDepositCoin + splitCoins)
//   - SUI_PRIVATE_KEY env discipline: scripts/e2e-vault-cycle.ts:93-96
//   - DeepBook Margin SDK 1.3.6 introspection: WAVE0-DECISION.md
//     "SDK introspection evidence"

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Transaction } from '@mysten/sui/transactions';
// @mysten/sui@2.16.0 renamed SuiClient → SuiJsonRpcClient and
// getFullnodeUrl → getJsonRpcFullnodeUrl; both live in /jsonRpc subpath.
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

// SDK pin verified by WAVE0-DECISION.md "SDK introspection evidence":
// @mysten/deepbook-v3@1.3.6 exposes MarginPoolContract + MarginManagerContract +
// testnetMarginPools. Type-only import for provenance; the actual builder calls
// use raw tx.moveCall (the safest path per WAVE0-DECISION.md decision-logic outcome).
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
    /** Optional: OracleSVI shared object id; if absent we fall back to
     *  process.env.ORACLE_SVI_ID (mirrors scripts/e2e-vault-cycle.ts:97-100). */
    oracle_svi_id?: string;
};

/** Parsed event envelope minimal surface. We accept the @mysten/sui
 *  `SuiEvent` shape loosely; the type field is the load-bearing
 *  discriminator and parsedJson carries the payload (u64-as-string per
 *  WAVE0-DECISION.md Q5 convention). */
export type ParsedEventLike = {
    type: string;
    parsedJson?: unknown;
};

// ============================================================
// Constants
// ============================================================

/** 100 DUSDC at 6 decimals. Mirrors scripts/e2e-vault-cycle.ts SUPPLY_AMOUNT_MICRO. */
export const SUPPLY_AMOUNT_MICRO = 100_000_000n;

/** ~0.002 BTC at 11 decimals (Sui BTC convention per Mysten docs). */
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
// Step 0: BalanceManager + TradeCap setup (D-19 capability discipline)
// ============================================================

/** Set up MarginManager + BalanceManager + TradeCap.
 *
 *  Per CONTEXT.md D-19: TradeCap lives inside the user's BalanceManager
 *  and never escapes. This function:
 *    1. Calls `margin_manager::create_margin_manager` (or equivalent) which
 *       internally creates a wrapped BalanceManager + TradeCap and stores the
 *       cap INSIDE the BalanceManager.
 *    2. Returns ONLY the MarginManager object ID — no TradeCap return, no
 *       Coin<TradeCap>, no &mut TradeCap. The capability is fully contained.
 *
 *  Behaviour:
 *    - If `MARGIN_MANAGER_ID` env var is set, reuse the pre-existing manager.
 *    - Otherwise, build + execute a 1-call PTB that creates a fresh manager
 *      and shares it, then locate the resulting shared MarginManager object
 *      from the transaction effects.
 *
 *  Per WAVE0-DECISION.md "SDK introspection evidence", the @mysten/deepbook-v3
 *  1.3.6 MarginManagerContract exposes the underlying Move call shape; we use
 *  raw tx.moveCall as the safest path. */
export async function setupBalanceManagerWithTradeCap(
    client: SuiJsonRpcClient,
    keypair: Ed25519Keypair,
    deploy: DeployJson,
): Promise<{ marginManagerId: string }> {
    if (!deploy.margin_pkg || !deploy.margin_registry_id ||
        !deploy.margin_registry_initial_shared_version) {
        throw new Error(
            'setupBalanceManagerWithTradeCap: TESTNET-DEPLOY.json missing Margin ' +
                'fields (margin_pkg/margin_registry_id/...); see MARGIN-WHITELIST-DECISION.md fallback path.',
        );
    }

    // Short-circuit: reuse env-provided MarginManager id when available.
    const envMmId = process.env.MARGIN_MANAGER_ID;
    if (envMmId) {
        console.log(`==> reusing MarginManager from env: ${envMmId}`);
        return { marginManagerId: envMmId };
    }

    if (!deploy.btc_type_tag) {
        throw new Error(
            'setupBalanceManagerWithTradeCap: TESTNET-DEPLOY.json missing btc_type_tag',
        );
    }

    // Build a 1-call PTB: margin_manager::new_margin_manager<BTC, DUSDC>
    //
    // Per WAVE0-DECISION.md / RESEARCH.md Pattern 1, the constructor call
    // creates the wrapped BalanceManager + TradeCap internally and stores the
    // TradeCap INSIDE the BalanceManager. The TradeCap NEVER becomes a free
    // PTB-scope variable — D-19 capability discipline enforced at the type
    // level (no public function in the Margin SDK returns TradeCap by value).
    const setupTx = new Transaction();
    setupTx.moveCall({
        target: `${deploy.margin_pkg}::margin_manager::new_margin_manager`,
        typeArguments: [deploy.btc_type_tag, deploy.dusdc_type_tag],
        arguments: [
            setupTx.sharedObjectRef({
                objectId: deploy.margin_registry_id,
                mutable: false,
                initialSharedVersion: deploy.margin_registry_initial_shared_version,
            }),
        ],
    });

    const setupResult = await client.signAndExecuteTransaction({
        transaction: setupTx,
        signer: keypair,
        options: { showEffects: true, showObjectChanges: true },
    });
    if (setupResult.effects?.status?.status !== 'success') {
        throw new Error(
            `setupBalanceManagerWithTradeCap: setup tx failed: ${JSON.stringify(setupResult.effects?.status)}`,
        );
    }

    // Locate the shared MarginManager object in the object changes.
    // SuiObjectChange is a union over { type: 'created' | 'mutated' | 'deleted' |
    // 'published' | 'transferred' | 'wrapped' }; only the non-'published' variants
    // expose `objectId` + `objectType`, so we narrow via a runtime type-guard.
    const objectChanges = setupResult.objectChanges ?? [];
    type CreatedChange = { type: 'created'; objectId: string; objectType: string };
    const isCreatedMarginManager = (c: unknown): c is CreatedChange => {
        if (!c || typeof c !== 'object') return false;
        const obj = c as { type?: unknown; objectId?: unknown; objectType?: unknown };
        return (
            obj.type === 'created' &&
            typeof obj.objectId === 'string' &&
            typeof obj.objectType === 'string' &&
            obj.objectType.includes('::margin_manager::MarginManager<')
        );
    };
    // Cast to unknown[] so the type-predicate narrows from `unknown` to
    // CreatedChange (TS's Array.find with a type predicate cannot narrow a
    // union element type to a non-member shape).
    const marginManagerChange = (objectChanges as unknown[]).find(isCreatedMarginManager);
    if (!marginManagerChange) {
        throw new Error(
            'setupBalanceManagerWithTradeCap: no MarginManager object created in setup tx',
        );
    }
    console.log(`==> created MarginManager: ${marginManagerChange.objectId}`);
    return { marginManagerId: marginManagerChange.objectId };
}

// ============================================================
// Step 1-4 (+ optional 5): build the 5-call PTB
// ============================================================

/** Build the 5-call PTB per WAVE0-DECISION.md.
 *
 *  Step-by-step:
 *    1. margin_manager::deposit<BTC, DUSDC, BTC>      — collateral in
 *    2. margin_manager::borrow_quote<BTC, DUSDC>      — borrow DUSDC (auto-deposits)
 *    3. margin_manager::withdraw<BTC, DUSDC, DUSDC>   — bridge: extract Coin<DUSDC>
 *    4. vault::supply::supply<DUSDC>                  — atomic deposit + hedge mint
 *    5. (OPTIONAL) margin_manager::deposit<...,SHARE> — D-18 hot-upgrade; SKIP v1
 *
 *  `collateralCoinId` is the on-chain object id of the BTC coin to split for
 *  collateral. `oracleSviId` is the BTC-USD OracleSVI shared object id
 *  (env: ORACLE_SVI_ID; mirrors scripts/e2e-vault-cycle.ts:97-100). */
export function buildPtb(
    deploy: DeployJson,
    marginManagerId: string,
    collateralCoinId: string,
    oracleSviId: string,
): Transaction {
    const tx = new Transaction();

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

    // Split the BTC collateral down to COLLATERAL_AMOUNT_MICRO so the PTB
    // consumes only what's needed for this position. Mirrors
    // scripts/e2e-vault-cycle.ts:124-128 splitCoins idiom.
    const [btcCollat] = tx.splitCoins(tx.object(collateralCoinId), [
        tx.pure.u64(COLLATERAL_AMOUNT_MICRO),
    ]);

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
            btcCollat,
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
            tx.object(oracleSviId),
            borrowedCoin,
            clockArg,
        ],
    });

    // ─────────────────────────────────────────────────────────
    // Step 5 (OPTIONAL — D-18 hot-upgrade): margin_manager::deposit<BTC, DUSDC, SHARE>
    //   Re-deposit VAULT_SHARE as additional collateral. SKIP in v1 per
    //   WAVE0-DECISION.md (DUSDC margin pool not yet deployed;
    //   MARGIN-WHITELIST-DECISION.md selected UNDETERMINED-FALLBACK-TO-MOCK).
    //   When the Margin governance whitelists VAULT_SHARE, uncomment this
    //   block — the entire PTB picks up the optional 5th call automatically.
    //
    //   tx.moveCall({
    //       target: `${deploy.margin_pkg}::margin_manager::deposit`,
    //       typeArguments: [deploy.btc_type_tag, deploy.dusdc_type_tag,
    //                       `${deploy.package_id}::share::SHARE`],
    //       arguments: [marginManagerArg, marginRegistryArg, btcOracleArg,
    //                   usdcOracleArg, /* shareCoin */, clockArg],
    //   });
    // ─────────────────────────────────────────────────────────

    return tx;
}

// ============================================================
// Sign + execute
// ============================================================

/** Sign + execute the PTB. Mirrors scripts/e2e-vault-cycle.ts:151-160.
 *
 *  Asserts effects.status.status === 'success' (atomic-rollback signal —
 *  any of the five moveCalls failing aborts the entire PTB per Move tx
 *  semantics). Returns the tx digest and the parsed events array for
 *  downstream extraction. */
export async function signAndExecute(
    client: SuiJsonRpcClient,
    keypair: Ed25519Keypair,
    tx: Transaction,
): Promise<{ digest: string; events: ParsedEventLike[] }> {
    const result = await client.signAndExecuteTransaction({
        transaction: tx,
        signer: keypair,
        options: { showEffects: true, showEvents: true, showObjectChanges: true },
    });

    if (result.effects?.status?.status !== 'success') {
        throw new Error(
            `PTB failed (atomic rollback fired): ${JSON.stringify(result.effects?.status)}`,
        );
    }

    const events: ParsedEventLike[] = (result.events ?? []).map((e) => ({
        type: e.type,
        parsedJson: e.parsedJson,
    }));

    return { digest: result.digest, events };
}

// ============================================================
// Event extraction + atomicity assertion
// ============================================================

/** Extract + assert the expected event surface from the executed PTB.
 *
 *  Atomicity assertion (per WAVE0-DECISION.md 5-call PTB):
 *    - LoanBorrowed event from margin_manager::borrow_quote (Step 2)
 *    - Supplied event from vault::supply (Step 4)
 *    - HedgeMinted event from vault::rebalance (Step 4 internal call)
 *
 *  Any of the three missing means the PTB did NOT execute the full 5-call
 *  shape — either rollback fired silently (logically impossible given the
 *  success status check) or the event surface drifted (planner cited
 *  WAVE0-DECISION.md event names).
 *
 *  Mirrors scripts/e2e-vault-cycle.ts:161-173 (Supplied + HedgeMinted
 *  endsWith pattern). Extended here with LoanBorrowed for the Margin leg.
 *
 *  Returns the three named event payloads (parsedJson) for trace consumption
 *  by Plan 03-06 (replay.py). */
export function extractAndAssertEvents(events: ParsedEventLike[]): {
    loanBorrowed: ParsedEventLike;
    supplied: ParsedEventLike;
    hedgeMinted: ParsedEventLike;
} {
    const loanBorrowed = events.find((e) =>
        e.type.endsWith('::margin_manager::LoanBorrowed'),
    );
    const supplied = events.find((e) => e.type.endsWith('::supply::Supplied'));
    const hedgeMinted = events.find((e) =>
        e.type.endsWith('::rebalance::HedgeMinted'),
    );

    if (!loanBorrowed || !supplied || !hedgeMinted) {
        throw new Error(
            'Atomicity assertion FAILED: expected LoanBorrowed + Supplied + HedgeMinted ' +
                'in single 5-call PTB; saw event types: ' +
                JSON.stringify(events.map((e) => e.type)),
        );
    }

    console.log(
        '==> Atomicity verified: LoanBorrowed + Supplied + HedgeMinted emitted in single PTB',
    );
    return { loanBorrowed, supplied, hedgeMinted };
}

// ============================================================
// Action-trace dump (Plan 03-06 consumer contract)
// ============================================================

/** Emit a partial action trace per WAVE0-DECISION.md Q5 convention:
 *    - u64 fields as JSON strings (avoids JS Number safe-max precision loss)
 *    - object IDs as 0x-prefixed lowercase hex
 *
 *  Plan 03-06 (replay.py) extends the trace with pre/post vault snapshots
 *  via client.getObject calls; this stub captures the on-chain effects of
 *  the PTB. The trace path is configurable via TRACE_OUT_PATH env (default:
 *  backtest/traces/cycle-full.json).
 *
 *  See WAVE0-DECISION.md "Plan 03-05 emitter contract". */
export function dumpTrace(
    deploy: DeployJson,
    txDigest: string,
    events: ParsedEventLike[],
): string {
    const traceOutPath = process.env.TRACE_OUT_PATH || 'backtest/traces/cycle-full.json';
    const repoRoot = resolve(__dirname, '..');
    const absoluteOut = resolve(repoRoot, traceOutPath);

    mkdirSync(dirname(absoluteOut), { recursive: true });

    const trace = {
        vault_id: deploy.vault_id,
        package_id: deploy.package_id,
        margin_pkg: deploy.margin_pkg,
        actions: [
            {
                kind: 'supply_via_margin_borrow',
                tx_digest: txDigest,
                // u64 ms timestamp as string per WAVE0-DECISION.md Q5
                ts_ms: String(Date.now()),
                args: {
                    // u64s serialized as strings — JS Number safe-max guard
                    collateral_amount: COLLATERAL_AMOUNT_MICRO.toString(),
                    borrow_amount: BORROW_AMOUNT_MICRO.toString(),
                },
                events: events.map((e) => ({ type: e.type, parsedJson: e.parsedJson })),
            },
        ],
    };

    writeFileSync(absoluteOut, JSON.stringify(trace, null, 2), 'utf-8');
    console.log(`==> trace stub written to ${absoluteOut}`);
    return absoluteOut;
}

// ============================================================
// Helpers
// ============================================================

/** Locate a BTC coin owned by `owner` with balance >= `minBalance`.
 *  Mirrors scripts/e2e-vault-cycle.ts:67-82 findDepositCoin pattern. */
export async function findCollateralCoin(
    client: SuiJsonRpcClient,
    owner: string,
    coinType: string,
    minBalance: bigint,
): Promise<string> {
    const { data: coins } = await client.getCoins({ owner, coinType });
    const coin = coins.find((c) => BigInt(c.balance) >= minBalance);
    if (!coin) {
        throw new Error(
            `No Coin<${coinType}> with balance >= ${minBalance} found for ${owner}. ` +
                `Fund via testnet faucet.`,
        );
    }
    return coin.coinObjectId;
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
                'Move-side capability tests in contracts/tests/ptb_capability_test.move ' +
                'exercise the architectural path against mock_margin_pool.',
        );
        process.exit(0);
    }

    const privateKey = process.env.SUI_PRIVATE_KEY;
    if (!privateKey) {
        throw new Error('SUI_PRIVATE_KEY env var required for live two-protocol-ptb-demo');
    }

    // Oracle SVI id sources (in priority order): deploy.oracle_svi_id field,
    // then ORACLE_SVI_ID env var (mirrors scripts/e2e-vault-cycle.ts:97-100).
    const oracleSviId = deploy.oracle_svi_id ?? process.env.ORACLE_SVI_ID;
    if (!oracleSviId) {
        throw new Error(
            'ORACLE_SVI_ID env var (or deploy.oracle_svi_id) required ' +
                '(BTC-USD OracleSVI shared object id)',
        );
    }

    const client = new SuiJsonRpcClient({
        url: getJsonRpcFullnodeUrl('testnet'),
        network: 'testnet',
    });
    const keypair = Ed25519Keypair.fromSecretKey(privateKey);
    const signerAddress = keypair.getPublicKey().toSuiAddress();
    console.log(`==> two-protocol-ptb-demo signer: ${signerAddress}`);

    // ─────────────────────────────────────────────────────────
    // The four-step driver:
    //   (a) setupBalanceManagerWithTradeCap — creates MarginManager + BalanceManager
    //   (b) buildPtb                        — composes the 5-call PTB
    //   (c) signAndExecute                  — submits the PTB (atomic rollback gate)
    //   (d) extractAndAssertEvents          — asserts event surface
    // ─────────────────────────────────────────────────────────
    const { marginManagerId } = await setupBalanceManagerWithTradeCap(client, keypair, deploy);

    if (!deploy.btc_type_tag) {
        throw new Error('btc_type_tag missing from TESTNET-DEPLOY.json');
    }
    const collateralCoinId = await findCollateralCoin(
        client,
        signerAddress,
        deploy.btc_type_tag,
        COLLATERAL_AMOUNT_MICRO,
    );
    console.log(`==> collateral coin: ${collateralCoinId}`);

    const tx = buildPtb(deploy, marginManagerId, collateralCoinId, oracleSviId);
    const { digest, events } = await signAndExecute(client, keypair, tx);
    console.log(`==> PTB tx digest: ${digest}`);

    extractAndAssertEvents(events);
    dumpTrace(deploy, digest, events);

    console.log('OK: two-protocol-ptb-demo cycle complete.');
}

// Module-vs-direct-invocation guard so importing this file (e.g. from tests)
// doesn't run main(). Same pattern as scripts/e2e-vault-cycle.ts:270-273.
if (
    import.meta.url === `file://${process.argv[1]}` ||
    process.argv[1]?.endsWith('two-protocol-ptb-demo.ts')
) {
    main().catch((err) => {
        console.error(err);
        process.exit(1);
    });
}
