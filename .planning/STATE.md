---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: milestone
status: executing
stopped_at: "Phase 1 context gathered (4 areas: SSVI φ-family, binary pricing, parity, golden vectors). Ready for /gsd-plan-phase 1."
last_updated: "2026-05-09T11:54:20.293Z"
last_activity: 2026-05-09 -- Phase 0 planning complete
progress:
  total_phases: 7
  completed_phases: 1
  total_plans: 8
  completed_plans: 8
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-08)

**Core value:** A working PLP+Hedge vault on DeepBook Predict with a credible, auditable risk dashboard, deployed on mainnet by 2026-06-16. Quality of vault math, backtest, and dashboard polish > component count.
**Current focus:** Phase 1 — Math Foundation (SVI Parity Gate) — next-up

## Current Position

Phase: 0 (Setup & Ground Rules) — COMPLETE-WITH-CHECKPOINTS
Plan: 8 of 8
Status: Ready to execute
Next phase: Phase 1 — Math Foundation (SVI Parity Gate); requirements MATH-01..06; depends on Phase 0
Last activity: 2026-05-09 -- Phase 0 planning complete

Progress: [██████████] 100% Phase 0 / 14% milestone

## Performance Metrics

**Velocity:**

- Total plans completed: 0
- Average duration: —
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**

- Last 5 plans: —
- Trend: —

*Updated after each plan completion*
| Phase 0 P1 | 3min | 3 tasks | 10 files |
| Phase 0 P02 | 5min | 4 tasks | 9 files |
| Phase Phase 0 P03 P00-03 | 5min | 3 tasks | 6 files |
| Phase Phase 0 PP00-04 | 5min | 2 tasks tasks | 2 files files |
| Phase 0 P00-05 | 8min | 4 tasks | 4 files |
| Phase 0 P00-06 | 4min | 3 tasks | 3 files |
| Phase 0 P00-07 | 6min | 3 tasks (auto) + 1 checkpoint | 3 files |
| Phase 0 P00-08 | 4min | 2 tasks (auto) + 1 checkpoint | 2 files (README + closure SUMMARY) |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Two-protocol PTB (Margin + Predict), not three (drop Iron Bank) — Brief Week-6 cut adopted up front
- Fixed-ratio hedge sizing in v1, parameterized for future dynamic policies — Brief Week-8 cut adopted up front
- Mainnet redeploy in v1 scope (actual deploy, not just plan) — non-cuttable per PROJECT.md
- Live SVI surface but no time-travel slider — Brief Week-10 cut
- Quality bar over component count — math correctness > deploy hygiene > demo polish > composability breadth
- BTC-only at v1 — multi-asset is post-submission
- [Phase ?]: Plan 00-01: Repo bootstrap landed — public MIT, pnpm workspaces, indexer/dashboard placeholders
- [Phase ?]: Plan 00-02: DeepBookV3 SHA captured 1159d79af33c70e09e406310e1d8f067832ede9d on predict-testnet-4-16 (resolves Open Question #1)
- [Phase ?]: Plan 00-02: Used 'uv sync' (no --frozen) on first run; lockfile committed; Makefile install enforces 'uv sync --locked' going forward (Pitfall 0-C)
- [Phase ?]: Plan 00-02: Task 4 (wallet provisioning) deferred as human-action checkpoint; DEV-BOOTSTRAP.md uses [TBD] placeholders for both addresses
- [Phase ?]: Plan 00-03: Cross-runtime codegen wired — shared/strategy.toml + scripts/codegen.py emit Move/Python/TS constants with AUTO-GENERATED headers and --check drift mode (Plan 07 CI consumes). D-01..D-04 locked numbers verified bit-for-bit across all three runtimes.
- [Phase ?]: Plan 00-03: TS bigint literals (1209600n) used for u64-equivalent fields in dashboard/src/lib/strategy_constants.ts to maintain Move parity above 2^53.
- [Phase ?]: Plan 00-03: ASCII-only headers in generated files (AUTO-GENERATED - DO NOT EDIT, hyphen not em-dash) for Move tokenizer / cross-OS portability.
- [Phase ?]: Plan 00-04: config/testnet.toml + config/mainnet.toml schema parity wired (Pitfall 14 mitigation). 8 sections + schema_version=1; 17 TBD slots in mainnet for Phase 5 preflight.
- [Phase ?]: Plan 00-04: testnet [deepbook_margin], [oracle_svi].event_module_full, [assets].btc_oracle_type_tag retained as TBD on testnet — not yet documented in Mysten public surface; Phase 1 spike fills (intentional non-pre-fill to keep TBD literal greppable for Phase 5 preflight assertions).
- [Phase ?]: Plan 00-04: [hosting].relay_url uses wss:// scheme (mixed-content guard — Vercel https page cannot connect to ws:// from Render free tier). Documented inline in both configs; Phase 4 must use wss when filling.
- [Phase ?]: Plan 00-05: DeepBookV3 fork vendored at scripts/deepbookv3/ via git subtree --squash (HEAD 1159d79af33c70e09e406310e1d8f067832ede9d, matches Plan 02 Move.toml rev pin). RESEARCH Open Question #2 RESOLVED: predict_manager and oracle_svi are NOT separate top-level packages — predict_manager.move and oracle.move (with OracleSVIUpdated event) live INSIDE packages/predict/sources/. Watching packages/predict covers both.
- [Phase ?]: Plan 00-05: Cron schedule 0 14 * * 1 (Monday 14:00 UTC = 09:00 ET / 06:00 PT) chosen over 09:00 UTC for GHA delay headroom. workflow_dispatch wired for manual catchup. Title uses github.run_id for monotonic uniqueness.
- [Phase ?]: Plan 00-05: Subtree topology means scripts/predict-diff.sh runs git operations against parent repo with subtree-prefixed pathspec (NOT cd into vendored dir as RESEARCH Pattern 7 paste-ready code suggested) — corrected; documented in script comments.
- [Phase ?]: Plan 00-06: CONTRIBUTING.md committed at repo root with five hard policy locks (code freeze 2026-05-30, no-refactor-after-vault per Pitfall 18, no-dashboard-before-vault per Pitfall 19, hedge-ratio summary, weekly Monday Predict sweep) plus branch strategy + editing-generated-code workflow + ship-date hard-locks table. Closes SETUP-07. ROADMAP P0 success criterion #4 verbatim text present.
- [Phase ?]: Plan 00-06: docs/HEDGE-POLICY.md ADR committed (Status: Locked, decision table, per-parameter rationale, walk-forward re-tuning protocol with 60d in-sample / 14d out-of-sample / 30% held-out validation, permanent freeze ~2026-05-29, alternatives considered). Closes SETUP-06.
- [Phase ?]: Plan 00-06: docs/MAINNET-FUNDING.md mechanical Phase 5 playbook committed ($80 budget = $50 USDsui + $15 gas + $15 buffer; Cetus DEX swap path; SUI_CONFIG_DIR=~/.sui/sui_config_mainnet isolation; 4-step deploy flow; $30-buffer-tight risk flag with $150 top-up trigger; DEPLOY-09 contingency for un-shipped Predict mainnet; AdminCap discipline per Pitfall 14).
- [Phase ?]: Plan 00-06: Three-way number parity verified — allocation_bps=1000, strike_otm_bps=1500, tenor_seconds=1209600, roll_trigger_seconds=172800, sizing_function="fixed" all appear verbatim in CONTRIBUTING.md AND docs/HEDGE-POLICY.md AND shared/strategy.toml. T-00-23 mitigation in place; Plan 07 CI codegen-drift catches strategy.toml/generated drift independently.
- [Phase ?]: Plan 00-06: POLICY: commit-prefix discipline introduced — changes to [hedge_policy] fields require shared/strategy.toml + codegen + paired docs/HEDGE-POLICY.md ADR Decision-section update + POLICY: commit-message prefix. Second human gate beyond CI codegen-drift.
- [Phase ?]: Plan 00-07: 5-job CI matrix wired in .github/workflows/ci.yml (move + ts + python + codegen-drift + parity); parity job needs all four prior; Phase 0 stub asserts shared/golden-vectors.json exists, Phase 1 MATH-05 wires real cross-runtime check while keeping job NAME stable so branch protection survives.
- [Phase ?]: Plan 00-07: Sui CLI installed via direct release-tarball download (sui-mainnet-v1.71.1-ubuntu-x86_64.tgz per RESEARCH A6) rather than suiup — single edit point if Mysten changes asset naming. Resolves RESEARCH Open Q6 inline-as-comment.
- [Phase ?]: Plan 00-07: codegen-drift CI job uses cd backtest && uv sync --frozen + cd backtest && uv run --no-project python ../scripts/codegen.py (matches Makefile pattern from Plan 03; this is the plan-checker fix for the tomli-not-found failure mode), followed by git diff --exit-code on three generated files with ::error:: pointing at make codegen.
- [Phase ?]: Plan 00-07: Pinned action versions (verified RESEARCH A7/A8): actions/checkout@v4, pnpm/action-setup@v4, actions/setup-node@v6, astral-sh/setup-uv@v8.
- [Phase ?]: Plan 00-07: shared/golden-vectors.json shipped as strict empty array `[]` (not wrapping object); Phase 1 MATH-05 fills with Gatheral-paper test cases for SVI parity gate.
- [Phase ?]: Plan 00-07: docs/CI-BRANCH-PROTECTION.md ships both UI click-path (Settings → Branches) and gh CLI scripted path (gh api PUT branches/main/protection) for one-time setup; Task 4 awaits human action because gh repo create requires explicit owner/visibility/auth confirmation and required-status-checks only become selectable after each named job has run on default branch.
- [Phase ?]: Plan 00-07: Local default branch is currently 'master' (git init default); Resume Signal in 00-07-SUMMARY.md flags that user must `git branch -M main` before first push so workflow triggers fire (Pitfall 0-D guard).
- [Phase 0]: Plan 00-08: README polished from skeleton to judge-readable form (Status, Architecture at a Glance, Quick Start, Stack, Build Log Week 1 with Phase 0 closure entry, Hosting placeholder). 00-08-SUMMARY.md is the Phase 0 closure traceability matrix: 8/8 SETUP-XX PASS, 16/16 D-XX attributed, 5/5 ROADMAP success criteria cross-checked, 12/12 pitfalls (4 cross-cutting + 8 Phase-0-specific) mitigated. 3 outstanding human-action items: Plan 02 Task 4 (wallet provisioning), Plan 07 Task 4 (GitHub repo + branch protection), Plan 08 Task 3 (fresh-clone end-to-end verification). None block Phase 1 math.

### Pending Todos

None yet.

### Blockers/Concerns

Open verification gaps to resolve in Phase 0/1:

- DeepBook Margin collateral whitelist policy (Phase 3 Track A precondition; day-1 spike)
- `OracleSVIUpdated` Move event exact struct schema (day-1 read of `oracle_svi.move`)
- Predict mainnet launch ETA unknown — tracked weekly Monday; if not shipped by 2026-06-09, mainnet redeploy degrades to documented fallback
- `react-plotly.js` last published 2022 — Phase 4 contingency: 30-line `Plotly.newPlot()` fallback hook ready
- Predict mainnet contract addresses + USDsui type tag + mainnet `predict-server` URL — Phase 5 precondition
- Task 4 of Plan 00-02 BLOCKED-on-human: testnet + mainnet Sui wallet provisioning per D-06; resume-signal in 00-02-SUMMARY.md
- Task 4 of Plan 00-07 BLOCKED-on-human: gh repo create deepvault --public, git branch -M main, git push -u origin main, configure branch protection (5 required status checks); resume-signal in 00-07-SUMMARY.md "Resume Signal" section
- Task 3 of Plan 00-08 BLOCKED-on-human: fresh-clone end-to-end verification (clean clone + make install/codegen/test/lint exit 0 + idempotency + 5-criterion ROADMAP cross-check). Depends on Plan 07 Task 4 landing first (repo must be on GitHub). Resume-signal in 00-08-SUMMARY.md "Resume signal" section.

## Hard Policy Locks (from ROADMAP.md)

1. Three-way SVI parity gate — non-cuttable
2. 30-day backtest with lookahead audit — non-cuttable
3. Two-protocol PTB demo video — non-cuttable
4. Mainnet redeploy — non-cuttable
5. Code freeze 2026-05-30
6. Mainnet smoke test deadline 2026-06-12 (day 36)
7. Demo recorded on mainnet only, after smoke test
8. No dashboard work before vault feature-complete
9. Weekly Monday Predict contract-version sweep
10. Hedge-ratio policy committed in writing before backtest opens

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none)* | | | |

## Session Continuity

Last session: 2026-05-09T11:54:20.269Z
Stopped at: Phase 1 context gathered (4 areas: SSVI φ-family, binary pricing, parity, golden vectors). Ready for /gsd-plan-phase 1.
Resume file: .planning/phases/01-math-foundation-svi-parity-gate/01-CONTEXT.md
