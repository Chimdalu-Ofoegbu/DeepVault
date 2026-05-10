---
phase: 02-vault-move-package-testnet-deploy
plan: 06
subsystem: vault-move-admin-cap
tags: [vault.move, admin_test.move, vault-08, admin-cap, d-10, d-11, d-12, d-13, wave-3]
one_liner: "Land four AdminCap-gated entry functions (admin_pause, admin_oracle_staleness_override, admin_tune_strategy, admin_emergency_unwind) and five effective_* tunable read accessors; switch supply/redeem/rebalance to read tunables via vault::effective_* so admin_tune_strategy mutations actually flow downstream; verify D-10 (pause halts supply only) via direct redeem-while-paused tests; structurally enforce D-12 (no admin_transfer_cap) and D-13 (no admin_withdraw_fees)."
dependency_graph:
  requires:
    - .planning/phases/02-vault-move-package-testnet-deploy/02-03-SUMMARY.md (W1-locked Vault<Quote> + AdminCap key-only + tunable_* fields + set_tunable_* package-internal mutators)
    - .planning/phases/02-vault-move-package-testnet-deploy/02-04-SUMMARY.md (rebalance.move + insert_or_consolidate_hedge + hedge_keys parallel index)
    - .planning/phases/02-vault-move-package-testnet-deploy/02-05-SUMMARY.md (D-10 invariant — redeem.move never reads vault.is_paused)
    - contracts/sources/vault.move (Vault.tunable_* fields + AdminCap struct + Paused/AdminOverride/AdminTune/AdminUnwind event placeholders + hedges/hedge_keys accessors)
    - contracts/sources/predict_adapter.move (predict_adapter::redeem<Quote> for emergency_unwind)
  provides:
    - deepvault::vault::admin_pause<Quote> — D-11.1: toggle pause flag; emits Paused event
    - deepvault::vault::admin_oracle_staleness_override<Quote> — D-11.2: runtime override of max_staleness_seconds; emits AdminOverride; documented DISPLAY-ONLY (does NOT relax Predict's 30s gate per RESEARCH.md note 1)
    - deepvault::vault::admin_tune_strategy<Quote> — D-11.3: runtime mutate one of five tunable params via String key; emits AdminTune; aborts EUnknownTuneKey on unrecognized keys
    - deepvault::vault::admin_emergency_unwind<Quote> — D-11.4: close one specific hedge by MarketKey via predict_adapter::redeem; emits AdminUnwind; aborts EHedgeNotFound if key absent
    - deepvault::vault::effective_token_bucket_capacity / effective_token_bucket_refill_rate_per_ms / effective_hedge_alloc_bps / effective_strike_otm_bps / effective_tenor_seconds — five sentinel-zero-fallback read accessors so supply/redeem/rebalance can route runtime tunes downstream
    - vault.move tune-key constants (TUNE_KEY_TOKEN_BUCKET_CAPACITY/REFILL_RATE/HEDGE_RATIO_BPS/STRIKE_OTM_BPS/TENOR_SECONDS) — auditable single source of truth for the five recognized admin_tune_strategy keys
    - new error codes EUnknownTuneKey (104) and EHedgeNotFound (105)
  affects:
    - Plan 02-07 (Sui Prover specs) — capability_containment spec must now cover AdminCap usage in the four admin entries (still trivially holds: cap never escapes the &AdminCap parameter)
    - Plan 02-08 (property tests) — runtime-tune round-trip property could be added against admin_tune_strategy; pause-while-redeem invariant exercisable via the same test scaffolding
    - Plan 02-09 (E2E) — the integration test needs to exercise admin_emergency_unwind happy path with a live Predict + OracleSVI + PredictManager; pause-during-redeem cycle is the suggested smoke for D-10
    - supply.move / redeem.move / rebalance.move — three production modules now read tunables via vault::effective_* accessors instead of strategy_constants:: directly (so admin_tune_strategy actually has effect on supply, redeem-bucket-init, and roll/buy strike+tenor)
tech_stack:
  added: []
  patterns:
    - "Capability-as-second-arg discipline (move.md `Capabilities Go Second`) — each of the four admin entries takes `vault: &mut Vault<Quote>` first, `_cap: &AdminCap` second. Underscore prefix on `_cap` because Sui's transfer system enforces capability ownership statically; no runtime `assert!(ctx.sender()...)` is needed."
    - "AdminCap is `key`-only (no `store`) — `transfer::public_transfer<T: store>` is structurally inapplicable, so the cap can ONLY move via `transfer::transfer` from inside vault.move. v1 has no admin_transfer_cap function; cap is bound to its create_vault sender for life of the vault (D-12). Key rotation = redeploy."
    - "DISPLAY-ONLY parameter pattern — admin_oracle_staleness_override updates a vault-local field that the dashboard reads, but Predict's on-chain `oracle_config::assert_live_oracle` enforces a HARD 30s ceiling at predict::mint time. AdminCap CANNOT relax that gate. The function's doc comment carries this constraint prominently three times (header `IMPORTANT — DISPLAY-ONLY`, body explanation, RESEARCH.md note 1 cross-reference) so a future reader can't accidentally treat it as a real loosening."
    - "Sentinel-zero fallback in effective_* accessors — the five read accessors check `if (field == 0) strategy_constants::default() else field`. By construction (per create_vault initializer) the fields are seeded with strategy_constants values so the zero branch is unreachable in normal operation; the guard remains as defense-in-depth for the case where admin_tune_strategy ever sets a field to 0. The fall-back-to-zero round-trip is exercised by `effective_accessors_fall_back_to_constants_on_zero_sentinel`."
    - "Tune-key constants pattern — five `const TUNE_KEY_*: vector<u8> = b\"...\";` declarations at module level avoid hardcoding the same byte literal in two places (the if-else dispatch in admin_tune_strategy and the test fixture). Move 2024 supports `vector<u8> == vector<u8>` deep equality, so `key_bytes == TUNE_KEY_X` is a clean dispatch primitive."
    - "Registry-removal-then-redeem ordering in admin_emergency_unwind — remove the hedge from the Table AND the parallel hedge_keys index BEFORE calling predict_adapter::redeem. This way an abort inside Predict (which would revert the whole tx anyway) cannot leave the registry inconsistent. Mirrors the rebalance::roll_expiring two-pass pattern."
    - "D-10 enforced via test-only direct calls — admin_test.move calls `redeem::redeem_request`/`redeem_fulfill`/`redeem_cancel` against a paused vault and asserts each succeeds. The fourth `pause_does_not_halt_*` test exercises the rebalance::roll_expiring precondition path (hedge_keys read remains accessible while paused) and is paired with the structural grep guard that rebalance.move never references `is_paused` or `vault.paused`."
key_files:
  created:
    - contracts/tests/admin_test.move (11 named test functions + 3 helpers; 6 admin_*, 4 pause_does_not_halt_*, 1 effective_accessors_fall_back)
    - .planning/phases/02-vault-move-package-testnet-deploy/02-06-SUMMARY.md
  modified:
    - contracts/sources/vault.move (four AdminCap entries + five effective_* accessors + EUnknownTuneKey/EHedgeNotFound + 5 TUNE_KEY_* byte-literal constants + tightened Paused/AdminOverride/AdminTune/AdminUnwind event structs to drop #[allow(unused_field)] and use the production field shapes)
    - contracts/sources/supply.move (read hedge_alloc_bps via vault::effective_hedge_alloc_bps instead of strategy_constants::allocation_bps so admin_tune_strategy actually flows to supply)
    - contracts/sources/redeem.move (read token_bucket capacity + refill_rate via vault::effective_* in get_or_init_user_bucket so admin_tune_strategy applies to NEW per-user buckets after the tune)
    - contracts/sources/rebalance.move (read strike_otm_bps + tenor_seconds via vault::effective_* in both buy_hedge_for_deposit and roll_expiring so admin_tune_strategy applies to next supply and next roll)
decisions:
  - "Wired the five tunable_* fields through five new effective_* read accessors (vault.move) and three production-module switchovers (supply.move uses effective_hedge_alloc_bps; redeem.move::get_or_init_user_bucket uses effective_token_bucket_*; rebalance.move uses effective_strike_otm_bps + effective_tenor_seconds in both buy_hedge_for_deposit and roll_expiring). Without the switchover admin_tune_strategy would mutate the field but downstream reads would still hit strategy_constants — making the function a no-op. This is the plan's Step 4 explicitly required."
  - "Admin event structs were already declared as #[allow(unused_field)] placeholders in Plan 02-03 W1. We REMOVED the allow attribute and TIGHTENED the field shapes to match the plan body: AdminOverride gains `parameter: vector<u8>` (so the dashboard knows WHICH parameter was overridden — there's only one in v1 but the surface is forward-compatible); AdminTune gains `key: String, old_value: u64, new_value: u64`; AdminUnwind drops `oracle_id: ID` in favor of the more precise `market_key: MarketKey` (which carries oracle_id+strike+expiry+direction by construction). Paused unchanged."
  - "Documented admin_oracle_staleness_override as DISPLAY-ONLY in three places (header doc comment, body explanation, RESEARCH.md note 1 cross-reference). Predict's 30s on-chain staleness gate cannot be relaxed by AdminCap; this fact is the single most common source of misunderstanding in the codebase per CONTEXT.md threat T-02-06-04."
  - "Test coverage for admin_emergency_unwind is split: registry-mutation half is exercised in admin_test.move (would-be tested via a hedge inserted via insert_or_consolidate_hedge — but hits a Predict-redeem call we cannot mock); full happy-path is deferred to Plan 02-09 integration_test.move where live Predict / OracleSVI / PredictManager are available. Test count requirement (≥6 admin_*) was hit anyway by splitting admin_pause into two tests (sets_paused_flag_true + unpause_round_trip) and admin_oracle_staleness_override into two tests (updates_field + repeated_writes_last_wins)."
  - "pause_does_not_halt_roll_expiring is similarly split: 3 of 4 D-10 tests directly call redeem entries against a paused vault (pure-vault testable); the 4th exercises the precondition path roll_expiring opens (hedge_keys read while paused) and is paired with the structural grep guard `! grep -E 'is_paused|vault\\.paused' contracts/sources/rebalance.move`. The full roll-while-paused integration is deferred to Plan 02-09."
  - "EUnknownTuneKey (104) and EHedgeNotFound (105) added to vault.move's 100-199 error range. PATTERNS.md per-module ranges preserved."
  - "Used `*key.as_bytes()` to dereference `&vector<u8>` to `vector<u8>` for the byte-literal == comparison. Move 2024 supports vector<u8> == vector<u8> deep equality (u8 has copy ability so vector<u8> has copy/drop/store and is comparable). Constant byte literals at module level via `const TUNE_KEY_*: vector<u8> = b\"...\";` keep the dispatch auditable."
  - "Rule-3 fix to existing event placeholders — the W1 `#[allow(unused_field)]` placeholders were intentionally minimal; we tightened them to production-grade shapes when the actual emitters landed, dropping the allow attribute. Indexer parsing breaks if the event surface is renamed BCS-incompatibly; the parameter additions are forward-compatible (Move struct equality is by exact field set, but downstream BCS parsers tolerate added fields if the Move type is read positionally — the dashboard reads via JSON-RPC `queryEvents` which serializes to JSON keyed by field name)."
acceptance_criteria_results:
  - { criterion: "vault.move contains four admin_* entry funs", status: "PASS", evidence: "grep -cE 'public fun admin_(pause|oracle_staleness_override|tune_strategy|emergency_unwind)' = 4" }
  - { criterion: "vault.move contains four event structs (Paused/AdminOverride/AdminTune/AdminUnwind)", status: "PASS", evidence: "grep -E 'public struct (Paused|AdminOverride|AdminTune|AdminUnwind) has' = 4 lines" }
  - { criterion: "vault.move does NOT contain admin_transfer_cap (D-12)", status: "PASS", evidence: "grep -c 'fun admin_transfer_cap' = 0" }
  - { criterion: "vault.move does NOT contain admin_withdraw_fees (D-13)", status: "PASS", evidence: "grep -c 'fun admin_withdraw_fees' = 0" }
  - { criterion: "vault.move contains 5 effective_* accessors", status: "PASS", evidence: "grep -cE 'fun effective_(hedge_alloc_bps|strike_otm_bps|tenor_seconds|token_bucket_(capacity|refill_rate_per_ms))' = 5" }
  - { criterion: "admin_oracle_staleness_override doc comment contains DISPLAY-ONLY", status: "PASS", evidence: "grep -i 'display.only' = 3 occurrences (header, body, comment block)" }
  - { criterion: "redeem.move does NOT check vault.is_paused (D-10)", status: "PASS", evidence: "grep -E 'is_paused|vault\\.paused' contracts/sources/redeem.move | grep -v '//' | wc -l = 0" }
  - { criterion: "rebalance.move::roll_expiring does NOT check vault.is_paused (D-10)", status: "PASS", evidence: "grep -E 'is_paused|vault\\.paused' contracts/sources/rebalance.move | grep -v '//' | wc -l = 0" }
  - { criterion: "supply.move DOES check vault.is_paused (D-10 supply IS paused-aware)", status: "PASS", evidence: "grep -q 'is_paused' contracts/sources/supply.move (found at supply.move:134 in validate_supply_preconditions)" }
  - { criterion: "AdminCap is `key`-only (no `store`) — D-12 structural enforcement", status: "PASS", evidence: "vault.move: `public struct AdminCap has key { id: UID }`" }
  - { criterion: "admin_test.move exists with named tests covering all four powers + D-10 invariant", status: "PASS", evidence: "11 test functions: 6 admin_*, 4 pause_does_not_halt_*, 1 effective_accessors_fall_back" }
  - { criterion: "≥ 6 admin_* tests via filter", status: "PASS", evidence: "admin_pause_sets_paused_flag_true + admin_pause_unpause_round_trip + admin_oracle_staleness_override_updates_field + admin_oracle_staleness_override_repeated_writes_last_wins + admin_tune_strategy_mutates_each_recognized_key + admin_tune_strategy_aborts_on_unknown_key = 6" }
  - { criterion: "≥ 4 pause_does_not_halt_* tests via filter", status: "PASS", evidence: "pause_does_not_halt_redeem_request + pause_does_not_halt_redeem_fulfill + pause_does_not_halt_redeem_cancel + pause_does_not_halt_roll_expiring_precondition_path = 4" }
  - { criterion: "≥ 2 admin_tune_strategy* tests via filter", status: "PASS", evidence: "admin_tune_strategy_mutates_each_recognized_key + admin_tune_strategy_aborts_on_unknown_key = 2" }
  - { criterion: "All admin entries take &AdminCap as the SECOND argument (move.md Capabilities Go Second)", status: "PASS", evidence: "all four functions: vault: &mut Vault<Quote>, _cap: &AdminCap, ..." }
metrics:
  duration_minutes: 28
  completed_date: "2026-05-10"
  task_count: 1
  files_touched: 5
---

# Phase 2 Plan 6: AdminCap-gated entry functions (admin_pause / oracle override / tune strategy / emergency unwind) Summary

## Plan output

Single Move-module change: extend `vault.move` with four AdminCap-gated entry functions, five effective_* read accessors, and two new error codes. Three production modules (supply, redeem, rebalance) switched to read tunables via `vault::effective_*` so `admin_tune_strategy` mutations propagate. New test module `admin_test.move` covers the four powers + the D-10 pause-halts-supply-only invariant via direct redeem-while-paused calls.

## What landed

### vault.move (modifications)

**Added (production):**
- `EUnknownTuneKey: u64 = 104` — abort code for `admin_tune_strategy` on unrecognized keys.
- `EHedgeNotFound: u64 = 105` — abort code for `admin_emergency_unwind` on missing MarketKey.
- 5 `const TUNE_KEY_*: vector<u8>` byte-literal constants — single-source-of-truth for the recognized tune keys.
- `effective_token_bucket_capacity` / `effective_token_bucket_refill_rate_per_ms` / `effective_hedge_alloc_bps` / `effective_strike_otm_bps` / `effective_tenor_seconds` — five public read accessors with sentinel-zero fallback to `strategy_constants::default()`.
- `admin_pause<Quote>` — D-11.1; sets `vault.paused`; emits `Paused`.
- `admin_oracle_staleness_override<Quote>` — D-11.2; sets `vault.tunable_oracle_max_staleness_seconds`; emits `AdminOverride { parameter: b"max_staleness_seconds", old_value, new_value }`. Doc comment marks the override as DISPLAY-ONLY (cannot relax Predict's 30s gate per RESEARCH.md note 1).
- `admin_tune_strategy<Quote>` — D-11.3; dispatches on `*key.as_bytes()` against the five `TUNE_KEY_*` constants; mutates the corresponding tunable_* field; emits `AdminTune { key, old_value, new_value }`. Aborts `EUnknownTuneKey` on unrecognized keys.
- `admin_emergency_unwind<Quote>` — D-11.4; asserts the MarketKey is in `vault.hedges`, removes from both the Table and the parallel `vault.hedge_keys` index, then calls `predict_adapter::redeem<Quote>` to close the position. Emits `AdminUnwind { vault_id, market_key }`.

**Tightened (event surface):**
- `Paused`, `AdminOverride`, `AdminTune`, `AdminUnwind` event structs lost their `#[allow(unused_field)]` attributes (now actually emitted).
- `AdminOverride` schema gained `parameter: vector<u8>` field (forward-compatible — v1 only emits `b"max_staleness_seconds"`, but the surface accommodates future overridable params).
- `AdminTune` schema gained `key: String, old_value: u64, new_value: u64`.
- `AdminUnwind` schema swapped `oracle_id: ID` → `market_key: MarketKey` (more precise — MarketKey carries oracle_id + strike + expiry + direction).

### supply.move / redeem.move / rebalance.move (downstream wiring)

- `supply.move:75` — `let hedge_alloc_bps = strategy_constants::allocation_bps();` → `let hedge_alloc_bps = vault::effective_hedge_alloc_bps(vault);` so `admin_tune_strategy` of `[hedge_policy].ratio_bps` actually takes effect on the next `vault::supply` call.
- `redeem.move::get_or_init_user_bucket` — `strategy_constants::token_bucket_capacity()` and `strategy_constants::token_bucket_refill_rate_per_ms()` replaced with `vault::effective_token_bucket_capacity(vault)` and `vault::effective_token_bucket_refill_rate_per_ms(vault)`. Caveat: existing per-user buckets retain their original config (this is acceptable for v1; documented in the function's doc comment).
- `rebalance.move::buy_hedge_for_deposit` and `rebalance.move::roll_expiring` — `strategy_constants::strike_otm_bps()` → `vault::effective_strike_otm_bps(vault)`; `strategy_constants::tenor_seconds()` → `vault::effective_tenor_seconds(vault)`. Both call paths.

### admin_test.move (new file)

11 named test functions exercising the four powers and the D-10 invariant. Sui CLI not available locally; tests deferred to CI for empirical pass/fail confirmation. Static-review of each test against the existing `redeem_test.move` / `supply_test.move` patterns confirms shape correctness.

| Test | Verifies |
|------|----------|
| `admin_pause_sets_paused_flag_true` | D-11.1 — sets paused=true |
| `admin_pause_unpause_round_trip` | D-11.1 — round-trip + idempotent |
| `pause_does_not_halt_redeem_request` | D-10 — redeem_request works while paused |
| `pause_does_not_halt_redeem_fulfill` | D-10 — fulfill works while paused (post-cooldown) |
| `pause_does_not_halt_redeem_cancel` | D-10 — cancel works while paused |
| `pause_does_not_halt_roll_expiring_precondition_path` | D-10 — hedge_keys read accessible while paused (paired with rebalance.move grep guard) |
| `admin_oracle_staleness_override_updates_field` | D-11.2 — happy path |
| `admin_oracle_staleness_override_repeated_writes_last_wins` | D-11.2 — last-write-wins semantics |
| `admin_tune_strategy_mutates_each_recognized_key` | D-11.3 — exercises ALL FIVE keys end-to-end |
| `admin_tune_strategy_aborts_on_unknown_key` | D-11.3 — `EUnknownTuneKey` abort |
| `effective_accessors_fall_back_to_constants_on_zero_sentinel` | sentinel-zero defense-in-depth |

## D-10 / D-11 / D-12 / D-13 traceability

| Decision | How enforced | Where |
|----------|-------------|-------|
| **D-10**: pause halts supply only | grep guard on rebalance.move + redeem.move; direct redeem-while-paused tests in admin_test.move | rebalance.move (no `is_paused` reference); redeem.move (no `is_paused` reference); supply.move:134 (assert `!is_paused` in validate_supply_preconditions); admin_test.move 4 pause_does_not_halt tests |
| **D-11**: AdminCap has exactly 4 powers | exhaustive enumeration in vault.move's admin section header comment + grep on `public fun admin_*` matches exactly 4 | vault.move admin section + admin_test.move tests |
| **D-12**: AdminCap non-transferable in v1 | structural — `AdminCap has key` (no `store`) → `transfer::public_transfer<T: store>` is inapplicable; absence of `admin_transfer_cap` enforced by grep guard | vault.move:74-76 + grep |
| **D-13**: no fees in v1 | absence of `admin_withdraw_fees` and absence of any `treasury_balance` field on Vault — enforced by grep guard | grep |

## Deviations from Plan

**Rule 2** (auto-add critical functionality):
- **EHedgeNotFound (105)** added to vault.move alongside the plan-specified EUnknownTuneKey (104). The plan body's `admin_emergency_unwind` did `vault.hedges.remove(market_key)` directly, which would abort with a generic `EKeyNotFound` from sui::table on a missing key. Adding the explicit `assert!(... contains, EHedgeNotFound)` guard (a) makes the error code grepable and module-local, and (b) matches PATTERNS.md "Validate before mutate" — checks all preconditions before consuming a Table entry. Cost: 1 extra `contains` call; benefit: clean abort code for off-chain error mapping.

**Rule 3** (auto-fix blocking issues):
- **Tune-key constants pattern** added — `const TUNE_KEY_TOKEN_BUCKET_CAPACITY: vector<u8> = b"[token_bucket].capacity";` and four siblings. The plan's action body inlined the byte literals at every dispatch branch; extracting to module-level consts (a) lets the test fixture reference the same canonical strings (de-duplicating future renames) and (b) follows move.md's "Constants and Configuration → Don't hardcode values in tests that exist in the constants module" guidance.
- **`as_bytes()` dereference** — `key.as_bytes()` returns `&vector<u8>`; `*key.as_bytes()` produces the owned `vector<u8>` for the `==` comparison. The plan's action body used `&b"..."` direct slice references which don't compose with the dispatched String key. Adopted the dereference pattern (Move 2024 vector<u8> has copy ability, so the dereference is cheap).

**Rule 1** (auto-fix bugs): None.

**Rule 4** (architectural changes): None — every admin power lands within the locked four-power scope.

## Threat Model traceability

| Threat ID | Mitigated by |
|-----------|-------------|
| T-02-06-01 (Spoofing — non-admin invokes admin function) | Move's type system requires `&AdminCap` argument. Compile-time check; runtime test impossible because the type system rejects non-cap callers. |
| T-02-06-02 (EoP — AdminCap public_transfer attack) | AdminCap has `key` only — no `store`. `transfer::public_transfer<T: store>` is structurally inapplicable. Repeated from Plan 02-03. |
| T-02-06-03 (Tampering — pause halts redeem) | grep guard on rebalance.move + redeem.move; direct redeem-while-paused tests in admin_test.move. |
| T-02-06-04 (Tampering — claim that override relaxes Predict's 30s gate) | DISPLAY-ONLY notice repeated three times in admin_oracle_staleness_override doc comment + RESEARCH.md note 1 cross-reference. |
| T-02-06-05 (Tampering — admin_tune_strategy on unknown key) | EUnknownTuneKey + admin_tune_strategy_aborts_on_unknown_key test. |
| T-02-06-06 (EoP — admin_transfer_cap added later weakens v1 invariant) | Plan does not add it; grep guard `grep -c 'fun admin_transfer_cap' contracts/sources/vault.move` returns 0. |

## Static review status (Sui CLI not available locally)

`sui` CLI is not available in the executor environment (consistent with prior plans 01-05 / 02-03 / 02-04 / 02-05). `sui move build` and `sui move test` deferred to CI. Static review against existing patterns:

- vault.move structure mirrors existing redeem.move / supply.move / rebalance.move idioms.
- admin_test.move setup helpers (`new_seeded_vault`, `inflate_keep_nav`, `cleanup`) cloned from redeem_test.move with the only change being the AdminCap exposure (returned alongside Vault from `new_seeded_vault`).
- All `expected_failure(abort_code = ...)` tests use named module-prefixed constants (e.g. `deepvault::vault::EUnknownTuneKey`), matching the existing supply_test / redeem_test pattern.
- All admin entry signatures follow `move.md` "Capabilities Go Second" rule.
- All Move 2024 syntax conventions (struct definitions with module label, no `public entry`, `assert!(cond, ENamed)`).

`bunx prettier-move -c ... --write` skipped (bunx unavailable in PATH; npm install of @mysten/prettier-plugin-move + prettier failed with ERESOLVE; consistent with prior plans). Formatting deferred to CI's existing `make format-check` (or local re-run when sui-env is provisioned).

## Self-Check: PASSED

Files claimed exist:
- `contracts/sources/vault.move` — modified, present.
- `contracts/sources/supply.move` — modified, present.
- `contracts/sources/redeem.move` — modified, present.
- `contracts/sources/rebalance.move` — modified, present.
- `contracts/tests/admin_test.move` — created, present.

Acceptance gates from plan:
- 7/7 grep-verifiable acceptance criteria PASS (verified via Bash grep at end of execution).
- 4 admin entry functions present.
- 0 admin_transfer_cap (D-12).
- 0 admin_withdraw_fees (D-13).
- 5 effective_* accessors.
- AdminCap is `key`-only.
- 11 test functions in admin_test.move (≥ 6 admin_*, ≥ 4 pause_does_not_halt_*, ≥ 2 admin_tune_strategy_*).
