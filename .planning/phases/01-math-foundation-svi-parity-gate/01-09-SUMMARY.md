---
phase: 01-math-foundation-svi-parity-gate
plan: 09
subsystem: math-foundation
tags: [svi, move, arb-violating, gap-closure, cr-01, phase-1, wave-7]

# Dependency graph
requires:
  - phase: 01-math-foundation-svi-parity-gate
    plan: 04
    provides: contracts/tests/golden_vectors_data.move (the 10 arb-violating Tier-B golden vectors at zero-indexed array offsets 111..120 — B-arb-091..B-arb-100; the data this plan exercises against svi_view::*) + scripts/golden_emit.py (the emitter this plan extends with WR-02 defensive assertion)
  - phase: 01-math-foundation-svi-parity-gate
    plan: 05
    provides: contracts/sources/svi_view.move (the function under test; EZeroVariance abort code at svi_view.move:104) + contracts/tests/svi_view_test.move (the test scaffold this plan modifies — adds 10 per-row tests + deletes 1 misuse-test)
  - phase: 01-math-foundation-svi-parity-gate
    plan: 08
    provides: shared/golden-vectors.json + scripts/golden_emit.py wired with arb_checker.check_arb (the upstream emitter this plan re-runs in --check mode to confirm assertion-only changes produce no diff)
provides:
  - "contracts/tests/svi_view_test.move (10 new per-row `arb_violating_NNN_aborts_when_passed_to_svi_view` tests at NNN ∈ {091..100} + 1 deleted misuse-test `golden_vectors_arb_violating_all_reject`)"
  - "scripts/golden_emit.py (WR-02 emit-time defensive assertion `arb_violating_emitted == len(arb_violating)`)"
affects:
  - "phase-2-vault-rebalance: Move-side D-04 rejection contract (svi_view::* aborts on every arb-violating slice) is now empirically exercised on every generated arb-violating row, not just one hand-crafted (a=0, b=0) sample. Phase 2 vault::rebalance can rely on this contract with stronger evidence."
  - "phase-1-verifier: re-running `/gsd-verify-work 1` should produce status `verified` with score 5/5 (no `partial` truths, no BLOCKER anti-patterns). The two documented-conditional CI gates (Sui CLI Move test confirmation + forbidden-token grep) remain unchanged."

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-row `#[test, expected_failure(abort_code = ...)]` discipline: when generated test data has a known per-row rejection contract (here: a=0, b=0 → EZeroVariance), the right shape is N separate test functions each pulling its specific row from the data table and asserting the documented abort code. A single counting-loop test does NOT exercise the contract — the vendored DeepBook code-review rule (`scripts/deepbookv3/.claude/rules/code-review.md`) makes this explicit: 'Every generated test vector must be exercised against the contract. If generated data isn't passed to the function under test, delete it.'"
    - "Defense-in-depth gap closure: when a verification gap can be closed at two layers (the directly-affected layer + an upstream invariant), close at BOTH layers. Move per-row tests close the consumer-side gap (the contract is exercised); Python emit-time assertion closes the producer-side gap (a future evaluator change can't silently flip a row to params_valid=True). Either alone would be incomplete; both is robust."
    - "Verbatim-from-spec assertion shape: the WR-02 assertion's structural form `sum(1 for v in vectors if v['source'].endswith('arb-violating') if not v['expected']['params_valid']) == len(arb_violating)` is taken verbatim from `01-VERIFICATION.md` `gaps[0].missing[1]`, NOT paraphrased. This makes the remediation textually traceable to the verifier-flagged gap and gives reviewers a quick grep-able anchor."

key-files:
  created:
    - .planning/phases/01-math-foundation-svi-parity-gate/01-09-SUMMARY.md
  modified:
    - contracts/tests/svi_view_test.move
    - scripts/golden_emit.py

key-decisions:
  - "DELETE the misuse-test outright (do not just disable or comment out). Per `scripts/deepbookv3/.claude/rules/code-review.md`, the directive is unambiguous: 'If generated data isn't passed to the function under test, delete it.' The deleted test (`golden_vectors_arb_violating_all_reject`, lines 102-122 of svi_view_test.move pre-edit) loops the 10 arb-violating rows only to count `params_valid=false` entries — it never calls `svi_view::total_variance_from_params` or `svi_view::binary_price_from_params` on any of them. Counting is data-coverage theater; per-row exercising is data-coverage truth. The 10 new per-row tests replace it."
  - "Use ROW INDICES 111..120 (zero-indexed array offsets), NOT 131..140. The 141-vector table layout is: A-01..A-21 → 0..20, B-001..B-090 → 21..110, B-arb-091..B-arb-100 → 111..120, C-01..C-10 → 121..130, C2-01..C2-10 → 131..140. Verified by reading file lines 126-135 of `contracts/tests/golden_vectors_data.move` (each row carries an inline `// B-arb-NNN` comment label). Mistakenly using offsets 131..140 (which are C2 PredictTests-stub rows with non-zero `a, b`) would cause every per-row `expected_failure` test to FAIL because those vectors do not abort with `EZeroVariance`."
  - "Use `binary_price_from_params` (NOT `total_variance_from_params`) as the call inside each per-row test. Per the call graph: `binary_price_from_params` → `binary_price_from_k` → at svi_view.move:104 calls `total_variance_from_params(...)` AND THEN asserts `total_var > 0, EZeroVariance`. So `binary_price_from_params` exercises the rejection path with the documented abort code. Calling `total_variance_from_params` directly returns 0 and does NOT abort with `EZeroVariance` (the assertion lives in `binary_price_from_k`). This matches the pattern already in use by the existing `zero_a_zero_b_aborts_zero_variance` reference test at svi_view_test.move:127-143."
  - "Both Step A (Move) AND Step B (Python) — defense in depth. Step A is the primary remediation (closes the trust-boundary gap on the Move-side: every generated arb-violating row is now actually fed to `svi_view::*`). Step B is the secondary remediation (emit-time defensive assertion that catches a future evaluator change silently flipping a row to `params_valid=True` BEFORE the JSON / Move companion is written, BEFORE CI's parity job runs). Either alone would be incomplete: Step A doesn't catch a rogue evaluator change that flips arb_checker behavior; Step B doesn't catch a Move evaluator change that drifts away from the EZeroVariance contract. Both together cover the bidirectional invariant."
  - "DO NOT modify Plans 01-01 through 01-08 source files. Only `contracts/tests/svi_view_test.move` and `scripts/golden_emit.py` are touched. The misuse-test deletion is a structural change inside an existing file (not a deletion of a Plan 01-05 deliverable artifact). The WR-02 assertion is an additive change to a Plan 01-04/01-08 file. No regenerated artifacts (`shared/golden-vectors.json`, `contracts/tests/golden_vectors_data.move`) drift — verified by `golden_emit.py --check` exit 0 (the emitter's text output is bit-identical because the assertion is purely a runtime guard, not an output mutation)."
  - "DO NOT update `01-VERIFICATION.md` from this plan. The verifier owns that file; this SUMMARY records what was done. The next `/gsd-verify-work 1` invocation will refresh `01-VERIFICATION.md` from the new ground truth (the now-deleted misuse test + the now-present per-row tests + the now-present WR-02 assertion)."
  - "DO NOT mark this plan as introducing new requirements. `requirements-completed: [MATH-02, MATH-04]` is a STRENGTHENING of pre-existing satisfaction (PARTIAL → FULL on the data-coverage axis), not a new satisfaction. Phase 1 closure metrics are unchanged: 6/6 MATH-XX requirements remain satisfied across 9 plans (Plans 01-01 through 01-09)."

patterns-established:
  - "Gap-closure plan shape (mirrored from Plan 01-08 frontmatter): when a verifier flags a `partial` truth or a code-reviewer flags a BLOCKER, the remediation plan is small (2 tasks max), mechanical (no architectural change), defense-in-depth where feasible (close at consumer + producer layers), and explicitly cites the governing rule in commit message + SUMMARY. Plan 01-09 follows this shape end-to-end."
  - "Comment-block above per-row tests as the cross-reference anchor: instead of repeating the closes-CR-01 text in 10 separate test docstrings, place a single block-comment above the first per-row test that documents (a) which CR/gap is closed, (b) the governing rule, (c) the row-index layout (so future readers don't confuse file-line numbers with array offsets), (d) the rejection-path math (a=0, b=0 → EZeroVariance), (e) why the misuse-test was deleted. The 10 individual tests stay terse and mechanical."

requirements-completed:
  - MATH-02
  - MATH-04

# Metrics
duration: 8min
completed: 2026-05-09
---

# Phase 1 Plan 09: Close CR-01 Arb-Violating Per-Row Move Tests + WR-02 Defensive Assertion Summary

**CR-01 (BLOCKER) from `01-REVIEW.md` and the single `partial` truth in `01-VERIFICATION.md` frontmatter `gaps:` are CLOSED. Defense-in-depth gap closure: (a) PRIMARY — `contracts/tests/svi_view_test.move` now exercises EVERY one of the 10 generated arb-violating Tier-B golden vectors (B-arb-091..B-arb-100) against `svi_view::binary_price_from_params(...)` via per-row `#[test, expected_failure(abort_code = svi_view::EZeroVariance)]` tests; the 11-line misuse-test (`golden_vectors_arb_violating_all_reject`) that violated the vendored DeepBook code-review rule by counting invalid rows without ever passing them to the function under test is DELETED. (b) SECONDARY — `scripts/golden_emit.py` carries a new WR-02 emit-time defensive assertion `arb_violating_emitted == len(arb_violating)` that catches a future evaluator change silently flipping an arb-violating row to `params_valid=True` BEFORE the JSON / Move companion is written, BEFORE CI's parity job runs. All Phase 1 test suites green: backtest pytest 61 passed, dashboard vitest 311 passed, both parity_runners report PARITY OK 141 vectors at tolerance ≤ 1, golden_emit drift exit 0, codegen drift exit 0, forbidden-token grep on parity-bound TS evaluator files exit 1 (no matches). Phase 1 closure stays intact: 6/6 MATH requirements (MATH-01..MATH-06) satisfied across 9 plans (Plans 01-01 through 01-09); Phase 2 vault::rebalance UNBLOCKED with stronger evidence for the Move-side D-04 rejection contract.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-05-09
- **Completed:** 2026-05-09
- **Tasks:** 2 (all `type=auto`)
- **Files created:** 1 (this SUMMARY)
- **Files modified:** 2 (contracts/tests/svi_view_test.move + scripts/golden_emit.py)

## What CR-01 Was

From `.planning/phases/01-math-foundation-svi-parity-gate/01-REVIEW.md` (Plan 01-08 code review):

> **CR-01 (BLOCKER) — `contracts/tests/svi_view_test.move:102-122`**: `golden_vectors_arb_violating_all_reject` loops the 10 arb-violating Tier-B golden vectors (B-arb-091..B-arb-100) only to count how many have `params_valid=false`, asserting `invalid_count == 10`. It NEVER calls `svi_view::total_variance_from_params` or `svi_view::binary_price_from_params` on those rows. Per the vendored DeepBook code-review rule (`scripts/deepbookv3/.claude/rules/code-review.md`): **"Every generated test vector must be exercised against the contract. If generated data isn't passed to the function under test, delete it."**

From `.planning/phases/01-math-foundation-svi-parity-gate/01-VERIFICATION.md` `frontmatter gaps[0]`:

> **status: partial** — "The Move deepvault::svi_view evaluator hard-rejects invalid params (D-04) such that arb-violating golden vectors are demonstrably exercised against `svi_view::*` in the Move test suite." The single rejection test (`zero_a_zero_b_aborts_zero_variance`) only proves ONE hand-crafted (a=0, b=0) call aborts — it does NOT loop the 10 generated arb-violating vectors. If `golden_emit.py` ever produces `params_valid=false` rows whose params do NOT trigger an abort, the Move test would silently pass while on-chain returned garbage.

This weakened MATH-02 invalid-vector rejection coverage and MATH-04 Success Criterion #4 Move-side completeness for arb-violating slices. D-04 (CONTEXT.md) — the Move evaluator's hard-rejection contract that Phase 2 `vault.rebalance` depends on — relied on `svi_view::*` aborting on EVERY arb-violating golden vector, not just one hand-crafted sample.

## What Was Landed (Move side — PRIMARY)

### Deleted (misuse-test that violated the vendored rule)

- **`golden_vectors_arb_violating_all_reject`** (formerly svi_view_test.move:102-122) — counted `params_valid=false` rows and asserted `invalid_count == 10`. Never passed any row to `svi_view::*`. DELETED.

### Added (10 new per-row rejection tests)

| Test name | Row offset | Vector ID | Expected abort |
|-----------|------------|-----------|----------------|
| `arb_violating_091_aborts_when_passed_to_svi_view` | 111 | B-arb-091 | `svi_view::EZeroVariance` |
| `arb_violating_092_aborts_when_passed_to_svi_view` | 112 | B-arb-092 | `svi_view::EZeroVariance` |
| `arb_violating_093_aborts_when_passed_to_svi_view` | 113 | B-arb-093 | `svi_view::EZeroVariance` |
| `arb_violating_094_aborts_when_passed_to_svi_view` | 114 | B-arb-094 | `svi_view::EZeroVariance` |
| `arb_violating_095_aborts_when_passed_to_svi_view` | 115 | B-arb-095 | `svi_view::EZeroVariance` |
| `arb_violating_096_aborts_when_passed_to_svi_view` | 116 | B-arb-096 | `svi_view::EZeroVariance` |
| `arb_violating_097_aborts_when_passed_to_svi_view` | 117 | B-arb-097 | `svi_view::EZeroVariance` |
| `arb_violating_098_aborts_when_passed_to_svi_view` | 118 | B-arb-098 | `svi_view::EZeroVariance` |
| `arb_violating_099_aborts_when_passed_to_svi_view` | 119 | B-arb-099 | `svi_view::EZeroVariance` |
| `arb_violating_100_aborts_when_passed_to_svi_view` | 120 | B-arb-100 | `svi_view::EZeroVariance` |

Each test:

1. Loads `golden_vectors_data::all_inputs()` and indexes the appropriate offset.
2. Unpacks the row using the canonical 11-field layout `[a, b, rho_mag, rho_neg, m_mag, m_neg, sigma, k_mag, k_neg, forward, strike]`.
3. Reconstructs signed `rho` and `m` via `i64::from_parts(magnitude, is_negative)`.
4. Calls `svi_view::binary_price_from_params(a, b, rho, m, sigma, forward, strike)`.
5. Annotated with `#[test, expected_failure(abort_code = svi_view::EZeroVariance)]`.
6. Trailing `abort 999` to satisfy the Move test framework's expected-failure pattern (mirrors the existing `zero_a_zero_b_aborts_zero_variance` reference at svi_view_test.move:142).

**Why `EZeroVariance` for all 10 rows.** All 10 arb-violating rows in `golden_vectors_data.move` have `a=0` and `b=0` (verified by reading file lines 126-135). With those parameters:

- `total_variance_from_params(...)` returns `a + math::mul_div_round_down(b, |inner|, F) = 0 + 0 = 0`.
- `binary_price_from_params(...)` calls `binary_price_from_k(...)`, which at `svi_view.move:104` does `assert!(total_var > 0, EZeroVariance)` — this fires.

Per Plan 01-03/01-04 mathematical analysis, `ECannotBeNegative` is provably unreachable for `sigma > 0` (since `sqrt((k-m)² + sigma²) >= |k-m|` and `|rho| < F`). The reachable rejection path with `(a=0, b=0)` is `EZeroVariance` — that is what the 10 arb-violating golden vectors trigger.

### Preserved (existing tests, unchanged)

- `golden_vectors_total_variance_all_pass` — 131-vector parity-loop on `total_variance_from_params`.
- `golden_vectors_binary_price_all_pass` — 131-vector parity-loop on `binary_price_from_params`.
- `zero_a_zero_b_aborts_zero_variance` — hand-crafted (a=0, b=0) call asserting EZeroVariance.
- `zero_forward_aborts` — forward=0 → EZeroForward.
- `k_out_of_range_aborts` — |k| > svi_k_max_log_strike → EKOutOfRange.

### Move test count: 6 → 15

- Pre-Plan 01-09: 6 tests (2 parity-loops + 1 misuse-counter + 3 hand-crafted rejection).
- Post-Plan 01-09: **15 tests** (2 parity-loops + 10 per-row rejection + 3 hand-crafted rejection); the misuse-counter is deleted.

## What Was Landed (Python side — SECONDARY)

`scripts/golden_emit.py` `tier_b_vectors()` now emits a defensive assertion AFTER the arb-violating loop terminates and BEFORE `return vectors`:

```python
# WR-02 / Plan 01-09 defensive assertion: every entry pushed by the
# arb_violating loop above MUST have params_valid=False. If a future
# evaluator change silently flips a row to True (e.g. by altering the
# a=0, b=0 -> EZeroVariance contract), this assertion fires at emit time
# and prevents the regression from reaching CI's parity job. Mirrors the
# Move-side per-row #[expected_failure] tests in svi_view_test.move that
# close CR-01 from 01-REVIEW.md.
arb_violating_emitted = sum(
    1 for v in vectors
    if v['source'].endswith('arb-violating')
    and not v['expected']['params_valid']
)
assert arb_violating_emitted == len(arb_violating), (
    f"WR-02 / Plan 01-09: arb-violating count mismatch. "
    f"Expected {len(arb_violating)} entries with params_valid=False; "
    f"found {arb_violating_emitted}. A row may have silently passed validation."
)
```

The assertion's structural form `sum(1 for v in vectors if v['source'].endswith('arb-violating') if not v['expected']['params_valid']) == len(arb_violating)` is taken verbatim from `01-VERIFICATION.md` `gaps[0].missing[1]` (with the comprehension's two `if` clauses joined by `and` for Python style — semantically identical). The assertion is satisfied today (the 10 arb-violating rows all have `params_valid=False`), so the emitter remains green; the assertion is a forward-defense guardrail, not a bug-correction.

`golden_emit.py --check` exits 0 — the emitter's text output is bit-identical because the assertion is purely a runtime guard, not an output mutation. No drift in `shared/golden-vectors.json` or `contracts/tests/golden_vectors_data.move`.

## Why Both — Defense in Depth

| Layer | Without remediation | With Plan 01-09 |
|-------|---------------------|------------------|
| Move-side (consumer of golden vectors) | A future emitter change that silently flips an arb-violating row to `params_valid=true` would NOT be caught by the Move test suite — the misuse-counter would still pass because it counts only emitter output, not evaluator behavior. | Each of the 10 arb-violating rows is fed to `svi_view::binary_price_from_params(...)`. If any row stops aborting with `EZeroVariance`, the matching `expected_failure` test fails — caught at `sui move test`. |
| Python-side (producer of golden vectors) | A future evaluator change to `deepvault.svi.total_variance` that no longer raises `ValueError` on `(a=0, b=0)` would let the emitter write `params_valid=true` for arb-violating rows. The Move per-row tests would then ALSO start passing (because the row would no longer match the `EZeroVariance` contract). The drift is masked. | The WR-02 assertion fires at emit-time before any output is written. The drift is caught at the producer layer, before CI's parity job runs. |

Either alone would be incomplete:

- **Step A alone** (Move per-row tests): catches Move evaluator drift away from EZeroVariance, but does NOT catch a rogue evaluator change in `deepvault.svi` that changes the construction of arb-violating rows.
- **Step B alone** (Python emit-time assertion): catches Python evaluator drift, but does NOT catch a Move evaluator change that drifts the rejection contract (e.g., a refactor that changes the abort code).

**Both together** cover the bidirectional invariant: the 10 generated arb-violating rows MUST have `params_valid=false` (Python side), AND `svi_view::*` MUST abort on them with `EZeroVariance` (Move side). Defense in depth.

## Test Pass Counts (before/after)

| Surface | Pre-Plan 01-09 | Post-Plan 01-09 | Delta |
|---------|----------------|------------------|-------|
| Backtest pytest (`cd backtest && uv run pytest`) | 61 passed | **61 passed** | unchanged (no Python tests added; assertion-only change to `golden_emit.py`) |
| Dashboard vitest (`cd dashboard && pnpm test`) | 311 passed | **311 passed** | unchanged (no TS surface modified) |
| Python parity_runner | PARITY OK: 141 vectors | **PARITY OK: 141 vectors** | unchanged |
| TS parity_runner | PARITY OK: 141 vectors | **PARITY OK: 141 vectors** | unchanged |
| `golden_emit.py --check` | exit 0 | **exit 0** | unchanged (assertion-only, no output diff) |
| `codegen.py --check` | exit 0 | **exit 0** | unchanged |
| Forbidden-token grep on `dashboard/src/lib/{math,isqrt,phi,ln,svi}.ts` | exit 1 (no matches) | **exit 1 (no matches)** | unchanged |
| Move test count (svi_view_tests) | 6 tests | **15 tests** (1 deleted, 10 added) | net +9 |

## Commit Hash

- **e802e1d** — `MATH(01-09): close CR-01 — per-row arb-violating Move tests + WR-02 emit assertion`

## Self-Check: PASSED

Verified by inspection and command output:

- All 10 per-row Move tests are present and named consistently: `arb_violating_NNN_aborts_when_passed_to_svi_view` for NNN ∈ {091..100} — `grep -c "arb_violating_[0-9]\{3\}_aborts_when_passed_to_svi_view" contracts/tests/svi_view_test.move` → **10**.
- Each per-row test calls `svi_view::binary_price_from_params(...)` (NOT `total_variance_from_params(...)` directly — the `EZeroVariance` assertion lives in `binary_price_from_k` which is reached via `binary_price_from_params`).
- Each per-row test pulls its row from `golden_vectors_data::all_inputs()` (NOT hand-crafted; the entire point of CR-01 is that generated data must be exercised). Row offsets verified by reading file lines 126-135 of `golden_vectors_data.move`: each line carries `// B-arb-NNN` inline comment confirming offset 111 → B-arb-091, ..., offset 120 → B-arb-100.
- The Python `assert ... == len(arb_violating)` uses the structural shape from VERIFICATION.md missing[1], not a paraphrase: `sum(1 for v in vectors if v['source'].endswith('arb-violating') and not v['expected']['params_valid']) == len(arb_violating)`. `grep -c "len(arb_violating)" scripts/golden_emit.py` → **2** (one in the assertion comparand, one in the f-string error message).
- The deleted `golden_vectors_arb_violating_all_reject` test is genuinely removed (not just commented out): `grep -c "fun golden_vectors_arb_violating_all_reject" contracts/tests/svi_view_test.move` → **0**.
- `grep -c "expected_failure(abort_code = svi_view::" contracts/tests/svi_view_test.move` → **13** (10 new per-row + 3 pre-existing hand-crafted rejection: `zero_a_zero_b_aborts_zero_variance`, `zero_forward_aborts`, `k_out_of_range_aborts`); ≥ 12 required.
- `01-09-SUMMARY.md` exists with the required frontmatter (phase/plan/subsystem/tags/requires/provides/affects/requirements-completed/duration/completed) + body sections + Concerns block forwarding the two documented-conditional CI gates.
- File present: `[ -f .planning/phases/01-math-foundation-svi-parity-gate/01-09-SUMMARY.md ] && echo FOUND` → FOUND.
- Commit present: `git log --oneline | grep -q e802e1d && echo FOUND` → FOUND.

## Concerns / Flags Forwarded to STATE.md

### 1. Sui CLI Move test confirmation (documented-conditional first-CI-run gate)

**Status:** Pre-existing acknowledged-conditional gate from Plan 01-05 SUMMARY.md and Plan 01-07 SUMMARY.md. **NOT a freshly discovered uncertainty** introduced by this plan.

**Detail:** Sui CLI is unavailable in the local execution environment (verified across Plans 01-05 and 01-07 via `which sui`, `command -v sui`, and PowerShell probes). `sui move test --filter golden_vectors` cannot be run locally. This was anticipated and called out in `01-VERIFICATION.md` `human_verification[0]`: the first CI run after a Move test change is the empirical confirmation gate.

**What gets confirmed on the first CI run:** The 10 new per-row `#[expected_failure(abort_code = svi_view::EZeroVariance)]` tests + the existing parity-loop tests (`golden_vectors_total_variance_all_pass`, `golden_vectors_binary_price_all_pass`) + the existing hand-crafted rejection tests (`zero_a_zero_b_aborts_zero_variance`, `zero_forward_aborts`, `k_out_of_range_aborts`) — total 15 tests in `svi_view_test.move`.

**Static-review confidence:** All 10 new per-row tests are predicted to PASS via static review against the vendored Predict source at SHA `1159d79af33c70e09e406310e1d8f067832ede9d`:

- The 10 arb-violating rows in `golden_vectors_data.move` (file lines 126-135) all have `a=0, b=0`.
- `total_variance_from_params(0, 0, ...) = 0 + math::mul_div_round_down(0, ..., F) = 0`.
- `binary_price_from_k(...)` at `svi_view.move:104` does `assert!(total_var > 0, EZeroVariance)` — fires on `total_var = 0`.
- Therefore `binary_price_from_params(0, 0, ...)` aborts with `EZeroVariance` — matching the `#[expected_failure(abort_code = svi_view::EZeroVariance)]` attribute on each per-row test.

**Expected outcome on first CI run:** `sui move test --filter golden_vectors` exits 0; all 15 tests in `svi_view_tests` module pass.

**User action:** observe the first CI run after this commit (`MATH(01-09): close CR-01 ...`) lands on the default branch.

### 2. Forbidden-token grep on parity-bound TS evaluator files (documented-conditional CI gate)

**Status:** Pre-existing acknowledged-conditional gate from Plan 01-07 SUMMARY.md. **NOT a freshly discovered uncertainty** introduced by this plan.

**Detail:** The CI parity job runs `grep -nE "Number\(|parseFloat\(|Math\.(sqrt|exp|log|pow)\(" dashboard/src/lib/{math,isqrt,phi,ln,svi}.ts` and asserts exit 1 (no matches). Local equivalent run during Plan 01-09 verification produced **no matches** (exit 1, clean) — Plan 01-09 did not modify any TS evaluator file, so this guard is unchanged. Per `01-VERIFICATION.md` `human_verification[1]`, the first CI run is the empirical confirmation that the guard remains green in the CI environment (which uses BSD/GNU grep variants depending on runner).

**Expected outcome on first CI run:** Forbidden-token grep step exits 1 (no matches); CI parity job exits 0.

**User action:** observe the first CI run; no human input required to maintain the guard.

## Phase 1 Closure — Unchanged

| Requirement | Status | Plan(s) | Notes |
|-------------|--------|---------|-------|
| MATH-01 | DONE | 01-03 | Python canonical SVI evaluator (50 → 61 tests; cross-checked against scipy Phi within 1e-7) |
| MATH-02 | DONE (strengthened) | 01-05, **01-09** | Move evaluator parity on 131 valid vectors + per-row rejection on 10 arb-violating vectors (was: 1 hand-crafted; now: 10 generated). |
| MATH-03 | DONE | 01-06 | TS evaluator bigint-only; bit-equal with Python on every valid golden vector |
| MATH-04 | DONE (strengthened) | 01-08, **01-09** | Off-chain arb-checker delivers full g(k) array (length 200); rejection contract (D-04) Move-side now exercised on every generated arb-violating row. |
| MATH-05 | DONE | 01-07 | Three-way CI parity gate (Python + TS + Move parity_runners + forbidden-token grep) |
| MATH-06 | DONE | 01-04 | 141 golden vectors (Tier A=21, B=100, C=10, C2=10) emitted via `scripts/golden_emit.py` |

**6/6 MATH requirements remain satisfied across 9 plans.** Phase 1 closes here. Phase 2 (`vault::rebalance`) UNBLOCKED, with the additional confidence that the Move-side D-04 rejection contract is now empirically exercised on every generated arb-violating row, not just one hand-crafted sample.

## Closure Declaration

**CR-01 from `01-REVIEW.md` and the `partial` truth in `01-VERIFICATION.md` frontmatter `gaps:` are CLOSED.** Re-running `/gsd-verify-work 1` should produce status `verified` with score 5/5 must-haves (no `partial` truths, no BLOCKER anti-patterns). The two documented-conditional CI gates (Sui CLI Move test confirmation + forbidden-token grep) remain documented but are NOT new gaps — they are pre-existing acknowledged-conditional gates from Plans 01-05 and 01-07 SUMMARY.md, unchanged by Plan 01-09.

## Self-Check: PASSED
