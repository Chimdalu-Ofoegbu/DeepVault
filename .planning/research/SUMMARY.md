# Project Research Summary

**Project:** DeepVault — PLP+Hedge structured product on Sui DeepBook Predict
**Domain:** Composable on-chain structured-product vault (Sui Move + SVI volatility-surface dashboard + Python backtest)
**Researched:** 2026-05-08 / 2026-05-09
**Confidence:** MEDIUM-HIGH overall (HIGH on math/share-token/Move-vault patterns; MEDIUM on Predict-specific surface area, contracts 4 days old)

## Executive Summary

DeepVault is a single-curated structured-product vault that fuses DeepBook Predict PLP yield with SVI-priced binary tail-risk hedges, paired with an institutional-grade live volatility-surface dashboard and a handbook-required Python backtest. The 39-day solo build window targets a 2026-06-16 mainnet submission to the Sui Overflow 2026 DeepBook track. Across all four research streams the same conclusion appears: **math correctness is the load-bearing axis** — three-way semantic parity between Move, Python, and TypeScript SVI evaluators is the single most leveraged engineering investment, and every other quality decision (backtest credibility, dashboard authority, mainnet redeploy hygiene) is downstream of it.

The recommended approach is a tightly opinionated stack: Sui Move (`mainnet-v1.71.1` pinned) + DeepBookV3 `predict-testnet-4-16` branch on-chain; a Node.js indexer + React/Vite/Plotly/Recharts dashboard off-chain; and a Python (numpy/pandas/uv) backtest harness offline. **Choose SSVI over raw 5-parameter SVI** — closed-form butterfly-arbitrage conditions eliminate the #1 quant risk class. Phase ordering is non-negotiable: math foundation → vault Move → backtest + two-protocol PTB (Margin + Predict) → dashboard → mainnet redeploy → submission. Dashboard work cannot start until vault is feature-complete.

Dominant risks are domain-specific and concentrated: SVI butterfly-arbitrage violation silently mispricing hedges, lookahead bias in the backtest, first-deposit share-inflation attack, DeepBook Predict contract churn (testnet launched 2026-05-05 with explicit "may change before mainnet" warning), and mainnet redeploy config drift. Each has a documented prevention pattern. The 39-day budget allocates ~7-10 days to prevention; this is large but is dwarfed by the 3-5+ day disaster recovery cost of any single critical-class miss. Quality bar is explicit: math correctness > deploy hygiene > demo polish > composability breadth.

## Key Findings

### Recommended Stack

The stack is convergent across all three runtimes around a single principle: pin exact versions, share math constants from one TOML file, prefer the simplest correct path. See `.planning/research/STACK.md`.

**Core technologies:**
- **Sui CLI `mainnet-v1.71.1` (Move 2024 edition)** — pinned via `suiup` to avoid weekly protocol-version drift breaking `sui client publish`
- **DeepBookV3 `predict-testnet-4-16` branch** — pin by branch+rev in `Move.toml`, sweep every Monday for breaking changes
- **`@mysten/sui@2.16.0` + `@mysten/dapp-kit@1.0.4` + `@mysten/deepbook-v3@0.17.0`** — single canonical TS SDK; Margin Manager wrapper lives inside `@mysten/deepbook-v3` (no separate package exists)
- **Node.js indexer (NOT Rust)** — single-language TS monorepo saves ~1 day; `subscribeEvent` is deprecated, use `queryEvents` polling at 2s cadence with persisted cursor; JSON-RPC sunsets 2026-07-31 (~6 weeks after submission, safe)
- **Plotly 3D `surface` for SVI + Recharts for 2D panels** — Plotly's `type: 'surface'` is exactly the SVI shape; Three.js is a 2-3 week polish trap, rejected
- **Python 3.12 + numpy>=2.4 + pandas>=2.2 + scipy>=1.14, managed by `uv`** — `uv.lock` is the reproducibility floor for any backtest a judge will trust
- **Custom SVI in numpy (NOT QuantLib)** — Gatheral §2 is ~10 lines; QuantLib is a 30 MB packaging nightmare. The same evaluator is ported line-for-line to Move (`svi_view`) and TypeScript (`lib/svi.ts`)
- **CryptoDataDownload Binance OHLCV CSV** — free, no rate limit, full BTC history

**Critical version-compatibility flags:** `react-plotly.js@2.6.0` last published 2022 (wrapper looks abandoned, engine `plotly.js@3.5.1` is active) — have a 30-line `Plotly.newPlot()` fallback ready. DeepBook Margin SDK docs page returned 404 — plan to read SDK source directly.

### Expected Features

See `.planning/research/FEATURES.md`. Quality > component count is the explicit scoping principle.

**Must have (table stakes):**
- Move vault package (`vault::supply` / `vault::redeem` / `vault::rebalance`) with tokenized share (`Coin<VAULT_SHARE>`)
- PLP supply via `predict::supply` and SVI-priced hedge mint via `predict::mint`
- Hedge sell-back / roll handling near expiry
- Withdrawal queue with token-bucket limiter
- Two-protocol PTB opener (Margin borrow → Predict supply + hedge mint, atomic) — flagship composability moment
- Python backtest with 30+ days replay, lookahead-bias audit, drawdown report (handbook hard requirement)
- Live SVI surface plot from `OracleSVIUpdated` events + arbitrage-free checker
- Vault deposit/withdraw/position UI; testnet end-to-end flow; mainnet redeploy actually executed
- Demo video, README, architecture diagram, strategy whitepaper

**Should have (competitive):**
- Vault share usable as Margin collateral — pending whitelist verification
- Documented LTV math bounded against worst-case Predict outcome
- What-if ±5σ scenario simulator with joint spot+vol shock
- Per-oracle exposure panel + token-bucket gauge + utilization panel
- Exportable institutional-grade backtest report (PDF/HTML)
- One real $50 LP deposit on mainnet
- Wallet-diff visualization in demo video; reproducible `make demo` script

**Defer (v2+):**
- Iron Bank integration / three-protocol PTB (Brief Week-6 cut)
- Dynamic hedge sizing (Brief Week-8 cut)
- Time-travel slider, live drawdown widget, live Greeks panels, multi-asset, vault factory, solver/keeper, third-party audit, governance, cross-chain, mobile

### Architecture Approach

Three-tier system with strict trust boundaries. Off-chain dashboard trusts the relay only for liveness; the relay treats the fullnode as source of truth and never persists derived state; the Python backtest is offline. Composability happens via a single PTB: Margin `borrow_quote` → vault `supply::deposit` → vault `rebalance::buy_hedge_for_deposit` (calls `predict::mint`) — atomic rollback if any step fails. See `.planning/research/ARCHITECTURE.md`.

**Major components:**
1. **`deepvault::` Move package** — `vault` (shared object), `share` (TreasuryCap quarantined), `supply`/`redeem`/`rebalance` (stateless action modules), `svi_view` (read-only oracle math), `ltv` (pure math, ported to Python), `pause` (AdminCap, single key, non-transferable in v1)
2. **Off-chain event relay (Node.js)** — `queryEvents`-polling subscriber, in-memory snapshot store with disk-persisted cursor, WebSocket server with replay-on-connect for new dashboard clients
3. **React/Vite dashboard** — Plotly 3D SVI surface, Recharts 2D risk panels, what-if simulator (client-side TS SVI), dApp Kit for wallet + PTB execution
4. **Python backtest harness** — data ingest (BTC OHLCV + Deribit IV), SVI calibrator + arbitrage-free checker, vault state machine mirroring Move bit-for-bit, replay loop, lookahead-bias audit, institutional-grade report renderer
5. **Three-way semantic parity layer** — `shared/strategy.toml` generates Move + Python + TS constants; golden test vectors run on all three runtimes in CI; trace-replay parity test gates Move ↔ Python NAV/share equivalence within 1 wei

### Critical Pitfalls (Top 5, ranked)

See `.planning/research/PITFALLS.md` for the full 20-pitfall taxonomy.

1. **SVI butterfly-arbitrage violation silently mispricing binaries** — Use SSVI (3-parameter, closed-form) over raw 5-parameter SVI. Build the arbitrage-free checker BEFORE the binary pricer. ≥200 grid points across ±4σ; closed-form pre-check + grid scan + visible g(k) plot. Reproduce published Gatheral test cases within float tolerance.
2. **Lookahead bias in the backtest (judge-disqualifying)** — Assumption ledger as a markdown file; decision-bar/observation-bar split; SVI fit at decision time `t` uses only data ending strictly before `t`; walk-forward only; out-of-sample 30% held back; shuffled-label sanity test must produce ~zero alpha; manual hand-recompute on 3 trade rows. The "80% APY no drawdown" smell test is the brief's red line.
3. **First-deposit share-inflation attack** — Virtual shares + virtual assets (OpenZeppelin pattern, `decimals_offset` 10^6-10^9) ported to Move; deploy-time seed transaction with shares burned; vault accounting reads internal `total_assets` counter, NOT `balance::value(vault.balance)`; round-down in vault's favor on every operation.
4. **DeepBook Predict contract churn breaking the vault mid-build** — Weekly Monday version sweep is non-negotiable. Pin exact `published-at` in `Move.toml`. Thin `vault::predict_adapter` layer so a breaking change is contained to one file. Reserve 2 throwaway-budget days.
5. **TradeCap / capability leakage in PTB composability** — `TradeCap` stays inside the user's `BalanceManager`; `TreasuryCap<VAULT_SHARE>` lives inside the shared `Vault`, no permissionless mint surface. Audit ABI for `entry fun .* : .*Cap` patterns. Run Sui Prover on `vault::supply`/`redeem`/`rebalance`. Negative test in CI.

**Honorable mentions:** liquidation/LTV math wrong against worst-case Predict outcome; mainnet redeploy config drift; demo recorded against testnet but mainnet broken; dashboard yak-shaving before vault works.

## Implications for Roadmap

The architecture researcher proposed a six-phase ordering. Cross-checked against features dependencies and pitfalls phase mapping, the ordering holds with one modification: **Phase 0 (Setup) is split out as a discrete phase** because it owns load-bearing cross-cutting infrastructure (config-file scaffold, weekly-Monday-check ritual, code freeze date, refactor ground rules) that all later phases depend on. This produces a 7-phase roadmap.

### Phase 0: Setup & Ground Rules (days 1-2)
**Rationale:** Multiple critical pitfalls (mainnet config drift, Predict churn, refactor temptation, dashboard yak-shaving) are prevented by infrastructure and rituals established once at the start.
**Delivers:** `shared/strategy.toml` constants generator framework; `config/{testnet,mainnet}.toml` scaffold; weekly-Monday-check calendar entry + diff script; `Move.toml` pinned to exact `predict-testnet-4-16` rev; `predict_adapter` module skeleton; PROJECT.md hedge-ratio policy committed BEFORE backtest opens; code-freeze date (2026-05-30) and no-refactor-after-vault-ships rule documented
**Avoids:** Pitfalls 2, 6, 14, 18, 19

### Phase 1: Math Foundation — three-way SVI parity gate (days 3-8)
**Rationale:** Everything downstream depends on SVI evaluator. Three-way parity (Move + Python + TS) is the single highest-leverage engineering investment and is the gate that opens every other phase.
**Delivers:** SVI evaluator in Python audited against Gatheral & Jacquier 2014; SVI evaluator in Move (`deepvault::svi_view`); SVI evaluator in TS (`dashboard/lib/svi.ts`); 100+ golden vectors passing on all three; arbitrage-free checker (closed-form SSVI + ≥200-point g(k) grid + calendar-monotonicity test) with diagnostic visualization
**Uses:** Custom numpy SVI; SSVI (not raw); shared `strategy.toml` codegen
**Avoids:** Pitfalls 3, 10
**Gate:** All three implementations pass the same golden vectors. No further work until green.

### Phase 2: Vault Move package + testnet deploy (days 9-17)
**Rationale:** Core artifact, consuming Phase 1's `svi_view`. All vault security pitfalls concentrate here.
**Delivers:** `deepvault::vault` shared object + `share` module with TreasuryCap quarantine + `pause` with single-key AdminCap; `supply` with virtual-shares + deploy-time seed; `redeem_request`/`redeem_fulfill` with per-user token-bucket limiter; `rebalance::buy_hedge_for_deposit` with sell-back-near-expiry; `ltv::worst_case_haircut`; end-to-end testnet supply→hedge→redeem cycle scripted; Sui Prover spec on `supply`/`redeem`/`rebalance`
**Avoids:** Pitfalls 4, 5, 12, 13 entirely; mitigates Pitfall 6 via adapter

### Phase 3: Backtest harness + two-protocol PTB (days 18-24, parallel-ish tracks)
**Rationale:** Tracks share no critical state and can interleave. Track A consumes the now-stable Phase 2 vault and adds Margin integration; Track B consumes Phase 1's SVI evaluator and Phase 2's strategy logic.
**Delivers:**
- *Track A:* Margin BalanceManager + TradeCap setup; **VAULT_SHARE-as-Margin-collateral whitelist verification (day-1 task)**; two-protocol PTB end-to-end on testnet; capability-flow tests; liquidation simulation with -30% NAV shock property test
- *Track B:* Python `vault_state` mirroring Move; trace-replay JSON parity test (Move ↔ Python within 1 wei); 30+ days backtest across normal + trending + stress; lookahead-bias audit harness with `@strategy_fn(reads=..., writes=...)` decorators; fees/funding/slippage in PnL attribution; walk-forward + out-of-sample report
**Avoids:** Pitfalls 1, 2, 7, 8, 17
**Research flag:** Day-1 spike on Margin collateral whitelist policy. If whitelisted, demote VAULT_SHARE-as-collateral to documented-future-composability; demo PTB still works borrowing in C only.

### Phase 4: Dashboard + relay (days 25-32)
**Rationale:** Built fourth, AFTER vault is feature-complete and PTB works. Dashboard built against mocked data first; real WebSocket integration is the LAST dashboard task.
**Delivers:** Event relay service with `queryEvents` polling, persisted cursor, snapshot store, WebSocket server with replay-on-connect; Plotly 3D live SVI surface plot streamed end-to-end; VaultPanel + BucketGauge + ExposurePanel + ArbCheck (visible g(k) plot, not boolean); What-if simulator (client-side, joint spot+vol shock with documented σ + numeric shock magnitudes); dApp Kit deposit/withdraw flows; staleness indicators on every panel; WebSocket auto-reconnect tested by killing connection mid-recording
**Avoids:** Pitfalls 9, 10, 11, 19

### Phase 5: Mainnet redeploy + hardening (days 33-37)
**Rationale:** Discrete, ordered, scripted. Brief mandates "actually executed before submission, not just planned."
**Delivers:** Mainnet `Move.toml` swap; preflight script (asserts `Move.toml` matches mainnet config + golden vectors against fresh mainnet RPC + asserts pinned Predict mainnet pkg version + asserts pinned Margin mainnet pkg version + full Move test suite + Python parity tests); mainnet `deepvault` package publish with capture of pkg ID; Vault creation + AdminCap to deployer; **mainnet smoke test with $50 of real funds running the full critical path**; backtest report rendered to institutional PDF/HTML
**Avoids:** Pitfall 14
**Hard policy:** Mainnet smoke-tested by 2026-06-12 (day 36), not day 39.

### Phase 6: Submission package (days 38-39)
**Rationale:** Demo recording is a milestone AFTER mainnet smoke test. Documentation craft has disproportionate impact on judge perception (a16z + Bridge/Stripe + finance-leaning Mysten leadership).
**Delivers:** Demo video (~3 min) recorded against MAINNET vault, showing single PTB opening Margin + Predict + vault share atomically with wallet-diff visualization; tx digest visible and pasteable into Sui explorer; README with one-paragraph laypitch + glossary + prerequisites + reproducible-run script; architecture diagram (PNG/SVG, GitHub-renderable); strategy whitepaper (Gatheral-style, 6-12 pages, with SSVI math, hedge price formula, sizing policy bounds, Liquidation-under-worst-case-Predict-outcome section, risk disclosures); fresh-wallet PTB test; Devpost-style submission package
**Avoids:** Pitfalls 15, 16, 20
**Hard policy:** Cold-read of README the day before submission, like a judge with 10 min.

### Phase Ordering Rationale

- **Math first** because three-way SVI parity is the gate every other phase depends on; failure here invalidates vault, backtest, and dashboard simultaneously.
- **Vault second** because it consumes the math layer and produces the testnet artifact that backtest + PTB tracks both depend on.
- **Backtest + PTB parallel-ish third** because they consume the vault but share no critical state with each other; this is the only legitimate parallelism in a solo build.
- **Dashboard fourth** is non-negotiable per brief and PITFALLS Pitfall 19; building dashboard before vault works is the most common failure mode for this project class.
- **Mainnet fifth, submission sixth** with smoke-test → demo-record → document → submit ordering, never reversed.
- The PROJECT.md "quality bar over component count" decision is operationalized as the cut-latest order in ARCHITECTURE.md §9: drop what-if polish → per-oracle exposure panel → arbitrage-checker UI → sell-back-on-near-expiry → VAULT_SHARE-as-Margin-collateral live demo. Never cut: SVI parity, 30-day backtest with audit, mainnet redeploy, two-protocol PTB demo video.

### Research Flags

Phases likely needing deeper research during planning:

- **Phase 2 (Vault Move):** Exact `OracleSVIUpdated` event Move struct fields not in public docs — must inspect `oracle_svi.move` directly. Day-1 spike.
- **Phase 3 (PTB + Backtest):** DeepBook Margin collateral acceptance mechanism (whitelist vs. permissionless `Coin<T>`) is unverified. Day-1 spike: read `MarginRegistry` source. Margin Manager SDK docs page returned 404; plan to read SDK source at `@mysten/deepbook-v3` `src/transactions/margin/`. Predict mainnet launch ETA unknown — track weekly.
- **Phase 4 (Dashboard):** WebSocket reconnect storm behavior; relay snapshot-store memory profile; Plotly `revision` prop pattern vs. `<Plot>` for SVI surface perf if 50×50 grid drops below 60 fps.
- **Phase 5 (Mainnet):** Mainnet Predict launch timing + USDsui vs. dUSDC type-tag specifics + mainnet `predict-server.mainnet.mystenlabs.com` URL pattern. Verify each before redeploy script lands.

Phases with standard patterns (skip research-phase):

- **Phase 0 (Setup):** Pure scaffolding; well-documented patterns.
- **Phase 1 (Math):** Gatheral & Jacquier 2014 + open-source SVI implementations are canonical reference.
- **Phase 6 (Submission):** Standard hackathon pattern; Devpost video conventions are well-documented.

### Hard Policy Items (lock these in the roadmap)

1. **Hedge-ratio policy committed in PROJECT.md before Phase 1 closes** (Pitfall 2). Default: fixed-ratio v1, parameterized for future dynamic. Walk-forward validation only.
2. **Code freeze for vault & calibrator on 2026-05-30** (Phase 2 close + Phase 3 partial). After this date: bug fixes and integration only, no internal-architecture changes.
3. **Mainnet smoke test deadline: 2026-06-12** (day 36). Not 2026-06-15.
4. **Demo recorded on mainnet only, after smoke test passes.** Never on testnet.
5. **No dashboard work before vault feature-complete.** Phase 4 cannot start until Phase 2 is closed and Phase 3 Track A PTB is at least integration-tested.
6. **Weekly Monday Predict contract-version sweep is non-negotiable** through every phase. Halt feature work on any breaking change until adapter is fixed and integration suite is green.
7. **Three-way SVI parity gate is non-cuttable.** If the gate fails on day 8, slip the schedule; do not skip the gate.
8. **30-day backtest with lookahead audit is non-cuttable.** Handbook hard requirement.
9. **Two-protocol PTB demo video is non-cuttable.** Foundation-blessed composability story.
10. **Mainnet redeploy is non-cuttable.** PROJECT.md key decision.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Versions verified via npm + GitHub releases on 2026-05-08; Predict testnet contract IDs LOW-MEDIUM because Mysten warns "may change before mainnet." |
| Features | HIGH | Mapped against PROJECT.md + Sui docs + DeepBook Margin docs + Sui blog. Open gap: Sui Overflow 2026 handbook content not directly retrievable; PROJECT.md treated as authoritative. |
| Architecture | MEDIUM-HIGH | DeepBook Margin design HIGH from official docs; Predict mint API surface MEDIUM (testnet, may change); SVI math HIGH from Gatheral. VAULT_SHARE-as-Margin-collateral feasibility MEDIUM (whitelist policy unverified). |
| Pitfalls | HIGH | HIGH on backtest/SVI/share-token/Move-vault classes. MEDIUM on Predict-specific churn (contracts 4 days old) and hackathon-submission failure modes. |

**Overall confidence:** MEDIUM-HIGH. Build path, security perimeter, and quant math are well-understood; residual risk is concentrated in DeepBook Predict's pre-mainnet instability, mitigated structurally rather than eliminated.

### Gaps to Address

These are the open questions Phase 0 and Phase 1 must resolve before later phases can ship safely:

- **DeepBook Margin collateral whitelist policy.** Day-1 spike, Phase 3 Track A precondition. If Margin uses a registry whitelist, VAULT_SHARE-as-collateral demotes to documented-future; the demo still works.
- **`OracleSVIUpdated` Move event exact struct schema.** Day-1 read of `packages/predict/sources/oracle_svi.move`. Indexer parser depends on this; first breakage point on contract churn.
- **Predict mainnet launch timing.** Mysten committed to "later in 2026" with no ETA. Tracked weekly. Contingency: if mainnet does not ship by ~2026-06-09, mainnet redeploy degrades to "deploy what we can on mainnet (vault + Margin path) + testnet-only Predict path with documented reason"; PROJECT.md updated if risk materializes.
- **Sui Overflow 2026 handbook content.** Notion redirect did not return content. Phase 0 deliverable: re-fetch and reconcile against PROJECT.md's stated requirements.
- **`react-plotly.js` wrapper liveness.** Last published 2022. Phase 4 contingency: 30-line custom hook around `Plotly.newPlot()` if wrapper bites.
- **Predict mainnet contract addresses + USDsui type tag + mainnet `predict-server` URL.** All unknown. Phase 5 precondition; preflight script must assert each before deploy.
- **Predict event-payload trust model.** `OracleSVIUpdated` should be validated against known oracle authorities and bounded for sanity. Schema for "known authorities" needs Phase 1-2 spike.

## Sources

### Primary (HIGH confidence)
- `.planning/PROJECT.md` — scope, cut-lines, key decisions, constraints
- DeepBook Predict — Sui Documentation (`predict::supply`, `predict::mint`, OracleSVI, PLP shares, withdrawal limiter)
- DeepBook Margin Design — Sui Documentation (MarginManager wraps BalanceManager; liquidation thresholds 1.15/1.25)
- BalanceManager + TradeCap — Sui Documentation (capability flow)
- Programmable Transaction Blocks — Sui Documentation (atomicity, 1024 commands)
- Sui GitHub Releases (`mainnet-v1.71.1` May 6 2026, protocol version 123)
- @mysten/sui 2.16.0 / dapp-kit 1.0.4 / deepbook-v3 0.17.0 on npm
- Gatheral & Jacquier — Arbitrage-free SVI volatility surfaces (2014) — canonical reference
- Martini & Mingone — No arbitrage SVI (2020)
- eSSVI Implied Volatility Surface (PDF)
- Critical Bug Patterns in Sui Move (OpenZeppelin) — TradeCap, visibility, rounding
- Sui Prover (Mysten blog + open-source 2026-01-20)
- ERC-4626 Tokens in DeFi: Exchange Rate Manipulation Risks (OpenZeppelin) — share inflation
- Statistical Overfitting and Backtest Performance — Bailey et al., LBNL

### Secondary (MEDIUM confidence)
- Introducing DeepBook Predict — Sui Blog (third-primitive framing, mainnet "later in 2026")
- DeepBookV3 SDK — Sui Documentation (Margin Manager included)
- Volatility Surface API — FlashAlpha Research (institutional dashboard norms)
- Look-Ahead Bias In Backtests (Mike Harris)
- Survivorship Bias in Crypto Backtesting (CoinAPI)
- Vaultification of Everything — STFX (DOV feature norms)
- Backtest and Benchmarking — Gauntlet VaultBook (institutional report format)
- Auditing Vault-Based Protocols in DeFi (Cantina)
- JSON-RPC Sunset 2026-07-31 (CoinChapter)

### Tertiary (LOW confidence — needs validation)
- Sui Overflow 2026 Hackathon (overflow.sui.io) — handbook content not directly retrievable; reconcile in Phase 0
- Devpost demo video / submission norms — generic hackathon patterns; Sui Overflow specifics inferred
- Predict testnet contract addresses — pinned but expected to move; Monday sweep is the mitigation

---
*Research completed: 2026-05-09*
*Ready for roadmap: yes*
