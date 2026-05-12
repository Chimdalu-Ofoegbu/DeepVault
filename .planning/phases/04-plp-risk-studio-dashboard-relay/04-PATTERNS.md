# Phase 4: PLP Risk Studio Dashboard + Relay - Pattern Map

**Mapped:** 2026-05-12
**Files analyzed:** 42 new + modified
**Analogs found:** 38 / 42 (4 net-new with no in-repo analog — relay polling loop, ws server, ws client, snapshot ring buffer)

> Phase 4 is mostly greenfield. The only Phase-internal analogs are:
> - **`scripts/two-protocol-ptb-demo.ts`** + **`scripts/e2e-vault-cycle.ts`** — Phase 3 TS PTB construction idioms (the primary analog for `dashboard/src/lib/ptbBuilders.ts` and any indexer code that needs to read `TESTNET-DEPLOY.json`).
> - **`dashboard/src/lib/{svi.ts,arb_checker.ts,strategy_constants.ts}`** — Phase 1 outputs. New code IMPORTS these; existing files are **forbidden-token-grep-protected** for `svi.ts/phi.ts/isqrt.ts/ln.ts/math.ts` per `.github/workflows/ci.yml` parity job (CONTEXT.md "Phase 1 SVI lib parity gate").
> - **`contracts/sources/{vault.move,supply.move,redeem.move,rebalance.move}`** — Move event struct field names the relay's BCS decoder + WebSocket payload schema must match. Source of truth for u64/i64 layout.
> - **`scripts/deepbookv3/packages/predict/sources/oracle.move`** lines 58-66 — `OracleSVIUpdated` event struct with `rho: i64::I64`, `m: i64::I64`.
> - **`scripts/deepbookv3/packages/predict/sources/helper/i64.move`** lines 13-16 — actual I64 field names `magnitude: u64, is_negative: bool` (NOT `negative` as RESEARCH.md A2 assumed — Pitfall 7 corrected here).
> - **`dashboard/{package.json,tsconfig.json,vitest.config.ts}`** — existing placeholders to extend in Wave 0.
> - **`indexer/package.json`** — empty placeholder to populate from scratch.

## File Classification

### Indexer (`indexer/` — Node.js relay)

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `indexer/package.json` | config | n/a | `dashboard/package.json` + root `package.json` | role-match (placeholder) |
| `indexer/tsconfig.json` | config | n/a | `dashboard/tsconfig.json` | exact (TS bundler config) |
| `indexer/render.yaml` | config | n/a | **none** — net-new | no analog |
| `indexer/.env.example` | config | n/a | RESEARCH.md Pattern 1 inline reference | no analog |
| `indexer/src/relay.ts` | service entry | event-driven | `scripts/e2e-vault-cycle.ts` (main() entry + loadDeploy pattern) | role-match |
| `indexer/src/cursor.ts` | utility | file-I/O | **none** — net-new (RESEARCH.md Pattern 2 atomic write) | no analog |
| `indexer/src/snapshot.ts` | service (in-memory store) | event-driven / pub-sub | **none** — net-new (RESEARCH.md "Snapshot store" + ring buffer pattern) | no analog |
| `indexer/src/wsServer.ts` | service (ws server) | streaming | **none** — net-new (RESEARCH.md Pattern 3) | no analog |
| `indexer/src/pollOracleSVI.ts` | service (event poller) | event-driven / batch | `scripts/two-protocol-ptb-demo.ts::main` (graceful-skip gate + RPC client setup) | partial — RPC client init only |
| `indexer/src/pollVaultEvents.ts` | service (event poller) | event-driven / batch | `pollOracleSVI.ts` (sibling); `scripts/e2e-vault-cycle.ts:220-225` (event find-by-suffix idiom) | role-match |
| `indexer/src/decodeI64.ts` | utility | transform | **none** — net-new (Pitfall 7 + i64.move:13-16 struct) | no analog |
| `indexer/src/deployInfo.ts` | utility | file-I/O | `scripts/e2e-vault-cycle.ts:107-114` `loadDeploy()` | exact |
| `indexer/src/__tests__/cursor.test.ts` | test | n/a | `dashboard/src/lib/__tests__/svi.test.ts:1-40` (vitest header) | partial (vitest convention only) |
| `indexer/src/__tests__/snapshot.test.ts` | test | n/a | same | partial |
| `indexer/src/__tests__/wsServer.test.ts` | test | n/a | same | partial |
| `indexer/src/__tests__/fixtures/*.json` | test fixture | n/a | `backtest/traces/cycle-full.json` referenced in `scripts/e2e-vault-cycle.ts:374` | role-match |

### Dashboard (`dashboard/` — React + Vite SPA)

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `dashboard/package.json` | config | n/a | existing `dashboard/package.json` (placeholder) | exact (extend in place) |
| `dashboard/vite.config.ts` | config | n/a | **none** in repo | no analog |
| `dashboard/tailwind.config.ts` | config | n/a | **none** | no analog (shadcn-init output) |
| `dashboard/postcss.config.js` | config | n/a | **none** | no analog |
| `dashboard/index.html` | config | n/a | **none** | no analog |
| `dashboard/vercel.json` | config | n/a | **none** | no analog |
| `dashboard/components.json` | config | n/a | **none** (shadcn CLI output) | no analog |
| `dashboard/src/main.tsx` | provider stack | n/a | RESEARCH.md "Provider Stack" code example | no in-repo analog |
| `dashboard/src/App.tsx` | layout shell | request-response | none | no analog |
| `dashboard/src/env.ts` | config | n/a | `scripts/e2e-vault-cycle.ts:142-148` env var validation pattern | role-match |
| `dashboard/src/styles/globals.css` | config | n/a | **none** (shadcn-init output) | no analog |
| `dashboard/src/components/layout/Header.tsx` | react-panel | request-response | none | no analog |
| `dashboard/src/components/layout/Main.tsx` | react-panel | request-response | none | no analog |
| `dashboard/src/components/layout/RelayStatusPill.tsx` | react-panel | request-response | none | no analog |
| `dashboard/src/components/layout/GlobalStalenessPill.tsx` | react-panel | request-response | none | no analog |
| `dashboard/src/components/panels/SurfacePanel.tsx` | plotly-3d | streaming (subscribed) | `dashboard/src/lib/svi.ts::totalVariance` (consumed) + RESEARCH.md Pattern 5 | role-match (consumer of Phase 1 lib) |
| `dashboard/src/components/panels/ArbCheckerPanel.tsx` | recharts-2d | streaming | `dashboard/src/lib/arb_checker.ts::checkArb` (consumed) | role-match (consumer of Phase 1 lib) |
| `dashboard/src/components/panels/VaultPanel.tsx` | recharts-2d | streaming | none in repo | no analog |
| `dashboard/src/components/panels/BucketGauge.tsx` | recharts-2d | streaming | none | no analog |
| `dashboard/src/components/panels/ExposurePanel.tsx` | recharts-2d | streaming | none | no analog |
| `dashboard/src/components/panels/WhatIfSimulator.tsx` | react-panel | client-side compute | `dashboard/src/lib/svi.ts::binaryPrice` (consumed) | role-match (consumer) |
| `dashboard/src/components/panels/DepositWithdrawPanel.tsx` | dapp-kit-flow | request-response (sign) | `scripts/e2e-vault-cycle.ts:180-242` (supply PTB) + `scripts/two-protocol-ptb-demo.ts::buildPtb` | **exact (PTB construction)** |
| `dashboard/src/components/panels/PositionViewer.tsx` | react-panel | request-response | `scripts/e2e-vault-cycle.ts:86-99` `snapshotVault` (getObject pattern) | partial (read-pattern only) |
| `dashboard/src/components/primitives/StalenessPill.tsx` | react-panel | derived state | none | no analog |
| `dashboard/src/components/primitives/TxDigestLink.tsx` | react-panel | derived state | none | no analog |
| `dashboard/src/components/primitives/NumericValue.tsx` | react-panel | derived state | none | no analog (uses `dashboard/src/lib/strategy_constants.ts::NAV_SCALE`) |
| `dashboard/src/hooks/useWebSocket.ts` | react-query-hook | streaming | RESEARCH.md Pattern 4 (React hook wrapper) | no in-repo analog |
| `dashboard/src/hooks/useSurfaceSnapshot.ts` | react-query-hook | streaming | none | no analog |
| `dashboard/src/hooks/useVaultState.ts` | react-query-hook | request-response | `scripts/e2e-vault-cycle.ts:86-99` (getObject pattern) | partial |
| `dashboard/src/hooks/usePositions.ts` | react-query-hook | request-response | same | partial |
| `dashboard/src/hooks/useStaleness.ts` | react-hook | derived state | none | no analog |
| `dashboard/src/lib/wsClient.ts` | service (browser ws client) | streaming | RESEARCH.md Pattern 4 | no in-repo analog |
| `dashboard/src/lib/ptbBuilders.ts` | ts-svi-port (PTB builder) | request-response | **`scripts/two-protocol-ptb-demo.ts::buildPtb` lines 286-457** + `scripts/e2e-vault-cycle.ts:180-242` | **exact** |
| `dashboard/src/lib/format.ts` | utility | transform | `dashboard/src/lib/strategy_constants.ts` (consumes NAV_SCALE) | role-match |
| `dashboard/src/components/__tests__/*.test.tsx` | test | n/a | `dashboard/src/lib/__tests__/svi.test.ts:1-40` (vitest header) | partial |

### Existing files modified (CI / workspace)

| Modified File | Role | Action |
|---------------|------|--------|
| `.github/workflows/ci.yml` | config | extend existing `ts` job in-place (no new job per CONTEXT.md) |
| `pnpm-workspace.yaml` | config | already lists `dashboard`, `indexer` — no edit needed |
| `dashboard/package.json` | config | replace placeholder build/lint scripts; add Vite/React/dApp Kit/Plotly/Recharts deps |
| `indexer/package.json` | config | populate from scratch (@mysten/sui, ws, pino, dotenv, date-fns) |

### Existing files NEVER modified (forbidden by parity gate)

| Forbidden | Reason |
|-----------|--------|
| `dashboard/src/lib/svi.ts` | Phase 1 parity gate — CI forbidden-token grep targets this file |
| `dashboard/src/lib/phi.ts` | Phase 1 parity gate |
| `dashboard/src/lib/isqrt.ts` | Phase 1 parity gate |
| `dashboard/src/lib/ln.ts` | Phase 1 parity gate |
| `dashboard/src/lib/math.ts` | Phase 1 parity gate |
| `dashboard/src/lib/phi_coefficients.ts` | Phase 1 parity gate |
| `dashboard/src/lib/parity_runner.ts` | Phase 1 parity gate |
| `dashboard/src/lib/strategy_constants.ts` | codegen'd from `shared/strategy.toml` (CI codegen-drift job) |
| `dashboard/src/lib/arb_checker.ts` | Phase 1 — visualization-bound but locked surface; new files IMPORT only |
| `contracts/sources/*.move` | Phase 2 lock; new code reads event types, never edits |

## Pattern Assignments

### `dashboard/src/lib/ptbBuilders.ts` (ts-svi-port, request-response)

**Analog:** `scripts/two-protocol-ptb-demo.ts` (Phase 3 working PTB analog) + `scripts/e2e-vault-cycle.ts` (Phase 2 supply/redeem PTB)

**Imports pattern** (analog `scripts/two-protocol-ptb-demo.ts` lines 64-68 / `scripts/e2e-vault-cycle.ts:30-35`):
```typescript
import { Transaction } from '@mysten/sui/transactions';
// In two-protocol-ptb-demo the script uses /jsonRpc subpath:
//   import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
// dApp Kit consumers should use the dApp Kit hook `useSuiClient()`
// (SuiClient is auto-wired from SuiClientProvider). Reserve the explicit
// import for indexer code.
```

**Supply PTB pattern** (copy verbatim from `scripts/e2e-vault-cycle.ts:180-207`):
```typescript
const supplyTx = new Transaction();

// Split out exactly SUPPLY_AMOUNT_MICRO from the source coin
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
```

**KEY:** the `supply::supply` arg order is `(vault, predict_top_level, predict_manager, oracle_svi, deposit_coin, clock)` — verified against `contracts/sources/supply.move:61-69`. The on-chain `supply.move:supply` Move signature does NOT include `predict_top_level` parameter explicitly — but the working analog passes it as `tx.object(deploy.predict_top_level_id)` because Phase 2's atomic supply path requires both `&mut Predict` and `&mut PredictManager`. **Planner: re-verify against `contracts/sources/supply.move:61-69` and update analog if Phase 2 D-PUB-01 has revised the signature.**

**Redeem request PTB pattern** (`scripts/e2e-vault-cycle.ts:261-274`):
```typescript
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
```

**Redeem fulfill PTB pattern** (`scripts/e2e-vault-cycle.ts:317-329`):
```typescript
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
```

**Shared-object-ref rule (load-bearing):** ALL shared object args use `tx.sharedObjectRef({ objectId, mutable, initialSharedVersion })` — never `tx.object(sharedId)`. Clock (`0x6`) is the documented exception: it uses `tx.object('0x6')` per CLAUDE.md note 6 + the analog. Source: `scripts/e2e-vault-cycle.ts:23-24` comment block.

**Coin discovery + amount split pattern** (`scripts/e2e-vault-cycle.ts:116-131`):
```typescript
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
```

**dApp-kit-specific differences (NOT in analog):**
- dApp Kit consumers use `const client = useSuiClient()` instead of `new SuiClient({...})`.
- Signing: `const { mutate } = useSignAndExecuteTransaction()` instead of `client.signAndExecuteTransaction({ transaction, signer: keypair })`.
- The PTB builder returns a `Transaction` object; the React layer awaits the dApp Kit mutation with `{ onSuccess, onError }`.

---

### `indexer/src/relay.ts` (service entry, event-driven)

**Analog:** `scripts/e2e-vault-cycle.ts::main` (entry + graceful-skip gate) + `scripts/two-protocol-ptb-demo.ts::main` (same idiom)

**Entry guard pattern** (copy from `scripts/two-protocol-ptb-demo.ts:619-644`):
```typescript
export async function main(): Promise<void> {
    const deploy = loadDeploy();

    // Graceful-skip gate: vault not deployed yet.
    if (deploy.status !== 'deployed') {
        console.warn(
            `::warning::TESTNET-DEPLOY.json status='${deploy.status}'; ` +
                "expected 'deployed'. Snapshot-only mode (graceful exit 0). " +
                'Run scripts/e2e-vault-deploy.sh first.',
        );
        // Relay-specific divergence: do NOT exit; serve snapshot-only.
        // Logs the warning, omits live-poll loops, still binds wsServer.
        return startSnapshotOnlyMode(deploy);
    }
    // ... start polling loops
}
```

**Module-vs-direct-invocation guard** (copy verbatim from `scripts/two-protocol-ptb-demo.ts:701-709`):
```typescript
if (
    import.meta.url === `file://${process.argv[1]}` ||
    process.argv[1]?.endsWith('relay.ts')
) {
    main().catch((err) => {
        console.error(err);
        process.exit(1);
    });
}
```

---

### `indexer/src/deployInfo.ts` (utility, file-I/O)

**Analog:** `scripts/e2e-vault-cycle.ts:107-114` `loadDeploy()` — **exact match, copy verbatim**

```typescript
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

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
```

**Notes for planner:** The Phase 3 `scripts/two-protocol-ptb-demo.ts:88-120` extends this same shape with optional Margin fields (`margin_pkg?: string`, `dusdc_margin_pool_id?: string`, `oracle_svi_id?: string`). Phase 4 needs only the base shape + `oracle_svi_id?: string` (the OracleSVI shared object ID for `queryEvents` filter).

---

### `indexer/src/pollOracleSVI.ts` + `pollVaultEvents.ts` (event poller, event-driven)

**Analog (partial):** `scripts/two-protocol-ptb-demo.ts:466-491` (`signAndExecute`'s effects.status.status check pattern) + `scripts/e2e-vault-cycle.ts:220-231` (event find-by-suffix pattern).

The polling loop itself is **net-new** — RESEARCH.md Pattern 1 is the spec; no in-repo precedent.

**Event find-by-suffix pattern** (copy from `scripts/e2e-vault-cycle.ts:220-225`):
```typescript
const suppliedEvent = result.events?.find((e) =>
    e.type.endsWith('::supply::Supplied'),
);
const hedgeMintedEvent = result.events?.find((e) =>
    e.type.endsWith('::rebalance::HedgeMinted'),
);
```

**Pollable event surface** (from `contracts/sources/vault.move:142-242` + `oracle.move:58-66`):
```
- ${PREDICT_PKG}::oracle::OracleSVIUpdated      (high-frequency; separate cursor)
- ${VAULT_PKG}::vault::VaultCreated             (one-shot; ignore after first sighting)
- ${VAULT_PKG}::supply::Supplied                (per-deposit)
- ${VAULT_PKG}::redeem::RedeemRequested
- ${VAULT_PKG}::redeem::RedeemFulfilled
- ${VAULT_PKG}::redeem::RedeemCanceled
- ${VAULT_PKG}::rebalance::HedgeMinted
- ${VAULT_PKG}::rebalance::HedgeRolled
- ${VAULT_PKG}::vault::HedgeUnwound
- ${VAULT_PKG}::vault::Paused
- ${VAULT_PKG}::vault::AdminOverride
- ${VAULT_PKG}::vault::AdminTune
- ${VAULT_PKG}::vault::AdminUnwind
```
Note: vault.move re-declares mirror event structs (Supplied/RedeemRequested/RedeemFulfilled/RedeemCanceled/HedgeMinted/HedgeRolled) marked `#[allow(unused_field)]` — those are the surface-lock placeholders. The actual emission sites are in supply.move:110, redeem.move:90, rebalance.move:58+67. Use the EMIT-site qualified type (`::supply::Supplied` not `::vault::Supplied`).

---

### `indexer/src/decodeI64.ts` (utility, transform)

**No in-repo analog.** Source struct: `scripts/deepbookv3/packages/predict/sources/helper/i64.move:13-16`:

```move
public struct I64 has copy, drop, store {
    magnitude: u64,
    is_negative: bool,
}
```

**Concrete excerpt to emit (planner: this is the canonical decoder):**
```typescript
// indexer/src/decodeI64.ts
// Source: scripts/deepbookv3/packages/predict/sources/helper/i64.move:13-16
//
// CORRECTION vs RESEARCH.md A2: field name is `is_negative` (not `negative`).
// @mysten/sui parsedJson returns the struct verbatim from BCS-decoded layout.

export type RawI64 = { magnitude: string; is_negative: boolean };

/** Decode the Move I64 struct emitted by oracle::OracleSVIUpdated (rho, m).
 *  Returns a signed-integer string (preserves bigint precision, matches the
 *  u64-as-string JSON convention from Phase 3 WAVE0-DECISION.md Q5). */
export function decodeI64(raw: RawI64): string {
    const mag = BigInt(raw.magnitude);
    const signed = raw.is_negative ? -mag : mag;
    return signed.toString();
}
```

**Why this is correct (and RESEARCH.md A2 needs the correction):** I verified the actual Move struct definition at `scripts/deepbookv3/packages/predict/sources/helper/i64.move:13-16`. RESEARCH.md Pitfall 7 says `{ magnitude, negative }` — the real field is `is_negative`. Planner: ensure the decoder uses `is_negative` and the corresponding unit test (`indexer/src/__tests__/decodeI64.test.ts`) feeds in `{ magnitude: "1234", is_negative: true }`.

---

### `dashboard/src/components/panels/SurfacePanel.tsx` (plotly-3d, streaming)

**Analog (consumer of Phase 1 lib):** `dashboard/src/lib/svi.ts` lines 35-39 + 79-80 (export + algorithm signature).

**Imports pattern (the dashboard's load-bearing import of Phase 1 outputs):**
```typescript
import { totalVariance, type SVIParams } from '@/lib/svi';
import { STRATEGY_CONSTANTS } from '@/lib/strategy_constants';
import Plot from 'react-plotly.js';
import { useMemo, useState, useEffect } from 'react';
import type { Data, Layout } from 'plotly.js';
```

**Plotly memoization pattern:** RESEARCH.md Pattern 5 is the canonical recipe. There is no in-repo Plotly analog yet — the planner writes this fresh. Critical contract from CLAUDE.md "What NOT to Use":
- `useMemo` the `data` array keyed on `(svi, tenors)`
- `useMemo` the `layout` keyed on `(theme)` only (it's static otherwise)
- `revision: number` bumped via `useState`+`useEffect` on every snapshot timestamp change

**SVI-lib usage shape** (from `dashboard/src/lib/svi.ts:46-52`):
```typescript
export type SVIParams = {
  a: bigint;     // u64-equivalent, >= 0
  b: bigint;     // u64-equivalent, >= 0
  rho: bigint;   // signed; |rho| < F
  m: bigint;     // signed; smile center
  sigma: bigint; // u64-equivalent, > 0
};
```

**Reminder:** WS payload arrives with u64 as JSON STRING and i64 as decoded signed string (relay pre-decodes via decodeI64.ts). The SurfacePanel must convert these to `bigint` before calling `totalVariance(svi, k)`. Use `BigInt(payload.a)`, `BigInt(payload.rho_signed)`, etc.

---

### `dashboard/src/components/panels/ArbCheckerPanel.tsx` (recharts-2d, streaming)

**Analog (consumer of Phase 1 lib):** `dashboard/src/lib/arb_checker.ts:23-29` (return shape).

```typescript
// From dashboard/src/lib/arb_checker.ts
export type ArbResult = {
  paramsValid: boolean;
  minGk: bigint;       // bigint at FLOAT_SCALING (1e9)
  calendarPass: boolean;
  gK: bigint[];        // 200 points per STRATEGY_CONSTANTS.SVI_GRID_POINTS_FOR_ARB_CHECK
};
```

**Imports pattern:**
```typescript
import { checkArb, type ArbResult } from '@/lib/arb_checker';
import { type SVIParams } from '@/lib/svi';
import { LineChart, Line, XAxis, YAxis, ReferenceLine, ResponsiveContainer } from 'recharts';
```

**Render pattern (from UI-SPEC + RESEARCH.md Pitfall 3):**
- The component MUST plot the FULL 200-point gK array — never resample
- `<ReferenceLine y={0}>` at y=0 in `rose-600`
- gK array values are bigint at 1e9 — convert via `Number(g) / 1e9` for Recharts data (acceptable per arb_checker.ts:14-16 note: "arb_checker is NOT parity-bound … grid sampler may use Number/Math.*")

---

### `dashboard/src/components/panels/DepositWithdrawPanel.tsx` (dapp-kit-flow, request-response)

**Analog:** `scripts/e2e-vault-cycle.ts:165-242` (supply flow) — exact PTB shape

**dApp Kit hook pattern** (RESEARCH.md "Deposit flow with dApp Kit" — no in-repo analog because Phase 3 used raw keypair signing):
```typescript
import { useCurrentAccount, useSignAndExecuteTransaction, useSuiClient } from '@mysten/dapp-kit';
import { toast } from 'sonner';
import { buildSupplyTx } from '@/lib/ptbBuilders';

const account = useCurrentAccount();
const client = useSuiClient();
const { mutate: signAndExecute, isPending } = useSignAndExecuteTransaction();
```

**Pre-sign balance check pattern** (mirrors `scripts/e2e-vault-cycle.ts:116-131` `findDepositCoin`):
```typescript
const coins = await client.getCoins({ owner: account.address, coinType: env.dusdcType });
const totalBalance = coins.data.reduce((acc, c) => acc + BigInt(c.balance), 0n);
if (totalBalance < amount) {
    toast.error(`Insufficient DUSDC. You have ${formatDusdc(totalBalance)}; this deposit requires ${formatDusdc(amount)}.`);
    return;
}
```

**Signing + tx digest extraction** (mirrors `scripts/e2e-vault-cycle.ts:210-219` + `scripts/two-protocol-ptb-demo.ts:469-491` shape, adapted to dApp Kit hook):
```typescript
signAndExecute(
    { transaction: tx },
    {
        onSuccess: (result) => {
            toast.success('Deposit succeeded', {
                description: <TxDigestLink digest={result.digest} />,
            });
        },
        onError: (err) => {
            toast.error('Deposit failed', { description: err.message });
        },
    }
);
```

---

### `dashboard/src/hooks/useVaultState.ts` + `usePositions.ts` (react-query-hook, request-response)

**Analog:** `scripts/e2e-vault-cycle.ts:86-99` `snapshotVault()` — getObject + content/fields extraction

```typescript
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
```

**Wrap in React Query** (RESEARCH.md Pattern 7):
```typescript
import { useQuery } from '@tanstack/react-query';
import { useSuiClient } from '@mysten/dapp-kit';

export function useVaultState(vaultId: string) {
  const client = useSuiClient();
  return useQuery({
    queryKey: ['vault', vaultId],
    queryFn: () => snapshotVault(client, vaultId),
    staleTime: 5_000,
    refetchInterval: 10_000,
  });
}
```

---

### `dashboard/src/env.ts` (config)

**Analog:** `scripts/e2e-vault-cycle.ts:142-149` env validation block:
```typescript
const privateKey = process.env.SUI_PRIVATE_KEY;
if (!privateKey) {
    throw new Error('SUI_PRIVATE_KEY env var required for real-testnet cycle');
}
const oracleSviId = process.env.ORACLE_SVI_ID;
if (!oracleSviId) {
    throw new Error('ORACLE_SVI_ID env var required (BTC-USD OracleSVI shared object id)');
}
```

**Dashboard variant** (Vite `import.meta.env` instead of `process.env`):
```typescript
// dashboard/src/env.ts
const required = (key: string, value: string | undefined): string => {
    if (!value) throw new Error(`${key} env var required (set in .env or Vercel project)`);
    return value;
};

export const env = {
    relayWsUrl: required('VITE_RELAY_WS_URL', import.meta.env.VITE_RELAY_WS_URL),
    suiNetwork: (import.meta.env.VITE_SUI_NETWORK ?? 'testnet') as 'testnet' | 'mainnet',
    predictServerUrl: import.meta.env.VITE_PREDICT_SERVER_URL,
};
```

---

### Test files (`__tests__/*.test.{ts,tsx}`)

**Analog:** `dashboard/src/lib/__tests__/svi.test.ts:1-15` (vitest convention)

```typescript
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
// import the unit under test
```

**Vitest config (existing `dashboard/vitest.config.ts:1-16`):**
```typescript
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['src/lib/__tests__/**/*.test.ts'],
    globals: true,
    testTimeout: 30_000,
  },
});
```

**Phase 4 needs to EXTEND this** to add:
- `'src/**/__tests__/**/*.test.{ts,tsx}'` glob (components + hooks)
- `environment: 'jsdom'` for component tests
- `setupFiles: ['./vitest.setup.ts']` if jest-dom matchers added

## Shared Patterns

### Shared u64-as-string JSON convention

**Source:** Phase 3 WAVE0-DECISION.md Q5 (cited in `scripts/two-protocol-ptb-demo.ts:47-49` + `scripts/e2e-vault-cycle.ts:54-67`)
**Apply to:** Every WebSocket message payload, every getObject response field, every `tx.pure.u64` input.

```typescript
// SERIALIZE: bigint -> string
ts_ms: String(Date.now())                     // for Date.now() which returns Number
deposit_quote: SUPPLY_AMOUNT_MICRO.toString() // for bigint literals (note the `n` suffix on the bigint)

// PARSE: string -> bigint (browser side)
const balance = BigInt(payload.balance);
const navPerShare = BigInt(payload.nav_per_share);

// PRE-RPC: bigint -> tx.pure.u64
tx.pure.u64(amount)  // amount must be bigint
```

### Shared TESTNET-DEPLOY.json loader

**Source:** `scripts/e2e-vault-cycle.ts:37-114`
**Apply to:** `indexer/src/deployInfo.ts`, indirectly to `dashboard/src/env.ts` (dashboard reads pre-baked Vite env, but the relay reads the same JSON file).

**Phase 3 superset** (`scripts/two-protocol-ptb-demo.ts:88-120`): adds optional Margin pool fields. **Phase 4 only needs the base + optional `oracle_svi_id`.**

### Shared graceful-skip on pending deploy

**Source:** `scripts/two-protocol-ptb-demo.ts:623-631`
**Apply to:** `indexer/src/relay.ts` (snapshot-only mode); any CI step that runs the e2e flow.

```typescript
if (deploy.status !== 'deployed') {
    console.warn(
        `::warning::TESTNET-DEPLOY.json status='${deploy.status}'; expected 'deployed'. ` +
        '[snapshot-only mode | graceful exit 0].',
    );
    // Indexer: enter snapshot-only mode (still bind wsServer + healthz)
    // CI script: process.exit(0) — graceful skip, not failure
}
```

### Shared event find-by-suffix

**Source:** `scripts/e2e-vault-cycle.ts:220-231` + `scripts/two-protocol-ptb-demo.ts:515-540`
**Apply to:** `indexer/src/pollVaultEvents.ts`, `dashboard/src/hooks/usePositions.ts` (when filtering relay event stream).

```typescript
const suppliedEvent = events.find((e) => e.type.endsWith('::supply::Supplied'));
const hedgeMintedEvent = events.find((e) => e.type.endsWith('::rebalance::HedgeMinted'));
```

**Why suffix match (not exact):** The full type is `${PACKAGE_ID}::supply::Supplied` and `PACKAGE_ID` differs across testnet redeploys. Suffix match is robust to redeploy.

### Shared u64 overflow guard (Pitfall 8)

**Source:** RESEARCH.md Pitfall 8 + CLAUDE.md "u64 > 2^53 precision loss in JS Number"
**Apply to:** Every panel that renders a numeric value.

**Rule:** All numeric fields cross the relay/browser boundary as STRING. Parse with `BigInt()`. Render via `Intl.NumberFormat` on the bigint divided by `STRATEGY_CONSTANTS.NAV_SCALE` (10^9) or 1e6 for DUSDC.

```typescript
// dashboard/src/lib/format.ts (the central helper)
import { STRATEGY_CONSTANTS } from './strategy_constants';

const NAV_FMT = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 9,
    useGrouping: true,
});

export function formatNav(navBigint: bigint): string {
    // bigint / bigint -> bigint (truncating); for display, drop to Number after scaling down
    const scaled = Number(navBigint) / Number(STRATEGY_CONSTANTS.NAV_SCALE);
    return NAV_FMT.format(scaled);
}
```

### Shared static u64 type at the boundary

**Source:** `scripts/e2e-vault-cycle.ts:64-78` (SnapshotJson + Action types)
**Apply to:** Every relay-side type definition, every dashboard WebSocket message type.

```typescript
type SnapshotJson = {
    balance: string;        // u64-as-string
    total_assets: string;   // u64-as-string
    total_shares: string;   // u64-as-string
};
```

### Shared shared-object-ref construction

**Source:** `scripts/e2e-vault-cycle.ts:192-202` + `scripts/two-protocol-ptb-demo.ts:314-335`
**Apply to:** All PTB builder code in `dashboard/src/lib/ptbBuilders.ts`.

```typescript
tx.sharedObjectRef({
    objectId: deploy.vault_id,
    mutable: true,
    initialSharedVersion: deploy.vault_initial_shared_version,
})
```

**Never:** `tx.object(deploy.vault_id)` for shared objects. CLAUDE.md note 6 enforces this.
**Exception:** Clock `0x6` uses `tx.object('0x6')` per the analog.

### Shared `0x6` clock literal

**Source:** `scripts/e2e-vault-cycle.ts:205` + `scripts/two-protocol-ptb-demo.ts:337`
**Apply to:** Every PTB that touches a function with `clock: &Clock` in its Move signature.

```typescript
tx.object('0x6'),  // Clock
```

### Shared environment / dotenv pattern

**Source:** `scripts/e2e-vault-cycle.ts:142-148` (env validation)
**Apply to:** `indexer/src/relay.ts` (Node.js side, uses `process.env` + `dotenv`).

```typescript
import 'dotenv/config';
const required = (key: string): string => {
    const v = process.env[key];
    if (!v) throw new Error(`${key} env var required`);
    return v;
};
```

## No Analog Found

Files with no close match in the codebase. Planner should use RESEARCH.md patterns + external docs.

| File | Role | Data Flow | Reason | Use Instead |
|------|------|-----------|--------|-------------|
| `indexer/src/snapshot.ts` | in-memory store + ring buffer | event-driven | No event-driven services exist yet | RESEARCH.md "Snapshot store" code example |
| `indexer/src/wsServer.ts` | WebSocket server | streaming | No WS server in repo | RESEARCH.md Pattern 3 + `ws` npm docs |
| `indexer/src/cursor.ts` | atomic JSON write | file-I/O | No persistent-state files exist | RESEARCH.md Pattern 2 |
| `indexer/src/pollOracleSVI.ts` + `pollVaultEvents.ts` | RPC polling loop | event-driven / batch | No `queryEvents` polling exists | RESEARCH.md Pattern 1 |
| `dashboard/src/lib/wsClient.ts` | browser WebSocket client | streaming | No browser WS in repo | RESEARCH.md Pattern 4 |
| `dashboard/src/hooks/useWebSocket.ts` | React hook for WS | streaming | No React in repo (dashboard scaffold is lib-only) | RESEARCH.md Pattern 4 React wrapper |
| `dashboard/src/main.tsx` | provider stack | n/a | No React entry in repo | RESEARCH.md "Provider Stack" code example |
| `dashboard/src/components/**/*.tsx` (all panel components) | React components | various | No React components in repo | UI-SPEC component inventory + shadcn primitives |
| `dashboard/index.html`, `vite.config.ts`, `tailwind.config.ts`, etc. | tooling | n/a | No Vite/Tailwind in repo | shadcn CLI init + Vite docs |
| `dashboard/vercel.json` + `indexer/render.yaml` | deploy config | n/a | No deploy configs in repo | Vercel/Render docs + CLAUDE.md "Stack Patterns" |

**Critical reminder for the planner:** for the entire React + Vite + shadcn + Plotly + Recharts surface, **the closest in-repo analog is RESEARCH.md itself + UI-SPEC.md**, not source code. Treat the RESEARCH.md "Code Examples" section as the pattern primer and the UI-SPEC.md "Component Inventory" as the file-grain contract.

## Metadata

**Analog search scope:**
- `scripts/*.ts` — Phase 3 PTB analogs (e2e-vault-cycle.ts, two-protocol-ptb-demo.ts)
- `dashboard/src/lib/*.ts` — Phase 1 SVI library (parity-protected; new code IMPORTS unchanged)
- `dashboard/src/lib/__tests__/*.test.ts` — vitest convention
- `contracts/sources/*.move` — Move event struct field source-of-truth (Supply / Redeem / Rebalance / Vault events)
- `scripts/deepbookv3/packages/predict/sources/oracle.move` — `OracleSVIUpdated` struct (lines 58-66) + I64 helper (`helper/i64.move:13-16`)
- `.planning/phases/02-vault-move-package-testnet-deploy/TESTNET-DEPLOY.json` — deploy info shape (currently `pending_first_deploy`)
- `.github/workflows/*.yml` — CI matrix (extend `ts` job in-place per CONTEXT.md)
- `dashboard/{package.json,tsconfig.json,vitest.config.ts}` — placeholders to extend

**Files scanned:** ~50 (selected via Grep + Glob; not exhaustive — large-surface scaffolds are net-new per CONTEXT.md "Pre-existing dashboard scaffold" section).

**Pattern extraction date:** 2026-05-12

**Key insight for the planner:** The only files with an exact in-repo analog are:
1. `dashboard/src/lib/ptbBuilders.ts` ← `scripts/e2e-vault-cycle.ts` + `scripts/two-protocol-ptb-demo.ts`
2. `indexer/src/deployInfo.ts` ← `scripts/e2e-vault-cycle.ts:107-114`
3. PTB-shape-related portions of `DepositWithdrawPanel.tsx`, `useVaultState.ts`, `usePositions.ts`
4. The vitest test header convention
5. Phase 1 SVI lib import shape (consumed unchanged by `SurfacePanel`, `ArbCheckerPanel`, `WhatIfSimulator`)

Everything else — the React surface, Plotly/Recharts panels, shadcn UI, WebSocket client/server, queryEvents polling, cursor file I/O — is **net-new** and the planner should reference RESEARCH.md "Code Examples" + UI-SPEC.md "Component Inventory" + external docs directly.

**RESEARCH.md correction noted (Pitfall 7):** The actual I64 struct field name is `is_negative` (not `negative` as RESEARCH.md A2 assumed). Verified at `scripts/deepbookv3/packages/predict/sources/helper/i64.move:13-16`. Planner must propagate this correction to `indexer/src/decodeI64.ts` and any TypeScript types describing the raw I64 shape.
