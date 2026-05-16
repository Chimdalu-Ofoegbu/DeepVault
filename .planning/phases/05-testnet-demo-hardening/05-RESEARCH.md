# Phase 5: Mainnet Redeploy + Smoke Test - Research

**Researched:** 2026-05-13
**Domain:** Sui mainnet Move-package publish, USDsui acquisition, on-chain smoke testing, GitHub Actions scheduled contingency cron
**Confidence:** HIGH on reusable testnet machinery and CI shape; MEDIUM on USDsui canonical type tag (must verify at swap time); LOW on Predict-mainnet ABI (does not yet exist publicly as of research date)

## Summary

Phase 5 is the smallest-code-change, highest-operational-stakes phase in the project. ~90% of the script logic already exists in `scripts/e2e-vault-deploy.sh` and `scripts/e2e-vault-cycle.{sh,ts}`; the work is forking those into mainnet variants with `SUI_CONFIG_DIR` scoping, adding `MAINNET-DEPLOY.json` capture, adding ±10 bps NAV-per-share checkpoint logic, and writing two new artifacts (`scripts/preflight.sh` and the `predict-mainnet-check.yml` cron). Every implementation decision is locked in `05-CONTEXT.md`; this research focuses on the **mechanics** of executing those decisions safely.

The phase boundary is razor-thin: publish a single Move package, run a 4-tx round-trip with $50, capture output JSON, document. The risk concentration is correspondingly thin: Pitfall 14 (config drift between testnet and mainnet) is the dominant failure mode, and the preflight script's job is to make that pitfall impossible to trigger.

**Primary recommendation:** Build Phase 5 as a five-script package — `preflight.sh`, `predict-mainnet-check.sh` (+ its workflow), `mainnet-deploy.sh`, `mainnet-smoke-test.sh`, and a thin `mainnet-smoke-test.ts` for NAV-per-share read + ±10 bps comparison. Reuse the entire `e2e-vault-deploy.sh` parsing logic verbatim — only the env scoping, RPC URL, type tag, and output filename change. The token-bucket wait time MUST come from `shared/strategy.toml` codegen (CONTEXT.md Claude's Discretion); reading it in shell is awkward, so route the wait through the TS smoke-test driver where `strategy_constants.ts` is already a typed import.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Preflight checks (config + Move build + tests) | Local shell + Sui CLI | — | Runs once locally before publish; no network state to manage [VERIFIED: 05-CONTEXT.md D-06] |
| Predict-mainnet shipped probe | GitHub Actions runner + Sui mainnet RPC | Human reviewer (config flip) | Cron runs unattended at 2026-06-09 09:00 UTC; humans gate the config commit [VERIFIED: 05-CONTEXT.md D-04] |
| Move package publish | Local shell + Sui CLI + mainnet RPC | — | One-shot, gas-sensitive, must run with mainnet keystore explicitly scoped [VERIFIED: docs/MAINNET-FUNDING.md] |
| MAINNET-DEPLOY.json capture | Local shell (jq parse) | Git (commits the JSON) | Mirrors Phase 2's TESTNET-DEPLOY.json schema exactly; downstream Phase 6 reads it [VERIFIED: e2e-vault-deploy.sh L205-226] |
| Smoke-test PTB execution | TypeScript driver (`@mysten/sui` 2.16.0) on Node 22 | Local shell wrapper | TS is the only place where strategy_constants.ts wait-time + typed PTB construction work cleanly [VERIFIED: e2e-vault-cycle.ts] |
| NAV-per-share snapshot | TypeScript driver — `client.getObject().data.content.fields` | Move (`ltv::nav_per_share` is what we're checking) | Already implemented in e2e-vault-cycle.ts:snapshotVault [VERIFIED: e2e-vault-cycle.ts L86-99] |
| ±10 bps tolerance gate | TypeScript driver (BigInt math) | — | bps comparison in shell is fragile; do it where BigInt is native [ASSUMED — shell can do it but TS is the clean home] |
| USDsui acquisition (Cetus swap) | Human + Slush wallet + Cetus UI | — | Not scriptable in v1 scope [VERIFIED: docs/MAINNET-FUNDING.md Step 2] |
| Contingency Issue posting | GitHub Actions (peter-evans/create-issue-from-file@v6 or actions/github-script) | — | Mirrors monday-predict-check.yml pattern exactly [VERIFIED: .github/workflows/monday-predict-check.yml] |

## User Constraints (from 05-CONTEXT.md)

### Locked Decisions

- **D-01: Move package + smoke test only.** Hosting (Vercel, Render) deferred to Phase 6. `config/mainnet.toml [hosting]` TBD slots filled by Phase 6, not Phase 5.
- **D-02: Smoke test is staged with checkpoints.** Discrete verification gates between deposit → NAV check → hedge → exposure check → redeem_request → wait → redeem_fulfill → final NAV check. Each step its own script call.
- **D-03: NAV tolerance ±10 bps** relative to `(pre_deposit_nav_per_share − realized_hedge_cost)`. Pre-deposit NAV captured BEFORE step 1.
- **D-04: Predict-mainnet contingency = programmatic GitHub Action at 09:00 UTC 2026-06-09.** Posts GitHub Issue with `shipped:true/false` + ABI-match status. Human-merged config flip.
- **D-05: Fallback shape = split demo.** If `predict_mainnet_shipped=false`, mainnet runs vault::supply + vault::redeem only (no hedge); demo video shows two sequences (testnet full PTB + mainnet supply/redeem only).
- **D-06: Preflight covers locked checks + 3 operational gates:** (a) every `config/mainnet.toml` TBD slot filled, (b) deploy wallet gas ≥ 10 SUI raw, (c) USDsui balance ≥ 50 USDsui.

### Claude's Discretion

- **Script invocation pattern:** All Phase 5 scripts prefix `SUI_CONFIG_DIR=~/.sui/sui_config_mainnet` (Phase 0 D-06). NEVER `sui client switch --env mainnet`.
- **Deployment output capture:** `MAINNET-DEPLOY.json` schema mirrors `TESTNET-DEPLOY.json`.
- **AdminCap retention:** Held by deploy wallet for Phase 5 + Phase 6. Post-submission burn / multisig is backlog.
- **Preflight artifact:** Bash, portable (macOS/Linux/WSL), reuses helpers from `scripts/e2e-vault-deploy.sh`.
- **Smoke test gas budget:** `--gas-budget 500000000` (0.5 SUI) per step; total ~2-3 SUI across 4 transactions.
- **Token-bucket wait time:** `WITHDRAWAL_BUCKET_REFILL_MS_PER_USER + 5s` read from `shared/strategy.toml` via codegen.
- **MAINNET-DEPLOY.json commit** to master with the smoke-test pass commit.

### Deferred Ideas (OUT OF SCOPE)

- Multisig governance for AdminCap (backlog)
- Mainnet RPC failover (single endpoint per Phase 0)
- AdminCap burn after smoke test (v1 keeps cap)
- Custom mainnet domain (Phase 0 D-16)
- Vercel + Render hosting pointed at mainnet (Phase 6)
- Demo video recording (Phase 6)
- Recording wallet provisioning (Phase 6)

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DEPLOY-01 | Mainnet preflight script asserts Move.toml mainnet config + golden vectors against fresh mainnet RPC + Predict/Margin pkg pinned + full Move + Python parity tests green | "Preflight Script Design" + "Pitfall 14 Specialization" sections below |
| DEPLOY-02 | `deepvault` Move package published on Sui mainnet; package ID captured in `config/mainnet.toml` | "Sui Mainnet Publish Mechanics" + "MAINNET-DEPLOY.json Capture" sections below |
| DEPLOY-03 | Vault shared object created on mainnet with USDsui as quote asset; AdminCap held by deployer | "USDsui Acquisition + Type Tag Verification" + "AdminCap Verification" sections below |
| DEPLOY-04 | Real $50 USDsui deposit → hedge mint → withdrawal-request → redeem cycle on mainnet by 2026-06-12 | "Smoke Test Verification Mechanics" section below |
| DEPLOY-09 | Mainnet redeploy contingency documented; fallback executed with written rationale if Predict mainnet not shipped by 2026-06-09 | "Predict-Mainnet Contingency Mechanics" section below |

## Implementation Approach

### Script Inventory (Phase 5 creates)

| Script | Lines (est.) | Source-of-truth fork | Purpose |
|--------|-------------|----------------------|---------|
| `scripts/preflight.sh` | ~120 | New, but reuses helpers from `e2e-vault-deploy.sh` (Sui CLI version check, jq parse pattern, error format) | Gate: refuse to proceed if ANY locked check or operational gate fails |
| `scripts/predict-mainnet-check.sh` | ~80 | New; mirrors `scripts/predict-diff.sh` Issue-posting structure | RPC probe for Predict mainnet package + ABI-match diff vs predict-testnet-4-16 branch |
| `.github/workflows/predict-mainnet-check.yml` | ~50 | Direct clone of `.github/workflows/monday-predict-check.yml` with cron + ABI-match swap | Fires 2026-06-09 09:00 UTC; runs the script; opens GitHub Issue with verdict |
| `scripts/mainnet-deploy.sh` | ~240 (vs testnet 238) | Direct fork of `scripts/e2e-vault-deploy.sh` | Mainnet-scoped publish + create_vault + MAINNET-DEPLOY.json emit |
| `scripts/mainnet-smoke-test.sh` | ~80 | New (orchestrator) | Wraps the TS driver with checkpoint logging + post-flight ledger update |
| `scripts/mainnet-smoke-test.ts` | ~350 (vs cycle 383) | Direct fork of `scripts/e2e-vault-cycle.ts` | NAV snapshots, supply, exposure read, redeem_request, wait, redeem_fulfill, final NAV vs tolerance |

### Preflight Script Design (DEPLOY-01)

Preflight is a sequence of independent assertions. Each fails LOUD on its own; never silent-skip. Layout:

```
1. Sui CLI version pin     : `sui --version | grep "1.71.1"` — exact match
2. SUI_CONFIG_DIR set       : `[[ "${SUI_CONFIG_DIR}" == *"sui_config_mainnet"* ]]`
3. Active env is mainnet    : `sui client active-env | grep "^mainnet$"`
4. DeepBookV3 SHA pin       : `bash scripts/verify-deepbookv3-pin.sh`
5. Move build clean         : `(cd contracts && sui move build)`
6. Move test suite green    : `(cd contracts && sui move test --gas-limit 100000000000)`
7. Python parity green      : `cd backtest && uv run pytest`
8. Codegen drift check      : compare strategy_constants.{move,py,ts} against `make codegen` output
9. Golden vectors           : `(cd contracts && sui move test --gas-limit 100000000000 golden_vectors)`
10. RPC reachable           : `sui client gas --json | jq` — proves keystore + RPC both work
11. Gas balance >= 10 SUI   : sum `--json` output, compare to 10_000_000_000 mist (10 SUI in mist)
12. USDsui balance >= 50    : `sui client objects --json | jq '<USDsui Coin filter>'` — sum balances
13. Every mainnet.toml TBD filled : parse toml, fail on `= "TBD"` lines
14. Move.toml mainnet config matches : assert `[addresses].predict` in Move.toml == `[predict].package_id` in mainnet.toml [only relevant once Predict mainnet shipped]
15. Contingency flag honored: if `predict_mainnet_shipped = false`, only assert non-Predict TBDs filled (allow Predict + oracle_svi TBDs); else assert ALL TBDs filled
```

**Failure UX:** Each assertion prints a one-line FAIL with the violated check name and the remediation command. Script exits non-zero on first FAIL.

**Reuse:** Steps 1, 4, 5, 6 already have known invocations from `e2e-vault-deploy.sh` and `ci.yml`. Step 13 is the novel piece — a simple `grep '"TBD"' config/mainnet.toml` returning matches = FAIL. [VERIFIED: pattern works against config/mainnet.toml current state]

### MAINNET-DEPLOY.json Schema

Mirror `TESTNET-DEPLOY.json` (already in `.planning/phases/02-vault-move-package-testnet-deploy/TESTNET-DEPLOY.json`). The only field that differs in shape:
- `network: "mainnet"` (not `"testnet"`)
- `dusdc_type_tag` → rename to `quote_type_tag` for env-neutrality, OR keep `dusdc_type_tag` field but populate with USDsui type tag. **Recommendation: rename field to `quote_type_tag` AND keep `dusdc_type_tag` as alias for backward compat with downstream Phase 4 dashboard until that code is updated.** [ASSUMED — confirm in plan whether dashboard/relay actually reads `dusdc_type_tag` field name by string]

Output path per CONTEXT.md: `.planning/phases/05-mainnet-redeploy-smoke-test/MAINNET-DEPLOY.json` [VERIFIED: 05-CONTEXT.md specifics]

## Sui Mainnet Publish + USDsui Specifics

### Sui CLI publish mechanics (mainnet-v1.71.1)

`sui client publish --gas-budget 1000000000 --json` against `contracts/` directory. Output JSON has the same shape as testnet — `objectChanges` array with `type: "published"` entries (one per package), `type: "created"` entries (one per shared object, one for `AdminCap`, one for `PendingTreasury`), and `effects.transactionDigest`. [VERIFIED: e2e-vault-deploy.sh L72-100 already parses this against testnet — identical schema on mainnet per CLI documentation]

**Known mainnet-vs-testnet differences:**

1. **Gas is real money.** Testnet uses faucet SUI; mainnet wallet must hold ≥10 SUI. Gas budget 1.0 SUI for publish, 0.2 SUI for create_vault, 0.5 SUI per smoke-test step. [VERIFIED: docs/MAINNET-FUNDING.md Step 3 + PITFALLS.md Pitfall 14]
2. **`framework/mainnet` rev pin.** `contracts/Move.toml` already uses `rev = "framework/mainnet"` for `Sui` and `MoveStdlib`. This is correct for mainnet publish; no change. [VERIFIED: contracts/Move.toml L12-13]
3. **`sui-framework` is loaded from-network at publish time.** The protocol version (123 for mainnet-v1.71.1) is enforced by the validator. CLI version drift = publish failure. [CITED: GitHub Releases page, mainnet-v1.71.1]
4. **Package upgrade vs initial publish:** This is an INITIAL publish (no UpgradeCap from a previous mainnet version exists). `sui client publish` returns a new package_id + an `UpgradeCap` object. **The UpgradeCap is sent to the deployer wallet by default** — Phase 5 ignores it (no upgrade planned in v1; future v2 may upgrade). Per CONTEXT.md "AdminCap retention policy" — UpgradeCap is implicitly held by deploy wallet as well. [VERIFIED: Sui CLI publish behavior is consistent across networks per docs.sui.io/references/cli/client]
5. **Gas estimation overshoot:** Sui CLI does NOT auto-estimate. The 0.5 SUI default for `--gas-budget` is fine for normal vault calls but `publish` of a multi-source package may need 1.0 SUI. The docs/MAINNET-FUNDING.md playbook says "0.5-2 SUI" for publish — budget 1.0 SUI and have buffer to retry. [VERIFIED: docs/MAINNET-FUNDING.md Step 3 + general Sui Move package gas profiles]

### USDsui acquisition + type tag verification

**Status (as of 2026-05-13, per WebSearch):** USDsui IS live on Sui mainnet. Issued by Bridge (Stripe). 1:1 USD-backed. Available on Cetus pool. [CITED: Sui blog "Sui Unveils USDsui, a Native Stablecoin"; The Block; KuCoin announcement]

**Canonical type tag shape:** `0x{USDSUI_PACKAGE}::usdsui::USDSUI` per docs/MAINNET-FUNDING.md. The exact package address is NOT in public Sui blog posts I can find via search; it must be captured AT SWAP TIME from the actual mainnet object. **Recommended capture procedure:**

```bash
# After Cetus swap completes, identify USDsui coin object in wallet
SUI_CONFIG_DIR=~/.sui/sui_config_mainnet sui client objects --json \
  | jq -r '.[].data | select(.type | test("::usdsui::USDSUI")) | .type' \
  | head -1
# Output: 0x2::coin::Coin<0xPACKAGE::usdsui::USDSUI>
# Extract the inner type and write to config/mainnet.toml [assets].quote_type_tag
```

**Decimals:** docs/MAINNET-FUNDING.md and `config/mainnet.toml` BOTH assume 6 decimals (matching testnet DUSDC). [ASSUMED — official 6-decimals assumption matches industry-standard USD stablecoin (USDC, USDT both 6dp), but Bridge/Stripe may have chosen differently. Verify at swap time by reading the `decimals` field on the CoinMetadata object for USDsui. Plan must include a one-line verification step before writing config.]

**Cetus swap mechanics:** Human-operated via https://app.cetus.zone/swap [CITED: docs/MAINNET-FUNDING.md Step 2]. Slippage tolerance for a $50 swap: Cetus default is 0.5%, which is safe for a $50 trade on a deep SUI/USDsui pool. The risk is the pool being thin on launch — if slippage warning appears, pause and reduce trade size + retry, or split into two swaps. **The swap is not scriptable in Phase 5 scope.**

**Recovery if USDsui swap fails or pool is dry:** Fall back to USDC (Circle's native USDC on Sui, also a valid quote asset). This requires a one-line change to `config/mainnet.toml [assets].quote_type_tag`. **BUT** the brief specifies USDsui — fallback to USDC is a documented contingency only. Plan must NOT bake USDC fallback in by default. [ASSUMED — confirm with user if USDsui swap fails on Day 33-34]

### AdminCap verification (DEPLOY-03)

After `vault::create_vault<USDSUI>` runs on mainnet, parse `CREATE_JSON` for the `AdminCap` object (already parsed in `e2e-vault-deploy.sh` L171-176 against testnet). Assert the AdminCap's `owner.AddressOwner` matches the deployer's address — this confirms "AdminCap held by deployer wallet." [VERIFIED: e2e-vault-deploy.sh L155-200 parsing pattern]

```bash
ADMIN_CAP_OWNER="$(echo "${CREATE_JSON}" \
    | jq -r --arg pkg "${PACKAGE_ID}" '
        .objectChanges[]
        | select(.type == "created")
        | select(.objectType == "\($pkg)::vault::AdminCap")
        | .owner.AddressOwner')"

if [[ "${ADMIN_CAP_OWNER}" != "${DEPLOYER_ADDR}" ]]; then
  echo "::error::AdminCap owner ${ADMIN_CAP_OWNER} != deployer ${DEPLOYER_ADDR}"
  exit 1
fi
```

This single assertion is the entirety of DEPLOY-03's "AdminCap held by deployer wallet" requirement.

## Predict-Mainnet Contingency Mechanics (DEPLOY-09)

### Cron mechanics

GitHub Actions cron uses 5-field syntax in UTC. For 09:00 UTC on 2026-06-09:

```yaml
on:
  schedule:
    - cron: '0 9 9 6 *'    # 09:00 UTC on June 9 (every year, doesn't matter — workflow disabled post-2026-06-09)
  workflow_dispatch: {}    # allow manual trigger for testing
```

**Critical caveats:**
1. **Cron only fires from the default branch.** [VERIFIED: GitHub Docs scheduled workflows] Workflow file must be merged to master well before 2026-06-09 (recommend by 2026-06-01).
2. **Cron jobs can be DELAYED up to 15-30 minutes** under high GitHub Actions load. [CITED: oneuptime.com cron blog + GitHub community discussions] Buffer: workflow should be scheduled for 08:50 UTC if exactly 09:00 matters, OR accept the documented delay (probably fine — the human review happens later in the day).
3. **`gh issue create` requires `permissions: issues: write`** [CITED: GitHub Docs schedule-issue-creation tutorial]. Already used in `.github/workflows/monday-predict-check.yml`.
4. **Forks cannot post issues.** Not relevant — this is a solo build with no forks.

### RPC probe pattern

The probe runs against mainnet RPC and tries to read the Predict package. If the package does not exist at all, RPC returns `object not found`. If it exists, the script then does an ABI-match check vs the `predict-testnet-4-16` branch source.

```bash
#!/usr/bin/env bash
# scripts/predict-mainnet-check.sh
set -euo pipefail
# Configurable expected mainnet Predict package — set via env var
# Falls back to "TBD" if we genuinely have no candidate package ID
PREDICT_MAINNET_CANDIDATE="${PREDICT_MAINNET_CANDIDATE:-TBD}"
MAINNET_RPC="https://fullnode.mainnet.sui.io:443"

if [[ "${PREDICT_MAINNET_CANDIDATE}" == "TBD" ]]; then
  # Mysten has not announced a mainnet package; emit shipped:false
  printf '{"shipped":false,"reason":"no candidate package id; awaiting Mysten announcement"}\n'
  exit 0
fi

# Try to fetch the package object
RESP="$(curl -fsS "${MAINNET_RPC}" \
  -H 'content-type: application/json' \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"sui_getObject\",\"params\":[\"${PREDICT_MAINNET_CANDIDATE}\",{\"showType\":true,\"showContent\":true}]}")"

if echo "${RESP}" | jq -e '.result.data' >/dev/null; then
  # Found — now ABI-diff against vendored testnet source
  # Compare struct/function names from on-chain package vs scripts/deepbookv3/packages/predict/sources/*.move
  # If ANY public function signature mismatch, set abi_match:false
  printf '{"shipped":true,"package_id":"%s","abi_match":true}\n' "${PREDICT_MAINNET_CANDIDATE}"
else
  printf '{"shipped":false,"reason":"package not found on mainnet"}\n'
fi
```

**ABI-match check:** The vendored Predict source lives at `scripts/deepbookv3/packages/predict/sources/predict.move` (per Phase 2 02-CONTEXT.md L96). The check compares public function signatures via a script that introspects the on-chain package's `module` field (returned by `sui_getObject` with `showContent`). [VERIFIED: deepbookv3 vendored at scripts/deepbookv3/ confirmed via ls of scripts/]

**ABI match vs structural change — judgment call:**
- **Match:** Same public function names with same type-parameter arity and same argument types. The fact that internal storage layout may differ doesn't matter — Move's published-at guarantees stable ABI for callers.
- **Drift requiring re-integration:** Any new required parameter (e.g., `predict::mint<Quote>(...,extra_arg: u64)`), removed function, renamed module, changed event struct field. These break `predict_adapter.move`.
- **Soft drift (non-blocking):** New optional functions added; new events emitted alongside existing ones. These do NOT break the adapter.

### GitHub Issue posting

Reuse the `peter-evans/create-issue-from-file@v6` action already used in monday-predict-check.yml [VERIFIED: .github/workflows/monday-predict-check.yml L39-46]. The script writes `report.md` to `/tmp/check/report.md`; the action posts it as an Issue body. Title: `"Predict Mainnet Check — 2026-06-09"`.

Alternative: `actions/github-script@v7` for inline issue creation [CITED: GitHub Docs schedule-issue-creation], but peter-evans is already in the repo's pattern library — stay consistent.

**Issue body shape (Markdown):**
```markdown
## Predict Mainnet Check (Phase 5 / DEPLOY-09)

**Run at:** {{TIMESTAMP UTC}}
**Result:** **shipped: TRUE/FALSE**
**ABI match:** YES / NO / N/A

### Verdict for Phase 5 plan
- If shipped=true + abi_match=yes: proceed with full PTB on mainnet
- If shipped=true + abi_match=no: HALT — re-integrate predict_adapter against new ABI before proceeding
- If shipped=false: fallback to split-demo (D-05); set predict_mainnet_shipped=false in config/mainnet.toml

### Required human action
1. Review the diff (link to vendored source diff if abi_match=no)
2. Edit config/mainnet.toml [contingency].predict_mainnet_shipped to true OR false
3. Commit the change to master

### Raw probe output
```json
{{JSON BODY}}
```
```

## Smoke Test Verification Mechanics (DEPLOY-04)

### Staged checkpoint layout (D-02)

The smoke test is structured as 4 transactions with 5 verification gates:

```
Step 0: SNAPSHOT pre-deposit NAV-per-share via ltv::nav_per_share read
Step 1: vault::supply(50 USDsui) → mints VAULT_SHARE + atomically mints hedge via predict::mint
   GATE 1: Verify Supplied event emitted, HedgeMinted event emitted, vault NAV-per-share read OK
Step 2: [No separate "buy hedge" step — atomic with supply per D-06 in 02-CONTEXT.md]
   GATE 2: Read hedge registry (vault.hedges field) — assert exactly 1 entry with the right strike/expiry
Step 3: vault::redeem_request(SHARE coin) → escrows shares, records timestamp
   GATE 3: Verify RedeemRequested event emitted
Step 4: WAIT for COOLDOWN_MS (1 hour = 3_600_000 ms) + 5s buffer (token-bucket refill)
   This is a real wall-clock wait; the smoke test takes >1 hour to complete
Step 5: vault::redeem_fulfill() → drains the slot, returns USDsui (less hedge cost), burns shares
   GATE 4: Verify RedeemFulfilled event emitted; verify USDsui Coin returned to deployer wallet
Step 6: SNAPSHOT post-redeem NAV-per-share
   GATE 5: Assert |post_nav − (pre_nav − realized_hedge_cost)| <= 10 bps * pre_nav / 10000
```

**Important:** The vault is `Vault<Quote>` generic — for mainnet, `Quote = USDSUI`. Every `--type-args` flag and TS `typeArguments` array uses the USDsui type tag. [VERIFIED: contracts/sources/vault.move + 02-CONTEXT.md "Quote asset abstraction"]

### NAV-per-share read mechanics

`ltv::nav_per_share<Quote>(vault)` is a view function returning `u64` at 1e9 fixed-point [VERIFIED: contracts/sources/ltv.move L41-49]. It is NOT directly callable from TS without dev-inspect or a thin entry wrapper.

**Two viable patterns:**

1. **Direct object-content read (Plan A, recommended):** TS reads `vault` shared object, pulls `total_assets` and `total_shares_supply` fields, computes NAV in TS using `BigInt`. Already implemented in `e2e-vault-cycle.ts:snapshotVault` L86-99 — that function returns `{ balance, total_assets, total_shares }`. NAV = `total_assets * 1e9 / total_shares`. [VERIFIED: ltv.move L44-48 formula matches]

2. **dev-inspect call (Plan B, fallback):** Use `client.devInspectTransactionBlock` to invoke `ltv::nav_per_share` and read the return value. More accurate (calls the actual Move function) but adds a network round-trip per snapshot.

**Recommendation: Plan A.** Compute NAV from raw fields, since the snapshot function already does it for `total_assets` and `total_shares`. Add NAV computation in TS: `(BigInt(total_assets) * 1_000_000_000n) / BigInt(total_shares)`.

### Event emission verification

`signAndExecuteTransaction({ options: { showEffects: true, showEvents: true } })` returns `result.events` — already used in `e2e-vault-cycle.ts` L213-231. Pattern:

```typescript
const suppliedEvent = result.events?.find((e) => e.type.endsWith('::supply::Supplied'));
const hedgeMintedEvent = result.events?.find((e) => e.type.endsWith('::rebalance::HedgeMinted'));
if (!suppliedEvent || !hedgeMintedEvent) throw new Error('events missing');
```

[VERIFIED: e2e-vault-cycle.ts L220-231 already does this]

### Hedge registry / exposure read (Gate 2)

The hedge registry is a `Table<MarketKey, HedgePosition>` inside the Vault shared object. Reading it requires either:
1. Reading the `hedges` table object via `client.getDynamicFields(vault_id)` and walking entries, OR
2. Reading the `Supplied`/`HedgeMinted` events emitted by step 1 and using THOSE as the verification source.

**Recommendation:** Option 2. The `HedgeMinted` event (vault::rebalance::HedgeMinted struct, L58-65 of rebalance.move) carries `vault_id`, `market_key`, `quantity`, `cost_basis_quote`, `strike`, `expiry_ms` — exactly the data Gate 2 needs to verify. No need to walk the Table. [VERIFIED: contracts/sources/rebalance.move L58-65]

The `cost_basis_quote` from the HedgeMinted event IS the realized_hedge_cost used in Gate 5's tolerance check.

### Token-bucket wait time (D-CD: read from strategy.toml via codegen)

Per CONTEXT.md Claude's Discretion: smoke test pauses `WITHDRAWAL_BUCKET_REFILL_MS_PER_USER + 5s`. Reading this:

- `shared/strategy.toml` has `[token_bucket].refill_rate_quote_micro_units_per_ms = 1200` (1.2 quote micro-units per ms) and `capacity_quote_micro_units = 100_000_000`. [VERIFIED: shared/strategy.toml L36-37]
- The bucket refills FULL over `capacity / rate_per_ms = 100_000_000 / 1200 = 83,333,333 ms ≈ 23.15 hours`.
- However, the smoke test deposits $50 = 50_000_000 micro-units. The bucket starts FULL (seeded at lazy-init per redeem.move L252-257 `record_deposit(capacity)`). So the bucket already has capacity ≥ 100_000_000 micro-units when redeem_fulfill runs — the bucket is NOT the gating constraint; the 1-hour cooldown is.
- **Therefore the relevant wait is the redeem cooldown: `COOLDOWN_MS = 3_600_000` (1 hour) + 5s buffer.** [VERIFIED: contracts/sources/redeem.move L40 `const COOLDOWN_MS: u64 = 3_600_000`]
- **But** CONTEXT.md says read from strategy.toml via codegen. The actual value in `shared/strategy.toml` is in `[token_bucket]` — there's no `cooldown_ms` constant in strategy.toml today; cooldown is hardcoded in redeem.move L40. **This is a discrepancy with CONTEXT.md.** [ASSUMED — CONTEXT.md likely meant "wait long enough that both bucket refill and cooldown elapse." Plan should: (a) add `[redemption].cooldown_ms = 3_600_000` to strategy.toml + codegen (small extension), OR (b) treat the COOLDOWN_MS constant in redeem.move as the wait source and document the deviation from CONTEXT.md.]

**Recommendation:** Plan option (a) — extend `shared/strategy.toml` with `[redemption].cooldown_ms` and codegen to all three runtimes. This honors CONTEXT.md's "no hardcoded waits" directive literally and removes a fragile string match. Wait time = `cooldown_ms + 5000ms`.

### ±10 bps tolerance gate (Gate 5)

Math (CONTEXT.md D-03): `post_redeem_nav_per_share == pre_deposit_nav_per_share - realized_hedge_cost ± 10 bps`.

Where `realized_hedge_cost` = `cost_basis_quote` from the HedgeMinted event (the actual quote micro-units sent to Predict via predict::mint, before any payoff/decay). For a smoke test that runs over ~1 hour with no price move, the hedge cost is the dominant NAV mover (hedges expire over 14 days, not 1 hour, so the position is held but the value carries at cost-basis per `ltv::nav_per_share` formula).

**Caveat on the NAV math under v1 ltv:** `ltv::nav_per_share` returns `total_assets * 1e9 / total_shares`, where `total_assets` includes the hedge cost basis carried at acquisition (no SVI re-mark on this path per 02-CONTEXT.md D-09). So:
- **Pre-deposit:** `nav_pre = total_assets / total_shares` (state before step 1)
- **After supply (50 USDsui deposit, 5 USDsui to hedge):** `total_assets += 50` (full deposit), `total_shares += proportional shares`. Because the hedge cost basis is still inside total_assets, NAV-per-share is approximately preserved.
- **After redeem of all shares:** `total_assets -= payout_quote`, `total_shares -= shares_burned`. Payout = `min(pro_rata_NAV, bucket_avail, vault_liquid_quote)`. The vault still holds the hedge book — i.e., total_assets retains ~5 USDsui in hedge cost basis post-redeem.
- **Therefore:** in the smoke test (one deposit + one full-share redeem of that depositor), `post_nav_per_share` should approximately equal `pre_nav_per_share` (vault keeps the hedge cost basis on its books for OTHER LPs / the seed shares). The ±10 bps catches accounting bugs, not the hedge cost shifting NAV downward.

**Refined formula for smoke test (the seed deposit funds the dead address; 10 DUSDC/USDsui sits in the vault from create_vault):**
- `pre_nav = 1.0e9` (1.0 USDsui per share at 1e9 scale — only seed shares exist, no hedges)
- After deposit: `pre_nav` plus a small accounting drift from the dead-share inflation defense
- After redeem: the smoke depositor exits cleanly; vault still has 10 USDsui seed + ~5 USDsui hedge basis; only dead shares remain. `post_nav ≈ 1.0e9` (because dead shares now represent (10 + 5) USDsui — actually HIGHER NAV per share for dead shares because they didn't pay the 5 USDsui cost basis to predict::mint).

**Honest assessment:** The ±10 bps band is the right shape but the formula `post_nav == pre_nav − realized_hedge_cost` from CONTEXT.md needs careful interpretation. In v1, ltv::nav carries cost basis on the books, so realized_hedge_cost shows up in `total_assets` for the remaining holders (= dead shares), NOT as NAV drop for them. **The depositor experiences hedge cost as a CASH OUT (50 USDsui deposited, ~45 USDsui returned), but the post-redeem dead-shares-only NAV does not decrease by 10 bps from this single round-trip.**

**Plan recommendation:** Define the tolerance gate explicitly with worked numbers. Two viable framings:

1. **Per-depositor framing:** `received_quote / deposited_quote >= 1.0 - hedge_alloc_bps/10_000 - 0.001` (depositor gets back ≥ 90% − 10bps of deposit, accounting for 10% hedge allocation per shared/strategy.toml L25). This is the user-facing tolerance.

2. **Vault NAV framing:** `|post_nav_per_share - pre_nav_per_share| / pre_nav_per_share <= 0.001` (10 bps). This catches accounting drift but is NOT sensitive to hedge cost in v1 ltv.

**Plan must include worked example numbers** computed from `shared/strategy.toml [hedge_policy] allocation_bps = 1000` and the expected $50 deposit. Use framing 1 (per-depositor) for the user-facing assertion; framing 2 is the secondary "NAV monotonic" sanity check.

### Failure recovery within the smoke cycle

The redeem flow is two-step (request → fulfill). If `redeem_fulfill` fails (e.g., insufficient liquid balance), `redeem_cancel<Quote>(vault, ctx)` returns the escrowed Coin<SHARE> to the user with the timestamp untouched [VERIFIED: contracts/sources/redeem.move L201-220]. So funds are NEVER locked permanently — the cancel path is always available.

If `redeem_fulfill` partially fulfills (D-03: liquidity-short fulfill pays what's liquid, leaves remainder escrowed), the smoke test should retry `redeem_fulfill` after a short wait. The test should not assume full fulfillment on first call. [VERIFIED: contracts/sources/redeem.move L100-103 "remainder stays escrowed; timestamp UNTOUCHED"]

## Risks & Pitfalls

### Pitfall 14 specialization — Mainnet redeploy disasters

The dominant risk for Phase 5. The preflight script IS the Pitfall 14 mitigation. [VERIFIED: PITFALLS.md L401-427]

**Specific mainnet config drift vectors to detect:**

| Drift vector | Detection mechanism |
|--------------|----------------------|
| Testnet DUSDC type tag leaks into `mainnet.toml [assets].quote_type_tag` | Preflight Step 13: grep `"TBD"` AND grep `dusdc::DUSDC` (testnet type) in mainnet.toml — both should be absent |
| Testnet Predict package_id leaks | Preflight Step 14: assert `[predict].package_id` in mainnet.toml ≠ the known testnet hex `0xf5ea...138` |
| Move.toml `[addresses].predict` not updated for mainnet | Preflight Step 14: if `predict_mainnet_shipped=true`, assert Move.toml `predict` address matches `mainnet.toml [predict].package_id` |
| Testnet RPC URL leaks | Preflight Step 10: assert `sui client active-env` returns "mainnet" |
| `~/.sui/sui_config` (testnet keystore) used by accident | Preflight Step 2: assert `SUI_CONFIG_DIR` is set AND ends in `sui_config_mainnet` |
| `dusdc_type_tag` field in MAINNET-DEPLOY.json carries testnet value | Plan: rename field to `quote_type_tag` in MAINNET-DEPLOY.json; populate from `mainnet.toml [assets].quote_type_tag` (which preflight validates) |

### Pitfall 6 specialization — Predict mainnet contract churn between probe and deploy

If the 2026-06-09 check reports `shipped:true + abi_match:yes`, Mysten could STILL push a breaking change between then and 2026-06-12 (smoke deadline). [VERIFIED: PITFALLS.md L167-198 Pitfall 6]

**Mitigation:** Preflight Step 14 re-checks the ABI against the live mainnet package immediately before publish (not just the workflow's day-of check). If preflight detects drift between the captured ABI fingerprint and the live one on 2026-06-12, halt and force re-integration.

**Practical implementation:** Save the ABI fingerprint from the 2026-06-09 probe to a file in the repo (`/tmp` won't survive); preflight reads it and compares. If different, abort.

### Mainnet-specific gotchas not covered by Pitfalls 6/14

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Gas exhaustion mid-cycle (smoke test uses ~2-3 SUI; deploy uses ~1 SUI) | LOW with $30 buffer; HIGH if Phase 5 has a failed publish that burned 1 SUI | Top up to $150 total per docs/MAINNET-FUNDING.md Risk Flag |
| Sui RPC flakiness during the 1-hour cooldown wait | MEDIUM (public RPC can hiccup; the TS driver's setTimeout doesn't depend on RPC) | The wait is a `await new Promise(r => setTimeout(r, ms))`; no RPC dependency. After the wait, retry the redeem_fulfill RPC call with exponential backoff (3 attempts) |
| Cetus pool slippage > 0.5% on $50 SUI→USDsui swap | LOW for a $50 trade on a mainstream pool | Human pauses, splits into two $25 swaps, OR uses Circle USDC fallback (and documents in README) |
| Clock skew between `SUI_CONFIG_DIR=testnet` shell and `SUI_CONFIG_DIR=mainnet` shell (cross-pollination) | LOW but catastrophic if it happens | Preflight asserts SUI_CONFIG_DIR; never use `sui client switch` |
| `sui client publish` succeeds but `create_vault` fails (e.g., USDsui type wrong) — package_id captured, but vault not created — orphan publish | MEDIUM | Preflight verifies USDsui type tag is parseable AND a Coin object with that type exists in deploy wallet BEFORE publish runs |
| `create_vault` consumes the seed USDsui coin (10 USDsui) → smoke test needs 50 USDsui ON TOP OF the seed. Total USDsui needed = 60. | HIGH (easy to miss) | Preflight Step 12 asserts USDsui balance ≥ 60 USDsui (not just 50). Update docs/MAINNET-FUNDING.md Step 2 budget accordingly |

**Critical correction to docs/MAINNET-FUNDING.md:** The seed transaction (10 quote micro-units → 10 DUSDC at testnet → 10 USDsui at mainnet) is bundled INTO `vault::create_vault`. So Phase 5 needs **60 USDsui in the deploy wallet** (10 for seed + 50 for smoke test). The current playbook only mentions $50. **Plan must include a seed-coin-locate step before vault creation, AND preflight must assert balance ≥ 60 USDsui.** [VERIFIED: e2e-vault-deploy.sh L101-137 finds and splits a 10-DUSDC seed coin; mainnet path is identical]

### Operational risk — pre-flight checklist for the human

Before kicking off the deploy script:

```
[ ] Backup of ~/.sui/sui_config_mainnet/sui.keystore exists on encrypted external drive
[ ] Mainnet wallet has ≥ 10 SUI raw + ≥ 60 USDsui
[ ] Cetus swap completed; USDsui type tag captured and written to config/mainnet.toml
[ ] config/mainnet.toml has zero "TBD" values (except [hosting] which is Phase 6)
[ ] Predict-mainnet check Issue exists, verdict reviewed, predict_mainnet_shipped flag set correctly
[ ] Move.toml [addresses].predict updated (if predict_mainnet_shipped=true)
[ ] Move build clean, full test suite green, parity green
[ ] git status clean (no uncommitted changes; MAINNET-DEPLOY.json commit will be the deploy commit)
[ ] Current time ≥ 24 hours before 2026-06-12 hard deadline (gives retry window)
```

This checklist lives in docs/MAINNET-FUNDING.md and gets updated by Phase 5 with the seed-coin correction above.

## Validation Architecture

**Test Framework**

| Property | Value |
|----------|-------|
| Framework | bash (preflight, smoke orchestrator); TypeScript via tsx (PTB driver, NAV computation) |
| Config files | None new — reuses contracts/Move.toml, config/mainnet.toml, shared/strategy.toml |
| Quick run command | `SUI_CONFIG_DIR=~/.sui/sui_config_mainnet bash scripts/preflight.sh` |
| Full suite command | Above + `bash scripts/mainnet-deploy.sh` + `bash scripts/mainnet-smoke-test.sh` (runs >1 hour due to cooldown) |

**Runtime invariants (must hold post-deploy)**

| # | Invariant | Verification method |
|---|-----------|---------------------|
| INV-1 | Sui CLI version is `mainnet-v1.71.1`; preflight asserts before publish | `sui --version` output match |
| INV-2 | AdminCap object owner == deployer wallet address | jq parse of `vault::create_vault` tx effects (objectChanges → AdminCap → owner.AddressOwner) |
| INV-3 | Vault shared object exists with `Quote = USDSUI` type parameter | jq parse of objectChanges → `select(.objectType | startswith("\(pkg)::vault::Vault<"))`; type-tag inside `<...>` matches `mainnet.toml [assets].quote_type_tag` |
| INV-4 | `config/mainnet.toml` has zero "TBD" values (except Phase 6 [hosting] block) | Preflight grep; smoke test re-runs assertion before publishing MAINNET-DEPLOY.json |
| INV-5 | MAINNET-DEPLOY.json `deploy_tx_digest` matches actual mainnet tx (resolvable via suiscan.xyz/mainnet/tx/<digest>) | Curl mainnet RPC `sui_getTransactionBlock` with the digest; assert effects.status.status == "success" |
| INV-6 | Post-smoke NAV-per-share within ±10 bps of pre-deposit NAV (vault NAV framing per D-03) | TS driver computes bps delta from snapshotVault calls; threshold check |
| INV-7 | Depositor received `>=` 89.9% of deposit back (per-depositor framing — 10% hedge alloc + 10 bps slack) | TS driver reads received Coin<USDsui> value after redeem_fulfill; computes ratio |
| INV-8 | Gas balance after smoke test ≥ 2 SUI raw (buffer for demo recording in Phase 6) | `sui client gas --json` post-flight check; warn if below |

These 8 invariants map to PLAN must-haves. The plan should encode each as a discrete verification step with a named exit code.

## Open Questions (RESOLVED)

1. **USDsui canonical type tag and decimals on mainnet.** Not findable via WebSearch as a structured field. Capture at Cetus swap time and write to mainnet.toml. **Recommendation:** Plan includes a "Step 0" task that runs a 5-line discovery script after the swap — read USDsui Coin object, extract type tag and CoinMetadata.decimals, validate decimals == 6 (or update strategy.toml + codegen if different). **DEFERRED to runtime — captured by Plan 05-03 when Cetus swap completes.**

2. **Does the Phase 4 dashboard read `dusdc_type_tag` field name by string from MAINNET-DEPLOY.json, or does it use a generic `quote_type_tag` field?** Cannot determine without reading Phase 4 plans which don't exist yet. **Recommendation:** Plan adds BOTH fields to MAINNET-DEPLOY.json — `quote_type_tag` (canonical) and `dusdc_type_tag` (alias) — until Phase 6 cleans up. **RESOLVED: dual naming implemented in Plan 05-03 — quote_type_tag canonical + dusdc_type_tag alias.**

3. **Is the redeem cooldown duration mutable via `admin_tune_strategy`?** Looking at contracts/sources/redeem.move L40, `COOLDOWN_MS: u64 = 3_600_000` is a `const`, not a vault field, so NO — it is fixed by the deployed Move bytecode. **Implication:** The "read from strategy.toml via codegen" instruction in CONTEXT.md cannot apply to cooldown today; only token-bucket capacity + refill rate are tunable. **Recommendation:** Plan extends strategy.toml with `[redemption].cooldown_ms` for documentation purposes (codegen emits to all three runtimes as a SHARED constant — Move side is duplicated with the existing `const COOLDOWN_MS`, with a codegen-drift check ensuring they match). This is a single-line strategy.toml addition + codegen extension. **RESOLVED: option (a) — extend shared/strategy.toml [redemption].cooldown_ms in Plan 05-05.**

4. **Should the predict-mainnet-check workflow be DELETED after 2026-06-09?** Once the check has fired and the human has flipped the flag, the workflow has no further job. **Recommendation:** Leave it deployed but expect manual cleanup post-submission (no impact on grader experience). Optionally `if: github.event.schedule == '0 9 9 6 *'` to make it a one-shot, but workflow_dispatch must remain for manual re-trigger. **RESOLVED: leave deployed, manual cleanup post-submission.**

5. **What ABI-match fingerprint format?** A robust ABI fingerprint includes (module name, public function name, parameter types, return types) for every public entry point of `predict.move`. **Recommendation:** Use `sui move build --dump-package-bytecode` against the vendored testnet source and `client.getNormalizedMoveModulesByPackage(packageId)` against the mainnet candidate; diff the JSON. Implementation complexity is moderate (~50 LOC TS); fallback is a SHA-256 of the public function signatures only. **DEFERRED to runtime — Plan 05-02 implements name-only v1 per RESEARCH recommendation; full type-signature is post-submission backlog.**

## References

### Authoritative (HIGH confidence)
- [Sui CLI Reference](https://docs.sui.io/references/cli/client) — publish output JSON shape
- [Sui GitHub Releases](https://github.com/MystenLabs/sui/releases) — mainnet-v1.71.1 protocol version 123
- [docs/MAINNET-FUNDING.md](../../../docs/MAINNET-FUNDING.md) — full operational playbook (Phase 0 deliverable)
- [.planning/research/PITFALLS.md §"Pitfall 14"](../../research/PITFALLS.md) — mainnet redeploy config-drift specifics
- [.planning/research/PITFALLS.md §"Pitfall 6"](../../research/PITFALLS.md) — Predict contract churn weekly sweep
- [contracts/sources/redeem.move](../../../contracts/sources/redeem.move) — `COOLDOWN_MS = 3_600_000` source of truth
- [contracts/sources/rebalance.move](../../../contracts/sources/rebalance.move) — `HedgeMinted` event struct (cost_basis_quote field)
- [contracts/sources/ltv.move](../../../contracts/sources/ltv.move) — `nav_per_share` formula
- [contracts/sources/vault.move](../../../contracts/sources/vault.move) — Vault<Quote> generic + AdminCap definition
- [scripts/e2e-vault-deploy.sh](../../../scripts/e2e-vault-deploy.sh) — testnet deploy reused 90% verbatim for mainnet
- [scripts/e2e-vault-cycle.ts](../../../scripts/e2e-vault-cycle.ts) — testnet cycle reused as smoke-test scaffold
- [.github/workflows/monday-predict-check.yml](../../../.github/workflows/monday-predict-check.yml) — cron + Issue posting pattern
- [.github/workflows/ci.yml](../../../.github/workflows/ci.yml) — Sui CLI install pattern for runners
- [shared/strategy.toml](../../../shared/strategy.toml) — `[token_bucket]`, `[hedge_policy]` (10% allocation_bps)

### Secondary (MEDIUM confidence)
- [Sui Unveils USDsui (blog.sui.io)](https://blog.sui.io/sui-unveils-usdsui-native-stablecoin/) — USDsui native mainnet stablecoin, issued by Bridge/Stripe, 1:1 USD-backed
- [Sui joins stablecoin race (The Block)](https://www.theblock.co/post/392271/sui-joins-stablecoin-race-with-usdsui-mainnet-launch) — confirms USDsui mainnet launch
- [Introducing DeepBook Predict (blog.sui.io)](https://blog.sui.io/introducing-deepbook-predict/) — confirms Predict testnet 2026-05-05, mainnet "later in 2026"
- [GitHub Docs schedule-issue-creation](https://docs.github.com/en/actions/tutorials/manage-your-work/schedule-issue-creation) — `permissions: issues: write` requirement
- [peter-evans/create-issue-from-file@v6](https://github.com/peter-evans/create-issue-from-file) — already used in repo
- [docs.sui.io DeepBook Predict](https://docs.sui.io/onchain-finance/deepbook-predict/) — referenced from CLAUDE.md stack notes

### Tertiary (LOW confidence — flag for in-execution verification)
- USDsui exact mainnet package address — NOT YET CAPTURED; must be discovered at Cetus swap time
- Predict mainnet package address (if shipped) — depends on 2026-06-09 probe verdict
- Predict mainnet ABI fingerprint — must be compared at probe time, not pre-determined

## Metadata

**Confidence breakdown:**
- Reusable scripts (e2e-vault-deploy.sh, e2e-vault-cycle.ts forks): HIGH — these run green today
- Preflight design: HIGH — every assertion is a one-liner with a known invocation pattern
- USDsui type tag/decimals: MEDIUM-LOW — must verify at swap time
- Predict-mainnet contingency: MEDIUM — the workflow shape is solid (mirrors monday-predict-check.yml); the ABI-match logic is novel and needs ~50 LOC of new TS/bash
- Smoke test ±10 bps math: MEDIUM — formula needs explicit worked-numbers in plan because v1 ltv carries cost basis on books (NAV doesn't drop the way the formula naively suggests)
- Token-bucket vs cooldown wait time: MEDIUM — flagged Open Question 3; recommend strategy.toml extension

**Research date:** 2026-05-13
**Valid until:** 2026-06-08 (one day before Predict-mainnet check fires; expect re-verification of USDsui and Predict status on that day)
