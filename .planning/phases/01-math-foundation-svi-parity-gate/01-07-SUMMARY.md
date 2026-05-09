---
phase: 01-math-foundation-svi-parity-gate
plan: 07
subsystem: math-foundation
tags: [svi, ci, parity-gate, phase-1, wave-5]

# Dependency graph
requires:
  - phase: 01-math-foundation-svi-parity-gate
    plan: 03
    provides: backtest/src/deepvault/svi.py (SVIParams + total_variance + binary_price — Python canonical evaluator imported by parity_runner.py)
  - phase: 01-math-foundation-svi-parity-gate
    plan: 04
    provides: shared/golden-vectors.json (141 vectors — D-16 hex schema with {mag,neg} signed pairs; both parity_runner.py and parity_runner.ts read this file)
  - phase: 01-math-foundation-svi-parity-gate
    plan: 05
    provides: contracts/tests/svi_view_test.move (svi_view_tests::golden_vectors_*_all_pass — Move leg of the parity assertion; CI invokes via sui move test --filter golden_vectors)
  - phase: 01-math-foundation-svi-parity-gate
    plan: 06
    provides: dashboard/src/lib/svi.ts (totalVariance + binaryPrice — TypeScript bigint canonical evaluator imported by parity_runner.ts)
provides:
  - backtest/src/deepvault/parity_runner.py (CLI: `python -m deepvault.parity_runner` runs 141 golden vectors through Python svi.py and exits 1 on any mismatch; supports --first/--tier/--tolerance)
  - dashboard/src/lib/parity_runner.ts (CLI: `pnpm exec tsx src/lib/parity_runner.ts` runs 141 golden vectors through dashboard svi.ts and exits 1 on any mismatch; same flag surface as Python)
  - .github/workflows/ci.yml [parity job] — three-way assertion: forbidden-token grep + Python parity_runner + TS parity_runner + Move filtered test + Move full test + green-line summary; job KEY `parity` preserved for branch protection
affects:
  - phase-2-vault-rebalance (CI parity gate now blocks any change to the SVI math layer that breaks cross-runtime equality; Phase 2 vault.rebalance imports `deepvault::svi_view::binary_price` from a parity-gate-protected module)
  - phase-3-backtest (Python parity_runner is also a regression detector — if golden_emit.py is later modified to derive expected from a different source like scipy, the runner catches Python-side drift)
  - phase-4-dashboard (TS parity_runner uses the same `dashboard/src/lib/svi.ts` the dashboard SVI surface plot will import; CI guarantees that module produces bit-equal output with Move/Python before any dashboard work begins)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Three-way cross-runtime parity gate via JSON fixture: shared/golden-vectors.json is the single source of expected values consumed by Python (parity_runner.py), TypeScript (parity_runner.ts), and Move (golden_vectors_data.move companion). Schema drift is structurally impossible because all three runtimes read the same fixture; algorithmic drift in any runtime fails the corresponding CI step."
    - "Job KEY preservation pattern (third application): Plan 00-07 established 5-job CI matrix; Plan 01-02 extended codegen-drift; Plan 01-04 extended codegen-drift again; Plan 01-07 replaces parity job body while preserving job KEY `parity` (CONTRIBUTING.md §'Branch strategy' pins required-status-checks to job keys). Display name is the only allowed change to existing identifiers."
    - "Forbidden-token grep as CI-enforced invariant: dashboard/src/lib/{math,isqrt,phi,ln,svi}.ts MUST NOT use Number(/parseFloat(/Math.{sqrt,exp,log,pow}(. The grep step in the parity job catches accidental float-coercion regressions (Pitfall B / T-01-29 mitigation). Source-code-level enforcement complements the runtime BigInt-vs-Number TypeError that would otherwise only surface during test execution."
    - "Self-consistent Python parity (regression detector pattern): the Python evaluator both PRODUCES expected values (via golden_emit.py invoking deepvault.svi.binary_price) and CONSUMES them (via parity_runner.py reading the same JSON). Today this is tautological (always green); tomorrow if golden_emit.py is modified to derive expected from scipy or predict-server REST, the runner catches Python-side drift without needing a new test harness."

key-files:
  created:
    - backtest/src/deepvault/parity_runner.py
    - dashboard/src/lib/parity_runner.ts
    - .planning/phases/01-math-foundation-svi-parity-gate/01-07-SUMMARY.md
  modified:
    - .github/workflows/ci.yml

key-decisions:
  - "Tolerance default of 1 unit at FLOAT_SCALING (1e9) per re-routed D-14, mirroring Plan 01-05/01-06 svi_view_tests and svi.test.ts. Empirically all 141 vectors pass at tolerance 0 (exact equality across all three runtimes), but the 1-unit guardrail accommodates any future off-by-one rounding edge cases without weakening the parity claim — a 1-unit drift at 1e9 is 10^-9 relative error, well below any meaningful pricing tolerance."
  - "Plan 01-07 instructs ! grep -q 'Phase 0 stub' as a verify check. The phrase appeared in the top-of-file CI comment block (line 3) AND in the replaced job step. Removed both: top-of-file comment rewritten to describe the four Phase-1 parity steps; replaced job step body has no Phase-0 placeholder language."
  - "Both parity_runner CLIs use a tight argparse / process.argv-slice flag surface (--first, --tier, --tolerance). The flags exist for local debugging; CI runs the bare CLI to assert the full 141-vector set. This matches the 01-PATTERNS.md §'parity_runner.py' role-match scaffold from scripts/codegen.py."
  - "TS runner uses absBig() helper instead of bigint Math.abs (which doesn't exist) — pattern documented inline. Diff computation `actual >= expected ? actual - expected : expected - actual` matches Plan 01-06's svi.test.ts inline pattern; absBig wrapper is purely cosmetic."
  - "Move leg invokes `sui move test --gas-limit 100000000000 --filter golden_vectors` for the targeted parity assertion AND `sui move test --gas-limit 100000000000` (no filter) for sanity. The two-step approach mitigates T-01-38 (Spoofing — malformed filter matches no tests but exits 0): if --filter golden_vectors silently matches no tests, the second full-suite run still validates everything else, and the targeted run catches a typo by failing immediately."

patterns-established:
  - "Branch-protection-stable CI job extension (third application after 01-02 and 01-04): when extending an existing CI job, preserve the job KEY (left side of the YAML map) and the `needs:` list verbatim; only the display `name:` and steps change. Required-status-checks bind to job KEYS; renaming a key silently disables the check until manually re-enabled in repo settings. CONTRIBUTING.md §'Branch strategy' is the human-process backstop."
  - "Two-step Move CI invocation for filter-and-sanity coverage: `sui move test --filter <pattern>` for targeted assertion + `sui move test` for full sanity. Catches malformed filter (T-01-38) without doubling test execution time on a green pipeline (Move test suite is ~10s)."

requirements-completed:
  - MATH-05

# Metrics
duration: 9min
completed: 2026-05-09
---

# Phase 1 Plan 07: CI Parity Gate Wiring (MATH-05) Summary

**MATH-05 satisfied. The three-way SVI parity gate is now CI-enforced: any PR (or push to main) that breaks parity in Python, TypeScript, or Move on the 141 golden vectors blocks merging. Two new parity_runner CLIs (Python + TS) read shared/golden-vectors.json, evaluate every vector through their respective canonical evaluators (deepvault.svi / dashboard/src/lib/svi.ts), and exit 1 on any mismatch beyond the configurable tolerance (default 1 unit at 1e9). The CI parity job replaces a Phase 0 stub with five real assertion steps: forbidden-token grep on the bigint TS evaluator (Pitfall B / T-01-29), Python parity_runner, TS parity_runner, filtered Move test (`sui move test --filter golden_vectors`), and full Move test sanity run. Job KEY `parity` and `needs: [move, ts, python, codegen-drift]` are preserved for branch protection compatibility per CONTRIBUTING.md §'Branch strategy'. Local verification: both runners exit 0 on all 141 vectors at exact equality (tolerance 0); ROADMAP §'Hard Policy Locks' #1 (three-way SVI parity gate, non-cuttable) is now enforced in perpetuity by CI.**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-05-09T16:06:55Z
- **Completed:** 2026-05-09T16:15:41Z
- **Tasks:** 2 (both `type=auto`)
- **Files created:** 3 (2 parity_runner CLIs + this SUMMARY)
- **Files modified:** 1 (.github/workflows/ci.yml)

## Accomplishments

### Parity runner CLIs

- **`backtest/src/deepvault/parity_runner.py` (143 lines, ruff-clean)** — Python CLI parity runner. Reads `shared/golden-vectors.json` via `Path(__file__).resolve().parents[3] / "shared" / "golden-vectors.json"`. Decodes signed `{mag, neg}` hex pairs via `_decode_signed`. For each vector: builds `SVIParams`, dispatches to `total_variance(svi, k)` and `binary_price(svi, forward, strike)` from `deepvault.svi`, asserts diff <= tolerance. Arb-violating vectors (params_valid=false) MUST raise `ValueError` to satisfy parity. Exit codes: 0 = all match, 1 = any mismatch / fixture missing / fixture empty (T-01-35 mitigation). argparse flags: `--first N`, `--tier {A,B,C,C2}`, `--tolerance N` (default 1). Failure output is capped at 20 lines for readability.

- **`dashboard/src/lib/parity_runner.ts` (177 lines)** — TypeScript CLI parity runner. Reads `shared/golden-vectors.json` via `resolve(__dirname, '../../..', 'shared/golden-vectors.json')`. Pure-bigint math: imports `binaryPrice` and `totalVariance` from `./svi`. Uses `absBig` helper for `BigInt`-typed `Math.abs` (which doesn't exist). Same flag surface and exit semantics as the Python runner. Final line: `process.exit(main())` per the plan's `<artifacts>` `contains: process.exit` requirement.

### CI parity job

- **`.github/workflows/ci.yml [parity]` (94 insertions, 13 deletions)** — Replaced the Phase 0 stub (which only asserted `shared/golden-vectors.json` exists) with the real three-way parity assertion. Steps in order:

  1. Checkout (`actions/checkout@v4`)
  2. Install Sui CLI (mainnet-v1.71.1 — copies pattern from `move` job)
  3. Verify Sui version
  4. Install pnpm (`pnpm/action-setup@v4` v10)
  5. Install Node 22 (`actions/setup-node@v6`)
  6. Install (frozen lockfile)
  7. Install uv (`astral-sh/setup-uv@v8`)
  8. Sync backtest env (`uv sync --locked --all-extras --dev`)
  9. **Forbidden-token grep** on dashboard/src/lib/{math,isqrt,phi,ln,svi}.ts — fails if Number(/parseFloat(/Math.{sqrt,exp,log,pow}( found
  10. **Python parity runner** (`uv run python -m deepvault.parity_runner`)
  11. **TypeScript parity runner** (`pnpm exec tsx src/lib/parity_runner.ts`)
  12. **Move golden vectors test** (`sui move test --gas-limit 100000000000 --filter golden_vectors`)
  13. **Move full test suite (sanity)** (no filter; T-01-38 catch-malformed-filter mitigation)
  14. **Parity gate summary** (auditable green-line echo)

  Total step count: 14. Display `name: parity` matches required-status-check. Job KEY `parity` and `needs: [move, ts, python, codegen-drift]` preserved verbatim per CONTRIBUTING.md §"Branch strategy".

  Top-of-file comment block updated to reflect Phase 1 wiring (was: "parity (Phase 0 stub)" — now lists all four parity steps).

### Cross-runtime parity confirmation (local)

- **Python runner (cd backtest):** `PARITY OK: 141 vectors pass within tolerance <= 1.` at default tolerance.
- **TypeScript runner (cd dashboard):** `PARITY OK: 141 vectors pass within tolerance <= 1.` at default tolerance.
- **Both runners at tolerance 0 (exact equality):** `PARITY OK: 141 vectors pass within tolerance <= 0.`
- **Forbidden-token grep against TS evaluator files:** 0 matches (clean).
- **All 5 Phase 0 CI job KEYs preserved:** `move`, `ts`, `python`, `codegen-drift`, `parity` (verified via `grep -E "^  (move|ts|python|codegen-drift|parity):" .github/workflows/ci.yml` returns exactly 5 lines).
- **YAML parses cleanly:** 5 jobs; parity step count = 14; parity needs = `['move', 'ts', 'python', 'codegen-drift']`.
- **Codegen drift:** `python scripts/codegen.py --check` and `python scripts/golden_emit.py --check` both exit 0.
- **Pre-existing test suites still pass:** `cd backtest && uv run pytest` 50 passed in 4.94s; `cd dashboard && pnpm test` 303 passed in 1.93s.

## Task Commits

Each task committed atomically:

1. **Task 1: Implement Python + TypeScript parity_runner CLIs** — `d6ce3bb` (`feat(01-07): implement Python + TypeScript parity_runner CLIs`)
2. **Task 2: Replace CI parity job stub with real three-way parity assertions + forbidden-token grep** — `f6139b0` (`ci(01-07): replace parity stub with three-way parity gate (MATH-05)`)

## Files Created/Modified

### Created

- `backtest/src/deepvault/parity_runner.py` — 143 lines (post-`ruff format`); CLI parity runner reading shared/golden-vectors.json against deepvault.svi.{total_variance, binary_price}; argparse `--first`/`--tier`/`--tolerance`; ruff-clean.
- `dashboard/src/lib/parity_runner.ts` — 177 lines; TS CLI parity runner reading shared/golden-vectors.json against dashboard/src/lib/svi.ts; pure-bigint math; same flag surface as Python runner; ends in `process.exit(main())`.
- `.planning/phases/01-math-foundation-svi-parity-gate/01-07-SUMMARY.md` — this file.

### Modified

- `.github/workflows/ci.yml` — +94 lines / -13 lines. Top-of-file comment block updated to describe Phase 1 parity wiring. `parity:` job body replaced from Phase 0 stub (single file-existence step) with 14-step real-parity assertion. Job KEY `parity`, `needs: [move, ts, python, codegen-drift]`, and all 5 job KEYs preserved.

## Decisions Made

All key decisions are recorded in the frontmatter `key-decisions` block. Highlights:

- **Tolerance default = 1 unit at 1e9** per re-routed D-14, mirroring Plan 01-05/01-06 test tolerances. Empirically all 141 vectors pass at tolerance 0 (exact equality across all three runtimes); the 1-unit guardrail is forward-defense against any future off-by-one rounding nuance.
- **Top-of-file CI comment block updated** alongside the job body to satisfy the plan's `! grep -q "Phase 0 stub"` verify check. The phrase appeared in two places (header comment + replaced job description); both removed.
- **Two-step Move CI invocation** (filter-and-sanity): `sui move test --filter golden_vectors` for the targeted assertion + `sui move test` (no filter) for sanity. Mitigates T-01-38 (silent malformed filter) without doubling test execution time.
- **TS runner uses `absBig` helper** instead of inline `BigInt`-typed `Math.abs` (which doesn't exist) — pattern documented inline. The diff computation matches Plan 01-06 svi.test.ts.
- **Both parity runners treat empty fixtures as failure** (T-01-35 mitigation): `if not vectors: return 1` in Python, `if (vectors.length === 0) return 1` in TS. The plan's success criteria require this — empty array silently passes is a security-relevant repudiation threat.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Plan template's verify block expected `! grep -q "Phase 0 stub"` but the phrase also lived in the top-of-file CI comment block (line 3), not just the replaced job step.**

- **Found during:** Task 2 (post-edit verify execution).
- **Issue:** The plan instructed editing the `parity:` job body and removing "Phase 0 stub" from there. After the edit, `grep -q "Phase 0 stub"` still matched line 3 of the file (`# Five jobs: move, ts, python, codegen-drift, parity (Phase 0 stub).`), causing the verify check to fail.
- **Fix:** Rewrote the top-of-file comment block to describe the four Phase 1 parity steps (forbidden-token grep + Python parity_runner + TS parity_runner + Move golden_vectors_*). Both the comment and the job body now describe the same Phase 1 wiring; no "Phase 0 stub" remnants anywhere in the file.
- **Files modified:** `.github/workflows/ci.yml`.
- **Commit:** Folded into `f6139b0` (Task 2).
- **Verification:** `grep -q "Phase 0 stub" .github/workflows/ci.yml` exits 1 (no matches).

---

**Total deviations:** 1 auto-fixed (Rule 1 — verify-grep false positive on file header). No architectural changes. The plan template focused on the job body; the file-header comment was a secondary location the verify pattern caught. Decision recorded in `key-decisions` for traceability.

**Impact on plan:** No scope creep, no schedule impact. Caught and fixed before commit.

## Authentication / Verification Gates

None — both parity_runners run entirely under `cd backtest && uv run python -m deepvault.parity_runner` and `cd dashboard && pnpm exec tsx src/lib/parity_runner.ts`. No external services, no network calls, no secrets. The full 141-vector run completes in ~1s wall-clock for each runtime.

The CI parity job installs Sui CLI (mainnet-v1.71.1) but the Sui CLI itself was unavailable in this local execution environment (verified by Plan 01-05 SUMMARY.md). Local verification is therefore limited to Python + TS runners. The Move test leg of the parity gate will execute for the first time on the next CI run after the next push to main / open PR. **Post-this-plan action:** the user/developer should monitor the next CI run on main and confirm the `parity` job exits 0; if any of the 4 substantive steps fail, the diagnostic is the step name + the runner's structured output (parity_runner exit messages name failing vector IDs explicitly).

## Issues Encountered

None besides the deviation above. Both task `<verify>` automated checks pass:

- **Task 1 verify:** `cd backtest && uv run python -m deepvault.parity_runner` exits 0 with `PARITY OK: 141 vectors pass`. `cd dashboard && pnpm exec tsx src/lib/parity_runner.ts` exits 0 with `PARITY OK: 141 vectors pass`. Both runners filter by `--tier` and `--first` correctly. Both correctly reject arb-violating vectors (params_valid=false → must raise/throw).

- **Task 2 verify:** `grep -q "^  parity:" .github/workflows/ci.yml` exits 0; `grep -q "needs: [move, ts, python, codegen-drift]"` exits 0; `grep -q "deepvault.parity_runner"` exits 0; `grep -q "src/lib/parity_runner.ts"` exits 0; `grep -q "filter golden_vectors"` exits 0; `grep -q "Forbidden-token grep"` exits 0; forbidden tokens in grep pattern present (line 226 of ci.yml); `grep -q "Phase 0 stub"` exits 1 (no matches — passes `! grep -q` check). YAML parses cleanly with 5 jobs and 14 steps in the parity job.

## Threat Model Compliance

| Threat | Mitigation Status |
|--------|-------------------|
| T-01-34 (Tampering — job KEY rename silently disables branch protection) | Mitigated. Verify block explicitly checks `^  parity:` is present; CONTRIBUTING.md §"Branch strategy" pins required-status-checks to job KEYS; this plan preserves the KEY verbatim. Reviewer-process backstop. |
| T-01-35 (Tampering — parity_runner exits 0 on empty fixture) | Mitigated. Both runners explicitly check `if not vectors: return 1` / `if (vectors.length === 0) return 1`. Empty array fails loudly. |
| T-01-36 (Tampering — forbidden-token bypass via Unicode obfuscation) | accept. Hackathon scope; runtime BigInt-vs-Number TypeError catches genuine breakage; v2 ESLint rule for AST-level enforcement. |
| T-01-37 (DoS — CI parity job timeout) | Mitigated. Each runner ~1s wall-clock for 141 vectors; Move tests ~10s; total parity job ~30s. GHA default 6h timeout — three orders of magnitude headroom. |
| T-01-38 (Spoofing — sui move test --filter matches no tests but exits 0) | Mitigated. Two-step Move invocation: filtered (`--filter golden_vectors`) targeted assertion + unfiltered full sanity. Either silent-pass-on-no-match or genuine green requires the second step also to pass. |
| T-01-39 (Repudiation — CI green doesn't mean parity actually checked) | Mitigated. Final "Parity gate summary" step echoes explicit confirmation lines for each of the four sub-checks; CI logs are auditable. |

`security_block_on: high` clears — T-01-34 is HIGH-severity but has both `<verify>` and CONTRIBUTING.md mitigations.

## User Setup Required

After this plan lands:

1. **Push to main / open a PR** — CI's `parity` job will execute for the first time as a real three-way parity gate. Expected: green. If red, the failing step name and the runner output identify the failing vector(s) by ID.
2. **Verify branch protection still applies** — On GitHub, repo Settings → Branches → main → Branch protection rules → required status checks should still list `parity` (the rename was display-only; the KEY is unchanged). If the GitHub UI shows the check as "pending" indefinitely, the most likely cause is that the new step renamed the *display* `name:` to `parity` (matching the KEY) and GitHub may briefly need to see one passing run to re-resolve the binding. Plan 00-07 Task 4 (initial branch protection setup) is a precondition that may still be human-action-pending.
3. **Monitor first CI run** — A green parity job is the operational confirmation that MATH-05 is satisfied. If any of the 4 parity sub-steps fail, halt feature work per CONTRIBUTING.md §"Hard policy locks" #6 and CONTRIBUTING.md §"SVI math layer is locked" — re-establishing parity is the load-bearing repair before any new work.

No secrets, services, accounts, or wallet provisioning required.

## Self-Check: PASSED

Verified each created/modified file exists and each commit is in `git log --oneline`:

- FOUND: `backtest/src/deepvault/parity_runner.py` (143 lines, ruff-clean, exit 0 on 141 vectors at tolerance 1 AND tolerance 0)
- FOUND: `dashboard/src/lib/parity_runner.ts` (177 lines, exit 0 on 141 vectors at tolerance 1 AND tolerance 0)
- FOUND: `.github/workflows/ci.yml` (modified — +94 lines / -13 lines; 14 steps in parity job; job KEY `parity` and `needs: [move, ts, python, codegen-drift]` preserved; all 5 Phase 0 job KEYs preserved)
- FOUND commit `d6ce3bb` (Task 1 — feat(01-07): implement Python + TypeScript parity_runner CLIs)
- FOUND commit `f6139b0` (Task 2 — ci(01-07): replace parity stub with three-way parity gate (MATH-05))

Verification commands:

```
$ cd backtest && uv run python -m deepvault.parity_runner
PARITY OK: 141 vectors pass within tolerance <= 1.
$ cd dashboard && pnpm exec tsx src/lib/parity_runner.ts
PARITY OK: 141 vectors pass within tolerance <= 1.
$ grep -nE "^  (move|ts|python|codegen-drift|parity):" .github/workflows/ci.yml
27:  move:
59:  ts:
90:  python:
119:  codegen-drift:
160:  parity:
$ grep -q "Phase 0 stub" .github/workflows/ci.yml; echo $?
1
$ cd backtest && uv run --no-project python ../scripts/codegen.py --check
(no output, exit 0)
$ cd backtest && uv run --no-project python ../scripts/golden_emit.py --check
(no output, exit 0)
$ cd backtest && uv run pytest -q
.................................................. (50 passed in 4.94s)
$ cd dashboard && pnpm test
303 passed (303) in 1.93s
```

`grep -E "Number\(|parseFloat\(|Math\.(sqrt|exp|log|pow)\(" dashboard/src/lib/{math,isqrt,phi,ln,svi}.ts`: **0 matches** (clean).

## Next Phase Readiness

Plan 01-07 closes the MATH-05 parity gate; the only remaining Phase 1 work is Plan 01-08 (arb-checker + Tier C/C2 upgrade).

| Plan | Reads | Status |
|------|-------|--------|
| 01-08 (arb-checker + Tier C/C2 upgrade) | May overwrite Tier C2 expected values in `shared/golden-vectors.json` with empirical sui-move-test outputs of `oracle::compute_nd2` (per Plan 01-04 + 01-05 forwarded notes); regenerates and re-runs all three parity runners + CI to confirm parity holds at the new vector set. | UNBLOCKED |
| Phase 2 (vault.rebalance) | Imports `deepvault::svi_view::binary_price` from a parity-gate-protected module. Any change in `svi_view.move` that breaks parity blocks merging via the `parity` job. | UNBLOCKED (with parity gate as ongoing protection) |
| Phase 3 (backtest harness) | Imports `deepvault.svi.{SVIParams, total_variance, binary_price}` from a parity-gate-protected module. Same protection applies. | UNBLOCKED |
| Phase 4 (dashboard) | Imports `binaryPrice` and `totalVariance` from `dashboard/src/lib/svi`. The CI forbidden-token grep guarantees the bigint discipline holds; the parity_runner guarantees bit-equality with Move + Python. Phase 4 work begins from a parity-gate-green base. | UNBLOCKED |

**Concerns / flags forwarded to STATE.md:**

- **Move leg untested locally.** The Sui CLI is unavailable in the execution environment (per Plan 01-05 SUMMARY.md). The `Move golden vectors test` and `Move full test suite (sanity)` steps will execute for the first time on the next CI run. Confidence is HIGH that they will pass based on Plan 01-05's static review against the vendored Predict source, but UNTESTED in an automated environment until then. If a Move test fails, the diagnostic is the failing test name + the loop iteration's abort code (which equals the vector index per Plan 01-05's design).
- **Branch protection state unknown.** Plan 00-07 Task 4 is BLOCKED-on-human (gh repo create + git branch -M main + git push -u origin main + configure branch protection); the parity job's role as a required-status-check binding only takes effect once Task 4 lands. This plan's local parity_runner CLIs and CI yaml edit are correct; the gating effect activates when the repo is on GitHub with branch protection configured.
- **Tolerance asymmetry:** the Python runner's `--tolerance` default is 1 (matching the plan template), and the TS runner's default is 1n (matching). Both runners are also empirically green at tolerance 0 (exact equality). If a future MATH commit introduces a 1-unit drift in any runtime, the runners will still pass at tolerance 1; the operational tolerance is a deliberate guardrail per re-routed D-14, not a bug-permit. CI's parity job uses default tolerance.
- **Forbidden-token grep is line-oriented**, not AST-aware. A motivated developer could obfuscate (e.g., `globalThis['Num' + 'ber']`) to bypass; this is accepted hackathon-scope risk per T-01-36. Runtime BigInt-vs-Number TypeError catches genuine bugs; the grep is a fast-feedback regression detector for the common case.
- **Parity_runner CLIs are committed to the source tree** (parity_runner.py inside `backtest/src/deepvault/`, parity_runner.ts inside `dashboard/src/lib/`). They live next to their canonical evaluators by design — co-location makes path resolution trivial (`Path(__file__).resolve().parents[3]` and `resolve(__dirname, '../../..')`) and ensures the CLIs travel with the modules they exercise. If a future refactor moves `svi.py` or `svi.ts`, the parity_runner co-located in the same package needs no relative-path update beyond what the move itself implies.

---
*Phase: 01-math-foundation-svi-parity-gate*
*Plan: 07*
*Completed: 2026-05-09*
