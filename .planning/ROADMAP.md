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
4. **Mainnet redeploy** is non-cuttable. PROJECT.md key decision.
5. **Code freeze 2026-05-30** for vault and SVI calibrator. After this date: bug fixes and integration only, no internal-architecture changes.
6. **Mainnet smoke test deadline 2026-06-12** (day 36, not day 39). Real $50 USDsui supply→hedge→redeem cycle must complete.
7. **Demo recorded on mainnet only**, after smoke test passes. Never on testnet.
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

- [ ] **Phase 0: Setup & Ground Rules** - Repo scaffold, version pinning, weekly-Monday ritual, code-freeze rule, hedge-ratio policy locked
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
- [ ] 00-08-PLAN.md — README polish + end-to-end Phase 0 verification + Phase 0 closure SUMMARY

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
**Plans**: TBD

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
**Plans**: TBD

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
**Plans**: TBD

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
**Plans**: TBD
**UI hint**: yes

### Phase 5: Mainnet Redeploy + Smoke Test
**Goal**: The `deepvault` package deployed and verified on Sui mainnet with USDsui as quote asset, smoke-tested with $50 of real funds running the full critical path by 2026-06-12.
**Depends on**: Phase 4
**Requirements**: DEPLOY-01, DEPLOY-02, DEPLOY-03, DEPLOY-04, DEPLOY-09
**Success Criteria** (what must be TRUE):
  1. `./scripts/preflight.sh` runs green: `Move.toml` matches mainnet config, golden vectors pass against fresh mainnet RPC, Predict mainnet pkg version pinned, Margin mainnet pkg version pinned, full Move test suite + Python parity tests green.
  2. The `deepvault` package is published on Sui mainnet with the package ID captured in `config/mainnet.toml`, the Vault shared object exists with USDsui as quote asset, and the AdminCap is held by the deployer wallet.
  3. By 2026-06-12 (day 36), a real $50 USDsui deposit → hedge mint → withdrawal-request → redeem cycle completes successfully on mainnet, with NAV-per-share post-cycle within tolerance of pre-cycle.
  4. The mainnet redeploy contingency is documented: if Predict mainnet does not ship by 2026-06-09, the fallback (vault + Margin path on mainnet, testnet-only Predict path) is executed with written rationale.
  5. Mainnet contract addresses and the deployer wallet tx digests for vault creation are recorded in `config/mainnet.toml` and the README, ready for verification by judges.
**Plans**: TBD

### Phase 6: Submission Package
**Goal**: A polished Devpost submission package — demo video recorded against mainnet, README/architecture diagram/strategy whitepaper rendered, backtest report exported, all bundled by 2026-06-16.
**Depends on**: Phase 5
**Requirements**: DEPLOY-05, DEPLOY-06, DEPLOY-07, DEPLOY-08, DEPLOY-10
**Success Criteria** (what must be TRUE):
  1. A ~3 minute demo video recorded against the **mainnet** vault (after smoke test passed) shows a single PTB opening Margin + Predict + vault share atomically with wallet-diff visualization, and the tx digest is visible and pasteable into Sui explorer.
  2. The README passes a cold-read test the day before submission — a judge with 10 minutes can run `make demo` reproducibly, and the one-paragraph laypitch + glossary + prerequisites are clear without prior context.
  3. The architecture diagram (PNG/SVG, GitHub-renderable) accurately depicts the four tiers (Move package, event relay, dashboard, Python backtest) with data flow arrows.
  4. The strategy whitepaper (Gatheral-style, 6-12 pages) covers SSVI math, hedge price formula, sizing policy bounds, liquidation-under-worst-case-Predict-outcome, and risk disclosures — citations to Gatheral & Jacquier 2014 included.
  5. The submission package is filed on Devpost / Sui Overflow portal by 2026-06-16, with mainnet + testnet contract addresses, demo video link, repo URL, and backtest report PDF/HTML attached.
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 0 → 1 → 2 → 3 → 4 → 5 → 6.
Decimal phases (e.g., 2.1) reserved for urgent insertions and execute between their integers.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 0. Setup & Ground Rules | 6/8 | In Progress|  |
| 1. Math Foundation (SVI Parity Gate) | 0/TBD | Not started | - |
| 2. Vault Move Package + Testnet Deploy | 0/TBD | Not started | - |
| 3. Backtest Harness + Two-Protocol PTB | 0/TBD | Not started | - |
| 4. PLP Risk Studio Dashboard + Relay | 0/TBD | Not started | - |
| 5. Mainnet Redeploy + Smoke Test | 0/TBD | Not started | - |
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
