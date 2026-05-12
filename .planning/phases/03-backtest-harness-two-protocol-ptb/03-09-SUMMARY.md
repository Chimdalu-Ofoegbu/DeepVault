---
phase: 03-backtest-harness-two-protocol-ptb
plan: 09
subsystem: backtest-html-report-ci-closure
tags: [phase-03, wave-5, track-b, html-report, jinja2, plotly, nightly-ci, micro-fixture-gate, phase-3-closure]
requires:
  - 02 (vault: vault_state mirror inputs)
  - 04 (lookahead_audit.pick_hand_recompute_rows)
  - 05 (test_ptb_capability_grep.py)
  - 06 (micro-fixture-7d.json + replay_trace + simulate)
  - 07 (liquidation_test inputs ride along in CI move job)
  - 08 (walk_forward + pnl_attribution + __main__.py)
provides:
  - render_html() + matplotlib_to_base64_png() + render_html_from_summary() (deepvault.report)
  - report.html.j2 Jinja2 template with 11 D-13 sections + W6 per-trade table + W6 IV surface evolution
  - hand-recompute.ipynb (D-07 closure)
  - ci.yml extensions: micro-fixture per-push gate + PTB-04 grep + Phase 3 Move filters + Margin-side capability containment
  - nightly-backtest.yml (W4 part 2: real CLI invocation, no masking fallback, full-365d artifact retention 30 days)
affects:
  - .github/workflows/ci.yml (6-job matrix names PRESERVED: move, ts, python, codegen-drift, parity, e2e-vault)
  - .github/workflows/nightly-backtest.yml (NEW, 05:00 UTC cron)
tech-stack:
  added:
    - "beautifulsoup4>=4.12 (dev — HTML validity test)"
    - "pyyaml>=6.0.3 (dev — CI YAML self-validation)"
  patterns:
    - "Jinja2 FileSystemLoader + autoescape(html) for template rendering"
    - "Plotly to_html(include_plotlyjs='inline') ONLY on first plot; include_plotlyjs=False on rest (Pitfall 5 file-size mitigation)"
    - "matplotlib_to_base64_png() embeds static figures as data: URIs for offline-usable HTML"
    - "W6 amendment: optional kwargs (per_trade_table, svi_snapshot_evolution) with template {% else %} fallback for backward-compat"
    - "W1 sequential ci.yml editing: three sequential sub-commits (3a python, 3b move, 3c new nightly file) to avoid concurrent edit conflicts"
key-files:
  created:
    - backtest/src/deepvault/report.py
    - backtest/templates/report.html.j2
    - backtest/tests/test_report.py
    - backtest/tests/test_report_e2e.py
    - backtest/notebooks/hand-recompute.ipynb
    - .github/workflows/nightly-backtest.yml
    - .planning/phases/03-backtest-harness-two-protocol-ptb/03-09-SUMMARY.md
  modified:
    - .github/workflows/ci.yml (python job + move job extensions)
    - backtest/pyproject.toml (add beautifulsoup4 + pyyaml to dev-deps)
    - backtest/uv.lock (regen)
    - backtest/tests/test_main_cli.py (Rule 1 fix: update report subcommand test to expect Plan 03-09 wiring)
decisions:
  - "Pitfall 5 mitigation: inline plotlyjs ONLY on first plot (svi_snapshot); equity_curve + drawdown_timeline pass include_plotlyjs=False. Empirical file size on 10-test suite < 5 MB; assertion enforced by test_render_html_file_size_under_5mb."
  - "W6 default-None kwargs: render_html(per_trade_table=None, svi_snapshot_evolution=None) — backward-compat with synthetic-input test suite that doesn't pass them; template {% else %} clause renders a fallback caption."
  - "W4 part 2 LOCK: nightly-backtest.yml invokes `uv run python -m deepvault walk_forward --window-days 365 --out reports/full-365d-backtest.json` directly, NO masking shell fallback. The job will FAIL loudly if the CLI breaks (not produce a misleading PASS)."
  - "actions/upload-artifact@v4 + retention-days: 30 + if-no-files-found: error — silent renames caught in CI rather than post-mortem."
  - "Phase 3 Move test filters use POSITIONAL filter (mock_margin_pool / ptb_capability_test / liquidation_test) per Sui CLI 1.71.1 convention (--filter long-form removed)."
  - "Capability containment grep three-layer: VAULT-10 base (TreasuryCap/AdminCap) + PTB-04 Margin Move (TradeCap/MarginManager/MockMarginPool) + PTB-04 TS (no `const tradeCap = ...` outside SDK layer)."
  - "Rule 1 deviation: Plan 03-08's test_report_subcommand_returns_1_when_module_missing asserted rc==1 because deepvault.report was not yet installed. Plan 03-09 ships the module; the test now correctly asserts rc==0 (success) for a valid summary JSON, plus a sibling test asserts non-zero on missing-input-file."
metrics:
  duration: 30min
  tasks: 3
  files: 7 (created 6 + 1 SUMMARY) + modified 4
  test_count: 14 (deepvault.report-specific; 232 total in backtest suite)
  coverage_report: 95.16% (deepvault.report; target 85%)
  completed: 2026-05-12
---

# Phase 3 Plan 09: Backtest HTML Report + Phase 3 CLOSURE Summary

**One-liner:** Institutional-grade HTML report (BACK-10) + 7-day micro-fixture per-push CI gate + nightly 365-day backtest workflow with real CLI invocation; Phase 3 CLOSES with all 16 BACK + PTB requirements satisfied.

## What Shipped

1. **`backtest/src/deepvault/report.py`** (249 LOC, 95% coverage)
   - `render_html(*, executive_summary, assumption_ledger, ..., per_trade_table=None, svi_snapshot_evolution=None, output_path=None) -> Path` — emits a self-contained HTML report with 11 D-13 sections.
   - `matplotlib_to_base64_png(fig) -> str` — returns a `data:image/png;base64,...` URI for inline embedding.
   - `render_html_from_summary(input_json, output_html) -> int` — CLI helper invoked by `python -m deepvault report --input ... --output ...` (used by `nightly-backtest.yml`).

2. **`backtest/templates/report.html.j2`** (244 LOC)
   - 11 D-13 sections in order: Executive Summary, Assumption Ledger, Strategy Description, Data Ledger, Walk-Forward Methodology, PnL Attribution, Drawdown + Risk Metrics, Stress Event Narrative, Sensitivity Table, Shuffled-Label Sanity Test, Hand Recompute Appendix.
   - **W6 §6.1 — Per-trade table (trade-table)**: appendix below PnL Attribution that renders every action's six-column attribution + total. Gated by `{% if per_trade_table %}`; falls back to an explanatory caption otherwise.
   - **W6 §8.1 — IV surface evolution (surface-evolution)**: Stress Event section renders 3 representative SVI surface snapshots (start/mid/end); v1 simplification annotated; falls back to single snapshot when caller doesn't pass `svi_snapshot_evolution`.

3. **`backtest/tests/test_report.py`** (320 LOC, 11 tests)
   - Tests cover: file creation, all 11 sections present, < 5 MB file size (Pitfall 5), valid HTML (BeautifulSoup), assumption ledger embedded verbatim, output_path return contract, W6 per-trade table, W6 svi_snapshot_evolution, `render_html_from_summary` happy + missing-input paths.

4. **`backtest/tests/test_report_e2e.py`** (W5 — 259 LOC, 3 tests)
   - Loads `backtest/traces/micro-fixture-7d.json` (Plan 03-06 fixture).
   - Runs `simulate()` from `replay.py` → `compute_attribution()` from `pnl_attribution.py` → `render_html()` with W6 kwargs populated from the attribution DataFrame.
   - Asserts: all 11 D-13 section anchors present in rendered HTML, HTML file size >= 50 KB (proves non-empty rendering, not just template scaffolding).

5. **`backtest/notebooks/hand-recompute.ipynb`** (9 cells)
   - Per CONTEXT.md D-07: pulls 3 random row indices via `pick_hand_recompute_rows(returns, n=3, seed=42)`.
   - Row 1: supply → shares_to_mint per supply.move:143-156.
   - Row 2: nav_per_share per ltv.move:41-49.
   - Row 3: worst_case_nav per ltv.move:60-68 (D-20 anchor).
   - Each row asserts `harness == manual` to the wei; MISMATCH text in assert message for greppable failure.

6. **`.github/workflows/ci.yml`** (extended)
   - **Python job (W1 sub-task 3a)**: ADD `7-day micro-fixture replay parity` step + `PTB capability grep` step.
   - **Move job (W1 sub-task 3b)**: ADD `Move tests (Phase 3 — mock_margin_pool + ptb_capability_test + liquidation_test)` step using positional filters. REPLACE capability-containment step with VAULT-10 + PTB-04 three-layer extended version (TreasuryCap/AdminCap base + TradeCap/MarginManager/MockMarginPool Margin-side + TS demo no-free-binding).
   - **6-job matrix PRESERVED** with original names (move, ts, python, codegen-drift, parity, e2e-vault) per PATTERNS.md sec G branch-protection invariant.

7. **`.github/workflows/nightly-backtest.yml`** (NEW, W1 sub-task 3c + W4 part 2)
   - Cron `0 5 * * *` (05:00 UTC daily) per WAVE0-DECISION.md Q6 — staggered 1h after nightly-e2e-vault (04:00) + 2h after nightly-prover (03:00) to avoid runner-pool contention.
   - `timeout-minutes: 60` (Q4 measured 1.33s extrapolated; massive headroom).
   - **W4 part 2 LOCK:** Real CLI invocation `uv run python -m deepvault walk_forward --window-days 365 --out reports/full-365d-backtest.json`. **NO masking fallback** — let the job fail loudly if the CLI breaks.
   - Render step: `uv run python -m deepvault report --input reports/full-365d-backtest.json --output reports/full-365d-report.html`.
   - `actions/upload-artifact@v4` with `retention-days: 30` and `if-no-files-found: error`.
   - 7-day micro-fixture parity smoke check BEFORE the full run.

## Phase 3 Closure Traceability Matrix

All 16 BACK + PTB requirements satisfied (10 BACK + 6 PTB):

| Req      | Closed by                                  | Artifact                                                                    |
|----------|--------------------------------------------|-----------------------------------------------------------------------------|
| BACK-01  | Plan 03-02                                 | `backtest/src/deepvault/data_ingest.py`                                     |
| BACK-02  | Plan 03-04                                 | `backtest/src/deepvault/vault_state.py`                                     |
| BACK-03  | Plan 03-04                                 | `backtest/src/deepvault/replay.py::strategy_fn` decorator                   |
| BACK-04  | Plan 03-06 (+ Plan 03-09 per-push CI gate) | `replay_trace` + `micro-fixture-7d.json` + `ci.yml` 7-day micro-fixture step |
| BACK-05  | **Plan 03-09 (this plan)**                 | `nightly-backtest.yml` 365-day flow                                          |
| BACK-06  | Plan 03-04 + Plan 03-09 hand-recompute     | `lookahead_audit.py` + `hand-recompute.ipynb`                               |
| BACK-07  | Plan 03-08                                 | `walk_forward.py::run_walk_forward` + sensitivity_table                     |
| BACK-08  | Plan 03-08                                 | `pnl_attribution.py::compute_attribution` (6-column accountant)             |
| BACK-09  | Plan 03-08                                 | `walk_forward.py::compute_drawdown_max_sharpe_sortino`                      |
| BACK-10  | **Plan 03-09 (this plan)**                 | `report.py` + `report.html.j2` (11 D-13 sections + W6)                       |
| PTB-01   | Plan 03-03                                 | mock_margin_pool BalanceManager + TradeCap pattern                          |
| PTB-02   | Plan 03-01 (Wave 0)                        | MARGIN-WHITELIST-DECISION.md (UNDETERMINED-FALLBACK-TO-MOCK + recheck date) |
| PTB-03   | Plan 03-05                                 | `scripts/two-protocol-ptb-demo.ts` (5-call PTB)                              |
| PTB-04   | Plan 03-05 (+ Plan 03-09 CI wiring)        | `test_ptb_capability_grep.py` + `ci.yml` capability containment three-layer  |
| PTB-05   | Plan 03-07                                 | `liquidation_test.move` + `test_liquidation_parity.py`                       |
| PTB-06   | Plan 03-05                                 | `scripts/two-protocol-ptb-demo.ts` testnet end-to-end                        |

**Phase 3 status:** 16/16 BACK + PTB requirements closed. Phase 3 EXITS.

## Acceptance Criteria — All Pass

### Files exist
- `backtest/src/deepvault/report.py` ✓ (249 lines, target ≥100)
- `backtest/templates/report.html.j2` ✓ (244 lines, target ≥120)
- `backtest/tests/test_report.py` ✓ (320 lines, target ≥50)
- `backtest/tests/test_report_e2e.py` ✓ (W5 — 259 lines)
- `backtest/notebooks/hand-recompute.ipynb` ✓ (9 cells, target ≥5)
- `.github/workflows/nightly-backtest.yml` ✓ (103 lines, target ≥50)

### Tests + coverage
- `uv run pytest tests/test_report.py tests/test_report_e2e.py -x` → 14 passed, 0 failed
- `--cov=deepvault.report` → 95.16% (target 85%)
- Full backtest suite: 232 passed (no regressions after Rule 1 fix to `test_main_cli.py`)

### W6 amendment greps
- `grep -E 'trade-table|per-trade' backtest/templates/report.html.j2` → 8 matches (≥1 required)
- `grep -E 'Surface 3D|surface-evolution|svi_snapshot_evolution' backtest/templates/report.html.j2` → 4 matches (≥1 required)
- `grep -E 'per_trade_table|svi_snapshot_evolution' backtest/src/deepvault/report.py` → 7 matches (≥2 required)

### W5 e2e test
- `grep -E 'def test_e2e_render|def test_html_contains_all_11|def test_html_size_at_least_50kb' backtest/tests/test_report_e2e.py` → 3 matches (≥3 required)
- All 3 e2e tests pass

### W4 part 2 nightly amendment
- `grep -qE 'python -m deepvault walk_forward.*--window-days 365' .github/workflows/nightly-backtest.yml` ✓
- `! grep -qE '\|\| echo .*pending' .github/workflows/nightly-backtest.yml` ✓ (masking fallback absent)
- `grep -qE 'python -m deepvault report.*--input' .github/workflows/nightly-backtest.yml` ✓
- `grep -qE 'full-365d-backtest|full-365d-report' .github/workflows/nightly-backtest.yml` ✓
- `grep -qE 'retention-days: 30' .github/workflows/nightly-backtest.yml` ✓
- `grep -qE "cron:.*0 5 \* \* \*" .github/workflows/nightly-backtest.yml` ✓
- `grep -qE 'timeout-minutes: 60' .github/workflows/nightly-backtest.yml` ✓

### W1 ci.yml extensions
- `grep -qE 'test_replay_parity|micro-fixture' .github/workflows/ci.yml` ✓ (3a)
- `grep -qE 'test_ptb_capability_grep' .github/workflows/ci.yml` ✓ (3a)
- `grep -qE 'mock_margin_pool|ptb_capability_test|liquidation_test' .github/workflows/ci.yml` ✓ (3b)
- `grep -qE 'TradeCap|MarginManager|MockMarginPool' .github/workflows/ci.yml` ✓ (3b)
- 6-job matrix preserved with expected names ✓

### YAML validity
- `python -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"` ✓
- `python -c "import yaml; yaml.safe_load(open('.github/workflows/nightly-backtest.yml'))"` ✓

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Updated test_report_subcommand_returns_1_when_module_missing**
- **Found during:** Final full-suite pytest after Task 3 commits.
- **Issue:** Plan 03-08 shipped `__main__.py` with a placeholder assertion `rc == 1` for the `report` subcommand because `deepvault.report` was not yet installed. Plan 03-09 (this plan) ships the module, so the assertion is stale and breaks `uv run pytest`.
- **Fix:** Renamed test to `test_report_subcommand_succeeds_after_plan_03_09`. Constructed a valid minimal walk_forward summary JSON; asserted `rc == 0`, output file exists, contains "Executive Summary" + "Hand Recompute" anchors. Added sibling `test_report_subcommand_returns_nonzero_when_input_missing` for the missing-input error path.
- **Files modified:** `backtest/tests/test_main_cli.py`
- **Commit:** `390301e`

**2. [Rule 2 — Missing functionality] Added `render_html_from_summary` CLI helper**
- **Found during:** Wiring up the `python -m deepvault report --input ... --output ...` step in `nightly-backtest.yml`.
- **Issue:** Plan 03-08 stubbed `__main__.py::_cmd_report` to import `render_html_from_summary` from `deepvault.report`, but no such function existed. The W4 part 2 acceptance requires the nightly CLI invocation work end-to-end without the `|| echo` fallback.
- **Fix:** Added `render_html_from_summary(input_path, output_path) -> int` to `report.py`. Loads summary JSON, fabricates minimal viable plots from sensitivity_table + oos metrics, embeds the assumption ledger from `.planning/backtest-assumptions.md`, invokes `render_html` with all required kwargs, returns 0 on success / 1 on missing input.
- **Files modified:** `backtest/src/deepvault/report.py`
- **Commit:** `d29c78b` (initial implementation); test coverage in `cfda3ce` and follow-up.

**3. [Rule 3 — Blocking issue] Added pyyaml to dev-deps for CI YAML self-validation**
- **Found during:** Running the W4 acceptance verify command `python -c "import yaml; yaml.safe_load(...)"`.
- **Issue:** PyYAML was not in either `[project].dependencies` or `[dependency-groups].dev` for the backtest pyproject. The W4 amendment verify command requires it.
- **Fix:** Added `pyyaml>=6.0.3` to dev-deps.
- **Files modified:** `backtest/pyproject.toml`, `backtest/uv.lock`
- **Commit:** `e908280`

### Discretionary refinements

- **W4 single-line `run:` shell commands.** Initial nightly-backtest.yml used `\` line continuations for the `python -m deepvault walk_forward` and `python -m deepvault report` invocations. The W4 acceptance regex `grep -qE 'python -m deepvault walk_forward.*--window-days 365'` requires the pattern to appear on a single line. Refactored both commands to single-line form.

- **Comment hygiene to avoid grep false positives.** Initial nightly-backtest.yml comments contained the literal text `|| echo "...pending"` to describe what was removed; this matched the W4 acceptance regex `! grep -qE '\|\| echo .*pending'`. Reworded comments to "masking-fallback shell idiom" to avoid the false positive while preserving the documentation intent.

## Known Stubs

None. Every section in the rendered HTML has a real (cold-read-able) caption, and every wired test asserts a real invariant.

The `Section 8.1 IV surface evolution` block ships a v1 simplification (3 representative snapshots, not per-tick evolution) which is **explicitly annotated** in the template caption — per the W6 amendment instruction "v1 ships 3 representative snapshots ... per-tick evolution is v2 work". This is not a stub; it's a documented v1 scope.

The `Section 11 Hand Recompute Appendix` text references the notebook at `backtest/notebooks/hand-recompute.ipynb` — the notebook is present, valid JSON, has 9 cells, and the harness vs manual asserts are non-trivial (using real `vault_state` formulas mirrored from `supply.move:143-156` + `ltv.move:41-49,60-68`).

## Threat Flags

None. Plan 03-09 introduces no new trust boundaries beyond the report-renders-to-judge surface already enumerated in the plan's `<threat_model>`. All Margin-side capability containment grep mitigations are already covered by the extended capability-containment step in ci.yml.

## TDD Gate Compliance

Plan 03-09 Task 1 used `tdd="true"` with full RED/GREEN cycle:

- **RED:** `cfda3ce test(03-09): add failing report tests` — tests committed first, asserted `ModuleNotFoundError: No module named 'deepvault.report'`.
- **GREEN:** `d29c78b feat(03-09): implement render_html + 11-section Jinja2 template (BACK-10)` — implementation makes all 7 tests pass; 4 additional tests added in same commit cover W6 + CLI-helper paths.
- **REFACTOR:** No separate refactor commit; the GREEN commit ships clean (95% coverage, no dead code).

Tasks 2 and 3 are not TDD (notebook + CI YAML are configuration / data artifacts where TDD doesn't apply).

## Phase 3 Final Status

**Phase 3 — backtest-harness-two-protocol-ptb — CLOSED.**

- 9 plans shipped across 5 waves (Wave 0 spike → Wave 5 closure).
- 16/16 BACK + PTB requirements satisfied.
- All MATH-XX requirements from Phase 1 remain green (no regressions).
- CI: 6-job matrix preserved + 3 nightly workflows (prover, e2e-vault, backtest).
- Phase 4 (PLP Risk Studio Dashboard) is UNBLOCKED.

## Self-Check: PASSED

- File `backtest/src/deepvault/report.py`: FOUND
- File `backtest/templates/report.html.j2`: FOUND
- File `backtest/tests/test_report.py`: FOUND
- File `backtest/tests/test_report_e2e.py`: FOUND
- File `backtest/notebooks/hand-recompute.ipynb`: FOUND
- File `.github/workflows/nightly-backtest.yml`: FOUND
- Commit `cfda3ce` (RED phase tests): FOUND
- Commit `d29c78b` (GREEN phase render_html): FOUND
- Commit `2b1c5e8` (hand-recompute notebook): FOUND
- Commit `e908280` (ci.yml python job extension W1 3a): FOUND
- Commit `68668e6` (ci.yml move job extension W1 3b): FOUND
- Commit `da7cd63` (nightly-backtest.yml W1 3c + W4): FOUND
- Commit `390301e` (Rule 1 fix to test_main_cli): FOUND
- 232/232 backtest tests pass
- 95.16% coverage on deepvault.report (target 85%)
- 6-job CI matrix preserved with original names
- Phase 3 closure traceability matrix complete (16/16)
