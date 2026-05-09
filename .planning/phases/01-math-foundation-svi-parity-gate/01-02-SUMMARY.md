---
phase: 01-math-foundation-svi-parity-gate
plan: 02
subsystem: math-foundation
tags: [svi, phi, cody-1969, codegen, math-policy, fixed-point, phase-1, wave-1]

# Dependency graph
requires:
  - phase: 01-math-foundation-svi-parity-gate
    plan: 01
    provides: shared/svi-spec.md (Φ section locks Cody 1969) + scripts/codegen.py extension hook + CONTRIBUTING.md §6 MATH: prefix policy + [svi] strategy.toml block
  - phase: 00-setup-ground-rules
    provides: scripts/codegen.py (Phase 0 triple-emit pattern) + shared/strategy.toml schema-versioning idiom + CI codegen-drift job (5-job matrix, branch-protection-pinned job names) + vendored DeepBookV3 fork at SHA 1159d79af33c70e09e406310e1d8f067832ede9d
provides:
  - shared/cody_phi_coefficients.toml (NEW MATH: policy file; verbatim Cody 1969 coefficient table from vendored math.move:31-65; schema_version=1)
  - scripts/codegen.py extension (load_phi + emit_phi_{move,python,typescript} + _fmt_underscored helper; main() now writes 6 files; --check covers all 6)
  - contracts/sources/phi_coefficients.move (module deepvault::phi_coefficients with public-fun-per-constant accessors at u128)
  - backtest/src/deepvault/phi_coefficients.py (Final[int] for every coefficient + auxiliary LN2_U128)
  - dashboard/src/lib/phi_coefficients.ts (PHI_COEFFICIENTS const object; bigint `n` suffix on every value)
  - .github/workflows/ci.yml codegen-drift job extended (6 file paths in git diff --exit-code list; job key codegen-drift unchanged for branch protection)
affects:
  - 01-03-python-evaluator (imports SMALL_THRESHOLD, SMALL_A0..A4, SMALL_B0..B3, MEDIUM_THRESHOLD, MEDIUM_C0..C8, MEDIUM_D0..D7, LN2_U128 from deepvault.phi_coefficients)
  - 01-05-move-evaluator (calls deepvault::phi_coefficients::small_threshold(), small_a0(), …, ln2_u128() from helpers/phi.move)
  - 01-06-ts-evaluator (imports PHI_COEFFICIENTS from dashboard/src/lib/phi_coefficients.ts; bigint arithmetic)
  - 01-04-golden-emitter (codegen pattern reuse template — golden-vectors.json emitter follows same emit-and-CI-drift-check shape; CI extension list will gain shared/golden-vectors.json + contracts/tests/golden_vectors_data.move once Plan 01-04 ships)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Codegen extension via lines: list[str] | None parameter (header_block backward compat); single-source-of-truth TOML → 3-runtime emission pattern reused for Cody coefficients"
    - "Underscore digit-separator preservation in generated outputs (_fmt_underscored helper using f-string `{n:_d}`); Move/Python/TS all accept `_` so the audit story is one grep against vendored math.move:31-65"
    - "BigInt fidelity for u128-equivalent constants in TypeScript: every value emits with `n` suffix (Pitfall B / threat T-01-11 mitigation; Cody coefficients up to 4.5e13 exceed Number.MAX_SAFE_INTEGER ≈ 9e15 with margin to spare but A3 = 18,154,981,253,344 is above 2^44 already and growing as on-chain math layers compose)"

key-files:
  created:
    - shared/cody_phi_coefficients.toml
    - contracts/sources/phi_coefficients.move
    - backtest/src/deepvault/phi_coefficients.py
    - dashboard/src/lib/phi_coefficients.ts
    - .planning/phases/01-math-foundation-svi-parity-gate/01-02-SUMMARY.md
  modified:
    - scripts/codegen.py
    - .github/workflows/ci.yml

key-decisions:
  - "Coefficient emission scope: 30 numeric constants (1 + 5 + 4 + 1 + 9 + 8 = 28 Cody coefs + 2 thresholds + 1 LN2 auxiliary = 31 total emitted accessors per runtime); structure groups by [small.numerator|denominator] / [medium.numerator|denominator] mirroring vendored math.move:34-64 layout exactly"
  - "TOML auxiliary section includes LN2_U128 = 693_147_180 (vendored math.move:24) because medium-range Φ uses exp(-x²/2) reduction (math.move:228-230) — Plan 01-05 phi.move needs it imported alongside the rational-Chebyshev coefficients; emitting from same source keeps the algorithm boundary clean"
  - "TOML auxiliary section deliberately does NOT include F (FLOAT_SCALING = 1e9) — that constant is consumed via SVI_SCALE in strategy_constants and importing it twice would create an inconsistency vector; documented inline in cody_phi_coefficients.toml"
  - "Underscore digit separators preserved in all 3 generated runtimes via _fmt_underscored() helper; the plan's done-criterion called this out explicitly because grep-based audit against vendored helper/math.move:31-65 fails if the generated Move file has bare `662910000` while the vendored source shows `662_910_000`"
  - "CI codegen-drift job key (`codegen-drift`) preserved unchanged — bound to GitHub branch protection per CONTRIBUTING.md branch-strategy invariant + PATTERNS.md §G; only the Verify-no-drift step's git-diff path list and error-message text were modified"

patterns-established:
  - "Multi-TOML codegen: load_strategy() + load_phi() in main(); pairs list iterated for both write and --check modes; this is the template Plan 01-04 reuses for golden_emit.py's shared/golden-vectors.json (same emit-and-CI-drift-check shape)"
  - "Generated-file layout discipline: top-level under contracts/sources/ (phi_coefficients.move) NOT helpers/ (which is reserved for hand-written Move modules per Spike 4 layout); Plan 01-05 phi.move (helpers/) imports from phi_coefficients.move (top level) — same shape as vendored Predict's separation of helper/math.move from any constants module if one existed"

requirements-completed:
  - MATH-01
  - MATH-02
  - MATH-03

# Metrics
duration: 14min
completed: 2026-05-09
---

# Phase 1 Plan 02: Cody Φ Coefficient Codegen Extension Summary

**Cody 1969 normal-CDF coefficient table locked into `shared/cody_phi_coefficients.toml` (verbatim transcription of vendored math.move:31-65, SHA 1159d79af33c70e09e406310e1d8f067832ede9d) and propagated via extended `scripts/codegen.py` to three runtime files (Move u128, Python Final[int], TS bigint with `n` suffix). CI codegen-drift job extended to git-diff-exit-code on all 6 generated files; job key `codegen-drift` preserved for branch protection. Plans 01-03 / 01-05 / 01-06 unblocked — they now `import` / `use` shared coefficients with bit-identical numeric values by construction.**

## Performance

- **Duration:** ~14 min
- **Started:** 2026-05-09
- **Completed:** 2026-05-09
- **Tasks:** 3 (all `type=auto`)
- **Files created:** 4 (TOML + 3 generated)
- **Files modified:** 2 (codegen.py + ci.yml)

## Accomplishments

- **`shared/cody_phi_coefficients.toml` (NEW)** — Single source of truth for Cody 1969 normal-CDF rational Chebyshev coefficients. Schema v1 with `upstream_move = "scripts/deepbookv3/packages/predict/sources/helper/math.move:31-65"` and `upstream_sha = "1159d79af33c70e09e406310e1d8f067832ede9d"` citations at the top. 28 Cody coefficients + 2 thresholds + 1 LN2 auxiliary = 31 numeric values, every one cross-verified against the vendored source via grep before commit.

- **`scripts/codegen.py` extension** — Added `PHI_TOML_PATH` / `PHI_MOVE_PATH` / `PHI_PYTHON_PATH` / `PHI_TS_PATH` constants, `HEADER_LINES_PHI` (parallel to `HEADER_LINES_GENERIC`), and `load_phi()` (schema_version=1 guard). Refactored `header_block(...)` to accept an optional `lines: list[str] | None = None` arg with default = `HEADER_LINES_GENERIC` — preserves all Phase 0 callers unchanged. Added `emit_phi_move/python/typescript` (per-section public-fun / `Final[int]` / bigint-`n` emission, iterating `[small.numerator]` / `[small.denominator]` / `[medium.numerator]` / `[medium.denominator]` / `[auxiliary]` in TOML insertion order). `main()` now writes/checks 6 files via a single `pairs` list.

- **`_fmt_underscored()` helper** — Formats Python `int` → `f"{n:_d}"` so the generated outputs preserve the digit separators present in `cody_phi_coefficients.toml`. Move 2024, Python 3.6+, and TypeScript all accept `_` as a numeric separator. The plan's done-criterion explicitly required this: side-by-side audit against vendored `helper/math.move:31-65` is now a single grep instead of a digit-count exercise. Same pattern eliminates the "is `18154981253344` actually `18_154_981_253_344` or did a digit get dropped" failure mode.

- **3 generated coefficient files** — All three contain `AUTO-GENERATED - DO NOT EDIT` headers citing `shared/cody_phi_coefficients.toml` (NOT `shared/strategy.toml` — important to keep the policy boundary clean per `MATH:` vs `POLICY:` discipline). Each runtime gets one accessor per coefficient: Move `public fun small_threshold(): u128 { 662_910_000 }`, Python `SMALL_THRESHOLD: Final[int] = 662_910_000`, TS `SMALL_THRESHOLD: 662_910_000n,`. The TS file has the `n` bigint suffix on every one of its 29 numeric values — `grep -E ":\s+[0-9_]+n,"` returns 29 matches against 29 total value lines (Pitfall B / threat T-01-11 mitigation).

- **CI codegen-drift job extended** — `Verify no drift` step's `git diff --exit-code --stat` list expanded from 3 (strategy_constants.{move,py,ts}) to 6 paths (+ phi_coefficients.{move,py,ts}). Error message references both "Editing generated code" guidance and CONTRIBUTING.md §6 (the MATH: prefix discipline). Job key `codegen-drift` UNCHANGED — required for GitHub branch protection per CONTRIBUTING.md branch-strategy invariant + PATTERNS.md §G. YAML validated via `pyyaml`: parses, all 5 job keys (`move`, `ts`, `python`, `codegen-drift`, `parity`) preserved.

- **Drift detection verified end-to-end** — Perturbed `cody_phi_coefficients.toml` (`a0 = 2_235_252_035` → `a0 = 2_235_252_036`), reran `--check`: exited 1 with `DRIFT: contracts/sources/phi_coefficients.move`, `DRIFT: backtest/src/deepvault/phi_coefficients.py`, `DRIFT: dashboard/src/lib/phi_coefficients.ts` (all 3 generated files flagged). Restored TOML, reran `--check`: exit 0. The CI pipeline will now catch any silent edit to a generated file before merge (T-01-08 mitigation in place).

## Task Commits

Each task committed atomically with `MATH(01-02):` prefix per CONTRIBUTING.md §6:

1. **Task 1: Create shared/cody_phi_coefficients.toml — verbatim transcription from vendored math.move:31-65** — `1f97f4f`
2. **Task 2: Extend scripts/codegen.py with emit_phi_{move,python,typescript} + run codegen + drift check** — `3e8c522`
3. **Task 3: Extend CI codegen-drift job to cover the three new generated files** — `2bfd633`

## Files Created/Modified

### Created

- `shared/cody_phi_coefficients.toml` — 87 lines; the MATH: policy source-of-truth for Cody 1969 coefficients. Top-block citation includes `upstream_move`, `upstream_sha`, `source_paper`. Sections: `[small]` (threshold + numerator A0..A4 + denominator B0..B3), `[medium]` (threshold + numerator C0..C8 + denominator D0..D7), `[large]` (doc-only, no coefs), `[auxiliary]` (LN2_U128 = 693_147_180).
- `contracts/sources/phi_coefficients.move` — 51 lines; module `deepvault::phi_coefficients`; 31 `public fun X(): u128` accessors (1 small_threshold + 5 small_a* + 4 small_b* + 1 medium_threshold + 9 medium_c* + 8 medium_d* + 1 ln2_u128 + 2 thresholds counted once each → adjusts to 31 total).
- `backtest/src/deepvault/phi_coefficients.py` — 51 lines; `from typing import Final`; 31 `Final[int]` declarations matching the Move accessor names in uppercase (`SMALL_THRESHOLD`, `SMALL_A0`..`SMALL_A4`, `SMALL_B0`..`SMALL_B3`, `MEDIUM_THRESHOLD`, `MEDIUM_C0`..`MEDIUM_C8`, `MEDIUM_D0`..`MEDIUM_D7`, `LN2_U128`).
- `dashboard/src/lib/phi_coefficients.ts` — 51 lines; `export const PHI_COEFFICIENTS = { … } as const;` with bigint literal `n` suffix on every numeric value (29 values total — `_fmt_underscored` makes them human-greppable: `SMALL_A3: 18_154_981_253_344n,`).
- `.planning/phases/01-math-foundation-svi-parity-gate/01-02-SUMMARY.md` — this file.

### Modified

- `scripts/codegen.py` — +101 lines / -10 lines; new constants block (`PHI_*_PATH` + `HEADER_LINES_PHI`); new `load_phi()`; refactored `header_block(...)` to optional `lines` arg (default = `HEADER_LINES_GENERIC` so all Phase 0 emit_* callers unchanged); new `_fmt_underscored()`; new `emit_phi_{move,python,typescript}`; `main()` rewritten with single `pairs` list iterated for both write and `--check`.
- `.github/workflows/ci.yml` — +5 lines / -2 lines; codegen-drift job's Verify-no-drift step gained 3 new file paths and an error-message rewording (now references CONTRIBUTING.md §'Editing generated code' AND §6 MATH: prefix). Job key `codegen-drift` unchanged.

## Decisions Made

All key decisions are recorded in the frontmatter `key-decisions` block. Highlights:

- **Auxiliary LN2_U128 emission included.** Vendored `helper/math.move:228-230` uses `LN2_U128 = 693_147_180` for the medium-range `exp(-x²/2)` reduction inside `normal_cdf_u128`. Plan 01-05 (Move phi.move) and Plan 01-03 (Python phi.py) both need this constant in lockstep with the rational-Chebyshev coefficients — emitting from the same TOML keeps the algorithm boundary clean. Documented inline in TOML.
- **F (FLOAT_SCALING) NOT duplicated into phi_coefficients.** Strategy_constants already exposes `SVI_SCALE = 9` (`F = 1e9`); importing it twice would create an inconsistency vector if anyone edited one but not the other. The TOML's `[auxiliary]` comment explicitly tells consumers to import `SVI_SCALE` from `strategy_constants` instead.
- **Underscore digit separators preserved.** This was a `done`-criterion-blocking issue caught after first emit — the initial implementation used `f"{value}"` which strips TOML separators. Fixed via `_fmt_underscored(n) -> f"{n:_d}"`. Without this fix, the audit story collapses: "compare 28 generated decimal literals against 28 vendored Move literals" is mechanical with separators preserved, error-prone without.
- **`emit_phi_move` ordered as: threshold → numerator → denominator (per range), NOT alphabetic.** Mirrors vendored `helper/math.move:31-65` block layout. A reviewer scanning the generated file top-to-bottom can match it to the vendored file paragraph-by-paragraph.
- **CI job key `codegen-drift` preserved unchanged.** PATTERNS.md §G + CONTRIBUTING.md branch-strategy invariant: the 5 named status checks (`move`, `ts`, `python`, `codegen-drift`, `parity`) are bound to GitHub branch protection. Renaming any key would silently disable required-status-check enforcement until manually reconfigured.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] First codegen emit produced bare numeric literals (no underscore separators), failing the plan's `done` criterion.**

- **Found during:** Task 2 (post-`python scripts/codegen.py` spot-check)
- **Issue:** Initial `emit_phi_move/python/typescript` used `f"{value}"` directly. Python `tomllib` parses `662_910_000` into the `int` `662910000` (correctly — TOML semantics) but `f"{int}"` doesn't reintroduce separators. Output was `public fun small_threshold(): u128 { 662910000 }` — Move-valid but plan-invalid: the plan's done criterion explicitly says "the Move file specifically does NOT have decimal literals without `_` separators where the source TOML has them." Without separators, side-by-side audit against vendored `helper/math.move:31-65` is a digit-counting exercise, not a grep.
- **Fix:** Added `_fmt_underscored(n: int) -> str: return f"{n:_d}"` helper (Python 3.6+ format spec) and threaded it through every value emission in all 3 emitters. Move 2024, Python 3.6+, and TypeScript all accept `_` as a numeric digit separator (`662_910_000`, `662_910_000n` — both valid).
- **Files modified:** `scripts/codegen.py` (added helper + 30 call-site swaps); regenerated all 3 phi files in same task commit.
- **Commit:** `3e8c522` (Task 2 — single commit captures both the buggy first emit and the fixed re-emit since they're part of the same task action; TDD-style "first attempt failed, fixed in same iteration" pattern).
- **Verification:** Post-fix grep confirms `public fun small_threshold(): u128 { 662_910_000 }`, `SMALL_THRESHOLD: Final[int] = 662_910_000`, `SMALL_THRESHOLD: 662_910_000n,` all present.

---

**Total deviations:** 1 auto-fixed (Rule 1 — bug in first emit attempt; correctness issue per plan's done-criterion).
**Impact on plan:** No scope creep, no schedule impact (caught in same task as introduced). The `_fmt_underscored` helper is genuinely useful and will be reused by Plan 01-04's golden-vector emitter for the same auditability reason.

## Issues Encountered

None besides the deviation above. All three task `<verify>` blocks passed. Drift-check end-to-end test (perturb TOML → expect exit 1 → restore → expect exit 0) passed cleanly. YAML validated. No untracked artifacts left over.

## User Setup Required

None — no external service configuration required for this plan. The codegen pipeline runs entirely within the existing `uv run --no-project python ../scripts/codegen.py` workflow inherited from Phase 0.

## Self-Check: PASSED

Verified each created/modified file exists and each commit is in `git log --oneline`:

- FOUND: `shared/cody_phi_coefficients.toml` (87 lines, parses as TOML, schema_version=1, upstream_sha=1159d79a…, 28 numeric coefs + 2 thresholds + 1 LN2)
- FOUND: `contracts/sources/phi_coefficients.move` (51 lines, AUTO-GENERATED header citing cody_phi_coefficients.toml, `module deepvault::phi_coefficients`, all 31 `public fun X(): u128` accessors with `_` separators)
- FOUND: `backtest/src/deepvault/phi_coefficients.py` (51 lines, `from typing import Final`, all 31 `Final[int]` declarations with `_` separators)
- FOUND: `dashboard/src/lib/phi_coefficients.ts` (51 lines, `export const PHI_COEFFICIENTS = {...} as const;`, all 29 values with `n` bigint suffix and `_` separators)
- FOUND: `scripts/codegen.py` (modified; load_phi present; emit_phi_move/python/typescript present; HEADER_LINES_PHI present; main writes/checks 6 paths)
- FOUND: `.github/workflows/ci.yml` (modified; codegen-drift job lists 6 file paths; job key `codegen-drift` unchanged; references CONTRIBUTING.md §6)
- FOUND commit `1f97f4f` (Task 1 — TOML)
- FOUND commit `3e8c522` (Task 2 — codegen extension + 3 generated files)
- FOUND commit `2bfd633` (Task 3 — CI extension)

`uv run --no-project python ../scripts/codegen.py --check` (clean state): EXIT 0.
Drift-injection test (`a0 += 1`): EXIT 1 with all 3 phi files flagged. Restored, re-checked: EXIT 0.

## Next Phase Readiness

Plan 01-02 unblocks the three runtime Φ implementations:

| Plan | Reads | Status |
|------|-------|--------|
| 01-03 (Python evaluator + phi.py) | `from deepvault.phi_coefficients import SMALL_THRESHOLD, SMALL_A0, …, MEDIUM_D7, LN2_U128` | UNBLOCKED |
| 01-05 (Move evaluator + helpers/phi.move) | `use deepvault::phi_coefficients;` then `phi_coefficients::small_threshold()`, etc. | UNBLOCKED |
| 01-06 (TS evaluator + dashboard/lib/phi.ts) | `import { PHI_COEFFICIENTS } from './phi_coefficients';` | UNBLOCKED |
| 01-04 (golden emitter) | None directly — but reuses the codegen-extension pattern (Multi-TOML load + pairs list + --check drift); `_fmt_underscored` helper is reusable for `shared/golden-vectors.json` integer-hex emission | UNBLOCKED with template-reuse opportunity |

**Concerns / flags forwarded to STATE.md:**

- Plan 01-04 (golden emitter) should extend the CI codegen-drift list a third time with `shared/golden-vectors.json` (and any companion `contracts/tests/golden_vectors_data.move`). The pattern is now well-established: append to the `git diff --exit-code --stat` block, do NOT rename the job key.
- All three Φ implementations (Plans 01-03, 01-05, 01-06) MUST cite `shared/svi-spec.md` §"Φ approximation" and import from `phi_coefficients.{move,py,ts}` — never hand-code the values. The CI drift gate enforces the file-edit boundary; CONTRIBUTING.md §6 enforces the policy boundary.
- The `LN2_U128` auxiliary constant is now available via `phi_coefficients` accessor in all 3 runtimes — Plan 01-03 / 01-05 / 01-06 should consume it from there, NOT define their own duplicate constant.

---
*Phase: 01-math-foundation-svi-parity-gate*
*Plan: 02*
*Completed: 2026-05-09*
