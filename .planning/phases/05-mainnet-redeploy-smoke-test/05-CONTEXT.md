# Phase 5: Mainnet Redeploy + Smoke Test - Context

**Gathered:** 2026-05-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Publish the `deepvault` Move package on Sui mainnet with USDsui as quote asset, smoke-test a real $50 USDsui round-trip (deposit → hedge → redeem) by 2026-06-12, and lock the Predict-mainnet contingency on 2026-06-09. Phase 5 closes DEPLOY-01, DEPLOY-02, DEPLOY-03, DEPLOY-04, DEPLOY-09.

**In scope:**
- `scripts/preflight.sh` — asserts every TBD slot in `config/mainnet.toml` is filled, Move.toml matches mainnet config, golden vectors pass against fresh mainnet RPC, Predict+Margin mainnet pkg versions pinned (or fallback flag set per D-09), full Move test suite + Python parity tests green, deploy wallet gas balance ≥ 10 SUI, USDsui balance ≥ 50 USDsui.
- `scripts/predict-mainnet-check.sh` + `.github/workflows/predict-mainnet-check.yml` — 09:00 UTC 2026-06-09 cron that probes Predict mainnet, reports as a GitHub Issue with `shipped:true/false` + ABI-match status, requires human-merged config flip.
- `scripts/mainnet-deploy.sh` — Sui CLI publish of the deepvault Move package; captures package_id + vault_shared_object_id + admin_cap_id + treasury_cap_holder + deploy_tx_digest into `config/mainnet.toml` and `MAINNET-DEPLOY.json`.
- `scripts/mainnet-smoke-test.sh` — staged $50 USDsui round-trip with explicit verification gates between each step (deposit → check NAV → hedge → check exposure → redeem-request → wait → redeem-fulfill → final NAV check). Tolerance: post-redeem NAV-per-share equals pre-deposit NAV-per-share minus realized hedge cost, within ±10 bps.
- Fallback execution branch — if `predict_mainnet_shipped=false` on 2026-06-09, smoke test runs `vault::supply` + `vault::redeem` on mainnet only (no hedge purchase); the full PTB with Predict stays on testnet for the demo video (split-demo shape per D-04).
- `config/mainnet.toml` filled: `[predict]`, `[deepbook_margin]`, `[oracle_svi]`, `[assets].quote_type_tag` (USDsui type tag via Cetus swap), `[deepvault].*`, `[contingency].predict_mainnet_shipped`.
- README + `docs/MAINNET-FUNDING.md` updated with: mainnet contract addresses, deployer wallet, vault creation tx digest, smoke test tx digests, fallback rationale (if triggered).

**Out of scope (handed to other phases):**
- Vercel + Render hosting deploys → Phase 6 demo prep (per D-01 below)
- Demo video recording → Phase 6 (per ROADMAP Phase 6)
- Multisig governance for AdminCap → post-submission backlog (v1 single-key per Phase 0)
- Mainnet RPC failover / multi-endpoint → out of scope (single endpoint per Phase 0)
- Custom mainnet domain → out of scope (Phase 0 D-16)

</domain>

<decisions>
## Implementation Decisions

### Phase 5 Scope Boundary
- **D-01: Move package + smoke test only. Hosting deferred to Phase 6.** Phase 5 publishes `deepvault` on mainnet and runs the $50 smoke test. The Vercel (dashboard) and Render (relay) deploys move to Phase 6 demo prep. `config/mainnet.toml [hosting]` TBD slots are filled by Phase 6, not Phase 5. **Rationale:** cleaner scope, lower coupling; if mainnet smoke test fails, no hosting work was wasted. Hosting work can run in parallel with demo recording.

### Smoke Test Shape (DEPLOY-04)
- **D-02: Staged with checkpoints + AdminCap pause window.** The smoke test runs as discrete verification gates: deposit → check NAV-per-share & event emission → hedge mint → check exposure registry → redeem_request → wait for token-bucket window → redeem_fulfill → final NAV check. Each step is its own script call. If step N fails, AdminCap pause is the operator's emergency action; recovery is manual.
- **D-03: NAV tolerance band = ±10 bps relative to (pre-deposit NAV-per-share − realized hedge cost).** Pre-deposit NAV-per-share is captured BEFORE step 1. Post-redeem NAV-per-share must equal `pre_deposit_nav - hedge_cost ± 10bps`. Any deviation outside that band = FAIL. Matches the brief's "PLP yield minus crash insurance" thesis exactly; catches accounting drift and hedge-pricing bugs.

### Predict-Mainnet Contingency Trigger (DEPLOY-09)
- **D-04: Programmatic GitHub Action at 09:00 UTC 2026-06-09, with human-merged config flip.** `.github/workflows/predict-mainnet-check.yml` cron runs `scripts/predict-mainnet-check.sh` at 09:00 UTC 2026-06-09. The script queries mainnet RPC for the Predict package and attempts a read-only call. Result is posted as a GitHub Issue with `shipped:true/false` + ABI-match status (vs `predict-testnet-4-16` branch). I review the Issue and merge a config commit to flip `predict_mainnet_shipped` in `config/mainnet.toml`. **Why human-in-the-loop:** automated commits can't catch contract-version drift that requires human judgment (e.g., minor ABI rename that's safe vs structural change that needs re-integration).
- **D-05: Fallback shape = split demo (testnet PTB + mainnet supply/redeem).** If `predict_mainnet_shipped=false` after the 2026-06-09 check, the smoke test runs `vault::supply` + `vault::redeem` on mainnet only (no `vault::rebalance::buy_hedge_for_deposit`); the demo video (Phase 6) shows two sequences: (1) full PTB on testnet with Margin + Predict + vault hedge (already working from Phase 3), and (2) separate mainnet deposit/redeem cycle on the live vault. README documents the split + rationale.

### Preflight Script Coverage (DEPLOY-01)
- **D-06: Preflight covers locked checks + 3 operational gates.** Beyond DEPLOY-01's required checks (Move.toml mainnet config, golden vectors against fresh mainnet RPC, Predict+Margin mainnet pkg versions pinned, full Move + Python parity tests green), preflight asserts: (a) every `config/mainnet.toml` TBD slot is filled (Pitfall 14 mitigation), (b) deploy wallet gas balance ≥ 10 SUI raw, (c) USDsui balance on deploy wallet ≥ 50 USDsui (so smoke test won't stall on funding). Preflight aborts on any FAIL.

### Claude's Discretion
The following are chosen by me as builder — recorded for downstream agents, no user decision needed:

- **Script invocation pattern:** All Phase 5 scripts use `SUI_CONFIG_DIR=~/.sui/sui_config_mainnet` (per Phase 0 D-06) to scope to the mainnet keystore. The mainnet env switch is explicit per command; we never run against an ambient `sui client switch --env mainnet`. Prevents accidental cross-network actions.
- **Deployment output capture:** Mainnet publish output parsed into `MAINNET-DEPLOY.json` (sibling of Phase 2's `TESTNET-DEPLOY.json`). Format mirrors testnet shape: `{ status, package_id, vault_shared_object_id, admin_cap_id, treasury_cap_holder, deploy_tx_digest, network: "mainnet", deployed_at_ms }`. Downstream Phase 6 dashboard consumption is identical (just swap env var).
- **AdminCap retention policy:** Held by deploy wallet (per Phase 0 D-06) for the entire Phase 5 + Phase 6 window. Post-submission burn / multisig migration is backlog. The AdminCap exists ONLY for: emergency pause if smoke test reveals a bug, oracle-staleness override if SVI feed stalls. No discretionary admin actions.
- **Preflight artifact:** `scripts/preflight.sh` shell script (bash; portable across macOS/Linux/WSL). No new language dependency. Reuses existing helpers from `scripts/e2e-vault-deploy.sh`.
- **Smoke test gas budget:** Each step uses `--gas-budget 500000000` (0.5 SUI) consistent with `e2e-vault-deploy.sh`. Total smoke test gas ≈ 2-3 SUI across 4 transactions.
- **Token-bucket wait time:** Smoke test pauses `WITHDRAWAL_BUCKET_REFILL_MS_PER_USER + 5s` between redeem_request and redeem_fulfill. Read from `shared/strategy.toml` via codegen — no hardcoded value.
- **MAINNET-DEPLOY.json commit:** Committed to master with the smoke-test pass commit. Pitfall 14 prevention: the deploy outputs are version-controlled so judges can verify.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 5 source-of-truth (MANDATORY first read)
- `.planning/ROADMAP.md` §"Phase 5: Mainnet Redeploy + Smoke Test" — goal, 5 success criteria, dependency on Phase 4, hard date 2026-06-12
- `.planning/REQUIREMENTS.md` lines 84-93 — DEPLOY-01 through DEPLOY-04 + DEPLOY-09 detailed acceptance criteria
- `.planning/PROJECT.md` §"Key Decisions" — "Mainnet redeploy in v1 scope (actual deploy, not just plan)" locked
- `docs/MAINNET-FUNDING.md` — full operational playbook: wallet setup, funding flow (CEX → SUI → Cetus → USDsui), preflight, publish, smoke test, contingency, demo recording, post-submission posture

### Carry-forward decisions from prior phases
- `.planning/phases/00-setup-ground-rules/00-CONTEXT.md` §"Wallet & Mainnet Funding" — D-06 (two wallets, separate keystores), D-07 ($80 budget, $30 buffer), D-08 (Cetus DEX swap), D-09 (Predict-mainnet contingency at 2026-06-09)
- `.planning/phases/00-setup-ground-rules/00-CONTEXT.md` §"Dashboard & Relay Hosting" — D-13 (Vercel free tier, default subdomain), D-15 (Render free tier), D-16 (no custom domain)
- `.planning/phases/02-vault-move-package-testnet-deploy/02-CONTEXT.md` — testnet vault deploy decisions to mirror (admin cap holder, treasury cap quarantine, predict_adapter wiring)

### Move package being deployed
- `contracts/Move.toml` — Sui CLI version pin (mainnet-v1.71.1), DeepBookV3 SHA pin (predict-testnet-4-16 branch)
- `contracts/sources/vault.move` — shared object, total_assets, hedge registry, pause flag
- `contracts/sources/share.move` — TreasuryCap quarantine, VAULT_SHARE coin
- `contracts/sources/supply.move` — supply with virtual-shares + decimals_offset 10^6+ (inflation-attack mitigation)
- `contracts/sources/redeem.move` — two-step redeem_request + redeem_fulfill + per-user token-bucket
- `contracts/sources/rebalance.move` — `buy_hedge_for_deposit` via predict::mint at theoretical SSVI price
- `contracts/sources/predict_adapter.move` — thin Predict ABI wrapper (single-file blast radius for contract churn)
- `contracts/sources/ltv.move` — `worst_case_haircut` view function (Margin liquidation path)
- `contracts/sources/svi_view.move` — Move SVI evaluator (Phase 1 parity-protected)

### Mainnet config (TBD slots Phase 5 fills)
- `config/mainnet.toml` — `[predict]`, `[deepbook_margin]`, `[oracle_svi]`, `[assets].quote_type_tag`, `[deepvault].*`, `[contingency].predict_mainnet_shipped` all need to flip from "TBD" to live values
- `config/testnet.toml` — schema reference; mainnet schema MUST stay identical (Pitfall 14)

### Reusable testnet analogs (Phase 5 forks ~90% of these)
- `scripts/e2e-vault-deploy.sh` — testnet deploy; mainnet equivalent swaps env config
- `scripts/e2e-vault-cycle.sh` — testnet round-trip; mainnet smoke test forks with staged checkpoints + ±10 bps NAV gate
- `scripts/e2e-vault-cycle.ts` — TypeScript PTB construction patterns
- `.planning/phases/02-vault-move-package-testnet-deploy/TESTNET-DEPLOY.json` — output shape for `MAINNET-DEPLOY.json`

### Pitfalls + research
- `.planning/research/PITFALLS.md` §"Pitfall 14: Mainnet redeploy disasters" — config drift prevention; the entire preflight script is a Pitfall 14 mitigation
- `.planning/research/PITFALLS.md` §"Pitfall 6: DeepBook Predict contract churn" — Monday sweep; predict-mainnet-check is the Phase 5 specialization
- `.planning/research/SUMMARY.md` — phase-ordering rationale, hard policy locks
- `docs/HEDGE-POLICY.md` — locked hedge values that drive `buy_hedge_for_deposit` on mainnet

### CI infrastructure to extend
- `.github/workflows/ci.yml` — existing 6-job matrix; preflight integrates as a new job (or gating workflow)
- `.github/workflows/keepalive-relay.yml` — Phase 0 / Phase 4 cron; reference shape for `predict-mainnet-check.yml`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`scripts/e2e-vault-deploy.sh`** — testnet deploy already does SHA pin check, Move build, env check, `sui client publish`, parse package_id + vault_shared_object_id + admin_cap_id + treasury_cap_holder, write TESTNET-DEPLOY.json. Mainnet equivalent (`scripts/mainnet-deploy.sh`) reuses ~90% — swap `SUI_CONFIG_DIR`, swap RPC URL, swap config file path, write MAINNET-DEPLOY.json.
- **`scripts/e2e-vault-cycle.sh`** + **`scripts/e2e-vault-cycle.ts`** — testnet supply→hedge→redeem cycle. Mainnet smoke test forks the TS file to inject (a) staged checkpoints between each PTB, (b) NAV-per-share capture pre-deposit and post-redeem, (c) ±10 bps tolerance gate (D-03).
- **`config/testnet.toml`** — schema reference. Mainnet schema is already declared in `config/mainnet.toml` with TBD slots; Phase 5 fills them.
- **`MAINNET-FUNDING.md`** — already documents the wallet flow, gas budgets, contingency path, and recording wallet provisioning. Phase 5 EXECUTES this playbook rather than re-deciding any of it.
- **Phase 2's `TESTNET-DEPLOY.json`** — JSON shape proven; mainnet emits `MAINNET-DEPLOY.json` with identical schema + `network: "mainnet"`.

### Established Patterns

- **`SUI_CONFIG_DIR=~/.sui/sui_config_mainnet`** prefix on every mainnet command (per Phase 0 D-06) — never `sui client switch --env mainnet` (ambient state = mistake risk).
- **Config TBD slot pattern** — every mainnet-only address starts as `"TBD"`; preflight asserts no TBD remains (Pitfall 14 mitigation). Phase 5's preflight is the gate that enforces this.
- **JSON deploy-output pattern** — `TESTNET-DEPLOY.json` is read by relay + dashboard via env var; mainnet equivalent works identically. No code path for "is this testnet or mainnet" — the config drives it.
- **GitHub Action cron + Issue posting** — Phase 0's `monday-predict-check.yml` already emits Issues on contract-version diff. `predict-mainnet-check.yml` mirrors this shape.
- **Codegen-driven constants** — `shared/strategy.toml` drives Move/Python/TS constants; smoke test reads `WITHDRAWAL_BUCKET_REFILL_MS_PER_USER` from this source (no hardcoded waits).

### Integration Points

- **Sui CLI `mainnet-v1.71.1`** — pinned in Phase 0; preflight asserts this version against `sui --version`.
- **Mainnet RPC `https://fullnode.mainnet.sui.io:443`** — only endpoint in scope. Preflight pings it for a smoke health check.
- **Cetus DEX (https://app.cetus.zone/swap)** — human-operated swap for USDsui acquisition. Not scriptable in Phase 5; documented in playbook.
- **`config/mainnet.toml`** is the central config artifact; downstream Phase 6 reads it for hosting + demo recording.

</code_context>

<specifics>
## Specific Ideas

- **2026-06-09 09:00 UTC** is the exact moment the predict-mainnet-check Action fires. The GitHub Issue auto-created at that time becomes the audit trail.
- **2026-06-12 (Day 36)** is the hard smoke-test deadline per Hard Policy Lock #6 (ROADMAP). Phase 5 plan MUST plan the smoke test to land by EOD UTC 2026-06-12 with at least one retry window.
- **MAINNET-DEPLOY.json** path: `.planning/phases/05-mainnet-redeploy-smoke-test/MAINNET-DEPLOY.json` (mirrors Phase 2's `.planning/phases/02-vault-move-package-testnet-deploy/TESTNET-DEPLOY.json`).
- **Preflight script `scripts/preflight.sh`** — separate executable, callable manually OR from CI. Mainnet-only checks; no testnet branch.

</specifics>

<deferred>
## Deferred Ideas

- **Multisig governance for AdminCap** — out of scope per Phase 0 D-06 single-key lock. Backlog item for post-submission DAO migration.
- **Mainnet RPC failover / multi-endpoint** — out of scope. Single endpoint per Phase 0; redundancy is post-submission infra hardening.
- **AdminCap burn after smoke test** — v1 keeps the cap with deployer (emergency pause window). Burn timing is post-submission decision.
- **Custom mainnet domain** — out of scope per Phase 0 D-16. Default Vercel subdomain suffices.
- **Vercel + Render hosting deploys pointing at mainnet** — moved to Phase 6 demo prep per D-01. Phase 5 does Move only.
- **Demo video recording** — Phase 6 scope per ROADMAP.
- **Recording wallet provisioning + funding** — Phase 6 scope (ephemeral keypair funded from deploy wallet at recording time, per Phase 0 D-09).

</deferred>

---

*Phase: 05-mainnet-redeploy-smoke-test*
*Context gathered: 2026-05-13*
