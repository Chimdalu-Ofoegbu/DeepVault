# DeepVault Mainnet Funding Playbook

**Purpose:** Mechanical Phase 5 execution — the mainnet redeploy is high-pressure; this playbook eliminates decisions during deploy.
**Budget:** ~$80 USD total (with $30 buffer; see Risk Flag below)
**Trigger:** Phase 5 begins ~Day 33 (2026-06-10) per ROADMAP.

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

### Step 2: Acquire USDsui via Cetus DEX (~$50 → USDsui)

Cetus is the canonical Sui DEX for SUI ↔ USDsui. Verify the official URL in Phase 5 (URL pattern may evolve before submission).

- Connect mainnet deploy wallet (Slush extension)
- Visit https://app.cetus.zone/swap and select SUI → USDsui
- Swap ~$50 worth of SUI → USDsui
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
