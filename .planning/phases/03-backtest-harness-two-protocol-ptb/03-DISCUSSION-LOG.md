# Phase 3: Backtest Harness + Two-Protocol PTB - Discussion Log

**Date:** 2026-05-11
**Phase:** 03-backtest-harness-two-protocol-ptb
**Mode:** discuss (auto-active; default 4-question turns batched into 2 multi-question rounds)

---

## Areas Discussed (user selection)

User multi-selected all 4 surfaced gray areas:

1. Backtest data window + stress event
2. VAULT_SHARE whitelist fallback policy
3. Report format + chart inventory
4. Trace-replay parity scope

---

## Round 1 — Backtest scope + report

### Q: Backtest data window + bar resolution?

**Options presented:**
- 365 days hourly (Recommended) — ~8,760 bars, two regimes, clean 70/30 walk-forward
- 180 days hourly — tighter scope, stress-event coverage is luck-of-draw
- 90 days hourly — bare minimum, OOS 30% is only 27 days
- 365 days daily + 90 days hourly — dual-resolution

**User selected:** 365 days hourly (Recommended)

**Recorded as:** D-01 (365d hourly BTC OHLCV from CryptoDataDownload Binance)

### Q: Stress event(s) the report features?

**Options presented (multiSelect):**
- August 5 2024 yen-carry unwind (Recommended) — BTC −15% intraday
- Q1 2025 selloff or 2026 vol event — recent, within window
- March 2023 SVB / banking crisis — out of 365-day window
- Synthetic ±5σ shock — reviewers discount synthetic events

**User selected:** Aug 5 2024 yen-carry unwind, Q1 2025 selloff or 2026 vol event

**Recorded as:** D-02 (two stress events, at least one in OOS holdout)

### Q: Report primary format?

**Options presented:**
- HTML standalone (Recommended) — embedded Plotly + inline PNG matplotlib
- PDF via WeasyPrint or matplotlib only — slower iteration, static 3D
- Both — HTML primary, PDF on demand via --export-pdf flag

**User selected:** HTML standalone (Recommended)

**Recorded as:** D-12 (HTML standalone; PDF export deferred to backlog)

---

## Round 2 — Whitelist policy + trace-replay scope

### Q: VAULT_SHARE-as-Margin-collateral fallback policy?

**Options presented:**
- Ship quote-only demo first; treat whitelist as bonus (Recommended) — zero scramble risk
- Block on whitelist confirmation — 39-day timeline risk
- Build BOTH demo paths up-front — +2 days scope

**User selected:** Ship quote-only demo first; treat whitelist as bonus (Recommended)

**Recorded as:** D-17 (DUSDC borrow PTB) + D-18 (fallback policy)

### Q: Documented-future statement scope (if whitelist isn't confirmed)?

**Options presented (multiSelect):**
- PROJECT.md scope section (Recommended)
- Whitepaper / submission deck explicit slide
- Integration test against mock Margin pool

**User selected:** all three

**Recorded as:** D-18 (three documented-future artifacts: PROJECT.md update, whitepaper slide, mock-Margin-pool integration test in `contracts/tests/mock_margin_pool.move`)

### Q: Trace-replay parity scope (BACK-04)?

**Options presented:**
- Full cycle: supply → hedge → roll → redeem (Recommended)
- Supply + redeem only (no hedge/roll) — skips hardest parity case
- Supply + hedge (skip redeem and roll) — covers atomic single-PTB only

**User selected:** Full cycle: supply → hedge → roll → redeem (Recommended)

**Recorded as:** D-15 (full-cycle trace at `backtest/traces/cycle-full.json`)

### Q: Trace generation method?

**Options presented:**
- Live testnet PTB → JSON dump (Recommended) — strongest parity proof
- Hand-authored Python test fixture — faster but lookahead-adjacent risk

**User selected:** Live testnet PTB → JSON dump (Recommended)

**Recorded as:** D-16 (live testnet trace generation, no synthetic fixtures)

---

## Decisions Not Asked (Claude's Discretion)

Captured directly in CONTEXT.md `<decisions>` and `### Claude's Discretion` blocks without user prompts:

- Walk-forward cadence = monthly (Pitfall 2 standard pattern)
- OOS split = most recent 30% of window (~110 days)
- Assumption ledger at `.planning/backtest-assumptions.md`
- Shuffled-label test threshold: |alpha| ≤ 0.5% APY
- 3-row hand recompute in `backtest/notebooks/hand-recompute.ipynb` with seeded RNG
- `@strategy_fn(reads=..., writes=...)` decorator enforces the bar-split (BACK-03)
- PnL attribution columns: 6 (plp_yield_bps, hedge_cost_bps, hedge_payoff_bps, fees_bps, slippage_bps, gas_bps)
- Sharpe annualization: 8,760 bars/year, rf = 0
- Hedge ratio sensitivity table: {0.05, 0.10, 0.15, 0.20, 0.30}; no retrospective re-tuning
- Report sections (11): exec summary, assumption ledger, strategy description, data ledger, walk-forward methodology + OOS, PnL attribution, drawdown + risk, stress event narrative, sensitivity table, shuffled-label result, hand recompute appendix
- Backtest module layout: vault_state.py, replay.py, data_ingest.py, walk_forward.py, lookahead_audit.py, pnl_attribution.py, report.py (≤250 lines each)
- Action-trace JSON schema (vault_id, package_id, actions[] with kind/tx_digest/ts_ms/args/effects/balance_delta/shares_delta/events)
- PTB demo at `scripts/two-protocol-ptb-demo.ts`
- Capability-flow test at `contracts/tests/ptb_capability_test.move` + Python grep gate
- Mock Margin pool at `contracts/tests/mock_margin_pool.move`
- CI cost budget: nightly-backtest.yml for full 365-day run; per-push CI uses 7-day micro-fixture
- No Deribit IV history (BACK-01 says "if available"; skip — 1-line note in assumption ledger)
- Stress event narrative format: 4 charts per event (BTC price + NAV + hedge payoff + drawdown)
- Cold-read test mandatory for report

---

## Deferred Ideas (captured for future phases)

- Deribit IV history ingestion → v2 backtest fidelity
- PDF report export → backlog (post-submission)
- Dynamic hedge sizing → STRAT-V2
- VAULT_SHARE-as-Margin-collateral LIVE demo → gated on Mysten whitelist
- Per-second hedge re-mark in Python → v2 backtest fidelity
- What-if simulator backend → Phase 4 dashboard
- Minute-bar resolution → v2 if HFT use case
- 365+ day history → v2 if BACK-05 stress coverage needs widening
- Multi-asset backtest (ETH/SOL) → STRAT-V2-03

---

## Scope Creep Redirected

None during this discussion — all user-selected options stayed within Phase 3 boundary.

---

## Canonical References Surfaced

The user did not introduce new external docs during discussion. The CONTEXT.md `<canonical_refs>` block accumulates:

- ROADMAP Phase 3 references (PROJECT.md, REQUIREMENTS.md, ROADMAP.md, STATE.md)
- Prior CONTEXTs (00, 01, 02) — load-bearing decisions
- Research outputs: ARCHITECTURE.md (Python backtest tier + two-protocol PTB shape + whitelist critical-path-risk), PITFALLS.md §1 lookahead bias + §2 hindsight tuning + §6 Predict churn, STACK.md, FEATURES.md
- Code artifacts: vault.move/supply.move/redeem.move/rebalance.move/ltv.move (Phase 2), svi.py/phi.py/isqrt.py/ln.py/arb_checker.py/parity_runner.py (Phase 1), strategy_constants.* codegen trio, e2e-vault-cycle.ts (Phase 2)
- External: DeepBook Margin docs, @mysten/deepbook-v3 Margin Manager TS SDK, CryptoDataDownload Binance, Gatheral & Jacquier 2014 SSVI paper, OpenZeppelin ERC-4626

---

*Discussion completed: 2026-05-11*
*Next: /gsd-plan-phase 3*
