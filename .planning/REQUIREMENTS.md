# Requirements: DeepVault

**Defined:** 2026-05-09
**Core Value:** A working PLP+Hedge vault on DeepBook Predict with a credible, auditable risk dashboard, deployed on mainnet by 2026-06-16. Quality of vault math, backtest, and dashboard polish takes priority over component count.

## v1 Requirements

Requirements for the Sui Overflow 2026 submission (target 2026-06-16). Each maps to one roadmap phase.

### Setup & Ground Rules

- [x] **SETUP-01**: Repository scaffolded as TypeScript monorepo (`contracts/`, `indexer/`, `dashboard/`, `backtest/`, `shared/`) with `uv` for Python and `pnpm` for TS workspaces
- [x] **SETUP-02**: `Move.toml` pins DeepBookV3 `predict-testnet-4-16` branch by exact rev; Sui CLI pinned to `mainnet-v1.71.1` via `suiup`
- [x] **SETUP-03**: `shared/strategy.toml` (single source of truth for SVI parameters, hedge ratio policy, token-bucket capacity, decimals offset) with codegen to Move + Python + TypeScript constants
- [x] **SETUP-04**: `config/{testnet,mainnet}.toml` scaffold with all contract addresses, RPC URLs, type tags
- [x] **SETUP-05**: Weekly Monday Predict contract-version diff script (`scripts/predict-diff.sh`) plus calendar reminder; halts feature work on breaking change
- [x] **SETUP-06**: Hedge-ratio policy committed in writing (default: fixed-ratio v1, parameterized for future dynamic) before backtest opens — locks against hindsight tuning
- [x] **SETUP-07**: Code-freeze date (2026-05-30) and no-refactor-after-vault-ships rule documented in `CONTRIBUTING.md`
- [x] **SETUP-08**: GitHub Actions CI running Move test suite + TypeScript Vitest + Python pytest + golden-vector parity check on every push

### Math Foundation (SVI)

- [x] **MATH-01**: Python SSVI evaluator (3-parameter, closed-form) audited against Gatheral & Jacquier 2014 published test cases
- [x] **MATH-02**: Move `deepvault::svi_view` SSVI evaluator producing identical output to Python on 100+ golden vectors (within 1 wei tolerance)
- [x] **MATH-03**: TypeScript `dashboard/lib/svi.ts` SSVI evaluator producing identical output to Python on the same 100+ golden vectors
- [x] **MATH-04**: Arbitrage-free checker with closed-form SSVI butterfly check + ≥200-point g(k) grid scan + calendar-monotonicity test, with diagnostic visualization (visible g(k) plot, not boolean)
- [x] **MATH-05**: Three-way parity gate enforced in CI — failing the gate blocks any further phase work
- [x] **MATH-06**: Theoretical binary-price function derived from SVI parameters at target strike (powers vault hedge pricing AND backtest)

### Vault Move Package

- [x] **VAULT-01**: `deepvault::vault` shared object with internal `total_assets` counter, hedge-position registry, and pause flag
- [x] **VAULT-02**: `deepvault::share` module with TreasuryCap quarantined inside the shared Vault (no external mint surface) — issues `Coin<VAULT_SHARE>` standard fungible coin
- [ ] **VAULT-03**: `vault::supply` with virtual-shares + virtual-assets pattern (`decimals_offset` 10^6+) and deploy-time seed transaction (shares burned to dead address) preventing first-deposit inflation attack
- [ ] **VAULT-04**: `vault::redeem_request` + `vault::redeem_fulfill` two-step flow with per-user token-bucket withdrawal limiter
- [ ] **VAULT-05**: `vault::rebalance::buy_hedge_for_deposit` purchases binary OTM hedge via `predict::mint` at theoretical SSVI price, with sell-back / roll near expiry
- [ ] **VAULT-06**: `vault::ltv::worst_case_haircut` view function returning worst-case-NAV-per-share against any open Predict outcome (consumed by Margin liquidation path)
- [x] **VAULT-07**: `vault::predict_adapter` thin wrapper over Predict ABI — single-file blast radius for contract churn refactors
- [ ] **VAULT-08**: AdminCap (single-key, non-transferable in v1) for emergency pause and oracle-staleness override
- [ ] **VAULT-09**: Move test suite ≥85% line coverage on supply/redeem/rebalance + property tests for round-down-in-vault-favor invariant
- [ ] **VAULT-10**: Sui Prover spec on `supply`, `redeem`, `rebalance` (inflation-safety, share-NAV monotonicity, capability containment)
- [ ] **VAULT-11**: End-to-end testnet supply→hedge→redeem cycle scripted and passing in CI

### Backtest Harness (Handbook-Required)

- [ ] **BACK-01**: BTC OHLCV data ingestion from CryptoDataDownload Binance (≥30 days hourly, ideally 90+); Deribit IV history if available
- [ ] **BACK-02**: Python `vault_state` machine mirroring Move semantics bit-for-bit (consumes `strategy.toml` codegen for parameter parity)
- [ ] **BACK-03**: Replay loop with `@strategy_fn(reads=..., writes=...)` decorator enforcing decision-bar / observation-bar split (no future data leaks into past decisions)
- [ ] **BACK-04**: Trace-replay parity test: same input trace produces identical NAV/share state in Move (testnet PTB sequence) and Python (within 1 wei)
- [ ] **BACK-05**: 30+ days of replayed history across normal markets, trending markets, and at least one stress event (-3σ+ BTC move)
- [ ] **BACK-06**: Lookahead-bias audit harness — assumption ledger as a markdown file, shuffled-label sanity test (must produce ~zero alpha), manual hand-recompute on 3 randomly-sampled trade rows
- [ ] **BACK-07**: Walk-forward methodology only; out-of-sample 30% of history held back; no parameter tuning on the held-back set
- [ ] **BACK-08**: PnL attribution including fees, funding, slippage; separate columns for PLP yield, hedge cost, hedge payoff
- [ ] **BACK-09**: Drawdown calculator + max-drawdown report; Sharpe and Sortino on out-of-sample
- [ ] **BACK-10**: Exportable institutional-grade report (HTML or PDF) with assumption ledger, charts, and tables — passes the cold-read test

### Composability — Two-Protocol PTB

- [ ] **PTB-01**: DeepBook Margin BalanceManager + TradeCap setup with TradeCap retained inside user's BalanceManager (capability never leaks)
- [ ] **PTB-02**: VAULT_SHARE-as-Margin-collateral whitelist verification spike completed; if whitelisted, register and demo; if not, demote to documented-future and demo borrows quote-only — decision recorded with date
- [ ] **PTB-03**: Single PTB opener: `Margin::borrow_quote` → `vault::supply::deposit` → `vault::rebalance::buy_hedge_for_deposit`, atomic rollback on any failure
- [ ] **PTB-04**: Capability-flow tests proving TradeCap and TreasuryCap<VAULT_SHARE> never escape their owners
- [ ] **PTB-05**: Liquidation simulation property test: -30% NAV shock against worst-case Predict outcome triggers Margin liquidation path correctly
- [ ] **PTB-06**: Fresh-wallet end-to-end test on testnet showing the full PTB completing with deterministic tx digest

### PLP Risk Studio Dashboard

- [ ] **DASH-01**: Node.js event relay service polling Sui RPC `queryEvents` at 2s cadence with disk-persisted cursor and graceful reconnect
- [ ] **DASH-02**: WebSocket server with replay-on-connect (last N events) for dashboard clients
- [ ] **DASH-03**: In-memory snapshot store reflecting current vault state, latest SVI parameters, oracle exposure breakdown
- [ ] **DASH-04**: Live 3D SVI surface plot (Plotly `type: 'surface'`) re-rendered on each `OracleSVIUpdated` event, with strike (X) × expiry (Y) × IV (Z) axes
- [ ] **DASH-05**: Arbitrage-free checker UI panel — green/red status PLUS visible g(k) plot showing the actual constraint violation when red
- [ ] **DASH-06**: VaultPanel showing utilization, total assets, share price, fee accruals
- [ ] **DASH-07**: BucketGauge showing per-user withdrawal-limiter token-bucket state
- [ ] **DASH-08**: ExposurePanel breaking down hedge book by oracle / strike / expiry
- [ ] **DASH-09**: What-if simulator: PLP+hedge PnL under joint spot+vol shocks (±5σ on spot, ±2σ on vol), client-side TS computation using shared SVI lib
- [ ] **DASH-10**: Staleness indicator on every panel — "last updated Xs ago" with red flag at >30s
- [ ] **DASH-11**: Vault deposit/withdraw flow via dApp Kit (wallet connect → PTB sign → tx confirmation)
- [ ] **DASH-12**: Position viewer with PnL attribution per user (PLP yield, hedge cost, hedge payoff, net)
- [ ] **DASH-13**: WebSocket auto-reconnect tested by killing connection mid-recording — no white screen, no stale state

### Mainnet Deploy & Submission

- [ ] **DEPLOY-01**: Mainnet preflight script asserts `Move.toml` matches mainnet config, golden vectors pass against fresh mainnet RPC, Predict mainnet pkg version pinned, Margin mainnet pkg version pinned, full Move test suite + Python parity tests green
- [ ] **DEPLOY-02**: `deepvault` Move package published on Sui mainnet; package ID captured in `config/mainnet.toml`
- [ ] **DEPLOY-03**: Vault shared object created on mainnet with USDsui as quote asset; AdminCap held by deployer wallet
- [ ] **DEPLOY-04**: Mainnet smoke test: real $50 USDsui deposit → hedge mint → withdrawal-request → redeem cycle completes successfully (deadline 2026-06-12)
- [ ] **DEPLOY-05**: Demo video (~3 min) recorded against MAINNET vault showing the single PTB opening Margin + Predict + vault share atomically, with wallet-diff visualization and tx digest visible
- [ ] **DEPLOY-06**: README with one-paragraph laypitch, glossary, prerequisites, reproducible-run script (`make demo`); cold-read tested
- [ ] **DEPLOY-07**: Architecture diagram (PNG/SVG, GitHub-renderable) showing all components and data flow
- [ ] **DEPLOY-08**: Strategy whitepaper (Gatheral-style, 6-12 pages): SSVI math, hedge price formula, sizing policy bounds, liquidation-under-worst-case-Predict-outcome section, risk disclosures
- [ ] **DEPLOY-09**: Mainnet redeploy contingency documented — if Predict mainnet does not ship by 2026-06-09, fallback to "vault + Margin path on mainnet, testnet-only Predict path" with written rationale
- [ ] **DEPLOY-10**: Submission package complete on Devpost / Sui Overflow portal by 2026-06-16

## v2 Requirements

Acknowledged but deferred to post-submission release.

### Strategy

- **STRAT-V2-01**: Dynamic hedge sizing function based on vault utilization, realized vol, time-to-expiry, current SVI shape (replaces fixed ratio)
- **STRAT-V2-02**: Live delta/gamma/vega panels for the binary book
- **STRAT-V2-03**: Multi-asset support beyond BTC (ETH, SOL on Predict)

### Composability

- **COMP-V2-01**: Iron Bank integration (third protocol) for full PLP-yield-on-leveraged-collateral loop
- **COMP-V2-02**: Permissionless vault factory / curator framework
- **COMP-V2-03**: Solver/keeper infrastructure for automated hedge rebalancing

### Dashboard

- **DASH-V2-01**: Time-travel slider on the SVI surface plot (replay last hour of events)
- **DASH-V2-02**: Historical drawdown replay as live dashboard widget
- **DASH-V2-03**: Mobile-responsive layout

### Audit & Governance

- **AUDIT-V2-01**: Third-party security audit (CertiK / OtterSec / Zellic)
- **GOV-V2-01**: Governance token + parameter governance flow

## Out of Scope

Explicitly excluded from v1 to prevent scope creep under deadline pressure.

| Feature | Reason |
|---------|--------|
| Iron Bank integration / three-protocol PTB | Brief Week-6 cut; highest-risk integration on a 39-day solo timeline. Two-protocol PTB still lands the composability moment. |
| Dynamic hedge sizing function | Brief Week-8 cut. Correct fixed ratio > buggy dynamic under time pressure. Sizing is parameterized for v2 swap. |
| Time-travel slider on SVI surface | Brief Week-10 cut. Live plot is the high-leverage piece. |
| Live drawdown replay widget | Backtest output ships as static institutional report; live widget is polish. |
| Live delta/gamma/vega panels | Backtest + arbitrage-free checker carry the "is this safe?" story. |
| Multi-asset (ETH, SOL) at v1 | Brief targets BTC for SVI/backtest; expanding asset universe is post-submission. |
| Permissionless vault factory / curator framework | DeepVault is a single curated strategy at v1, not a factory. |
| Solver/keeper for hedge rebalancing | Manual + on-chain `vault::rebalance` is enough for the demo. |
| OAuth login / KYC flow | Wallet-native; users connect Sui wallet directly. |
| Real-time chat / community features | Not relevant to a structured-product vault. |
| Mobile app | Web-first; mobile is post-submission polish. |
| Cross-chain bridging | Sui-native is the foundation-aligned story. |
| ML overlay on hedge sizing | Statistical overfitting risk far outweighs marginal alpha on a 30-day backtest. |
| Third-party audit | Out of scope for hackathon timeline; documented as v2. |
| Governance token | DeepVault v1 is admin-paused; governance is a post-PMF question. |

## Traceability

Phase mapping finalized by gsd-roadmapper on 2026-05-09 against ROADMAP.md. Every v1 REQ-ID maps to exactly one phase. No orphans, no duplicates.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SETUP-01 | Phase 0 | Complete |
| SETUP-02 | Phase 0 | Complete |
| SETUP-03 | Phase 0 | Complete |
| SETUP-04 | Phase 0 | Complete |
| SETUP-05 | Phase 0 | Complete |
| SETUP-06 | Phase 0 | Complete (00-06) |
| SETUP-07 | Phase 0 | Complete (00-06) |
| SETUP-08 | Phase 0 | Complete (00-07 artifacts + 00-08 closure; Task 4 branch-protection awaits human action — recipe in 00-07-SUMMARY.md Resume Signal) |
| MATH-01 | Phase 1 | Complete |
| MATH-02 | Phase 1 | Complete |
| MATH-03 | Phase 1 | Complete |
| MATH-04 | Phase 1 | Complete |
| MATH-05 | Phase 1 | Complete |
| MATH-06 | Phase 1 | Complete |
| VAULT-01 | Phase 2 | Done |
| VAULT-02 | Phase 2 | Done |
| VAULT-03 | Phase 2 | Pending |
| VAULT-04 | Phase 2 | Pending |
| VAULT-05 | Phase 2 | Pending |
| VAULT-06 | Phase 2 | Pending |
| VAULT-07 | Phase 2 | Done |
| VAULT-08 | Phase 2 | Pending |
| VAULT-09 | Phase 2 | Pending |
| VAULT-10 | Phase 2 | Pending |
| VAULT-11 | Phase 2 | Pending |
| BACK-01 | Phase 3 | Pending |
| BACK-02 | Phase 3 | Pending |
| BACK-03 | Phase 3 | Pending |
| BACK-04 | Phase 3 | Pending |
| BACK-05 | Phase 3 | Pending |
| BACK-06 | Phase 3 | Pending |
| BACK-07 | Phase 3 | Pending |
| BACK-08 | Phase 3 | Pending |
| BACK-09 | Phase 3 | Pending |
| BACK-10 | Phase 3 | Pending |
| PTB-01 | Phase 3 | Pending |
| PTB-02 | Phase 3 | Pending |
| PTB-03 | Phase 3 | Pending |
| PTB-04 | Phase 3 | Pending |
| PTB-05 | Phase 3 | Pending |
| PTB-06 | Phase 3 | Pending |
| DASH-01 | Phase 4 | Pending |
| DASH-02 | Phase 4 | Pending |
| DASH-03 | Phase 4 | Pending |
| DASH-04 | Phase 4 | Pending |
| DASH-05 | Phase 4 | Pending |
| DASH-06 | Phase 4 | Pending |
| DASH-07 | Phase 4 | Pending |
| DASH-08 | Phase 4 | Pending |
| DASH-09 | Phase 4 | Pending |
| DASH-10 | Phase 4 | Pending |
| DASH-11 | Phase 4 | Pending |
| DASH-12 | Phase 4 | Pending |
| DASH-13 | Phase 4 | Pending |
| DEPLOY-01 | Phase 5 | Pending |
| DEPLOY-02 | Phase 5 | Pending |
| DEPLOY-03 | Phase 5 | Pending |
| DEPLOY-04 | Phase 5 | Pending |
| DEPLOY-05 | Phase 6 | Pending |
| DEPLOY-06 | Phase 6 | Pending |
| DEPLOY-07 | Phase 6 | Pending |
| DEPLOY-08 | Phase 6 | Pending |
| DEPLOY-09 | Phase 5 | Pending |
| DEPLOY-10 | Phase 6 | Pending |

**Coverage:**
- v1 requirements (distinct REQ-IDs counted from category checkboxes): 64 total (SETUP=8, MATH=6, VAULT=11, BACK=10, PTB=6, DASH=13, DEPLOY=10)
- Mapped to phases: 64
- Unmapped: 0
- Duplicates: 0

> Note: The previous draft cited "67 v1 requirements." Recount of distinct REQ-IDs in this file totals **64**. The discrepancy was an early-draft tally error; the 64 count above is authoritative and matches every checkbox in this file.

**Phase distribution:**

| Phase | Count | REQ-IDs |
|-------|-------|---------|
| Phase 0 | 8 | SETUP-01..08 |
| Phase 1 | 6 | MATH-01..06 |
| Phase 2 | 11 | VAULT-01..11 |
| Phase 3 | 16 | BACK-01..10, PTB-01..06 |
| Phase 4 | 13 | DASH-01..13 |
| Phase 5 | 5 | DEPLOY-01..04, DEPLOY-09 |
| Phase 6 | 5 | DEPLOY-05..08, DEPLOY-10 |
| **Total** | **64** | — |

---
*Requirements defined: 2026-05-09*
*Last updated: 2026-05-09 — traceability finalized by gsd-roadmapper; 64 v1 REQ-IDs mapped across Phases 0-6*
