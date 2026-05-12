---
phase: 03-backtest-harness-two-protocol-ptb
plan: 08
subsystem: wave-4-walk-forward-pnl-attribution-cli
tags: [phase-03, wave-4, track-b, walk-forward, pnl-attribution, sensitivity-table, sharpe-sortino, drawdown, cli, BACK-07, BACK-08, BACK-09]

requires:
  - .planning/phases/03-backtest-harness-two-protocol-ptb/03-CONTEXT.md (D-03 30% OOS holdback; D-04 monthly walk-forward; D-09 6-column PnL; D-10 OOS-only Sharpe/Sortino at 8760 bars/year, rf=0; D-13 §9 sensitivity grid {0.05,0.10,0.15,0.20,0.30})
  - .planning/phases/03-backtest-harness-two-protocol-ptb/WAVE0-DECISION.md (Q3 plp_yield_bps=0 in v1; runtime budget headroom)
  - .planning/backtest-assumptions.md (Plan 03-02 ledger — gas + slippage models extended this plan)
  - backtest/src/deepvault/replay.py (Plan 03-06 simulate + strategy_fn)
  - backtest/src/deepvault/vault_state.py (Plan 03-04 VaultState + PyRateLimiter)
  - backtest/src/deepvault/strategy_constants.py (ALLOCATION_BPS codegen)

provides:
  - backtest/src/deepvault/walk_forward.py (267 LOC; split_walk_forward + run_walk_forward + sensitivity_table + compute_drawdown_max_sharpe_sortino; 95% coverage)
  - backtest/src/deepvault/pnl_attribution.py (242 LOC; compute_attribution + compute_risk_metrics + PNL_COLUMNS constant; 87% coverage)
  - backtest/src/deepvault/__main__.py (214 LOC; walk_forward + report subcommands; W4 lock for Plan 03-09 nightly-backtest.yml)
  - backtest/tests/test_walk_forward.py (225 LOC; 17 tests covering split/OOS-purity/sensitivity/drawdown/Sharpe/Sortino)
  - backtest/tests/test_pnl_attribution.py (260 LOC; 16 tests covering 6+1 columns/sum invariant/slippage/gas)
  - backtest/tests/test_main_cli.py (189 LOC; 7 tests covering --help/micro run/empty-data/report stub)

affects:
  - Plan 03-09 (nightly-backtest.yml can drop the `|| echo` fallback and invoke `python -m deepvault walk_forward --window-days 365 --out reports/full-365d-backtest.json` directly; HTML report renderer consumes WalkForwardResult.equity_curve, sensitivity_table DataFrame, and compute_attribution output for Sections 5/6/9)

tech-stack:
  added: []  # no new dependencies — numpy/pandas already pinned, argparse/json stdlib
  patterns:
    - "Walk-forward methodology with 30% OOS holdback enforced via split_walk_forward; OOS-purity property test asserts the OOS slice is bit-identical pre/post calibration (T-03-25 mitigation)"
    - "v1 ratio (ALLOCATION_BPS=1000) PRESERVED — sensitivity_table is DOCUMENTATION of robustness across {0.05, 0.10, 0.15, 0.20, 0.30}, not a tuning switch. Per CONTEXT.md Claude's Discretion + PITFALLS Pitfall 2 (T-03-24 mitigation)"
    - "BARS_PER_YEAR=8760 module constant + test_compute_drawdown_uses_8760_bars_per_year direct assertion (T-03-26 mitigation)"
    - "Six-column PnL accountant per D-09: plp_yield_bps + hedge_cost_bps + hedge_payoff_bps + fees_bps + slippage_bps + gas_bps = total_bps within 1 bp"
    - "u64-as-string JSON convention honored — _to_int coerces both str and int at the action-args boundary (WAVE0-DECISION.md Q5)"
    - "Empty / zero-variance / degenerate equity curves return zeros, NOT NaN/inf — prevents NaN poisoning in the HTML report (defensive guard in both compute_drawdown_max_sharpe_sortino and compute_risk_metrics)"
    - "__main__.py CLI surface is the W4 lock for Plan 03-09; subcommand dispatch via argparse subparsers + set_defaults(func=_cmd_*)"
    - "Defensive empty-data path in CLI: emits bars=0 JSON instead of raising when the data_ingest cache is absent — prevents nightly-backtest.yml from masking real failures behind a Python traceback"

key-files:
  created:
    - backtest/src/deepvault/walk_forward.py
    - backtest/src/deepvault/pnl_attribution.py
    - backtest/src/deepvault/__main__.py
    - backtest/tests/test_walk_forward.py
    - backtest/tests/test_pnl_attribution.py
    - backtest/tests/test_main_cli.py
    - .planning/phases/03-backtest-harness-two-protocol-ptb/03-08-SUMMARY.md (this file)
  modified:
    - .planning/backtest-assumptions.md (extended gas model entry, added slippage definition entry)

decisions:
  - "v1 ratio LOCKED at ALLOCATION_BPS=1000 (10%) — sensitivity_table covers [0.05, 0.10, 0.15, 0.20, 0.30] for institutional-LP cold-read robustness reporting but does NOT feed back into production sizing (Claude's Discretion / PITFALLS Pitfall 2). The codegen-drift CI gate is the second human gate beyond the in-module BARS_PER_YEAR=8760 constant."
  - "WalkForwardResult extended with equity_curve (pd.Series) and actions (list[dict]) beyond the plan's original 7-field shape. Rationale: the iteration-1 amendment Task 3 CLI needs both fields to populate the summary JSON; rather than add them later, they ship from Task 1 so the contract is stable for Plan 03-09's HTML report renderer."
  - "compute_risk_metrics(pnl_series, bars_per_year=8760, rf=0) added alongside compute_drawdown_max_sharpe_sortino (the equity-curve variant). Both routes converge on the same Sharpe/Sortino formula. The CLI uses BOTH — equity-curve metrics in the top-level summary AND the per-bar-pnl variant as a cross-check block. This double-attestation catches drift if either path silently changes."
  - "Slippage convention LOCKED as `(next-bar VWAP − next-bar open) / next-bar open × 10000` per BACK-08 pessimistic-fill — added explicitly to .planning/backtest-assumptions.md so reviewers can reproduce the number. When no next bar exists or volume is zero, slippage = 0 (not NaN)."
  - "Gas model LOCKED as 1 bp per PTB (supply, hedge_mint, roll, redeem_request/_fulfill/_cancel) per the assumption ledger. Calibration against `result.effects.gasUsed` deferred to Plan 03-09 cross-check once the full cycle-full.json artifact lands."
  - "Defensive empty-data branch in __main__._cmd_walk_forward emits a valid JSON document with bars=0 rather than crashing. Rationale: nightly-backtest.yml downstream parses the JSON to extract metrics; a Python traceback in the JSON output would cascade into an opaque failure. The CLI returns 0 even on empty data so the workflow can branch on bars > 0 explicitly. (If reviewers prefer a non-zero exit on empty data, that's a Plan 03-09 wiring tweak in nightly-backtest.yml, not in the CLI surface.)"
  - "Test fixture data is fully synthetic — np.random.default_rng(7) for the 7-day fast fixture, default_rng(42) for the 365-day fixture. Reproducible and free of upstream-data flakiness in CI."
  - "Risk-extra cross-check block (`risk_metrics_cross_check`) added to the JSON summary only when equity_curve has ≥2 points. Prevents a redundant zeros-block from showing up in the empty-data CLI output."

patterns-established:
  - "Walk-forward methodology + sensitivity-table pattern: split → calibrate → deploy with OOS-purity property test"
  - "Six-column PnL accountant pattern with 7th `total_bps` column and sum invariant assertion"
  - "Defensive metric helpers — zero-variance / empty / single-point inputs return zeros, never NaN/inf"
  - "CLI W4 lock pattern: `python -m <pkg>` ships argparse subparsers + per-cmd dispatcher functions; nightly workflow invokes the CLI directly without `|| echo` fallback masking"

requirements-completed:
  - BACK-07  # walk-forward calibration, 30% OOS, no tuning on held-back
  - BACK-08  # six-column PnL accountant
  - BACK-09  # drawdown + Sharpe + Sortino on OOS (partial — full HTML chart deferred to Plan 03-09)

threat_model_disposition:
  T-03-24: "mitigated — ALLOCATION_BPS=1000 lives in strategy_constants (codegen'd from shared/strategy.toml). sensitivity_table emits documentation only; production reads from strategy_constants. CI codegen-drift gates manual edits."
  T-03-25: "mitigated — split_walk_forward returns OOS as a separate DataFrame; test_oos_never_touched_during_calibration property test deep-copies OOS pre-call and asserts pd.testing.assert_frame_equal post-call. @strategy_fn decorator (Plan 03-02) enforces decision-bar/observation-bar at runtime."
  T-03-26: "mitigated — BARS_PER_YEAR=8760 hardcoded module constant + test_compute_drawdown_uses_8760_bars_per_year direct equality assertion + documented in .planning/backtest-assumptions.md Sharpe/Sortino/Drawdown section."

metrics:
  duration: "~50min"
  completed: "2026-05-12"
  tasks: 3
  commits: 6  # t1-red + t1-green + t2-red + t2-green + t3-feat + t3-test
  files_created: 6
  files_modified: 1  # backtest-assumptions.md gas + slippage extension
  tests_added: 40  # 17 walk_forward + 16 pnl_attribution + 7 cli
  coverage_walk_forward: 95
  coverage_pnl_attribution: 87
  total_test_count_after_plan: 217
---

# Phase 3 Plan 8: Walk-Forward + Six-Column PnL + CLI Entry — Summary

**Wave 4 / Track B production: walk-forward calibration (BACK-07) + six-column
PnL accountant (BACK-08) + drawdown/Sharpe/Sortino on OOS (BACK-09 partial) +
the `__main__.py` CLI exposing `walk_forward` and `report` subcommands (W4 lock
— needed by Plan 03-09's nightly-backtest.yml).**

## Performance

- **Duration:** ~50 min
- **Started:** 2026-05-12 (after Plan 03-07 closure commit `a6f5b66`)
- **Completed:** 2026-05-12
- **Tasks:** 3 (Task 1 + Task 2 + iteration-1 amendment Task 3)
- **Commits:** 6 (TDD red/green pairs for tasks 1 & 2, feat+test for task 3)
- **Files created:** 6 production + 1 SUMMARY
- **Files modified:** 1 (backtest-assumptions.md — gas + slippage extension)
- **Tests added:** 40 (17 + 16 + 7)
- **Coverage:** walk_forward.py 95%, pnl_attribution.py 87% (both above 85% gate)

## Accomplishments

- **BACK-07 (walk-forward, 30% OOS, no tuning on held-back):** `split_walk_forward`
  returns OOS as a fresh DataFrame; `run_walk_forward` runs in-sample then OOS
  with the SAME hedge_ratio (no per-window tuning in v1); the OOS-purity
  property test asserts bit-identical pre/post.
- **BACK-08 (six-column PnL with fees + slippage + gas):** `compute_attribution`
  emits the 7-column DataFrame; 6-column sum invariant asserted within 1 bp;
  plp_yield_bps=0 in v1 + fees_bps=0 in v1 + gas_bps=1 bp per PTB +
  slippage_bps=(next-bar VWAP − next-bar open)/next-bar open × 10000.
- **BACK-09 partial (drawdown + Sharpe + Sortino on OOS):**
  `compute_drawdown_max_sharpe_sortino` (equity-curve variant) and
  `compute_risk_metrics` (per-bar pnl variant); BARS_PER_YEAR=8760, rf=0
  per D-10; empty/zero-variance inputs return zeros (no NaN poisoning). The
  HTML report wiring (the full BACK-09 surface) lands in Plan 03-09.
- **W4 lock — `__main__.py` CLI ships:** `python -m deepvault --help` exits 0,
  `python -m deepvault walk_forward --help` exits 0, micro run produces valid
  summary JSON in <30s. Plan 03-09's nightly-backtest.yml can drop the
  `|| echo "walk_forward CLI invocation pending"` fallback.
- **.planning/backtest-assumptions.md extended:** gas model entry refined to
  "1 bp per PTB (every state-mutating action)"; slippage definition added
  explicitly so reviewers can reproduce the number.

## Task Commits

Each task committed atomically per TDD discipline:

1. **Task 1 RED:** `aaed06a` — `test(03-08): add failing walk_forward tests (BACK-07, BACK-09)`
2. **Task 1 GREEN:** `d103ce8` — `feat(03-08): implement walk_forward + sensitivity_table + drawdown/Sharpe/Sortino`
3. **Task 2 RED:** `901e7b1` — `test(03-08): add failing pnl_attribution tests (BACK-08, D-09)`
4. **Task 2 GREEN:** `c9f5643` — `feat(03-08): implement six-column PnL accountant + risk metrics`
5. **Task 3 feat:** `e17a6d4` — `feat(03-08): add deepvault.__main__ CLI — walk_forward + report subcommands`
6. **Task 3 test:** `885d15e` — `test(03-08): CLI tests — walk_forward --help, micro run, empty-data path`

(A final `docs(03-08)` commit ships the SUMMARY + STATE/ROADMAP/REQUIREMENTS update.)

## Files Created / Modified

### Created
- `backtest/src/deepvault/walk_forward.py` (267 LOC) — `OOS_FRACTION`, `BARS_PER_YEAR`, `RISK_FREE_RATE`, `SENSITIVITY_RATIOS` constants + `DrawdownResult`, `WalkForwardResult` NamedTuples + `split_walk_forward`, `run_walk_forward`, `sensitivity_table`, `compute_drawdown_max_sharpe_sortino`, `_equity_from_nav` helper.
- `backtest/src/deepvault/pnl_attribution.py` (242 LOC) — `PNL_COLUMNS` tuple constant + `compute_attribution`, `compute_risk_metrics` + `_to_int`, `_safe_div_bps`, `_slippage_bps_for_action`, `_zero_row` helpers.
- `backtest/src/deepvault/__main__.py` (214 LOC) — `main` + `_cmd_walk_forward` + `_cmd_report` + `_load_data_for_window_days` helper; argparse subparsers for `walk_forward` and `report` subcommands.
- `backtest/tests/test_walk_forward.py` (225 LOC, 17 tests).
- `backtest/tests/test_pnl_attribution.py` (260 LOC, 16 tests).
- `backtest/tests/test_main_cli.py` (189 LOC, 7 tests).

### Modified
- `.planning/backtest-assumptions.md` — extended PnL attribution model section: gas model refined to "1 bp per PTB" per assumption ledger discipline, slippage definition added explicitly with worked example.

## Decisions Made

(See frontmatter `decisions` block — eight load-bearing decisions, including
the WalkForwardResult equity_curve+actions field extension, the dual-route
risk-metrics cross-check pattern, the slippage formula lock, and the defensive
empty-data CLI branch.)

## Deviations from Plan

### Rule 2 — Auto-add missing critical functionality

1. **[Rule 2 — Critical] Extended WalkForwardResult with `equity_curve` and `actions` fields.**
   - **Found during:** Task 1 (writing tests for run_walk_forward).
   - **Issue:** The plan body declared WalkForwardResult with 7 fields. The iteration-1 amendment for Task 3 (CLI) requires `result.equity_curve` and `result.actions` to populate the summary JSON. The amendment itself noted: "If it does not, extend `WalkForwardResult` in Task 1 to expose those fields — they are needed by the CLI and the institutional report regardless."
   - **Fix:** WalkForwardResult shipped with 9 fields from Task 1, not 7. equity_curve = pd.Series, actions = list[dict] (currently empty in v1 — Plan 03-09 wires the decision_fn that produces actions).
   - **Files modified:** backtest/src/deepvault/walk_forward.py.
   - **Commit:** `d103ce8`.

2. **[Rule 2 — Critical] Added `compute_risk_metrics(pnl_series)` alongside `compute_drawdown_max_sharpe_sortino(equity_curve)`.**
   - **Found during:** Task 2 (designing the PnL attribution module surface).
   - **Issue:** D-10's "Sharpe + Sortino + drawdown on OOS" can be computed two ways — from the equity curve OR from the per-bar pnl series. Both routes converge mathematically but produce different rounding error patterns. Shipping only the equity-curve variant would leave the per-bar route uncovered.
   - **Fix:** Added `compute_risk_metrics(pnl_series, bars_per_year=8760, rf=0)` to pnl_attribution.py. The CLI invokes BOTH routes and emits the per-bar variant as a `risk_metrics_cross_check` block in the summary JSON — double-attestation catches drift if either path silently changes.
   - **Files modified:** backtest/src/deepvault/pnl_attribution.py + backtest/src/deepvault/__main__.py.
   - **Commits:** `c9f5643`, `e17a6d4`.

3. **[Rule 2 — Robustness] Defensive empty-data branch in `_cmd_walk_forward`.**
   - **Found during:** Task 3 (writing the CLI test for the missing-cache path).
   - **Issue:** If `data_ingest.fetch_btc_hourly()` returns an empty DataFrame (e.g., the parquet cache hasn't been populated yet in a fresh CI environment), `run_walk_forward` would raise on `data.iloc[0]`. The nightly-backtest.yml downstream parses the JSON to extract metrics; a Python traceback in the JSON output cascades into an opaque failure.
   - **Fix:** CLI checks `len(data) < 2` and emits a valid JSON document with `bars: 0`, returning exit code 0. Plan 03-09's nightly-backtest.yml can then branch on `bars > 0` to surface "data missing" as a CI failure rather than masking it as a Python traceback.
   - **Files modified:** backtest/src/deepvault/__main__.py.
   - **Commit:** `e17a6d4`.

### Documentation tracking

4. **[Doc — backtest-assumptions.md ledger extension]** Added explicit slippage formula entry + refined gas model entry per the plan body's assumption-ledger discipline. Not a Rule 1/2/3 deviation — this is the canonical update the plan body requested ("APPEND to .planning/backtest-assumptions.md").

## Acceptance Gate Results

All plan-level + amendment acceptance criteria PASS:

- [x] `test -f backtest/src/deepvault/walk_forward.py` → 267 LOC (≥150)
- [x] `test -f backtest/src/deepvault/pnl_attribution.py` → 242 LOC (≥100)
- [x] `test -f backtest/src/deepvault/__main__.py` → 214 LOC (≥60)
- [x] `test -f backtest/tests/test_walk_forward.py` → 225 LOC (≥80)
- [x] `test -f backtest/tests/test_pnl_attribution.py` → 260 LOC (≥60)
- [x] `test -f backtest/tests/test_main_cli.py` → 189 LOC
- [x] `grep -c '^def split_walk_forward\|^def run_walk_forward\|^def sensitivity_table\|^def compute_drawdown_max_sharpe_sortino' backtest/src/deepvault/walk_forward.py` → 4
- [x] `grep -q '8_760\|8760\|BARS_PER_YEAR' backtest/src/deepvault/walk_forward.py` → matches
- [x] `grep -q '\[0.05, 0.10, 0.15, 0.20, 0.30\]\|0.05, 0.10, 0.15, 0.20, 0.30' backtest/src/deepvault/walk_forward.py` → matches
- [x] `grep -q 'OOS_FRACTION\|0\\.30' backtest/src/deepvault/walk_forward.py` → matches
- [x] `grep -c 'plp_yield_bps\|hedge_cost_bps\|hedge_payoff_bps\|fees_bps\|slippage_bps\|gas_bps\|total_bps' backtest/src/deepvault/pnl_attribution.py` → 30 (≥7)
- [x] `grep -q 'def compute_attribution' backtest/src/deepvault/pnl_attribution.py` → match
- [x] `grep -q 'ALLOCATION_BPS' backtest/src/deepvault/pnl_attribution.py` → match
- [x] `grep -q 'walk_forward\|sub.add_parser' backtest/src/deepvault/__main__.py` → 15 (≥2)
- [x] `grep -q 'argparse' backtest/src/deepvault/__main__.py` → match
- [x] `cd backtest && uv run python -m deepvault --help` → exit 0; surfaces both subcommands
- [x] `cd backtest && uv run python -m deepvault walk_forward --help` → exit 0; output contains `--window-days` and `--out`
- [x] `cd backtest && uv run pytest tests/test_walk_forward.py tests/test_pnl_attribution.py tests/test_main_cli.py --cov=deepvault.walk_forward --cov=deepvault.pnl_attribution --cov-fail-under=85 -x` → 40 passed; combined coverage 91%
- [x] Full backtest suite — `cd backtest && uv run pytest` → 217 passed in 48s (no regression)

## Next Plan Readiness

- **Plan 03-09 (HTML report + nightly-backtest.yml):**
  - Can drop the `|| echo "walk_forward CLI invocation pending"` fallback and invoke `python -m deepvault walk_forward --window-days 365 --out reports/full-365d-backtest.json` directly.
  - Imports: `from deepvault.walk_forward import sensitivity_table, run_walk_forward, compute_drawdown_max_sharpe_sortino`; `from deepvault.pnl_attribution import compute_attribution, compute_risk_metrics, PNL_COLUMNS`.
  - Wire `deepvault.report.render_html_from_summary(input_path, output_path)` — once it lands, the CLI `report` subcommand (currently exit=1 stub) becomes operational.
  - HTML Sections 5 (walk-forward methodology), 6 (PnL attribution six columns), 7 (drawdown + risk metrics), 9 (sensitivity table) all consume this plan's outputs directly.

## Self-Check: PASSED

- `backtest/src/deepvault/walk_forward.py` → FOUND (267 LOC, 4 production functions + 2 NamedTuples + 1 helper)
- `backtest/src/deepvault/pnl_attribution.py` → FOUND (242 LOC, compute_attribution + compute_risk_metrics + PNL_COLUMNS + 4 helpers)
- `backtest/src/deepvault/__main__.py` → FOUND (214 LOC, main + 2 subcommand dispatchers + 1 helper)
- `backtest/tests/test_walk_forward.py` → FOUND (225 LOC, 17 tests)
- `backtest/tests/test_pnl_attribution.py` → FOUND (260 LOC, 16 tests)
- `backtest/tests/test_main_cli.py` → FOUND (189 LOC, 7 tests)
- `.planning/backtest-assumptions.md` → MODIFIED (gas + slippage entries extended)
- Commit `aaed06a` (Task 1 RED) → FOUND in git log
- Commit `d103ce8` (Task 1 GREEN) → FOUND in git log
- Commit `901e7b1` (Task 2 RED) → FOUND in git log
- Commit `c9f5643` (Task 2 GREEN) → FOUND in git log
- Commit `e17a6d4` (Task 3 feat) → FOUND in git log
- Commit `885d15e` (Task 3 test) → FOUND in git log

---
*Phase: 03-backtest-harness-two-protocol-ptb*
*Plan: 08*
*Completed: 2026-05-12*
