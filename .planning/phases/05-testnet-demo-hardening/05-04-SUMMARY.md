---
phase: 05-testnet-demo-hardening
plan: 04
subsystem: infra
tags: [codegen, move, python, typescript, cross-runtime-constants, redemption-cooldown, strategy-toml]

# Dependency graph
requires:
  - phase: 00-setup-ground-rules
    provides: shared/strategy.toml + scripts/codegen.py codegen pipeline (Plan 00-03)
  - phase: 02-vault-move-package-testnet-deploy
    provides: contracts/sources/redeem.move with local const COOLDOWN_MS = 3_600_000 (Plan 02-05)
provides:
  - "[redemption].cooldown_ms = 3_600_000 single source of truth in shared/strategy.toml"
  - "strategy_constants::redemption_cooldown_ms() Move accessor (3_600_000 u64)"
  - "REDEMPTION_COOLDOWN_MS: Final[int] = 3_600_000 in backtest/src/deepvault/strategy_constants.py"
  - "REDEMPTION_COOLDOWN_MS: 3600000n BigInt in dashboard/src/lib/strategy_constants.ts"
  - "redeem.move cooldown gate now reads from codegen-emitted accessor — duplicate-truth risk eliminated"
affects:
  - "05-03 testnet smoke test (imports STRATEGY_CONSTANTS.REDEMPTION_COOLDOWN_MS instead of hardcoding 3_600_000)"
  - "Future mainnet-smoke-test fork (consumes same constant)"
  - "Dashboard withdrawal-queue panels (can render cooldown remaining from the shared constant)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single-source-of-truth cross-runtime constant via codegen (extension of existing Plan 00-03 pattern)"

key-files:
  created: []
  modified:
    - shared/strategy.toml
    - scripts/codegen.py
    - contracts/sources/strategy_constants.move
    - backtest/src/deepvault/strategy_constants.py
    - dashboard/src/lib/strategy_constants.ts
    - contracts/sources/redeem.move

key-decisions:
  - "Schema_version stays at 2 (additive [redemption] section; no breaking change)"
  - "Move accessor uses public fun u64 shape (matches all existing strategy_constants accessors; auditable inline-via-compile-time-const semantics)"
  - "redeem.move calls strategy_constants::redemption_cooldown_ms() inline (matches L126/L151 nav_scale() pattern); no local const, no public(package) gating workaround"
  - "TOML literal 3_600_000 emits as plain digits in Move/Python (3600000) and as 3600000n in TS (BigInt suffix because the value is u64-equivalent on-chain — Pitfall B mitigation)"

patterns-established:
  - "Time-related cooldown extension to [redemption] TOML section (placed between [oracle] and [svi] — groups time-domain concerns)"
  - "redemption.cooldown_ms emits to Move/Python/TS in lockstep alongside existing oracle/SVI/hedge_policy constants"

requirements-completed: [DEPLOY-04]

# Metrics
duration: ~10min
completed: 2026-05-16
---

# Phase 05 Plan 04: Cooldown Codegen Extension Summary

**Extended `shared/strategy.toml` with `[redemption].cooldown_ms = 3_600_000`, regenerated all 3 runtime strategy_constants files with byte-identical numeric value, and refactored `contracts/sources/redeem.move` to read the cooldown from `strategy_constants::redemption_cooldown_ms()` — single source of truth, no duplicate constant.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-05-16T (Phase 5 execution session)
- **Completed:** 2026-05-16
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Single source of truth for the 1-hour redemption cooldown lives in `shared/strategy.toml` — Move on-chain, Python backtest, and TS dashboard all consume the same number.
- `redeem.move` no longer carries a duplicate `const COOLDOWN_MS: u64 = 3_600_000` (T-05-08 mitigation: drift between strategy.toml and on-chain gate is now structurally impossible within a deployed package).
- DEPLOY-04 enabler in place — Plan 05-03's `scripts/testnet-smoke-test.ts` can now `import { STRATEGY_CONSTANTS } from '../dashboard/src/lib/strategy_constants'` and reference `STRATEGY_CONSTANTS.REDEMPTION_COOLDOWN_MS` (BigInt 3600000n) without hardcoding the wait.
- `make codegen` is idempotent: re-running produces byte-identical output (md5 verified across all 3 generated files).
- `python scripts/codegen.py --check` exits 0 — CI codegen-drift gate stays green.
- All 15 redeem-related Move tests still PASS (deepvault::redeem_test ×7 + deepvault::admin_test ×3 pause-doesn't-halt + deepvault::integration_test ×3 + deepvault::property_test ×1 + deepvault::redeem_test::redeem_cancel_after_partial_fulfill_returns_remainder + …) under `sui move test redeem`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend strategy.toml + codegen.py to emit REDEMPTION_COOLDOWN_MS to all 3 runtimes** — `1ce5ce1` (feat)
2. **Task 2: Switch redeem.move to read cooldown from strategy_constants** — `607c614` (refactor)

**Plan metadata:** (pending final commit; see Final Commit section below)

## Files Created/Modified

- `shared/strategy.toml` — new `[redemption]` section between `[oracle]` and `[svi]`; `cooldown_ms = 3_600_000` with comment explaining the cross-runtime source-of-truth role.
- `scripts/codegen.py` — `emit_move`, `emit_python`, `emit_typescript` each hoist `red = data["redemption"]` next to the existing `oracle = data["oracle"]` and append a new "Redemption" block after the Oracle block emitting `redemption_cooldown_ms()` (Move) / `REDEMPTION_COOLDOWN_MS: Final[int]` (Python) / `REDEMPTION_COOLDOWN_MS: <int>n` (TS BigInt).
- `contracts/sources/strategy_constants.move` (regenerated) — adds `public fun redemption_cooldown_ms(): u64 { 3600000 }` between Oracle and SVI sections.
- `backtest/src/deepvault/strategy_constants.py` (regenerated) — adds `REDEMPTION_COOLDOWN_MS: Final[int] = 3600000`.
- `dashboard/src/lib/strategy_constants.ts` (regenerated) — adds `REDEMPTION_COOLDOWN_MS: 3600000n,` inside the `STRATEGY_CONSTANTS` const.
- `contracts/sources/redeem.move` — deleted `// === Constants ===` block + `const COOLDOWN_MS: u64 = 3_600_000;` at L37-40; replaced L120 consumer `slot_ts + COOLDOWN_MS` with `slot_ts + strategy_constants::redemption_cooldown_ms()`. Net: -6 +1 lines.

## Decisions Made

- **Inline accessor call, no local const.** Plan body offered three options for the Move-side refactor; chose the inline `strategy_constants::redemption_cooldown_ms()` call because (a) the `use deepvault::strategy_constants;` import was already in place since Plan 02-05, (b) the very same file at L126/L151 already calls `strategy_constants::nav_scale()` inline, and (c) public-fun u64 accessors over constant literals are auditable and (per Sui Move docs) compile down to the same bytecode as inline consts. Zero new visibility gating needed.
- **Three-way byte-identical numeric value verified.** Move emits `3600000` (u64), Python emits `3600000` (int), TS emits `3600000n` (BigInt — Pitfall B mitigation, matches Move u64 semantics above the JS Number 2^53 ceiling even though this particular value fits in Number). The TOML literal `3_600_000` deserializes via tomllib to Python int `3600000` (underscores stripped); plain `{red['cooldown_ms']}` interpolation produces digit-only output across all 3 emit functions — same as existing `token_bucket.capacity_quote_micro_units` etc.
- **Schema_version stayed at 2.** Pure additive change; the `load_strategy` guard at codegen.py:53 already accepts schema_version=2. No downstream consumer needs to bump.

## Deviations from Plan

None — plan executed exactly as written.

Both tasks completed using the exact options the plan body documented (Task 1 sub-steps 1-4 in order; Task 2 "Option chosen: delete local const, call accessor inline" path). The verification gates in the plan body's `<verify>` blocks all passed without auto-fix.

## Issues Encountered

- **Bash heredoc `$?` capture across stages:** During idempotency verification I initially used `git diff --exit-code` after the second codegen run, which returned non-zero — but that compared the working tree against HEAD (where the plan changes haven't landed yet), not first-codegen-output vs second-codegen-output. Switched to capturing md5 hashes between the two runs and diffing those; result: byte-identical (idempotent). Documented as observational, not a code bug.
- **Sui CLI lint warnings:** `sui move build` emits two pre-existing `non-composable transfer to sender` Lint W99001 warnings (`supply.move:108`, `redeem.move:153`, `redeem.move:208`) and unused-import warnings in `supply_test.move`. None are introduced by this plan — they were present before the refactor. Logged as out-of-scope.

## TDD Gate Compliance

N/A — plan type is `execute`, not `tdd`. No RED/GREEN/REFACTOR cycle expected. The behavior-preserving refactor in Task 2 was validated by re-running the existing 15 redeem tests (which themselves landed in Plan 02-05 with proper TDD discipline).

## Known Stubs

None — no placeholder values or unwired data paths introduced.

## User Setup Required

None — no external service configuration required. This plan is purely internal codegen plumbing.

## Next Phase Readiness

- **Plan 05-03 unblocked:** the testnet smoke test driver can now import the cooldown from `dashboard/src/lib/strategy_constants.ts` (TS BigInt) or `backtest/src/deepvault/strategy_constants.py` (Python int) and pass it to the wait step. No hardcoded `3_600_000` literal needed in the smoke test, per CONTEXT.md D-08.
- **Future mainnet smoke test:** when Plan 05-XX (or post-submission execution) writes `scripts/mainnet-smoke-test.ts`, it forks from the testnet variant and inherits the same constant import — no separate cooldown value to maintain.
- **Dashboard withdrawal-queue panel:** Phase 6 dashboard work can render "cooldown remaining" countdowns against `STRATEGY_CONSTANTS.REDEMPTION_COOLDOWN_MS` instead of duplicating the literal.
- **Move side guarantee:** any future `shared/strategy.toml` change to `cooldown_ms` regenerates the Move module; redeploy is then required to take effect on-chain. CI codegen-drift catches the strategy.toml-vs-generated-files drift independently. T-05-08/T-05-09 both mitigated.

## Self-Check: PASSED

Verified:
- `[ -f shared/strategy.toml ]` → FOUND
- `[ -f scripts/codegen.py ]` → FOUND
- `[ -f contracts/sources/strategy_constants.move ]` → FOUND
- `[ -f backtest/src/deepvault/strategy_constants.py ]` → FOUND
- `[ -f dashboard/src/lib/strategy_constants.ts ]` → FOUND
- `[ -f contracts/sources/redeem.move ]` → FOUND
- `git log --oneline | grep 1ce5ce1` → FOUND (Task 1 commit)
- `git log --oneline | grep 607c614` → FOUND (Task 2 commit)
- `grep '\[redemption\]' shared/strategy.toml` → FOUND
- `grep 'redemption_cooldown_ms' contracts/sources/strategy_constants.move` → FOUND
- `grep 'REDEMPTION_COOLDOWN_MS' backtest/src/deepvault/strategy_constants.py` → FOUND
- `grep 'REDEMPTION_COOLDOWN_MS' dashboard/src/lib/strategy_constants.ts` → FOUND
- `grep 'strategy_constants::redemption_cooldown_ms()' contracts/sources/redeem.move` → FOUND
- `grep 'const COOLDOWN_MS' contracts/sources/redeem.move` → NOT FOUND (correctly absent)
- `sui move build` → exit 0
- `sui move test redeem` → 15/15 PASS
- `python scripts/codegen.py --check` → exit 0

---

*Phase: 05-testnet-demo-hardening*
*Plan: 04*
*Completed: 2026-05-16*
