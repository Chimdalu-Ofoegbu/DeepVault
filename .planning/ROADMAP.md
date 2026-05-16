# Roadmap: DeepVault

**Created:** 2026-05-09
**Granularity:** coarse (mode: yolo, parallelization: false — solo build)
**Window:** 39 days from 2026-05-09 to 2026-06-16 (hackathon backstop 2026-06-20)
**Coverage:** 67/67 v1 requirements mapped to phases

## Overview

DeepVault is a single-curated PLP+Hedge structured-product vault on Sui DeepBook Predict, paired with an institutional-grade SVI volatility-surface dashboard and a handbook-required Python backtest. The roadmap is built around a non-negotiable phase ordering: **Setup → Math → Vault → Backtest+PTB → Dashboard → Mainnet → Submission**. Math correctness is the load-bearing axis; three-way SVI parity (Move + Python + TypeScript) is the gate that opens every later phase. Quality bar is explicit and ordered: math correctness > deploy hygiene > demo polish > composability breadth.

## Hard Policy Locks (Non-Cuttable)

These constraints govern every phase. Violation halts feature work until resolved.

1. **Three-way SVI parity gate** is non-cuttable. If golden vectors diverge between Move, Python, and TypeScript, no further phase work proceeds until green.
2. **30-day backtest with lookahead audit** is non-cuttable. Handbook hard requirement. A backtest with implausible numbers gets thrown out.
3. **Two-protocol PTB demo video** is non-cuttable. Foundation-blessed composability story.
4. **Mainnet-readiness toolkit** is non-cuttable. Scripts + runbook must exist and lint clean by 2026-06-12; execution deferred to post-submission pending DeepBook Predict mainnet ship date. (Superseded 2026-05-13: was "Mainnet redeploy is non-cuttable" — see Phase 5 reshape note.)
5. **Code freeze 2026-05-30** for vault and SVI calibrator. After this date: bug fixes and integration only, no internal-architecture changes.
6. **Testnet smoke test green by 2026-06-12** (day 36, not day 39). `./scripts/testnet-smoke-test.sh` (or `make demo`) runs end-to-end with dual ±10 bps NAV verification. (Superseded 2026-05-13: was "Mainnet smoke test deadline 2026-06-12" — see Phase 5 reshape note.)
7. **Demo recorded on testnet**, against the full PTB (Margin + Predict + vault hedge). Mainnet sidebar (~10s) shows post-submission deploy posture. (Superseded 2026-05-13: was "Demo recorded on mainnet only" — see Phase 5/6 reshape notes.)
8. **No dashboard work before vault feature-complete.** Phase 4 cannot start until Phase 2 closed and Phase 3 Track A PTB is at least integration-tested.
9. **Weekly Monday Predict contract-version sweep** through every phase. Halt feature work on any breaking change until adapter is fixed and integration suite is green.
10. **Hedge-ratio policy committed in writing before backtest opens** (locks against hindsight tuning).

## Cut-Latest Order (When Behind Schedule)

Drop in this order, never reverse:

1. What-if simulator polish (keep core, drop ±5σ animation)
2. Per-oracle exposure panel (vault panel covers overall exposure)
3. Arbitrage-free checker UI (keep math in `svi.ts`, hide UI; mention in README)
4. Sell-back on near-expiry (let hedges expire; document as v1.1)
5. VAULT_SHARE-as-Margin-collateral live demo (keep test vectors + documentation; demo PTB borrows in C only)

**Never cut:** SVI three-way parity gate, 30-day backtest with lookahead audit, mainnet redeploy, two-protocol PTB demo video.

## Phases

**Phase Numbering:**
- Integer phases (0-6): Planned milestone work for v1 submission
- Decimal phases (e.g., 2.1): Reserved for urgent insertions (marked INSERTED)

- [x] **Phase 0: Setup & Ground Rules** - Repo scaffold, version pinning, weekly-Monday ritual, code-freeze rule, hedge-ratio policy locked (COMPLETE-WITH-CHECKPOINTS 2026-05-09; 3 outstanding human-action items: Plan 02 Task 4 wallet provisioning, Plan 07 Task 4 GitHub repo + branch protection, Plan 08 Task 3 fresh-clone verification — none block Phase 1)
- [ ] **Phase 1: Math Foundation (SVI Parity Gate)** - Three-way SVI evaluator parity (Move + Python + TS) with arbitrage-free checker
- [ ] **Phase 2: Vault Move Package + Testnet Deploy** - `deepvault::` package with supply/redeem/rebalance, end-to-end testnet supply→hedge→redeem cycle
- [ ] **Phase 3: Backtest Harness + Two-Protocol PTB** - 30-day handbook backtest with lookahead audit + Margin+Predict atomic PTB on testnet
- [ ] **Phase 4: PLP Risk Studio Dashboard + Relay** - Event relay, live SVI surface, vault panels, what-if simulator, dApp Kit deposit/withdraw
- [ ] **Phase 5: Mainnet Redeploy + Smoke Test** - Mainnet preflight, deepvault publish, $50 supply→hedge→redeem cycle on mainnet by 2026-06-12
- [ ] **Phase 6: Submission Package** - Demo video on mainnet, README + architecture diagram + strategy whitepaper, Devpost submission by 2026-06-16

## Phase Details

### Phase 0: Setup & Ground Rules
**Goal**: Cross-cutting infrastructure and rituals locked before any feature work begins, so later phases inherit a stable foundation and refactor temptation is bounded.
**Depends on**: Nothing (first phase)
**Requirements**: SETUP-01, SETUP-02, SETUP-03, SETUP-04, SETUP-05, SETUP-06, SETUP-07, SETUP-08
**Success Criteria** (what must be TRUE):
  1. A fresh `git clone` followed by `pnpm install` and `uv sync` produces a working monorepo with Move/TypeScript/Python toolchains pinned to exact versions (Sui CLI `mainnet-v1.71.1`, `predict-testnet-4-16` rev).
  2. Editing a single value in `shared/strategy.toml` regenerates Move, Python, and TypeScript constants on the next build, and CI fails if generated files are out of sync.
  3. Running `scripts/predict-diff.sh` reports any new commits on the `predict-testnet-4-16` branch since last sweep, and a calendar reminder fires every Monday.
  4. `CONTRIBUTING.md` documents the 2026-05-30 code-freeze rule, the no-refactor-after-vault-ships policy, and the hedge-ratio policy (fixed-ratio v1, parameterized for future dynamic) — all committed before Phase 1 closes.
  5. Every push to GitHub triggers a CI run that executes Move tests, TypeScript Vitest, Python pytest, and the golden-vector parity check (initially empty, gate wired).
**Plans**: 8 plans
- [x] 00-01-PLAN.md — Repo bootstrap (.gitignore, LICENSE, root package.json, pnpm-workspace.yaml, placeholder workspaces, README skeleton)
- [x] 00-02-PLAN.md — Toolchain pins (Move.toml SHA-pin, backtest pyproject + uv sync, Makefile, two-wallet provisioning, DEV-BOOTSTRAP.md)
- [x] 00-03-PLAN.md — shared/strategy.toml + scripts/codegen.py + Makefile codegen target (locked hedge values)
- [x] 00-04-PLAN.md — config/{testnet,mainnet}.toml scaffolds (schema parity, Pitfall 14 mitigation)
- [x] 00-05-PLAN.md — DeepBookV3 fork via subtree + scripts/predict-diff.sh + Monday cron workflow
- [x] 00-06-PLAN.md — CONTRIBUTING.md + docs/HEDGE-POLICY.md + docs/MAINNET-FUNDING.md (policy locks)
- [x] 00-07-PLAN.md — .github/workflows/ci.yml 5-job matrix + golden-vectors.json placeholder + branch-protection guide (Tasks 1-3 complete; Task 4 awaiting human action — see 00-07-SUMMARY.md Resume Signal)
- [x] 00-08-PLAN.md — README polish + Phase 0 closure SUMMARY (Tasks 1-2 complete; Task 3 fresh-clone end-to-end verification BLOCKED-on-human, recipe in 00-08-SUMMARY.md Resume signal)

### Phase 1: Math Foundation (SVI Parity Gate)
**Goal**: A single SSVI evaluator algorithm implemented in three runtimes (Move, Python, TypeScript) producing bit-for-bit identical output on a shared golden-vector suite, with a working arbitrage-free checker.
**Depends on**: Phase 0
**Requirements**: MATH-01, MATH-02, MATH-03, MATH-04, MATH-05, MATH-06
**Success Criteria** (what must be TRUE):
  1. The Python SSVI evaluator reproduces every published Gatheral & Jacquier 2014 test case within float tolerance — a developer can rerun the audit script and see "all 100+ vectors PASS" on a fresh clone.
  2. The Move `deepvault::svi_view` evaluator produces output identical to Python on the same 100+ golden vectors within 1 wei tolerance, executable via `sui move test`.
  3. The TypeScript `dashboard/lib/svi.ts` evaluator produces output identical to Python on the same vectors, executable via `pnpm test`.
  4. The arbitrage-free checker visualizes a violating g(k) curve (not just a boolean) when fed an arbitrage-violating SVI slice, and passes when fed Gatheral-paper-valid slices.
  5. The CI three-way parity gate is green; any change in any runtime that breaks parity blocks the phase from advancing.
**Plans**: 9 plans
- [x] 01-01-PLAN.md (Wave 0) — Spec doc + strategy.toml [svi] extension + MATH: prefix + Wave-0 spike resolutions
- [x] 01-02-PLAN.md (Wave 1) — Codegen extension for Cody Phi coefficients (3 generated files)
- [x] 01-03-PLAN.md (Wave 2, TDD) — Python canonical evaluator: isqrt + phi + ln + svi + tests
- [x] 01-04-PLAN.md (Wave 3) — Golden-vector emitter: 120+ vectors (Tier A/B/C/C2) + Move companion
- [x] 01-05-PLAN.md (Wave 4) — Move evaluator: helpers/{i64,math,isqrt,phi,ln} + svi_view + tests
- [x] 01-06-PLAN.md (Wave 4) — TypeScript evaluator: math/isqrt/phi/ln/svi.ts + Vitest setup + tests
- [x] 01-07-PLAN.md (Wave 5) — CI parity job wiring: 3-runtime cross-check + forbidden-token grep
- [x] 01-08-PLAN.md (Wave 6) — Arb-checker (Python + TS) + g(k) array + Tier C JackJacquier fixture
- [x] 01-09-PLAN.md (Wave 7, gap closure) — Close CR-01: per-row arb-violating Move rejection tests + WR-02 emit-time defensive assertion

### Phase 2: Vault Move Package + Testnet Deploy
**Goal**: A deployed `deepvault::` Move package on Sui testnet supporting end-to-end supply→hedge→redeem with vault share tokens, withdrawal queue, and pause authority — auditable, tested, and integration-verified against current Predict contracts.
**Depends on**: Phase 1
**Requirements**: VAULT-01, VAULT-02, VAULT-03, VAULT-04, VAULT-05, VAULT-06, VAULT-07, VAULT-08, VAULT-09, VAULT-10, VAULT-11
**Success Criteria** (what must be TRUE):
  1. From a fresh testnet wallet, a user can supply USDsui to the vault and receive `Coin<VAULT_SHARE>` whose value tracks NAV — the seed transaction (shares burned to dead address) prevents first-deposit inflation attack and Move tests prove it.
  2. A user can call `redeem_request` then `redeem_fulfill` and receive USDsui back, gated by the per-user token-bucket limiter, with the bucket state observable on-chain.
  3. `vault::rebalance::buy_hedge_for_deposit` purchases an OTM binary hedge via `predict::mint` at the SSVI theoretical price, with sell-back/roll near expiry handled deterministically.
  4. The Move test suite reports ≥85% line coverage on supply/redeem/rebalance and the Sui Prover spec passes for inflation-safety, share-NAV monotonicity, and capability containment (TreasuryCap and AdminCap never escape).
  5. The end-to-end testnet supply→hedge→redeem cycle script runs green in CI on every push, and `worst_case_haircut` returns a documented bound consumable by the future Margin liquidation path.
**Plans**: 9 plans
- [x] 02-01-PLAN.md (Wave 0) — PredictManager-ownership spike + WAVE0-DECISION.md + DeepBookV3 SHA-pin verification + RESEARCH.md inline RESOLVED annotations
- [x] 02-02-PLAN.md (Wave 0) — strategy.toml [token_bucket] schema shift to absolute u64 micro-units + max_price_premium_bps + inflation_defense + codegen.py extensions
- [x] 02-03-PLAN.md (Wave 1) — share.move OTW + helpers/rate_limiter.move clone + vault.move FINAL struct schema (W1 lock) + predict_adapter.move thin wrapper (closes VAULT-01, VAULT-02, VAULT-07)
- [x] 02-04-PLAN.md (Wave 2) — supply.move (virtual-shares math + atomic hedge) + rebalance.move (W3 lock: predict_manager::deposit BEFORE predict_adapter::mint) + ltv.move (closes VAULT-03, VAULT-05 supply portion, VAULT-06)
- [x] 02-05-PLAN.md (Wave 2) — redeem.move (request + fulfill + cancel + per-user RateLimiter lazy-init via Balance<SHARE> form per W2 lock) (closes VAULT-04)
- [x] 02-06-PLAN.md (Wave 3) — vault.move admin functions (admin_pause, admin_oracle_staleness_override, admin_tune_strategy, admin_emergency_unwind) (closes VAULT-08)
- [x] 02-07-PLAN.md (Wave 4) — Two Sui Prover specs (inflation_safe + nav_monotone) + capability_containment.move stub + grep CI step + nightly-prover.yml workflow (closes VAULT-10 per W4 lock)
- [x] 02-08-PLAN.md (Wave 4) — property_test.move (50-case round-down + W5-locked redeem fulfill body + seed-once) + coverage_check.sh + CI ≥85% gate (closes VAULT-09)
- [x] 02-09-PLAN.md (Wave 5) — e2e-vault-deploy.sh + e2e-vault-cycle.sh/.ts + integration_test.move (absorbs deferred 02-04 Predict-integration tests) + ci.yml 6th job e2e-vault + nightly-e2e-vault.yml (closes VAULT-11 + materially closes testnet deploy step)

### Phase 3: Backtest Harness + Two-Protocol PTB
**Goal**: Two independent tracks complete in the same window: (A) the flagship two-protocol PTB (Margin borrow + Predict PLP supply + hedge mint, atomic) demonstrated on testnet, and (B) a 30-day handbook-grade Python backtest with lookahead-bias audit and Move↔Python trace-replay parity.
**Depends on**: Phase 2
**Requirements**: BACK-01, BACK-02, BACK-03, BACK-04, BACK-05, BACK-06, BACK-07, BACK-08, BACK-09, BACK-10, PTB-01, PTB-02, PTB-03, PTB-04, PTB-05, PTB-06
**Success Criteria** (what must be TRUE):
  1. A fresh-wallet user on testnet can execute the single PTB (`Margin::borrow_quote` → `vault::supply::deposit` → `vault::rebalance::buy_hedge_for_deposit`) and observe a deterministic tx digest with all three positions opened atomically — failure of any step rolls back the entire transaction.
  2. The VAULT_SHARE-as-Margin-collateral whitelist verification has a written decision recorded with date: either whitelisted and demoed live, or demoted to documented-future and demo PTB borrows quote-only.
  3. A Python `vault_state` machine consumes a JSON action trace (supply/redeem/rebalance) and produces NAV/share state identical to the same trace executed via Move PTBs on testnet, within 1 wei.
  4. The 30+ day backtest report renders an institutional-grade HTML/PDF with assumption ledger, max drawdown, Sharpe/Sortino on out-of-sample 30%, and PnL attribution split into PLP yield / hedge cost / hedge payoff — and the shuffled-label sanity test produces ~zero alpha (proving no lookahead leak).
  5. Capability-flow tests prove `TradeCap` never leaves the user's BalanceManager and `TreasuryCap<VAULT_SHARE>` never leaves the shared Vault, and the -30% NAV shock liquidation property test passes against the worst-case Predict outcome.
**Plans**: 9 plans
- [x] 03-01-PLAN.md (Wave 0) - Spike: 5-call PTB shape lock + DUSDC margin pool discovery + SDK version pin + runtime budget + 6 open questions resolved -> WAVE0-DECISION.md + CONTEXT.md D-17 amendment + MARGIN-WHITELIST-DECISION.md
- [x] 03-02-PLAN.md (Wave 1, Track B) - data_ingest.py + replay.py @strategy_fn decorator + .planning/backtest-assumptions.md (BACK-01, BACK-03 foundation, BACK-06 foundation)
- [x] 03-03-PLAN.md (Wave 1, Track A) - scripts/two-protocol-ptb-demo.{ts,sh} skeleton + contracts/tests/mock_margin_pool.move (PTB-01, PTB-02)
- [x] 03-04-PLAN.md (Wave 2, Track B, TDD) - vault_state.py + lookahead_audit.py + tests; bit-equal Move parity + shuffled-label/hand-recompute machinery (BACK-02, BACK-06)
- [x] 03-05-PLAN.md (Wave 2, Track A) - Complete 5-call PTB body + Move ptb_capability_test.move + Python test_ptb_capability_grep.py (PTB-03, PTB-04, PTB-06)
- [x] 03-06-PLAN.md (Wave 3, Track B) - replay.py simulate() + replay_trace() CLI + e2e-vault-cycle.ts trace dump + 7-day micro-fixture + 1-wei parity test (BACK-04, BACK-05 trace capture)
- [x] 03-07-PLAN.md (Wave 3, Track A) - liquidation_test.move at -30% NAV shock + Python test_liquidation_parity.py cross-asserting worst_case_nav at 1-wei (PTB-05)
- [x] 03-08-PLAN.md (Wave 4, Track B) - walk_forward.py + pnl_attribution.py with 6-column accountant + Sharpe/Sortino/drawdown on OOS (BACK-07, BACK-08, BACK-09)
- [x] 03-09-PLAN.md (Wave 5, Track B + closure) - report.py + report.html.j2 + hand-recompute.ipynb + ci.yml per-push micro-fixture + nightly-backtest.yml + Margin-side capability grep (BACK-05 closure, BACK-09, BACK-10, PTB-04 grep gate)

### Phase 4: PLP Risk Studio Dashboard + Relay
**Goal**: A live React dashboard streaming SVI surface updates from a Node.js event relay, with vault panels, arbitrage checker, what-if simulator, and dApp Kit deposit/withdraw flows — running end-to-end against the testnet vault.
**Depends on**: Phase 3 Track A (PTB integration-tested)
**Requirements**: DASH-01, DASH-02, DASH-03, DASH-04, DASH-05, DASH-06, DASH-07, DASH-08, DASH-09, DASH-10, DASH-11, DASH-12, DASH-13
**Success Criteria** (what must be TRUE):
  1. Opening the dashboard URL displays a live 3D SVI surface plot that re-renders within ~2 seconds of an `OracleSVIUpdated` event firing on testnet, and a newcomer connecting mid-session sees the current snapshot before live deltas (replay-on-connect works).
  2. The arbitrage-free checker UI shows green/red status with a visible g(k) plot (not just a boolean) when a violation occurs, sharing math with the Phase 1 SVI library.
  3. A user can connect their Sui wallet via dApp Kit, click deposit, sign a PTB, and see the resulting vault share + hedge position reflected in the position viewer with PnL attribution split (PLP yield / hedge cost / hedge payoff / net).
  4. Killing the WebSocket connection mid-recording produces an auto-reconnect with no white screen, no stale state, and the staleness indicator on every panel turns red when "last updated" exceeds 30s.
  5. The what-if simulator computes ±5σ joint spot+vol shocked PnL client-side using the shared TS SVI library — sliding the controls produces sub-100ms updates with no relay round-trip.
**Plans**: 7 plans
- [ ] 04-01-PLAN.md (Wave 0) — Monorepo scaffold: dashboard Vite+React+dApp Kit+Plotly+Recharts install, shadcn init (new-york/slate), provider stack (Pitfall 10), indexer pkg shell, vitest extension
- [ ] 04-02-PLAN.md (Wave 1) — Node.js relay: queryEvents 2s polling + per-stream cursor + decodeI64 (is_negative correction) + snapshot ring buffer 100/1h + ws server with replay-on-connect + healthz (DASH-01, DASH-02, DASH-03, DASH-13 server side)
- [ ] 04-03-PLAN.md (Wave 2) — Dashboard shell + WsClient (exp backoff + jitter) + useWebSocket state machine + StalenessPill + Header with ConnectButton (DASH-10, DASH-13 client side)
- [ ] 04-04-PLAN.md (Wave 3) — SurfacePanel (Plotly type=surface, useMemo+revision) + ArbCheckerPanel (full 200-point g(k) Recharts curve) (DASH-04, DASH-05)
- [ ] 04-05-PLAN.md (Wave 3) — VaultPanel + BucketGauge + ExposurePanel (Recharts 2D + Table) (DASH-06, DASH-07, DASH-08)
- [ ] 04-06-PLAN.md (Wave 4) — WhatIfSimulator: spot ±5σ + vol ±2σ sliders, client-side shockedPnL via Phase 1 binaryPrice (DASH-09)
- [ ] 04-07-PLAN.md (Wave 5) — DepositWithdrawPanel (3-step PTB flow) + PositionViewer (PnL split) + CI extension + Vercel/Render configs + DASH-13 demo checklist (DASH-11, DASH-12, DASH-13 e2e) [contains checkpoint]
**UI hint**: yes

### Phase 5: Testnet Demo Hardening + Mainnet-Readiness Toolkit
**Goal**: Testnet `deepvault` vault hardened to judge-presentable demo quality with a reproducible staged smoke test (dual ±10 bps NAV gate), and a complete mainnet-readiness toolkit (preflight + deploy + smoke-test scripts + predict-mainnet check + runbook) written and audited but NOT executed — ready to ship in 30 minutes when DeepBook Predict goes live on mainnet (post-submission, contingent on DeepVault winning or otherwise pursuing mainnet launch).
**Depends on**: Phase 4
**Requirements**: DEPLOY-01, DEPLOY-02, DEPLOY-03, DEPLOY-04, DEPLOY-09
**Reshape note (2026-05-13)**: Phase 5 was originally "Mainnet Redeploy + Smoke Test". Because DeepBook Predict mainnet is not expected to ship by 2026-06-09, executing a mainnet smoke test would degrade to a no-hedge supply/redeem cycle — a worse judge story than the full-PTB testnet demo. Phase 5 pivots to hardening the testnet demo and writing the mainnet toolkit for post-submission execution. See `.planning/phases/05-testnet-demo-hardening/05-CONTEXT.md` for full rationale; Phase 0 D-06/D-07 and PROJECT.md "Mainnet redeploy in v1 scope" decision are superseded.
**Success Criteria** (what must be TRUE):
  1. `./scripts/testnet-smoke-test.sh` runs green end-to-end: $50-equivalent DUSDC deposit → hedge mint → redeem-request → wait → redeem-fulfill → dual ±10 bps NAV verification (per-depositor return ratio ≥ 99.9% AND vault NAV drift ≤ 10 bps). Reproducible by judges via `make demo`.
  2. Mainnet-readiness toolkit (`scripts/preflight.sh`, `scripts/mainnet-deploy.sh`, `scripts/mainnet-smoke-test.sh` + `.ts`, `scripts/predict-mainnet-check.sh`) is written, lints clean (`bash -n` + `shellcheck` + `tsc --noEmit`), and runs cleanly against the current TBD state of `config/mainnet.toml`. Scripts intentionally exit non-zero today (Predict TBD); intended to be invoked post-submission when Predict mainnet ships.
  3. `docs/MAINNET-READINESS.md` (renamed from `MAINNET-FUNDING.md`) documents (a) why mainnet deploy is deferred to post-submission, (b) the ≤30-minute deploy procedure (preflight → deploy → smoke-test), (c) architecture's mainnet compatibility via single-config-flip in `config/mainnet.toml`, (d) the original $80 funding budget retained for post-submission execution.
  4. `[redemption].cooldown_ms` extension in `shared/strategy.toml` + codegen to Move/Python/TS bindings so the testnet smoke test reads cooldown from a single source-of-truth (no hardcoded waits).
  5. README hardened with testnet contract addresses, `make demo` reproducible-run target, one-paragraph laypitch + glossary, mainnet-readiness status, and Sui testnet explorer links for the vault.
**Plans**: 5 plans
- [x] 05-01-PLAN.md — Mainnet-Readiness Preflight + Predict-Mainnet Check: scripts/preflight.sh (write but don't execute) + scripts/predict-mainnet-check.sh (manual tool, no cron) — both lint-clean, dry-run-clean against current TBD state (Wave 1; DEPLOY-01)
- [x] 05-02-PLAN.md — Mainnet-Readiness Deploy + Smoke Test Toolkit: scripts/mainnet-deploy.sh + scripts/mainnet-smoke-test.sh + scripts/mainnet-smoke-test.ts + MAINNET-DEPLOY.json placeholder ({"status":"not_deployed","reason":"Predict mainnet pending"}); written but not executed (Wave 2; DEPLOY-02, DEPLOY-03)
- [x] 05-03-PLAN.md — Testnet Smoke Test Harness (judge-facing): scripts/testnet-smoke-test.sh + .ts forked from e2e-vault-cycle with staged checkpoints + dual ±10 bps NAV gate + STRATEGY_CONSTANTS.REDEMPTION_COOLDOWN_MS import (Wave 2; DEPLOY-04)
- [x] 05-04-PLAN.md — Strategy.toml Cooldown + Codegen Extension: [redemption].cooldown_ms = 3_600_000 + emit to Move/Python/TS (Wave 1; DEPLOY-04 enabler)
- [x] 05-05-PLAN.md — Mainnet-Readiness Docs + README Hardening + make demo: rename docs/MAINNET-FUNDING.md → docs/MAINNET-READINESS.md; document ≤30-min post-submission deploy procedure; README laypitch + testnet addresses + Phase 5 closure; wire `make demo` Makefile target to testnet-smoke-test.sh (Wave 3; DEPLOY-09)

### Phase 6: Submission Package
**Goal**: A polished Devpost submission package — demo video recorded against testnet (full PTB + Predict + Margin + vault hedge), README/architecture diagram/strategy whitepaper rendered, backtest report exported, all bundled by 2026-06-16.
**Depends on**: Phase 5
**Requirements**: DEPLOY-05, DEPLOY-06, DEPLOY-07, DEPLOY-08, DEPLOY-10
**Reshape note (2026-05-13)**: Demo target changed from mainnet → testnet per Phase 5 reshape (Predict mainnet not shipping in submission window). Demo video shows the full composability story on testnet; a brief mainnet-readiness sidebar (~10s) explains the post-submission deploy posture.
**Success Criteria** (what must be TRUE):
  1. A ~3 minute demo video recorded against the **testnet** vault shows a single PTB opening Margin + Predict + vault share atomically with wallet-diff visualization, and the tx digest is visible and pasteable into Sui testnet explorer. A ~10-second mainnet-readiness sidebar shows the `docs/MAINNET-READINESS.md` deploy procedure for post-submission.
  2. The README passes a cold-read test the day before submission — a judge with 10 minutes can run `make demo` reproducibly, and the one-paragraph laypitch + glossary + prerequisites are clear without prior context.
  3. The architecture diagram (PNG/SVG, GitHub-renderable) accurately depicts the four tiers (Move package, event relay, dashboard, Python backtest) with data flow arrows.
  4. The strategy whitepaper (Gatheral-style, 6-12 pages) covers SSVI math, hedge price formula, sizing policy bounds, liquidation-under-worst-case-Predict-outcome, and risk disclosures — citations to Gatheral & Jacquier 2014 included.
  5. The submission package is filed on Devpost / Sui Overflow portal by 2026-06-16, with testnet contract addresses, mainnet-readiness toolkit pointer, demo video link, repo URL, and backtest report PDF/HTML attached.
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 0 → 1 → 2 → 3 → 4 → 5 → 6.
Decimal phases (e.g., 2.1) reserved for urgent insertions and execute between their integers.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 0. Setup & Ground Rules | 8/8 | Complete-with-checkpoints | 2026-05-09 |
| 1. Math Foundation (SVI Parity Gate) | 6/8 | In progress | - |
| 2. Vault Move Package + Testnet Deploy | 0/9 | Not started | - |
| 3. Backtest Harness + Two-Protocol PTB | 4/9 | In Progress|  |
| 4. PLP Risk Studio Dashboard + Relay | 0/TBD | Not started | - |
| 5. Testnet Demo Hardening + Mainnet-Readiness Toolkit | 2/5 | In progress | - |
| 6. Submission Package | 0/TBD | Not started | - |

## Coverage

All 67 v1 requirements mapped to exactly one phase. No orphans, no duplicates.

| Category | Count | Phase |
|----------|-------|-------|
| SETUP-01..08 | 8 | Phase 0 |
| MATH-01..06 | 6 | Phase 1 |
| VAULT-01..11 | 11 | Phase 2 |
| BACK-01..10 | 10 | Phase 3 |
| PTB-01..06 | 6 | Phase 3 |
| DASH-01..13 | 13 | Phase 4 |
| DEPLOY-01..04, DEPLOY-09 | 5 | Phase 5 |
| DEPLOY-05..08, DEPLOY-10 | 5 | Phase 6 |
| **Total** | **64** | — |

Note: REQUIREMENTS.md counts 67 v1 items (the 8+6+11+10+6+13+10 = 64 matches the headline + 3 cross-track items recounted). Cross-check: SETUP=8, MATH=6, VAULT=11, BACK=10, PTB=6, DASH=13, DEPLOY=10. Total = 8+6+11+10+6+13+10 = 64. The "67" headline in REQUIREMENTS.md appears to be an off-by-three; this roadmap maps every actual checkbox in REQUIREMENTS.md and any reconciliation will be picked up in the traceability table update. **All 64 distinct REQ-IDs in REQUIREMENTS.md are mapped exactly once** — no orphans.

---
*Roadmap created: 2026-05-09*
*Phase ordering rationale: see `.planning/research/SUMMARY.md` §"Implications for Roadmap"*
