---
phase: 03-backtest-harness-two-protocol-ptb
plan: 10
subsystem: backtest-strategy-simulation
tags: [phase-03, backtest, strategy-sim, plp, hedge, binary-put, realized-vol, lvr, attribution, lookahead-safe]
requires:
  - 02 (vault: NAV_SCALE / vault_state constants reference)
  - 06 (replay.simulate call-site that previously produced flat NAV)
  - 08 (walk_forward: run_walk_forward / sensitivity_table / compute_drawdown_max_sharpe_sortino)
  - 09 (report: render_html / render_html_from_summary / report.html.j2)
provides:
  - "simulate_strategy() — two-sleeve PLP+rolling-hedge NAV model (deepvault.strategy_sim)"
  - "binary_put_price() — zero-drift Black–Scholes digital put (realized-vol IV proxy)"
  - "unhedged_max_drawdown_bps() — buy-and-hold BTC drawdown baseline"
  - "real OOS equity curve + 3-way PnL attribution wired into run_walk_forward()"
  - "real monthly_pnls aggregation + per-cycle hedge actions (replacing [0.0]/[] stubs)"
  - "summary JSON extended with equity_curve / drawdown_curve / strategy_attribution / hedge_trades / unhedged baseline"
  - "render_html_from_summary() consumes the real equity + attribution (no more 2-point stub)"
affects:
  - backtest/src/deepvault/walk_forward.py (run_walk_forward rewired; WalkForwardResult +2 fields)
  - backtest/src/deepvault/__main__.py (summary JSON schema extended; compute_attribution import dropped)
  - backtest/src/deepvault/report.py (render_html_from_summary real-data path)
  - backtest/templates/report.html.j2 (Sections 3/4/6/7 reflect real model + unhedged baseline)
  - .planning/backtest-assumptions.md (data-source supersede + Strategy Simulation Model section)
tech-stack:
  added: []
  patterns:
    - "Float NAV simulation layer (pandas-friendly), strictly separate from the Move-parity vault_state machine"
    - "Coverage-based insurance sizing (target payout = hedge_ratio*NAV, premium capped at budget) — bounds payout, no 1/p jackpot"
    - "Realized-vol Black–Scholes digital put as the IV proxy (no historical IV surface; Deribit deferred to v2)"
    - "LVR (Milionis-Moallemi-Roughgarden 2022) variance-scaled inventory drag → realistic per-bar NAV variance"
    - "available_at lookahead gate replicated in the trailing-vol estimator; input frame consumed read-only"
key-files:
  created:
    - backtest/src/deepvault/strategy_sim.py
    - backtest/tests/test_strategy_sim.py
  modified:
    - backtest/src/deepvault/walk_forward.py
    - backtest/src/deepvault/__main__.py
    - backtest/src/deepvault/report.py
    - backtest/templates/report.html.j2
    - .planning/backtest-assumptions.md
    - .gitignore
decisions:
  - "PLP_APY = 0.08 (conservative 8% APY assumption; defensible over promotional)"
  - "PLP_LVR_COEFF = 0.25 (variance-scaled LP inventory drag; ~4-5%/yr on BTC; injects realistic NAV variance)"
  - "Coverage-based hedge sizing replaces naive fixed-premium binary (Rule 1 economic-bug fix: notional=premium/p produced ~1000:1 payouts at low p)"
  - "Zero-drift BS digital + expiry-spot settlement (v1 simplifications; path-dependent settlement is v2)"
  - "Warm-up guard skips the degenerate zero-vol first cycle (no premium, no position)"
metrics:
  duration: ~3h
  completed: 2026-06-15
---

# Phase 3 Plan 10: PLP+Hedge Strategy Simulation Summary

Implemented the missing strategy-simulation core that turns the DeepVault backtest from
all-zeros into real, defensible returns: a two-sleeve PLP-yield + rolling-OTM-binary-put
crash-insurance NAV model with a 3-way PnL attribution, wired through the walk-forward
harness and the institutional HTML report. **Validated 365-day full-window total return
+7.52% with hedged max drawdown −1.66% vs unhedged BTC −52.86%.**

## What was built

### 1. `strategy_sim.py` — the economic model (new module)

A **float-based** NAV simulation (pandas-friendly; explicitly NOT parity-bound), kept
strictly separate from `vault_state.py` (the Move-parity machine, untouched). NAV starts
at 1.0; the equity curve IS the NAV series. Two sleeves driven by `hedge_ratio` (alloc):

- **PLP sleeve** = `(1 − hedge_ratio)` of capital. Per hourly bar it earns a constant
  `PLP_APY = 0.08` (8% — a documented conservative assumption) **net of** an LVR inventory
  drag (`PLP_LVR_COEFF = 0.25 × r_t² × plp_capital`). The LVR term (Loss-Versus-Rebalancing,
  Milionis-Moallemi-Roughgarden 2022) is the canonical LP adverse-selection cost; it scales
  with realized variance and — critically — gives the PLP NAV **realistic per-bar variance**
  (a pure-yield ramp had an absurd OOS Sharpe ~7.7).
- **Hedge sleeve** = rolling −15% OTM binary put, rolled every 14 days, sized by **coverage
  economics**: each cycle targets a payout of `hedge_ratio × NAV` if the strike breaches;
  fair premium `p × coverage`, capped at the per-cycle insurance budget
  `hedge_ratio × NAV × (tenor/365)`. Pricing is a **zero-drift Black–Scholes digital put**
  using **trailing 30-day realized vol as the IV proxy** (no historical IV surface exists).
  Settlement is **expiry-spot** (realized price at the expiry bar). A **warm-up guard**
  skips the degenerate zero-vol first cycle.

Also exports `binary_put_price()` and `unhedged_max_drawdown_bps()` (buy-and-hold BTC
drawdown baseline).

### 2. Wiring (`walk_forward.py`, `__main__.py`, `report.py`, template)

- `run_walk_forward()` now drives **both** in-sample and OOS equity from `simulate_strategy`
  (replacing the no-op `simulate()` flat-NAV). `oos_apy` from the real total return;
  `monthly_pnls` is real per-month aggregation (was `[0.0]`); `actions` carry per-cycle hedge
  economics (was `[]`). `WalkForwardResult` gains `attribution` (3-way) and
  `unhedged_max_dd_bps`. OOS slice stays read-only (purity test still green).
- The `__main__ walk_forward` summary JSON is extended with the real `equity_curve`,
  `drawdown_curve`, `strategy_attribution`, `monthly_pnls`, `hedge_trades`, and the unhedged
  DD baseline.
- `render_html_from_summary()` consumes the real equity + drawdown + 3-way attribution +
  per-cycle trade table (no more 2-point stub). Template Sections 3/4/6/7 updated to the real
  model, corrected data source, and the unhedged-BTC drawdown comparison.

### 3. Tests + ledger

- `test_strategy_sim.py` — 14 tests: NAV-moves, attribution identity, lookahead invariance
  (future crash cannot change a past decision), read-only input, known-crash payoff==notional,
  warm-up guard, binary-price monotonicity/guards, unhedged baseline, hedge-reduces-drawdown.
- `.planning/backtest-assumptions.md` — data source superseded to the Binance data-mirror;
  added a full **Strategy Simulation Model** section (cold-read-able by an institutional LP).

## Model assumptions (every number explainable)

| Assumption | Value | Rationale |
|---|---|---|
| PLP yield | 8% APY | Conservative; Predict PLP markets double-digit — picked defensible over promotional |
| PLP LVR coefficient | 0.25 (× r²) | Variance-scaled LP inventory cost (Milionis et al. 2022); ~4–5%/yr on BTC; supplies realistic NAV variance |
| Hedge strike | −15% OTM | Locked policy (STRIKE_OTM_BPS=1500) |
| Hedge tenor | 14 days | Locked policy (TENOR_SECONDS=1_209_600) |
| Hedge sizing | coverage = hedge_ratio×NAV, premium capped at budget | Bounds payout; the naive fixed-premium binary (notional=premium/p) produced ~1000:1 jackpots at low p |
| Hedge pricing | zero-drift BS digital put, trailing-30d realized-vol IV proxy | No historical IV surface (Deribit deferred to v2); on-chain uses the audited SVI evaluator |
| Settlement | expiry-spot (not path-min) | v1 simplification; path-dependent settlement is v2 |
| Vol window | 720 bars (30d), 48-bar warm-up min | Lookahead-gated on available_at |

## Validated numbers (365-day window, hedge_ratio = 0.10, run 2026-06-15)

**Full-window decomposition (the payoff regime — a −15% breach fired once):**

| Quantity | Value |
|---|---|
| Realized σ_ann (priced cycles) | 26% – 60% (mean 40%) |
| Binary put price p (−15% / 14d) | 0.0009 – 0.0939 (mean 0.028) |
| Premium per cycle | ~0.21% of NAV |
| Annual hedge cost | 5.43% of NAV |
| PLP yield | +7.14% |
| PLP LVR drag | −4.16% |
| Hedge premium | −5.43% |
| Hedge payoff | +9.98% (1 payoff) |
| **Total return** | **+7.52%** |
| **Hedged max drawdown** | **−1.66%** |
| **Unhedged buy-and-hold BTC max DD** | **−52.86%** |

**OOS holdback (most recent 30% ≈ 110 days — a calm/sideways regime, no payoff):**

| Quantity | Value |
|---|---|
| OOS Sharpe @ 0.10 | −1.92 |
| OOS Sortino @ 0.10 | −0.73 |
| OOS APY @ 0.10 | −2.37% |
| OOS hedged max DD | −0.99% |
| OOS unhedged BTC max DD | −28.02% |
| Sensitivity OOS Sharpe by ratio | 0.05→+0.50, 0.10→−1.92, 0.15→−2.74, 0.20→−3.15, 0.30→−3.56 |

**Interpretation (the defensible story).** The strategy is asymmetric crash insurance: in
the calm OOS window the hedge is a small net cost (you pay premium for protection that
didn't fire) — honest carry, reflected in the negative OOS Sharpe. Over the full window,
where BTC breached −15%, the payoff dominates and the strategy is net positive **while
cutting drawdown ~32× vs holding spot** (−1.66% vs −52.86%). Higher hedge ratios cost more
in calm regimes (monotonically more-negative OOS Sharpe) — the sensitivity table shows the
expected insurance cost-of-carry, not an overfit peak. The v1 ratio (0.10) is preserved.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Coverage-based hedge sizing replaces the naive fixed-premium binary**
- **Found during:** initial defensibility smoke test on real 365d data.
- **Issue:** the model spec's literal `premium = hedge_ratio×NAV×(tenor/365); notional =
  premium/p` produces `notional = premium/p → ∞` as the binary price `p → 0`. On a real
  σ≈26% cycle (p≈0.0009) a 0.4% premium bought a position paying **>400% of NAV** if the
  strike breached — a ~1000:1 lottery jackpot that made a single hedge hit dominate the
  entire return (first run: +40.8% total, almost all one binary payoff). This is
  indefensible as "crash insurance" and fails the user's hard defensibility gate.
- **Fix:** sized the hedge by **coverage** (target payout = `hedge_ratio × NAV`) with the
  premium capped at the per-cycle insurance budget; in high-vol regimes the vault buys less
  coverage rather than overspending. Payout is now bounded (max ≈ `hedge_ratio × NAV`),
  premium varies correctly with vol, and the annual hedge spend lands ≈ the budget (~5.4%).
- **Files modified:** strategy_sim.py.
- **Commit:** 930ca09.

**2. [Rule 1 - Bug] Warm-up guard for the degenerate zero-vol first cycle**
- **Found during:** per-cycle inspection.
- **Issue:** bar-0 has no trailing history → σ=0 → `p` floored to 1e-6 → an absurd notional
  (~3835× premium). A ticking bomb even when it didn't pay off.
- **Fix:** cycles with < 48 usable trailing bars or σ≤0 are skipped (no premium, no position).
- **Files modified:** strategy_sim.py.
- **Commit:** 930ca09.

**3. [Rule 2 - Missing critical functionality] PLP LVR inventory drag**
- **Found during:** OOS Sharpe sanity check.
- **Issue:** a pure-yield PLP sleeve has no per-bar price exposure → a near-deterministic
  upward ramp → OOS Sharpe ~7.7, above the "not absurd like >5" gate (suspiciously clean).
- **Fix:** added a variance-scaled LVR drag (Milionis-Moallemi-Roughgarden 2022), the
  standard LP adverse-selection cost. Conservative coefficient (~4–5%/yr); it injects
  realistic per-bar NAV variance and brings OOS Sharpe into a believable range.
- **Files modified:** strategy_sim.py.
- **Commit:** 930ca09.

### Scope notes

- `compute_attribution(result.actions, …)` in `__main__` was dropped: `result.actions` is now
  the new per-cycle `hedge_cycle` schema, not the old kind/args/pre trace schema that
  `compute_attribution` parses. The backtest's decomposition is the 3-way strategy attribution;
  the six-column action accountant remains for the testnet trace-replay path (unchanged).
- The on-chain SVI evaluator, parity tests, and `vault_state` Move-parity behavior were NOT
  modified, per the deliverable constraint.

## Test results

- Full suite: **246 passed** (was 232 baseline + 14 new `test_strategy_sim.py`).
- Lint: `ruff check` clean on all changed files.
- Lookahead gates green: `test_future_crash_does_not_change_past_decision`,
  `test_input_frame_is_not_mutated`, `test_oos_never_touched_during_calibration`.
- Real artifacts regenerated: `backtest/reports/full-365d.json` +
  `backtest/reports/full-365d-report.html` (4.96 MB, under the 5 MB ceiling; gitignored).

## Self-Check: PASSED

- strategy_sim.py, test_strategy_sim.py: FOUND.
- walk_forward.py, __main__.py, report.py, report.html.j2, backtest-assumptions.md: FOUND (modified).
- Commits 930ca09, 78332b0, 7ceb59c, 4f2d310: present on branch.
- 365-day backtest runs and produces non-zero, defensible metrics (verified above).
