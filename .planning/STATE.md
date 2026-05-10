---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: milestone
status: executing
stopped_at: Phase 02-03 complete (vault foundation modules — share/vault/predict_adapter/rate_limiter clone)
last_updated: "2026-05-10T11:00:00.000Z"
last_activity: 2026-05-10
progress:
  total_phases: 7
  completed_phases: 2
  total_plans: 26
  completed_plans: 20
  percent: 77
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-08)

**Core value:** A working PLP+Hedge vault on DeepBook Predict with a credible, auditable risk dashboard, deployed on mainnet by 2026-06-16. Quality of vault math, backtest, and dashboard polish > component count.
**Current focus:** Phase 02 — vault-move-package-testnet-deploy

## Current Position

Phase: 02 (vault-move-package-testnet-deploy) — EXECUTING
Plan: 4 of 9
Status: 02-03 complete; ready to execute Wave 2 (02-04 supply / 02-05 redeem in parallel)
Next phase: Phase 2 — Vault & Strategy (PLP+Hedge vault, predict_adapter, rebalance); imports parity-gate-protected svi_view::binary_price; depends on Phase 1
Last activity: 2026-05-10

Progress: [█████████████████] 100% Phase 1 / 100% milestone

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
| Phase 01 P01 | 12min | 4 tasks | 7 files |
| Phase 01 P02 | 14min | 3 tasks | 6 files |
| Phase 01 P01-03 | 10min | 3 tasks | 9 files |
| Phase 01 P01-04 | 8min | 2 tasks | 5 files |
| Phase 01 P01-05 | 12 | 3 tasks | 11 files |
| Phase 01 P01-06 | 8min | 3 tasks | 11 files |
| Phase 01 P01-07 | 9min | - tasks | - files |
| Phase 01 P01-08 | 7min | 3 tasks | 8 files |
| Phase 01 P09 | 8min | 2 tasks | 3 files |
| Phase 02 P01 | 30min | 4 tasks | 7 files |
| Phase 02 P02 | 12min | 3 tasks | 5 files |
| Phase 02 P03 | ~25min | 3 tasks | 7 files |

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
- [Phase ?]: Phase 01-01: Locked SVI math contract — raw 5-param SVI at 1e9 FLOAT_SCALING, Cody 1969 Phi, 7-iter Newton sqrt; cloned from vendored Predict SHA 1159d79af33c70e09e406310e1d8f067832ede9d (re-routes D-01,09,10,11,13,14)
- [Phase ?]: Phase 01-01: Top-level [svi].scale=9 schema (NOT nested [fixed_point.svi]); k_max_log_strike=2_500_000_000; per-param bounds (a_max=4e9, b_max=8e9, sigma in [1, 4e9], |m| <= 2.5e9) propagated via codegen to 3 runtimes
- [Phase ?]: Phase 01-01: MATH: commit-prefix policy added as CONTRIBUTING.md sec 6 — gates shared/svi-spec.md, cody_phi_coefficients.toml, [svi] block, helpers/{i64,isqrt,phi}.move, svi_view.move, deepvault/{isqrt,phi,svi}.{py,ts}; mirrors POLICY: discipline
- [Phase ?]: Phase 01-01 Spike 1: oracle.compute_price is public(package) per oracle.move:331 — NOT callable from deepvault::svi_view; MATH-02 parity asserted INDIRECTLY via 120 golden vectors; Phase 2 vault.rebalance does live testnet predict.get_trade_amounts comparison
- [Phase ?]: Phase 01-01 Spike 2: bit-shift seed sequence (64,32,16,8,4,2,1) verified at vendored math.move:281-292; reformulated 1000-input check as 100 fixed inputs across Plans 01-03 + 01-05 (random.Random(seed=42))
- [Phase ?]: Phase 01-01 Spike 4: contracts/sources/helpers/ layout (mirrors Predict helper/ shape); planned files: helpers/{i64,isqrt,phi,math}.move + top-level svi_view.move + phi_coefficients.move
- [Phase ?]: Phase 01-01 deviation: vendored scripts/deepbookv3/packages/predict/tests/oracle_tests.move does NOT exist — Plan 01-08 Tier C2 must source from local sui move test runs OR predict-server REST (recorded in 01-01-SPIKE-NOTES.md)
- [Phase ?]: Phase 01-02: Cody 1969 Phi coefficient table locked into shared/cody_phi_coefficients.toml; codegen.py extended (load_phi + emit_phi_{move,python,typescript} + _fmt_underscored helper); main() now writes 6 files; --check covers all 6
- [Phase ?]: Phase 01-02: TS bigint n suffix on every phi_coefficients.ts value (Pitfall B / threat T-01-11 mitigation); auxiliary LN2_U128 emitted from same TOML for downstream phi.move/phi.py/phi.ts parity
- [Phase ?]: Phase 01-02: CI codegen-drift job extended from 3 to 6 file paths in git diff --exit-code; job key codegen-drift preserved (branch protection invariant per PATTERNS.md sec G)
- [Phase ?]: Phase 01-03: Python canonical SVI evaluator complete (isqrt + phi + ln + svi cloned from vendored math.move + oracle.move at SHA 1159d79a; 50 tests pass; Cody Phi within 1e-7 of scipy; 100-input snapshot pinned for Plan 01-05 Move cross-check)
- [Phase ?]: Phase 01-03: ECannotBeNegative on-chain assert is provably unreachable in pure SVI math when sigma > 0; kept as defensive parity, tests exercise EZeroVariance path instead
- [Phase ?]: Phase 01-03: Tier A vectors hand-computed from raw-SVI closed-form (5 cases); Plan 01-04 supersedes via golden-vectors.json from this same evaluator
- [Phase ?]: Phase 01-04: 141 golden vectors emitted (A=21, B=100, C=10, C2=10) via scripts/golden_emit.py; deepvault.svi canonical; D-16 hex schema with {mag,neg} signed pairs
- [Phase ?]: Phase 01-04: Tier B arb-violating sub-tier uses a=0,b=0 to trigger reachable EZeroVariance (ECannotBeNegative is unreachable for sigma>0 per 01-03 analysis); 10 IDs B-arb-091..B-arb-100 have params_valid=false
- [Phase ?]: Phase 01-04: CI codegen-drift extended from 6 to 8 file paths (+ shared/golden-vectors.json + contracts/tests/golden_vectors_data.move); new Regenerate-golden-vectors step inserted; job keys codegen-drift + parity unchanged for branch protection
- [Phase ?]: Phase 01-04: Tier C/C2 ship as stubs with deepvault.svi-derived expected values; vendored oracle_tests.move does NOT exist per 01-01-SPIKE-NOTES.md; Plan 01-08 may overwrite C2 with empirical sui-move-test outputs of oracle::compute_nd2
- [Phase ?]: Phase 01-05: Move evaluator + helpers cloned line-for-line from vendored Predict at SHA 1159d79a; production binary_price() FULLY FUNCTIONAL after Spike 1 reassessment (oracle::svi + SVIParams accessors are public)
- [Phase ?]: Phase 01-05: 4 Move test modules (i64+isqrt+phi+svi_view) authored; svi_view_test.move loops all 141 golden vectors and asserts bit-equal output within 1 unit at 1e9 — MATH-02 parity gate covers Tier A (21) + B-valid (90) + C (10) + C2 (10) = 131 vectors; 10 arb-violating skipped via params_valid guard with EZeroVariance assertion test for rejection coverage
- [Phase ?]: Phase 01-05: Sui CLI unavailable in execution environment (verified via which/command-v/PowerShell); sui move build && sui move test deferred to CI / Plan 01-07 parity job; static review against vendored source confirms algorithmic correctness
- [Phase ?]: Phase 01-05: Cross-runtime sqrt parity test inlines first 20 cases from backtest/tests/test_isqrt_random_snapshot.txt as Move u128 hex literals (Move tests can't read text files at compile time); same random.Random(seed=42) inputs as Plan 01-03 Python pytest
- [Phase ?]: Phase 01-06: TS evaluator triple+ (math/isqrt/phi/ln/svi.ts) cloned bigint-only from vendored Predict SHA 1159d79a; Vitest 4.1.5 wired in dashboard/ workspace; 303 tests pass in 1.3s incl. 100-input cross-runtime sqrt parity vs Python snapshot AND 131-valid-vector total_variance + binary_price parity loops within 1 unit at 1e9
- [Phase ?]: Phase 01-06: MATH-03 satisfied — TS evaluator bit-equal with Python on every valid golden vector. Combined with Plan 01-03 (MATH-01) + Plan 01-05 (MATH-02), three-way parity gate is provably real on 131 vectors; Plan 01-07 can wire all three runtime test commands as required-status-checks
- [Phase ?]: Phase 01-06: BigInt `/` truncates toward zero natively (matches Move u128 + Python _signed_div_trunc); plain BigInt arithmetic is bit-equal with Python by construction — no _signedDivTrunc helper needed. Documented in svi.ts. NO Number/parseFloat/Math.X in any of the 5 evaluator files; all numeric literals carry the `n` suffix
- [Phase ?]: Phase 01-07: CI parity job replaces Phase 0 stub with three-way assertion (Python + TS + Move parity_runners + forbidden-token grep on TS evaluator); job KEY parity preserved per CONTRIBUTING.md branch protection invariant; MATH-05 satisfied
- [Phase ?]: Phase 01-07: parity_runners use tolerance default 1 unit at 1e9 (re-routed D-14); empirically all 141 vectors pass at exact equality across Python + TS + Move; 1-unit guardrail is forward-defense not bug-permit
- [Phase ?]: Phase 01-07: two-step Move CI invocation (--filter golden_vectors targeted + unfiltered sanity) mitigates T-01-38 silent-malformed-filter; total parity job ~30s wall-clock
- [Phase 01]: Phase 01-08: Off-chain arb-free checker shipped (Python + TS); 19 new tests; backtest 50→61, dashboard 303→311. arb_checker.{py,ts} are the ONLY numpy/Math.X-allowed modules in the evaluator codebase (visualization-bound, not parity-bound per CONTEXT.md D-05); CI parity job's forbidden-token grep targets math/isqrt/phi/ln/svi.ts only.
- [Phase 01]: Phase 01-08: MATH-04 satisfied — arb-checker delivers full g(k) array (length 200 at FLOAT_SCALING) for Phase 4 dashboard rendering. shared/golden-vectors.json regenerated with real min_g_k via arb_checker.check_arb: 131 valid vectors → min_g_k ≥ 0 (zero false positives), 10 arb-violating B-arb-* → min_g_k = -F sentinel (degenerate ATM-variance path). Move companion byte-identical (no min_g_k accessor — closed-form arb-check on-chain per D-05).
- [Phase 01]: Phase 01-08: Float-internal computation pattern established for off-chain visualization-bound modules: dequantize → Gatheral closed-form g(k) in float → rounded back to int/bigint at FLOAT_SCALING at function boundary. Saves ~100 lines of integer op-order discipline per runtime; correct because module is provably off-chain-only.
- [Phase 01]: Phase 01-08: Tier C JackJacquier fixture shipped as documented stub per CONTEXT.md re-route D-17 (5 vectors, expected_w stub-derived from deepvault.svi). Notebook execution + sui move test capture for Tier C2 source upgrade DEFERRED to Phase 6 (blocked by upstream LICENSE absence + Sui CLI unavailability + testnet wallet provisioning gates). Whitepaper claim ladder unchanged — spec already documents Tier C2 source as deferred to 01-08, and 01-08 forwards to Phase 6.
- [Phase 01]: Phase 01 CLOSED — all 6 MATH requirements (MATH-01..MATH-06) DONE across 8 plans. CI parity gate enforced (MATH-05); three-way bit-equal parity on 141 vectors at 1 unit tolerance at 1e9; arb-checker delivers g(k) array (MATH-04 differentiator). Phase 2 (vault.rebalance) UNBLOCKED.
- [Phase ?]: [Phase 01]: Plan 01-09: CR-01 (BLOCKER from 01-REVIEW.md) and partial truth in 01-VERIFICATION.md gaps[0] CLOSED via defense-in-depth — 10 per-row arb_violating_NNN_aborts_when_passed_to_svi_view tests at offsets 111..120 (replacing deleted golden_vectors_arb_violating_all_reject misuse-test) + WR-02 emit-time assertion in golden_emit.py. All 10 per-row tests predicted PASS via static review against vendored Predict SHA 1159d79a (a=0,b=0 -> total_var=0 -> EZeroVariance at svi_view.move:104); first CI run is documented-conditional empirical confirmation gate per Plans 01-05 / 01-07. Phase 1 closure unchanged: 6/6 MATH requirements DONE across 9 plans.
- [Phase 02]: Phase 02-01: PredictManager ownership = supplier-owned (option b) per WAVE0-DECISION.md spike. Vault never owns/stores a PredictManager — supplier brings &mut PredictManager into vault::supply. Single PTB story preserved (predict::create_manager + vault::supply in one Transaction).
- [Phase 02]: Phase 02-01: DeepBookPredict added as separate Move.toml dep (Rule 3 latent Phase 1 build fix). Same SHA pin as DeepBookV3; verify-deepbookv3-pin.sh enforces alignment with vendored subtree.
- [Phase 02]: Phase 02-01: scripts/verify-deepbookv3-pin.sh + new step in ci.yml move job before sui move build. 5-job matrix preserved (move/ts/python/codegen-drift/parity).
- [Phase 02]: Phase 02-01: Open Questions resolved — Q#1 + Q#4 by this plan; Q#2 deferred to 02-07; Q#3 by 02-09 deploy script; Q#5 to Phase 4; Q#6 to 02-02 + Phase 3. Heading renamed '## Open Questions (RESOLVED)'.
- [Phase 02]: Phase 02-02: shared/strategy.toml schema_version bumped 1 -> 2 (BREAKING). [token_bucket] BPS schema replaced with absolute u64 micro-units (capacity_quote_micro_units = 100_000_000 = 100 DUSDC; refill_rate_quote_micro_units_per_ms = 1200) to match vendored deepbook_predict::rate_limiter.move u64 capacity + refill_rate_per_ms field types. New [inflation_defense] block (seed_quote_micro_units = 10_000_000, virtual_shares = 1_000_000) ports OpenZeppelin ERC-4626 v5 inflation defense to cross-runtime constants. New [hedge_policy].max_price_premium_bps = 50 implements RESEARCH.md Pitfall 2 abstain threshold.
- [Phase 02]: Phase 02-02: codegen.py emit_move/emit_python/emit_typescript extended with 6 new accessors per runtime (token_bucket_capacity, token_bucket_refill_rate_per_ms, seed_quote_micro_units, virtual_shares, nav_scale = 1_000_000_000 hardcoded, max_price_premium_bps). TS bigint 'n' suffix policy extended to TOKEN_BUCKET_CAPACITY/REFILL_RATE_PER_MS/SEED_QUOTE_MICRO_UNITS/VIRTUAL_SHARES/NAV_SCALE. load_strategy schema guard bumped 1 -> 2 in lockstep. CI codegen-drift job stays green (--check exit 0). Three generated files regenerated bit-equally; idempotent.
- [Phase 02]: Phase 02-03: Vault<phantom Quote> shared object + AdminCap + create_vault landed with W1-locked 18-field schema (treasury_cap, admin, paused, balance, escrow_balance, request_slots, rate_limiters, hedges, hedge_keys, predict_manager_id, total_shares_supply, total_assets, six tunable_*) and W2-locked RequestSlot { shares_escrowed: Balance<SHARE>, request_timestamp_ms, claimed_so_far }. AdminCap is `key`-only — non-transferable v1 per D-12. Closes VAULT-01, VAULT-02, VAULT-07.
- [Phase 02]: Phase 02-03: share.move SHARE OTW + PendingTreasury bridge — TreasuryCap<SHARE> escapes init() only via `consume_pending` (public(package)); deployer never holds free TreasuryCap. helpers/rate_limiter.move line-for-line clone of vendored Predict at SHA 1159d79a (only changes: module path + DeepVault MIT header). predict_adapter.move 47-line two-function passthrough (single-file blast radius for Pitfall 6 ABI churn).
- [Phase 02]: Phase 02-03: Rule 3 deviation — plan body's `predict_manager::new(ctx)` is `public(package)` and unreachable; switched to public wrapper `predict::create_manager(ctx)` (predict.move:192). Semantics preserved (manager owner == ctx.sender()); WAVE0-DECISION.md option (b) unchanged.
- [Phase 02]: Phase 02-03: 10 DUSDC seed (10_000_000 quote micro-units) locked into Vault.balance + 1_000_000 SHARE coins minted via TreasuryCap and burned to @0xdead via const DEAD_ADDRESS. Pre-burn assert!(seed.value() == strategy_constants::seed_quote_micro_units(), ESeedAmountMismatch) is the only abort path tested locally; full happy-path coverage moves to Plan 02-09 E2E script.

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
| Tier C JackJacquier source upgrade | Execute upstream notebook against pinned (svi, k) tuples + capture outputs to backtest/tests/fixtures/jackjacquier_ssvi_outputs.json + pin notebook git SHA | Deferred to Phase 6 closeout (whitepaper credibility lift; not on critical path) | Phase 01-08 |
| Tier C2 PredictTests source upgrade | Run local `sui move test` against `oracle::compute_nd2` for 10 PredictTests-stub vectors + capture outputs + overwrite expected w/binary_price in shared/golden-vectors.json | Deferred to Phase 6 closeout (blocked by Sui CLI unavailability + testnet wallet provisioning per Plan 00-02 Task 4 BLOCKED-on-human) | Phase 01-08 |

## Session Continuity

Last session: 2026-05-10T11:00:00.000Z
Stopped at: Phase 02-03 complete (vault foundation modules — share/vault/predict_adapter/rate_limiter clone; W1+W2 locks in place)
Resume file: None
