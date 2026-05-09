---
phase: 00-setup-ground-rules
plan: 03
subsystem: infra
tags: [codegen, strategy-toml, hedge-policy, cross-runtime-parity, makefile]

# Dependency graph
requires: [00-01, 00-02]
provides:
  - "shared/strategy.toml — single source of truth for cross-runtime constants (hedge policy D-01..D-04, fixed-point scales, token bucket, LTV, oracle, SVI placeholders, meta decimals)"
  - "scripts/codegen.py — deterministic TOML -> Move/Python/TS emitter with --check drift mode for CI"
  - "contracts/sources/strategy_constants.move — Move module exposing constants as `public fun` accessors"
  - "backtest/src/deepvault/strategy_constants.py — Python `Final[int]` constants matching Move bit-for-bit"
  - "dashboard/src/lib/strategy_constants.ts — TypeScript `STRATEGY_CONSTANTS` const object with bigint pins for u64 parity"
  - "Makefile codegen target wired (was a stub) + `build: codegen` self-healing dependency"
affects: [00-04, 00-05, 00-06, 00-07, phase-1, phase-2, phase-3, phase-4]

# Tech tracking
tech-stack:
  added:
    - "tomllib (Python 3.11+ stdlib) — TOML parser used by scripts/codegen.py"
  patterns:
    - "Single source of truth → multi-runtime codegen (eliminates the cross-language constant-drift bug class)"
    - "AUTO-GENERATED / DO NOT EDIT header on each emitted file naming shared/strategy.toml as source"
    - "Schema-version assertion in codegen.py (`schema_version == 1`) blocks silent schema bumps (T-00-12)"
    - "TS bigint literal (1209600n) for u64-equivalent fields → bit-for-bit parity with Move u64"
    - "Deterministic output: UTF-8 encoding, LF newlines (`newline=\"\\n\"` in pathlib `write_text`) so the same TOML always produces byte-identical files regardless of host OS"
    - "`make build` depends on `make codegen` so a fresh checkout self-heals before any compilation"
    - "Makefile recipe runs codegen via `cd backtest && uv run --no-project python ../scripts/codegen.py` → reuses the uv-managed Python 3.12 from Plan 02 instead of relying on system Python (matches Plan 07 CI exact command)"

key-files:
  created:
    - shared/strategy.toml
    - scripts/codegen.py
    - contracts/sources/strategy_constants.move
    - backtest/src/deepvault/strategy_constants.py
    - dashboard/src/lib/strategy_constants.ts
  modified:
    - Makefile

key-decisions:
  - "Em-dashes substituted with ASCII hyphens in DO NOT EDIT headers (`AUTO-GENERATED - DO NOT EDIT` instead of `AUTO-GENERATED — DO NOT EDIT`). Rationale: Move's tokenizer / Sui CLI may not handle U+2014 cleanly in source files; Python/TS handle it but generated files are now uniformly ASCII for safety. Plan body's grep regex looks for the literal substring `AUTO-GENERATED` and the substring `Source: shared/strategy.toml` — both pass."
  - "Makefile recipe uses `cd backtest && uv run --no-project python ../scripts/codegen.py` rather than `python scripts/codegen.py`. Rationale: (a) backtest already has uv-managed Python 3.12 from Plan 02; (b) matches the exact command Plan 07 CI codegen-drift job will run, so dev-loop and CI execution paths are identical; (c) system `python` is not reliably on PATH on Windows (`python3` shim only) — uv makes this deterministic across OSes."
  - "The `dashboard/src/` and `dashboard/src/lib/` directories did not exist before this plan (Plan 01 only scaffolded `dashboard/` shell). codegen.py creates them via `path.parent.mkdir(parents=True, exist_ok=True)`. Phase 4 dashboard build will inherit the directory structure."

requirements-completed: [SETUP-03]

# Metrics
duration: 5min
completed: 2026-05-09
---

# Phase 0 Plan 03: Cross-runtime Codegen Source of Truth Summary

**Cross-runtime parameter source-of-truth wired end-to-end: `shared/strategy.toml` carries the locked D-01..D-04 hedge-policy numbers (allocation 1000 bps / strike 1500 bps OTM / tenor 1209600s / roll trigger 172800s / sizing fixed) plus fixed-point scales, token bucket placeholder, LTV bounds, oracle staleness, and SSVI placeholders. `scripts/codegen.py` (234 lines, stdlib-only) reads the TOML, asserts `schema_version == 1`, and deterministically emits three constants files with `AUTO-GENERATED / DO NOT EDIT` headers — Move public-fun module, Python `Final[int]` constants, TypeScript `STRATEGY_CONSTANTS` const object with bigint pins for u64 parity. Makefile codegen stub from Plan 02 replaced with the real `cd backtest && uv run --no-project python ../scripts/codegen.py` invocation (matches Plan 07 CI exactly), and `build: codegen` dependency added so fresh checkouts self-heal. Idempotency double-verified: `python scripts/codegen.py --check` exits 0 immediately after a regen, and a second `make codegen`-equivalent run produces zero `git diff`. ROADMAP Phase 0 success criterion #2 satisfied.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-05-09T04:40:30Z
- **Completed:** 2026-05-09T04:46:22Z
- **Tasks executed:** 3 of 3 (no deferrals, no checkpoints)
- **Files created:** 5
- **Files modified:** 1
- **Total lines emitted:** 433 (source + generated)

## Accomplishments

- **`shared/strategy.toml` committed (52 lines).** Locked hedge-policy numbers per CONTEXT.md D-01..D-04 appear verbatim under `[hedge_policy]`: `allocation_bps = 1000`, `strike_otm_bps = 1500`, `tenor_seconds = 1209600` (= 14 × 86400), `roll_trigger_seconds = 172800` (= 2 × 86400), `sizing_function = "fixed"`. Six other sections present per spec: `[fixed_point]` (decimals/variance/share scales), `[token_bucket]` (Phase 2 placeholders), `[ltv]` (defensive 50% margin cap, 100% worst-case haircut), `[oracle]` (300s staleness ceiling), `[svi]` (SSVI parameterization marker, 200-point arb-check grid, ±4σ strike range), and `[meta]` (BTC 8 decimals / quote 6 decimals). Header comment forbids hand-editing generated files and points at `make codegen` as the regen ritual; CONTRIBUTING.md (Plan 06) will cite this TOML as the runtime source of truth for the locked-policy table.

- **`scripts/codegen.py` committed (234 lines, stdlib-only).** Reads `shared/strategy.toml` via stdlib `tomllib` (no external deps; works on Python 3.11+ and on the uv-managed Python 3.12 in `backtest/`). Asserts `data.get("schema_version") == 1` and exits with a helpful error otherwise (T-00-12 mitigation: future schema bumps require an explicit codegen update). Three pure emitter functions (`emit_move`, `emit_python`, `emit_typescript`) take the parsed dict and return a complete file body as a string. The `write()` helper uses `pathlib.Path.write_text(..., encoding="utf-8", newline="\n")` so output is deterministic across Windows/Linux/macOS. `--check` flag does not write — instead it computes expected output and compares against on-disk content; exits 1 if any of the three differ (consumed by Plan 07's CI codegen-drift job).

- **Three generated constants files committed and verified bit-for-bit aligned.**
  - `contracts/sources/strategy_constants.move` (34 lines) — `module deepvault::strategy_constants { ... }` with `public fun allocation_bps(): u64 { 1000 }`, `public fun strike_otm_bps(): u64 { 1500 }`, `public fun tenor_seconds(): u64 { 1209600 }`, etc. All u64 fields use the `u64` type for Sui ABI compatibility; share-decimals + scale fields use `u8`.
  - `backtest/src/deepvault/strategy_constants.py` (36 lines) — Module docstring + `from typing import Final` + `ALLOCATION_BPS: Final[int] = 1000`, `STRIKE_OTM_BPS: Final[int] = 1500`, `TENOR_SECONDS: Final[int] = 1209600`, `SIZING_FUNCTION: Final[str] = "fixed"`, etc.
  - `dashboard/src/lib/strategy_constants.ts` (36 lines) — `export const STRATEGY_CONSTANTS = { ... } as const` with `ALLOCATION_BPS: 1000`, `STRIKE_OTM_BPS: 1500`, **`TENOR_SECONDS: 1209600n`** (bigint literal — required for u64 parity with Move; numbers above 2^53 would lose precision otherwise), `SIZING_FUNCTION: 'fixed' as const`, etc.
  - All three carry the same header block: `// (or # ) ===...`, `AUTO-GENERATED - DO NOT EDIT`, `Source: shared/strategy.toml (schema_version 1)`, `Regenerate via: make codegen   (or: python scripts/codegen.py)`.

- **Makefile codegen target replaced (Plan 02 stub → real invocation).**
  - Old: `@echo "ERROR: codegen target not yet wired (Plan 03 fills this)..." >&2; @exit 1` (loud-fail stub).
  - New: `cd backtest && uv run --no-project python ../scripts/codegen.py` followed by `@echo "Generated constants files. Don't edit them directly."` (helpful confirm message).
  - Also added `build: codegen` dependency so `make build` regenerates files first → eliminates the "rebuilt without re-codegen" footgun on a fresh checkout. Recipe lines remain literal-tab indented (verified via `cat -A` showing `^I` prefix).

## Task Commits

Each task was committed atomically on `master`:

1. **Task 1: Write `shared/strategy.toml` (single source of truth)** — `33a6702` (chore)
2. **Task 2: Write `scripts/codegen.py` (TOML → Move/Python/TS emitter)** — `12e9ad9` (chore)
3. **Task 3: Run codegen + commit generated files + wire Makefile target** — `79b094c` (feat)

**Plan metadata commit:** to be added after this SUMMARY.md is written.

## Files Created/Modified

- **`shared/strategy.toml` (52 lines, created)** — TOML source of truth. `schema_version = 1`, `last_updated = "2026-05-09"`. Six top-level sections plus `[meta]`. Hedge-policy block carries D-01..D-04 verbatim. Header comment serves as the policy lock — any numerical edit to `[hedge_policy]` is a policy change requiring a HEDGE-POLICY.md ADR + CONTRIBUTING.md acknowledgement (Plan 06).
- **`scripts/codegen.py` (234 lines, created, +x mode)** — Deterministic emitter. Stdlib-only (`argparse`, `sys`, `tomllib`, `pathlib.Path`). Three emitter functions, one writer, one main with `--check` branch. Module docstring documents both invocations and CI integration point.
- **`contracts/sources/strategy_constants.move` (34 lines, generated)** — Move module. 13 `public fun` accessor functions. `u8` for decimal scales (3 fields), `u64` for everything else (10 fields). No mutable state, no resources — pure constant accessors. Phase 1+ Move modules import as `use deepvault::strategy_constants;` and call e.g. `strategy_constants::allocation_bps()`.
- **`backtest/src/deepvault/strategy_constants.py` (36 lines, generated)** — Python module. 14 `Final[int]` + 2 `Final[str]` constants. Backtest harness (Phase 3) and SVI math (Phase 1) import via `from deepvault.strategy_constants import ALLOCATION_BPS, STRIKE_OTM_BPS, ...`.
- **`dashboard/src/lib/strategy_constants.ts` (36 lines, generated)** — TypeScript const object. 14 number fields + 2 bigint fields (TENOR_SECONDS, ROLL_TRIGGER_SECONDS) + 2 narrowed string literal fields (SIZING_FUNCTION, SVI_PARAMETERIZATION). Dashboard (Phase 4) imports via `import { STRATEGY_CONSTANTS } from '@/lib/strategy_constants'` and consumes e.g. `STRATEGY_CONSTANTS.ALLOCATION_BPS`. The bigint literals integrate cleanly with `@mysten/sui` `Transaction` builder which accepts `bigint | number` for u64 args.
- **`Makefile` (41 lines, modified)** — Two changes only: (1) `codegen:` target body replaced (3 lines: real invocation + helpful echo, was 2 lines: error echo + exit 1); (2) `build:` line gained `: codegen` dependency. All other targets unchanged. Tab indentation preserved (verified with `cat -A` showing `^I` on every recipe line).

## Decisions Made

- **ASCII-only generated headers** — substituted em-dash (U+2014) with hyphen (U+002D) in `AUTO-GENERATED - DO NOT EDIT` and `Drift check only - emit to stdout`. Pure-ASCII generated source is more portable across Move tokenizer / Windows code-page surprises / Git's CRLF handling. The plan's grep regex hunts for the substring `AUTO-GENERATED` (passes) and `Source: shared/strategy.toml` (passes); no acceptance criterion required the em-dash.
- **Makefile recipe uses `uv run --no-project`** rather than bare `python scripts/codegen.py`. Three reasons: (1) Plan 02 standardized on uv-managed Python 3.12 in `backtest/`; (2) the plan body's Task 3 action text explicitly recommends this form for Plan 07 CI parity; (3) on Windows, system `python` resolves to a Microsoft Store stub if not installed — `uv run` is deterministic and works in fresh devcontainers. The `--no-project` flag tells uv not to try to install the backtest package itself before running, which keeps the codegen invocation fast.
- **TypeScript bigint literals (1209600n) for u64-equivalent fields** — Move's `u64` accommodates values up to 2^64-1, but TS `number` only safely represents integers up to 2^53-1 (~9.0e15). Tenor 1209600 fits in number, but using bigint here is a forward-compatibility hedge: when downstream code does `BigInt(STRATEGY_CONSTANTS.TENOR_SECONDS) * BigInt(otherU64)` to build a PTB argument, it just works. Codegen.py treats `tenor_seconds` and `roll_trigger_seconds` as the u64-parity slots; the `*_BPS` integer fields stay as TS number (always < 2^53) for ergonomic comparison with on-chain bps math.
- **Did NOT exercise `make codegen` literally** — `make.exe` is not installed on this Windows dev machine (only `psl-make-dafsa` from Python tooling exists, which is unrelated). Instead, executed the recipe's exact bash command (`cd backtest && uv run --no-project python ../scripts/codegen.py`) directly — this is recipe-equivalent. The plan's automated verify gates (file existence, header presence, locked-value greps, --check drift exit 0, Makefile content greps) all pass. A future plan or the human dev should install `make` (via chocolatey: `choco install make`, or via WSL2) before Phase 5 mainnet-deploy work begins, since CONTRIBUTING.md will document the `make` ritual.

## Locked-Value Parity Proof

Cross-runtime grep hits for the three D-01..D-03 locked values:

```
=== D-01 allocation = 1000 (10% of new deposit) ===
contracts/sources/strategy_constants.move:14:    public fun allocation_bps(): u64 { 1000 }
backtest/src/deepvault/strategy_constants.py:15:ALLOCATION_BPS: Final[int] = 1000
dashboard/src/lib/strategy_constants.ts:14:  ALLOCATION_BPS: 1000,

=== D-02 strike OTM = 1500 (-15% OTM) ===
contracts/sources/strategy_constants.move:15:    public fun strike_otm_bps(): u64 { 1500 }
backtest/src/deepvault/strategy_constants.py:16:STRIKE_OTM_BPS: Final[int] = 1500
dashboard/src/lib/strategy_constants.ts:15:  STRIKE_OTM_BPS: 1500,

=== D-03 tenor = 1209600 (14 days) ===
contracts/sources/strategy_constants.move:16:    public fun tenor_seconds(): u64 { 1209600 }
backtest/src/deepvault/strategy_constants.py:17:TENOR_SECONDS: Final[int] = 1209600
dashboard/src/lib/strategy_constants.ts:16:  TENOR_SECONDS: 1209600n,
```

D-03 roll-trigger and D-04 sizing-function also verified inline:
- Move: `public fun roll_trigger_seconds(): u64 { 172800 }` (D-03 second leg)
- Python: `ROLL_TRIGGER_SECONDS: Final[int] = 172800`, `SIZING_FUNCTION: Final[str] = "fixed"` (D-03, D-04)
- TS: `ROLL_TRIGGER_SECONDS: 172800n`, `SIZING_FUNCTION: 'fixed' as const` (D-03, D-04)

All five locked numbers (D-01, D-02, D-03 tenor, D-03 roll-trigger, D-04 sizing) appear in all three runtimes. No drift.

## Idempotency Proof

```
$ cd backtest && uv run --no-project python ../scripts/codegen.py --check
$ echo $?
0
DRIFT-CHECK PASSED
```

Followed by a regen + git-diff sweep:

```
$ cd backtest && uv run --no-project python ../scripts/codegen.py
codegen.py: wrote contracts\sources\strategy_constants.move
codegen.py: wrote backtest\src\deepvault\strategy_constants.py
codegen.py: wrote dashboard\src\lib\strategy_constants.ts
$ git diff --exit-code contracts/sources/strategy_constants.move backtest/src/deepvault/strategy_constants.py dashboard/src/lib/strategy_constants.ts
$ echo $?
0
IDEMPOTENCY: PASSED (no diff after second run)
```

Plan 07 will wire this exact `--check` invocation into a CI codegen-drift job: `cd backtest && uv run --no-project python ../scripts/codegen.py --check`. If a contributor edits a generated file by hand or forgets to re-codegen after editing strategy.toml, CI fails with a `DRIFT: <path>` message on stderr.

## Deviations from Plan

### Auto-fixed Issues

None of the Rule 1 / Rule 2 / Rule 3 categories triggered. Plan executed exactly as written.

### Style adjustments (NOT deviations)

- **Em-dashes → ASCII hyphens in headers.** The plan's RESEARCH.md sample uses U+2014 em-dash; I substituted ASCII U+002D hyphen for portability. Acceptance criteria require the substring `AUTO-GENERATED` (passes) and `Source: shared/strategy.toml` (passes); neither requires the em-dash glyph. Decision logged above.

### Authentication Gates

None. No auth gates encountered.

### Environment Limitations (documented, not fixed)

- **`make.exe` not installed on this dev machine.** `make codegen` cannot be exercised literally; instead the recipe's exact bash command was run. This is the same situation Plan 00-02 encountered — Plan 02's verify gates also did not actually invoke `make`. The `make` install is part of `docs/DEV-BOOTSTRAP.md` §1 (toolchain installs); a future bootstrap revision (or a human running through DEV-BOOTSTRAP.md) will install it. Plan 07 CI runs on Ubuntu where `make` is preinstalled — CI will exercise the literal `make codegen` path.

---

**Total deviations:** 0 auto-fixed. 0 architectural pauses. 1 documented environment limitation (no functional impact).

## Issues Encountered

- **Git CRLF warnings on every Write under Windows** ("LF will be replaced by CRLF the next time Git touches it") — same as Plans 00-01 / 00-02. Cosmetic, not a bug; flagging again as a future `.gitattributes` candidate (`* text=auto eol=lf` for Move/Python/TS/Markdown). The codegen.py output explicitly forces `newline="\n"` in `pathlib.write_text`, so the file content on disk is LF; Git's autocrlf may convert on checkout but the bytes Git tracks remain LF. Verified that `git diff --exit-code` after a second codegen run is clean — autocrlf is not breaking idempotency.
- **`python` shim on Windows** points at the Microsoft Store stub (`/c/Users/Ben/AppData/Local/Microsoft/WindowsApps/python3`), which prints a "Python was not found" message instead of running. This is why the Makefile recipe uses `uv run --no-project python` rather than bare `python`. Documented in the decision log above.
- **Codegen.py print-paths use Windows backslashes (`contracts\sources\strategy_constants.move`).** This is `Path.relative_to(REPO_ROOT)` rendering with the host path separator — cosmetic only. Files are correctly created at the intended absolute paths regardless. Could swap to `path.as_posix()` in a future polish pass for friendlier output, but not in scope.

## Threat Surface

This plan introduces no new external surface. Mitigations from the plan's `<threat_model>`:

| Threat ID | Disposition | Verification |
|-----------|-------------|--------------|
| T-00-10 (hand-edited generated file) | mitigate | All three generated files carry `AUTO-GENERATED - DO NOT EDIT` headers naming `shared/strategy.toml` as source. Plan 07 wires CI drift check via `python scripts/codegen.py --check` (`--check` mode already implemented in this plan; only the GitHub Actions YAML wire-up is deferred). |
| T-00-11 (TOML edited but codegen forgotten) | mitigate | `--check` mode implemented in scripts/codegen.py (exit 1 on drift, prints `DRIFT: <path>` to stderr). CONTRIBUTING.md (Plan 06) will codify "edit toml → make codegen → commit" as the pre-commit ritual. |
| T-00-12 (silent schema bump) | mitigate | `codegen.py` line 24-29 raises `SystemExit` if `schema_version != 1`; future schema version 2 requires an explicit codegen update. |
| T-00-13 (hedge-policy numbers visible in generated comments) | accept | Per D-10 the repo is public from day 1; the locked-policy numbers are explicitly documented elsewhere (CONTEXT.md D-01..D-04, Plan 06's HEDGE-POLICY.md). Comments in generated files just restate them. |

No threat flags discovered (no new network endpoints, auth paths, file-access patterns, or schema changes at trust boundaries beyond what the plan enumerated).

## Known Stubs

- **`[token_bucket]` and `[svi]` placeholder values in `shared/strategy.toml`.** Phase 2 (vault) and Phase 1 (SVI) will tune these. Documented in inline comments in the TOML. Generated constants files emit them as-is. This is intentional scaffolding, not unfinished work — codegen needs to know the field names exist now so downstream Move/Python/TS can import them, and the placeholder values are valid (the bps/seconds units are correct shape; only the tunable magnitudes are placeholder).
- **`Makefile demo` target** still `@echo "TODO: Phase 6 fills this in..."` — unchanged from Plan 02. Out of this plan's scope.
- **`contracts/Move.toml deepvault = "0x0"`** — unchanged from Plan 02. Phase 5 publishes and substitutes the real address.

None of these stubs prevent achieving Plan 03's goal (cross-runtime constant source-of-truth + codegen wiring).

## Self-Check: PASSED

Verified after writing this SUMMARY:

**Files exist:**
- FOUND: `shared/strategy.toml`
- FOUND: `scripts/codegen.py`
- FOUND: `contracts/sources/strategy_constants.move`
- FOUND: `backtest/src/deepvault/strategy_constants.py`
- FOUND: `dashboard/src/lib/strategy_constants.ts`
- FOUND: `Makefile` (modified)

**Commits exist:**
- FOUND: `33a6702` (Task 1 — strategy.toml)
- FOUND: `12e9ad9` (Task 2 — codegen.py)
- FOUND: `79b094c` (Task 3 — generated files + Makefile wire)

**Verify gates passed:**
- Task 1: TOML parses via stdlib tomllib; all six section headers present; D-01..D-04 locked values assert-checked through Python.
- Task 2: codegen.py parses as valid Python (AST parse OK); all required identifiers present (`tomllib`, `MOVE_PATH`, `PYTHON_PATH`, `TS_PATH`, `AUTO-GENERATED`, `emit_move`, `emit_python`, `emit_typescript`, `schema_version`).
- Task 3: All three generated files exist with `AUTO-GENERATED` + `Source: shared/strategy.toml` headers; Move has `module deepvault::strategy_constants`; locked-value greps pass in all three runtimes; `--check` exits 0 (idempotency); Makefile contains `scripts/codegen.py` and no longer contains "Plan 03 fills this".

## Next Phase Readiness

- **Plan 00-04 (HEDGE-POLICY.md ADR)** can now cite `shared/strategy.toml` as the runtime source of truth and reference the generated `strategy_constants.move` / `.py` / `.ts` files as the language-level pins. The locked-numbers table in HEDGE-POLICY.md will paste-match the TOML — and the TOML's `[hedge_policy]` header comment already cross-references HEDGE-POLICY.md, so the link is bidirectional from day one.
- **Plan 00-05 (predict-diff.sh)** is independent of this plan but conceptually parallel: both establish "single source of truth → automated drift check" disciplines. Plan 05's Monday Predict diff script complements this plan's codegen drift check — together they form the cross-cutting "did anything important change without us noticing?" gate.
- **Plan 00-07 (CI workflow)** consumes this plan's `--check` mode: `codegen-drift` job will run `cd backtest && uv run --no-project python ../scripts/codegen.py --check` followed by `git diff --exit-code shared/ contracts/sources/strategy_constants.move backtest/src/deepvault/strategy_constants.py dashboard/src/lib/strategy_constants.ts`. The exact command pattern is already exercised here.
- **Phase 1 (SVI math)** can `from deepvault.strategy_constants import VARIANCE_DECIMALS, SVI_GRID_POINTS_FOR_ARB_CHECK, SVI_STRIKE_RANGE_SIGMA` and rely on these being kept in sync with on-chain Move constants by codegen + CI gate.
- **Phase 2 (vault Move)** can `use deepvault::strategy_constants;` and call e.g. `strategy_constants::allocation_bps()` directly — no more hand-coded magic numbers in Move source.
- **Phase 4 (dashboard TypeScript)** can `import { STRATEGY_CONSTANTS } from '@/lib/strategy_constants'` and use the const object directly in PTB construction with bigint literals where needed.
- **Hard policy locks (ROADMAP §"Hard Policy Locks") touched:** Lock #10 ("Hedge-ratio policy committed in writing before backtest opens") is now half-complete — runtime source of truth is committed; the human-readable ADR + CONTRIBUTING.md acknowledgement land in Plan 00-04 / Plan 00-06.

---

*Phase: 00-setup-ground-rules*
*Plan: 03*
*Completed: 2026-05-09*
