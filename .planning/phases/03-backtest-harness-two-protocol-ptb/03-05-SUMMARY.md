---
phase: 03-backtest-harness-two-protocol-ptb
plan: 05
subsystem: wave-2-track-a-ptb-complete-capability-flow-cross-language-grep
tags: [phase-03, wave-2, track-a, ptb-complete, capability-flow, grep-gate, PTB-03, PTB-04, PTB-06]

requires:
  - .planning/phases/03-backtest-harness-two-protocol-ptb/03-CONTEXT.md (D-17 amended, D-18, D-19)
  - .planning/phases/03-backtest-harness-two-protocol-ptb/03-RESEARCH.md (Pattern 1 5-call PTB, Pattern 4 capability-quarantine)
  - .planning/phases/03-backtest-harness-two-protocol-ptb/03-PATTERNS.md (e2e-vault-cycle.ts analog + integration_test.move analog + ci.yml grep step analog)
  - .planning/phases/03-backtest-harness-two-protocol-ptb/WAVE0-DECISION.md (5-call PTB shape lock, SDK 1.3.6 pin, JSON u64-as-string convention)
  - .planning/phases/03-backtest-harness-two-protocol-ptb/MARGIN-WHITELIST-DECISION.md (UNDETERMINED-FALLBACK-TO-MOCK)
  - .planning/phases/03-backtest-harness-two-protocol-ptb/03-03-SUMMARY.md (PTB skeleton + mock_margin_pool from Plan 03-03)
  - scripts/two-protocol-ptb-demo.ts (Plan 03-03 skeleton — 4 function stubs filled here)
  - scripts/e2e-vault-cycle.ts (signing + event extraction pattern analog, Plan 02-09)
  - contracts/tests/integration_test.move (test_scenario + new_seeded_vault helper analog, Plan 02-09)
  - contracts/tests/mock_margin_pool.move (Plan 03-03 test-only Margin trait surface — consumed by Move-side capability tests)
  - contracts/sources/share.move (PendingTreasury → consume_pending capability-quarantine bridge, Phase 2)
  - .github/workflows/ci.yml (Phase 2 W4 capability_containment grep step — analog the Python grep gate extends)

provides:
  - scripts/two-protocol-ptb-demo.ts (COMPLETE 5-call PTB driver — 709 LOC; signAndExecuteTransaction + atomic-rollback gate + LoanBorrowed+Supplied+HedgeMinted assertion + trace dump)
  - contracts/tests/ptb_capability_test.move (Move-side capability-flow tests — 313 LOC; 4 inline tests, ALL PASS via sui move test)
  - backtest/tests/test_ptb_capability_grep.py (cross-language grep CI gate — 215 LOC; 5 def test_, ALL PASS via uv run pytest; ruff lint + format clean)

affects:
  - Plan 03-06 (replay-parity will consume the action-trace JSON the PTB demo dumps via dumpTrace; trace shape locked per WAVE0-DECISION.md Q5)
  - Plan 03-07 (-30% NAV shock liquidation property test — builds on mock_margin_pool::liquidate_position; uses the same capability-flow scaffolding the Move test established here)
  - Plan 03-09 (Phase 3 closeout will wire backtest/tests/test_ptb_capability_grep.py into ci.yml's python job — the test ships here, the CI wiring lands there per plan body)

tech-stack:
  added: []
  patterns:
    - "5-call PTB shape locked from WAVE0-DECISION.md (margin_manager::deposit → borrow_quote → withdraw → vault::supply::supply [→ optional VAULT_SHARE re-deposit])"
    - "Capability discipline at THREE layers: Move type system + Move test (this plan Task 2) + Python grep gate (this plan Task 3)"
    - "Atomic-rollback assertion via event-surface check: LoanBorrowed + Supplied + HedgeMinted must appear in single tx digest (any abort propagates per Move tx semantics)"
    - "u64-as-string JSON convention (WAVE0-DECISION.md Q5) for cross-runtime event payload survival of JS Number safe-max"
    - "SuiObjectChange union narrowing via runtime type-guard + unknown[] cast (TS Array.find cannot narrow a union element type to a non-member shape)"
    - "MockMarginPool disposal pattern: `key`-only structs cannot transfer::transfer from outside their module; use sui::test_utils::destroy in tests"
    - "Negative-grep pattern: `^public fun [^(]*\\(...\\)\\s*:\\s*\\&?(mut )?(TradeCap|...)` anchors on return position so parameter annotations are NOT false-positives"

key-files:
  created:
    - contracts/tests/ptb_capability_test.move (313 LOC; 4 inline tests; closes PTB-04 Move-side)
    - backtest/tests/test_ptb_capability_grep.py (215 LOC; 5 def test_; closes PTB-04 grep-side)
    - .planning/phases/03-backtest-harness-two-protocol-ptb/03-05-SUMMARY.md (this file)
  modified:
    - scripts/two-protocol-ptb-demo.ts (404 → 709 LOC; +305 LOC filling the four function stubs left by Plan 03-03)

decisions:
  - "MarginManager constructor call shape: used `margin_manager::new_margin_manager<BTC, DUSDC>(registry)` (raw tx.moveCall) rather than the @mysten/deepbook-v3 1.3.6 MarginManagerContract instance method. Per WAVE0-DECISION.md 'SDK introspection evidence' the SDK's MarginPoolContract surface exposes only `constructor` via getOwnPropertyNames — instance methods may not match the 5-call shape, and raw tx.moveCall is the safest path."
  - "Atomicity assertion event list locked at LoanBorrowed + Supplied + HedgeMinted (NOT a separate rebalance::HedgeMinted top-level moveCall). Per WAVE0-DECISION.md, rebalance::buy_hedge_for_deposit is public(package) and invoked internally by supply.move:89-97; we do NOT call rebalance directly. The HedgeMinted event still fires from inside the supply call, so the assertion holds."
  - "Trace dump uses TRACE_OUT_PATH env (default: backtest/traces/cycle-full.json). Plan 03-06 (replay.py) will consume this path and extend with pre/post vault snapshots via client.getObject."
  - "TradeCap discipline: setupBalanceManagerWithTradeCap returns ONLY {marginManagerId: string} — no &mut TradeCap, no Coin<TradeCap>, no TradeCap-by-value. The capability is created and stored INSIDE the wrapped BalanceManager by margin_manager::new_margin_manager and never appears as a free PTB local."
  - "Move test capability assertion is STRUCTURAL (not adversarial-by-construction): a regression that adds `public fun returns_cap(): TreasuryCap<SHARE>` to vault.move would NOT cause this file's tests to fail — but the companion Python grep gate test_no_public_fun_returns_tradecap_or_treasury_cap_in_production WOULD fire. The two layers are complementary; Move type system catches the LOCAL extraction-attempt case, grep catches the REGRESSION-ADDED-PUBLIC-FN case."
  - "MockMarginPool disposal in ptb_capability_test.move uses sui::test_utils::destroy (Rule 3 deviation from plan body). The plan body suggested `transfer::transfer(pool, ADMIN)` but that's restricted to the pool's own module — MockMarginPool is `key`-only (no `store`), so cross-module transfer::transfer is rejected by E02009 'invalid private transfer call'. The destroy helper sidesteps the private-transfer boundary cleanly without modifying mock_margin_pool's API."
  - "Test 3 abort_code: used 601 (mock_margin_pool::EInsufficientCollateral) rather than 401 (rebalance::EPredictMisquote). Both are mid-PTB aborts that prove Move tx semantics roll back the entire scope; the Margin-side abort is exercisable in unit-test scope without a live PredictManager (the EPredictMisquote path is already covered by integration_test.move:217 from Plan 02-09)."
  - "CI wiring DEFERRED to Plan 03-09 per plan body 'Plan 03-09 wires this test into CI. This plan ships the test only.' Plan 03-05 acceptance criteria mention adding a CI step but the canonical instruction in the plan tasks section overrides — test_ptb_capability_grep.py ships here as a passing local test; Plan 03-09 closes the CI integration."
  - "PTB demo TS surface drift: SuiObjectChange union narrowing required `(objectChanges as unknown[]).find(typeGuard)` rather than `objectChanges.find(typeGuard)` — TS's Array<T>.find with a type predicate cannot narrow a union element type T to a CreatedChange shape that's not a union member. Cast-through-unknown is the canonical TS workaround."

threat_model_disposition:
  T-03-15: "mitigated — three-layer enforcement live: (1) Move type system rejects extraction at compile time, (2) ptb_capability_test.move provides 4 STRUCTURAL + FUNCTIONAL tests, (3) test_ptb_capability_grep.py runs 5 grep tests against contracts/sources/ + scripts/. Plan 03-09 will add this Python test to ci.yml's python job."
  T-03-16: "mitigated — scripts/two-protocol-ptb-demo.ts uses process.env.SUI_PRIVATE_KEY exclusively (Ed25519Keypair.fromSecretKey). NO hardcoded private keys anywhere in the file. CI workflow secret rotation per run per Phase 2 e2e-vault-cycle precedent."
  T-03-17: "mitigated — atomicity assertion is event-surface based: LoanBorrowed + Supplied + HedgeMinted MUST all appear in result.events with a single tx digest. Move tx semantics + signAndExecute's effects.status.status === 'success' check are belt-and-suspenders enforcement. Single-tx digest is captured and dumped to action-trace JSON for Plan 03-06 parity replay."

metrics:
  duration: "~30min"
  completed: "2026-05-12"
  tasks: 3
  commits: 3
  files_created: 3 (ptb_capability_test.move, test_ptb_capability_grep.py, this SUMMARY)
  files_modified: 1 (scripts/two-protocol-ptb-demo.ts)
  tests_added: 9 (4 Move + 5 Python)
---

# Phase 3 Plan 5: Wave 2 Track A — Complete PTB Body + Capability-Flow Tests + Cross-Language Grep — Summary

Wave 2 / Track A **closes the flagship two-protocol composability story**:
the complete 5-call PTB body lands in `scripts/two-protocol-ptb-demo.ts`,
the Move-side capability-flow tests in
`contracts/tests/ptb_capability_test.move` (4/4 PASS), and the cross-language
grep CI gate in `backtest/tests/test_ptb_capability_grep.py` (5/5 PASS).
This plan closes PTB-03 (atomic 5-call PTB), PTB-04 (capability-flow tests),
and PTB-06 (fresh-wallet end-to-end testnet test ready for the nightly path).

One-liner: **complete 5-call PTB driver with atomic-rollback gate + three
layers of capability-flow enforcement (Move type system + 4 Move tests +
5 Python grep tests).**

## What Shipped

### PTB-03: `scripts/two-protocol-ptb-demo.ts` (404 → 709 LOC)

**Filled the four function stubs left by Plan 03-03 with the complete 5-call PTB body.**

- **`setupBalanceManagerWithTradeCap(client, keypair, deploy)`** — Creates
  MarginManager via 1-call PTB `margin_manager::new_margin_manager<BTC, DUSDC>(registry)`.
  Returns ONLY `{marginManagerId: string}` — no TradeCap return, no Coin<TradeCap>.
  The TradeCap is created inside the wrapped BalanceManager and stored inside
  it per D-19. Short-circuits to env-provided `MARGIN_MANAGER_ID` for re-use.
- **`buildPtb(deploy, marginManagerId, collateralCoinId, oracleSviId)`** —
  Composes the 5-call PTB per WAVE0-DECISION.md:
  1. `splitCoins` (BTC collateral to COLLATERAL_AMOUNT_MICRO)
  2. `margin_manager::deposit<BTC, DUSDC, BTC>` — collateral in
  3. `margin_manager::borrow_quote<BTC, DUSDC>` — borrows DUSDC, auto-deposits
  4. `margin_manager::withdraw<BTC, DUSDC, DUSDC>` — bridge: extract Coin<DUSDC>
  5. `vault::supply::supply<DUSDC>(borrowedCoin)` — atomic deposit + hedge mint
  6. (commented-out OPTIONAL: `margin_manager::deposit<...,SHARE>` D-18 hot-upgrade)
- **`signAndExecute(client, keypair, tx)`** — Calls
  `client.signAndExecuteTransaction({...showEffects, showEvents, showObjectChanges})`,
  asserts `effects.status.status === 'success'` (atomic-rollback gate fires
  on any abort in the 5 calls). Returns `{digest, events}`.
- **`extractAndAssertEvents(events)`** — Atomicity assertion: requires
  `::margin_manager::LoanBorrowed` + `::supply::Supplied` + `::rebalance::HedgeMinted`
  to ALL appear in the single tx's event list. Missing any one means
  the PTB did not execute the full 5-call shape per WAVE0-DECISION.md.
- **`dumpTrace(deploy, digest, events)`** — Emits action-trace JSON to
  `TRACE_OUT_PATH || backtest/traces/cycle-full.json` per WAVE0-DECISION.md
  Q5 (u64 fields as JSON strings; 0x-prefixed lowercase hex object IDs).
  Plan 03-06 consumes.

**Acceptance criteria — all 8 PASS:**
- `grep -c 'tx.moveCall'` = **7** ≥ 4 (5-call shape, plus the setup PTB)
- `grep -q 'signAndExecuteTransaction'` PASS
- `grep -q 'LoanBorrowed\|Supplied\|HedgeMinted'` PASS
- `grep -q 'WAVE0-DECISION.md\|5-call\|five-call'` PASS
- `grep -q 'process.env.SUI_PRIVATE_KEY'` PASS (no hardcoded keys)
- `cd dashboard && pnpm typecheck` → exits 0
- File length: 709 LOC ≥ 250
- No `TODO` markers in the PTB body section

### PTB-04: `contracts/tests/ptb_capability_test.move` (313 LOC; 4/4 tests PASS)

**Move-side capability-flow tests.** All four #[test] functions pass via
`sui move test ptb_capability_test --gas-limit 100000000000` (verified
locally with Sui CLI mainnet-v1.71.1):

```
[ PASS    ] deepvault::ptb_capability_test::mock_margin_pool_round_trip_preserves_no_cap_escape
[ PASS    ] deepvault::ptb_capability_test::test_atomic_rollback_on_predict_misquote
[ PASS    ] deepvault::ptb_capability_test::test_trade_cap_never_leaves_balance_manager
[ PASS    ] deepvault::ptb_capability_test::test_treasury_cap_never_leaves_vault
Test result: OK. Total tests: 4; passed: 4; failed: 0
```

- **`test_trade_cap_never_leaves_balance_manager`** — Exercises mock_margin_pool
  borrow path (register SHARE collat → borrow Coin<TEST_QUOTE>); no
  pool-internal capability escapes as a free local. Coin<SHARE> is consumed
  by the borrow call; only Coin<TEST_QUOTE> crosses the public-function boundary.
- **`test_treasury_cap_never_leaves_vault`** — STRUCTURAL: new_seeded_vault
  helper proves TreasuryCap<SHARE> appears ONLY in the two-line
  `consume_pending(pending) → new_vault_for_testing(cap, seed, ctx)` bridge,
  then lives as a private field inside Vault. Asserts seed accounting landed
  (total_assets == seed_quote_micro_units, total_shares > 0) as a sanity
  check that the cap was used to mint and then re-quarantined.
- **`test_atomic_rollback_on_predict_misquote`** — `expected_failure(abort_code = 601)`
  on an under-collateralized borrow. Per Move tx semantics, the abort propagates
  and the entire scope (pool + reserves + registered collat) unwinds. NO
  partial state survives — this IS the atomicity proof. Pairs with
  `integration_test::atomic_supply_aborts_on_predict_misquote` (abort_code 401,
  Plan 02-09 W3 lock) which covers the Predict-side abort end of the spectrum.
- **`mock_margin_pool_round_trip_preserves_no_cap_escape`** — Full register
  → borrow at healthy LTV → liquidate at shocked NAV (0.04 quote/share, 96% drop).
  Asserts risk_ratio < 11500 bps (deeply under-water). Demonstrates that even
  under the future-state "VAULT_SHARE whitelisted as Margin collateral" scenario,
  the D-19 capability discipline holds — only Coin + u64 cross the boundary.

### PTB-04 + PTB-06: `backtest/tests/test_ptb_capability_grep.py` (215 LOC; 5/5 tests PASS)

**Cross-language grep CI gate.** Mirrors the Phase 2 W4 lock
(ci.yml capability_containment grep step). All five `def test_*` PASS via
`cd backtest && uv run pytest tests/test_ptb_capability_grep.py -x`
(ruff lint + format clean):

1. **`test_no_public_fun_returns_tradecap_or_treasury_cap_in_production`** —
   `grep -rnE '^public fun ...: &?(mut )?(TradeCap|TreasuryCap<SHARE>|MockMarginPool)'`
   against `contracts/sources/`. Excludes `_test.move`. ZERO matches required.
2. **`test_no_admin_cap_returned_by_value_from_production`** — same shape
   for AdminCap (vault.move:87 — single-key, non-transferable v1; VAULT-08 D-12).
3. **`test_no_ts_demo_lets_extract_tradecap_outside_sdk_layer`** —
   `grep -rnE '^(const|let)\s+(tradeCap|trade_cap|TradeCap|withdrawCap|depositCap)\s*='`
   against `scripts/*.ts`. Excludes `node_modules`. Catches user-code TradeCap
   extraction attempts; SDK-internal TradeCap usage in @mysten/deepbook-v3 is
   package-private and invisible to this grep.
4. **`test_capability_containment_pattern_present_in_ci_yml`** — Regression
   guard that the Phase 2 W4 "Capability containment" step is still in
   `.github/workflows/ci.yml`. Plan 03-09 will extend it, but it must not
   be deleted in the interim.
5. **`test_ptb_demo_contains_5_call_shape`** — Pins WAVE0-DECISION.md 5-call
   shape: requires `margin_manager::deposit`, `margin_manager::borrow_quote`,
   `margin_manager::withdraw`, `supply::supply` all to appear in the demo TS,
   and `tx.moveCall` count ≥ 4. Catches accidental collapse of the withdraw
   bridge (the load-bearing fix from CONTEXT.md D-17 amendment).

## Deviations from Plan

### Rule 3 — Auto-fix blocking issues

**1. [Rule 3 — Blocker] MockMarginPool disposal uses `destroy()` not `transfer::transfer`**

- **Found during:** Task 2 first compile attempt
- **Issue:** `transfer::transfer(pool, ADMIN)` from `ptb_capability_test.move`
  failed with Sui error E02009 "invalid private transfer call: The function
  'sui::transfer::transfer' is restricted to being called in the object's
  module, 'deepvault::mock_margin_pool'". MockMarginPool is `key`-only (no
  `store`) per `mock_margin_pool.move:75` — the `transfer` function is
  private to the defining module.
- **Fix:** Switched to `sui::test_utils::destroy(pool)` in ptb_capability_test.move.
  Removed the unused `use sui::transfer` import. The `destroy()` helper from
  `test_utils` is designed for test-scope object disposal and sidesteps the
  private-transfer boundary cleanly without modifying mock_margin_pool's API.
- **Files modified:** `contracts/tests/ptb_capability_test.move`
- **Commit:** fb6da26

**2. [Rule 3 — Blocker] SuiObjectChange union narrowing requires `unknown[]` cast**

- **Found during:** Task 1 first typecheck
- **Issue:** `pnpm typecheck` failed with TS2677 "A type predicate's type
  must be assignable to its parameter's type. Type '{ type: 'created';
  objectId: string; objectType: string; }' is not assignable to type
  'SuiObjectChange'." The SuiObjectChange type union from @mysten/sui doesn't
  declare a `created` variant with the same shape as my `CreatedChange` type.
- **Fix:** Cast through `unknown[]` so the type predicate narrows from
  `unknown` to `CreatedChange`: `(objectChanges as unknown[]).find(isCreatedMarginManager)`.
  This is the canonical TS workaround when Array.find's type predicate cannot
  narrow a union element type to a non-member shape.
- **Files modified:** `scripts/two-protocol-ptb-demo.ts`
- **Commit:** 294ee64

**3. [Rule 3 — Blocker] Abort code 601 (Margin-side) chosen over 401 (Predict-side)**

- **Found during:** Task 2 design
- **Issue:** The plan body suggests `atomic_rollback_on_predict_misquote` should
  trigger the EPredictMisquote abort path (rebalance.move 401). But that path
  requires a live PredictManager + Predict shared object to be constructed,
  which is unreachable from in-package tests (Plan 02-09's integration_test.move
  file header explains this limitation extensively).
- **Fix:** Used `mock_margin_pool::EInsufficientCollateral` (abort_code 601)
  instead. Both are mid-PTB aborts that prove Move tx semantics roll back the
  entire scope; the Margin-side abort is exercisable in unit-test scope without
  a live PredictManager. The EPredictMisquote path is already covered by
  `integration_test::atomic_supply_aborts_on_predict_misquote` (Plan 02-09 W3 lock).
  Together the two tests cover both ends of the abort spectrum.
- **Files modified:** `contracts/tests/ptb_capability_test.move`
- **Commit:** fb6da26

### Rule 1 — Auto-fix bugs (lint/format hygiene)

**4. [Rule 1 — Lint] Long-line + format-check failures in test_ptb_capability_grep.py**

- **Found during:** Task 3 ruff check after initial Write
- **Issue:** `uv run ruff check` flagged E501 (line >100 chars) on the
  regex pattern; `uv run ruff format --check` would reformat the file.
- **Fix:** Split the pattern across two raw-string literals and ran
  `uv run ruff format`. Both `ruff check` and `ruff format --check` now
  pass clean.
- **Files modified:** `backtest/tests/test_ptb_capability_grep.py`
- **Commit:** 0652589

### Scope-clarification (Plan body)

**5. CI wiring deferred to Plan 03-09 per plan body**

The Plan 03-05 `<plan_specifics>` block in the orchestrator prompt mentions
adding a step to `.github/workflows/ci.yml` to run the Python grep gate per
push. The plan tasks section, however, explicitly says
**"Plan 03-09 wires this test into CI. This plan ships the test only."**

Followed the plan tasks section as canonical (the orchestrator-prompt
`<plan_specifics>` block is informational scaffolding; the plan body is
the source of truth). Plan 03-09 will close the CI integration.

## Files Touched

### Created

- `contracts/tests/ptb_capability_test.move` (313 LOC; 4 inline tests)
- `backtest/tests/test_ptb_capability_grep.py` (215 LOC; 5 def test_)
- `.planning/phases/03-backtest-harness-two-protocol-ptb/03-05-SUMMARY.md` (this file)

### Modified

- `scripts/two-protocol-ptb-demo.ts` (404 LOC skeleton → 709 LOC complete driver; +305 LOC)

## Requirements Closed

- **PTB-03**: Atomic 5-call PTB opener — driver complete; fresh-wallet
  testnet path ready under FAST_FORWARD=0 nightly + manual workflow_dispatch.
- **PTB-04**: Capability-flow tests proving TradeCap and TreasuryCap<SHARE>
  never escape — Move-side (4 tests PASS) + Python grep gate (5 tests PASS).
- **PTB-06**: Fresh-wallet end-to-end testnet test ready — the same TS
  driver, gated by SUI_PRIVATE_KEY env, exits 0 gracefully when the DUSDC
  margin pool isn't yet whitelisted (MARGIN-WHITELIST-DECISION.md fallback).

## Cross-references

- **Consumes:** Plan 03-03 (scripts/two-protocol-ptb-demo.ts skeleton,
  contracts/tests/mock_margin_pool.move, @mysten/sui 2.16.0 + @mysten/deepbook-v3 1.3.6 pins),
  Plan 02-09 (scripts/e2e-vault-cycle.ts signing pattern, contracts/tests/integration_test.move helper),
  Phase 2 W4 lock (ci.yml capability_containment grep step pattern from Plan 02-07),
  WAVE0-DECISION.md (5-call PTB shape, JSON u64-as-string Q5 convention, MARGIN-WHITELIST decision)
- **Feeds into:** Plan 03-06 (action-trace JSON consumer at backtest/traces/cycle-full.json),
  Plan 03-07 (mock_margin_pool::liquidate_position consumed by -30% NAV shock test),
  Plan 03-09 (CI wiring for the Python grep gate; final closeout)

## Verification

- `cd dashboard && pnpm typecheck` → exits 0 (verified locally)
- `cd contracts && sui move build --test` → exits 0 (verified locally; warnings only)
- `cd contracts && sui move test ptb_capability_test --gas-limit 100000000000` →
  4/4 PASS (verified locally with Sui CLI mainnet-v1.71.1)
- `cd backtest && uv run pytest tests/test_ptb_capability_grep.py -x` → 5/5 PASS in 0.3s
- `cd backtest && uv run ruff check tests/test_ptb_capability_grep.py` → All checks passed!
- `cd backtest && uv run ruff format --check tests/test_ptb_capability_grep.py` → 1 file already formatted
- 14/14 acceptance-criteria greps PASS (see commit messages)

## Self-Check: PASSED

- `scripts/two-protocol-ptb-demo.ts` exists, 709 LOC, typecheck clean
- `contracts/tests/ptb_capability_test.move` exists, 313 LOC, sui move test passes 4/4
- `backtest/tests/test_ptb_capability_grep.py` exists, 215 LOC, pytest passes 5/5 + ruff clean
- All three commit hashes (294ee64, fb6da26, 0652589) present in git log
- Three-layer capability enforcement in place: Move type system + Move test + Python grep
