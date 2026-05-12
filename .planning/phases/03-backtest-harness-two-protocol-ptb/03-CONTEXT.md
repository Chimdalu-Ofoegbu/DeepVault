# Phase 3: Backtest Harness + Two-Protocol PTB - Context

**Gathered:** 2026-05-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Two independent tracks complete in the same window. **Track A:** the flagship single-PTB demo `Margin::borrow_quote → vault::supply::deposit → vault::rebalance::buy_hedge_for_deposit` on testnet, with atomic rollback and capability-flow tests. **Track B:** a 365-day handbook-grade Python backtest with lookahead-bias audit, walk-forward methodology, Move↔Python trace-replay parity (within 1 wei), and an institutional-grade HTML report.

In scope: BTC OHLCV ingestion (CryptoDataDownload Binance, 365d hourly), Python `vault_state` machine mirroring Move semantics, action-trace JSON format (captured from live testnet via scripts/e2e-vault-cycle.ts), trace-replay parity test, lookahead-bias audit (assumption ledger + shuffled-label sanity test + 3-row hand recompute), walk-forward calibration (70/30 OOS holdout, no parameter tuning on OOS), PnL attribution columns (PLP yield / hedge cost / hedge payoff / fees / slippage / gas), drawdown calculator + Sharpe/Sortino, HTML institutional report with embedded Plotly + matplotlib charts, DeepBook Margin BalanceManager + TradeCap fixture, quote-only single-PTB demo (DUSDC borrow), VAULT_SHARE-as-collateral whitelist spike + mock-Margin-pool integration test, capability-flow tests, -30% NAV-shock liquidation simulation.

Out of scope: mainnet redeploy (Phase 5), dashboard live data + 3D SVI surface streaming (Phase 4), dynamic hedge sizing (v2 — STRAT-V2), VAULT_SHARE-collateral demo on testnet IF Margin whitelist isn't confirmed by Phase 4 cutover (documented-future instead), Deribit IV history (optional — skip if not freely available), strike/tenor/allocation re-tuning beyond walk-forward OOS validation (Phase 0 D-01..05 locked at deploy, frozen after Phase 3 closes).

</domain>

<decisions>
## Implementation Decisions

### Backtest Data Scope (BACK-01, BACK-05)

- **D-01: 365 days hourly BTC OHLCV from CryptoDataDownload Binance.** ~8,760 bars. Sufficient for 70/30 walk-forward with two distinct regimes in train and at least one in OOS. Hourly resolution is appropriate for daily-rebalance strategies; minute bars would only matter for HFT. Stored as parquet via pyarrow.
- **D-02: Feature two stress events in the report:** (1) August 5 2024 yen-carry unwind (BTC −15% intraday, clean tail event, demonstrates hedge payoff fires when needed), and (2) one 2024–2025 high-vol episode picked at backtest time (Q1 2025 selloff or a 2026 vol event within the 365-day window). At least one stress event in OOS holdout.
- **D-03: Out-of-sample split is the most recent 30% of the window (~110 days).** Held back during all calibration. Final report shows in-sample vs OOS side-by-side per PITFALLS Pitfall 2.
- **D-04: Walk-forward cadence = monthly.** Calibrate on month N (training data ≤ N-1), deploy on month N+1, never look at N+1 during calibration. Walk-forward stats are reported, not whole-sample stats. Mirrors PITFALLS Pitfall 2 mitigation #2.

### Lookahead-Bias Audit (BACK-06)

- **D-05: Assumption ledger lives at `.planning/backtest-assumptions.md`** (markdown, checked in). Every dataset's "available-at" timestamp is documented; every join condition uses `available_at <= decision_time`. Read-first for the planner.
- **D-06: Shuffled-label sanity test must produce |alpha| ≤ 0.5% APY** to pass. Anything above that flag-blocks the backtest run and surfaces a leak.
- **D-07: Hand recompute on 3 random trade rows.** Each picked via `np.random.choice` with a checked-in seed; computed in a Jupyter notebook stored under `backtest/notebooks/hand-recompute.ipynb`; numbers must match the harness output to the wei.
- **D-08: `@strategy_fn(reads=..., writes=...)` decorator enforces the decision-bar / observation-bar split** (BACK-03). The decorator raises if the function reads a column not declared in `reads`, or writes to one not in `writes`. SVI surface used at decision time `t` is the fit produced from data ending strictly before `t` (PITFALLS Pitfall 1 mitigation #4).

### PnL Attribution (BACK-08, BACK-09)

- **D-09: PnL attribution columns:** `plp_yield_bps`, `hedge_cost_bps`, `hedge_payoff_bps`, `fees_bps`, `slippage_bps`, `gas_bps`. Six columns sum to total return per bar. PLP yield comes from Predict's per-block accrual; hedge cost = sum of premiums paid; hedge payoff = sum of binary settlements; fees = strategy-level (none in v1 per Phase 2 D-13 but reserved); slippage = next-bar VWAP minus next-bar open (BACK-08 pessimistic fills); gas = SUI gas at testnet prices.
- **D-10: Drawdown calculator + Sharpe + Sortino computed on OOS only** (BACK-09). Max drawdown reports the underwater duration AND the depth. Sharpe annualized using 8,760 bars/year; risk-free = 0 (hackathon convention, documented).
- **D-11: Equity curve, drawdown waterfall, regime histogram, per-trade table, IV surface evolution** are all in the HTML report. The cold-read test requires charts that explain the strategy without narration.

### Report Format & Inventory (BACK-10)

- **D-12: HTML standalone file** as the deliverable. Single self-contained file with embedded Plotly charts (SVI surface 3D snapshot, equity curve, drawdown timeline) and matplotlib charts as inline PNG (PnL distribution histogram, regime heatmap). PDF export deferred — wire only if a judge specifically requests; not on the critical path.
- **D-13: Report sections (in order):** (1) Executive summary with headline numbers; (2) Assumption ledger (read from `.planning/backtest-assumptions.md`); (3) Strategy description (10% allocation, −15% OTM, 14d tenor, single SVI-priced hedge per supply); (4) Data ledger (window, source, gaps); (5) Walk-forward methodology + OOS results; (6) PnL attribution (six columns); (7) Drawdown + risk metrics; (8) Stress event narrative (Aug 5 2024 + the second event); (9) Sensitivity table (Sharpe across hedge ratio = {0.05, 0.10, 0.15, 0.20, 0.30}); (10) Shuffled-label sanity test result; (11) Hand recompute appendix.

### Trace-Replay Parity (BACK-02, BACK-04)

- **D-14: Python `vault_state` machine mirrors Move semantics bit-for-bit** by consuming `backtest/src/deepvault/strategy_constants.py` (codegen'd from `shared/strategy.toml`). Same virtual-shares math, same NAV formula, same worst-case haircut, same token-bucket. Parity proven via D-15 trace replay.
- **D-15: Full-cycle trace: supply → hedge mint → roll (clock-warped) → redeem_request → redeem_fulfill.** Reuses Plan 02-09's `scripts/e2e-vault-cycle.ts` to drive the on-chain side; captures every Move tx effect (input args + emitted events + balance deltas) as a JSON action trace at `backtest/traces/cycle-full.json`. Python `vault_state.replay(trace)` reproduces the same NAV/share state at every checkpoint within 1 wei.
- **D-16: Trace generation is live testnet, not synthetic.** No hand-authored fixtures. The trace is captured from a real `e2e-vault-cycle.ts` run; reviewers can re-run the capture and verify the trace matches their independent NAV computation.

### Two-Protocol PTB Demo Path (PTB-01..06)

- **D-17: Demo PTB borrows DUSDC, not VAULT_SHARE.** Single PTB shape: `Margin::borrow_quote<DUSDC>(balance_manager, trade_cap, amount, ctx) → vault::supply::supply<DUSDC>(vault, predict_manager, oracle, clock, deposit, ctx) → vault::rebalance::buy_hedge_for_deposit<DUSDC>(...)` — atomic rollback on any step failing. This is the default path; VAULT_SHARE-as-collateral upgrade happens only if Margin whitelists VAULT_SHARE before Phase 4 cutover.

  **D-17 AMENDMENT (Wave 0 spike result, 2026-05-12):** The literal 3-call shape above (`Margin::borrow_quote → vault::supply::deposit → vault::rebalance::buy_hedge_for_deposit`) does NOT compile. Two empirical findings (verified against vendored DeepBookV3 SHA `1159d79af33c70e09e406310e1d8f067832ede9d`): (i) `margin_manager::borrow_quote` returns void — it auto-deposits the borrowed Coin via `self.deposit_int<BaseAsset, QuoteAsset, QuoteAsset>(coin, ctx)` at `margin_manager.move:625`. (ii) `rebalance::buy_hedge_for_deposit` is `public(package)` at `rebalance.move:219` — unreachable from a PTB outside the deepvault package. The verified shape is **5 calls** with an explicit `Margin::withdraw` bridge to extract the borrowed Coin, and NO separate top-level rebalance call (supply.move:89-97 invokes rebalance internally; atomicity preserved by Move tx semantics). Full shape + rationale + source citations: see [WAVE0-DECISION.md](./WAVE0-DECISION.md). All downstream artifacts (whitepaper, demo video script, `scripts/two-protocol-ptb-demo.ts`) MUST use the 5-call shape.
- **D-18: VAULT_SHARE-as-Margin-collateral fallback policy:** ship quote-only demo first; treat whitelist as bonus. PTB-02 spike runs in parallel with the demo build. If Margin governance confirms whitelist mid-Phase-3 or early Phase 4, hot-upgrade the demo to use VAULT_SHARE collateral. If whitelist is not confirmed by Phase 4 cutover, the "share is collateralizable" property becomes a documented-future claim with three artifacts: PROJECT.md scope section update, whitepaper/submission deck explicit slide, and an integration test against a **mock Margin pool** proving architectural readiness.
- **D-19: TradeCap lives inside the user's `BalanceManager` and never escapes.** Mint path: `Margin::create_balance_manager(ctx) → bm`, then `bm.create_trade_cap(ctx) → cap`, then `bm.deposit(cap)`. All Margin entry points take `&mut BalanceManager` and re-borrow the TradeCap internally. Capability-flow test asserts no public function in the demo exposes TradeCap as a return value (grep test, mirrors Phase 2's capability_containment grep).
- **D-20: −30% NAV-shock liquidation property test (PTB-05).** Test scenario: supply 1000 DUSDC, buy hedge at SVI fair value, then simulate Predict resolution where the binary expires worthless AND vault collateral drops 30% (manually inflate position size via test-only helper). Assert Margin liquidation path triggers correctly; assert `worst_case_nav_per_share` from `ltv.move` matches Python `vault_state.worst_case_nav()` within 1 wei.

### Claude's Discretion

The following are chosen by me (builder) — recorded so downstream agents don't re-ask.

- **Backtest workspace layout:** `backtest/src/deepvault/` already has `svi.py`, `phi.py`, `isqrt.py`, `ln.py`, `arb_checker.py`, `parity_runner.py`, `phi_coefficients.py`, `strategy_constants.py` (Phase 1 output). Phase 3 adds: `vault_state.py` (the state machine), `replay.py` (the trace replayer + `@strategy_fn` decorator), `data_ingest.py` (CryptoDataDownload CSV fetcher → parquet), `walk_forward.py` (calibration loop), `lookahead_audit.py` (shuffled-label test + hand-recompute helpers), `pnl_attribution.py` (the six-column accountant), `report.py` (HTML generator). Tests: `backtest/tests/test_vault_state.py`, `test_replay_parity.py`, `test_lookahead_audit.py`, `test_walk_forward.py`. ≤ 250 lines per module target.
- **Action-trace JSON schema:** `{ "vault_id": "0x...", "package_id": "0x...", "actions": [{ "kind": "supply" | "hedge_mint" | "roll" | "redeem_request" | "redeem_fulfill", "tx_digest": "...", "ts_ms": <u64>, "args": {...}, "effects": { "balance_delta": <i128>, "shares_delta": <i128>, "events": [...] } }] }`. Each action records pre-state and post-state. Python `vault_state.replay(action)` asserts post-state matches.
- **PTB demo location:** `scripts/two-protocol-ptb-demo.ts` (separate from Phase 2's `e2e-vault-cycle.ts`). Drives Margin SDK (`@mysten/deepbook-v3` 0.17.0+) + the existing vault SDK. Per CLAUDE.md "Margin Manager SDK is included in `@mysten/deepbook-v3`"; verify in Plan 1.
- **Capability-flow test location:** `contracts/tests/ptb_capability_test.move` — Move-side asserts; pairs with `backtest/tests/test_ptb_capability_grep.py` for the cross-language grep-CI gate (mirrors Phase 2 capability_containment.sh pattern).
- **Mock Margin pool:** lives at `contracts/tests/mock_margin_pool.move` (test-only module). Implements the minimal Margin trait surface needed to prove VAULT_SHARE collateral semantics: `register_collateral_type<T>`, `borrow_quote_against_collateral`, `liquidate_position`. Used by the integration test in D-18's documented-future path.
- **Hedge ratio sensitivity table:** report shows {0.05, 0.10, 0.15, 0.20, 0.30}. The robust strategy is FLAT across this range; an overfit one peaks. Per PITFALLS Pitfall 2, the v1 ratio (0.10) is preserved regardless of which produces the highest Sharpe — no retrospective re-tuning.
- **Stress event narrative:** for each featured event, the report shows (a) BTC price chart with the event marked, (b) vault NAV-per-share around the event, (c) hedge payoff realized vs expected, (d) drawdown chart with the event marked. Side-by-side framing makes the hedge's protective value visible.
- **CI cost budget:** Python tests run in the existing `py-test.yml` job (or `ci.yml` python job — verify in Plan 1). Full 365-day backtest is too slow for per-push CI — runs in a nightly variant `nightly-backtest.yml` that publishes the HTML report as a workflow artifact. Per-push CI only exercises `vault_state.replay()` against a 7-day micro-fixture for fast parity assertion.
- **No Deribit IV history.** BACK-01 lists it as "if available" — skipping. Reviewers asking "why not Deribit?" get a 1-line answer in the assumption ledger: "free Deribit IV history is fragmented post-2022; CryptoDataDownload Binance gives us a single clean source." Adding Deribit is a v2 nice-to-have.
- **Report cold-read test:** writeup is reviewable by an institutional LP who has never seen DeepVault. Each chart has a caption explaining what it shows and why it matters. The strategy description in section 3 doesn't reference Phase numbers or our internal architecture — it reads as if the reader is a hedge fund analyst evaluating a third-party product.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents (researcher, planner, executor) MUST read these before planning or implementing.**

### Project context
- `.planning/PROJECT.md` — scope, core value, cut-lines, key decisions, constraints (especially the "institutional-LP grade backtest credibility" framing)
- `.planning/REQUIREMENTS.md` §"Backtest" and §"Composability (two-protocol path)" — BACK-01..10 and PTB-01..06
- `.planning/ROADMAP.md` §"Phase 3" — goal, depends_on Phase 2, success criteria
- `.planning/STATE.md` — current position
- `.planning/phases/00-setup-ground-rules/00-CONTEXT.md` — **D-01..D-05 hedge-policy LOCK** (10% / −15% / 14d / parameterized / re-tune only here on OOS walk-forward then freeze)
- `.planning/phases/01-math-foundation-svi-parity-gate/01-CONTEXT.md` — SVI evaluator IO contract, three-runtime parity gate, `arb_checker` semantics (vault.rebalance refuses to mint if g(k) < 0)
- `.planning/phases/02-vault-move-package-testnet-deploy/02-CONTEXT.md` — vault module layout, `Vault<Quote>` struct, event surface, atomic supply+hedge PTB pattern (D-06)
- `.planning/phases/02-vault-move-package-testnet-deploy/02-SUMMARY.md` chain (02-03 through 02-09) — what shipped, what's available to call

### Research outputs (read before planning)
- `.planning/research/ARCHITECTURE.md` §"OFFLINE — PYTHON BACKTEST TIER" (data ingest / SVI replay / vault simulator / report exporter)
- `.planning/research/ARCHITECTURE.md` §"4. Two-Protocol PTB — atomic flow" — the PTB TypeScript shape
- `.planning/research/ARCHITECTURE.md` §"3. Tokenized Vault Share — design" — and the **whitelist policy critical-path-risk note**
- `.planning/research/PITFALLS.md` §"Pitfall 1: Lookahead bias" — assumption ledger, decision-bar/observation-bar split, shuffled-label sanity test, hand recompute, walk-forward, 80% APY smell test (load-bearing for BACK-06)
- `.planning/research/PITFALLS.md` §"Pitfall 2: Hindsight-tuned hedge ratio" — sensitivity table, OOS holdback, no retrospective tuning (load-bearing for BACK-07)
- `.planning/research/PITFALLS.md` §"Pitfall 6: DeepBook Predict contract churn" — relevant because PTB-03 calls predict::mint
- `.planning/research/STACK.md` — Python 3.12+, numpy 2.4+, pandas 2.2+, scipy 1.14+, pyarrow 18+, matplotlib 3.9+, pytest 8.3+; uv only; @mysten/deepbook-v3 0.17.0 for Margin Manager
- `.planning/research/FEATURES.md` — overall feature matrix

### Repository artifacts the plan touches
- `contracts/sources/vault.move`, `supply.move`, `redeem.move`, `rebalance.move`, `ltv.move` — Phase 2 outputs the PTB demo calls into
- `contracts/sources/predict_adapter.move` — Phase 2 thin wrapper consumed by rebalance
- `contracts/sources/strategy_constants.move` + `backtest/src/deepvault/strategy_constants.py` + `dashboard/src/lib/strategy_constants.ts` — codegen'd; consumed by Python `vault_state` and TS PTB demo
- `backtest/src/deepvault/svi.py`, `phi.py`, `isqrt.py`, `ln.py`, `arb_checker.py`, `parity_runner.py` — Phase 1 outputs the vault_state machine consumes
- `backtest/pyproject.toml` — Python deps; verify pinned versions match research/STACK.md
- `shared/strategy.toml` — single source of truth; Phase 3 does NOT modify the hedge_policy block (D-01..D-05 locked at Phase 0)
- `scripts/e2e-vault-cycle.ts` — Phase 2 Plan 02-09 output; Phase 3 trace generator extends this with effect-dump JSON output
- `.github/workflows/ci.yml` — Phase 0 5-job matrix; Phase 3 ADDS a `nightly-backtest.yml` workflow (separate file, NOT in ci.yml)

### External docs (referenced inline by research)
- DeepBook Margin docs: https://docs.sui.io/onchain-finance/deepbook-margin/ (Margin BalanceManager + TradeCap pattern)
- Margin Manager TS SDK: `@mysten/deepbook-v3` 0.17.0+ npm
- CryptoDataDownload Binance: https://www.cryptodatadownload.com/data/binance/ (BTC OHLCV CSV)
- Gatheral & Jacquier "Arbitrage-free SVI volatility surfaces" 2014 (referenced for SSVI calibration if walk-forward needs re-fitting)
- OpenZeppelin ERC-4626 inflation attack writeup (referenced for vault_state's seed accounting)

### Optional / deferred
- Deribit options history — skipped per D-15 in Claude's Discretion (free history is fragmented post-2022)

</canonical_refs>

<specifics>
## Specific Ideas

- **365-day hourly BTC window** featuring two stress events (Aug 5 2024 yen-carry unwind + a 2024–2025 high-vol episode picked at runtime). Hourly bars. 70/30 walk-forward split with OOS holdback never touched during calibration.
- **HTML institutional report** with 11 sections, embedded Plotly + inline PNG matplotlib charts. Single self-contained file. Cold-read test mandatory.
- **Full-cycle trace-replay parity**: live testnet PTB run captures `cycle-full.json`; Python `vault_state.replay()` matches within 1 wei at every checkpoint.
- **Quote-only single PTB demo** (DUSDC borrow → vault::supply → hedge mint) ships day-1. VAULT_SHARE-as-collateral is bonus; mock-Margin-pool integration test proves architectural readiness regardless.
- **`@strategy_fn(reads=..., writes=...)` decorator** is the load-bearing mechanism for the decision-bar / observation-bar split. The decorator raises if reads/writes are not declared up-front.
- **Sensitivity table** in the report shows Sharpe across hedge ratio {0.05, 0.10, 0.15, 0.20, 0.30}. No retrospective re-tuning — v1 keeps 0.10 even if a different ratio shows higher in-sample Sharpe.
- **Shuffled-label sanity test** must produce |alpha| ≤ 0.5% APY to pass. Anything higher blocks the backtest run.
- **Hand recompute** on 3 randomly-sampled trade rows in a Jupyter notebook stored under `backtest/notebooks/hand-recompute.ipynb`.
- **−30% NAV shock liquidation property test** asserts `ltv.worst_case_nav_per_share` (Move) and `vault_state.worst_case_nav()` (Python) match within 1 wei under the same shocked vault state.
- **No Deribit IV history** — single clean source from CryptoDataDownload Binance.

</specifics>

<deferred>
## Deferred Ideas

- **Deribit IV history ingestion** — BACK-01 says "if available"; skipped. Future v2 phase could add for richer IV surface calibration.
- **PDF report export** — HTML primary; PDF only on explicit submission request via `--export-pdf` flag (post-submission backlog).
- **Dynamic hedge sizing** — v1 ships fixed 10% allocation per Phase 0 D-04. STRAT-V2 territory.
- **VAULT_SHARE-as-Margin-collateral LIVE demo** — gated on Mysten governance whitelist; documented-future if not confirmed by Phase 4 cutover.
- **Per-second hedge re-mark in Python** — `vault_state.nav_per_share()` matches Move's per-block snapshot; sub-block intrabar marks are a v2 backtest-fidelity question.
- **What-if simulator backend** — Phase 4 dashboard owns it (client-side Plotly + SVI math in TS). Phase 3 ships the math/state, not the simulator.
- **Minute-bar resolution** — current scope is hourly. Minute bars only matter for HFT; v2 if needed.
- **365+ day history** — current scope is 365 days. Beyond that, free CryptoDataDownload Binance CSV becomes patchy pre-Binance-launch (Jul 2017); skip until needed.
- **Multi-asset backtest (ETH, SOL hedges)** — Phase 3 is BTC-only. v2 STRAT-V2-03 expansion.

</deferred>

---

*Phase: 03-backtest-harness-two-protocol-ptb*
*Context gathered: 2026-05-11 via /gsd-discuss-phase*
