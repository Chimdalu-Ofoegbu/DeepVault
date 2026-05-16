# DeepVault Mainnet-Readiness Playbook

> **Reshape note (2026-05-13):** Renamed from `MAINNET-FUNDING.md`. Mainnet deploy is deferred to post-submission pending DeepBook Predict mainnet launch. This doc now serves two audiences: judges/readers who want to understand the mainnet posture, and the post-submission operator running the actual deploy. The toolkit (preflight + predict-mainnet-check + mainnet-deploy + mainnet-smoke-test scripts) is committed and lint-clean, ready to invoke. See `.planning/phases/05-testnet-demo-hardening/05-CONTEXT.md` for full rationale. The funding playbook below remains valid for post-submission execution.

## Why mainnet deploy is deferred to post-submission

DeepBook Predict mainnet has not shipped during the Sui Overflow 2026 submission window. Mysten launched Predict on **testnet** on 2026-05-05 and explicitly framed the mainnet launch as "later in 2026" — i.e., outside the 2026-06-16 submission deadline. Executing a mainnet smoke test against the deployed `deepvault` Move package today would degrade to `vault::supply` + `vault::redeem` with `allocation_bps=0` (no hedge mint, because there is no Predict package to mint against). That is strictly worse as a judge story than the full-PTB testnet demo (`make demo`), which exercises the complete deposit -> hedge mint -> redeem-request -> 1h cooldown -> redeem-fulfill cycle against the real testnet Predict package.

The post-submission window mainnet push remains the intended path if DeepVault pursues mainnet launch (e.g. winning Sui Overflow or otherwise commercializing). The toolkit — `scripts/preflight.sh`, `scripts/predict-mainnet-check.sh`, `scripts/mainnet-deploy.sh`, `scripts/mainnet-smoke-test.sh` — is committed, lint-clean, and ready to invoke in under 30 minutes of operator wall-clock the day DeepBook Predict ships on mainnet. The phase 5 reshape rationale is documented in full at [`.planning/phases/05-testnet-demo-hardening/05-CONTEXT.md`](../.planning/phases/05-testnet-demo-hardening/05-CONTEXT.md) (see `<reshape_note>` and decision D-01).

## 30-minute post-submission deploy procedure

When DeepBook Predict ships on mainnet, run the five steps below in order. Each step has a single command, an expected output, and a wall-clock estimate. Total active-operator time is under 30 minutes of editing + waiting on commands; total wall-clock including the smoke-test cooldown is approximately 1 hour 15 minutes.

1. **Verify Predict has shipped on mainnet** (~5 s)

   ```bash
   PREDICT_MAINNET_CANDIDATE=<package-id-from-mysten-announcement> \
     bash scripts/predict-mainnet-check.sh
   ```
   Expect stdout to contain `"shipped":true`. The script also emits a Markdown report below the JSON verdict — read it for the ABI-match status. Script source: [`scripts/predict-mainnet-check.sh`](../scripts/predict-mainnet-check.sh).

2. **Fill the now-known TBD slots in `config/mainnet.toml`** (~5 min)

   ```bash
   $EDITOR config/mainnet.toml
   ```
   Set `predict.package_id`, `predict.registry_id`, `predict.top_level_shared_object_id`, `predict.plp_type_tag`, `oracle_svi.event_module_full`, `assets.quote_type_tag`, and `contingency.predict_mainnet_shipped=true`. Verify USDsui balance (Step 2 of the funding playbook below) is already complete and the USDsui type tag is captured.

3. **Run preflight to verify config + golden vectors + parity tests** (~30 s)

   ```bash
   SUI_CONFIG_DIR=~/.sui/sui_config_mainnet bash scripts/preflight.sh
   ```
   Expect exit 0. Preflight runs all 14 gates including the section-aware TBD-slot scan (Pitfall 14 mitigation), USDsui balance >= 60 USDsui (10 seed + 50 smoke), gas balance >= 10 SUI, and the predict-mainnet-check transitive call at gate 14. Script source: [`scripts/preflight.sh`](../scripts/preflight.sh).

4. **Publish the deepvault package on mainnet + create vault** (~2-3 min RPC)

   ```bash
   SUI_CONFIG_DIR=~/.sui/sui_config_mainnet bash scripts/mainnet-deploy.sh
   ```
   Expect [`.planning/phases/05-testnet-demo-hardening/MAINNET-DEPLOY.json`](../.planning/phases/05-testnet-demo-hardening/MAINNET-DEPLOY.json) to be overwritten with `status: "deployed"` and real `package_id`, `vault_id`, `admin_cap_id`, `deploy_tx_digest`, `quote_type_tag`, `dusdc_type_tag` (alias), and `oracle_svi_id` values. The AdminCap-owner gate runs inline; deploy aborts if AdminCap is not held by the deployer wallet. Script source: [`scripts/mainnet-deploy.sh`](../scripts/mainnet-deploy.sh).

5. **Smoke-test the deployed mainnet vault** (~62 min wall-clock for the 1h cooldown)

   ```bash
   SUI_CONFIG_DIR=~/.sui/sui_config_mainnet \
     SUI_PRIVATE_KEY=<...> ORACLE_SVI_ID=<...> \
     bash scripts/mainnet-smoke-test.sh
   ```
   Expect 7 `[CHECKPOINT PASS]` markers and the final dual gate verdict line carrying both `ratio_bps=...` (Gate A: per-depositor return ratio) and `nav_delta_bps=...` (Gate B: vault NAV-per-share drift), both annotated `OK`. Script sources: [`scripts/mainnet-smoke-test.sh`](../scripts/mainnet-smoke-test.sh) and [`scripts/mainnet-smoke-test.ts`](../scripts/mainnet-smoke-test.ts).

**Total active-operator time: under 30 minutes of editing + waiting on commands. Total wall-clock: approximately 1 h 15 m including the smoke-test cooldown.**

## Architecture mainnet compatibility (single-config-flip)

The DeepVault architecture is mainnet-compatible via a single config flip in [`config/mainnet.toml`](../config/mainnet.toml). Every mainnet-specific value lives in that one file. No Move code, indexer code, dashboard code, or Python backtest code hardcodes a mainnet address. The testnet-to-mainnet switch is a config edit, not a code edit.

The config keys the operator fills at deploy time:

- `predict.package_id` — DeepBook Predict mainnet package
- `predict.registry_id` — Predict registry shared object
- `predict.top_level_shared_object_id` — Predict top-level shared object
- `predict.plp_type_tag` — PLP token type tag
- `oracle_svi.event_module_full` — full module path for the `OracleSVIUpdated` event
- `assets.quote_type_tag` — USDsui type tag (captured at Cetus swap time, Step 2 of the funding playbook below)
- `deepvault.package_id` / `deepvault.vault_shared_object_id` / `deepvault.admin_cap_id` / `deepvault.deploy_tx_digest` — written by `mainnet-deploy.sh` at deploy time
- `contingency.predict_mainnet_shipped` — flip to `true` when Predict mainnet has shipped and the toolkit is being invoked

Note also that `Move.toml [addresses].predict` will need a one-line update to the mainnet Predict package address at deploy time. CI's existing DeepBookV3 SHA-pin gate ([`scripts/verify-deepbookv3-pin.sh`](../scripts/verify-deepbookv3-pin.sh)) catches drift between `Move.toml` and the vendored source.

This is the Pitfall 14 mitigation in action: config drift between testnet and mainnet is structurally prevented by the schema-parallel `config/testnet.toml` and `config/mainnet.toml` files plus the `scripts/preflight.sh` section-aware TBD-slot scanner. See [`.planning/research/PITFALLS.md`](../.planning/research/PITFALLS.md) §"Pitfall 14" for the full failure-mode taxonomy.

---

**Purpose:** Two audiences. (1) **Judges/readers** — understand why DeepVault's mainnet deploy is post-submission and how the toolkit is ready to invoke. (2) **Post-submission operator** — mechanical playbook for the actual deploy when Predict mainnet ships. The playbook below eliminates decisions during the high-pressure window.
**Budget:** ~$80 USD total (with $30 buffer; see Risk Flag below). $0 spent during submission window.
**Trigger:** Post-submission, after `scripts/predict-mainnet-check.sh` reports `shipped:true` and ABI matches.

## Wallets (per `.planning/phases/00-setup-ground-rules/00-CONTEXT.md` D-06)

Two separate Sui keypairs, generated in `docs/DEV-BOOTSTRAP.md` Task 4:

| Wallet | Purpose | Storage |
|--------|---------|---------|
| Testnet dev | High-churn faucet-fed; runs scripts, integration tests, exploratory PTBs | `~/.sui/sui_config/sui.keystore` (default) |
| Mainnet deploy | Locked down; only Phase 5 deploy + smoke test + demo recording | `~/.sui/sui_config_mainnet/sui.keystore` (set `SUI_CONFIG_DIR` env var when invoking) |

**Key safety:**
- Both keystores live in `~/`, NEVER in repo. `.gitignore` excludes `.sui/`, `**/.sui/`, `sui_config*/`, `*.keystore`.
- Backup the mainnet keystore (`~/.sui/sui_config_mainnet/sui.keystore`) to encrypted external storage **before** any mainnet activity.
- Mnemonic for mainnet wallet stored in password manager only.

## Funding flow (Phase 5, ~Day 33)

Total funding target: $80 USD (with $30 buffer flag — see Risk Flag below).

### Step 1: Fund SUI to mainnet wallet (~$30)

CEX (Coinbase, Binance, Kraken) → SUI mainnet → mainnet deploy wallet address.

- Buy ~$30 of SUI on CEX
- Withdraw to mainnet deploy address (recorded in `docs/DEV-BOOTSTRAP.md`)
- Confirm with: `SUI_CONFIG_DIR=~/.sui/sui_config_mainnet sui client gas`
- Expected: 1 gas object, ≥10 SUI raw (depends on SUI price)

### Step 2: Acquire USDsui via Cetus DEX (~60 USDsui)

Cetus is the canonical Sui DEX for SUI ↔ USDsui. Verify the official URL in Phase 5 (URL pattern may evolve before submission).

- Connect mainnet deploy wallet (Slush extension)
- Visit https://app.cetus.zone/swap and select SUI → USDsui
- Swap ~60 USDsui worth of SUI → USDsui (10 USDsui seed + 50 USDsui smoke test — Plan 05-05 correction per RESEARCH carry-forward; `vault::create_vault` consumes a 10-USDsui seed in addition to the 50-USDsui smoke-test deposit)
- Confirm receipt: `SUI_CONFIG_DIR=~/.sui/sui_config_mainnet sui client objects | grep -i USDsui`

**Type tag check (verify before locking into config/mainnet.toml):**
The expected USDsui mainnet type tag follows the shape `0x{USDSUI_PACKAGE}::usdsui::USDSUI`. Capture the exact value at swap time and write it into `config/mainnet.toml [assets] quote_type_tag` (currently `"TBD"`).

### Step 3: Deploy DeepVault Move package (~$15 gas)

Preflight first (see `scripts/preflight.sh`, Phase 5 fills):
```bash
SUI_CONFIG_DIR=~/.sui/sui_config_mainnet bash scripts/preflight.sh
```

Preflight asserts (Pitfall 14 mitigation):
- Every TBD slot in `config/mainnet.toml` is filled
- `Move.toml` matches mainnet config
- Golden vectors pass against fresh mainnet RPC
- Predict mainnet pkg version pinned (or fallback per DEPLOY-09)
- Margin mainnet pkg version pinned
- Full Move test suite + Python parity tests green

Once preflight is green:
```bash
SUI_CONFIG_DIR=~/.sui/sui_config_mainnet \
  sui client publish --gas-budget 1000000000 contracts/
```

Capture from `sui client publish` output:
- `package_id` → `config/mainnet.toml [deepvault] package_id`
- `vault_shared_object_id` → `[deepvault] vault_shared_object_id`
- `admin_cap_id` → `[deepvault] admin_cap_id`
- `tx_digest` → `[deepvault] deploy_tx_digest`

Expected gas: 0.5–2 SUI (~$5–15). Each retry burns gas — buffer covers up to 2 retries.

### Step 4: Smoke test ($50 USDsui round-trip; DEPLOY-04, deadline 2026-06-12)

Per DEPLOY-04 — script `scripts/mainnet-smoke-test.sh` (Phase 5 fills):

1. `vault::supply` 50 USDsui → mints VAULT_SHARE
2. `vault::rebalance::buy_hedge_for_deposit` → mints binary hedge via `predict::mint`
3. `vault::redeem_request` 50% of shares → ticket
4. Wait for token-bucket window to refill
5. `vault::redeem_fulfill` ticket → returns USDsui (less hedge cost)

Expected outcome: NAV-per-share post-cycle within tolerance of pre-cycle. Tx digests recorded in submission package.

If any step fails: see Risk Flag below.

## Risk Flag: $30 buffer is tight

Per CONTEXT.md D-07: budget breakdown is $50 USDsui smoke + ~$15 SUI gas + ~$15 buffer = ~$80 total.

If Phase 5 hits a redeploy due to:

- Predict mainnet contract churn between Phase 0 and Phase 5
- Config bug discovered in smoke test (wrong type tag, wrong oracle ID)
- USDsui slippage ate buffer
- A second `sui client publish` retry needed

**Top up to $150 total before Day 36 (2026-06-12).** Better $70 of unused budget than a submission missed because mainnet wasn't funded.

## Contingency: Predict mainnet not shipped (DEPLOY-09 / D-09)

If Predict mainnet has NOT shipped by 2026-06-09 (Day 32):

1. Set `config/mainnet.toml [contingency] predict_mainnet_shipped = false` (default)
2. Execute fallback per ROADMAP Phase 5 success criterion #4: "vault + Margin path on mainnet, testnet-only Predict path"
3. Demo video shows: full PTB on testnet (Margin + Predict + vault hedge), then a separate mainnet-only deposit/redeem cycle (no Predict integration on mainnet)
4. Document the fallback path in submission README + this file's change log

If Predict mainnet HAS shipped: set the flag to `true` and proceed with the normal flow above.

## Demo recording (Day 35-36, after smoke test passes)

- Demo PTB uses **mainnet** vault, **mainnet** wallet (per ROADMAP Hard Policy Lock #7: "Demo recorded on mainnet only, after smoke test")
- Demo recording wallet may be a third *fresh* keypair (CONTEXT.md D-09: ephemeral keypair generated at recording time, funded with ~$10 SUI for gas + ~$10 USDsui from the deploy wallet via a single transfer)
- Tx digest visible in recording, pasteable into Sui Explorer (https://suiscan.xyz/mainnet/home)
- Local Vite dev server is the recording target (CONTEXT.md D-14: controllable, no network surprises) — but the dashboard points at the mainnet vault

## Post-submission

- Mainnet deploy wallet: keep funded with residual SUI
- AdminCap: held by deployer wallet (recorded in `config/mainnet.toml [deepvault] treasury_cap_holder` and READMES) per Pitfall 14 (Move package upgrade left enabled)
- Upgrade cap: see DEPLOY-09 contingency

## References

- `.planning/phases/00-setup-ground-rules/00-CONTEXT.md` D-06..D-09
- `.planning/research/PITFALLS.md` Pitfall 14 (mainnet redeploy disasters)
- `.planning/ROADMAP.md` Phase 5 success criteria + Hard Policy Lock #6 (smoke test deadline)
- `config/mainnet.toml` — TBD slots that preflight asserts
- `docs/DEV-BOOTSTRAP.md` — wallet provisioning (Plan 02)
- `docs/HEDGE-POLICY.md` — locked hedge policy that drives buy_hedge_for_deposit
- `CONTRIBUTING.md §"Ship-date hard locks"` — Day 36 mainnet smoke deadline
