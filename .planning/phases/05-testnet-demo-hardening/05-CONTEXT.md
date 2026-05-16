# Phase 5: Testnet Demo Hardening + Mainnet-Readiness Toolkit - Context

**Gathered:** 2026-05-13
**Reshaped:** 2026-05-13 (was "Mainnet Redeploy + Smoke Test" — pivoted because DeepBook Predict mainnet not shipping in submission window)
**Status:** Ready for planning

<reshape_note>
## Reshape Rationale (2026-05-13)

Phase 5 was originally "Mainnet Redeploy + Smoke Test". The original plan inherited a Phase 0 D-06/D-07/D-08 decision lock ("mainnet redeploy in v1 scope, with split-demo fallback if Predict mainnet hasn't shipped by 2026-06-09"). Because DeepBook Predict mainnet is essentially confirmed not shipping inside the submission window (2026-06-16), executing the planned mainnet smoke test would reduce to `vault::supply` + `vault::redeem` with `allocation_bps=0` — a crippled, no-hedge version of the product on mainnet, while the full PTB + Predict + Margin + vault hedge demo already works on testnet.

**User direction (2026-05-13):** "This build needs a demo that can be fully tested on Sui testnet before deploying to mainnet... My aim is to have an actual demo that can be presented to judges."

**Decision:** Pivot Phase 5 from "execute mainnet redeploy + smoke test" to "harden testnet demo + write mainnet-readiness toolkit (deferred execution)". The mainnet push remains intended post-submission if DeepVault wins or otherwise pursues mainnet launch.

**Cascade of supersessions documented:**
- ROADMAP.md Phase 5 + Phase 6 goals + Hard Policy Locks #4, #6, #7 — see ROADMAP reshape notes
- REQUIREMENTS.md DEPLOY-01..05, DEPLOY-09 — see header reshape note
- PROJECT.md "Mainnet redeploy in v1 scope" key decision + scope-checkbox + constraint + submission constraint — see PROJECT.md supersession marks
- Phase 0 CONTEXT.md "Wallet & Mainnet Funding" section (D-06, D-07, D-08 mainnet-execution portions) — see Phase 0 supersession note
- `docs/MAINNET-FUNDING.md` renamed to `docs/MAINNET-READINESS.md` and absorbs as post-submission operational reference

**Carry-forward from the prior plan run:** The mainnet-toolkit pieces from the original Phase 5 plans (preflight, predict-mainnet-check, mainnet-deploy, mainnet-smoke-test) are retained as **write-but-don't-execute** deliverables. They remain real, lint-clean, dry-run-clean scripts, ready to invoke post-submission. The strategy.toml cooldown codegen extension is retained unchanged (it's also needed for the testnet smoke test).
</reshape_note>

<domain>
## Phase Boundary

Harden the testnet `deepvault` vault to judge-presentable demo quality with a reproducible staged smoke test, and write the complete mainnet-readiness toolkit (scripts + runbook) ready for post-submission execution when DeepBook Predict mainnet ships. Lock the testnet smoke test by 2026-06-12.

**In scope:**
- `scripts/testnet-smoke-test.sh` + `scripts/testnet-smoke-test.ts` — staged $50-equivalent DUSDC deposit → hedge mint → redeem-request → wait → redeem-fulfill → dual ±10 bps NAV verification (per-depositor return ratio ≥ 99.9% AND vault NAV drift ≤ 10 bps). Forked from `scripts/e2e-vault-cycle.sh` + `.ts` with staged checkpoints added between each step. Wave 2 (depends on cooldown codegen).
- `scripts/preflight.sh` — write but don't execute. Asserts every TBD slot in `config/mainnet.toml` is filled, Move.toml mainnet block matches config, golden vectors pass against fresh mainnet RPC, full Move + Python parity tests green, deploy wallet gas balance ≥ 10 SUI, USDsui balance ≥ 60 USDsui. Intentionally exits non-zero today (Predict mainnet pkg TBD). Lints clean.
- `scripts/predict-mainnet-check.sh` — manual tool. Probes mainnet RPC for the Predict package and attempts a read-only call; reports `shipped:true/false` + ABI-match status (name-only). **No GitHub Actions cron** (no consumer post-pivot); callable manually post-submission to check when Predict ships.
- `scripts/mainnet-deploy.sh` — write but don't execute. Forked from `scripts/e2e-vault-deploy.sh` with mainnet divergences (gas budget, RPC URL, SUI_CONFIG_DIR, config file path). Captures package_id + vault_shared_object_id + admin_cap_id + treasury_cap_holder + deploy_tx_digest + oracle_svi_id into `config/mainnet.toml` and `MAINNET-DEPLOY.json` when invoked. Lints clean.
- `scripts/mainnet-smoke-test.sh` + `scripts/mainnet-smoke-test.ts` — write but don't execute. Mainnet variant of testnet-smoke-test with same staged + dual ±10 bps gate; targets mainnet RPC + USDsui type tag. Forked from testnet-smoke-test. Lints clean.
- `MAINNET-DEPLOY.json` placeholder — `{"status":"not_deployed","reason":"Predict mainnet pending","scripts_ready":true,"toolkit_path":"scripts/mainnet-deploy.sh"}`.
- `shared/strategy.toml` extension — add `[redemption].cooldown_ms = 3_600_000` + codegen emits to Move (`contracts/sources/strategy_constants.move`), Python (`backtest/src/deepvault/strategy_constants.py`), TS (`dashboard/src/lib/strategy_constants.ts`). Testnet smoke test imports `STRATEGY_CONSTANTS.REDEMPTION_COOLDOWN_MS` — no hardcoded waits.
- `docs/MAINNET-READINESS.md` (renamed from `docs/MAINNET-FUNDING.md`) — documents (a) why mainnet deploy is deferred to post-submission, (b) the ≤30-minute deploy procedure (preflight → deploy → smoke-test), (c) the architecture's mainnet compatibility (single-config-flip via `config/mainnet.toml`), (d) the original $80 funding budget retained for post-submission execution, (e) Cetus USDsui acquisition playbook (carried from the old funding doc).
- `README.md` updated with: testnet contract addresses, `make demo` reproducible-run target, one-paragraph laypitch + glossary, mainnet-readiness status, Sui testnet explorer links for the vault.
- `Makefile` `demo` target — fills in the existing `@echo "TODO: Phase 6 fills this in"` placeholder. Invokes `scripts/testnet-smoke-test.sh` end-to-end so judges can `make demo` from a fresh clone.

**Out of scope (handed to other phases or deferred):**
- Actual mainnet publish of `deepvault` — deferred to post-submission (Predict mainnet dependency)
- Actual mainnet smoke test with real $50 USDsui — deferred to post-submission
- Vercel + Render hosting deploys → Phase 6 demo prep (unchanged)
- Demo video recording → Phase 6 (now targets testnet, per Phase 6 reshape)
- GitHub Actions cron for predict-mainnet-check — dropped (no consumer; `predict-mainnet-check.sh` is manual)
- Multisig governance for AdminCap → post-submission backlog (v1 single-key per Phase 0)
- Mainnet RPC failover / multi-endpoint → out of scope (single endpoint per Phase 0)
- Custom mainnet domain → out of scope (Phase 0 D-16)

</domain>

<decisions>
## Implementation Decisions

### Phase 5 Reshape Identity
- **D-01: Phase 5 deliverable shape — testnet hardening + mainnet-readiness toolkit; no mainnet execution.** Five concrete deliverables: (1) testnet smoke test harness with dual ±10 bps gate, (2) cooldown codegen extension, (3) mainnet-readiness toolkit (preflight + predict-check + deploy + mainnet smoke test, all write-but-don't-execute), (4) MAINNET-READINESS.md runbook (renamed from MAINNET-FUNDING.md), (5) README hardening + `make demo` target. **Rationale:** the judge-facing demo is the full-PTB testnet flow; mainnet redeploy is post-submission infrastructure. See `<reshape_note>` above.

### Testnet Smoke Test Shape (DEPLOY-04)
- **D-02: Staged with checkpoints + dual ±10 bps NAV verification.** Same shape as the original mainnet design: deposit → check NAV-per-share & event emission → hedge mint → check exposure registry → redeem_request → wait for token-bucket window → redeem_fulfill → final NAV check. Each step is its own verify gate. If step N fails, the script exits with the failure context.
- **D-03: Dual ±10 bps verification.** Two framings, both must pass: (a) per-depositor return ratio ≥ 99.9% of (pre-deposit principal − realized hedge cost); (b) vault NAV drift ≤ 10 bps from pre-deposit snapshot. Catches accounting drift and hedge-pricing bugs from two angles. Same logic as the original mainnet smoke test design — carries forward unchanged.
- **D-04: Use existing testnet deployment from Phase 2** (`TESTNET-DEPLOY.json`). Do NOT redeploy on testnet for the smoke test. Phase 2 produced the testnet vault; Phase 5 just exercises it.

### Mainnet-Readiness Toolkit (DEPLOY-01, DEPLOY-02, DEPLOY-03)
- **D-05: Toolkit is write-but-don't-execute.** All four mainnet scripts (preflight, predict-mainnet-check, mainnet-deploy, mainnet-smoke-test) are written, linted (`bash -n`, `shellcheck`, `tsc --noEmit`), and dry-run against the current TBD state of `config/mainnet.toml`. Preflight exits non-zero today (Predict TBD); deploy + smoke test are gated behind preflight, so they can't accidentally execute. Acceptance criterion is "scripts pass linting and a dry-run audit," not "scripts ran successfully end-to-end."
- **D-06: Preflight covers locked checks + 3 operational gates.** Beyond DEPLOY-01's required checks (Move.toml mainnet config, golden vectors against fresh mainnet RPC, Predict+Margin mainnet pkg versions pinned, full Move + Python parity tests green), preflight asserts: (a) every `config/mainnet.toml` TBD slot is filled (Pitfall 14 mitigation), (b) deploy wallet gas balance ≥ 10 SUI raw, (c) USDsui balance on deploy wallet ≥ 60 USDsui (research finding #1: vault::create_vault consumes a 10-USDsui seed). Preflight aborts on any FAIL.
- **D-07: predict-mainnet-check.sh as manual tool, no cron.** The original Phase 5 design had a GitHub Actions cron firing 2026-06-09 09:00 UTC to gate the mainnet smoke test execution. With execution deferred, the cron has no consumer. The script itself is retained as `scripts/predict-mainnet-check.sh` — callable manually post-submission to check when Predict mainnet ships. Output: stdout `shipped:true/false` + ABI-match status. Future post-submission execution: `./scripts/predict-mainnet-check.sh && ./scripts/preflight.sh && ./scripts/mainnet-deploy.sh && ./scripts/mainnet-smoke-test.sh`.

### Cooldown Codegen (DEPLOY-04 enabler)
- **D-08: Extend `shared/strategy.toml` with `[redemption].cooldown_ms = 3_600_000` + codegen emits to all 3 runtimes.** Today `COOLDOWN_MS = 3_600_000` is a Move `const` in `contracts/sources/redeem.move` L40 — not mutable, not in strategy.toml. Per research finding #2: extending strategy.toml + codegen honors the "no hardcoded waits" architectural principle and gives a single source-of-truth that testnet smoke test, future mainnet smoke test, and dashboard all consume. Generated files: `contracts/sources/strategy_constants.move`, `backtest/src/deepvault/strategy_constants.py`, `dashboard/src/lib/strategy_constants.ts` all gain a `REDEMPTION_COOLDOWN_MS` constant.

### Mainnet-Readiness Documentation (DEPLOY-09)
- **D-09: Rename `docs/MAINNET-FUNDING.md` → `docs/MAINNET-READINESS.md`.** The original funding playbook content (wallet provisioning, CEX → SUI → Cetus → USDsui path, $80 budget breakdown, gas budgets) remains as the post-submission operational reference. New top section documents (a) why mainnet deploy is deferred to post-submission (Predict timing), (b) the ≤30-minute deploy procedure when Predict ships, (c) architecture's mainnet compatibility via single-config-flip in `config/mainnet.toml`. **Rationale:** one doc, two audiences — judges reading "what's the mainnet story" + post-submission operator running the actual deploy.

### README Hardening + make demo (DEPLOY-04 + DEPLOY-06 anticipation)
- **D-10: `make demo` invokes `scripts/testnet-smoke-test.sh` end-to-end.** Existing Makefile has `demo: @echo "TODO: Phase 6 fills this in"`. Phase 5 replaces the placeholder with the testnet smoke test invocation. **Rationale:** judges should be able to `git clone && make install && make demo` to reproduce the full vault cycle. Anticipates DEPLOY-06 (README cold-read test) — having `make demo` working in Phase 5 means Phase 6's README polish can verify it.
- **D-11: README hardening is partial.** Phase 5 adds: testnet contract addresses, `make demo` pointer, mainnet-readiness section linking to MAINNET-READINESS.md, Sui testnet explorer URLs. Phase 6 owns: laypitch refinement, glossary, architecture diagram inlining, cold-read test. **Boundary:** Phase 5 makes the README judge-skimmable; Phase 6 makes it judge-readable.

### Claude's Discretion
The following are chosen by me as builder — recorded for downstream agents, no user decision needed:

- **Script invocation pattern for mainnet scripts:** All mainnet scripts use `SUI_CONFIG_DIR=~/.sui/sui_config_mainnet` (per Phase 0 D-06) to scope to the mainnet keystore. The mainnet env switch is explicit per command; we never run against an ambient `sui client switch --env mainnet`. Even though execution is deferred, the scripts must still encode this pattern correctly so post-submission execution is safe.
- **Testnet smoke test SUI_CONFIG_DIR:** Uses the existing testnet keystore (no special scoping needed — testnet is the default).
- **Linting in lieu of execution:** Mainnet toolkit acceptance criteria use `bash -n` (syntax check), `shellcheck` (lint), `tsc --noEmit` (TS type-check), and dry-run audits (e.g., "does preflight.sh exit non-zero on current TBD state, with the expected failure message?"). These give high confidence the scripts will work when post-submission execution runs them.
- **MAINNET-DEPLOY.json placeholder content:** `{"status":"not_deployed","reason":"Predict mainnet pending — DeepBook Predict not shipped on Sui mainnet as of submission window 2026-06-16","scripts_ready":true,"toolkit_path":"scripts/mainnet-deploy.sh","preflight_path":"scripts/preflight.sh","predict_check_path":"scripts/predict-mainnet-check.sh","smoke_test_path":"scripts/mainnet-smoke-test.sh","runbook":"docs/MAINNET-READINESS.md"}`. Committed to master. Downstream Phase 6 dashboard reads the `status` field and renders a "mainnet-readiness" badge in the UI.
- **Testnet smoke test gas budget:** Each step uses `--gas-budget 500000000` (0.5 SUI) consistent with `e2e-vault-cycle.sh`. Total ≈ 2-3 SUI faucet-fed across 4 transactions — well within testnet faucet ceiling.
- **Token-bucket wait time:** Testnet smoke test waits `STRATEGY_CONSTANTS.REDEMPTION_COOLDOWN_MS + 5s` (5s slack for clock drift) between redeem_request and redeem_fulfill. Imported from codegen output — no hardcoded value.
- **TESTNET-DEPLOY.json reuse:** Existing Phase 2 artifact is consumed as-is. No changes to its schema.
- **Dual ±10 bps NAV math:** Identical implementation to the original mainnet smoke test design (research finding #3) — two framings both gated. The `oracle_svi_id` plumbing from the prior plan run also carries forward (TESTNET-DEPLOY.json already has it from Phase 2).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 5 source-of-truth (MANDATORY first read)
- `.planning/ROADMAP.md` §"Phase 5: Testnet Demo Hardening + Mainnet-Readiness Toolkit" — reshaped goal, 5 success criteria, dependency on Phase 4, testnet smoke deadline 2026-06-12, reshape note
- `.planning/REQUIREMENTS.md` §"Demo Hardening + Mainnet-Readiness & Submission" — DEPLOY-01..05 + DEPLOY-09 remapped acceptance criteria + reshape note
- `.planning/PROJECT.md` §"Key Decisions" — "Mainnet-readiness toolkit in v1 scope" superseded decision + new testnet-demo-target decision
- `.planning/phases/00-setup-ground-rules/00-CONTEXT.md` §"Wallet & Mainnet Funding" — supersession note covering D-06/D-07/D-08 mainnet-execution deferral
- `docs/MAINNET-READINESS.md` (renamed from MAINNET-FUNDING.md) — post-submission operational reference; absorbs original funding playbook + adds deferred-execution rationale + ≤30-min deploy procedure

### Reshape context (this phase's history)
- `.planning/phases/05-testnet-demo-hardening/05-RESEARCH.md` — research from the prior plan run; 7 findings (60-USDsui, codegen cooldown, dual ±10 bps, oracle_svi_id plumbing, ABI-match scheme, 5 scripts not 4, cron delay) carry forward
- `.planning/phases/05-testnet-demo-hardening/05-PATTERNS.md` — pattern map from the prior plan run; analog mappings for preflight, predict-check, mainnet-deploy, mainnet-smoke-test all carry forward; testnet-smoke-test patterns mirror e2e-vault-cycle.sh/.ts directly
- `.planning/phases/05-testnet-demo-hardening/05-DISCUSSION-LOG.md` — original discuss-phase output

### Carry-forward decisions from prior phases
- `.planning/phases/00-setup-ground-rules/00-CONTEXT.md` §"Wallet & Mainnet Funding" — D-06 wallet isolation still applies; D-07 $80 budget retained for post-submission; D-08 Cetus path retained for post-submission
- `.planning/phases/00-setup-ground-rules/00-CONTEXT.md` §"Dashboard & Relay Hosting" — D-13 (Vercel free tier), D-15 (Render free tier), D-16 (no custom domain) — unchanged, owned by Phase 6
- `.planning/phases/02-vault-move-package-testnet-deploy/02-CONTEXT.md` — testnet vault deploy decisions; testnet smoke test exercises this deployed vault

### Testnet vault (already deployed; Phase 5 exercises this)
- `.planning/phases/02-vault-move-package-testnet-deploy/TESTNET-DEPLOY.json` — package_id, vault_shared_object_id, admin_cap_id, treasury_cap_holder, deploy_tx_digest, dusdc_type_tag, oracle_svi_id. Testnet smoke test consumes this.
- `contracts/sources/vault.move` — shared object, total_assets, hedge registry, pause flag
- `contracts/sources/supply.move` — supply with virtual-shares + decimals_offset 10^6+ (inflation-attack mitigation)
- `contracts/sources/redeem.move` L40 `COOLDOWN_MS = 3_600_000` — Move const replaced by codegen-driven `STRATEGY_CONSTANTS.REDEMPTION_COOLDOWN_MS` in this phase
- `contracts/sources/rebalance.move` — `buy_hedge_for_deposit` via predict::mint
- `contracts/sources/predict_adapter.move` — thin Predict ABI wrapper (single-file blast radius for contract churn)
- `contracts/sources/svi_view.move` — Move SVI evaluator (Phase 1 parity-protected)

### Mainnet config (toolkit-only fills — execution deferred)
- `config/mainnet.toml` — TBD slots remain TBD; preflight asserts their state correctly; deploy script fills them when post-submission execution runs
- `config/testnet.toml` — schema reference; mainnet schema mirrors testnet (Pitfall 14)

### Reusable testnet analogs
- `scripts/e2e-vault-deploy.sh` (237 LOC) — testnet deploy; `scripts/mainnet-deploy.sh` mirrors this with mainnet divergences
- `scripts/e2e-vault-cycle.sh` (92 LOC) — testnet round-trip; `scripts/testnet-smoke-test.sh` forks with staged checkpoints + ±10 bps NAV gate; `scripts/mainnet-smoke-test.sh` mirrors testnet-smoke-test with mainnet RPC
- `scripts/e2e-vault-cycle.ts` (382 LOC) — TypeScript PTB construction patterns; same fork shape as the .sh file
- `scripts/codegen.py` — single Python script that emits Move/Python/TS constants from `shared/strategy.toml`; extended to emit `REDEMPTION_COOLDOWN_MS`
- `Makefile` `demo:` target — currently `@echo "TODO: Phase 6 fills this in"`; Phase 5 fills it

### Pitfalls + research
- `.planning/research/PITFALLS.md` §"Pitfall 14: Mainnet redeploy disasters" — config drift prevention; preflight is the Pitfall 14 mitigation (still applies even though execution deferred)
- `.planning/research/PITFALLS.md` §"Pitfall 6: DeepBook Predict contract churn" — Monday sweep; predict-mainnet-check is the manual specialization
- `.planning/research/SUMMARY.md` — phase-ordering rationale, hard policy locks (#4, #6, #7 superseded by Phase 5 reshape)
- `docs/HEDGE-POLICY.md` — locked hedge values that drive `buy_hedge_for_deposit` (consumed by testnet smoke test, unchanged)

### CI infrastructure
- `.github/workflows/ci.yml` — existing 6-job matrix; testnet smoke test integrates as an opt-in workflow_dispatch job (NOT a default-on test — too slow, needs testnet funding)
- **No `.github/workflows/predict-mainnet-check.yml`** — the cron is dropped per D-07

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`scripts/e2e-vault-deploy.sh`** (237 LOC) — testnet deploy; complete reference for `scripts/mainnet-deploy.sh` fork. Read the SHA-pin check, Move build, env scoping, `sui client publish --json` parsing, JSON output emission. Mainnet variant swaps: `SUI_CONFIG_DIR`, RPC URL, config file path, gas budget (1.0 SUI mainnet vs 0.5 SUI testnet), output target (`MAINNET-DEPLOY.json` vs `TESTNET-DEPLOY.json`).
- **`scripts/e2e-vault-cycle.sh`** (92 LOC) + **`scripts/e2e-vault-cycle.ts`** (382 LOC) — testnet supply→hedge→redeem cycle. `scripts/testnet-smoke-test.{sh,ts}` is the staged + dual-±10-bps fork. `scripts/mainnet-smoke-test.{sh,ts}` mirrors testnet-smoke-test with mainnet-specific env scoping (write-but-don't-execute).
- **`scripts/codegen.py`** — reads `shared/strategy.toml`, emits Move/Python/TS constants. Extended in this phase with a `[redemption]` section parser.
- **`Makefile`** — already has `demo:` target placeholder; Phase 5 fills it.
- **`docs/MAINNET-FUNDING.md`** — current content (wallet provisioning, $80 budget, Cetus path, gas budgets, contingency mechanic) becomes the post-submission operational section of the renamed `docs/MAINNET-READINESS.md`. The "why deferred" + "≤30-min procedure" sections are new top content.

### Established Patterns

- **`SUI_CONFIG_DIR=~/.sui/sui_config_mainnet`** prefix on every mainnet command (per Phase 0 D-06) — never `sui client switch --env mainnet`. Carry forward to all mainnet toolkit scripts even though execution is deferred (they must encode the safe pattern).
- **Codegen-driven constants** — single Python script `scripts/codegen.py` reads `shared/strategy.toml` and emits to 3 runtimes. CI fails if generated files are out of sync.
- **Staged checkpoint pattern** — each smoke test step is a discrete script-level gate with its own verify command; failure context is captured at the gate.
- **JSON deploy-output pattern** — `TESTNET-DEPLOY.json` is read by relay + dashboard via env var; mainnet equivalent will work identically once executed. Placeholder `MAINNET-DEPLOY.json` keeps the schema visible to dashboard code reading it.
- **PTB event verify** — `result.events?.find((e) => e.type.endsWith('::module::EventName'))` (from `e2e-vault-cycle.ts`).
- **Shared-object refs** — `tx.sharedObjectRef({ objectId, mutable, initialSharedVersion })`.

### Integration Points

- **Sui CLI `mainnet-v1.71.1`** — pinned in Phase 0; preflight asserts this version against `sui --version`.
- **Mainnet RPC `https://fullnode.mainnet.sui.io:443`** — only endpoint in scope. Preflight pings it for golden-vector reads (non-Predict reads only — Predict TBD).
- **Cetus DEX** — referenced in MAINNET-READINESS.md; not invoked by any script (human-operated post-submission).
- **`config/mainnet.toml`** — TBD slots stay TBD; preflight enforces; deploy fills them at post-submission execution time.

</code_context>

<specifics>
## Specific Ideas

- **`make demo` invokes `bash scripts/testnet-smoke-test.sh`** — single one-liner; the bash script handles env scoping and the TS driver invocation.
- **Testnet smoke test failure mode** — if step N fails, the script prints the gate name, the assertion that failed, and exits 1. No "AdminCap pause" recovery (testnet vault is faucet-funded and recreatable). Reduces complexity vs the original mainnet design's split-demo path (which is gone).
- **Mainnet-readiness toolkit dry-run target** — `make verify-toolkit` (optional, plan can decide) runs `bash -n` + `shellcheck` + `tsc --noEmit` across all four mainnet scripts. Gives a single command for the verifier to assert toolkit health.
- **2026-06-12 (Day 36)** is the hard testnet smoke-test deadline. (Superseded mainnet deadline from Hard Policy Lock #6.)
- **MAINNET-DEPLOY.json path:** `.planning/phases/05-testnet-demo-hardening/MAINNET-DEPLOY.json` (mirrors Phase 2's `.planning/phases/02-vault-move-package-testnet-deploy/TESTNET-DEPLOY.json`).

</specifics>

<deferred>
## Deferred Ideas

- **Actual mainnet `deepvault` publish** — deferred to post-submission, contingent on DeepBook Predict mainnet ship date. Toolkit is ready to invoke in ≤30 min when Predict ships.
- **Actual $50 USDsui mainnet smoke test** — deferred to post-submission, follows the publish.
- **GitHub Actions cron for predict-mainnet-check** — dropped (no consumer); the manual script remains.
- **Multisig governance for AdminCap** — post-submission backlog per Phase 0.
- **Mainnet RPC failover** — post-submission infra hardening.
- **AdminCap burn timing** — post-submission decision.
- **Custom mainnet domain** — out of scope per Phase 0 D-16.
- **Vercel + Render hosting deploys** — Phase 6 (unchanged).
- **Demo video recording** — Phase 6 (now targets testnet per Phase 6 reshape).
- **Recording wallet provisioning + funding** — Phase 6 (ephemeral keypair on testnet, no mainnet funding needed).

</deferred>

---

*Phase: 05-testnet-demo-hardening*
*Context gathered: 2026-05-13 (original)*
*Context reshaped: 2026-05-13 (mainnet-redeploy → testnet-hardening + readiness-toolkit)*
