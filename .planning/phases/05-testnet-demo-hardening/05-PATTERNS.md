# Phase 5: Mainnet Redeploy + Smoke Test - Pattern Map

**Mapped:** 2026-05-13
**Files analyzed:** 11 (8 new, 3 modified)
**Analogs found:** 10 / 11 (1 file has no codebase analog — `keepalive-relay.yml` doesn't exist; we use `monday-predict-check.yml` + `nightly-e2e-vault.yml` instead)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `scripts/preflight.sh` (new) | script (gate) | local-shell → assert-fail | `scripts/verify-deepbookv3-pin.sh` + `scripts/e2e-vault-deploy.sh` (§1-3) | role-match (composite) |
| `scripts/mainnet-deploy.sh` (new) | script (publish) | shell → Sui CLI → JSON artifact | `scripts/e2e-vault-deploy.sh` | exact (fork ~90%) |
| `scripts/mainnet-smoke-test.sh` (new) | script (orchestrator) | shell → tsx → events | `scripts/e2e-vault-cycle.sh` | exact (orchestrator shape) |
| `scripts/mainnet-smoke-test.ts` (new) | TS PTB driver | request-response + event verify | `scripts/e2e-vault-cycle.ts` | exact (fork + add NAV gates) |
| `scripts/predict-mainnet-check.sh` (new) | script (probe) | RPC → JSON → markdown report | `scripts/predict-diff.sh` | role-match (Issue-posting structure) |
| `.github/workflows/predict-mainnet-check.yml` (new) | CI workflow | cron → bash → Issue | `.github/workflows/monday-predict-check.yml` | exact (cron + Issue) |
| `config/mainnet.toml` (modify) | config (TBD-fill) | static config | `config/testnet.toml` | exact (schema parity) |
| `shared/strategy.toml` (modify) | config (codegen source) | shared constant | self (existing `[token_bucket]` block) | exact |
| `docs/MAINNET-FUNDING.md` (modify) | doc (playbook + receipts) | static markdown | self (append "Deploy Record" / "Smoke Test Receipts" sections) | exact |
| `README.md` (modify) | doc (status + addresses) | static markdown | self (existing `## Hosting` table) | exact |
| `.planning/phases/05-mainnet-redeploy-smoke-test/MAINNET-DEPLOY.json` (new artifact) | artifact (deploy-output) | shell-emit → git-commit | `.planning/phases/02-vault-move-package-testnet-deploy/TESTNET-DEPLOY.json` | exact (schema mirror) |

---

## Pattern Assignments

### `scripts/preflight.sh` (script, gate)

**Analogs:** `scripts/verify-deepbookv3-pin.sh` (one-shot gate idiom); `scripts/e2e-vault-deploy.sh` lines 1-66 (env scoping + active-env check + Move build).

**Header / shebang / set-euo (verify-deepbookv3-pin.sh lines 1-22):**
```bash
#!/usr/bin/env bash
# scripts/preflight.sh
# Mitigates RESEARCH.md Pitfall 14 (mainnet redeploy config drift) and Pitfall 6
# (Predict contract churn between probe and deploy).
#
# Exit codes:
#   0  All preflight assertions green; safe to publish.
#   1  One or more assertions failed (see stderr line for which).
#   2  Repo state precludes meaningful check (e.g. missing config file).

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"
```

**Active-env / SUI_CONFIG_DIR / Sui-CLI-version gate (adapted from e2e-vault-deploy.sh lines 58-66):**
```bash
# Step 2: SUI_CONFIG_DIR scoping (Phase 0 D-06 — NEVER use sui client switch)
if [[ -z "${SUI_CONFIG_DIR:-}" ]] || [[ "${SUI_CONFIG_DIR}" != *"sui_config_mainnet"* ]]; then
  echo "::error::SUI_CONFIG_DIR must be set and end in 'sui_config_mainnet'." >&2
  echo "         Run: SUI_CONFIG_DIR=~/.sui/sui_config_mainnet bash scripts/preflight.sh" >&2
  exit 1
fi

# Step 3: Active env is mainnet (defensive — should always be true with the above)
ENV_NAME="$(sui client active-env)"
if [[ "${ENV_NAME}" != "mainnet" ]]; then
  echo "::error::Active sui env is '${ENV_NAME}', expected 'mainnet'." >&2
  exit 1
fi
```

**Reusable helper sourcing (verify-deepbookv3-pin.sh from e2e-vault-deploy.sh lines 44-46):**
```bash
# Step 4: DeepBookV3 SHA pin (delegates to existing helper)
echo "==> Verifying DeepBookV3 SHA pin alignment..."
bash scripts/verify-deepbookv3-pin.sh
```

**TBD-slot grep pattern (NEW — Pitfall 14 specialization):**
```bash
# Step 13: every mainnet.toml TBD slot is filled (modulo [hosting] which is Phase 6
# and modulo [predict]/[oracle_svi]/[contingency] if predict_mainnet_shipped=false).
TBD_LINES="$(grep -nE '=\s*"TBD"' config/mainnet.toml \
              | grep -vE '^\s*[0-9]+:\s*(dashboard_url|relay_url)\s*=' || true)"
if [[ -n "${TBD_LINES}" ]]; then
  echo "::error::config/mainnet.toml has unfilled TBD slots:" >&2
  echo "${TBD_LINES}" >&2
  exit 1
fi
```

**Gas balance + USDsui balance gates (NEW — operational, references e2e-vault-deploy.sh lines 104-117 jq idiom):**
```bash
# Step 11: gas balance >= 10 SUI raw
GAS_MIST="$(sui client gas --json | jq -r '[.[].mistBalance | tonumber] | add // 0')"
if (( GAS_MIST < 10000000000 )); then
  echo "::error::Deploy wallet gas balance ${GAS_MIST} mist < 10 SUI." >&2
  exit 1
fi

# Step 12: USDsui balance >= 60 USDsui (50 smoke + 10 seed; see RESEARCH §"Gotchas" final row)
QUOTE_TYPE="$(grep -E '^quote_type_tag\s*=' config/mainnet.toml | sed -E 's/.*"([^"]+)".*/\1/')"
USDSUI_MICRO="$(sui client objects --json \
    | jq -r --arg type "${QUOTE_TYPE}" '
        [.[].data
         | select(.type == "0x2::coin::Coin<\($type)>")
         | (.content.fields.balance | tonumber)]
        | add // 0')"
if (( USDSUI_MICRO < 60000000 )); then
  echo "::error::USDsui balance ${USDSUI_MICRO} micro-units < 60_000_000 (60 USDsui)." >&2
  exit 1
fi
```

**Divergence from analogs:**
- No publish or PTB calls — preflight is **assert-only**.
- Targets mainnet keystore (`SUI_CONFIG_DIR`) where `e2e-vault-deploy.sh` is testnet-default (no env scoping).
- Contingency-aware: if `predict_mainnet_shipped=false`, the `[predict]` and `[oracle_svi]` TBDs are exempt from Step 13.

**Reusable helpers to import:**
- `scripts/verify-deepbookv3-pin.sh` (source via `bash` invocation, line 4 of pattern above)
- jq parsing idiom from `e2e-vault-deploy.sh` lines 107-111 (Coin<T> filter)

---

### `scripts/mainnet-deploy.sh` (script, publish)

**Analog:** `scripts/e2e-vault-deploy.sh` (direct fork ~90%).

**Top-of-file constants block (e2e-vault-deploy.sh lines 31-40):**
```bash
set -euo pipefail
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

# Mainnet variant: quote type comes from config/mainnet.toml, NOT hardcoded.
QUOTE_TYPE="$(grep -E '^quote_type_tag\s*=' config/mainnet.toml | sed -E 's/.*"([^"]+)".*/\1/')"
SEED_AMOUNT_MICRO=10000000  # 10 USDsui at 6 decimals (matches testnet seed)
```

**Pin verification + Move build (e2e-vault-deploy.sh lines 42-53):**
```bash
# 1. Pin verification gate (Pitfall 6) — identical to testnet
echo "==> Verifying DeepBookV3 SHA pin alignment..."
bash scripts/verify-deepbookv3-pin.sh

# 2. Build (drives Move.toml dependency resolution)
echo "==> Building deepvault package..."
(cd contracts && sui move build)
```

**Active-env assertion (e2e-vault-deploy.sh lines 58-66, but swap `testnet` -> `mainnet`):**
```bash
DEPLOYER_ADDR="$(sui client active-address)"
echo "==> Active deployer: ${DEPLOYER_ADDR}"

ENV_NAME="$(sui client active-env)"
if [[ "${ENV_NAME}" != "mainnet" ]]; then  # DIVERGENCE: testnet -> mainnet
  echo "::error::Active sui env is '${ENV_NAME}', expected 'mainnet'." >&2
  exit 1
fi
```

**Publish + parse package_id (e2e-vault-deploy.sh lines 71-83):**
```bash
echo "==> Publishing deepvault package on mainnet..."
PUBLISH_JSON="$(cd contracts && sui client publish \
    --gas-budget 1000000000 \
    --json)"   # DIVERGENCE: gas-budget 1.0 SUI (mainnet) vs 0.5 SUI (testnet)

PACKAGE_ID="$(echo "${PUBLISH_JSON}" \
    | jq -r '.objectChanges[] | select(.type == "published") | .packageId')"
```

**Capture PendingTreasury / seed coin / create_vault — identical structure (e2e-vault-deploy.sh lines 85-150):**
```bash
PENDING_TREASURY_ID="$(echo "${PUBLISH_JSON}" \
    | jq -r --arg pkg "${PACKAGE_ID}" '
        .objectChanges[]
        | select(.type == "created")
        | select(.objectType == "\($pkg)::share::PendingTreasury")
        | .objectId')"
# ... [identical seed-coin locate + split + create_vault sequence] ...
```

**AdminCap owner verification (NEW gate — RESEARCH §"AdminCap verification" lines 155-168):**
```bash
ADMIN_CAP_OWNER="$(echo "${CREATE_JSON}" \
    | jq -r --arg pkg "${PACKAGE_ID}" '
        .objectChanges[]
        | select(.type == "created")
        | select(.objectType == "\($pkg)::vault::AdminCap")
        | .owner.AddressOwner')"

if [[ "${ADMIN_CAP_OWNER}" != "${DEPLOYER_ADDR}" ]]; then
  echo "::error::AdminCap owner ${ADMIN_CAP_OWNER} != deployer ${DEPLOYER_ADDR}" >&2
  exit 1
fi
```

**MAINNET-DEPLOY.json emit (mirror of e2e-vault-deploy.sh lines 204-226):**
```bash
OUT_FILE=".planning/phases/05-mainnet-redeploy-smoke-test/MAINNET-DEPLOY.json"
DEPLOYED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

cat > "${OUT_FILE}" <<EOF
{
  "network": "mainnet",
  "status": "deployed",
  "deployed_at_iso": "${DEPLOYED_AT}",
  "deploy_tx_digest": "${DEPLOY_TX_DIGEST}",
  "deployer": "${DEPLOYER_ADDR}",
  "package_id": "${PACKAGE_ID}",
  "vault_id": "${VAULT_ID}",
  "vault_initial_shared_version": ${VAULT_INIT_SHARED_VER},
  "admin_cap_id": "${ADMIN_CAP_ID}",
  "predict_manager_id": "${PREDICT_MGR_ID}",
  "predict_manager_initial_shared_version": ${PREDICT_MGR_INIT_SHARED_VER},
  "predict_package_id": "${PREDICT_PACKAGE_ID}",
  "predict_registry_id": "${PREDICT_REGISTRY_ID}",
  "predict_top_level_id": "${PREDICT_TOP_LEVEL_ID}",
  "quote_type_tag": "${QUOTE_TYPE}",
  "dusdc_type_tag": "${QUOTE_TYPE}"
}
EOF
```

**Divergence points (vs testnet `e2e-vault-deploy.sh`):**
1. `--gas-budget 1000000000` for publish (1.0 SUI, vs testnet 0.5 SUI; RESEARCH §"Sui mainnet publish mechanics" point 5).
2. `ENV_NAME != "mainnet"` (was `!= "testnet"`).
3. Hardcoded `DUSDC_TYPE`/`PREDICT_PACKAGE_ID` constants are replaced with values **read from `config/mainnet.toml`** (Pitfall 14 mitigation — single source of truth).
4. Output path `.planning/phases/05-mainnet-redeploy-smoke-test/MAINNET-DEPLOY.json`.
5. `network: "mainnet"` in JSON; `quote_type_tag` is the canonical field name with `dusdc_type_tag` as alias for backward compat (RESEARCH §"MAINNET-DEPLOY.json Schema" — Open Question 2).
6. AdminCap owner explicit verification gate before the JSON emit (RESEARCH lines 153-168).
7. Implicitly assumes `bash scripts/preflight.sh` was just run; deploy script does NOT re-run preflight (separation of concerns).

**Reusable helpers:**
- `scripts/verify-deepbookv3-pin.sh` (source via `bash` invocation)
- e2e-vault-deploy.sh lines 102-137 seed-coin locate + split sequence — reuse verbatim with `QUOTE_TYPE` swapped in.

---

### `scripts/mainnet-smoke-test.sh` (script, orchestrator)

**Analog:** `scripts/e2e-vault-cycle.sh` (orchestrator that delegates to tsx).

**Header + repo root (e2e-vault-cycle.sh lines 1-30):**
```bash
#!/usr/bin/env bash
# scripts/mainnet-smoke-test.sh
# Mainnet $50 USDsui round-trip with staged ±10 bps NAV verification (D-02 / D-03).
#
# Steps:
#   1. assert preflight is green (re-run; idempotent)
#   2. assert MAINNET-DEPLOY.json exists (status=="deployed")
#   3. cd dashboard/ ; npx tsx ../scripts/mainnet-smoke-test.ts
#   4. on TS exit 0: append smoke-test receipts to docs/MAINNET-FUNDING.md
#
# DEPLOY-04 closure. Hard deadline 2026-06-12.

set -euo pipefail
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"
```

**Deploy-JSON gate (e2e-vault-cycle.sh lines 60-81; swap the path):**
```bash
DEPLOY_JSON=".planning/phases/05-mainnet-redeploy-smoke-test/MAINNET-DEPLOY.json"
if [[ ! -f "${DEPLOY_JSON}" ]]; then
  echo "::error::${DEPLOY_JSON} not found. Run scripts/mainnet-deploy.sh first." >&2
  exit 2
fi

DEPLOY_STATUS="$(jq -r '.status // "unknown"' "${DEPLOY_JSON}")"
if [[ "${DEPLOY_STATUS}" != "deployed" ]]; then
  echo "::error::MAINNET-DEPLOY.json status='${DEPLOY_STATUS}'; expected 'deployed'." >&2
  exit 2
fi
```

**TS driver invocation (e2e-vault-cycle.sh lines 86-92):**
```bash
echo "==> Running TS PTB driver (mainnet, real wall-clock cooldown ~1h)..."
cd "${REPO_ROOT}/dashboard"
npx tsx ../scripts/mainnet-smoke-test.ts
```

**Divergence:** No `FAST_FORWARD` branch — mainnet smoke is always real-wall-clock (the hermetic path is testnet-only). Targets `MAINNET-DEPLOY.json` not `TESTNET-DEPLOY.json`. Adds a post-flight ledger update step (append tx digests + receipts to `docs/MAINNET-FUNDING.md`).

**Reusable helpers:** Same Node 22 + tsx setup as nightly-e2e-vault.yml lines 32-47.

---

### `scripts/mainnet-smoke-test.ts` (TS PTB driver, request-response + event verify)

**Analog:** `scripts/e2e-vault-cycle.ts` (direct fork; ~95% identical).

**Imports + DeployJson type (e2e-vault-cycle.ts lines 30-50):**
```typescript
import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Transaction } from '@mysten/sui/transactions';
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { STRATEGY_CONSTANTS } from '../dashboard/src/lib/strategy_constants';

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
    quote_type_tag: string;  // DIVERGENCE: was `dusdc_type_tag` on testnet
};
```

**snapshotVault helper (e2e-vault-cycle.ts lines 86-99 — copy verbatim, then extend):**
```typescript
async function snapshotVault(client: SuiClient, vaultId: string): Promise<SnapshotJson> {
    const obj = await client.getObject({ id: vaultId, options: { showContent: true } });
    const content = obj.data?.content;
    const fields = content && content.dataType === 'moveObject'
        ? ((content.fields as Record<string, unknown>) ?? {})
        : {};
    return {
        balance: String(fields.balance ?? '0'),
        total_assets: String(fields.total_assets ?? '0'),
        total_shares: String(fields.total_shares_supply ?? '0'),
    };
}

// NEW (mainnet smoke): NAV-per-share computed in TS (RESEARCH "Plan A").
function navPerShareScaled1e9(snap: SnapshotJson): bigint {
    const ta = BigInt(snap.total_assets);
    const ts = BigInt(snap.total_shares);
    if (ts === 0n) return 0n;
    return (ta * 1_000_000_000n) / ts;
}
```

**Mainnet client URL (e2e-vault-cycle.ts line 151 — swap):**
```typescript
// DIVERGENCE: getFullnodeUrl('mainnet') instead of 'testnet'
const client = new SuiClient({ url: getFullnodeUrl('mainnet') });
```

**Supply PTB (e2e-vault-cycle.ts lines 180-207 — identical shape, but typeArguments use mainnet quote_type_tag):**
```typescript
const supplyTx = new Transaction();
const [depositCoin] = supplyTx.splitCoins(supplyTx.object(depositCoinId), [
    supplyTx.pure.u64(SUPPLY_AMOUNT_MICRO),  // 50_000_000n for mainnet
]);
supplyTx.moveCall({
    target: `${deploy.package_id}::supply::supply`,
    typeArguments: [deploy.quote_type_tag],   // DIVERGENCE: was dusdc_type_tag
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
        supplyTx.object('0x6'),  // Clock
    ],
});
```

**Event-verification pattern (e2e-vault-cycle.ts lines 220-231 — copy verbatim):**
```typescript
const suppliedEvent = supplyResult.events?.find((e) =>
    e.type.endsWith('::supply::Supplied'));
const hedgeMintedEvent = supplyResult.events?.find((e) =>
    e.type.endsWith('::rebalance::HedgeMinted'));
if (!suppliedEvent || !hedgeMintedEvent) {
    throw new Error('Expected Supplied + HedgeMinted events');
}
```

**±10 bps tolerance gate (NEW — RESEARCH §"±10 bps tolerance gate" + RESEARCH §"Validation Architecture" INV-6/INV-7):**
```typescript
// Gate 5: post-redeem NAV-per-share vs (pre-deposit NAV - realized hedge cost)
// Per-depositor framing (RESEARCH §"Refined formula"):
//   received_quote / deposited_quote >= 1.0 - hedge_alloc_bps/10000 - 0.001
const receivedQuote = BigInt(/* coin balance returned from redeem_fulfill */);
const depositedQuote = SUPPLY_AMOUNT_MICRO;  // 50_000_000n
const hedgeAllocBps = BigInt(STRATEGY_CONSTANTS.ALLOCATION_BPS);  // 1000 = 10%
const slackBps = 10n;  // ±10 bps per D-03
const minReceived = (depositedQuote * (10_000n - hedgeAllocBps - slackBps)) / 10_000n;
if (receivedQuote < minReceived) {
    throw new Error(
        `Per-depositor tolerance FAIL: received ${receivedQuote} < min ${minReceived}` +
        ` (deposited ${depositedQuote}, hedge_alloc=${hedgeAllocBps}bps, slack=${slackBps}bps)`,
    );
}

// Vault NAV framing (sanity check):
const navDeltaScaled = (navPost - navPre) * 10_000n;
const navDeltaBps = (navDeltaScaled < 0n ? -navDeltaScaled : navDeltaScaled) / navPre;
if (navDeltaBps > 10n) {
    throw new Error(`NAV-per-share moved ${navDeltaBps} bps > 10 bps threshold`);
}
```

**Wait-time from codegen constant (NEW — RESEARCH §"Token-bucket wait time" Open Question 3 recommendation):**
```typescript
// After Phase 5 extends strategy.toml with [redemption].cooldown_ms (option (a)):
const COOLDOWN_MS = Number(STRATEGY_CONSTANTS.REDEMPTION_COOLDOWN_MS) + 5000;  // +5s buffer
// Until then, mirror redeem.move L40 hardcoded const:
//   const COOLDOWN_MS = 60 * 60 * 1000 + 5000;  // (analog: e2e-vault-cycle.ts L102)
```

**Divergence points (vs `e2e-vault-cycle.ts`):**
1. `getFullnodeUrl('mainnet')` (was `'testnet'`).
2. `quote_type_tag` field name on `DeployJson` (was `dusdc_type_tag`).
3. `SUPPLY_AMOUNT_MICRO = 50_000_000n` (was `100_000_000n` testnet — half the size for $50 mainnet smoke).
4. Two new snapshots: `preDepositNav` taken BEFORE supply step; `postRedeemNav` taken AFTER redeem_fulfill.
5. New ±10 bps assertion gates (per-depositor + vault NAV framing).
6. New AdminCap-owner verification at end-of-script (re-asserts INV-2).
7. Cooldown read from `STRATEGY_CONSTANTS.REDEMPTION_COOLDOWN_MS` (requires Phase 5 strategy.toml extension) — fallback to hardcoded `3_600_000` constant if Phase 5 defers the codegen extension.
8. Final `console.log` lines emit tx digests in a structured form that the orchestrator script greps and appends to `docs/MAINNET-FUNDING.md`.

**Reusable helpers / imports:**
- `STRATEGY_CONSTANTS` from `../dashboard/src/lib/strategy_constants.ts` (codegen output)
- `snapshotVault()` from `e2e-vault-cycle.ts` lines 86-99 (copy verbatim)
- `findDepositCoin()` from `e2e-vault-cycle.ts` lines 116-131 (copy verbatim)
- `Transaction.sharedObjectRef({objectId, mutable, initialSharedVersion})` PTB pattern from lines 192-202

---

### `scripts/predict-mainnet-check.sh` (script, RPC probe)

**Analog:** `scripts/predict-diff.sh` (Issue-posting structure: writes markdown report; workflow uploads it).

**Header + state + RPC URL (predict-diff.sh lines 1-24 adapted):**
```bash
#!/usr/bin/env bash
# scripts/predict-mainnet-check.sh
# DEPLOY-09 / D-09 — probe Sui mainnet for Predict package shipped status + ABI match.
# Writes a Markdown report to the path given as $1 (or /dev/stdout).
# NEVER auto-flips config/mainnet.toml — that is a human-merged commit (D-04).

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

OUTPUT="${1:-/dev/stdout}"
MAINNET_RPC="https://fullnode.mainnet.sui.io:443"
PREDICT_MAINNET_CANDIDATE="${PREDICT_MAINNET_CANDIDATE:-TBD}"
```

**RPC probe + verdict block (RESEARCH §"RPC probe pattern" lines 195-223):**
```bash
if [[ "${PREDICT_MAINNET_CANDIDATE}" == "TBD" ]]; then
  # Mysten has not announced a mainnet package; emit shipped:false
  VERDICT_JSON='{"shipped":false,"reason":"no candidate package id; awaiting Mysten announcement"}'
else
  RESP="$(curl -fsS "${MAINNET_RPC}" \
    -H 'content-type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"sui_getObject\",\"params\":[\"${PREDICT_MAINNET_CANDIDATE}\",{\"showType\":true,\"showContent\":true}]}")"
  if echo "${RESP}" | jq -e '.result.data' >/dev/null; then
    # Found — TODO Phase 5 plan: ABI-diff vs scripts/deepbookv3/packages/predict/sources/*.move
    VERDICT_JSON="$(printf '{"shipped":true,"package_id":"%s","abi_match":true}' \
      "${PREDICT_MAINNET_CANDIDATE}")"
  else
    VERDICT_JSON='{"shipped":false,"reason":"package not found on mainnet"}'
  fi
fi
```

**Markdown report heredoc (predict-diff.sh lines 107-145 pattern — verbatim shape):**
```bash
cat > "${OUTPUT}" <<EOF
# Predict Mainnet Check — $(date -u +%F)

**Run at:** $(date -u +%Y-%m-%dT%H:%M:%SZ)
**Result:** \`${VERDICT_JSON}\`

### Verdict for Phase 5 plan
- shipped=true + abi_match=yes: proceed with full PTB on mainnet
- shipped=true + abi_match=no:  HALT — re-integrate predict_adapter
- shipped=false: fallback to split-demo (D-05); set predict_mainnet_shipped=false

### Required human action
1. Review this Issue + diff
2. Edit config/mainnet.toml [contingency].predict_mainnet_shipped
3. Commit to master

### Raw probe output
\`\`\`json
${VERDICT_JSON}
\`\`\`
EOF
```

**Divergence (vs `predict-diff.sh`):**
- Doesn't compare git SHAs — compares live mainnet RPC state vs vendored testnet source.
- Doesn't read/write `.predict-diff-state` — Phase 5 is a one-shot check on 2026-06-09.
- The "watched paths" / commit-range logic is replaced with a single RPC call.
- No vendor-fork dependency (uses curl directly).

**Reusable helpers:**
- predict-diff.sh lines 107-145 heredoc structure (Markdown report shape)
- monday-predict-check.yml `peter-evans/create-issue-from-file@v6` action for Issue posting

---

### `.github/workflows/predict-mainnet-check.yml` (CI workflow, cron + Issue)

**Analog:** `.github/workflows/monday-predict-check.yml` (direct clone with cron swap).

**Header + cron + permissions (monday-predict-check.yml lines 1-19 — verbatim except cron):**
```yaml
# .github/workflows/predict-mainnet-check.yml
# DEPLOY-09 / D-09 contingency probe — fires once at 09:00 UTC 2026-06-09.
# Posts a triage Issue with the shipped:true/false + ABI-match verdict.
# Human reviews the Issue and merges a config/mainnet.toml commit to flip
# [contingency].predict_mainnet_shipped per D-04.
#
# CRITICAL: workflow must be merged to default branch (master) >= 1 week before
# 2026-06-09 for the schedule to fire (RESEARCH §"Cron mechanics" caveat 1).

name: Predict Mainnet Check (DEPLOY-09)

on:
  schedule:
    - cron: '0 9 9 6 *'    # 09:00 UTC on June 9 (RESEARCH §"Cron mechanics")
  workflow_dispatch: {}    # allow manual trigger for testing

permissions:
  issues: write
  contents: read
```

**Job + checkout + script invocation (monday-predict-check.yml lines 22-46):**
```yaml
jobs:
  probe:
    name: Probe mainnet for Predict package
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repo
        uses: actions/checkout@v4
        with:
          fetch-depth: 1    # DIVERGENCE: monday uses 0 (subtree grep); we don't need history

      - name: Run predict-mainnet-check
        id: probe
        env:
          PREDICT_MAINNET_CANDIDATE: ${{ vars.PREDICT_MAINNET_CANDIDATE }}
        run: |
          mkdir -p /tmp/check
          bash scripts/predict-mainnet-check.sh /tmp/check/report.md
          cat /tmp/check/report.md

      - name: Create Issue from report
        uses: peter-evans/create-issue-from-file@v6
        with:
          title: "Predict Mainnet Check — 2026-06-09"
          content-filepath: /tmp/check/report.md
          labels: |
            predict-mainnet
            triage
            blocking
```

**Divergence points (vs `monday-predict-check.yml`):**
- Cron `'0 9 9 6 *'` instead of `'0 14 * * 1'` (one-shot on June 9 vs every Monday).
- `fetch-depth: 1` (probe doesn't need full git history).
- `env: PREDICT_MAINNET_CANDIDATE: ${{ vars.PREDICT_MAINNET_CANDIDATE }}` (repo variable — set by human if Mysten announces a candidate package address).
- Issue title is dated, not run-id-keyed.
- Labels include `blocking` (this issue gates Phase 5 deploy).

**Reusable helpers:** `peter-evans/create-issue-from-file@v6` action (same as Phase 0).

---

### `config/mainnet.toml` (modify)

**Analog:** `config/testnet.toml` (schema parity — Pitfall 14).

**Schema must remain identical** — Phase 5 only fills TBD slots; no new keys, no removed keys, no key reorder.

**TBD slots Phase 5 fills (existing structure from `config/mainnet.toml` lines 20-49):**
```toml
[predict]
package_id = "<from PREDICT_MAINNET_CANDIDATE on 2026-06-09; or kept TBD if shipped=false>"
registry_id = "<from RPC discovery or Mysten announcement>"
top_level_shared_object_id = "<from RPC discovery>"
plp_type_tag = "<from RPC discovery>"

[deepbook_margin]
package_id = "<from DeepBook Margin mainnet docs>"
margin_pool_id = "<from RPC discovery>"

[oracle_svi]
event_module_full = "<from PREDICT_MAINNET_CANDIDATE>::oracle_svi::OracleSVIUpdated"

[assets]
quote_type_tag = "0x<USDSUI_PKG>::usdsui::USDSUI"   # captured at Cetus swap time

[deepvault]
package_id = "<from mainnet-deploy.sh output>"
vault_shared_object_id = "<from mainnet-deploy.sh output>"
admin_cap_id = "<from mainnet-deploy.sh output>"
treasury_cap_holder = "<deployer address>"
deploy_tx_digest = "<from mainnet-deploy.sh output>"

[contingency]
predict_mainnet_shipped = true   # or false if 2026-06-09 check returned shipped:false
```

**Reusable helpers:** Schema-mirror against `config/testnet.toml` lines 1-63 — Phase 5 plan must verify that for every key in testnet.toml there is an equivalent (possibly TBD-filled) key in mainnet.toml, and no extras.

---

### `shared/strategy.toml` (possibly modify)

**Analog:** Self — existing `[token_bucket]` block at lines 31-37 + `[meta]` block at lines 72-74.

**Possible addition (per RESEARCH Open Question 3 recommendation):**
```toml
[redemption]
# Redeem cooldown — must equal contracts/sources/redeem.move const COOLDOWN_MS.
# Codegen emits a SHARED constant; CI's codegen-drift job ensures Move-side
# const and codegen output match.
cooldown_ms = 3_600_000   # 1 hour = 60 * 60 * 1000
```

**Divergence:** Existing `redeem.move` line 40 declares `const COOLDOWN_MS: u64 = 3_600_000;`. The Phase 5 plan must decide between (a) extending strategy.toml + codegen and (b) deferring (use hardcoded constant in the TS smoke driver). Option (a) is RESEARCH-recommended.

**Reusable helpers:** Existing codegen pipeline (`scripts/codegen.py` → `dashboard/src/lib/strategy_constants.ts` lines 22-23 show the existing `TOKEN_BUCKET_*` constant export pattern). New constant would emit as `REDEMPTION_COOLDOWN_MS: 3600000n` to TS, `REDEMPTION_COOLDOWN_MS = 3_600_000` to Python.

---

### `docs/MAINNET-FUNDING.md` (modify)

**Analog:** Self — existing structure at C:\Users\Ben\Desktop\B3NSAG3\Hackathons\DeepVault\docs\MAINNET-FUNDING.md.

**Required modifications:**

1. **Step 2 budget correction (RESEARCH §"Mainnet-specific gotchas" final row + lines 401):**
   - Current line 38: "Swap ~$50 worth of SUI → USDsui"
   - Fix to: "Swap ~$60 worth of SUI → USDsui (10 USDsui for seed + 50 USDsui for smoke test)"
   - Update Step 1 to require ≥60 USDsui balance, not 50.

2. **Append "Mainnet Deploy Record" section (NEW, after Step 4):**
   ```markdown
   ## Mainnet Deploy Record (populated post-deploy)

   **Deploy date:** YYYY-MM-DD
   **Deploy tx digest:** [<digest>](https://suiscan.xyz/mainnet/tx/<digest>)
   **Deployer wallet:** <address>
   **Package ID:** `<package_id>`
   **Vault shared object:** `<vault_id>` (initial_shared_version `<n>`)
   **AdminCap holder:** `<address>` (deployer)
   **PredictManager shared object:** `<id>`
   **Quote type tag (USDsui):** `<type_tag>`
   **Gas spent (publish + create_vault):** ~<n> SUI

   See `.planning/phases/05-mainnet-redeploy-smoke-test/MAINNET-DEPLOY.json` for the canonical record.
   ```

3. **Append "Smoke Test Receipts" section (NEW, after Mainnet Deploy Record):**
   ```markdown
   ## Smoke Test Receipts (populated post-smoke)

   **Smoke date:** YYYY-MM-DD
   **Pre-deposit NAV-per-share:** <n> (scaled 1e9)
   **Supply tx:** [<digest>](https://suiscan.xyz/mainnet/tx/<digest>) — 50 USDsui deposited
   **HedgeMinted event cost_basis_quote:** <n> micro-USDsui (~$<n.nn>)
   **Redeem_request tx:** [<digest>](https://suiscan.xyz/mainnet/tx/<digest>)
   **Cooldown wait:** <n>s real wall-clock
   **Redeem_fulfill tx:** [<digest>](https://suiscan.xyz/mainnet/tx/<digest>) — received <n> USDsui
   **Post-redeem NAV-per-share:** <n> (scaled 1e9)
   **NAV delta:** <n> bps (<= 10 bps PASS / > 10 bps FAIL)
   **Per-depositor return ratio:** <n>% (>= 89.9% PASS)
   ```

4. **Fallback note (only if shipped=false on 2026-06-09):** Append a "Predict Mainnet Contingency Triggered" section recording the GitHub Issue link + the rationale for split-demo execution.

**Divergence:** None — same markdown shape as existing sections.

---

### `README.md` (modify)

**Analog:** Self — existing `## Hosting` table at lines 124-132 + existing build log at lines 145-156.

**Required modifications:**

1. **Update `## Status` block (lines 9-14)** — once smoke test passes, append "Phase 5 complete" line citing mainnet smoke-test tx digests.

2. **Update `## Hosting` table (lines 125-130)** — fill the mainnet row's URL once known, optionally add a column for mainnet Vault `Suiscan` link.

3. **Append "Mainnet" subsection under `## Architecture at a Glance`:** include mainnet package ID + vault shared object ID + deploy tx digest as a one-line citation pointing at `MAINNET-DEPLOY.json`.

4. **Append Week 5 build-log bullets (lines 145-156 pattern):**
   ```markdown
   ### Week 5 (2026-06-09 to 2026-06-15)

   - **Phase 5 (Mainnet Redeploy + Smoke Test) completed** — deepvault published on Sui mainnet,
     $50 USDsui smoke test executed within ±10 bps NAV tolerance per D-03.
   - Mainnet package: `<package_id>` ([suiscan](https://suiscan.xyz/mainnet/object/<package_id>))
   - Mainnet vault shared object: `<vault_id>`
   - AdminCap held by deploy wallet `<address>` (single-key per Phase 0 D-06).
   - Predict-mainnet contingency status: shipped=<true|false>; <action taken>.
   - DEPLOY-01..04 + DEPLOY-09 requirements closed.
   ```

**Divergence:** None — same prose + table style.

---

### `.planning/phases/05-mainnet-redeploy-smoke-test/MAINNET-DEPLOY.json` (new artifact)

**Analog:** `.planning/phases/02-vault-move-package-testnet-deploy/TESTNET-DEPLOY.json` (schema mirror).

**Pre-deploy placeholder shape (mirror of TESTNET-DEPLOY.json placeholder content lines 1-17):**
```json
{
  "network": "mainnet",
  "status": "pending_first_deploy",
  "deployed_at_iso": "PENDING",
  "deploy_tx_digest": "PENDING",
  "deployer": "PENDING",
  "package_id": "PENDING",
  "vault_id": "PENDING",
  "vault_initial_shared_version": 0,
  "admin_cap_id": "PENDING",
  "predict_manager_id": "PENDING",
  "predict_manager_initial_shared_version": 0,
  "predict_package_id": "TBD",
  "predict_registry_id": "TBD",
  "predict_top_level_id": "TBD",
  "quote_type_tag": "TBD",
  "dusdc_type_tag": "TBD"
}
```

**Post-deploy shape:** Identical structure to `TESTNET-DEPLOY.json` after a successful deploy, but `network: "mainnet"`, real values, and adds `quote_type_tag` as the canonical field with `dusdc_type_tag` as alias.

**Divergence (vs Phase 2 TESTNET-DEPLOY.json lines 1-17):**
- `network: "mainnet"` (not `"testnet"`).
- `quote_type_tag` is the canonical field name (Phase 4 dashboard may still read `dusdc_type_tag` — keep as alias per RESEARCH Open Question 2).
- All Predict fields will be **TBD** if the 2026-06-09 contingency returns shipped=false (fallback path).
- Deploy script writes this file; downstream phases read it.

---

## Shared Patterns

### `SUI_CONFIG_DIR` Scoping
**Source:** Phase 0 D-06 (CLAUDE.md / docs/MAINNET-FUNDING.md lines 13-14)
**Apply to:** `scripts/preflight.sh`, `scripts/mainnet-deploy.sh`, `scripts/mainnet-smoke-test.sh`
```bash
# Caller invocation pattern (Phase 0 D-06):
SUI_CONFIG_DIR=~/.sui/sui_config_mainnet bash scripts/preflight.sh
SUI_CONFIG_DIR=~/.sui/sui_config_mainnet bash scripts/mainnet-deploy.sh

# Inside the script, defensive assertion:
if [[ -z "${SUI_CONFIG_DIR:-}" ]] || [[ "${SUI_CONFIG_DIR}" != *"sui_config_mainnet"* ]]; then
  echo "::error::SUI_CONFIG_DIR must end in 'sui_config_mainnet'" >&2
  exit 1
fi
```
**Why:** Phase 0 D-06 forbids `sui client switch --env mainnet` (ambient state risk). Every mainnet command must be explicitly scoped.

### Strict bash mode
**Source:** `scripts/e2e-vault-deploy.sh` line 31, `scripts/verify-deepbookv3-pin.sh` line 18, `scripts/predict-diff.sh` line 17
**Apply to:** All new `scripts/*.sh` Phase 5 files
```bash
set -euo pipefail
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"
```

### sui CLI publish JSON parsing
**Source:** `scripts/e2e-vault-deploy.sh` lines 71-100
**Apply to:** `scripts/mainnet-deploy.sh`
```bash
PUBLISH_JSON="$(cd contracts && sui client publish --gas-budget <N> --json)"
PACKAGE_ID="$(echo "${PUBLISH_JSON}" | jq -r '.objectChanges[] | select(.type == "published") | .packageId')"

if [[ -z "${PACKAGE_ID}" ]] || [[ "${PACKAGE_ID}" == "null" ]]; then
  echo "::error::Could not parse package_id from publish output." >&2
  echo "${PUBLISH_JSON}" >&2
  exit 1
fi
```

### sui client call JSON parsing for objectChanges
**Source:** `scripts/e2e-vault-deploy.sh` lines 154-200
**Apply to:** `scripts/mainnet-deploy.sh`
```bash
# Pattern: jq with --arg pkg "${PACKAGE_ID}" + select(.type == "created") + select(.objectType ...)
ADMIN_CAP_ID="$(echo "${CREATE_JSON}" \
    | jq -r --arg pkg "${PACKAGE_ID}" '
        .objectChanges[]
        | select(.type == "created")
        | select(.objectType == "\($pkg)::vault::AdminCap")
        | .objectId')"

# All extracted IDs assert non-empty/non-null:
for var in PACKAGE_ID VAULT_ID ADMIN_CAP_ID PREDICT_MGR_ID; do
  eval "val=\${$var}"
  if [[ -z "${val}" ]] || [[ "${val}" == "null" ]]; then
    echo "::error::Could not parse ${var}" >&2; exit 1
  fi
done
```

### Codegen-driven constant import (TS side)
**Source:** `dashboard/src/lib/strategy_constants.ts` lines 1-50 (codegen output)
**Apply to:** `scripts/mainnet-smoke-test.ts`
```typescript
import { STRATEGY_CONSTANTS } from '../dashboard/src/lib/strategy_constants';

const allocBps = BigInt(STRATEGY_CONSTANTS.ALLOCATION_BPS);  // 1000 = 10%
const cooldownMs = Number(STRATEGY_CONSTANTS.REDEMPTION_COOLDOWN_MS);  // new key (Phase 5 codegen extension)
```
**Why:** RESEARCH §"Token-bucket wait time" — no hardcoded waits; all constants flow from `shared/strategy.toml`.

### Shared object ref pattern in PTBs
**Source:** `scripts/e2e-vault-cycle.ts` lines 192-202
**Apply to:** `scripts/mainnet-smoke-test.ts` (all 3 PTBs)
```typescript
tx.sharedObjectRef({
    objectId: deploy.vault_id,
    mutable: true,
    initialSharedVersion: deploy.vault_initial_shared_version,
})
```
**Why:** CLAUDE.md note 6 — never pass shared objects as plain object IDs. The `initial_shared_version` is captured at publish time in MAINNET-DEPLOY.json.

### Event-verification idiom
**Source:** `scripts/e2e-vault-cycle.ts` lines 220-231, 342-350
**Apply to:** `scripts/mainnet-smoke-test.ts` (all 3 stages)
```typescript
const result = await client.signAndExecuteTransaction({
    transaction: tx,
    signer: keypair,
    options: { showEffects: true, showEvents: true },
});
if (result.effects?.status?.status !== 'success') {
    throw new Error(`tx failed: ${JSON.stringify(result.effects?.status)}`);
}
const event = result.events?.find((e) => e.type.endsWith('::module::EventName'));
if (!event) throw new Error('Expected EventName event; saw: ' + JSON.stringify(result.events));
```

### GitHub Actions cron + Issue posting
**Source:** `.github/workflows/monday-predict-check.yml` lines 12-46
**Apply to:** `.github/workflows/predict-mainnet-check.yml`
```yaml
on:
  schedule:
    - cron: '<5-field UTC cron>'
  workflow_dispatch: {}

permissions:
  issues: write
  contents: read

jobs:
  <jobname>:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run script
        run: bash scripts/<script>.sh /tmp/out/report.md
      - name: Create Issue from report
        uses: peter-evans/create-issue-from-file@v6
        with:
          title: "<title>"
          content-filepath: /tmp/out/report.md
          labels: |
            <label1>
            <label2>
```
**Why:** RESEARCH §"Cron mechanics" — same action, same permission set, same Issue body shape across Phase 0 (monday-predict-check) and Phase 5 (predict-mainnet-check).

### Markdown report heredoc
**Source:** `scripts/predict-diff.sh` lines 107-145
**Apply to:** `scripts/predict-mainnet-check.sh`
```bash
cat > "${OUTPUT}" <<EOF
# <Title> — $(date -u +%F)

**Status:** ...

\`\`\`json
${VERDICT_JSON}
\`\`\`

## Required human action
1. ...
2. ...
EOF
```

### Sui CLI install in CI
**Source:** `.github/workflows/nightly-e2e-vault.yml` lines 49-58
**Apply to:** `.github/workflows/predict-mainnet-check.yml` (NOT NEEDED — predict-check script uses curl + jq only, no sui CLI; but reference this if mainnet-deploy is ever CI'd)
```yaml
- name: Install Sui CLI (mainnet-v1.71.1)
  run: |
    set -euo pipefail
    SUI_VERSION="mainnet-v1.71.1"
    ASSET="sui-${SUI_VERSION}-ubuntu-x86_64.tgz"
    URL="https://github.com/MystenLabs/sui/releases/download/${SUI_VERSION}/${ASSET}"
    curl -fsSL "${URL}" -o /tmp/sui.tgz
    mkdir -p "$HOME/.sui/bin"
    tar -xzf /tmp/sui.tgz -C "$HOME/.sui/bin"
    echo "$HOME/.sui/bin" >> "$GITHUB_PATH"
```

---

## No Analog Found

No file in this phase is without an analog — every Phase 5 file has a clear codebase parent. The "weakest" analog is `scripts/predict-mainnet-check.sh` (analog `scripts/predict-diff.sh` shares only the Issue-posting and markdown-heredoc structure; the actual probe logic — curl + jq against mainnet RPC — is novel).

**Note on `.github/workflows/keepalive-relay.yml`:** The orchestrator-provided file list mentioned this as a possible analog, but it **does not exist** in this repo (no `keepalive-relay.yml`). The closest cron-shape analogs are `.github/workflows/monday-predict-check.yml` (cron + Issue) and `.github/workflows/nightly-e2e-vault.yml` (cron + setup-node + sui-cli). Use `monday-predict-check.yml` as the primary template; pull Sui-CLI-install step from `nightly-e2e-vault.yml` only if needed (probe script does not need it).

---

## Reusable Helper Inventory

| Helper | Path | Used By |
|--------|------|---------|
| DeepBookV3 SHA-pin gate | `scripts/verify-deepbookv3-pin.sh` | `preflight.sh`, `mainnet-deploy.sh` |
| Codegen TS constants | `dashboard/src/lib/strategy_constants.ts` | `mainnet-smoke-test.ts` |
| Codegen Python constants | `backtest/src/deepvault/strategy_constants.py` | (not used by Phase 5 directly; available if needed) |
| Codegen Move constants | `contracts/sources/strategy_constants.move` | (not used by Phase 5 directly; consumed by on-chain code) |
| Issue-from-file action | `peter-evans/create-issue-from-file@v6` (GitHub Marketplace) | `predict-mainnet-check.yml` |
| Sui-CLI tarball install | `.github/workflows/nightly-e2e-vault.yml` lines 49-58 (copy block) | (only if Phase 5 adds a CI'd deploy job — not currently planned) |

---

## Metadata

**Analog search scope:**
- `scripts/*.{sh,ts}` (10 files inspected)
- `.github/workflows/*.yml` (5 files inspected)
- `config/*.toml` (2 files inspected)
- `shared/*.toml` (2 files inspected)
- `dashboard/src/lib/*.ts` (codegen output)
- `contracts/sources/*.move` (codegen output + redeem.move COOLDOWN_MS)
- `.planning/phases/02-vault-move-package-testnet-deploy/TESTNET-DEPLOY.json` (placeholder shape)
- `docs/MAINNET-FUNDING.md` + `README.md` (doc-append targets)

**Files scanned:** ~25
**Pattern extraction date:** 2026-05-13
