# Phase 3: Backtest Harness + Two-Protocol PTB - Research

**Researched:** 2026-05-11
**Domain:** Dual-track — (A) DeepBook Margin + Predict atomic PTB demo on Sui testnet, (B) Python 365-day backtest with lookahead audit + Move↔Python state-machine parity
**Confidence:** HIGH on Move/SDK surface (verified empirically from vendored DeepBookV3 SHA `1159d79a` source); HIGH on backtest patterns (canonical Python quant idioms + Phase 1 prior art); MEDIUM on testnet Margin pool availability for DUSDC (no public registry entry verified; pool likely must be created in spike or stubbed via mock pool)

## Summary

Phase 3 ships two independent artifacts in the same window. **Track A** wires a four-step PTB on testnet — `Margin::new` (once, setup) → `Margin::deposit` (collateral) → `Margin::borrow_quote` (debt) → `Margin::withdraw` (extract Coin) → `vault::supply::supply` (atomic deposit + hedge mint per Phase 2 D-06) — with capability-flow tests and a mock-Margin-pool integration test that proves architectural readiness for VAULT_SHARE-as-collateral if/when Mysten whitelists it. **Track B** delivers a handbook-grade Python harness: BTC OHLCV ingest from CryptoDataDownload Binance, a `vault_state` machine that mirrors Move semantics bit-for-bit, a trace-replay parity test against the live `e2e-vault-cycle.ts` output, a lookahead-bias audit (assumption ledger + shuffled-label test + 3-row hand recompute + `@strategy_fn` decorator), walk-forward calibration on 70/30 OOS holdout, six-column PnL attribution, and an 11-section HTML institutional report.

**The single most consequential research finding:** Phase 2's `vault::supply::supply` already takes `Coin<Quote>` as input (supply.move:67). `Margin::borrow_quote` does NOT return `Coin<QuoteAsset>` to the caller — it auto-deposits the borrowed coin into the MarginManager's internal BalanceManager (margin_manager.move:625 `self.deposit_int<...>(coin, ctx)`). Therefore the PTB shape in CONTEXT.md D-17 is **incomplete** — it cannot be a direct three-call chain. The correct shape inserts `Margin::withdraw` between `borrow_quote` and `vault::supply::supply` to extract the freshly borrowed funds as a free `Coin<DUSDC>`. This re-route is the most load-bearing finding in this research and the planner must absorb it before drafting PTB-03.

**Primary recommendation:** Lock the PTB shape early (Wave 0 spike, before any TypeScript code is written), confirm DUSDC margin pool existence on testnet, and write the mock Margin pool in Move first (test-only module) so Track A's property tests (PTB-04, PTB-05) compile against a stable interface before live testnet integration. Track B can proceed in parallel because it shares no critical state with Track A — both feed into the final HTML report from independent test rigs.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Backtest Data Scope (BACK-01, BACK-05)**
- **D-01:** 365 days hourly BTC OHLCV from CryptoDataDownload Binance. ~8,760 bars. 70/30 walk-forward split with two regimes in train + one in OOS. Stored as parquet via pyarrow.
- **D-02:** Two stress events featured: (1) Aug 5 2024 yen-carry unwind (BTC −15% intraday), (2) one 2024–2025 high-vol episode picked at backtest time. At least one stress event in OOS holdout.
- **D-03:** OOS = most recent 30% of the window (~110 days). Held back during all calibration. Final report shows in-sample vs OOS side-by-side.
- **D-04:** Walk-forward cadence = monthly. Calibrate on month N (training data ≤ N-1), deploy on month N+1, never look at N+1 during calibration. Walk-forward stats reported, not whole-sample stats.

**Lookahead-Bias Audit (BACK-06)**
- **D-05:** Assumption ledger at `.planning/backtest-assumptions.md`. Every dataset's available-at timestamp documented; every join condition uses `available_at <= decision_time`.
- **D-06:** Shuffled-label sanity test must produce |alpha| ≤ 0.5% APY to pass. Anything above blocks the backtest run.
- **D-07:** Hand recompute on 3 random trade rows (np.random.choice + checked-in seed), in `backtest/notebooks/hand-recompute.ipynb`. Numbers must match harness output to the wei.
- **D-08:** `@strategy_fn(reads=..., writes=...)` decorator enforces decision-bar / observation-bar split. The decorator raises if function reads a column not declared in `reads` or writes one not in `writes`. SVI surface at decision time t is fit from data ending strictly before t.

**PnL Attribution (BACK-08, BACK-09)**
- **D-09:** PnL columns: `plp_yield_bps`, `hedge_cost_bps`, `hedge_payoff_bps`, `fees_bps`, `slippage_bps`, `gas_bps`. Six columns sum to total return per bar.
- **D-10:** Drawdown + Sharpe + Sortino on OOS only. Max drawdown reports underwater duration AND depth. Sharpe annualized using 8,760 bars/year; risk-free = 0.
- **D-11:** Equity curve, drawdown waterfall, regime histogram, per-trade table, IV surface evolution all in HTML report. Cold-read test: charts explain strategy without narration.

**Report Format & Inventory (BACK-10)**
- **D-12:** HTML standalone file as the deliverable. Embedded Plotly + matplotlib inline PNG. PDF export deferred.
- **D-13:** Report sections (11): (1) Executive summary; (2) Assumption ledger; (3) Strategy description (10% allocation, −15% OTM, 14d tenor); (4) Data ledger; (5) Walk-forward methodology + OOS results; (6) PnL attribution; (7) Drawdown + risk metrics; (8) Stress event narrative; (9) Sensitivity table {0.05, 0.10, 0.15, 0.20, 0.30}; (10) Shuffled-label sanity test result; (11) Hand recompute appendix.

**Trace-Replay Parity (BACK-02, BACK-04)**
- **D-14:** Python `vault_state` machine mirrors Move semantics bit-for-bit by consuming `backtest/src/deepvault/strategy_constants.py`.
- **D-15:** Full-cycle trace: supply → hedge mint → roll (clock-warped) → redeem_request → redeem_fulfill. Reuses `scripts/e2e-vault-cycle.ts`. JSON action trace at `backtest/traces/cycle-full.json`. Python `vault_state.replay(trace)` reproduces the same NAV/share state at every checkpoint within 1 wei.
- **D-16:** Trace generation is live testnet, not synthetic. Reviewers can re-run and verify.

**Two-Protocol PTB Demo Path (PTB-01..06)**
- **D-17:** Demo PTB borrows DUSDC, not VAULT_SHARE. PTB shape: `Margin::borrow_quote<DUSDC>(...) → vault::supply::supply<DUSDC>(...) → vault::rebalance::buy_hedge_for_deposit<DUSDC>(...)` — atomic. [**RESEARCH FINDING — see Standard Stack §Track A PTB shape: the literal shape in D-17 is non-compilable. `Margin::borrow_quote` auto-deposits into the BalanceManager and returns nothing; the planner MUST insert a `Margin::withdraw` step to extract a free Coin.**]
- **D-18:** VAULT_SHARE-as-Margin-collateral fallback: ship quote-only first; if Margin whitelists VAULT_SHARE mid-Phase-3, hot-upgrade. Otherwise three artifacts: PROJECT.md scope update + whitepaper slide + mock-Margin-pool integration test proving architectural readiness.
- **D-19:** TradeCap lives inside MarginManager and never escapes. Capability-flow test asserts no public function exposes TradeCap as a return value (grep test).
- **D-20:** −30% NAV-shock liquidation property test (PTB-05). Supply 1000 DUSDC → buy hedge at SVI fair value → simulate Predict resolution where binary expires worthless AND vault collateral drops 30%. Assert Margin liquidation path triggers; assert `worst_case_nav_per_share` (Move) matches `vault_state.worst_case_nav()` (Python) within 1 wei.

### Claude's Discretion

- **Backtest workspace layout:** Phase 3 adds `vault_state.py`, `replay.py` (state machine + `@strategy_fn` decorator), `data_ingest.py`, `walk_forward.py`, `lookahead_audit.py`, `pnl_attribution.py`, `report.py`. Tests: `test_vault_state.py`, `test_replay_parity.py`, `test_lookahead_audit.py`, `test_walk_forward.py`. ≤ 250 lines per module target.
- **Action-trace JSON schema:** `{ "vault_id": "0x...", "package_id": "0x...", "actions": [{ "kind": "supply" | "hedge_mint" | "roll" | "redeem_request" | "redeem_fulfill", "tx_digest": "...", "ts_ms": <u64>, "args": {...}, "effects": { "balance_delta": <i128>, "shares_delta": <i128>, "events": [...] } }] }`. Each action records pre-state and post-state.
- **PTB demo location:** `scripts/two-protocol-ptb-demo.ts` (separate from Phase 2's `e2e-vault-cycle.ts`).
- **Capability-flow test location:** `contracts/tests/ptb_capability_test.move` + `backtest/tests/test_ptb_capability_grep.py` for cross-language grep-CI gate.
- **Mock Margin pool:** `contracts/tests/mock_margin_pool.move` (test-only module). Implements `register_collateral_type<T>`, `borrow_quote_against_collateral`, `liquidate_position`.
- **Sensitivity table:** {0.05, 0.10, 0.15, 0.20, 0.30}. v1 ratio (0.10) preserved regardless of which produces highest Sharpe — no retrospective re-tuning.
- **Stress event narrative:** Each featured event shows (a) BTC price chart with event marked, (b) vault NAV-per-share around the event, (c) hedge payoff realized vs expected, (d) drawdown chart with event marked.
- **CI cost budget:** Python tests in existing python job. Full 365-day backtest in nightly `nightly-backtest.yml`, HTML report as workflow artifact. Per-push CI exercises `vault_state.replay()` against a 7-day micro-fixture for fast parity.
- **No Deribit IV history.** BACK-01 lists "if available"; skipping. 1-line answer in assumption ledger.
- **Report cold-read test:** Reviewable by an institutional LP. Each chart has a caption.

### Deferred Ideas (OUT OF SCOPE)

- **Deribit IV history ingestion** — BACK-01 "if available"; skipped.
- **PDF report export** — HTML primary; PDF only on explicit submission request.
- **Dynamic hedge sizing** — v1 ships fixed 10%. STRAT-V2 territory.
- **VAULT_SHARE-as-Margin-collateral LIVE demo** — gated on Mysten whitelist; documented-future if not confirmed.
- **Per-second hedge re-mark in Python** — matches Move's per-block snapshot. v2 backtest-fidelity.
- **What-if simulator backend** — Phase 4 dashboard owns it.
- **Minute-bar resolution** — Phase 3 hourly; minute-bar v2.
- **365+ day history** — current scope is 365 days.
- **Multi-asset backtest (ETH, SOL)** — BTC-only at v1.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BACK-01 | BTC OHLCV data ingestion (≥30 days hourly, ideally 90+) | §"Code Examples" — CryptoDataDownload URL pattern `https://www.cryptodatadownload.com/cdd/Binance_BTCUSDT_1h.csv` confirmed via direct fetch; canonical CSV header `Unix,Date,Symbol,Open,High,Low,Close,Volume BTC,Volume USDT,tradecount`. Parquet via pyarrow already in `backtest/pyproject.toml`. |
| BACK-02 | Python `vault_state` machine mirroring Move semantics bit-for-bit | §"Architecture Patterns" — Pattern 2 mirrors Phase 1 parity_runner.py: shared constants from codegen + Python class that re-implements Move state transitions. Move source-of-truth identified for every accessor (vault.move, supply.move, redeem.move, rebalance.move, ltv.move). |
| BACK-03 | Replay loop with `@strategy_fn(reads=..., writes=...)` decorator | §"Code Examples" — Pattern 6 (decorator + DataFrame view-wrapping). Reference implementations: pandera column contracts, vectorbt walk-forward. |
| BACK-04 | Trace-replay parity test: Move ↔ Python within 1 wei | §"Architecture Patterns" — Pattern 3 builds on Phase 1's parity_runner.py exact-equality at 1 unit / 1e9 tolerance (parity_runner.py:54). Action-trace JSON schema from CONTEXT.md Claude's Discretion. |
| BACK-05 | 30+ days replayed history across normal + trending + stress | Covered by D-01 365d window + D-02 two-stress-event selection. |
| BACK-06 | Lookahead-bias audit harness | §"Common Pitfalls" Pitfall 1 (PITFALLS.md). Mitigations 1-8 mapped to D-05..D-08. Shuffled-label test: assert \|alpha\| ≤ 0.5% APY (D-06). |
| BACK-07 | Walk-forward methodology; OOS 30% held back; no tuning on OOS | §"Standard Stack" — sklearn `TimeSeriesSplit` is the canonical primitive but DOES NOT enforce the no-tuning rule by itself. Pattern: hand-rolled monthly rolling window over `TimeSeriesSplit`-derived indices; parameter sweep wrapped in a no-write guard. |
| BACK-08 | PnL attribution: PLP yield, hedge cost, hedge payoff, fees, slippage, gas | §"Don't Hand-Roll" + §"Code Examples" — six columns enumerated in D-09; per-column derivation specified below. |
| BACK-09 | Drawdown + max-drawdown report; Sharpe and Sortino on OOS | §"Standard Stack" — numpy + pandas built-ins (`cummax`, `min` over running max — 5 lines each). QuantStats library NOT recommended (over-kill, opinionated). |
| BACK-10 | Exportable institutional-grade HTML report | §"Standard Stack" — Jinja2 3.1.6 + Plotly fig.to_html(include_plotlyjs='inline') + matplotlib base64 PNG embed. 11 sections per D-13. |
| PTB-01 | DeepBook Margin BalanceManager + TradeCap setup with cap retained inside MarginManager | §"Code Examples" — `margin_manager::new<Base, Quote>` (margin_manager.move:324) creates a shared MarginManager that wraps BalanceManager + TradeCap as private fields. No public accessor returns TradeCap by value. |
| PTB-02 | VAULT_SHARE-as-Margin-collateral whitelist verification spike | §"Common Pitfalls" + §"Code Examples" — `margin_registry::register_deepbook_pool<Base, Quote>` (margin_registry.move:232) is the registration entry; MaintainerCap-gated. VAULT_SHARE has no MaintainerCap holder; whitelist requires Mysten governance action. The spike reads `MarginRegistry.pool_registry` Table via RPC to confirm current state and produces a dated decision. |
| PTB-03 | Single PTB: Margin::borrow_quote → vault::supply::deposit → vault::rebalance::buy_hedge_for_deposit | §"Architecture Patterns" Pattern 1 — load-bearing finding: requires intermediate `Margin::withdraw` to extract borrowed Coin. The five-call PTB is documented inline. |
| PTB-04 | Capability-flow tests proving TradeCap + TreasuryCap never escape | §"Common Pitfalls" — Pitfall 5 grep pattern from Phase 2's capability_containment lives in `.github/workflows/ci.yml`. Phase 3 extends with a Move test that adversarially tries to extract via every public path. |
| PTB-05 | Liquidation simulation property test: −30% NAV shock | §"Code Examples" — Move test pattern uses `vault::test_mint_shares_to` (Plan 02-08 helper) + `clock::set_for_testing` + direct manipulation of `vault.balance` via Plan 02-05 helpers `inflate_liquid_for_testing` / `drain_liquid_for_testing`. Mock Margin pool registers VAULT_SHARE as collateral, calls `liquidate_position`, asserts `worst_case_nav_per_share` matches Python. |
| PTB-06 | Fresh-wallet end-to-end testnet PTB with deterministic tx digest | §"Architecture Patterns" — extension of Phase 2's `scripts/e2e-vault-cycle.ts` pattern. New file `scripts/two-protocol-ptb-demo.ts` drives a fresh `Ed25519Keypair.fromSecretKey()` keypair through the five-step PTB. |

</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| BTC OHLCV ingestion + parquet caching | Python backtest | — | Pure offline data ingest; one-time per backtest run; idempotent cache eliminates re-download. |
| `vault_state` state machine | Python backtest | — | Off-chain twin of Move semantics; consumes codegen constants. Does NOT touch chain. |
| Action-trace generation | TS scripts | Move (settlement) | `scripts/two-protocol-ptb-demo.ts` drives the testnet PTBs; receives tx digests + event payloads back from RPC; serializes to JSON. The PTBs themselves are the Move-tier action. |
| Trace replay + parity assertion | Python backtest | — | Reads the JSON trace; replays through `vault_state`; asserts post-state equality at every checkpoint. Bit-equal at 1 unit / 1e9. |
| Lookahead-audit (`@strategy_fn` decorator) | Python backtest | — | Pure Python machinery; static analysis at function-call time. |
| Walk-forward calibration loop | Python backtest | — | Monthly rolling-window iteration; sensitivity table emission. |
| PnL attribution accountant | Python backtest | — | Six-column ledger; reads from trace + market data; pure pandas. |
| HTML report generation | Python backtest | — | Jinja2 template + Plotly + matplotlib. Output is a single static `report.html`. |
| Two-protocol PTB demo (5 moveCalls) | Sui Move (API) | TS scripts (caller) | Move modules are the authority; TS is the conductor. Atomic rollback owned by Move tx semantics. |
| TradeCap discipline | Sui Move | — | TradeCap is a Move type with explicit visibility rules; only Move can enforce containment. |
| Mock Margin pool | Sui Move (test-only) | — | `#[test_only]` module in `contracts/tests/`. Production code never sees it; CI does. |
| −30% NAV-shock liquidation test | Sui Move (test) | Python (assertion) | Move test simulates the shock + invokes `worst_case_nav_per_share`. Python parallel computes `vault_state.worst_case_nav()` and the test runner cross-asserts. |
| CI per-push (fast) | GitHub Actions | Move + Python | 7-day micro-fixture replay + Move integration_test --filter (already exists from Phase 2). |
| CI nightly (full) | GitHub Actions | Python | New `nightly-backtest.yml` runs 365-day backtest + uploads HTML report artifact. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@mysten/sui` | `2.16.0` | PTB Transaction builder, BCS, RPC client | Verified pinned in CLAUDE.md + already in use by Phase 2's `e2e-vault-cycle.ts`. Required for `tx.sharedObjectRef`, `tx.moveCall`, `tx.splitCoins`, signing. `[CITED: scripts/e2e-vault-cycle.ts:33]` |
| `@mysten/deepbook-v3` | `≥0.17.0` (latest 1.3.6 per npm registry) | DeepBook Margin Manager + MarginPool SDK | The Margin Manager TS wrapper lives here. CLAUDE.md pins 0.17.0; npm registry shows 1.3.6 latest. **`[VERIFIED: npm registry returned latest=1.3.6]`** — Plan 03-01 spike must decide between 0.17.0 (CLAUDE.md pin, conservative) and 1.3.6 (latest, may have breaking changes). Recommendation: install 0.17.0 first; only upgrade if 0.17.0 lacks `MarginPoolContract.borrow_quote` builder. |
| Python | `≥3.12` | Backtest runtime | Already pinned in `backtest/pyproject.toml`. `[VERIFIED: backtest/pyproject.toml:9]` |
| `numpy` | `≥2.4` | Vectorized math, PnL accounting | Already pinned. |
| `pandas` | `≥2.2` | DataFrame operations, time-series joins, decision-bar/observation-bar split | Already pinned. First version with full numpy 2 compat. |
| `pyarrow` | `≥18` | Parquet OHLCV cache | Already pinned. Sui-native + pandas-native — parquet read happens via `pd.read_parquet(path)`. |
| `matplotlib` | `≥3.9` | Static PNG charts in HTML report (PnL distribution histogram, regime heatmap) | Already pinned. Renders cleaner static figures than Plotly for report inserts. |
| `pytest` | `≥8.3` | Test runner for Track B parity + lookahead audit | Already pinned. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `plotly` | `≥5.20` (latest 5.26 series) | Interactive 3D SVI snapshot in HTML report + equity curve + drawdown timeline | **NEW Phase 3 dependency.** Add to `backtest/pyproject.toml`. Output via `fig.to_html(include_plotlyjs='inline')` to keep report standalone offline. `[CITED: plotly.io.to_html docs]` |
| `jinja2` | `3.1.6` | HTML report template engine | **NEW Phase 3 dependency.** Pure-Python, zero compiled deps, ubiquitous in financial reporting. Last release 2025-03-05 per pypi.org. `[VERIFIED: pypi.org/Jinja2]` |
| `scipy` | `≥1.14` | Optional: for shuffled-label permutation test if `np.random.permutation` is insufficient; for `scipy.stats` Sharpe/Sortino sanity cross-checks | Already pinned but not actively used in Phase 3 — keep available for sanity tests in `lookahead_audit.py`. |
| `pino` / `pino-pretty` | — | NOT used in Phase 3 | Phase 3 has no relay service. |
| `ws` | — | NOT used in Phase 3 | Phase 4 dependency. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Jinja2 for HTML | bespoke f-string concatenation in `report.py` | f-strings fragile; Jinja2 gives loop/conditional structure for 11 sections with minimal LOC. **Jinja2 wins.** |
| Jinja2 for HTML | QuantStats `quantstats.reports.html()` | QuantStats is opinionated (assumes a single returns series + benchmark); doesn't fit our six-column PnL attribution model; pulls in matplotlib + ipython + a wagon of optional deps. **Jinja2 wins**, but cite QuantStats inspiration in `report.py` doc comment. `[CITED: github.com/ranaroussi/quantstats]` |
| sklearn `TimeSeriesSplit` for walk-forward | hand-rolled `pd.date_range`-based monthly iterator | `TimeSeriesSplit` requires `n_splits` known upfront and uses index positions, not timestamps; less ergonomic for "calibrate on month N, deploy on month N+1". Hand-rolled monthly iterator over `pd.PeriodIndex('M')` is ~25 lines and reads exactly like D-04. **Hand-rolled wins for D-04 readability.** Still cite `TimeSeriesSplit` in spec doc as the canonical reference. `[CITED: scikit-learn TimeSeriesSplit docs]` |
| pandera for `@strategy_fn` column contracts | hand-rolled decorator | pandera is heavyweight (schema validation, error messages, complex DataFrame model) and tied to schema validation, not decision-bar/observation-bar gating. The CONTEXT.md D-08 contract is narrow ("declare reads + writes; raise on undeclared access") and hand-rolling is ~25 lines using a `pd.DataFrame.attrs`-tagged wrapper. **Hand-rolled wins.** |
| ccxt for BTC OHLCV | CryptoDataDownload CSV direct fetch | ccxt is overkill for one-time download; CSV is two `requests.get` calls + `pd.read_csv`. **CSV wins.** CONTEXT.md D-01 locks this. |
| sklearn for shuffled-label test | `np.random.permutation` direct | Permutation test is 5 lines of numpy. No need for sklearn import. **numpy wins.** |
| Polars for backtest | pandas | Polars is faster but team momentum + existing codegen + Phase 1 prior art all in pandas. **pandas wins.** |
| Move test_scenario for property test | Direct dummy `tx_context::dummy()` | Per `.claude/rules/unit-tests.md` (loaded from vendored DeepBookV3): "Use test_scenario plus real entrypoints to build shared protocol state, and use local values only for genuinely pure/internal units." −30% NAV shock test needs shared Vault state → test_scenario. **test_scenario wins.** |

**Installation (Plan 03-01 codegen drift step adds these):**
```bash
# Python deps — add to backtest/pyproject.toml [project.dependencies]
cd backtest && uv add 'plotly>=5.20' 'jinja2>=3.1.6'

# TypeScript deps — already installed at repo root from Phase 2
# Verify with: pnpm ls @mysten/sui @mysten/deepbook-v3
# If @mysten/deepbook-v3 not installed yet:
pnpm add @mysten/deepbook-v3@0.17.0  # CLAUDE.md pin
```

**Version verification:**
- `@mysten/sui` 2.16.0 — already in lockfile.
- `@mysten/deepbook-v3` 0.17.0 published per CLAUDE.md; npm latest is 1.3.6 (2026 series). **`[ASSUMED]`** — exact publish date of 0.17.0 not verified in this session; Plan 03-01 Wave 0 spike must `npm view @mysten/deepbook-v3@0.17.0` and pin via `=` not `^` per Phase 2 CLAUDE.md discipline.
- `jinja2` 3.1.6 (2025-03-05 release). `[VERIFIED: pypi.org/pypi/Jinja2/json]`
- `plotly` — verify latest in 5.x series at Plan 03-01 install step. `[ASSUMED]`

## Architecture Patterns

### System Architecture Diagram

**Track A — Two-Protocol PTB (testnet, atomic)**

```
                     ┌──────────────────────────────────────────────┐
                     │  scripts/two-protocol-ptb-demo.ts            │
                     │  (fresh-wallet driver, Phase 3 NEW)          │
                     └──────────────────┬───────────────────────────┘
                                        │ builds + signs single Transaction
                                        ▼
            ┌───────────────────────────────────────────────────────────────┐
            │  PTB (5 moveCalls, atomic rollback)                           │
            │                                                               │
            │   1. Margin::deposit<BTC,DUSDC,BTC>(mm, registry, btc_oracle, │
            │              usdc_oracle, btc_collateral_coin, clock, ctx)    │
            │      └─ deposits user's BTC into the wrapped BalanceManager   │
            │                                                               │
            │   2. Margin::borrow_quote<BTC,DUSDC>(mm, registry, usdc_pool, │
            │              btc_oracle, usdc_oracle, dbpool,                 │
            │              loan_amount=100M, clock, ctx)                    │
            │      └─ borrows DUSDC; auto-deposits into BalanceManager      │
            │      └─ NO RETURN VALUE — does not return Coin<DUSDC>!        │
            │                                                               │
            │   3. borrowed_coin = Margin::withdraw<BTC,DUSDC,DUSDC>(mm,    │
            │              registry, btc_margin_pool, usdc_margin_pool,     │
            │              btc_oracle, usdc_oracle, dbpool,                 │
            │              loan_amount=100M, clock, ctx)                    │
            │      └─ extracts a free Coin<DUSDC> ← THE GAP CONTEXT.md D-17 │
            │         GLOSSES OVER. Without this step the PTB doesn't       │
            │         compile because vault::supply::supply needs Coin<Q>.  │
            │                                                               │
            │   4. vault::supply::supply<DUSDC>(vault, predict,             │
            │              predict_manager, oracle_svi, borrowed_coin,      │
            │              clock, ctx)                                      │
            │      └─ ATOMIC: deposits Coin into vault.balance + mints      │
            │         Coin<SHARE> to ctx.sender + internally calls          │
            │         rebalance::buy_hedge_for_deposit (Phase 2 D-06)       │
            │      └─ THIS is the Phase 2 atomic supply+hedge; we DO NOT    │
            │         call rebalance directly. CONTEXT.md D-17 is wrong     │
            │         to show it as a separate top-level call.              │
            │                                                               │
            │   5. (implicit) Coin<SHARE> transferred to ctx.sender by      │
            │      supply.move:108. Optionally, the demo follows with:      │
            │                                                               │
            │      Optional 5a. mm.deposit<BTC,DUSDC,SHARE>(...) if         │
            │      Margin has whitelisted VAULT_SHARE — D-18 hot-upgrade    │
            │      path. Default v1: skip.                                  │
            │                                                               │
            └───────────────────────────────────────────────────────────────┘
                                        │ atomic state transition
                                        ▼
            ┌───────────────────────────────────────────────────────────────┐
            │  On-chain state after PTB                                     │
            │  - MarginManager: borrowed_quote_shares > 0, BTC collateral   │
            │  - Vault.balance: +90% of borrow_amount (less hedge alloc)    │
            │  - Vault.hedges: 1 new HedgePosition at -15% OTM, 14d expiry  │
            │  - User wallet: Coin<SHARE> (dvUSDC)                          │
            │  Events: LoanBorrowed, Supplied, HedgeMinted                  │
            └───────────────────────────────────────────────────────────────┘
```

**Track B — Python Backtest Harness**

```
   ┌─────────────────────────┐    ┌──────────────────────────────────┐
   │ CryptoDataDownload      │───▶│ backtest/data/btcusdt_1h.parquet │
   │ Binance_BTCUSDT_1h.csv  │    │ (one-time pull, idempotent)      │
   └─────────────────────────┘    └──────────────────────────────────┘
                                                │
                                                ▼
   ┌───────────────────────────────────────────────────────────────────┐
   │ backtest/src/deepvault/data_ingest.py                             │
   │   load_btc_hourly(start_ts, end_ts) -> pd.DataFrame               │
   │   - column: available_at (= bar close_ts + 1 ms; D-05/D-08)       │
   │   - sorted ascending by ts, snappy compressed                     │
   └────────────────────────────┬──────────────────────────────────────┘
                                ▼
   ┌───────────────────────────────────────────────────────────────────┐
   │ backtest/src/deepvault/svi.py  (Phase 1)                          │
   │   binary_price(oracle, k) -> u64                                  │
   │ backtest/src/deepvault/vault_state.py  (NEW Phase 3)              │
   │   class VaultState:                                               │
   │     supply(amount: u64) -> shares_minted: u64                     │
   │     hedge_mint(svi_params, forward, ts_ms) -> hedge_id            │
   │     roll(now_ms) -> list[(old_key, new_key)]                      │
   │     redeem_request(shares, ts_ms) -> RequestSlot                  │
   │     redeem_fulfill(user, ts_ms) -> quote_paid: u64                │
   │     nav_per_share() -> u64                                        │
   │     worst_case_nav() -> u64                                       │
   │     replay(action: Action) -> None  # asserts post-state          │
   └────────────────────────────┬──────────────────────────────────────┘
                                ▼
   ┌───────────────────────────────────────────────────────────────────┐
   │ backtest/src/deepvault/replay.py  (NEW Phase 3)                   │
   │   @strategy_fn(reads=["t","spot","svi"], writes=["hedge_book"])   │
   │   def buy_hedge_for_deposit(t, spot, svi, hedge_book): ...        │
   │                                                                   │
   │   simulate(data: pd.DataFrame, vault: VaultState,                 │
   │            window: WalkForwardWindow) -> Result                   │
   └────────────────────────────┬──────────────────────────────────────┘
                                ▼
   ┌───────────────────────────────────────────────────────────────────┐
   │ Three independent test rigs (Wave 1):                             │
   │                                                                   │
   │   test_replay_parity.py: load backtest/traces/cycle-full.json     │
   │     → replay through VaultState                                   │
   │     → assert NAV/share state at every checkpoint within 1 wei     │
   │                                                                   │
   │   test_lookahead_audit.py:                                        │
   │     - shuffled-label test (D-06): |alpha| ≤ 0.5% APY              │
   │     - 3-row hand recompute (D-07): values from notebook seed      │
   │     - @strategy_fn unit tests: raise on undeclared read           │
   │                                                                   │
   │   test_walk_forward.py:                                           │
   │     - assert OOS 30% is never written to during calibration       │
   │     - sensitivity table emission                                  │
   └────────────────────────────┬──────────────────────────────────────┘
                                ▼
   ┌───────────────────────────────────────────────────────────────────┐
   │ backtest/src/deepvault/pnl_attribution.py (NEW Phase 3)           │
   │   compute_attribution(trace_or_simulation) -> pd.DataFrame        │
   │   columns: plp_yield_bps, hedge_cost_bps, hedge_payoff_bps,       │
   │            fees_bps, slippage_bps, gas_bps, total_bps             │
   └────────────────────────────┬──────────────────────────────────────┘
                                ▼
   ┌───────────────────────────────────────────────────────────────────┐
   │ backtest/src/deepvault/report.py (NEW Phase 3)                    │
   │   render_html(simulation, attribution, oos_metrics,               │
   │               stress_events, sensitivity, hand_recompute)         │
   │   → backtest/report.html (single standalone file)                 │
   │     Plotly embedded inline; matplotlib as base64 PNG              │
   │     Eleven sections per D-13                                      │
   └───────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure
```
contracts/
└── tests/
    ├── mock_margin_pool.move       # NEW — test-only Margin trait surface (D-18 + PTB-04)
    ├── ptb_capability_test.move    # NEW — TradeCap/TreasuryCap escape adversarial tests
    └── liquidation_test.move       # NEW — -30% NAV shock (D-20 + PTB-05)

backtest/
├── data/                            # NEW — gitignored cache (download once, reuse)
│   └── btcusdt_1h.parquet          # CryptoDataDownload Binance 365d hourly
├── traces/                          # NEW — captured testnet action traces
│   ├── cycle-full.json             # full supply→hedge→roll→redeem cycle from PTB demo
│   └── micro-fixture-7d.json       # 7-day micro for per-push CI parity
├── src/deepvault/
│   ├── data_ingest.py              # NEW — CryptoDataDownload CSV → parquet
│   ├── vault_state.py              # NEW — Python state machine mirroring Move
│   ├── replay.py                   # NEW — @strategy_fn decorator + simulate()
│   ├── walk_forward.py             # NEW — monthly walk-forward calibration loop
│   ├── lookahead_audit.py          # NEW — shuffled-label test + hand-recompute helpers
│   ├── pnl_attribution.py          # NEW — six-column accountant
│   ├── report.py                   # NEW — Jinja2 HTML renderer
│   └── (existing Phase 1 modules — svi.py, phi.py, isqrt.py, ln.py, arb_checker.py,
│        parity_runner.py, phi_coefficients.py, strategy_constants.py)
├── tests/
│   ├── test_vault_state.py         # NEW — pure-Python unit tests for state machine
│   ├── test_replay_parity.py       # NEW — Move↔Python parity from cycle-full.json
│   ├── test_lookahead_audit.py     # NEW — D-06, D-07, D-08 enforcement
│   ├── test_walk_forward.py        # NEW — OOS holdout invariant
│   └── (existing Phase 1 tests)
├── notebooks/                       # NEW
│   └── hand-recompute.ipynb        # D-07: 3-row np.random.choice + manual PnL math
└── pyproject.toml                  # modified — add plotly, jinja2

scripts/
├── two-protocol-ptb-demo.ts        # NEW — Track A PTB driver (PTB-03, PTB-06)
└── (existing — e2e-vault-cycle.ts, e2e-vault-deploy.sh, codegen.py, etc.)

.github/workflows/
├── ci.yml                          # modified — Python job extended for new tests
└── nightly-backtest.yml            # NEW — full 365d run, HTML report artifact

.planning/
└── backtest-assumptions.md         # NEW — D-05 assumption ledger
```

### Pattern 1: PTB chaining with `Margin::withdraw` bridge

**What:** The flagship PTB cannot directly chain `Margin::borrow_quote → vault::supply::supply` because `borrow_quote` does NOT return a Coin (see source citation below). The borrowed Quote is auto-deposited into the MarginManager's internal BalanceManager (margin_manager.move:625, `self.deposit_int<BaseAsset, QuoteAsset, QuoteAsset>(coin, ctx)`). To use the borrowed funds elsewhere in the same PTB, you must explicitly extract them via `Margin::withdraw<Base, Quote, Quote>`, which returns `Coin<WithdrawAsset>` (margin_manager.move:458-554).

**When to use:** Always, for any DeepBook Margin → external-consumer PTB. This is the canonical pattern.

**Example (TypeScript, @mysten/sui 2.16.0):**
```typescript
// Source: margin_manager.move:602-643 (borrow_quote), 458-555 (withdraw),
//         supply.move:61-117 (supply)
// CITED: scripts/e2e-vault-cycle.ts:122-150 for the supply call shape;
// extended here with the Margin lead-in.

import { Transaction } from '@mysten/sui/transactions';

const tx = new Transaction();

// Step 1: deposit BTC collateral into MarginManager
//   (one-time setup OR per-PTB if user posts new collateral)
const [btcCollat] = tx.splitCoins(tx.object(userBtcCoinId), [
  tx.pure.u64(collateralAmount),
]);
tx.moveCall({
  target: `${MARGIN_PKG}::margin_manager::deposit`,
  typeArguments: [BTC_TYPE, DUSDC_TYPE, BTC_TYPE],
  arguments: [
    tx.sharedObjectRef({ objectId: MM_ID, mutable: true, initialSharedVersion: MM_V0 }),
    tx.sharedObjectRef({ objectId: MARGIN_REGISTRY_ID, mutable: false, initialSharedVersion: MR_V0 }),
    tx.object(BTC_ORACLE_ID),
    tx.object(USDC_ORACLE_ID),
    btcCollat,
    tx.object('0x6'), // Clock
  ],
});

// Step 2: borrow DUSDC against the collateral
//   NOTE: this call does NOT return a Coin.
//   The borrowed DUSDC ends up inside MarginManager's BalanceManager.
tx.moveCall({
  target: `${MARGIN_PKG}::margin_manager::borrow_quote`,
  typeArguments: [BTC_TYPE, DUSDC_TYPE],
  arguments: [
    tx.sharedObjectRef({ objectId: MM_ID, mutable: true, initialSharedVersion: MM_V0 }),
    tx.sharedObjectRef({ objectId: MARGIN_REGISTRY_ID, mutable: false, initialSharedVersion: MR_V0 }),
    tx.sharedObjectRef({ objectId: DUSDC_MARGIN_POOL_ID, mutable: true, initialSharedVersion: DMP_V0 }),
    tx.object(BTC_ORACLE_ID),
    tx.object(USDC_ORACLE_ID),
    tx.sharedObjectRef({ objectId: DEEPBOOK_POOL_ID, mutable: false, initialSharedVersion: DBP_V0 }),
    tx.pure.u64(borrowAmount),  // e.g., 100_000_000 = 100 DUSDC at 6 decimals
    tx.object('0x6'),
  ],
});

// Step 3: withdraw the freshly borrowed DUSDC as a free Coin
//   This is the bridge that lets us hand the borrowed funds to vault::supply.
const [borrowedCoin] = tx.moveCall({
  target: `${MARGIN_PKG}::margin_manager::withdraw`,
  typeArguments: [BTC_TYPE, DUSDC_TYPE, DUSDC_TYPE],
  arguments: [
    tx.sharedObjectRef({ objectId: MM_ID, mutable: true, initialSharedVersion: MM_V0 }),
    tx.sharedObjectRef({ objectId: MARGIN_REGISTRY_ID, mutable: false, initialSharedVersion: MR_V0 }),
    tx.sharedObjectRef({ objectId: BTC_MARGIN_POOL_ID, mutable: true, initialSharedVersion: BMP_V0 }),
    tx.sharedObjectRef({ objectId: DUSDC_MARGIN_POOL_ID, mutable: true, initialSharedVersion: DMP_V0 }),
    tx.object(BTC_ORACLE_ID),
    tx.object(USDC_ORACLE_ID),
    tx.sharedObjectRef({ objectId: DEEPBOOK_POOL_ID, mutable: false, initialSharedVersion: DBP_V0 }),
    tx.pure.u64(borrowAmount),  // withdraw exactly what we just borrowed
    tx.object('0x6'),
  ],
});

// Step 4: feed the borrowed Coin into vault::supply (atomic with hedge mint per Phase 2 D-06)
//   The vault::supply implementation internally calls rebalance::buy_hedge_for_deposit;
//   we do NOT call rebalance directly. CONTEXT.md D-17 reads the implementation
//   incorrectly when it shows three moveCalls.
tx.moveCall({
  target: `${DEEPVAULT_PKG}::supply::supply`,
  typeArguments: [DUSDC_TYPE],
  arguments: [
    tx.sharedObjectRef({ objectId: VAULT_ID, mutable: true, initialSharedVersion: VAULT_V0 }),
    tx.object(PREDICT_TOP_LEVEL_ID),
    tx.sharedObjectRef({ objectId: PREDICT_MANAGER_ID, mutable: true, initialSharedVersion: PM_V0 }),
    tx.object(ORACLE_SVI_ID),
    borrowedCoin,   // <-- piped from step 3
    tx.object('0x6'),
  ],
});

// Sign and execute — atomic rollback on any step failure
const result = await client.signAndExecuteTransaction({
  transaction: tx,
  signer: keypair,
  options: { showEffects: true, showEvents: true },
});
```

**Why this matters:** CONTEXT.md D-17 reads the literal PTB as `borrow_quote → vault::supply::deposit → vault::rebalance::buy_hedge_for_deposit`. Translated naively to `@mysten/sui` Transaction builder, the second `moveCall` would have nothing to feed the `Coin<Quote>` argument — `borrow_quote` returns void. Implementations would either silently use a separate Coin (defeating the demo's "borrowed funds atomically supplied" story) or fail at PTB-build time. **The planner MUST update the demo plan to the five-call shape above** and update CONTEXT.md D-17's English description to match. The Phase 2 `vault::supply::supply` already includes the hedge mint internally — listing `buy_hedge_for_deposit` as a separate top-level moveCall double-counts.

### Pattern 2: Python `vault_state` machine — bit-equal Move mirror

**What:** Phase 1 established the pattern: shared constants from `shared/strategy.toml` codegen, identical integer math in Python `int` and Move `u64`/`u128`, exact equality at 1 unit / 1e9 scale. Phase 3 extends from pure-function parity (binary_price) to state-machine parity (vault_state).

**When to use:** Any time you need an off-chain twin of on-chain state. Required for handbook-grade backtest credibility (PROJECT.md "Backtest integrity").

**Example:**
```python
# Source pattern: backtest/src/deepvault/parity_runner.py:37 (Phase 1 prior art)
#                 supply.move:148-156 (virtual-shares math)
# CITED: PITFALLS.md Pitfall 12 (rounding direction)

from dataclasses import dataclass, field
from typing import Dict, List

from .strategy_constants import (
    VIRTUAL_SHARES,
    SEED_QUOTE_MICRO_UNITS,
    ALLOCATION_BPS,
    NAV_SCALE,
    TOKEN_BUCKET_CAPACITY,
    TOKEN_BUCKET_REFILL_RATE_PER_MS,
)

@dataclass
class HedgePosition:
    oracle_id: str
    strike: int            # u64 at 1e9
    expiry_ms: int
    notional_quote: int    # u64
    cost_basis_quote: int  # u64
    quantity: int          # u64

@dataclass
class RequestSlot:
    shares_escrowed: int   # u64
    request_timestamp_ms: int
    claimed_so_far: int    # u64

@dataclass
class VaultState:
    balance: int = 0                          # Balance<Quote>.value()  (u64 quote-decimals)
    total_assets: int = 0                     # u64
    total_shares: int = 0                     # u64
    hedges: Dict[str, HedgePosition] = field(default_factory=dict)
    request_slots: Dict[str, RequestSlot] = field(default_factory=dict)
    paused: bool = False
    # ...

    @classmethod
    def new_seeded(cls) -> 'VaultState':
        """Mirrors vault::create_vault — DUSDC seed burned to 0xdead."""
        v = cls()
        v.balance = SEED_QUOTE_MICRO_UNITS  # 10 DUSDC
        v.total_assets = SEED_QUOTE_MICRO_UNITS
        v.total_shares = VIRTUAL_SHARES     # 1_000_000 — seeded shares burned-equivalent
        return v

    def compute_shares_to_mint(self, deposit_quote: int) -> int:
        """Bit-equal to supply::compute_shares_to_mint (supply.move:148)."""
        # numerator = deposit * (total_shares + virtual_shares)
        numerator = deposit_quote * (self.total_shares + VIRTUAL_SHARES)
        # denominator = total_assets + 1   (anti-inflation virtual offset)
        denominator = self.total_assets + 1
        # Python `//` truncates toward zero for positive operands — matches Move
        return numerator // denominator

    def supply(self, deposit_quote: int) -> int:
        """Mirrors supply::supply. Returns shares minted."""
        assert not self.paused, "ESupplyPaused (200)"
        assert deposit_quote > 0, "EZeroAmount (203)"
        shares = self.compute_shares_to_mint(deposit_quote)
        assert shares > 0, "EZeroSharesMinted (201)"
        # Hedge alloc = 10% of deposit per D-01 / strategy_constants
        hedge_alloc = deposit_quote * ALLOCATION_BPS // 10_000
        # The hedge_alloc is forwarded to PredictManager; backtest models this
        # via _mock_predict_manager_balance which mirrors the on-chain state.
        self._mock_predict_manager_balance += hedge_alloc
        self.balance += deposit_quote - hedge_alloc
        self.total_assets += deposit_quote   # tracks both legs
        self.total_shares += shares
        return shares

    def nav_per_share(self) -> int:
        """Bit-equal to ltv::nav_per_share. u64 at NAV_SCALE (1e9)."""
        assert self.total_shares > 0, "EZeroShares (500)"
        # math::mul_div_round_down(total_assets, NAV_SCALE, total_shares)
        return (self.total_assets * NAV_SCALE) // self.total_shares

    def worst_case_nav(self) -> int:
        """Bit-equal to ltv::worst_case_nav_per_share (ltv.move:60).
        Assumes ALL open hedges expire worthless. Returns u64 at NAV_SCALE."""
        assert self.total_shares > 0, "EZeroShares (500)"
        return (self.balance * NAV_SCALE) // self.total_shares

    def replay(self, action: dict) -> None:
        """Consumes one action from the JSON trace; asserts post-state matches.
        Per D-04 Action-trace JSON schema in CONTEXT.md."""
        kind = action["kind"]
        pre_balance = action["pre"]["balance"]
        pre_total_assets = action["pre"]["total_assets"]
        pre_total_shares = action["pre"]["total_shares"]
        assert self.balance == pre_balance, f"pre balance drift: {self.balance} != {pre_balance}"
        assert self.total_assets == pre_total_assets
        assert self.total_shares == pre_total_shares
        if kind == "supply":
            self.supply(action["args"]["deposit_quote"])
        elif kind == "hedge_mint":
            self._apply_hedge_mint(action)
        elif kind == "roll":
            self._apply_roll(action)
        elif kind == "redeem_request":
            self._apply_redeem_request(action)
        elif kind == "redeem_fulfill":
            self._apply_redeem_fulfill(action)
        # Post-state assertion within 1 unit (D-14 / D-15 / D-16)
        post = action["post"]
        assert abs(self.balance - post["balance"]) <= 1
        assert abs(self.total_assets - post["total_assets"]) <= 1
        assert abs(self.total_shares - post["total_shares"]) <= 1
```

### Pattern 3: Action-trace JSON capture from live testnet

**What:** The `e2e-vault-cycle.ts` script already drives a full cycle on testnet (supply → wait → redeem_request → 1h cooldown → redeem_fulfill). Phase 3 extends it (or duplicates it as `scripts/two-protocol-ptb-demo.ts`) to **also** dump a JSON action trace after every successful tx, by reading `result.effects` + `result.events` + `client.getObject(vault_id)` before and after each step.

**When to use:** Once per Phase 3 release, captured into `backtest/traces/cycle-full.json`. The Python test rig replays this trace and asserts parity. Reviewers can re-capture from a fresh wallet to verify reproducibility (D-16).

**Example (extending e2e-vault-cycle.ts):**
```typescript
// After each successful PTB, capture pre/post state + event payloads.

type Action = {
  kind: 'supply' | 'hedge_mint' | 'roll' | 'redeem_request' | 'redeem_fulfill';
  tx_digest: string;
  ts_ms: number;
  args: Record<string, string | number>;
  pre: { balance: string; total_assets: string; total_shares: string };
  post: { balance: string; total_assets: string; total_shares: string };
  events: any[];
};

async function snapshotVault(client: SuiClient, vaultId: string) {
  const obj = await client.getObject({ id: vaultId, options: { showContent: true } });
  const fields = (obj.data?.content as any).fields;
  return {
    balance: String(fields.balance),                     // u64 as string for safe JSON
    total_assets: String(fields.total_assets),
    total_shares: String(fields.total_shares_supply),
  };
}

// Around each existing signAndExecuteTransaction call:
const pre = await snapshotVault(client, deploy.vault_id);
const result = await client.signAndExecuteTransaction({ ... });
const post = await snapshotVault(client, deploy.vault_id);
trace.actions.push({
  kind: 'supply',
  tx_digest: result.digest,
  ts_ms: Date.now(),
  args: { deposit_quote: SUPPLY_AMOUNT_MICRO.toString() },
  pre, post,
  events: result.events ?? [],
});
// ... at end:
writeFileSync('backtest/traces/cycle-full.json', JSON.stringify(trace, null, 2));
```

### Pattern 4: Mock Margin pool (`#[test_only]`) for VAULT_SHARE-as-collateral demonstration

**What:** Move's `#[test_only]` attribute scopes a struct/function/module to `sui move test` compilation only — production builds strip it. The mock Margin pool exists solely so the −30% NAV shock test (PTB-05) can register VAULT_SHARE as collateral and exercise `liquidate_position` without waiting on Mysten governance.

**When to use:** When the property test depends on an external protocol's whitelist or capability that we don't control. D-18's "documented-future + mock Margin pool" path.

**Example (Move 2024):**
```move
// contracts/tests/mock_margin_pool.move
// Source pattern: scripts/deepbookv3/.claude/rules/move.md (#[test_only] scoping)
//                 scripts/deepbookv3/packages/deepbook_margin/sources/margin_manager.move:558-643
//                 (borrow shape — return-nothing, internal deposit)

#[test_only]
module deepvault::mock_margin_pool;

use deepvault::share::SHARE;
use sui::balance::{Self, Balance};
use sui::coin::{Self, Coin};
use sui::object::{Self, UID};
use sui::table::{Self, Table};

const E_NOT_REGISTERED_COLLATERAL: u64 = 1;
const E_INSUFFICIENT_COLLATERAL: u64 = 2;
const LIQUIDATION_LTV_BPS: u64 = 11_500; // 1.15 risk ratio per Margin docs

/// Test-only minimal Margin trait surface — proves architectural readiness
/// for VAULT_SHARE-as-collateral (D-18) without waiting on Mysten governance.
public struct MockMarginPool<phantom Quote> has key {
    id: UID,
    quote_reserves: Balance<Quote>,
    // Collateral type → registered (true)/(false). Test-only registry analog.
    registered_collateral: Table<std::type_name::TypeName, bool>,
    positions: Table<address, Position>,
}

public struct Position has store {
    collateral_value_at_open: u64,  // u64 at 1e9 (matches NAV_SCALE)
    debt: u64,                       // u64 quote-decimals
}

public fun register_collateral_type<T>(self: &mut MockMarginPool<Quote>, _ctx: &mut TxContext) {
    self.registered_collateral.add(std::type_name::with_defining_ids<T>(), true);
}

/// Mock-borrow analog of margin_manager::borrow_quote. Asserts the collateral
/// type is registered, computes loan against worst_case_nav_per_share, and
/// returns the borrowed Coin (unlike real Margin which auto-deposits — this
/// simplification is deliberate; the test rig doesn't need BalanceManager
/// wrapping).
public fun borrow_quote_against_collateral<Quote, Collat>(
    self: &mut MockMarginPool<Quote>,
    collateral: Coin<Collat>,
    worst_case_nav_per_share: u64,  // from deepvault::ltv
    loan_amount: u64,
    ctx: &mut TxContext,
): Coin<Quote> {
    let collat_type = std::type_name::with_defining_ids<Collat>();
    assert!(*self.registered_collateral.borrow(collat_type), E_NOT_REGISTERED_COLLATERAL);

    let collat_value = collateral.value();  // proxy for nav-priced collateral
    let max_loan = collat_value * worst_case_nav_per_share / 1_000_000_000 * 5_000 / 10_000;
    //                                                      ^                 ^ MARGIN_LTV_CAP_BPS
    //                                                      |
    //                                                      1e9 NAV_SCALE
    assert!(loan_amount <= max_loan, E_INSUFFICIENT_COLLATERAL);

    // Position bookkeeping (test-only; production Margin tracks shares).
    self.positions.add(ctx.sender(), Position {
        collateral_value_at_open: collat_value,
        debt: loan_amount,
    });

    // Burn collateral (test-only — production stores it; we only need to prove
    // the LTV math works against worst_case_nav_per_share).
    coin::destroy_zero(collateral);  // assumes collateral.value() == 0 OR drop into reserves

    coin::from_balance(self.quote_reserves.split(loan_amount), ctx)
}

public fun liquidate_position<Quote, Collat>(
    self: &mut MockMarginPool<Quote>,
    user: address,
    current_worst_case_nav_per_share: u64,
): u64 {
    let pos = self.positions.borrow(user);
    // Risk ratio = current_collateral_value / debt, in bps
    // (vs. trigger at 1.15 = 11_500)
    let current_collateral_value = pos.collateral_value_at_open
        * current_worst_case_nav_per_share
        / 1_000_000_000;
    let risk_ratio_bps = current_collateral_value * 10_000 / pos.debt;
    assert!(risk_ratio_bps < LIQUIDATION_LTV_BPS, /* ENotLiquidatable */ 99);
    // ... liquidation logic ...
    risk_ratio_bps
}

#[test_only]
public fun new_for_testing<Quote>(ctx: &mut TxContext): MockMarginPool<Quote> {
    MockMarginPool<Quote> {
        id: object::new(ctx),
        quote_reserves: balance::zero(),
        registered_collateral: table::new(ctx),
        positions: table::new(ctx),
    }
}
```

Mock Margin pool patterns in Move are an established idiom — DeepBookV3 itself uses the same approach in `scripts/deepbookv3/packages/deepbook_margin/tests/helper/test_helpers.move` (a "test-only" helpers module that builds the entire margin protocol in-test). `[CITED: scripts/deepbookv3/packages/deepbook_margin/tests/helper/test_helpers.move]`

### Pattern 5: `@strategy_fn` decorator (lookahead-bias gate)

**What:** Python decorator wrapping a strategy function. The function declares `reads=[...]` (columns it's allowed to read) and `writes=[...]` (columns it's allowed to write). The decorator wraps any `pd.DataFrame` argument in a view-proxy that intercepts `__getitem__` and `__setitem__`; undeclared access raises `LookaheadViolation`.

**When to use:** Every function in `replay.py` that takes a DataFrame should be decorated. The CI test `test_lookahead_audit.py` asserts a known-buggy "future-reading" function raises.

**Reference implementations:**
- pandera column-level data contracts (heavier than we need; cite as inspiration).
- vectorbt's walk-forward (uses position-based indexing as a soft contract).
- Quant Python practice (Marcos López de Prado "Advances in Financial Machine Learning" chapter 7) recommends explicit `@uses(...)` decorators for backtest correctness.

**Example (~30 LOC reference impl):**
```python
# backtest/src/deepvault/replay.py — @strategy_fn decorator

from functools import wraps
from typing import Iterable

import pandas as pd

class LookaheadViolation(RuntimeError):
    """Raised when a strategy function reads or writes a column not declared
    in the @strategy_fn manifest. Enforces D-08 decision-bar / observation-bar split."""

class _GatedFrame:
    """Proxy wrapping a pd.DataFrame; raises on undeclared column access.
    Forwards all other attribute lookups."""
    def __init__(self, df: pd.DataFrame, reads: frozenset, writes: frozenset):
        self._df = df
        self._reads = reads
        self._writes = writes

    def __getitem__(self, key):
        col = key if isinstance(key, str) else None
        if col is not None and col not in self._reads:
            raise LookaheadViolation(
                f"function read undeclared column {col!r}; declared reads = {sorted(self._reads)}"
            )
        return self._df[key]

    def __setitem__(self, key, value):
        col = key if isinstance(key, str) else None
        if col is not None and col not in self._writes:
            raise LookaheadViolation(
                f"function wrote undeclared column {col!r}; declared writes = {sorted(self._writes)}"
            )
        self._df[key] = value

    def __getattr__(self, name):
        return getattr(self._df, name)

def strategy_fn(reads: Iterable[str], writes: Iterable[str]):
    """Decorator enforcing D-08 decision-bar / observation-bar split.
    Wraps any DataFrame positional arg in a _GatedFrame that intercepts
    column access. Non-DataFrame args pass through unchanged."""
    reads_set = frozenset(reads)
    writes_set = frozenset(writes)
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            new_args = tuple(
                _GatedFrame(a, reads_set, writes_set) if isinstance(a, pd.DataFrame) else a
                for a in args
            )
            new_kwargs = {
                k: (_GatedFrame(v, reads_set, writes_set) if isinstance(v, pd.DataFrame) else v)
                for k, v in kwargs.items()
            }
            return fn(*new_args, **new_kwargs)
        wrapper._reads = reads_set    # introspectable by audit harness
        wrapper._writes = writes_set
        return wrapper
    return decorator

# Usage:
@strategy_fn(reads=['ts', 'spot', 'svi_params'], writes=['hedge_book'])
def buy_hedge_for_deposit(market_data: pd.DataFrame, vault_state):
    spot_now = market_data['spot']          # OK — declared
    svi_now = market_data['svi_params']     # OK
    # market_data['spot_next']              # WOULD RAISE — not declared
    # ...
```

**Audit test (D-08 enforcement):**
```python
# backtest/tests/test_lookahead_audit.py
import pytest
from deepvault.replay import strategy_fn, LookaheadViolation
import pandas as pd

@strategy_fn(reads=['ts', 'spot'], writes=[])
def reads_future_bar(df):
    return df['spot_next']  # undeclared — must raise

def test_decorator_raises_on_undeclared_read():
    df = pd.DataFrame({'ts': [0, 1], 'spot': [100, 101], 'spot_next': [101, 102]})
    with pytest.raises(LookaheadViolation):
        reads_future_bar(df)
```

### Pattern 6: HTML report — Jinja2 + Plotly inline + matplotlib base64

**What:** Single standalone HTML file (D-12) renders via Jinja2 template + Plotly's `fig.to_html(include_plotlyjs='inline')` for the 3D SVI snapshot, equity curve, and drawdown timeline (interactive in browser, no internet needed) + matplotlib base64-encoded PNG for static figures (PnL distribution, regime heatmap).

**When to use:** Final Phase 3 deliverable. Nightly CI emits to `backtest/report.html` and uploads as workflow artifact (BACK-10).

**Example:**
```python
# backtest/src/deepvault/report.py
# Source pattern: pbpython.com Jinja2 + WeasyPrint financial reports (cited inspiration)
# CITED: plotly.io.to_html documentation

import base64
from io import BytesIO
from pathlib import Path

import matplotlib.pyplot as plt
import plotly.graph_objects as go
from jinja2 import Environment, FileSystemLoader, select_autoescape

TEMPLATE_DIR = Path(__file__).parent.parent.parent / 'templates'
TEMPLATE_FILE = 'report.html.jinja2'

def matplotlib_to_base64_png(fig: plt.Figure) -> str:
    """Convert a matplotlib Figure to a base64-encoded PNG data URI.
    Embed in HTML via <img src="{{ pnl_distribution_png }}"/>."""
    buf = BytesIO()
    fig.savefig(buf, format='png', dpi=120, bbox_inches='tight')
    buf.seek(0)
    return f"data:image/png;base64,{base64.b64encode(buf.read()).decode('ascii')}"

def render_html(
    *,
    executive_summary: dict,
    assumption_ledger: str,        # markdown content of .planning/backtest-assumptions.md
    strategy_description: dict,
    data_ledger: dict,
    walk_forward_results: dict,
    pnl_attribution_df,            # pd.DataFrame, six columns per D-09
    drawdown_metrics: dict,
    stress_event_narratives: list, # 2 events per D-02
    sensitivity_table_df,
    shuffled_label_test: dict,
    hand_recompute_appendix: dict,
    # Embedded plot HTMLs
    svi_snapshot_plot: go.Figure,
    equity_curve_plot: go.Figure,
    drawdown_timeline_plot: go.Figure,
    # Embedded matplotlib PNGs
    pnl_histogram_fig: plt.Figure,
    regime_heatmap_fig: plt.Figure,
    output_path: Path = Path('backtest/report.html'),
) -> Path:
    env = Environment(
        loader=FileSystemLoader(str(TEMPLATE_DIR)),
        autoescape=select_autoescape(['html']),
    )
    tmpl = env.get_template(TEMPLATE_FILE)

    # Plotly inline: include plotlyjs in EACH plot OR once at top. Save bytes
    # by including 'inline' only on the first figure and using 'directory' on
    # subsequent — but 'inline' on all three is ~3 MB extra (acceptable; ~9 MB
    # total report). For institutional cold-read offline reliability, 'inline'
    # is the right call.
    rendered = tmpl.render(
        # Section 1
        executive_summary=executive_summary,
        # Section 2
        assumption_ledger=assumption_ledger,
        # Section 3
        strategy=strategy_description,
        # Section 4
        data_ledger=data_ledger,
        # Section 5
        walk_forward=walk_forward_results,
        # Section 6
        pnl_attribution=pnl_attribution_df.to_html(classes='six-col', index=True),
        # Section 7
        drawdown=drawdown_metrics,
        # Section 8 — stress event narratives (2 items)
        stress_events=stress_event_narratives,
        # Section 9
        sensitivity_table=sensitivity_table_df.to_html(classes='sensitivity', index=False),
        # Section 10
        shuffled_label=shuffled_label_test,
        # Section 11
        hand_recompute=hand_recompute_appendix,
        # Embedded interactive plots
        svi_snapshot=svi_snapshot_plot.to_html(include_plotlyjs='inline', full_html=False),
        equity_curve=equity_curve_plot.to_html(include_plotlyjs='cdn', full_html=False),
        drawdown_timeline=drawdown_timeline_plot.to_html(include_plotlyjs='cdn', full_html=False),
        # Embedded static PNGs
        pnl_histogram_png=matplotlib_to_base64_png(pnl_histogram_fig),
        regime_heatmap_png=matplotlib_to_base64_png(regime_heatmap_fig),
    )
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(rendered, encoding='utf-8')
    return output_path
```

The `include_plotlyjs='inline'` on the first plot + `'cdn'` on subsequent (saves ~6 MB but introduces a network dep) is a common compromise. For the demo HTML reviewed offline by judges, **all `include_plotlyjs='inline'`** is the safer choice — 9 MB is fine for a deliverable. `[CITED: plotly.com/python-api-reference/generated/plotly.io.to_html.html]`

### Anti-Patterns to Avoid

- **CONTEXT.md D-17's literal three-call PTB.** It does not compile. Must be five calls including `Margin::withdraw`. Fix in Plan 03-01 spike or earlier.
- **Calling `vault::rebalance::buy_hedge_for_deposit` directly from the demo PTB.** It's `public(package)` (rebalance.move:219), not `public` — therefore NOT callable from outside `deepvault::`. The supply path internally calls it; the demo PTB calls `supply` and atomicity is preserved by Move tx semantics, not by an explicit user-level moveCall.
- **Reading future bars without `.shift(1)`.** Catch with `@strategy_fn` decorator + shuffled-label test. PITFALLS.md Pitfall 1.
- **Tuning hedge ratio on OOS data.** PITFALLS.md Pitfall 2; CONTEXT.md D-04 locks against this. v1 ratio (0.10) is fixed regardless of which sensitivity-table row produces highest Sharpe.
- **Including current bar in SVI fit at decision time.** Tag every SVI fit with `fit_window_end_ts`; assert `fit_window_end_ts < decision_ts` for every mint.
- **Using `assert_approx` in property tests.** Per `scripts/deepbookv3/.claude/rules/unit-tests.md` rule 10: 1 unit of precision loss can mean an exploit. Phase 3 parity tests use `assert_eq!` at 1 unit / 1e9 (continues Phase 1 discipline).
- **Hand-rolling a token-bucket in `vault_state.py`.** Use Phase 1's helpers/rate_limiter.move as the source of truth; port the algorithm line-for-line. PITFALLS.md Pitfall 13.
- **Mocking the Predict manager in `vault_state.py` with floats.** Use integer u64 mirror everywhere; the `_mock_predict_manager_balance: int` field above is the pattern.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| BTC OHLCV ingestion | Custom Binance REST API client + pagination | CryptoDataDownload `Binance_BTCUSDT_1h.csv` direct fetch via `requests` + `pd.read_csv` | One-time download, no API key, no rate limit, single file. CONTEXT.md D-01 locks this. |
| 3D SVI surface plot | Three.js / react-three-fiber from scratch | Plotly `type: 'surface'` via `plotly.graph_objects.Surface` | The Phase 4 dashboard will use the same idiom; Phase 3 report's SVI snapshot is a static export of the same plot type. |
| Drawdown / Sharpe / Sortino calcs | Re-implement from textbook | numpy + pandas (`(equity / equity.cummax() - 1).min()` for max DD) | 5 lines each; QuantStats is overkill and pulls in opinionated dependency wagon. |
| HTML report template | f-string concatenation | Jinja2 with `templates/report.html.jinja2` | 11 sections × loops × conditionals = unmaintainable as f-strings. |
| PTB construction | Raw RPC calls to `sui_executeTransactionBlock` | `@mysten/sui` `Transaction` class + `tx.moveCall` | Phase 2's `e2e-vault-cycle.ts` is the prior art; same pattern continues. |
| Walk-forward indexer | Custom for-loop | sklearn `TimeSeriesSplit` for index generation; hand-rolled monthly iterator for our specific cadence | sklearn primitive + thin wrapper is more maintainable than from-scratch loop. |
| Action-trace JSON parser | Custom Sui event decoder | Read `result.events[i].parsedJson` directly from `signAndExecuteTransaction` response | `@mysten/sui` already BCS-decodes the event payload; we just need to forward `parsedJson` into the trace. |
| Mock Margin pool's BalanceManager wrapping | Re-implement the full BalanceManager + TradeCap dance | Skip it. The mock is test-only and exists to prove the LTV math against `worst_case_nav_per_share`; full Margin protocol fidelity is not required. | Keeps mock under 100 LOC. |
| Predict manager balance model in Python | Full state machine of the Predict-side ledger | Single `int` mirror updated by `supply`/`hedge_mint`/`roll` — only the balance Phase 3 cares about | Predict's full internals are Phase 2's concern; backtest only needs the cost-basis flow. |
| Lookahead audit's column dependency tracker | AST-walking visitor over function bodies | Wrapper-proxy intercepting `__getitem__` on DataFrames at runtime | AST inspection has edge cases (dynamic column names, `getattr`-style access); runtime wrapper is robust and 30 LOC. |

**Key insight:** Phase 3's biggest temptation is to reinvent quant Python idioms. The discipline is to **port** from Phase 1/2 (state machine, parity runner, codegen constants) and **wrap** standard tools (Jinja2, sklearn, Plotly) — never build a parallel implementation of something the ecosystem already does well.

## Runtime State Inventory

Phase 3 is **NOT a rename/refactor phase**. It is greenfield code addition (Track A new TS demo file + new Move tests; Track B new Python modules + new report template). No runtime state inventory required.

For completeness: there is no stored data, live service config, OS-registered state, secrets, or build artifacts that the planner must migrate or re-register. Phase 3's deliverables are entirely additive.

## Common Pitfalls

### Pitfall 1: PTB shape compiles but `Margin::borrow_quote` silently does nothing useful

**What goes wrong:** Planner reads CONTEXT.md D-17 as the literal PTB shape, writes three moveCalls in `scripts/two-protocol-ptb-demo.ts`, and either (a) the TypeScript compiler complains that no Coin is in scope for `vault::supply`, OR (b) builder works around by passing a separately-funded Coin to supply, defeating the demo's "borrowed funds atomically supplied" story.

**Why it happens:** `Margin::borrow_quote` auto-deposits the borrowed coin into the internal BalanceManager (margin_manager.move:625). It returns void. The literal D-17 PTB chain is not realizable without an intermediate `Margin::withdraw`.

**How to avoid:** Plan 03-01 Wave 0 lock: PTB shape is FIVE calls (deposit → borrow_quote → withdraw → vault::supply::supply → optional VAULT_SHARE re-deposit). Update CONTEXT.md D-17 description as a Wave 0 amendment. Update all downstream artifacts (whitepaper, demo video script) to match. See Pattern 1 above.

**Warning signs:** TypeScript build error "Coin<DUSDC> is not in scope at moveCall index 1"; PTB simulates clean but vault.balance increases by less than `borrow_amount`; LoanBorrowed event present but no Supplied event.

### Pitfall 2: Trace-replay parity passes because pre-state was bootstrapped from the trace

**What goes wrong:** The Python `vault_state.replay()` reads `pre.balance`, `pre.total_assets`, `pre.total_shares` from the trace and asserts the *current Python state* matches the trace's `pre`. Then the test "passes" trivially — the Python state was just set to the pre values.

**Why it happens:** Subtle test-design bug. The trace records both pre and post; if the assertion is `assert python_state == trace.pre` BEFORE applying the action, the Python implementation could be entirely missing and the test still passes for the FIRST action.

**How to avoid:** Bootstrap the Python `vault_state` once at the start (`new_seeded()`); after that point, every subsequent `pre` MUST be derived by applying the prior action in Python. Test runs the full sequence in order. Assertion target: every `post` in the trace must match the post-state Python produces AFTER applying the action — never the pre. Document this loop invariant in `replay.py` doc comment.

**Warning signs:** Test passes even when `compute_shares_to_mint` returns the wrong value; sequence length doesn't matter to outcome; mutating a single action's post values in the JSON doesn't fail the test.

### Pitfall 3: Shuffled-label test produces |alpha| > 0.5% APY because shuffle disturbs hedge timing

**What goes wrong:** D-06's shuffled-label test means: take the realized BTC return series, shuffle it (preserving distribution but destroying timing), re-run the strategy. The strategy should produce ~zero alpha because timing — the only edge — is gone. If the test produces persistent non-zero alpha (>0.5% APY), the strategy is exploiting some non-timing feature, which usually means lookahead leak.

**Why it happens:** Shuffling the *labels* (returns) but not the *features* (SVI surface, regime indicators) implicitly preserves a feature-vs-realized-return correlation that wouldn't survive in production. Or: the strategy's hedge mint reads SVI data at fit time and the SVI data was fit on the unshuffled series, leaking.

**How to avoid:** Shuffle **all** time-indexed series in lock-step using a single permutation. Or — more standard — shuffle the *realized* returns into a new series and feed it to a strategy that fits SVI on the shuffled series too. The fit + decision must use the same shuffled tape end-to-end. Cross-check: pre-shuffle hedge cost per bar ≈ post-shuffle hedge cost per bar (distribution-preserving); pre-shuffle PnL volatile, post-shuffle PnL ~zero mean.

**Warning signs:** Shuffled-label test produces persistent alpha; alpha changes sign across different random seeds; shuffling reduces drawdown rather than eliminating it.

### Pitfall 4: VAULT_SHARE-as-collateral whitelist check returns ambiguous result

**What goes wrong:** Plan 03-01 Wave 0 spike attempts to "verify" the whitelist by reading `MarginRegistry.pool_registry` Table. The spike returns "no DUSDC margin pool found" — but that could mean (a) Margin testnet hasn't bootstrapped any pools yet, (b) the pool exists but is keyed differently than expected, or (c) the read query is malformed. CONTEXT.md D-18 needs a date-stamped decision; ambiguity blocks the demo plan.

**Why it happens:** Margin testnet objects are subject to churn (PITFALLS.md Pitfall 6 logic applies to Margin too). The Predict-testnet registry only has 2 entries listed in CLAUDE.md; Margin registry's testnet state is not in CLAUDE.md and may be empty / hand-rolled.

**How to avoid:** Plan 03-01 Wave 0 spike does THREE things: (1) `sui client object <MARGIN_REGISTRY_ID>` via Sui CLI to read full registry state; (2) `sui client object` on suspected DUSDC margin pool ID (if any) — query the Predict server REST endpoint at `https://predict-server.testnet.mystenlabs.com/` for a pools list as a corroborating source; (3) write the dated decision into `.planning/phases/03-backtest-harness-two-protocol-ptb/MARGIN-WHITELIST-DECISION.md` (analogous to Phase 2's `WAVE0-DECISION.md`) with explicit "checked on YYYY-MM-DD; result: X; fallback: mock_margin_pool". If no DUSDC margin pool exists on testnet, the demo PTB borrows nothing — the planner must either deploy a margin pool (out of scope) or document the testnet-only constraint and demonstrate the PTB locally via `sui move test --filter integration_test` in the mock-Margin-pool integration test.

**Warning signs:** Spike output is "TBD" or "unclear"; Margin pool ID is hardcoded in PTB demo without explicit verification step; CONTEXT.md D-18 fallback path executed without trying the live testnet first.

### Pitfall 5: HTML report's Plotly inline pushes file size past judge tolerance

**What goes wrong:** Three Plotly figures × `include_plotlyjs='inline'` = ~9 MB HTML file. Judge opens in browser, slow load, looks unprofessional.

**Why it happens:** `'inline'` embeds the entire plotly.js bundle (~3 MB minified) in EACH figure. Three figures = 9 MB even if the data payload is small.

**How to avoid:** Embed `'inline'` on the FIRST plot (loads plotlyjs), then `'cdn'` (or `'directory'` or False) on subsequent — Plotly detects existing plotlyjs in the page. Or: write a small helper that wraps each `fig.to_html(include_plotlyjs=False)` and prepends ONE plotlyjs CDN tag to the Jinja template. Net file size drops to ~3 MB + data. Verify in CI by asserting `Path('backtest/report.html').stat().st_size < 5_000_000`.

**Warning signs:** `report.html` > 10 MB; judges report slow load; CI artifact upload near GitHub Actions 500 MB limit.

### Pitfall 6: `@strategy_fn` decorator slows pandas operations 100x because every column access wraps

**What goes wrong:** Every `df['col']` becomes a Python-level dispatch through `_GatedFrame.__getitem__`; for a backtest with 8,760 bars × dozens of column reads per bar, this adds 10-100x overhead.

**Why it happens:** Python interpreter overhead on attribute dispatch is significant when called in tight loops.

**How to avoid:** TWO mitigations: (1) `@strategy_fn` is only applied to the **outer** strategy function, not inner numpy/pandas operations. Inside the decorated function, do `local_df = market_data._df` (escape hatch to raw DataFrame) AFTER the gate has validated all reads in the function body. (2) Profile on Day 1: a 30-day backtest run should complete in < 30s. If slower, escape-hatch pattern.

**Warning signs:** Backtest runs slow > 1 min for the 365-day window; profiler shows `_GatedFrame.__getitem__` in top 5; CI nightly-backtest > 10 min.

## Code Examples

### CryptoDataDownload Binance CSV ingestion

```python
# backtest/src/deepvault/data_ingest.py
# Source: https://www.cryptodatadownload.com/cdd/Binance_BTCUSDT_1h.csv (confirmed format)
# CSV header (verified by direct fetch):
#   Unix,Date,Symbol,Open,High,Low,Close,Volume BTC,Volume USDT,tradecount

from pathlib import Path

import pandas as pd
import requests

URL_BTCUSDT_1H = 'https://www.cryptodatadownload.com/cdd/Binance_BTCUSDT_1h.csv'
CACHE_PATH = Path('backtest/data/btcusdt_1h.parquet')

def fetch_btc_hourly(force_redownload: bool = False) -> pd.DataFrame:
    """Fetch the full BTCUSDT hourly history from CryptoDataDownload Binance.
    Caches to parquet on first run; subsequent calls read from cache.
    Returns DataFrame sorted ASCENDING by ts (CSV ships descending — we flip).

    Per CONTEXT.md D-01: 365 days hourly is the active window. This function
    fetches the FULL history (Binance launched 2017-07; ~70k bars as of 2026-05);
    the caller slices to the desired window.

    NOTE: The site requires a free account "for hourly data" per a banner on
    https://www.cryptodatadownload.com/data/binance/. Direct fetch of the CSV
    URL works without auth in practice (verified 2026-05-11), but this could
    change. Backup plan: download via browser session + check into
    backtest/data/btcusdt_1h.parquet via Git LFS (off-CI fetch).
    """
    if CACHE_PATH.exists() and not force_redownload:
        return pd.read_parquet(CACHE_PATH)
    resp = requests.get(URL_BTCUSDT_1H, timeout=60)
    resp.raise_for_status()
    df = pd.read_csv(pd.io.common.BytesIO(resp.content), skiprows=1)
    #                                                    ^^^^^^^^
    # CryptoDataDownload prepends a "Disclaimer" row before the header.
    # If 'Unix' is the first column after skip, we're aligned. Sanity check:
    assert df.columns[0] == 'Unix', f"unexpected column[0]={df.columns[0]!r}; CSV format may have changed"

    # Normalize columns
    df = df.rename(columns={
        'Unix': 'ts_ms',
        'Open': 'open',
        'High': 'high',
        'Low': 'low',
        'Close': 'close',
        'Volume BTC': 'volume_btc',
        'Volume USDT': 'volume_usdt',
        'tradecount': 'trade_count',
    })
    df = df.sort_values('ts_ms', ascending=True).reset_index(drop=True)

    # available_at for D-05 / D-08: a bar's data is available 1 ms after close.
    # close_ts = ts_ms + 3_600_000 (1 hour); available_at = close_ts + 1.
    df['available_at'] = df['ts_ms'] + 3_600_001

    # Persist to parquet for downstream uses (snappy = default; smaller than gzip
    # for this column shape).
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(CACHE_PATH, compression='snappy', index=False)
    return df

def load_window(start_ts_ms: int, end_ts_ms: int) -> pd.DataFrame:
    """Slice the cached BTC tape to (start, end] window.
    Asserts no gap > 1 hour (Binance only goes down for maintenance very rarely;
    we want to LOUDLY fail if it did during our chosen window)."""
    df = fetch_btc_hourly()
    mask = (df['ts_ms'] > start_ts_ms) & (df['ts_ms'] <= end_ts_ms)
    window = df.loc[mask].reset_index(drop=True)
    ts_gaps = window['ts_ms'].diff().dropna()
    bad_gaps = ts_gaps[ts_gaps > 3_600_000 + 60_000]  # > 1h + 1min slack
    if not bad_gaps.empty:
        raise RuntimeError(f"BTC data has {len(bad_gaps)} gap(s) > 1 hour in window")
    return window
```

### PnL attribution six-column computation

```python
# backtest/src/deepvault/pnl_attribution.py
# CITED: CONTEXT.md D-09 six columns; PROJECT.md "PnL attribution including
#        fees, funding, slippage; separate columns for PLP yield, hedge cost,
#        hedge payoff"

import pandas as pd

from .vault_state import VaultState
from .strategy_constants import NAV_SCALE, ALLOCATION_BPS

def compute_attribution(
    actions: list,        # list of Action dicts from trace
    market_data: pd.DataFrame,  # OHLCV with 'open', 'close', 'volume_usdt'
    bar_indexed: bool = True,
) -> pd.DataFrame:
    """Six-column PnL attribution per CONTEXT.md D-09.

    Columns (basis points of pre-bar NAV per share):
      plp_yield_bps:   PLP per-block accrual ((nav_t - nav_t_minus_1) attributed
                        to Predict per-block PLP yield; computed by isolating the
                        yield-only component of total_assets change. v1 model: 0
                        for bars without supply, the post-Predict-accrual delta
                        for bars after supply, per Predict's published per-block
                        rate. See Phase 2 D-13 — no fees in v1. PLP yield comes
                        from Predict's mint+resolve cycle, ~0 for atomic v1 since
                        we BUY hedges (not provide PLP).
                        ASSUMED: Phase 3 v1 plp_yield_bps = 0 everywhere because
                        our vault is a hedge BUYER, not a PLP. The column exists
                        for v2 STRAT-V2-01 expansion.
      hedge_cost_bps:  Premium paid per bar (cost basis of new hedges + new
                        rolls), in bps of pre-bar NAV per share. Sums to
                        cumulative hedge cost across the window.
      hedge_payoff_bps: Settlement payoffs received per bar. Mostly 0 except
                        when a binary hedge settles in our favor (BTC ≤ strike
                        at expiry).
      fees_bps:        Strategy-level fees. v1 = 0 everywhere per Phase 2 D-13.
      slippage_bps:    Next-bar VWAP minus next-bar open (BACK-08 pessimistic
                        fills). For supply bars: (vwap - open) * shares /
                        (deposit_quote). Multiplied by 10_000 for bps.
      gas_bps:         Sui gas at testnet prices, mark in DUSDC equivalent.
                        Reference: a single PTB averages ~5_000_000 MIST (~0.005
                        SUI) per Sui docs gas budget guidance; at SUI = $X
                        (testnet has no market price; assume mainnet $2 for v1
                        modeling). 0.005 * 2 = $0.01 per PTB = 1 bp on a 100
                        DUSDC supply.
                        ASSUMED: 1 bp per supply, 0.5 bp per roll, 0 bp on
                        non-tx bars. Cite Sui docs in assumption ledger.
    """
    rows = []
    for action in actions:
        row = {
            'ts_ms': action['ts_ms'],
            'kind': action['kind'],
            'plp_yield_bps': 0,
            'hedge_cost_bps': 0,
            'hedge_payoff_bps': 0,
            'fees_bps': 0,
            'slippage_bps': 0,
            'gas_bps': 0,
        }
        pre_nav = int(action['pre']['total_assets']) * NAV_SCALE // max(int(action['pre']['total_shares']), 1)
        if action['kind'] == 'supply':
            deposit_quote = int(action['args']['deposit_quote'])
            hedge_alloc = deposit_quote * ALLOCATION_BPS // 10_000
            # Hedge cost = full hedge_alloc (we pay 100% of allocation to buy the binary)
            row['hedge_cost_bps'] = hedge_alloc * 10_000 // max(deposit_quote, 1)
            # Slippage: VWAP - open over next bar
            bar = market_data.loc[market_data['ts_ms'] >= action['ts_ms']].iloc[1]
            vwap = (bar['volume_usdt'] / bar['volume_btc']) if bar['volume_btc'] > 0 else bar['open']
            slip_bps = int((vwap - bar['open']) / bar['open'] * 10_000)
            row['slippage_bps'] = slip_bps
            row['gas_bps'] = 1  # 1 bp per PTB on ~100 DUSDC scale
        elif action['kind'] == 'hedge_mint':
            row['hedge_cost_bps'] = int(action['args']['cost_basis_quote']) * 10_000 // max(int(action['pre']['total_assets']), 1)
            row['gas_bps'] = 1
        elif action['kind'] == 'roll':
            # Roll settles old hedge (payoff) and mints new (cost)
            row['hedge_payoff_bps'] = int(action['args'].get('payoff_quote', 0)) * 10_000 // max(int(action['pre']['total_assets']), 1)
            row['hedge_cost_bps'] = int(action['args'].get('new_cost_basis_quote', 0)) * 10_000 // max(int(action['pre']['total_assets']), 1)
            row['gas_bps'] = 1
        elif action['kind'] in ('redeem_request', 'redeem_fulfill'):
            row['gas_bps'] = 1
        rows.append(row)
    df = pd.DataFrame(rows)
    df['total_bps'] = (
        df['plp_yield_bps'] + df['hedge_cost_bps'] + df['hedge_payoff_bps']
        + df['fees_bps'] + df['slippage_bps'] + df['gas_bps']
    )
    return df
```

### Walk-forward monthly loop (sensitivity table emission)

```python
# backtest/src/deepvault/walk_forward.py
# CITED: CONTEXT.md D-03 / D-04 monthly cadence; PITFALLS.md Pitfall 2 mitigation #2
#        sklearn TimeSeriesSplit docs as canonical reference

import pandas as pd
import numpy as np

from .replay import simulate, strategy_fn
from .vault_state import VaultState

OOS_FRACTION = 0.30  # D-03

def split_walk_forward(data: pd.DataFrame) -> tuple[pd.DataFrame, list[tuple[pd.Timestamp, pd.Timestamp]]]:
    """Return (oos_df, list_of_(calibrate_month_end, deploy_month) for in-sample part).
    Calibration on month N uses data ≤ N-1 (D-04). OOS held back entirely.
    """
    cutoff_idx = int(len(data) * (1 - OOS_FRACTION))
    in_sample = data.iloc[:cutoff_idx].copy()
    oos = data.iloc[cutoff_idx:].copy()
    # Bucket the in-sample by month
    in_sample['month'] = pd.to_datetime(in_sample['ts_ms'], unit='ms').dt.to_period('M')
    months = sorted(in_sample['month'].unique())
    # For each month except first, we have a (calibrate ≤ month-1, deploy month) pair
    windows = [(months[i-1], months[i]) for i in range(1, len(months))]
    return oos, windows

def sensitivity_table(data: pd.DataFrame, ratios=[0.05, 0.10, 0.15, 0.20, 0.30]) -> pd.DataFrame:
    """Run walk-forward for each ratio in the sensitivity grid.
    Per CONTEXT.md Claude's Discretion: v1 ratio (0.10) is PRESERVED regardless
    of which produces the highest Sharpe. This table EXISTS to show robustness
    (the v1 ratio sits in a flat region), NOT to pick the optimum."""
    oos, windows = split_walk_forward(data)
    rows = []
    for r in ratios:
        # The simulation reads ratio from a runtime parameter (NOT from strategy_constants
        # — we don't want to mutate the codegen'd constants during the sweep).
        result = run_walk_forward(data, windows, oos, hedge_ratio=r)
        rows.append({
            'hedge_ratio': r,
            'in_sample_sharpe': result['in_sample_sharpe'],
            'oos_sharpe': result['oos_sharpe'],
            'oos_max_drawdown': result['oos_max_drawdown'],
            'oos_apy': result['oos_apy'],
        })
    return pd.DataFrame(rows)

@strategy_fn(reads=['ts_ms', 'open', 'close', 'svi_params', 'available_at'], writes=[])
def run_walk_forward(market_data, windows, oos, hedge_ratio):
    """Per D-04: calibrate on month N (training data ≤ N-1), deploy on month N+1.
    Returns aggregated metrics across all windows + OOS-only metrics."""
    vault = VaultState.new_seeded()
    for cal_end_month, deploy_month in windows:
        # Calibration phase: any param fit happens here, using ONLY data with
        # available_at < deploy_month start. v1 has no per-window calibration —
        # hedge_ratio is fixed for the entire run. This loop structure is the
        # SCAFFOLDING for v2 dynamic sizing per STRAT-V2-01.
        deploy_start = deploy_month.start_time
        deploy_end = deploy_month.end_time
        bars = market_data[
            (market_data['available_at'] >= int(deploy_start.timestamp() * 1000))
            & (market_data['available_at'] < int(deploy_end.timestamp() * 1000))
        ]
        for _, bar in bars.iterrows():
            # ... simulate one bar's strategy decisions ...
            pass
    # OOS phase: hedge_ratio is locked; no fit happens, only deploy.
    # The OOS DataFrame is passed but the @strategy_fn decorator ensures no future-bar reads.
    # Compute Sharpe / Sortino / max DD on the OOS equity curve.
    return { 'in_sample_sharpe': ..., 'oos_sharpe': ..., 'oos_max_drawdown': ..., 'oos_apy': ... }
```

### Capability-flow grep test (PTB-04 cross-language)

```bash
# .github/workflows/ci.yml — extend existing capability_containment.sh
# (Phase 2 Plan 02-07 installed this for vault.move; Phase 3 adds Margin-side checks)

# Assert TradeCap never returned by value from any public function in deepvault::
if grep -nE 'public fun [^(]*\(.*\).*(TradeCap|DepositCap|WithdrawCap|MarginManager)' contracts/sources/*.move; then
  echo "::error::deepvault module returns Margin capability by value"
  exit 1
fi

# Assert TreasuryCap<SHARE> never returned by value from any public function
if grep -nE 'public fun [^(]*\(.*\).*TreasuryCap<' contracts/sources/*.move; then
  echo "::error::deepvault module returns TreasuryCap by value"
  exit 1
fi

# Assert no public fun on the demo PTB script tries to take a MarginManager owned reference
if grep -nE 'tx\.moveCall.*margin_manager::(consume|take|destroy)' scripts/*.ts; then
  echo "::error::PTB demo extracts MarginManager outside its package"
  exit 1
fi
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Subscribing to Sui events via JSON-RPC WS (`suix_subscribeEvent`) | Polling `client.queryEvents` at 2s cadence with persisted cursor | Documented sunset 2026-07-31 | Phase 3 doesn't subscribe to events (no relay yet — that's Phase 4); but the trace generator reads `result.events` from the tx response directly, which is unaffected by the JSON-RPC sunset. |
| `@mysten/sui.js` (legacy) | `@mysten/sui` v2.16.0 | 2024 rename | Already on the modern SDK; Phase 3 inherits. |
| `predict::supply` PLP yield (we'd be a PLP) | We BUY hedges, not provide PLP | Phase 0/2 strategic decision | This is why `plp_yield_bps` in our six-column attribution is mostly 0 in v1. The column exists for STRAT-V2-01 expansion. |
| Jupyter notebook handoff for backtest reports | HTML institutional report (D-12) | Hackathon discipline | Notebooks are review-only for hand-recompute (D-07); the deliverable is HTML. |
| QuantStats tear-sheet | Bespoke Jinja2 HTML with six-column PnL | DeepVault-specific PnL attribution doesn't fit QuantStats's single-returns-series model | Pattern 6 above. |

**Deprecated / outdated approaches (do not adopt):**
- `subscribeEvent` (TS SDK) / WebSocket JSON-RPC — deprecated. Phase 3 trace generator does NOT subscribe; it reads `result.events` synchronously after each tx — no WS needed.
- Iron Bank / three-protocol PTB — already cut. PTB-01..06 explicitly target two protocols.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `@mysten/deepbook-v3@0.17.0` publishes the `MarginPoolContract` class with builders for `borrow_quote` / `withdraw` / `deposit` | Standard Stack | If 0.17.0 lacks these (it's an older release), planner must either upgrade to a newer version (1.x) — which may have breaking changes from CLAUDE.md's pin — or hand-roll the PTB calls (more work but achievable via raw `tx.moveCall`). Plan 03-01 spike resolves. |
| A2 | A DUSDC margin pool exists on Sui testnet that VAULT_SHARE-as-collateral could be registered against | Common Pitfalls #4 | If no margin pool exists, the live testnet PTB cannot borrow DUSDC. Fallback: mock_margin_pool integration test only; demo PTB demonstrates the Margin Manager creation path but borrows nothing. Plan 03-01 spike resolves; CONTEXT.md D-18 fallback already covers this. |
| A3 | `plp_yield_bps` is ~0 in v1 (we buy hedges, not provide PLP) | PnL Attribution code example | If Predict resolves and our hedge-mint cost basis includes a PLP-yield share-of-fees component, this column should be non-zero. Verify with one supply→roll cycle from `cycle-full.json`. |
| A4 | A single PTB on Sui testnet costs ~5,000,000 MIST (~$0.01 at $2 SUI) | PnL Attribution code example | If gas is higher (e.g., the five-call PTB is more expensive than a three-call), gas_bps underestimates. Calibrate by reading `result.effects.gasUsed.computationCost + storageCost - storageRebate` from the actual demo PTB; update assumption ledger. |
| A5 | Sui Move 2024 `#[test_only]` attribute behaves as documented in the project's CLAUDE.md / vendored rules | Pattern 4 mock Margin pool | Standard Move 2024 feature; very low risk. |
| A6 | CryptoDataDownload's BTCUSDT 1h CSV URL `https://www.cryptodatadownload.com/cdd/Binance_BTCUSDT_1h.csv` remains directly fetchable without auth | Code Examples | If the site adds auth requirements before Phase 3 closes, fallback is to download via browser and commit the parquet to Git LFS (off-CI fetch). |
| A7 | The CSV header is `Unix,Date,Symbol,Open,High,Low,Close,Volume BTC,Volume USDT,tradecount` with a "Disclaimer" prefix row (skiprows=1) | Code Examples | Verified by direct WebFetch on 2026-05-11. If CryptoDataDownload changes format, the `assert df.columns[0] == 'Unix'` guard in `data_ingest.py` fails LOUDLY at fetch time, not silently. |
| A8 | `vault::supply::supply` internally calls `vault::rebalance::buy_hedge_for_deposit` (Phase 2 D-06 atomic-hedge), so the demo PTB does NOT need to call rebalance as a separate top-level moveCall | Pattern 1 + Anti-Patterns | Verified by reading supply.move:89-97 (Phase 2 source). The CONTEXT.md D-17 description that lists three top-level moveCalls is incorrect on this point. |
| A9 | The 8,760 bars/year Sharpe annualization (hourly bars over 365 days) matches institutional hedge-fund convention | PnL Attribution + walk_forward | Standard practice. Alternative is 252 trading days × 24 hours but BTC trades 24/7 — 8,760 is correct. |
| A10 | Plotly's `fig.to_html(include_plotlyjs='inline')` produces an offline-usable HTML page even when reviewer has no internet | Pattern 6 HTML report | Verified by docs (plotly.com/python-api-reference/generated/plotly.io.to_html.html); inline mode embeds full plotly.js bundle. |

## Open Questions (RESOLVED)

**Note (revision iteration 1, 2026-05-11):** Per project convention (Phase 2 precedent), the Open Questions below are resolved at Wave 0 execution time by Plan 03-01's spike, not at plan-check time. **Plan 03-01 (executed 2026-05-12) LANDED the resolutions inline below.** The canonical decision record is [WAVE0-DECISION.md](./WAVE0-DECISION.md).

### RESOLVED — Wave 0 spike results (2026-05-12)

Per Plan 03-01 execution. Each Q below carries an inline `**RESOLVED:**` annotation
immediately under the question prompt. Full evidence + citations: WAVE0-DECISION.md
and MARGIN-WHITELIST-DECISION.md.

1. **Does Margin testnet have a DUSDC margin pool that can be borrowed against?**
   - What we know: CLAUDE.md does not list one; the vendored DeepBookV3 contracts don't specify testnet pool IDs.
   - What's unclear: whether Mysten has bootstrapped any pools on Margin testnet at all (Margin is a separate package from Predict; its testnet launch state is undocumented in our research surface).
   - Recommendation: Plan 03-01 Wave 0 spike runs `sui client object` against the Margin registry (verify the object ID can be found via predict-server REST or Mysten Discord); document result.
   - **RESOLVED:** See [MARGIN-WHITELIST-DECISION.md](./MARGIN-WHITELIST-DECISION.md) for the dated `**Result:**` line (one of `WHITELISTED-LIVE` / `NOT-WHITELISTED-FALLBACK-TO-MOCK` / `UNDETERMINED-FALLBACK-TO-MOCK`). The 5-call PTB shape is locked regardless of outcome; the mock_margin_pool fallback (CONTEXT.md D-18) ships in lockstep.

2. **Does the @mysten/deepbook-v3 SDK at v0.17.0 expose `MarginPoolContract` with `borrow_quote` / `withdraw` / `deposit` builders?**
   - What we know: CLAUDE.md pins 0.17.0 with note "Margin Manager TS SDK"; npm registry shows latest is 1.3.6.
   - What's unclear: whether 0.17.0 is the version where `MarginPoolContract` was first added or whether it's older and lacks builders.
   - Recommendation: Plan 03-01 Wave 0 spike installs 0.17.0, imports `MarginPoolContract`, and runs `console.log(Object.keys(MarginPoolContract.prototype))` to enumerate. If builders missing, upgrade to 1.x with explicit risk note.
   - **RESOLVED:** See WAVE0-DECISION.md `## SDK introspection evidence` section for the pinned version + Object.keys output. Decision logic: pin 0.17.0 if it exposes builders; else try 1.3.6 + document deviation; else fall back to raw `tx.moveCall`. Plan 03-05's two-protocol-ptb-demo.ts uses whichever path WAVE0-DECISION.md locks.

3. **What's the exact Predict per-block PLP yield rate? Should `plp_yield_bps` model anything non-zero in v1?**
   - What we know: We BUY hedges via `predict::mint`, not provide PLP via `predict::supply`. So our `total_assets` change between bars only reflects (a) realized hedge settlements, (b) gas spent, and (c) supply/redeem flows.
   - What's unclear: whether holding a binary position (Coin<PLP>?) accrues per-block yield to the holder — this is Predict-internal behavior we'd need to confirm by reading vendored `predict.move` mint+resolve flow.
   - Recommendation: Plan 03-01 doc spike on `predict.move:219-310` (mint, resolve, redeem); update PnL attribution v1 model based on findings.
   - **RESOLVED:** v1 model = **`plp_yield_bps = 0`**. We are a hedge BUYER, not a PLP provider. The six-column accountant reserves the column for v2 STRAT-V2-01 expansion (where holding a Coin<PLP> would accrue per-block yield) but emits identically zero in v1. Documented in `backtest/src/deepvault/pnl_attribution.py` docstring as Assumption A3. See WAVE0-DECISION.md Q3 section.

4. **Will the 365-day backtest run complete in <10 min in CI?**
   - What we know: hourly bars × 365 days = 8,760 bars; each bar is a few @strategy_fn calls + a few state updates.
   - What's unclear: whether `@strategy_fn`'s wrapper overhead pushes runtime over the nightly-CI budget.
   - Recommendation: Plan 03-02 timing micro-benchmark on a 7-day fixture; extrapolate to 365 days; if > 10 min, apply Pitfall 6 escape hatch.
   - **RESOLVED:** See WAVE0-DECISION.md `## Runtime budget micro-benchmark` for the verdict (`PASS` / `CONDITIONAL PASS` / `FAIL`) with measured 7-day elapsed and 365-day extrapolated numbers. Escape-hatch requirement (Pitfall 6 mitigation) flagged per the conditional-pass branch.

5. **Does the e2e-vault-cycle.ts capture full event payloads in a format Python can parse?**
   - What we know: `result.events[i].parsedJson` is BCS-decoded by @mysten/sui; type information is in `result.events[i].type`.
   - What's unclear: whether MarketKey (a u8-vector-keyed struct) round-trips cleanly through JSON.
   - Recommendation: Plan 03-03 micro-test: capture one trace, parse in Python, assert all events round-trip.
   - **RESOLVED:** See WAVE0-DECISION.md `## Event JSON round-trip check`. Pinned convention: **u64 fields as strings**, IDs as hex strings, direction as u8 int. Plan 03-05 (PTB demo) and Plan 03-06 (replay parity) emit/consume the same shape.

6. **Does the testnet `cycle-full.json` trace capture take longer than the CI nightly window?**
   - What we know: The cycle requires a 1h real-time wait per D-01 redeem cooldown; CI timeout-minutes for the existing nightly-e2e-vault.yml is 90.
   - What's unclear: whether Phase 3's full cycle (which includes the five-call PTB lead-in) fits.
   - Recommendation: Plan 03-04 sequences capture as: (a) per-push CI uses FAST_FORWARD=1 against integration_test.move (no real wait), (b) nightly job runs the full real-time capture and updates `cycle-full.json` as a workflow artifact. The trace is the ARTIFACT, not a checked-in file (committed only at Phase 3 closure).
   - **RESOLVED:** See WAVE0-DECISION.md `## Nightly schedule slot`. **nightly-backtest.yml: 05:00 UTC (`cron: '0 5 * * *'`)**, one hour past nightly-e2e-vault (04:00 UTC) and two hours past nightly-prover (03:00 UTC). `timeout-minutes: 60` budget. Avoids GHA runner-pool + testnet RPC contention.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Sui CLI | Move integration_test, mock_margin_pool tests | ✓ (via Phase 0 install) | `mainnet-v1.71.1` | — |
| Node.js | scripts/two-protocol-ptb-demo.ts | ✓ | ≥ 22 LTS (per CLAUDE.md) | — |
| Python 3.12+ | All backtest harness | ✓ (via Phase 0 uv setup) | 3.12+ | — |
| uv | Backtest dep mgmt | ✓ (Phase 0) | — | pip + requirements.txt rejected per CLAUDE.md |
| pnpm | TS workspace | ✓ (Phase 0) | — | — |
| Internet at Plan 03-01 time | One-time BTC OHLCV download | ✓ (assume) | — | Pre-fetched parquet checked into Git LFS |
| Testnet wallet with DUSDC + BTC | Plan 03-PTB live cycle | ⚠ (only DUSDC; Phase 2 Plan 02-09 fresh-wallet has DUSDC faucet path; BTC testnet faucet unclear) | — | If no testnet BTC available, demo PTB borrows DUSDC against a non-BTC collateral (whatever the testnet Margin pool accepts). Document. |
| Sui testnet RPC `https://fullnode.testnet.sui.io` | Live testnet PTB | ✓ | — | — |
| Predict testnet server `https://predict-server.testnet.mystenlabs.com` | Optional (for pool listing) | ✓ (per CLAUDE.md) | — | Direct on-chain reads via sui client object |
| @mysten/deepbook-v3 SDK | Margin PTB builders | ⚠ (CLAUDE.md pins 0.17.0; npm has 1.3.6) | Resolve in spike | Raw `tx.moveCall` to margin_manager:: targets if SDK builders unavailable |
| Mock Margin Pool dependency | PTB-04, PTB-05 | ✓ (we write it as `#[test_only]`) | — | — |

**Missing dependencies with no fallback:** None — Phase 3 is fully scoped within the existing toolchain.

**Missing dependencies with fallback:**
- DUSDC margin pool on testnet (per A2 / Open Q1): fallback is mock_margin_pool integration test ONLY; live PTB demo borrows nothing. CONTEXT.md D-18 already documents this fallback policy.
- @mysten/deepbook-v3 SDK builder support: fallback is raw `tx.moveCall` to `margin_manager` package — slightly more verbose but achievable.
- Testnet BTC for collateral (per A2): fallback is whatever non-DUSDC asset testnet Margin pool accepts (e.g., SUI as collateral, DUSDC as quote).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework (Move) | `sui move test` (built-in, via Sui CLI `mainnet-v1.71.1`) |
| Framework (Python) | `pytest ≥8.3` (already in `backtest/pyproject.toml`) |
| Framework (TypeScript) | `vitest 4.x` (already in dashboard workspace from Phase 1) |
| Config file (Python) | `backtest/pyproject.toml` `[tool.pytest.ini_options]` |
| Quick run command | `cd backtest && uv run pytest tests/test_vault_state.py tests/test_replay_parity.py -x` (per-push, hermetic, <30s) |
| Full suite command | `cd backtest && uv run pytest -v` + `cd contracts && sui move test --gas-limit 100000000000` + `pnpm -C dashboard test` |
| Phase gate | All three runtimes green + nightly-backtest.yml's HTML report uploaded as workflow artifact + parity job continues green |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BACK-01 | BTC OHLCV ingested into parquet | unit | `cd backtest && uv run pytest tests/test_data_ingest.py -x` | ❌ Wave 0 |
| BACK-02 | `vault_state` machine produces correct state on supply/redeem/hedge_mint | unit | `cd backtest && uv run pytest tests/test_vault_state.py -x` | ❌ Wave 0 |
| BACK-03 | `@strategy_fn(reads=, writes=)` decorator raises on undeclared access | unit | `cd backtest && uv run pytest tests/test_lookahead_audit.py::test_decorator_raises_on_undeclared_read -x` | ❌ Wave 0 |
| BACK-04 | Move↔Python state-machine parity within 1 wei across full cycle | integration | `cd backtest && uv run pytest tests/test_replay_parity.py -x` | ❌ Wave 0 |
| BACK-05 | 365 days covered; ≥2 stress events; ≥1 in OOS | smoke | manual review of report Section 4 + Section 8 | manual-only |
| BACK-06 | Shuffled-label test produces \|alpha\| ≤ 0.5% APY | integration | `cd backtest && uv run pytest tests/test_lookahead_audit.py::test_shuffled_label_alpha -x` | ❌ Wave 0 |
| BACK-07 | OOS 30% is never written to during calibration | property | `cd backtest && uv run pytest tests/test_walk_forward.py::test_oos_holdout_invariant -x` | ❌ Wave 0 |
| BACK-08 | PnL attribution sums to total return per bar | unit | `cd backtest && uv run pytest tests/test_pnl_attribution.py::test_six_columns_sum_to_total -x` | ❌ Wave 0 |
| BACK-09 | Sharpe + Sortino + max DD computed only on OOS | unit | `cd backtest && uv run pytest tests/test_walk_forward.py::test_metrics_oos_only -x` | ❌ Wave 0 |
| BACK-10 | HTML report renders 11 sections, < 10 MB, valid HTML | integration | `cd backtest && uv run pytest tests/test_report.py::test_render_html -x` + `python -c "import bs4; bs4.BeautifulSoup(open('backtest/report.html').read(), 'html.parser')"` | ❌ Wave 0 |
| PTB-01 | MarginManager wraps BalanceManager + TradeCap, never exposes TradeCap | grep | `bash scripts/capability_containment.sh` (extend Phase 2's) | ✓ Phase 2 (extends) |
| PTB-02 | VAULT_SHARE-collateral whitelist verified or fallback decision recorded | manual | `cat .planning/phases/03-backtest-harness-two-protocol-ptb/MARGIN-WHITELIST-DECISION.md` | ❌ Wave 0 |
| PTB-03 | Five-call PTB completes on testnet with deterministic tx digest | smoke | `node --experimental-vm-modules scripts/two-protocol-ptb-demo.ts` | ❌ Wave 0 |
| PTB-04 | No public function in deepvault returns TradeCap or TreasuryCap by value | grep | `bash scripts/capability_containment.sh` | ✓ Phase 2 (extends) |
| PTB-05 | −30% NAV shock triggers Margin liquidation; worst_case_nav matches Python within 1 wei | property | `cd contracts && sui move test --filter liquidation_test --gas-limit 100000000000` + `cd backtest && uv run pytest tests/test_liquidation_parity.py -x` | ❌ Wave 0 |
| PTB-06 | Fresh-wallet testnet PTB completes; tx digest captured | smoke | `SUI_PRIVATE_KEY=$(sui keytool generate ...) node scripts/two-protocol-ptb-demo.ts` (manual) | manual-only |

### Sampling Rate
- **Per task commit:** `cd backtest && uv run pytest tests/test_vault_state.py tests/test_replay_parity.py -x` (~10s); `cd contracts && sui move test --filter integration_test --gas-limit 100000000000` (~30s; reuses Phase 2's per-push e2e-vault gate)
- **Per wave merge:** Full suite — all backtest tests + Move test suite + parity job
- **Phase gate:** Full suite green + nightly-backtest.yml's first successful run + HTML report artifact accessible

### Wave 0 Gaps
- [ ] `backtest/tests/test_vault_state.py` — covers BACK-02
- [ ] `backtest/tests/test_replay_parity.py` — covers BACK-04
- [ ] `backtest/tests/test_lookahead_audit.py` — covers BACK-03, BACK-06
- [ ] `backtest/tests/test_walk_forward.py` — covers BACK-07, BACK-09
- [ ] `backtest/tests/test_pnl_attribution.py` — covers BACK-08
- [ ] `backtest/tests/test_data_ingest.py` — covers BACK-01
- [ ] `backtest/tests/test_report.py` — covers BACK-10
- [ ] `backtest/tests/test_liquidation_parity.py` — covers PTB-05 Python side
- [ ] `contracts/tests/liquidation_test.move` — covers PTB-05 Move side
- [ ] `contracts/tests/ptb_capability_test.move` — covers PTB-04 (Move-side)
- [ ] `contracts/tests/mock_margin_pool.move` — supports PTB-05 + D-18 readiness
- [ ] `backtest/notebooks/hand-recompute.ipynb` — covers D-07
- [ ] `.planning/backtest-assumptions.md` — covers D-05
- [ ] `.planning/phases/03-backtest-harness-two-protocol-ptb/MARGIN-WHITELIST-DECISION.md` — covers PTB-02

## Security Domain

> Phase 3 is the first phase where TradeCap discipline becomes externally observable (via the demo PTB) and where the liquidation path is exercised. Security focus is on capability containment + LTV math correctness under stress.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (no auth flow — wallet signs PTBs) | n/a |
| V3 Session Management | no | n/a |
| V4 Access Control | yes | Move capability discipline — TradeCap inside MarginManager (margin_manager.move:76); TreasuryCap<SHARE> inside Vault (vault.move:95); AdminCap key-only (vault.move:87). Grep CI gate enforces no public-by-value-return of any cap (Phase 2 prior art extended in Phase 3). |
| V5 Input Validation | yes | `tx.pure.u64(amount)` bounds — overflow rejected by Move u64 semantics; PTB shape validated at TS build time; mock_margin_pool asserts collateral type is registered before lending. |
| V6 Cryptography | no (no custom crypto in Phase 3) | All crypto goes through @mysten/sui keypair APIs (Ed25519) |

### Known Threat Patterns for Sui Move + Python

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Capability extraction via accidental `public entry` return | Elevation of Privilege | Capability containment grep in CI (Phase 2 pattern extended for Margin) |
| LTV bypass via using current_nav instead of worst_case_nav | Tampering | `vault::ltv::worst_case_nav_per_share` (ltv.move:60) — pessimistic; Move test in liquidation_test.move asserts mock_margin_pool reads worst_case, not current |
| Backtest with shuffled lookahead leak | Tampering | Shuffled-label sanity test (D-06); `@strategy_fn` decorator (D-08); hand recompute (D-07) |
| First-deposit share inflation attack | Tampering | Already mitigated in Phase 2 (virtual-shares + seed-burn — see supply.move:148-156). Phase 3 `vault_state.py` MUST port the same virtual-shares math; assert in `test_vault_state.py` that `compute_shares_to_mint(deposit=1)` does NOT produce shares disproportionate to virtual_shares |
| Re-using ephemeral keypair across CI runs | Information Disclosure | Fresh `Ed25519Keypair.generate()` per CI run; `SUI_PRIVATE_KEY` for the demo is per-CI-session, not committed |
| Trace JSON tampered between capture and replay | Tampering | Trace is a workflow artifact; SHA-256 hash recorded; Python replay verifies hash before consuming (defense in depth) |

## Sources

### Primary (HIGH confidence)
- **Vendored DeepBookV3 source at SHA `1159d79af33c70e09e406310e1d8f067832ede9d`:**
  - `scripts/deepbookv3/packages/deepbook_margin/sources/margin_manager.move:558-643` — borrow_base + borrow_quote signatures (no Coin return; auto-deposit via deposit_int)
  - `scripts/deepbookv3/packages/deepbook_margin/sources/margin_manager.move:458-555` — withdraw signature (RETURNS Coin<WithdrawAsset>)
  - `scripts/deepbookv3/packages/deepbook_margin/sources/margin_manager.move:324-336` — `new<Base,Quote>` shared-object creation
  - `scripts/deepbookv3/packages/deepbook_margin/sources/margin_manager.move:68-81` — MarginManager struct (BalanceManager + DepositCap + WithdrawCap + TradeCap, all private fields)
  - `scripts/deepbookv3/packages/deepbook_margin/sources/margin_registry.move:232` — register_deepbook_pool (MaintainerCap-gated; relevant to PTB-02 spike)
  - `scripts/deepbookv3/packages/deepbook_margin/tests/margin_manager_tests.move:138-203` — canonical borrow_quote test patterns
  - `scripts/deepbookv3/packages/deepbook_margin/tests/helper/test_helpers.move` — mock Margin protocol-level test helpers (Pattern 4 inspiration)
- **Phase 2 outputs:**
  - `contracts/sources/supply.move:61-117` — supply signature (takes Coin<Quote>, internally calls rebalance::buy_hedge_for_deposit)
  - `contracts/sources/rebalance.move:219-289` — buy_hedge_for_deposit (public(package), NOT callable from PTB)
  - `contracts/sources/ltv.move:60-68` — worst_case_nav_per_share (the LTV gate the −30% shock test asserts against)
  - `scripts/e2e-vault-cycle.ts` — Phase 2 TS prior art for vault::supply::supply call shape
- **Phase 1 outputs:**
  - `backtest/src/deepvault/parity_runner.py:37-60` — exact-equality parity assertion pattern at 1 unit / 1e9
  - `backtest/src/deepvault/strategy_constants.py` — codegen'd constants
- **CryptoDataDownload Binance:**
  - `https://www.cryptodatadownload.com/cdd/Binance_BTCUSDT_1h.csv` — verified header `Unix,Date,Symbol,Open,High,Low,Close,Volume BTC,Volume USDT,tradecount` via direct WebFetch on 2026-05-11

### Secondary (MEDIUM confidence)
- [@mysten/deepbook-v3 npm latest 1.3.6](https://www.npmjs.com/package/@mysten/deepbook-v3) — registry confirms latest version; 0.17.0 pin per CLAUDE.md is older series
- [Sui CLI mainnet-v1.71.1 release](https://github.com/MystenLabs/sui/releases) — Phase 0 baseline, still current
- [Jinja2 3.1.6 (2025-03-05)](https://pypi.org/pypi/Jinja2/json) — pypi confirmed
- [plotly.io.to_html docs](https://plotly.com/python-api-reference/generated/plotly.io.to_html.html) — `include_plotlyjs='inline'` vs `'cdn'` behavior
- [@mysten/sui Transaction docs](https://sdk.mystenlabs.com/typescript/transaction-building/basics) — moveCall return value piping
- [PITFALLS.md (.planning/research/)](.planning/research/PITFALLS.md) — Pitfall 1 (lookahead), Pitfall 2 (overfit), Pitfall 6 (Predict churn), Pitfall 12 (rounding), Pitfall 13 (token bucket)
- [ARCHITECTURE.md §"7. Python Backtest Harness"](.planning/research/ARCHITECTURE.md) — semantic alignment via shared constants + golden vectors + state-machine trace replay

### Tertiary (LOW confidence — flagged for verification)
- DUSDC margin pool existence on Sui testnet — no Mysten doc lists testnet Margin pool IDs; must be verified in Plan 03-01 spike
- Sui testnet gas per-PTB (~5_000_000 MIST estimate) — Sui docs mention 2_000 MIST minimum, 50 SUI max; per-PTB average is documented anecdotally only. Calibrate via `result.effects.gasUsed` in the actual demo PTB at Plan 03-PTB
- Predict per-block PLP yield rate — not surfaced in our research; Plan 03-01 doc spike resolves
- `@mysten/deepbook-v3@0.17.0` exact API surface — claimed but not enumerated; Plan 03-01 spike imports + introspects

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every Python dep already pinned in pyproject.toml; new deps (Jinja2, Plotly) are mature/canonical; @mysten/sui pinned via Phase 2; @mysten/deepbook-v3 version pin from CLAUDE.md flagged for Wave 0 verification
- Architecture (Track A PTB shape): HIGH — five-call shape verified by reading vendored Margin source (auto-deposit + explicit withdraw); supply.move internals confirm rebalance is public(package), so the demo MUST call supply not rebalance
- Architecture (Track B Python state machine): HIGH — direct port of Phase 1 parity discipline + Phase 2 Move state to Python; pattern is proven
- Pitfalls: HIGH — six pitfalls enumerated; first one (PTB shape) is the most consequential and verified empirically
- Walk-forward + lookahead audit: HIGH — quant Python idioms are standard; Pattern 5 decorator design is ~30 LOC and proven elsewhere

**Research date:** 2026-05-11
**Valid until:** 2026-06-08 (4 weeks; this is a fast-moving area — Margin contract churn, npm package updates). If Phase 3 hasn't closed by then, re-spike Margin testnet pool state.
