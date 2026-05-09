---
phase: 00-setup-ground-rules
plan: 08
subsystem: docs
tags: [phase-closure, readme, traceability-matrix, requirements-closure, decisions-attribution, roadmap-cross-check]

# Dependency graph
requires: [00-01, 00-02, 00-03, 00-04, 00-05, 00-06, 00-07]
provides:
  - "Polished README.md cold-readable by judges in 60 seconds (laypitch, glossary, status, architecture, quick start, stack, hosting, build log Week 1, policies, references)"
  - "Phase 0 closure traceability matrix: 8 SETUP-XX requirements PASS, 16 D-XX decisions attributed, 5 ROADMAP success criteria cross-checked"
  - "Outstanding human-action items enumerated for Phase 1 hand-off (3 items: Plan 02 Task 4 wallet provisioning, Plan 07 Task 4 GitHub repo + branch protection, Plan 08 Task 3 fresh-clone verification)"
  - "Pitfall mitigation closure: 4 cross-cutting (6, 14, 18, 19) + 8 Phase-0-specific (0-A..0-H) all marked mitigated with mechanism"
  - "Resume-signal block with paste-ready fresh-clone verification recipe for the human checkpoint"
affects: [phase-1, phase-2, phase-3, phase-4, phase-5, phase-6]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Phase-closure SUMMARY structure: per-plan rollup, per-requirement closure with evidence, per-decision attribution with file:section anchors, per-criterion ROADMAP cross-check, per-pitfall mitigation, outstanding-items enumeration, deferred-items, time consumed"
    - "Traceability matrix as the close-out document: every requirement, decision, success criterion, and pitfall is independently verifiable via grep against the artifacts cited"

key-files:
  created:
    - .planning/phases/00-setup-ground-rules/00-08-SUMMARY.md
  modified:
    - README.md

key-decisions:
  - "Re-ordered task execution per orchestrator prompt: README polish → SUMMARY (closure document) → fresh-clone verification documented as outstanding human checkpoint. Original PLAN had verification before SUMMARY but the SUMMARY needs to record the checkpoint, so the orchestrator's order is correct. Both task sets land the same artifacts."
  - "Treat 00-08-SUMMARY.md as a Phase-level closure document, not just a Plan 08 summary — it aggregates across all 8 plans in the phase and is the artifact the orchestrator (and Phase 1 planner) reads to confirm the foundation is correct before advancing."
  - "Fresh-clone end-to-end verification deferred to human action because (a) repo is not yet on GitHub (Plan 07 Task 4 outstanding), (b) the dev machine lacks `make` on PATH, (c) clean clone needs a separate workdir or VM. Recipe is paste-ready in <resume-signal> below."

requirements-completed: [SETUP-01, SETUP-02, SETUP-03, SETUP-04, SETUP-05, SETUP-06, SETUP-07, SETUP-08]

# Metrics
duration: <1day
completed: 2026-05-09
---

# Phase 0 Plan 08 / Phase 0 Closure Summary

**Phase 0 (Setup & Ground Rules) is functionally complete: all 8 SETUP-XX requirements have shipped artifacts, all 16 CONTEXT.md decisions (D-01..D-16) have landed in code or docs, all 5 ROADMAP Phase 0 success criteria pass against the repo state, and all 12 named pitfalls (4 cross-cutting + 8 Phase-0-specific) have mitigation mechanisms in place. README.md polished from skeleton to judge-readable form (laypitch + glossary + status + architecture + quick start + stack + hosting + build-log Week 1 + key policies + references). Three outstanding human-action checkpoints remain — none block Phase 1 math work, but two block mainnet deploy (Phase 5) and one closes the ROADMAP success criterion #1 verbatim guarantee. Time consumed: well under the 2-day Phase 0 budget; ~37 days of slack remaining for Phases 1-6.**

## Performance

- **Phase budget:** 2 days (Day 1-2 of 39)
- **Phase actual:** <1 day (started 2026-05-09T04:20Z with Plan 01; closure SUMMARY committed same day)
- **Slack remaining:** ~37 days for Phases 1-6
- **Plans completed:** 8 of 8
- **Total task commits across phase:** 27 (includes per-plan-metadata commits)
- **Human checkpoints documented:** 3 (1 BLOCKED-on-human in Plan 02, 1 in Plan 07, 1 in this plan)

## Per-Plan Rollup

| Plan | Files Modified | Status | Notable Output |
|------|----------------|--------|----------------|
| 00-01 | 10 (root files + workspace placeholders + lockfile) | green | LICENSE (MIT), .gitignore (keystore-safe), README skeleton, pnpm-workspace.yaml + lockfile, indexer/dashboard placeholders. Commits: `42ce187`, `935b100`, `4f85326`, `164dba1`. |
| 00-02 | 9 (Move skeleton, Python uv, Makefile, DEV-BOOTSTRAP) | green-with-checkpoint | DeepBookV3 SHA captured: `1159d79af33c70e09e406310e1d8f067832ede9d`; Sui CLI `mainnet-v1.71.1` documented; uv.lock committed. Task 4 (wallet provisioning) BLOCKED-on-human. Commits: `123ba69`, `bda7e0b`, `260596f`, `b34cf08`. |
| 00-03 | 6 (strategy.toml, codegen.py, 3 generated, Makefile) | green | All locked values 1000/1500/1209600/172800/"fixed" parity-checked across Move + Python + TS. Idempotency verified. Commits: `33a6702`, `12e9ad9`, `79b094c`. |
| 00-04 | 2 (config/{testnet,mainnet}.toml) | green | Schema parity verified via tomllib (8 sections matched). 17 TBD slots in mainnet for Phase 5 preflight. Commits: `f314e55`, `e7c49d5`. |
| 00-05 | 4 (DeepBookV3 subtree, predict-diff.sh, .predict-diff-state, monday-predict-check.yml) | green | Vendored SHA: `1159d79a` (matches Plan 02). Cron `0 14 * * 1`. RESEARCH Open Q2 RESOLVED inline. Commits: `8250375` + `2292404` (subtree), `6169587`, `dd50391`, `3bfe6f7`. |
| 00-06 | 3 (CONTRIBUTING.md, HEDGE-POLICY.md, MAINNET-FUNDING.md) | green | "2026-05-30" verbatim; D-01..D-09 attributed inline; three-way number parity verified. Commits: `de1d70f`, `55c45b9`, `254b0ad`. |
| 00-07 | 3 (ci.yml 5-job, golden-vectors.json [], CI-BRANCH-PROTECTION.md) | green-with-checkpoint | 5-job matrix: move + ts + python + codegen-drift + parity. Task 4 (gh repo create + branch protection) BLOCKED-on-human. Commits: `ca54db4`, `c828e72`, `616289e`. |
| 00-08 | 1 modified + 1 created (README.md polish + this SUMMARY) | green-with-checkpoint | Task 3 (fresh-clone end-to-end verification) BLOCKED-on-human. Commits: `21aad98` (Task 1 README polish) + this SUMMARY's metadata commit. |

**Cumulative plan metadata commits** (after each per-plan SUMMARY): `<orchestrator commits>` (Plan 01), `<orchestrator commits>` (Plan 02), `7a98dee` (Plan 03), `ee585be` (Plan 04), `9ef703b` (Plan 05), `d8c4bf0` (Plan 06), `12db299` (Plan 07), this commit (Plan 08).

## Per-Requirement Closure (8/8 PASS)

All 8 SETUP-XX requirements from REQUIREMENTS.md §"Setup & Ground Rules" are closed with concrete evidence:

| REQ | Plan | Status | Evidence |
|-----|------|--------|----------|
| **SETUP-01** | 00-01 | PASS | `package.json` + `pnpm-workspace.yaml` + `pnpm-lock.yaml` committed; `backtest/pyproject.toml` + `backtest/uv.lock` committed (Plan 02). `pnpm install` reports 3 workspace projects. |
| **SETUP-02** | 00-02 | PASS | `contracts/Move.toml` line `rev = "1159d79af33c70e09e406310e1d8f067832ede9d"` (40-char SHA, predict-testnet-4-16 HEAD). Sui CLI mainnet-v1.71.1 documented in `docs/DEV-BOOTSTRAP.md` §1. |
| **SETUP-03** | 00-03 | PASS | `shared/strategy.toml` (single source of truth) + `scripts/codegen.py` (Move/Python/TS emitter) + 3 generated `strategy_constants.{move,py,ts}` files with `AUTO-GENERATED` headers. `--check` drift mode wired into Plan 07 CI. |
| **SETUP-04** | 00-04 | PASS | `config/testnet.toml` (62 lines, 8 sections, all real testnet addresses) + `config/mainnet.toml` (62 lines, 17 TBD slots for Phase 5 preflight). Schema parity verified via tomllib. |
| **SETUP-05** | 00-05 | PASS | `scripts/predict-diff.sh` (executable, smoke-tested, exit 0 on no-diff) + `.predict-diff-state` (initialized to `1159d79a…`) + `.github/workflows/monday-predict-check.yml` (cron `0 14 * * 1` + workflow_dispatch + `peter-evans/create-issue-from-file@v6`). |
| **SETUP-06** | 00-06 | PASS | `docs/HEDGE-POLICY.md` (95-line ADR, Status: Locked, full decision table + per-parameter rationale + walk-forward re-tuning protocol + alternatives + change log). Three-way number parity grep-verified across `shared/strategy.toml` + `CONTRIBUTING.md` + `docs/HEDGE-POLICY.md`. |
| **SETUP-07** | 00-06 | PASS | `CONTRIBUTING.md` §1 ("Code freeze: 2026-05-30" verbatim) + §2 ("No refactor after vault ships" with 2-day cap on refactor branches). Pitfall 18 + Pitfall 19 cross-references inline. |
| **SETUP-08** | 00-07 | PASS-with-CHECKPOINT | `.github/workflows/ci.yml` 5-job matrix (move + ts + python + codegen-drift + parity); `shared/golden-vectors.json` (`[]` placeholder, Phase 1 fills); `docs/CI-BRANCH-PROTECTION.md` setup checklist. **Task 4 (gh repo create + branch protection) BLOCKED-on-human** — see `.planning/phases/00-setup-ground-rules/00-07-SUMMARY.md` Resume Signal. |

**Closure rate:** 8/8 = 100% of SETUP requirements have shipped artifacts. SETUP-08 first-CI-run-green and branch-protection-set are gated on the outstanding human action (Plan 07 Task 4); the artifact (workflow file + setup doc) ships in this phase.

## Per-Decision Attribution (16/16)

All 16 decisions from `00-CONTEXT.md` <decisions> blocks are attributed with file:section anchors. Every decision either landed in code/configuration, was committed in writing in a policy doc, or both:

| ID | Decision | Landed In |
|----|----------|-----------|
| **D-01** | 10% allocation of each new deposit to hedge book | `shared/strategy.toml` `[hedge_policy] allocation_bps = 1000`; `CONTRIBUTING.md` §"Hedge-ratio policy is locked" (table); `docs/HEDGE-POLICY.md` Decision table; generated constants in Move/Python/TS. |
| **D-02** | -15% OTM strike | `shared/strategy.toml` `[hedge_policy] strike_otm_bps = 1500`; `CONTRIBUTING.md` table; `docs/HEDGE-POLICY.md` Decision table + Per-parameter rationale §"-15% OTM strike". |
| **D-03** | 14-day tenor + roll trigger at expiry < 2 days | `shared/strategy.toml` `[hedge_policy] tenor_seconds = 1209600`, `roll_trigger_seconds = 172800`; `CONTRIBUTING.md` table; `docs/HEDGE-POLICY.md` Decision table + Per-parameter rationale §"14-day tenor + <2-day roll". |
| **D-04** | Sizing function parameterized in strategy.toml; v1 ships fixed | `shared/strategy.toml` `[hedge_policy] sizing_function = "fixed"`; `CONTRIBUTING.md` ("fixed-ratio v1, parameterized for future dynamic"); `docs/HEDGE-POLICY.md` §"Fixed (v1)" + sizing_function-as-future-swap-point note. |
| **D-05** | Re-tuning permitted ONLY in Phase 3 backtest, walk-forward, then permanent freeze | `docs/HEDGE-POLICY.md` §"Re-tuning policy" with explicit 60d/14d/30% protocol + permanent-freeze-at-Phase-3-close stamp (~2026-05-29). |
| **D-06** | Two separate wallets (testnet dev + mainnet deploy) with SUI_CONFIG_DIR isolation | `docs/DEV-BOOTSTRAP.md` §3 wallet provisioning (paste-ready `SUI_CONFIG_DIR=~/.sui/sui_config_mainnet` commands); `docs/MAINNET-FUNDING.md` Wallets table. |
| **D-07** | Mainnet budget ~$80 ($50 USDsui + $15 gas + $15 buffer) + $30-buffer-tight risk flag | `docs/MAINNET-FUNDING.md` §"Funding flow" + §"Risk Flag" (4 redeploy triggers, top-up-to-$150-before-Day-36 mandate). |
| **D-08** | USDsui acquired via Cetus DEX swap from SUI | `docs/MAINNET-FUNDING.md` Step 2 (Cetus swap + type-tag verification note flagging `0x{USDSUI_PACKAGE}::usdsui::USDSUI` shape). |
| **D-09** | No third "fresh wallet"; ephemeral CI keypairs + ephemeral demo keypair | `docs/MAINNET-FUNDING.md` §"Demo recording" (ephemeral keypair generated at recording time, ~$10 SUI + ~$10 USDsui transfer from deploy wallet). |
| **D-10** | GitHub repo public from day 1 under MIT | `LICENSE` (MIT, copyright 2026 Ben Sagesol) + Plan 07 Task 4 outstanding (`gh repo create deepvault --public`). README badges reference `<owner>/deepvault`. |
| **D-11** | License = MIT | `LICENSE` (MIT text); `package.json` `"license": "MIT"`; `backtest/pyproject.toml` `license = "MIT"`; README §"License". |
| **D-12** | Minimal build log in README (weekly bullets, append-only) | `README.md` §"Build log" with Week 1 (2026-05-09 to 2026-05-15) entry recording Phase 0 closure; `CONTRIBUTING.md` §"Build log discipline". |
| **D-13** | Public dashboard on Vercel free tier, default `*.vercel.app` subdomain | `config/testnet.toml` + `config/mainnet.toml` `[hosting] dashboard_url`; README §"Hosting" table (Vercel free tier row). |
| **D-14** | Local Vite dev server is the demo recording target | `docs/MAINNET-FUNDING.md` §"Demo recording" ("Vite dev server is recording target per D-14"). |
| **D-15** | Event relay on Render free tier with keepalive ping | `config/testnet.toml` + `config/mainnet.toml` `[hosting] relay_url` (with `wss://` mixed-content-guard inline comment) + `relay_keepalive_path`; README §"Hosting" table. |
| **D-16** | No custom domain (default subdomains sufficient) | README §"Hosting" ("default Vercel/Render subdomains, no custom domain"); `CONTEXT.md` deferred-ideas list ("Custom domain — post-submission only"). |

**Attribution rate:** 16/16 = 100% of CONTEXT decisions have a concrete landing site. No decisions left implicit or floating.

## ROADMAP Phase 0 Success Criteria Cross-Check (5/5)

From `.planning/ROADMAP.md` §"Phase 0 → Success Criteria":

### Criterion 1 — Fresh clone produces working monorepo with pinned toolchains

**Status:** PASS-with-CHECKPOINT (artifact in place; end-to-end fresh-clone-on-disk verification awaiting human action)

**Evidence:**
- `pnpm-lock.yaml` committed (Plan 01) — `pnpm install --frozen-lockfile` reproducible.
- `backtest/uv.lock` committed (Plan 02, 939 lines, 30 packages resolved) — `uv sync --locked` reproducible.
- `contracts/Move.toml` SHA-pinned (`rev = "1159d79af33c70e09e406310e1d8f067832ede9d"`) — Move build reproducible.
- Sui CLI `mainnet-v1.71.1` documented in `docs/DEV-BOOTSTRAP.md` with paste-ready install command.
- Python 3.12 floor in `backtest/pyproject.toml` (`requires-python = ">=3.12"`).
- Node >=22 + pnpm >=10 floor in root `package.json` `engines` block.
- `Makefile install` target enforces `--frozen-lockfile` + `uv sync --locked`.

**Gap:** Fresh-clone end-to-end verification (clean clone + `make install/codegen/test/lint` exit 0 + idempotency check) not yet executed because (a) repo not yet on GitHub (Plan 07 Task 4 outstanding), (b) `make` not on dev-machine PATH (Plan 03 Issues), (c) clean clone needs separate workdir. **Recipe paste-ready in `<resume-signal>` below.**

### Criterion 2 — Codegen wired; CI fails on out-of-sync generated files

**Status:** PASS

**Evidence:**
- `shared/strategy.toml` schema_version=1, source-of-truth for all locked values.
- `scripts/codegen.py` (234 lines, stdlib-only, `--check` drift mode) emits 3 generated files.
- `make codegen` (Plan 03) wired to `cd backtest && uv run --no-project python ../scripts/codegen.py`.
- `.github/workflows/ci.yml` `codegen-drift` job (Plan 07): runs codegen, then `git diff --exit-code` on the three generated files; CI fails with `::error::` pointing at `make codegen` if drift detected.
- Idempotency proven inline: `--check` exits 0 on clean tree (Plan 03 SUMMARY).

### Criterion 3 — predict-diff.sh + Monday cron reports new commits

**Status:** PASS

**Evidence:**
- `scripts/predict-diff.sh` (145 lines, executable mode 755) fetches `predict-testnet-4-16` from upstream, diffs against `.predict-diff-state`, emits Markdown triage report. Smoke-tested locally: exit 0, output matches "No new commits" template.
- `.predict-diff-state` initialized to `1159d79af33c70e09e406310e1d8f067832ede9d` (matches Move.toml rev pin) — first sweep on next Monday will report no diff or only post-2026-05-09 commits.
- `.github/workflows/monday-predict-check.yml` cron `0 14 * * 1` (Monday 14:00 UTC = 09:00 ET / 06:00 PT, with delay headroom over RESEARCH's 09:00 UTC) + `workflow_dispatch` for manual catchup. Creates labelled (`predict-sweep`, `triage`) Issue from script output via `peter-evans/create-issue-from-file@v6`.
- Pitfall 6 design honored: script never auto-advances state; workflow never auto-fails CI; Issue creation IS the alert; human triage is the only state-bump path.

### Criterion 4 — CONTRIBUTING.md documents 2026-05-30 code freeze + no-refactor + hedge-ratio policy

**Status:** PASS

**Evidence:**
- `CONTRIBUTING.md` §1 "Code freeze: 2026-05-30" — verbatim date string, with allowed-after-freeze and forbidden-after-freeze lists.
- `CONTRIBUTING.md` §2 "No refactor after vault ships" — Pitfall 18 cross-reference, "does this unblock a specific feature?" test, 2-day cap on refactor branches.
- `CONTRIBUTING.md` §3 "No dashboard work before vault feature-complete" — Pitfall 19 cross-reference, explicit ordering "vault → backtest → SVI → composition → dashboard → submission".
- `CONTRIBUTING.md` §4 "Hedge-ratio policy is locked" — full table with both human-readable values and verbatim `shared/strategy.toml` field strings.
- `CONTRIBUTING.md` §"Ship-date hard locks" table cross-references 2026-05-30 / 2026-06-12 / 2026-06-13..15 / 2026-06-16.
- All committed BEFORE Phase 1 opens (committed 2026-05-09 in Plan 06).

### Criterion 5 — Every push triggers CI: Move tests + TS Vitest + Python pytest + golden-vector parity check (initially empty, gate wired)

**Status:** PASS-with-CHECKPOINT (workflow file + parity stub in place; first CI run gated on Plan 07 Task 4 outstanding)

**Evidence:**
- `.github/workflows/ci.yml` 5-job matrix:
  - **move:** Sui CLI mainnet-v1.71.1 install via direct release tarball; `cd contracts && sui move build && sui move test`.
  - **ts:** Node 22 + pnpm 10 + `pnpm install --frozen-lockfile`; `pnpm -r run lint`, `pnpm -r exec tsc --noEmit || true` (Phase 0 placeholder leniency), `pnpm -r run test`.
  - **python:** uv (latest, cache enabled) + `uv sync --locked --all-extras --dev`; `ruff check`, `ruff format --check`, `pytest`.
  - **codegen-drift:** `cd backtest && uv sync --frozen` + `cd backtest && uv run --no-project python ../scripts/codegen.py` + `git diff --exit-code` on 3 generated files.
  - **parity:** `needs: [move, ts, python, codegen-drift]`; Phase 0 stub asserts `test -f shared/golden-vectors.json` (Phase 1 MATH-05 wires the actual three-runtime cross-check while keeping the same job NAME so branch protection survives).
- Triggers: `push` to main, `pull_request` to main, `workflow_dispatch`. Concurrency `ci-${github.ref}` cancel-in-progress.
- `shared/golden-vectors.json` shipped as strict empty array (`[]`) per success criterion ("initially empty, gate wired").

**Gap:** First CI run on `main` and "branch protection enforced" verification both depend on Plan 07 Task 4 (gh repo create + git branch -M main + git push -u origin main + configure branch protection). Workflow file is committed and ready; first run will fire the moment the repo lands on GitHub.

**Cross-check summary:** 5/5 criteria PASS at the artifact level. 2 of 5 (#1 and #5) are PASS-with-CHECKPOINT pending the documented outstanding human-action items.

## Pitfall Mitigation Closure

### Cross-cutting pitfalls (4)

| # | Pitfall | Mitigation Mechanism | Plan |
|---|---------|----------------------|------|
| **6** | DeepBook Predict contract churn | `scripts/predict-diff.sh` weekly Monday sweep + `.predict-diff-state` (advances only on human triage) + GitHub Actions cron + Issue-as-alert; CONTRIBUTING.md §"Weekly Monday Predict sweep" 5-step blocking-issue protocol | 00-05, 00-06 |
| **14** | Mainnet redeploy disasters from config drift | `config/testnet.toml` + `config/mainnet.toml` schema parity (verified via tomllib); 17 TBD slots in mainnet greppable for Phase 5 preflight; `docs/MAINNET-FUNDING.md` mechanical Phase 5 playbook with output-to-config-field mapping | 00-04, 00-06 |
| **18** | Refactor-after-vault-ships scope creep | `CONTRIBUTING.md` §2 "No refactor after vault ships" with "does this unblock a specific feature?" test, 2-day cap on refactor branches | 00-06 |
| **19** | Dashboard-before-vault-feature-complete inversion | `CONTRIBUTING.md` §3 "No dashboard work before vault feature-complete" with explicit ordering "vault → backtest → SVI → composition → dashboard → submission"; ROADMAP Phase 4 depends_on Phase 3 Track A integration-tested | 00-06 |

### Phase 0-specific pitfalls (8)

| # | Pitfall | Mitigation Mechanism | Plan |
|---|---------|----------------------|------|
| **0-A** | Branch-ref vs SHA-pin in Move.toml (silent upstream drift) | `contracts/Move.toml` `rev = "<40-char SHA>"` (NOT branch ref); Plan 05 Monday sweep is the only allowed bump path | 00-02, 00-05 |
| **0-B** | pnpm lockfile drift | `pnpm-lock.yaml` committed; `Makefile install` enforces `pnpm install --frozen-lockfile`; CI `ts` job uses same flag | 00-01, 00-02, 00-07 |
| **0-C** | uv lockfile drift | `backtest/uv.lock` committed (939 lines); `Makefile install` enforces `uv sync --locked`; CI `python` job uses `uv sync --locked --all-extras --dev`; CI `codegen-drift` uses `uv sync --frozen` | 00-02, 00-07 |
| **0-D** | Workflow on non-default branch (cron never fires) | `monday-predict-check.yml` and `ci.yml` triggers reference `main`; Plan 07 Resume Signal flags `git branch -M main` requirement (local default is `master` from `git init`) | 00-05, 00-07 |
| **0-E** | Generated files hand-edited (drift bypass) | `AUTO-GENERATED - DO NOT EDIT` headers on all 3 generated files; CI `codegen-drift` job catches any drift; CONTRIBUTING.md §"Editing generated code" documents the 4-step regenerate-and-commit ritual + POLICY: commit-message prefix | 00-03, 00-06, 00-07 |
| **0-F** | Branch protection not configured (CI gate not enforced) | `docs/CI-BRANCH-PROTECTION.md` setup checklist with both UI and `gh api` paths, names all 5 required status checks; Plan 07 Task 4 Resume Signal explicit | 00-07 |
| **0-G** | Bare `git fetch origin` in predict-diff (wrong remote) | `scripts/predict-diff.sh` uses explicit `git fetch <UPSTREAM_URL> <BRANCH>` (never bare `origin`) | 00-05 |
| **0-H** | Subtree treated as submodule (broken `cd && git log` pattern) | Plan 05 deviation Rule 2 fix: `predict-diff.sh` runs `git log` from parent repo with subtree-prefixed pathspec, NOT `cd scripts/deepbookv3 && git log` | 00-05 |

**Pitfall closure rate:** 12/12 = 100% have concrete mitigation mechanisms. None are accept-without-mitigation.

## Outstanding Human-Action Items (3)

These 3 items require human action and are documented in their respective Plan SUMMARIES with paste-ready commands. None block Phase 1 math work. Items 2 and 3 should ideally close before Phase 5 mainnet deploy.

### 1. Plan 02 Task 4 — Two-wallet provisioning (D-06)

**Status:** BLOCKED-on-human

**What's needed:** Run `sui client new-address ed25519` for the testnet dev wallet (`~/.sui/sui_config`) and again with `SUI_CONFIG_DIR=~/.sui/sui_config_mainnet` for the mainnet deploy wallet. Capture both addresses, fund testnet from the faucet, leave mainnet UNFUNDED. Backup mainnet keystore to encrypted external storage.

**Resume signal:** `.planning/phases/00-setup-ground-rules/00-02-SUMMARY.md` §"Resume signal" has the paste-ready 4-step recipe.

**Blocks:** Phase 5 mainnet deploy (`docs/MAINNET-FUNDING.md` Step 1+ requires the funded mainnet wallet). Does NOT block Plans 03-08 or Phase 1.

### 2. Plan 07 Task 4 — GitHub repo + branch protection

**Status:** BLOCKED-on-human

**What's needed:** Run `gh repo create deepvault --public --source=. --remote=origin --push` (or UI equivalent), rename local branch from `master` to `main` via `git branch -M main`, push, verify first CI run all 5 jobs appear, configure branch protection per `docs/CI-BRANCH-PROTECTION.md` (Option A UI or Option B `gh api`), verify enforcement via deliberate-break commit.

**Resume signal:** `.planning/phases/00-setup-ground-rules/00-07-SUMMARY.md` §"Resume Signal" has the paste-ready 5-step recipe.

**Blocks:** ROADMAP Phase 0 success criterion #5 ("first CI run green on default branch") cannot be marked PASS-end-to-end until done. Does NOT block Phase 1 math work — the workflow file is committed; first run fires the moment the repo lands on GitHub.

### 3. Plan 08 Task 3 — Fresh-clone end-to-end verification

**Status:** BLOCKED-on-human (deferred from this plan; documented below)

**What's needed:** A clean clone in a separate workdir + `make install/codegen/test/lint` exit-0 sequence + idempotency check (`git diff --exit-code` after re-codegen) + 5-criterion ROADMAP cross-check + version capture for SUMMARY.

**Resume signal:** see `<resume-signal>` block at the bottom of this file.

**Blocks:** ROADMAP Phase 0 success criterion #1 verbatim guarantee ("a fresh `git clone` followed by `pnpm install` and `uv sync` produces a working monorepo"). Does NOT block Phase 1 — every artifact criterion #1 depends on is already committed; only the on-disk fresh-clone proof is pending.

## Deferred Items (For Later Phases)

| Category | Item | Defer To | Reason |
|----------|------|----------|--------|
| Hosting | Fill `[hosting].dashboard_url` and `relay_url` in `config/{testnet,mainnet}.toml` | Phase 4 | Vercel + Render subdomains exist only after first deploy. README and configs both have TBD slots ready. |
| Mainnet contract | Fill `[deepvault]` package_id, vault_shared_object_id, admin_cap_id, treasury_cap_holder, deploy_tx_digest in `config/mainnet.toml` | Phase 5 | All 5 fields populated from `sui client publish` output during mainnet deploy. |
| Mainnet Predict | Fill `[predict]` package_id, registry_id, top_level_shared_object_id, plp_type_tag in `config/mainnet.toml` | Phase 5 (or DEPLOY-09 fallback by 2026-06-09) | Awaits Mysten mainnet Predict launch. If not shipped by 2026-06-09, fallback per `docs/MAINNET-FUNDING.md` §"Contingency". |
| Margin contract | Fill `[deepbook_margin]` package_id, margin_pool_id in `config/{testnet,mainnet}.toml` | Phase 1 spike (testnet) + Phase 5 (mainnet) | Testnet Margin docs read is on Phase 1 day-1 spike list. |
| Oracle SVI | Fill `[oracle_svi].event_module_full` in `config/testnet.toml` | Phase 1 spike | Resolved partially in Plan 05: event lives in `packages/predict/sources/oracle.move`; full module path is `<predict_pkg>::oracle::OracleSVIUpdated` once Phase 1 confirms. |
| BTC oracle type tag | Fill `[assets].btc_oracle_type_tag` in `config/{testnet,mainnet}.toml` | Phase 1 spike | Awaits BTC price oracle selection (Pyth, Switchboard, or Mysten oracle). |
| dApp Kit | Pin `@mysten/dapp-kit` migration | Phase 4 | Dashboard wallet-connect flow in DASH-11. |
| Scripts/preflight.sh | Mainnet preflight script | Phase 5 | Cross-references 17 TBD slots + Move.toml/mainnet alignment + golden-vectors green + Predict pinned + Margin pinned + Move test suite + Python parity. |
| `.gitattributes` | Cross-OS line-ending normalization (`* text=auto eol=lf`) | Future plan or Phase 6 polish | CRLF warnings on every Windows Write are cosmetic; not blocking. |
| Architecture diagram | PNG/SVG via `.planning/research/ARCHITECTURE.md` source | Phase 6 (DEPLOY-07) | README §"Architecture at a Glance" has text + ASCII flow; polished diagram is a Phase 6 deliverable. |
| `make demo` | End-to-end demo reproducer | Phase 6 | Currently `@echo "TODO: Phase 6 fills this in"`. |
| `make` on Windows PATH | Install via `choco install make` or WSL2 | Dev machine setup | Plan 03 + Plan 07 noted; doesn't block CI (Ubuntu has `make` preinstalled). |

## Threat Surface (Phase-level)

This SUMMARY introduces no new threat surface. Per-plan threat models are closed in their respective SUMMARIES; the Phase 0 register (T-00-01 through T-00-36) is fully accounted for across the 8 plans. No threat flags discovered in this plan (README is documentation; SUMMARY is documentation; no new endpoints, auth paths, file accesses, or schema changes).

## Self-Check: PASSED

**Files exist:**
- FOUND: `.planning/phases/00-setup-ground-rules/00-08-SUMMARY.md` (this file)
- FOUND: `README.md` (modified in Task 1)

**Commits exist:**
- FOUND: `21aad98` (Task 1: README polish — verifiable via `git log --oneline | grep 21aad98`)

**Phase artifact existence (cited in this SUMMARY):**
- FOUND: `LICENSE`, `.gitignore`, `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`
- FOUND: `contracts/Move.toml`, `backtest/pyproject.toml`, `backtest/uv.lock`, `Makefile`, `docs/DEV-BOOTSTRAP.md`
- FOUND: `shared/strategy.toml`, `scripts/codegen.py`, `contracts/sources/strategy_constants.move`, `backtest/src/deepvault/strategy_constants.py`, `dashboard/src/lib/strategy_constants.ts`
- FOUND: `config/testnet.toml`, `config/mainnet.toml`
- FOUND: `scripts/deepbookv3/` (vendored), `scripts/predict-diff.sh`, `.predict-diff-state`, `.github/workflows/monday-predict-check.yml`
- FOUND: `CONTRIBUTING.md`, `docs/HEDGE-POLICY.md`, `docs/MAINNET-FUNDING.md`
- FOUND: `.github/workflows/ci.yml`, `shared/golden-vectors.json`, `docs/CI-BRANCH-PROTECTION.md`

**Per-plan SUMMARY existence:**
- FOUND: `00-01-SUMMARY.md` through `00-07-SUMMARY.md` (all referenced inline)
- FOUND: `00-08-SUMMARY.md` (this file)

**Traceability matrix:**
- 8/8 SETUP-XX requirements have evidence row in §"Per-Requirement Closure"
- 16/16 D-XX decisions have file:section anchor in §"Per-Decision Attribution"
- 5/5 ROADMAP success criteria have evidence in §"ROADMAP Phase 0 Success Criteria Cross-Check"
- 12/12 pitfalls (4 cross-cutting + 8 Phase-0-specific) have mitigation mechanism in §"Pitfall Mitigation Closure"
- 3/3 outstanding human-action items enumerated with resume-signal cross-references

## Next Phase Readiness

**Phase 1 (Math Foundation — SVI Parity Gate) is unblocked.** Every Phase 0 artifact Phase 1 needs is committed:

- `shared/strategy.toml` `[fixed_point]` + `[svi]` sections (placeholder values; Phase 1 tunes in-place).
- `scripts/codegen.py` emits `VARIANCE_DECIMALS`, `SVI_GRID_POINTS_FOR_ARB_CHECK`, `SVI_STRIKE_RANGE_SIGMA` to all three runtimes — Phase 1 SVI math imports these.
- `shared/golden-vectors.json` (`[]`) — Phase 1 MATH-05 fills with Gatheral & Jacquier 2014 Figure-5-style records.
- `.github/workflows/ci.yml` `parity` job stub — Phase 1 wires the actual three-runtime cross-runtime check while keeping the job NAME stable so branch-protection survives.
- `scripts/deepbookv3/packages/predict/sources/oracle.move` (vendored) — Phase 1 day-1 spike reads `OracleSVIUpdated` event struct and `SVIParams` struct to confirm the schema (resolves a STATE.md blocker).

**Phase 1 day-1 spike checklist** (from STATE.md "Open verification gaps"):
1. Read `scripts/deepbookv3/packages/predict/sources/oracle.move` for the exact `OracleSVIUpdated` and `SVIParams` struct schemas.
2. Read DeepBook Margin docs for collateral-whitelist policy (Phase 3 Track A precondition).
3. Decide BTC price oracle (Pyth / Switchboard / Mysten) and fill `[assets].btc_oracle_type_tag`.
4. Begin MATH-01 (Python SSVI evaluator audited against Gatheral 2014 published test cases).

**Hard policy locks** (ROADMAP §"Hard Policy Locks") relevant going into Phase 1:
- #1 Three-way SVI parity gate — non-cuttable; Phase 1 wires the real check on the parity-job stub.
- #10 Hedge-ratio policy committed in writing — DONE (Phase 0).

<resume-signal>

## Resume signal — Task 3: Fresh-clone end-to-end verification

**Status:** BLOCKED-on-human (planned checkpoint per orchestrator prompt)

This verification proves ROADMAP Phase 0 success criterion #1 verbatim ("a fresh `git clone` followed by `pnpm install` and `uv sync` produces a working monorepo with Move/TypeScript/Python toolchains pinned to exact versions"). It cannot be run autonomously because (a) the repo is not yet on GitHub (Plan 07 Task 4 outstanding), (b) the dev machine's `make` is not on PATH (Plan 03 Issues), and (c) a clean clone needs a separate workdir or VM.

### Prerequisites (must be done first, in order)

1. **Plan 07 Task 4 complete:** Repo lives at `https://github.com/<owner>/deepvault`, default branch is `main`, first CI run is visible in Actions tab.
2. **Optional but recommended:** Branch protection configured per `docs/CI-BRANCH-PROTECTION.md` (else Step 5 below cannot verify enforcement).
3. **Sui CLI installed:** `sui --version` returns `1.71.1` on the verifying machine.
4. **`make` available** OR be ready to use the underlying `pnpm` / `uv` commands directly.

### Step 1: Clean clone to a separate dir

```bash
# Pick any sibling directory or a /tmp dir
cd ~  # or cd /tmp on Linux/Mac
rm -rf deepvault-fresh   # safety: never run inside the working tree
git clone https://github.com/<owner>/deepvault.git deepvault-fresh
cd deepvault-fresh
```

### Step 2: Install all toolchains (`make install` or fallback)

```bash
make install
# OR if make not on PATH:
pnpm install --frozen-lockfile
(cd backtest && uv sync --locked)
# Expected: pnpm reports 3 workspace projects; uv resolves 30 packages; both exit 0.
```

### Step 3: Codegen + idempotency check

```bash
make codegen
# OR: (cd backtest && uv run --no-project python ../scripts/codegen.py)
git diff --exit-code contracts/sources/strategy_constants.move \
                      backtest/src/deepvault/strategy_constants.py \
                      dashboard/src/lib/strategy_constants.ts
# Expected: codegen runs; git diff is empty (idempotency proven).
# Exit code 0.
```

### Step 4: Run all tests + lints

```bash
make test
# OR: pnpm -r run test && (cd backtest && uv run pytest) && (cd contracts && sui move test)
# Expected:
#   sui move test          -> 0 tests pass (Phase 0 has no Move tests yet; OK)
#   pnpm -r run test       -> "Phase 4 fills this in" placeholder echo, exits 0
#   uv run pytest          -> 0 tests collected, exit code may be 5 (no tests yet; treat as OK)
# Exit code 0 (or 5 for pytest no-collect, which is acceptable in Phase 0).

make lint
# OR: pnpm -r run lint && (cd backtest && uv run ruff check . && uv run ruff format --check .)
# Expected:
#   pnpm -r run lint       -> "Phase 4 fills this in" placeholder echo, exits 0
#   uv run ruff check .    -> 0 errors (no Python source yet)
#   uv run ruff format --check . -> no changes needed
# Exit code 0.
```

### Step 5: Predict-diff sanity (single command)

```bash
bash scripts/predict-diff.sh
# Expected: "No new commits" report (or a small diff if Mysten landed commits between 2026-05-09 and the verification day).
# Exit code 0.
```

### Step 6: ROADMAP success criteria cross-check (5 commands)

```bash
echo "=== Success criterion #1: pinned toolchains ==="
grep -q "rev = \"[0-9a-f]\{40\}\"" contracts/Move.toml && echo "  PASS: DeepBookV3 SHA-pinned"
grep -q "mainnet-v1.71.1" .github/workflows/ci.yml && echo "  PASS: Sui CLI pinned in CI"
grep -q 'requires-python = ">=3.12"' backtest/pyproject.toml && echo "  PASS: Python 3.12+"

echo "=== Success criterion #2: codegen wired ==="
(cd backtest && uv run --no-project python ../scripts/codegen.py --check) && echo "  PASS: codegen idempotent"
grep -q "AUTO-GENERATED" contracts/sources/strategy_constants.move && \
grep -q "AUTO-GENERATED" backtest/src/deepvault/strategy_constants.py && \
grep -q "AUTO-GENERATED" dashboard/src/lib/strategy_constants.ts && \
echo "  PASS: All three runtimes have generated headers"

echo "=== Success criterion #3: predict-diff + Monday cron ==="
test -f scripts/predict-diff.sh && bash -n scripts/predict-diff.sh && echo "  PASS: predict-diff.sh"
test -f .github/workflows/monday-predict-check.yml && echo "  PASS: Monday cron workflow"
test -f .predict-diff-state && echo "  PASS: state file initialized"

echo "=== Success criterion #4: CONTRIBUTING.md policy locks ==="
grep -q "2026-05-30" CONTRIBUTING.md && echo "  PASS: code freeze date"
grep -q "fixed-ratio v1\|Fixed (v1)" CONTRIBUTING.md && echo "  PASS: hedge-ratio policy"
grep -q "No refactor after vault ships" CONTRIBUTING.md && echo "  PASS: no-refactor rule"

echo "=== Success criterion #5: CI parity gate ==="
test -f shared/golden-vectors.json && echo "  PASS: golden-vectors.json placeholder"
grep -q "needs: \[move, ts, python, codegen-drift\]" .github/workflows/ci.yml && echo "  PASS: parity job dependencies"
```

### Step 7: Capture versions for the record

```bash
sui --version       # expected: sui 1.71.1
node --version      # expected: v22.x.x
pnpm --version      # expected: 10.x.x
uv --version        # expected: 0.5+ (or whatever is current)
bash --version      # informational
```

### Reply With

- **"all green"** → Phase 0 closes definitively; orchestrator marks ROADMAP `[x] Phase 0` and STATE advances to Phase 1.
- **"fail: <criterion> — <error>"** → Open a follow-up Plan 09 to close the gap, OR re-run a specific earlier plan.
- **"skip-verify"** → Phase 0 closes with a note that end-to-end verification was deferred (acceptable on solo build but loses the ROADMAP success criterion #1 verbatim guarantee until the next opportunity).

</resume-signal>

---

*Phase: 00-setup-ground-rules*
*Plan: 08 (closure)*
*Completed: 2026-05-09*
*Phase 0 status: COMPLETE-WITH-CHECKPOINTS (3 outstanding human-action items: Plan 02 Task 4, Plan 07 Task 4, Plan 08 Task 3)*
