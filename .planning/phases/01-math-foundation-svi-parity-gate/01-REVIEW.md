---
phase: 01-math-foundation-svi-parity-gate
reviewed: 2026-05-09T00:00:00Z
depth: standard
files_reviewed: 47
files_reviewed_list:
  - .github/workflows/ci.yml
  - CONTRIBUTING.md
  - backtest/src/deepvault/arb_checker.py
  - backtest/src/deepvault/isqrt.py
  - backtest/src/deepvault/ln.py
  - backtest/src/deepvault/parity_runner.py
  - backtest/src/deepvault/phi.py
  - backtest/src/deepvault/phi_coefficients.py
  - backtest/src/deepvault/strategy_constants.py
  - backtest/src/deepvault/svi.py
  - backtest/tests/fixtures/jackjacquier_ssvi_outputs.json
  - backtest/tests/test_arb_checker.py
  - backtest/tests/test_gatheral_paper_vectors.py
  - backtest/tests/test_isqrt.py
  - backtest/tests/test_isqrt_random_snapshot.txt
  - backtest/tests/test_phi_against_scipy.py
  - backtest/tests/test_svi.py
  - contracts/sources/helpers/i64.move
  - contracts/sources/helpers/isqrt.move
  - contracts/sources/helpers/ln.move
  - contracts/sources/helpers/math.move
  - contracts/sources/helpers/phi.move
  - contracts/sources/phi_coefficients.move
  - contracts/sources/strategy_constants.move
  - contracts/sources/svi_view.move
  - contracts/tests/golden_vectors_data.move
  - contracts/tests/i64_test.move
  - contracts/tests/isqrt_test.move
  - contracts/tests/phi_test.move
  - contracts/tests/svi_view_test.move
  - dashboard/package.json
  - dashboard/src/lib/__tests__/arb_checker.test.ts
  - dashboard/src/lib/__tests__/isqrt.test.ts
  - dashboard/src/lib/__tests__/phi.test.ts
  - dashboard/src/lib/__tests__/svi.test.ts
  - dashboard/src/lib/arb_checker.ts
  - dashboard/src/lib/isqrt.ts
  - dashboard/src/lib/ln.ts
  - dashboard/src/lib/math.ts
  - dashboard/src/lib/parity_runner.ts
  - dashboard/src/lib/phi.ts
  - dashboard/src/lib/phi_coefficients.ts
  - dashboard/src/lib/strategy_constants.ts
  - dashboard/src/lib/svi.ts
  - dashboard/tsconfig.json
  - dashboard/vitest.config.ts
  - scripts/codegen.py
  - scripts/golden_emit.py
  - shared/cody_phi_coefficients.toml
  - shared/golden-vectors.json
findings:
  blocker: 1
  warning: 11
  info: 4
  total: 16
status: issues_found
---

# Phase 1: Code Review Report

**Reviewed:** 2026-05-09
**Depth:** standard
**Files Reviewed:** 47 (51 files in scope; 4 partial reads on the largest auto-generated artifacts)
**Status:** issues_found

## Summary

Phase 1 ships a three-runtime SSVI evaluator (Move + Python + TypeScript) plus a parity-gate CI workflow over 141 golden vectors. Algorithmic op-order and citation discipline are excellent — every cloned helper carries the vendored SHA `1159d79af33c70e09e406310e1d8f067832ede9d`, every multiply-then-divide goes through `mul_div_round_down`-equivalent helpers, and the forbidden-token grep + codegen-drift gate are correctly wired. The Cody Phi, integer Newton sqrt, ln, and raw-SVI evaluator clones cross-check correctly against scipy / paper / Predict-source structure.

The bulk of the code is clean. However, there is one **BLOCKER**: the Move test `golden_vectors_arb_violating_all_reject` does NOT actually exercise the rejection path against `svi_view::*` — it only counts how many vectors are tagged `params_valid=false`. The vendored DeepBook code-review checklist (which Phase 1 explicitly derives from) is unambiguous: "Every generated test vector must be exercised against the contract. If generated data isn't passed to the function under test, delete it." This means D-04 / Plan 01-08's claim that "Move evaluator hard-rejects invalid params" is NOT proved by the parity gate as currently wired — only the three single-shot abort tests prove it (one per error code).

Secondary findings: two parity-divergence WARNINGs (Python `binaryPrice` skips parameter-bounds + k-range validation that Move/TS perform; Python `total_variance` skips bounds Move/TS skip — but Python's omission of k-range in `binaryPrice` is the one that diverges); one stale magic constant tied to LN2_U128 in Move `phi.move`; one cross-runtime function-contract drift in `isqrt_initial_guess(0)` (Move returns 1, Python returns 1, TS returns 0n) — non-load-bearing because both `isqrt_u128` short-circuit zero; and a handful of test-coverage / naming nits.

## Critical Issues / BLOCKER

### CR-01: Move `golden_vectors_arb_violating_all_reject` does not exercise the contract — BLOCKER

**File:** `contracts/tests/svi_view_test.move:102-122`

**Issue:** The test claims to provide rejection-path coverage for the 10 arb-violating Tier-B golden vectors but only **counts** how many `params_valid=false` flags exist in the data table. It never feeds those rows to `svi_view::total_variance_from_params` or `svi_view::binary_price_from_params`. The single rejection test (`zero_a_zero_b_aborts_zero_variance`) only proves that ONE hand-crafted (a=0, b=0) call aborts — it does not loop over the 10 generated vectors. Per `scripts/deepbookv3/.claude/rules/code-review.md` ("Every generated test vector must be exercised against the contract. If generated data isn't passed to the function under test, delete it.") this is a defect, and per Phase 1 D-04 ("Move evaluator hard-rejects invalid params") + threat model alignment, it is the load-bearing test for the rejection-path closed-form gate. As written, if `golden_emit.py` ever produces `params_valid=false` rows whose params do NOT actually trigger an abort, this Move test will silently pass while the on-chain evaluator returns garbage for those rows.

**Fix:** Replace the count-only loop with a per-row `expected_failure`-style test. Either (a) generate one `#[test, expected_failure(abort_code = svi_view::EZeroVariance)]` per arb-violating vector via a Move-side macro, or (b) refactor `binary_price_from_params` to return a `Result<u64, u64>` for testing (Move 2024 doesn't have Result; the macro approach is cleaner). Minimum acceptable fix:

```move
// Add 10 separate tests, one per known-arb vector index. The loop-and-count
// pattern can stay as a sanity check, but the per-vector tests are the actual
// gate.
#[test, expected_failure(abort_code = svi_view::EZeroVariance)]
fun golden_arb_vector_91_aborts() {
    let inputs = golden_vectors_data::all_inputs();
    let row = inputs[90]; // B-arb-091 (index 90)
    let rho = i64::from_parts(row[2], row[3] == 1);
    let m = i64::from_parts(row[4], row[5] == 1);
    let _ = svi_view::binary_price_from_params(
        row[0], row[1], rho, m, row[6], row[9], row[10]
    );
    abort 999
}
// ...repeat for indices 91..99
```

Alternatively, accept the architectural reality: the per-row Move test is impractical (one `expected_failure` per row = 10 tests). Document that fact explicitly in `01-SUMMARY.md` and have `golden_emit.py` assert at emit time that every `params_valid=false` vector raises when fed to the Python evaluator (closing the loop via Python's load-bearing parity rather than Move's). Either way, the current code does NOT prove what its docstring claims.

## Warnings

### WR-01: Python `binary_price` skips param-bounds and k-range validation that Move/TS perform

**File:** `backtest/src/deepvault/svi.py:102-129`

**Issue:** Move `svi_view::binary_price_from_params` enforces `EParamOutOfRange` (a/b/sigma/m/rho bounds) AND `EKOutOfRange` (|k| <= `svi_k_max_log_strike`). TypeScript `binaryPrice` calls `_validateParams(svi)` and re-checks `kMag > SVI_K_MAX_LOG_STRIKE`. Python `binary_price` does neither. Concrete scenario: an out-of-bounds Python input (e.g., `sigma > SVI_SIGMA_MAX`) silently computes a result while Move/TS abort. Because all 141 golden vectors are within bounds, the parity gate currently passes — but the runtime semantics across the three evaluators are not bit-identical; only their outputs on the in-bounds vectors are. This contradicts the Phase 1 spec's claim that the three evaluators are "bit-equal."

**Fix:** Add the equivalent guards in Python before line 120:

```python
def binary_price(svi: SVIParams, forward: int, strike: int) -> int:
    if forward <= 0:
        raise ValueError(EZeroForward)
    if strike <= 0:
        raise ValueError(EZeroStrike)
    # Parity with TS _validateParams + Move binary_price_from_params bounds.
    from .strategy_constants import (
        SVI_A_MAX, SVI_B_MAX, SVI_SIGMA_MIN, SVI_SIGMA_MAX,
        SVI_M_ABS_MAX, SVI_K_MAX_LOG_STRIKE,
    )
    if svi.a > SVI_A_MAX or svi.b > SVI_B_MAX:
        raise ValueError("EParamOutOfRange")
    if not (SVI_SIGMA_MIN <= svi.sigma <= SVI_SIGMA_MAX):
        raise ValueError("EParamOutOfRange")
    if abs(svi.rho) >= F:
        raise ValueError("EParamOutOfRange")
    if abs(svi.m) > SVI_M_ABS_MAX:
        raise ValueError("EParamOutOfRange")
    k = ln_signed((strike * F) // forward)
    if abs(k) > SVI_K_MAX_LOG_STRIKE:
        raise ValueError("EKOutOfRange")
    # ...rest unchanged
```

### WR-02: `golden_emit.py` does not assert that arb-violating vectors actually reject

**File:** `scripts/golden_emit.py:179-203`

**Issue:** The arb-violating sub-tier hand-codes `(a=0, b=0, ...)` rows with the assumption that they all hit `EZeroVariance`. The emitter then writes whatever the evaluator does — if a future change to `svi.py` makes one of those rows succeed (e.g., `a=0, b=0, k=0, sigma>0` → inner=sigma>0 → still triggers w==0, but consider a future refactor that adds a tiny epsilon to `a`), the JSON silently flips that row's `params_valid` to `True` and the Move counter test (CR-01) silently misses it. There is no defensive assertion that "what we emit as arb-violating actually was rejected."

**Fix:** After the arb-violating loop, add:

```python
emitted_invalid = sum(1 for v in vectors if v["expected"]["source"].endswith("arb-violating") if not v["expected"]["params_valid"])
assert emitted_invalid == len(arb_violating), (
    f"Expected all {len(arb_violating)} arb-violating cases to set params_valid=False; "
    f"got {emitted_invalid}. Either svi.py changed or the cases no longer trigger rejection."
)
```

This pairs with the Move test fix in CR-01 — the Move side proves on-chain rejects, the Python side proves the data table actually contains the invalid rows it claims.

### WR-03: Move `MAX_EXP_INPUT` is a magic constant tied to codegen-emitted LN2_U128

**File:** `contracts/sources/helpers/phi.move:30`

**Issue:** `MAX_EXP_INPUT: u64 = 23_638_153_699` is documented as "with LN2_U128=693_147_180, at x=23_638_153_700 the bit-shift produces 2^64 exactly." The constant is hand-derived from `LN2_U128`, but `LN2_U128` is auto-generated from `shared/cody_phi_coefficients.toml`. If the TOML's `auxiliary.ln2_u128` is ever changed (a `MATH:` change per CONTRIBUTING.md §6 is allowed), this magic constant becomes silently stale and `exp` either over- or under-aborts. CI's codegen-drift job won't catch this because `MAX_EXP_INPUT` lives in a hand-edited helper file.

**Fix:** Either (a) move `MAX_EXP_INPUT` into `shared/cody_phi_coefficients.toml [auxiliary]` so codegen emits it (preferred — single source of truth), or (b) add a `#[test]` in `phi_test.move` that asserts `MAX_EXP_INPUT * 2^(MAX_EXP_INPUT / LN2) <= u64::MAX < (MAX_EXP_INPUT + 1) * 2^((MAX_EXP_INPUT + 1) / LN2)`, so any LN2 bump that invalidates the constant fails CI immediately.

### WR-04: TS `isqrtInitialGuess(0n)` returns `0n`; Move and Python return `1`

**File:** `dashboard/src/lib/isqrt.ts:21-33`

**Issue:** Cross-runtime function-contract drift. Move `sqrt_initial_guess_u128(0)` returns `1u128 << ((0+1)/2 as u8) = 1`. Python `isqrt_initial_guess(0)` returns `1` (early return). TypeScript `isqrtInitialGuess(0n)` returns `0n` (early return on x===0n). This is not currently load-bearing because `isqrtU128` short-circuits `x === 0n` BEFORE calling the seed function; nobody calls the seed with x=0 in production. But the API contract is documented as identical across runtimes, and a future refactor that exposes the seed function (or reuses it elsewhere) would silently produce a non-power-of-two from the TS side and break invariants the test "initial guess is a power of two for non-zero x" was designed to catch (the test only iterates non-zero values, masking the divergence).

**Fix:** Match Move + Python by removing the early-zero special case (Move's algorithm produces `1` for `x=0` naturally) OR add an explicit `if (x === 0n) return 1n;` to mirror Python:

```typescript
export function isqrtInitialGuess(x: bigint): bigint {
  if (x === 0n) return 1n;  // match Move (1u128 << 0 == 1) and Python
  // ...rest unchanged
}
```

Then add a test case `expect(isqrtInitialGuess(0n)).toBe(1n)`.

### WR-05: Move test module name `i64_tests` paired with file `i64_test.move` (singular vs plural)

**File:** `contracts/tests/i64_test.move:13`

**Issue:** Module declares `module deepvault::i64_tests;` (plural); the file is `i64_test.move` (singular). Other tests follow the same pattern (`isqrt_test.move` → `module deepvault::isqrt_tests;`). Inconsistent file-vs-module naming is a maintainability smell — a future reviewer searching for `module i64_test` will not find it via filename. Move's vendored convention from `.claude/rules/move.md` is "Do Not Prefix Tests With `test_` in Testing Modules" — so plural test modules in plural-named files would be cleaner.

**Fix:** Rename the four files to match their module names: `i64_test.move` → `i64_tests.move`, `isqrt_test.move` → `isqrt_tests.move`, `phi_test.move` → `phi_tests.move`, `svi_view_test.move` → `svi_view_tests.move`. Or, conversely, keep the singular filename and rename the module to singular. (Move file naming has no compiler-level rule; this is style consistency.) Either direction works; the current state is inconsistent.

### WR-06: Move `svi_view.move` error codes start at 3 — codes 0/1/2 unexplained

**File:** `contracts/sources/svi_view.move:30-35`

**Issue:** Constants are declared as:
```move
const EZeroForward: u64 = 3;
const ECannotBeNegative: u64 = 4;
const EZeroVariance: u64 = 5;
const EParamOutOfRange: u64 = 6;
const EKOutOfRange: u64 = 7;
const EZeroStrike: u64 = 8;
```
Codes 0, 1, 2 are skipped with no comment explaining why. This is a code smell — either codes were removed (in which case the gap should be backfilled) or they're "reserved for future use" (in which case a comment should say so). A reviewer cannot tell from the source alone which is true.

**Fix:** Either backfill (start at 0) or add a comment block explaining the gap (e.g., "Codes 0-2 reserved for `EOracleStale`, `EOraclePaused`, `EUnauthorized` — added by Phase 2."). Pick one and commit to it.

### WR-07: TS `_validateParams` is called only in `binaryPrice`; `totalVariance` and `evaluateSVI`'s split path skip it

**File:** `dashboard/src/lib/svi.ts:81, 105, 136`

**Issue:** `binaryPrice` calls `_validateParams(svi)` at line 112. `totalVariance` does NOT. `evaluateSVI` calls `totalVariance(svi, k)` at line 149 BEFORE `binaryPrice` at line 150 — so the totalVariance call is unguarded and could produce a result on out-of-range params before the validation in `binaryPrice` aborts. Worse, a caller that uses ONLY `totalVariance` (as the parity_runner does for arb-violating vectors at line 155) bypasses validation entirely. This matches Move's `total_variance_from_params` semantics (which also skips bounds checks), so it's a parity choice rather than a clear bug — but it weakens the threat model for "out-of-bounds params can't reach the math."

**Fix:** Decide explicitly: either (a) move `_validateParams` into `totalVariance` so every public entry validates (and remove from `binaryPrice` to deduplicate), or (b) document the intent in a header comment. If (a), match the same change in Move (`total_variance_from_params` adds the same asserts) and Python (per WR-01).

### WR-08: Defense-in-depth `ECannotBeNegative` rejection path is unreachable in pure SVI math but never tested for the unreachable claim

**File:** `backtest/src/deepvault/svi.py:94-95`, `dashboard/src/lib/svi.ts:92-94`, `contracts/sources/svi_view.move:129`

**Issue:** All three evaluators include `assert!(!i64::is_negative(&inner), ECannotBeNegative);` (Move) / `if inner < 0: raise` (Python/TS). The Plan-01-03 analysis claims this is unreachable for `sigma > 0` because `sqrt((k-m)^2 + sigma^2) >= |k-m|` and `|rho| < F` ⇒ `rho * (k-m) > -|k-m|` ⇒ `inner > 0`. The claim is correct in real arithmetic but in fixed-point integer truncation, `rho * (k-m) / F` and `sqrt(...)` are both rounded down — there is a thin truncation regime where their sum could be `0` (not negative, but boundary). Tests confirm `EZeroVariance` is reachable for `(a=0, b=0)`; nobody tests whether `ECannotBeNegative` is genuinely unreachable for `(a>0, b>0, sigma>0)` across the safe input domain. If a future refactor removes the guard "because it's unreachable," there is no test to catch the regression.

**Fix:** Add a property test that fuzz-grids `(rho, k, m, sigma)` in the safe input domain (1000+ random samples) and asserts `inner >= 0` always. Place in `backtest/tests/test_svi.py`. If the property holds across 1000 samples, that's the empirical evidence backing Plan 01-03's claim.

### WR-09: `parity_runner.py` exception handling can hide unexpected exceptions on arb-violating vectors

**File:** `backtest/src/deepvault/parity_runner.py:118-125`

**Issue:** The outer try-except catches `(KeyError, ValueError, ZeroDivisionError)` for unexpected exceptions. Inside, it checks `if not v.get("expected", {}).get("params_valid", True): continue`. This silently swallows ANY ValueError on arb-violating vectors — including a ValueError that ISN'T the expected `EZeroVariance` (e.g., an `EZeroForward` or `EZeroStrike`). The inner code at line 113-117 already correctly handles "expected ValueError on arb vectors", so the outer handler's continue path is dead-code-on-success but masks errors on real failures.

**Fix:** Tighten the outer except to only handle the malformed-JSON case:
```python
except (KeyError, IndexError) as exc:
    failures.append(f"{v['id']} ({v['tier']}): malformed vector entry: {exc!r}")
# Let ValueError / ZeroDivisionError propagate — they're handled by the inner blocks.
```

### WR-10: Tier-C JackJacquier fixture's `expected_w` is self-referential to deepvault.svi (no external ground truth)

**File:** `backtest/tests/fixtures/jackjacquier_ssvi_outputs.json:5,15-49`

**Issue:** The fixture's `_metadata.rationale` openly states: "the expected_w values are derived from deepvault.svi.total_variance(svi, k) on these inputs." This means `test_tier_c_jackjacquier_ssvi_cross_check` is testing that the evaluator agrees with itself. There is no externally-verified ground truth. The metadata block correctly documents this as a future-work item, but the test passes "Tier C" coverage today on what is effectively a self-consistency test — not the cross-check the test name implies. The test discovers regressions only if someone changes deepvault.svi WITHOUT also re-running golden_emit; per CONTRIBUTING.md §6 + codegen-drift CI, that path is already blocked. So the test contributes ~zero independent signal.

**Fix:** Either (a) actually execute the JackJacquier notebook against pinned inputs and overwrite expected_w with notebook outputs (the documented future work), or (b) downgrade the test to `@pytest.mark.skip(reason="Tier C placeholder until notebook executed; see fixture _metadata")` so its passing status doesn't falsely contribute to the parity-gate confidence narrative. The current state — passing with self-referential expected values — is misleading.

### WR-11: `arb_checker.ts` silently uses `Number()` on bigint inputs that may exceed `Number.MAX_SAFE_INTEGER`

**File:** `dashboard/src/lib/arb_checker.ts:34-38, 46-49, 57-60, 93`

**Issue:** Each `wFloat` / `wPrimeFloat` / `wDoublePrimeFloat` does `Number(svi.b) / F_NUM`. For SVI bounds, `svi.a <= 4e9`, `svi.b <= 8e9`, `svi.sigma <= 4e9`, `|m| <= 2.5e9`, `|rho| < 1e9` — all well below `Number.MAX_SAFE_INTEGER` (2^53 - 1 ≈ 9e15). However `thetaTAtmInt = svi.a + (svi.b * svi.sigma) / F` at line 83 can be up to `4e9 + 8e9*4e9/1e9 = 4e9 + 32e9 = 36e9`, still safe. Today this is fine. But if SVI bounds in `shared/strategy.toml` are ever loosened beyond `~1e15` (well below the documented u64-equivalent bound of `~1.8e19`), `Number()` will silently lose precision in the visualization grid and the dashboard will show a subtly-wrong g(k) curve. The forbidden-token grep correctly excludes `arb_checker.ts`, so CI won't catch this.

**Fix:** Add a defensive guard at the top of `checkArb`:
```typescript
const SAFE_MAX = BigInt(Number.MAX_SAFE_INTEGER);
if (svi.a > SAFE_MAX || svi.b > SAFE_MAX || svi.sigma > SAFE_MAX) {
  // Above this, Number() conversion loses precision; return invalid sentinel.
  return { paramsValid: false, minGk: -F, calendarPass: true, gK: new Array<bigint>(n).fill(-F) };
}
```

## Info

### IN-01: Move `phi.move` exports `MAX_EXP_INPUT` for `exp` but no exp tests cover the boundary

**File:** `contracts/sources/helpers/phi.move:30, 145-154`; `contracts/tests/phi_test.move:138-143`

**Issue:** `phi_test.move` has `exp_overflow_aborts` testing input `23_638_153_700` (one ABOVE `MAX_EXP_INPUT`). It does NOT test `23_638_153_699` (the max valid input) which proves the boundary doesn't false-abort. This is a soft coverage gap; the Phase 2 vault won't call `exp` with arbitrary user inputs (only via `compute_nd2` which feeds reduced remainders), but symmetrical boundary tests are cheap.

**Fix:** Add `exp_at_max_input_succeeds()` test calling `exp(MAX_EXP_INPUT)` and asserting it returns a finite u64.

### IN-02: `parity_runner.ts` accepts argv without bounds checking

**File:** `dashboard/src/lib/parity_runner.ts:75-83`

**Issue:** `parseInt(args[i + 1], 10)` and `BigInt(args[i + 1])` silently accept malformed input. `parseInt('abc')` returns `NaN`; the slice and filter logic later silently produce 0 vectors, hitting the `vectors.length === 0` failure path with the misleading "no vectors loaded" error. `BigInt('abc')` throws — but that's a SyntaxError, not the "FAIL: no vectors loaded" path.

**Fix:** Validate arg parses:
```typescript
const n = parseInt(args[i + 1], 10);
if (!Number.isFinite(n) || n < 0) {
  console.error(`Invalid --first value: ${args[i + 1]}`);
  process.exit(1);
}
first = n;
```

### IN-03: Generated golden vector identifiers in `B-arb-091..B-arb-100` use 3-digit zero-padded indices but Tier B grid uses 3-digit `B-001..B-090` — mostly consistent, slight smell

**File:** `scripts/golden_emit.py:152, 197`

**Issue:** Tier B grid IDs are `B-{counter:03d}` → `B-001..B-090` (assuming 90 grid samples). Arb-violating IDs are `B-arb-{counter:03d}` → `B-arb-091..B-arb-100`. The arb-violating index continues from the same `counter` rather than restarting at 1. This is a minor cognitive smell — readers see `B-arb-091` and may wonder why it didn't restart at `B-arb-001`. Documented in plans, but a comment in the source would help.

**Fix:** Add a comment at line 197:
```python
# Note: counter continues from grid (so first arb id is B-arb-091); avoids
# ambiguity with grid IDs that share the B- prefix.
```

### IN-04: `arb_checker.py` `_g_of_k_float` returns `-1.0` sentinel for `w <= 0`, but the rounded sentinel at `int(round(-1.0 * F)) = -F` collides with the legitimate "g_k_array element = -F"

**File:** `backtest/src/deepvault/arb_checker.py:115`

**Issue:** When `w <= 0`, `_g_of_k_float` returns `-1.0`. Later `int(round(g * F))` produces `-1_000_000_000` (= `-F`). The degenerate path at line 144 also fills with `-F`. A consumer cannot tell from a single `g_k_array[i] == -F` element whether (a) the float g(k) value happened to be exactly -1.0 (vanishingly unlikely but possible at boundary) or (b) the slice was sentinel-replaced. For the Phase 4 dashboard's "g(k) curve" rendering this is moot, but documenting the convention saves future confusion.

**Fix:** Add a comment noting that `-F` is BOTH a legitimate value and a sentinel; downstream consumers should not interpret a single `-F` element as "definitely a sentinel" — only `min_g_k == -F AND params_valid == False AND all elements == -F` is the unambiguous degenerate-slice signal.

---

_Reviewed: 2026-05-09_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
