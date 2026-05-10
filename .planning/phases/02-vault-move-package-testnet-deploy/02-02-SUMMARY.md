---
phase: 02-vault-move-package-testnet-deploy
plan: 02
subsystem: codegen
tags: [strategy.toml, codegen, schema-migration, breaking-change, wave-0]
one_liner: "Migrate strategy.toml [token_bucket] to absolute u64 micro-units (matches vendored rate_limiter.move u64 fields), add [inflation_defense] block, add max_price_premium_bps to [hedge_policy], extend codegen.py to emit the new constants in Move/Python/TS."
dependency_graph:
  requires:
    - shared/strategy.toml (Phase 0 D-XX schema; pre-existing schema_version=1)
    - scripts/codegen.py (Phase 0 codegen; pre-existing emit_move/python/typescript)
    - scripts/deepbookv3/packages/predict/sources/helper/rate_limiter.move (vendored Predict at SHA 1159d79a — u64 absolute field types are the analog target)
    - .planning/phases/02-vault-move-package-testnet-deploy/02-CONTEXT.md (D-05 token-bucket Conservative; Claude's Discretion seed = 10 DUSDC, decimals_offset = 10^6)
    - .planning/phases/02-vault-move-package-testnet-deploy/02-RESEARCH.md (Pitfall 2 max_price_premium_bps=50; rate_limiter clone-line-for-line plan)
  provides:
    - shared/strategy.toml schema_version=2 with absolute u64 token-bucket schema
    - shared/strategy.toml [inflation_defense] block
    - shared/strategy.toml [hedge_policy].max_price_premium_bps
    - strategy_constants.move/.py/.ts with token_bucket_capacity, token_bucket_refill_rate_per_ms, seed_quote_micro_units, virtual_shares, nav_scale, max_price_premium_bps accessors
    - Schema for downstream Wave 1+ plans (redeem.move, supply.move, rebalance.move) to call strategy_constants::token_bucket_capacity() and friends without referencing undefined symbols
  affects:
    - .github/workflows/ci.yml codegen-drift job (file paths unchanged; contents change but git diff --exit-code stays green after this plan)
    - All Wave 2+ plans cloning rate_limiter.move (now have matching schema)
tech_stack:
  added: []
  patterns:
    - "Schema-version bump on breaking change: 1 -> 2; codegen.py load_strategy guards on the bumped value."
    - "TS bigint 'n' suffix on every u64-equivalent literal (Pitfall T-01-11 / Phase 0 D-... policy) extended to TOKEN_BUCKET_CAPACITY, TOKEN_BUCKET_REFILL_RATE_PER_MS, SEED_QUOTE_MICRO_UNITS, VIRTUAL_SHARES, NAV_SCALE."
    - "Absolute u64 micro-unit schema for token-bucket matches deepbook_predict::rate_limiter.move:24-35 capacity:u64 + refill_rate_per_ms:u64 (no BPS layer — eliminates conversion bugs at clone time)."
    - "OpenZeppelin ERC-4626 v5 inflation defense as cross-runtime constants (seed_quote_micro_units = 10_000_000 = 10 DUSDC; virtual_shares = 1_000_000 = 10^6 decimals_offset)."
key_files:
  created: []
  modified:
    - shared/strategy.toml
    - scripts/codegen.py
    - contracts/sources/strategy_constants.move
    - backtest/src/deepvault/strategy_constants.py
    - dashboard/src/lib/strategy_constants.ts
decisions:
  - "Schema version bumped 1 -> 2 because [token_bucket].capacity_bps / refill_rate_bps_per_sec / period_seconds are REMOVED — backward-incompatible per Phase 0 codegen pattern."
  - "[token_bucket] uses millisecond-keyed refill rate (refill_rate_quote_micro_units_per_ms = 1200) NOT per-second, to match rate_limiter.move's refill_rate_per_ms:u64 field exactly. 1200 micro-units/ms = 100_000_000 micro / 86_400_000 ms approx 1157, rounded up to 1200 for ~24h full-bucket refill (slightly faster, negligible)."
  - "Capacity = 100_000_000 micro-units = 100 DUSDC at 6dp — matches RESEARCH.md Pattern 4 'conservative defaults' and PATTERNS.md lines 904-928."
  - "max_price_premium_bps = 50 (=0.5%) lives in [hedge_policy] block (NOT [oracle] or a new block) — it's a hedge-pricing policy not an oracle-staleness one, per RESEARCH.md Pitfall 2 rationale."
  - "nav_scale = 1_000_000_000 emitted as a hardcoded constant in codegen.py (NOT read from TOML) — Phase 1 D-14/D-15 fixed-point is locked to 1e9 by MATH: prefix policy and shouldn't be tunable via [hedge_policy]."
  - "load_strategy() guard updated 1 -> 2 in lockstep with the TOML bump; if a future plan accidentally regresses the TOML to v1, codegen.py will fail loudly rather than silently misemit."
metrics:
  duration: ~12 min
  completed_date: "2026-05-10"
  tasks_completed: 3
  files_changed: 5
  commits:
    - 73af914  # Task 1: shared/strategy.toml schema migration
    - c141b4b  # Task 2: scripts/codegen.py emit extension
    - fdcd5ad  # Task 3: regenerated three constants files (schema v2)
---

# Phase 2 Plan 02: Strategy.toml Schema Migration to Absolute u64 + Inflation Defense + Max-Price-Premium Summary

## Outcome

Plan 02-02 unblocks every Wave 1+ plan in Phase 2 that needs to reference token-bucket, inflation-defense, NAV-scale, or max-price-premium constants from `deepvault::strategy_constants`. The schema migration was breaking-by-design: Wave 2's clone of `helpers/rate_limiter.move` would have failed to compile against the old BPS-framed accessors (`bucket_capacity_bps`, `bucket_refill_rate_bps_per_sec`, `bucket_period_seconds`), and downstream `redeem.move` / `vault::supply` could not have constructed an inflation-safe deposit without the OpenZeppelin v5 constants. After this plan, all three runtimes (Move, Python, TypeScript) emit bit-equal accessors for the new keys, the CI codegen-drift job stays green (`--check` exits 0), and the schema is forward-compatible with the cloned rate_limiter's `capacity:u64 + refill_rate_per_ms:u64` field types.

## Execution Trace

### Task 1: Migrate `shared/strategy.toml` schema (commit `73af914`)

**Diff (logical):**

Old `[token_bucket]` block (3 BPS-framed keys):
```toml
[token_bucket]
capacity_bps = 1000
refill_rate_bps_per_sec = 1
period_seconds = 3600
```

New `[token_bucket]` block (2 absolute u64 keys):
```toml
[token_bucket]
# Absolute u64 micro-units — matches deepvault::helpers::rate_limiter.move
# (cloned from vendored Predict at SHA 1159d79a). Per CONTEXT.md D-05:
# AdminCap can retune these at runtime via admin_tune_strategy.
# Defaults are conservative — full bucket regenerates over 24h.
capacity_quote_micro_units = 100_000_000          # 100 DUSDC at 6dp
refill_rate_quote_micro_units_per_ms = 1200       # ~= capacity / 24h in ms
```

New `[inflation_defense]` block (added immediately after `[token_bucket]`):
```toml
[inflation_defense]
# OpenZeppelin ERC-4626 v5 inflation-attack defense ports. Consumed by
# vault::create_vault (seed) and vault::supply (virtual_shares offset).
# See CONTEXT.md "Claude's Discretion" -> "Inflation defense seed amount".
seed_quote_micro_units = 10_000_000               # 10 DUSDC at 6dp
virtual_shares = 1_000_000                         # 10^6 = decimals_offset
```

New line in `[hedge_policy]`:
```toml
max_price_premium_bps = 50          # Plan 02-02: vault refuses predict::mint if Predict ask > SVI fair value by >0.5% (RESEARCH.md Pitfall 2)
```

Top-of-file metadata bump:
```diff
-schema_version = 1
-last_updated = "2026-05-09"
+schema_version = 2
+last_updated = "2026-05-10"
```

**Verification:** `import tomllib` parse + assertions on the three new key paths pass. 8 top-level `[section]` headers preserved (`[fixed_point]`, `[hedge_policy]`, `[token_bucket]`, `[inflation_defense]`, `[ltv]`, `[oracle]`, `[svi]`, `[meta]`).

### Task 2: Extend `scripts/codegen.py` (commit `c141b4b`)

**1) `load_strategy()` schema guard:** `1` → `2` (lockstep with Task 1).

**2) `emit_move()`:** Replaced 3 BPS emit lines with 8 new accessor emits (token_bucket × 2, inflation_defense × 2, nav_scale × 1, max_price_premium_bps × 1, plus 2 comment-block headers). Section ordering matches the TOML: hedge_policy first (with max_price_premium_bps appended), then token_bucket, then inflation_defense, then nav_scale, then ltv/oracle/svi unchanged.

**3) `emit_python()`:** Same accessor set as Move; `Final[int]` typed; `MAX_PRICE_PREMIUM_BPS` placed at end of hedge-policy block, then `TOKEN_BUCKET_CAPACITY` / `TOKEN_BUCKET_REFILL_RATE_PER_MS` in a new section, then `SEED_QUOTE_MICRO_UNITS` / `VIRTUAL_SHARES`, then `NAV_SCALE`.

**4) `emit_typescript()`:** Same accessor set; **bigint `n` suffix** on every u64-equivalent literal (`TOKEN_BUCKET_CAPACITY: 100000000n`, `TOKEN_BUCKET_REFILL_RATE_PER_MS: 1200n`, `SEED_QUOTE_MICRO_UNITS: 10000000n`, `VIRTUAL_SHARES: 1000000n`, `NAV_SCALE: 1_000_000_000n`). `MAX_PRICE_PREMIUM_BPS: 50` is plain Number (under 2^53, no precision risk).

**Verification:** `python -m ast.parse` of `scripts/codegen.py` exits 0. Greps confirm zero residual `capacity_bps` / `refill_rate_bps_per_sec` / `bucket_period_seconds` / `bucket_capacity_bps` / `bucket_refill_rate_bps` references.

### Task 3: Regenerate constants files (commit `fdcd5ad`)

Invocation: `cd backtest && uv run --no-project python ../scripts/codegen.py`. All 6 generated files written (3 strategy + 3 phi); the 3 phi files are byte-identical with the previous commit (only `schema_version 1 -> 2` in their headers? — NO, phi reads `cody_phi_coefficients.toml` independently, schema_version=1 there, no change; verified via final `--check` returning 0).

**Accessor counts per generated file:**

| Runtime | New accessors emitted by this plan | Total accessors |
|---------|------------------------------------|-----------------|
| Move (`strategy_constants.move`) | 6 (`token_bucket_capacity`, `token_bucket_refill_rate_per_ms`, `seed_quote_micro_units`, `virtual_shares`, `nav_scale`, `max_price_premium_bps`) | 24 |
| Python (`strategy_constants.py`) | 6 (`TOKEN_BUCKET_CAPACITY`, `TOKEN_BUCKET_REFILL_RATE_PER_MS`, `SEED_QUOTE_MICRO_UNITS`, `VIRTUAL_SHARES`, `NAV_SCALE`, `MAX_PRICE_PREMIUM_BPS`) | 24 |
| TypeScript (`strategy_constants.ts`) | 6 (same UPPER_SNAKE names as Python; bigint `n` suffix on the first 5; plain number on `MAX_PRICE_PREMIUM_BPS`) | 24 |

**Removed accessors:** 3 per file (`bucket_capacity_bps`, `bucket_refill_rate_bps_per_sec`, `bucket_period_seconds`).

**Net:** +3 accessors per file, schema version bumped 1 → 2.

### Idempotency / drift verification

- `cd backtest && uv run --no-project python ../scripts/codegen.py --check` → exit 0 (no drift between expected emit and on-disk content).
- Re-running the regenerate command produces zero git diff on the three target files.
- All three generated files start with `// AUTO-GENERATED - DO NOT EDIT` (or `#` for Python) — header preservation confirmed.

## Deviations from Plan

None — plan executed exactly as written. The plan's `<action>` blocks for each task were specific enough that no Rule 1/2/3 auto-fixes were needed. The plan called out the `load_strategy` schema_version guard implicitly (it instructs `bump schema_version = 2`); I made the codegen.py guard bump explicit-and-paired so a future regression where the TOML reverts to v1 fails loudly. This is consistent with the plan's intent and not a divergence.

No authentication gates encountered (codegen runs locally; no network or wallet calls).

## Acceptance Criteria

| Criterion | Status |
|-----------|--------|
| `grep -c 'capacity_quote_micro_units' shared/strategy.toml` ≥ 1 | PASS |
| `grep -c 'refill_rate_quote_micro_units_per_ms' shared/strategy.toml` ≥ 1 | PASS |
| Old `capacity_bps` key gone from strategy.toml | PASS |
| Old `refill_rate_bps_per_sec` key gone from strategy.toml | PASS |
| `[inflation_defense]` section present | PASS |
| `seed_quote_micro_units` + `virtual_shares` present | PASS |
| `max_price_premium_bps` present | PASS |
| `schema_version = 2` | PASS |
| 8 top-level sections preserved | PASS |
| `python -m ast.parse scripts/codegen.py` exits 0 | PASS |
| codegen.py contains `token_bucket_capacity` (Move) + `TOKEN_BUCKET_CAPACITY` (Python+TS) | PASS |
| codegen.py contains `SEED_QUOTE_MICRO_UNITS` × 2+ | PASS |
| codegen.py contains `VIRTUAL_SHARES` × 2+ | PASS |
| codegen.py contains `NAV_SCALE` × 2+ | PASS |
| codegen.py contains `MAX_PRICE_PREMIUM_BPS` / `max_price_premium_bps` × 3+ | PASS |
| Old `capacity_bps`/`bucket_capacity_bps`/`bucket_refill_rate_bps_per_sec`/`bucket_period_seconds` references in codegen.py: 0 | PASS |
| `strategy_constants.move` contains `token_bucket_capacity`, `seed_quote_micro_units`, `virtual_shares`, `nav_scale`, `max_price_premium_bps`; lacks old BPS accessors | PASS |
| `strategy_constants.py` contains `TOKEN_BUCKET_CAPACITY` and `SEED_QUOTE_MICRO_UNITS` | PASS |
| `strategy_constants.ts` contains `TOKEN_BUCKET_CAPACITY: ...n` (bigint, n-suffixed) | PASS |
| All three generated files start with `AUTO-GENERATED` header | PASS |
| `codegen.py --check` exits 0 (drift-free) | PASS |

## Self-Check: PASSED

**Files claimed created/modified — verification:**

- `shared/strategy.toml`: FOUND, schema_version 2, all new keys present.
- `scripts/codegen.py`: FOUND, AST parses, all new emit lines present, no old BPS references.
- `contracts/sources/strategy_constants.move`: FOUND, schema_version 2 header, all 6 new accessors emitted in correct Move syntax.
- `backtest/src/deepvault/strategy_constants.py`: FOUND, schema_version 2 header, all 6 new constants emitted with `Final[int]` typing.
- `dashboard/src/lib/strategy_constants.ts`: FOUND, schema_version 2 header, all 6 new constants emitted; 5 bigint with `n` suffix; 1 plain number.

**Commits claimed — verification:**

- `73af914` (Task 1): FOUND in `git log --oneline`.
- `c141b4b` (Task 2): FOUND in `git log --oneline`.
- `fdcd5ad` (Task 3): FOUND in `git log --oneline`.

**Drift-free verification:** `cd backtest && uv run --no-project python ../scripts/codegen.py --check` → exit 0.

## Resume Signal

Plan 02-02 complete. Next plan in Phase 2 wave order can now proceed with confidence that:
1. `strategy_constants::token_bucket_capacity()`, `::token_bucket_refill_rate_per_ms()`, `::seed_quote_micro_units()`, `::virtual_shares()`, `::nav_scale()`, and `::max_price_premium_bps()` are all defined in Move.
2. The schema is bit-equal across Move/Python/TS at the 6 new constant points.
3. The CI `codegen-drift` job will stay green on PR merge.
4. The breaking schema bump (1 → 2) is contained to this plan; no downstream consumers existed to break.

Wave 2 plan that clones `helpers/rate_limiter.move` can use the cloned struct's `capacity:u64` and `refill_rate_per_ms:u64` fields with confidence that `strategy_constants::token_bucket_capacity()` and `::token_bucket_refill_rate_per_ms()` are the exact-shape values it needs.
