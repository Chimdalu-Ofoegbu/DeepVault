---
phase: 03-backtest-harness-two-protocol-ptb
plan: 03
subsystem: wave-1-track-a-ptb-skeleton-mock-margin-pool
tags: [phase-03, wave-1, track-a, ptb-skeleton, mock-margin-pool, capability-discipline, tdd, PTB-01, PTB-02]

requires:
  - .planning/phases/03-backtest-harness-two-protocol-ptb/03-CONTEXT.md (D-17 amended, D-18, D-19)
  - .planning/phases/03-backtest-harness-two-protocol-ptb/03-RESEARCH.md (Pattern 1, Pattern 4)
  - .planning/phases/03-backtest-harness-two-protocol-ptb/03-PATTERNS.md (e2e-vault-cycle.{ts,sh} + integration_test.move analogs)
  - .planning/phases/03-backtest-harness-two-protocol-ptb/WAVE0-DECISION.md (5-call PTB shape lock, SDK 1.3.6 pin, JSON u64-as-string convention)
  - .planning/phases/03-backtest-harness-two-protocol-ptb/MARGIN-WHITELIST-DECISION.md (UNDETERMINED-FALLBACK-TO-MOCK)
  - scripts/e2e-vault-cycle.ts (Plan 02-09 lineal analog)
  - scripts/e2e-vault-cycle.sh (Plan 02-09 lineal analog)
  - contracts/tests/integration_test.move (Plan 02-09 #[test_only] discipline)
  - contracts/sources/share.move (PendingTreasury capability-quarantine idiom)
  - contracts/tests/vault_test.move (TEST_QUOTE OTW)
  - scripts/deepbookv3/packages/deepbook_margin/sources/margin_manager.move (vendored, SHA 1159d79a)

provides:
  - scripts/two-protocol-ptb-demo.ts (5-call PTB skeleton, 404 LOC)
  - scripts/two-protocol-ptb-demo.sh (FAST_FORWARD-aware bash wrapper, 121 LOC)
  - contracts/tests/mock_margin_pool.move (test-only Margin trait surface, 398 LOC, 9 inline tests passing)
  - @mysten/sui@2.16.0 hoisted to root (peer dep for @mysten/deepbook-v3@1.3.6)
  - dashboard typecheck script (`pnpm typecheck`)

affects:
  - Plan 03-05 (capability-flow tests + complete PTB body — will fill setupBalanceManagerWithTradeCap / signAndExecute / extractAndAssertEvents)
  - Plan 03-07 (-30% NAV shock liquidation property test — builds on mock_margin_pool::liquidate_position)
  - dashboard/tsconfig.json (now includes ../scripts/two-protocol-ptb-demo.ts)
  - dashboard/package.json (typecheck script added)
  - package.json + pnpm-lock.yaml (@mysten/sui 2.16.0 + @types/node hoisted to root)

tech-stack:
  added:
    - "@mysten/sui@2.16.0 (exact, hoisted to root — peer dep for @mysten/deepbook-v3@1.3.6)"
    - "@types/node@^22.19.18 (hoisted to root for scripts/* TS type resolution)"
  patterns:
    - "Graceful-skip dispatch pattern (status check + early exit 0; mirrors scripts/e2e-vault-cycle.sh pre-deploy gate)"
    - "TypeName witness registry in mock margin pool (type_name::with_defining_ids<Collat>())"
    - "u128 intermediates for u64 * u64 / u64 LTV math (overflow-safe at 1e9 * 1e9 scale)"
    - "Capability discipline grep gate: zero public fn returns TradeCap/MockMarginPool by value outside new_for_testing"
    - "FAST_FORWARD dual-mode dispatch with non-strict sui move test filters (||) — wrapper survives partial-plan landing"

key-files:
  created:
    - scripts/two-protocol-ptb-demo.ts (404 LOC; 5-call PTB skeleton)
    - scripts/two-protocol-ptb-demo.sh (121 LOC; FAST_FORWARD bash wrapper)
    - contracts/tests/mock_margin_pool.move (398 LOC; test-only Margin trait surface + 9 inline tests)
    - .planning/phases/03-backtest-harness-two-protocol-ptb/03-03-SUMMARY.md (this file)
  modified:
    - dashboard/package.json (added typecheck script)
    - dashboard/tsconfig.json (include ../scripts/two-protocol-ptb-demo.ts)
    - package.json (added @mysten/sui 2.16.0, @types/node 22.19.18 at root)
    - pnpm-lock.yaml (lock entries for @mysten/sui 2.16.0 + transitive deps)

decisions:
  - "API surface drift: @mysten/sui@2.16.0 renamed SuiClient → SuiJsonRpcClient and getFullnodeUrl → getJsonRpcFullnodeUrl (now lives in /jsonRpc subpath). Skeleton uses the canonical 2.16.0 surface directly; existing scripts/e2e-vault-cycle.ts retains the legacy import names and will be migrated by Plan 03-05 when its SDK pin bumps in lockstep."
  - "@mysten/sui 2.16.0 hoisted to ROOT (not dashboard/) because TS modulepath resolution walks ancestors from the source file's actual location. scripts/two-protocol-ptb-demo.ts lives in scripts/, so its module lookup walks scripts/node_modules → repo-root/node_modules; only root-level installation makes the SDK reachable for both dashboard typecheck AND raw tsc invocations from elsewhere in the repo."
  - "Mock pool's collateral disposition: collateral coin is transferred to @0x0 (drop sink) rather than absorbed into pool reserves. Alternative (joining Balance<Collat> into Balance<Quote>) is type-incorrect. Plan 03-05 + 03-07 capability/liquidation tests do not depend on the destination of burned collat — only that the borrow returns Coin<Quote> and that liquidation reads back the recorded Position correctly."
  - "register_collateral_type is IDEMPOTENT (planner's choice per plan body). Second call against an already-registered Collat type is a no-op. EAlreadyRegistered (602) is RESERVED for a future strict-mode variant (abort_on_duplicate) but not used in v1; #[allow(unused_const)] suppresses the lint."
  - "Mock-pool error code range 600-699 — collision-free with vault (100-599), redeem (300-399), rebalance (400-499)."
  - "FAST_FORWARD=1 wrapper uses non-strict sui move test filters (|| true) so the wrapper survives the in-progress wave: mock_margin_pool ships now; ptb_capability_test lands in Plan 03-05; liquidation_test lands in Plan 03-07. Wrapper smoke-tested end-to-end: mock_margin_pool filter passes 9/9; the other two report 0 tests as expected."
  - "Dashboard typecheck gate (`pnpm typecheck` in dashboard/) is the canonical TS verification path post-this-plan; pre-this-plan it didn't exist (no typecheck script). Plan acceptance criterion #6 added the script in this plan."

metrics:
  duration: "~45min"
  completed: "2026-05-12"
  tasks: 3
  commits: 4  # Task 1 + Task 2 + 2 TDD pairs (test + feat) for Task 3
  files_created: 3
  files_modified: 4
---

# Phase 3 Plan 03: Wave 1 Track A — PTB Skeleton + Mock Margin Pool — Summary

Wave 1 / Track A foundation. Ships the structural skeletons that downstream Track A plans build on:
the demo PTB TypeScript scaffold (load-bearing for the live testnet 5-call PTB demo), the bash
wrapper (FAST_FORWARD dispatch for hermetic vs. live runs), and the test-only mock Margin pool
(VAULT_SHARE-as-collateral readiness proof per CONTEXT.md D-18 fallback policy).

## What Shipped

### PTB-01 skeleton: `scripts/two-protocol-ptb-demo.ts` (404 LOC)

5-call PTB skeleton per WAVE0-DECISION.md. The complete PTB body — signing,
`signAndExecuteTransaction` invocation, and event extraction — lands in Plan 03-05. This file ships:

- **Type imports** — `Transaction` from `@mysten/sui/transactions`, `SuiJsonRpcClient`+`getJsonRpcFullnodeUrl`
  from `@mysten/sui/jsonRpc`, `Ed25519Keypair` from `@mysten/sui/keypairs/ed25519`, plus a typed
  import from `@mysten/deepbook-v3` for SDK provenance.
- **DeployJson type augmentation** — Phase 2 fields verbatim from
  `scripts/e2e-vault-cycle.ts:37-50`, plus 11 new OPTIONAL Phase 3 Margin fields (`margin_pkg`,
  `margin_registry_id`, `btc_margin_pool_id`, `dusdc_margin_pool_id`, oracle/deepbook pool IDs,
  `btc_type_tag` and shared-version companions).
- **Constants** — `SUPPLY_AMOUNT_MICRO = 100_000_000n`, `COLLATERAL_AMOUNT_MICRO = 200_000_000_000n`
  (~0.002 BTC at 11 decimals), `BORROW_AMOUNT_MICRO = 100_000_000n` (100 DUSDC).
- **4 stub function signatures** — `setupBalanceManagerWithTradeCap()`, `buildPtb()`,
  `signAndExecute()`, `extractAndAssertEvents()`. `buildPtb()` is fully implemented (composes the
  five `tx.moveCall` invocations with correct typeArguments, sharedObjectRef shapes, and the
  Step-3 → Step-4 borrowedCoin bridge); the other three throw with a Plan-03-05 message.
- **5-call PTB body** — every moveCall target string and shared-object scaffolding present
  (15 grep matches against `margin_manager::deposit|borrow_quote|withdraw|vault::supply::supply`,
  acceptance criterion required ≥4). Inline cross-references to WAVE0-DECISION.md throughout
  (11 grep matches). Step 5 (D-18 hot-upgrade VAULT_SHARE re-deposit) is commented-out scaffolding.
- **`main()` graceful-skip dispatch** — two gates mirror `scripts/e2e-vault-cycle.sh:71-81`:
  (i) `deploy.status !== 'deployed'` → warning + exit 0; (ii) missing Margin pool IDs (D-18
  fallback path) → warning + exit 0 (Plan 03-05 will integration-test against
  `mock_margin_pool.move`).
- **JSON convention** — top-of-file comment block documents the u64-as-string emission rule
  per WAVE0-DECISION.md Q5; the skeleton's stubs will be wired in Plan 03-05.

### PTB-01/02 dispatcher: `scripts/two-protocol-ptb-demo.sh` (121 LOC)

FAST_FORWARD-aware bash wrapper, mirrors `scripts/e2e-vault-cycle.sh` per PATTERNS.md exact analog:

- **FAST_FORWARD=1 (default; per-push CI)** — runs three filtered `sui move test` invocations:
  `mock_margin_pool` (ships now), `ptb_capability_test` (Plan 03-05), `liquidation_test`
  (Plan 03-07). Non-strict mode (`|| true`-equivalent fallback message) so the wrapper survives
  the in-progress wave — mock_margin_pool passes immediately; the other two report 0 tests
  until their respective plans land.
- **FAST_FORWARD=0 (live testnet)** — reads `TESTNET-DEPLOY.json`, validates `status=='deployed'`
  AND Margin pool IDs filled (D-18 fallback gate). Pre-deploy state or missing Margin fields
  → warning + exit 0 (graceful skip). Otherwise invokes `npx tsx ../scripts/two-protocol-ptb-demo.ts`
  from the dashboard workspace.
- Executable bit set; `bash -n` syntax check passes; end-to-end FAST_FORWARD=1 run validated.

### PTB-02 fallback: `contracts/tests/mock_margin_pool.move` (398 LOC, 9 tests)

Test-only minimal Margin trait surface per CONTEXT.md D-18 + WAVE0-DECISION.md fallback policy
(MARGIN-WHITELIST-DECISION = UNDETERMINED-FALLBACK-TO-MOCK; DUSDC margin pool not deployed on
testnet at spike time):

- **Module discipline** — `#[test_only]` attribute, lives in `contracts/tests/` (NOT
  `sources/`), so the mock cannot leak into production builds.
- **Structs** — `MockMarginPool<phantom Quote> has key` (NO `store` — prevents nesting into
  Vault fields), `Position has store, drop` (internal bookkeeping).
- **Public API (3 functions, all `public fun`)**:
  - `register_collateral_type<Quote, Collat>()` — idempotent registration via
    `type_name::with_defining_ids<Collat>()`.
  - `borrow_quote_against_collateral<Quote, Collat>()` — asserts Collat is registered, computes
    max_loan via `collat_value * nav / NAV_SCALE * MARGIN_LTV_CAP_BPS / 10_000` (u128
    intermediates protect 1e9 * 1e9 multiplies), records Position, RETURNS Coin<Quote> from
    reserves. Unlike production Margin::borrow_quote (auto-deposits), the mock returns the
    coin so the 5-call PTB bridge step is exercisable in tests.
  - `liquidate_position<Quote, Collat>()` — reads Position, scales `collateral_value_at_open`
    by current NAV, compares `risk_ratio_bps` against `LIQUIDATION_LTV_BPS = 11_500` (1.15
    risk ratio per Margin docs). Aborts `ENotLiquidatable` when healthy; returns the
    `risk_ratio_bps` u64 signal when underwater.
- **Test helpers (test-only)**: `new_for_testing<Quote>()`, `deposit_reserves_for_testing<Quote>()`.
- **Error codes** — range 600-699, collision-free with vault (100-599), redeem (300-399),
  rebalance (400-499). 5 codes: `ENotRegistered`, `EInsufficientCollateral`, `EAlreadyRegistered`
  (reserved for future strict-mode variant — `#[allow(unused_const)]`), `ENotLiquidatable`,
  `ENoPosition`.
- **Constants** — `LIQUIDATION_LTV_BPS = 11_500`, `MARGIN_LTV_CAP_BPS = 5_000` (50% LTV cap),
  `NAV_SCALE = 1_000_000_000` (1e9; matches `strategy_constants::nav_scale()`).
- **9 inline `#[test]` functions** — pool ctor (1 happy), register (2: add + idempotency),
  borrow (3: happy + 2 abort variants), liquidate (3: healthy abort, underwater happy, no-position
  abort). ALL PASS in GREEN phase.

### Workspace plumbing

- **`@mysten/sui@2.16.0` hoisted to root** — required to satisfy peer dep for
  `@mysten/deepbook-v3@1.3.6` (Plan 03-01 left this as a documented-future warning;
  this plan resolves it because TS imports in `scripts/two-protocol-ptb-demo.ts` need real
  type definitions).
- **`@types/node` hoisted to root** — required for scripts/* `node:fs` / `node:path` /
  `process` global resolution at the repo-root tsc invocation site.
- **`dashboard/tsconfig.json` include `../scripts/two-protocol-ptb-demo.ts`** — drives the
  `pnpm typecheck` gate against the new skeleton.
- **`dashboard/package.json` add `typecheck` script** — pre-this-plan, the dashboard had no
  typecheck script; acceptance criterion #6 required `cd dashboard && pnpm typecheck` to exit 0.

## Test Results

### `sui move test mock_margin_pool` (FAST_FORWARD=1 path)

```
[ PASS ] deepvault::mock_margin_pool::borrow_aborts_when_collateral_type_unregistered
[ PASS ] deepvault::mock_margin_pool::borrow_aborts_when_loan_exceeds_max_loan
[ PASS ] deepvault::mock_margin_pool::borrow_quote_against_collateral_returns_coin_when_registered
[ PASS ] deepvault::mock_margin_pool::liquidate_aborts_when_no_position_exists
[ PASS ] deepvault::mock_margin_pool::liquidate_aborts_when_position_healthy
[ PASS ] deepvault::mock_margin_pool::liquidate_returns_ratio_when_position_underwater
[ PASS ] deepvault::mock_margin_pool::new_for_testing_creates_empty_pool
[ PASS ] deepvault::mock_margin_pool::register_collateral_type_adds_type_witness
[ PASS ] deepvault::mock_margin_pool::register_collateral_type_is_idempotent
Test result: OK. Total tests: 9; passed: 9; failed: 0
```

### Full repo test regression: 95/95 PASS

```
Test result: OK. Total tests: 95; passed: 95; failed: 0
```

### `cd dashboard && pnpm typecheck`: exit 0

```
> @deepvault/dashboard@0.0.0 typecheck
> tsc --noEmit
[silent success]
```

### `bash -n scripts/two-protocol-ptb-demo.sh`: syntax OK; `FAST_FORWARD=1` end-to-end run: ALL filters complete

```
==> Running Move mock_margin_pool + ptb_capability_test + liquidation_test (hermetic)...
[mock_margin_pool] 9 tests pass
[ptb_capability_test] 0 tests (Plan 03-05)
[liquidation_test] 0 tests (Plan 03-07)
==> Hermetic Track A tests complete.
```

## Capability Discipline Verification

Per CONTEXT.md D-19 (TradeCap stays in BalanceManager; capability never escapes), the planner's
critical grep gate:

```bash
grep -nE 'public fun .*: &?(mut )?TradeCap' contracts/tests/mock_margin_pool.move | wc -l
# 0
```

Zero matches — no public function in `mock_margin_pool.move` returns `TradeCap` by value or
reference outside the test-only constructor. The mock pool itself never holds a TradeCap (it's
a simplified borrow surface that operates directly on `Coin<Collat>` inputs); production Margin
sees its TradeCap quarantined inside `MarginManager::wrapped_balance_manager` per the
margin_manager.move source. Plan 03-05's `ptb_capability_test.move` will extend this grep gate
to cover the full demo PTB driver.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Missing dep] `@mysten/sui` not installed at workspace root**

- **Found during:** Task 1 typecheck attempt.
- **Issue:** Plan 03-01 documented "Plan 03-05 will resolve via `@mysten/sui@2.16.0+`
  upgrade in lockstep" — but Task 1's acceptance criterion required
  `cd dashboard && pnpm typecheck` to exit 0, which is impossible without `@mysten/sui`
  installed. Module resolution from `scripts/two-protocol-ptb-demo.ts` walks ancestors
  from the file's actual location (scripts/), so installation in `dashboard/node_modules`
  alone wasn't sufficient — TS couldn't reach the SDK from the script's vantage point.
- **Fix:** Hoisted `@mysten/sui@2.16.0` and `@types/node@^22.19.18` to root `package.json`
  via `pnpm add -w --save-exact`. Resolves the peer-dep warning logged in Plan 03-01 too.
- **Files modified:** `package.json`, `pnpm-lock.yaml`, `dashboard/package.json` (auto-tidied
  by pnpm), `dashboard/tsconfig.json` (added `../scripts/two-protocol-ptb-demo.ts` to include).
- **Commit:** deb1b36 (combined with Task 1).

**2. [Rule 2 - Missing critical functionality] Dashboard `pnpm typecheck` script absent**

- **Found during:** Task 1 typecheck attempt.
- **Issue:** Acceptance criterion #6 references `cd dashboard && pnpm typecheck` but
  `dashboard/package.json` had no `typecheck` script.
- **Fix:** Added `"typecheck": "tsc --noEmit"` to `dashboard/package.json`.
- **Commit:** deb1b36 (combined with Task 1).

**3. [Rule 1 - API drift] `@mysten/sui@2.16.0` renamed `SuiClient` → `SuiJsonRpcClient` and `getFullnodeUrl` → `getJsonRpcFullnodeUrl`**

- **Found during:** Task 1 typecheck.
- **Issue:** Existing `scripts/e2e-vault-cycle.ts` uses the legacy import names (`SuiClient`,
  `getFullnodeUrl` from `@mysten/sui/client`). These no longer exist in 2.16.0 — they were
  renamed and relocated to `@mysten/sui/jsonRpc`.
- **Fix:** New skeleton uses the canonical 2.16.0 surface directly
  (`import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc'`).
  `scripts/e2e-vault-cycle.ts` remains on the legacy names — Plan 03-05 will migrate it
  when it bumps its own SDK pin in lockstep.
- **Files modified:** Inline in `scripts/two-protocol-ptb-demo.ts`.
- **Commit:** deb1b36 (combined with Task 1).

**4. [Rule 1 - Type error] Mock pool collateral disposition**

- **Found during:** Task 3 GREEN-phase build.
- **Issue:** First implementation attempted `balance::join(&mut pool.quote_reserves,
  coin::into_balance(collateral))` — type-incorrect because `quote_reserves: Balance<Quote>`
  cannot accept `Balance<Collat>`.
- **Fix:** Drop collateral via `transfer::public_transfer(collateral, @0x0)`. Test-only;
  production Margin would track collateral in BalanceManager. Plan 03-05/07 tests do not
  depend on collateral destination — only on the returned `Coin<Quote>` and the recorded
  Position state for liquidation.
- **Commit:** 10843e6 (GREEN phase).

### Architectural Deviations Requested

None.

### Auth Gates Encountered

None — this plan is fully hermetic.

## Known Stubs

The following are intentional skeleton stubs in `scripts/two-protocol-ptb-demo.ts`; Plan 03-05
will fill bodies. None block the v1 goal of Plan 03-03 (skeleton + types + grep-locked PTB shape):

- `setupBalanceManagerWithTradeCap(client, keypair, deploy)` — throws "body lands in Plan 03-05"
- `signAndExecute(client, keypair, tx)` — throws "body lands in Plan 03-05"
- `extractAndAssertEvents(events)` — throws "body lands in Plan 03-05"

The `buildPtb()` function IS fully wired (5 moveCalls composed with correct typeArgs and
sharedObjectRef shapes); only the I/O-bearing functions are stubbed.

## Threat Surface Scan

Per the plan's `<threat_model>`:

- **T-03-09 (capability containment)** — mitigated via grep gate; zero matches against
  `public fun .*: TradeCap` or `: &mut MockMarginPool` (outside test-only `new_for_testing`).
- **T-03-10 (PTB shape drift)** — mitigated; all 4 moveCall targets (`margin_manager::deposit`,
  `borrow_quote`, `withdraw`, `vault::supply::supply`) are grep-locked in the skeleton; 11
  inline WAVE0-DECISION.md citations enforce the canonical shape.
- **T-03-11 (testnet RPC information disclosure)** — accepted; public testnet endpoint only.

No new threat surface introduced by this plan that is not covered in the plan's `<threat_model>`.

## TDD Gate Compliance

Plan body for Task 3 declared `tdd="true"`. RED → GREEN sequence executed cleanly:

- **RED commit (d7404fe)**: `test(03-03): add failing mock_margin_pool test stubs (RED)` —
  9 inline tests; all three public functions abort 999. Confirmed 8/9 tests fail
  (the 9th — `new_for_testing_creates_empty_pool` — passes because the constructor was
  implemented up-front; this is allowed per the plan body's "Step 1. RED" instruction
  which only stubs the three public bodies).
- **GREEN commit (10843e6)**: `feat(03-03): implement mock_margin_pool test-only Move module (GREEN)` —
  bodies filled; all 9 tests now pass. No REFACTOR commit needed (impl is minimal and
  readable; further cleanup is on Plans 03-05/07's path when they exercise the surface).

Tasks 1 and 2 were not TDD (skeleton + bash wrapper); their commits use `feat(03-03):` prefix.

## Self-Check

Files claimed to exist:

- `scripts/two-protocol-ptb-demo.ts` — FOUND
- `scripts/two-protocol-ptb-demo.sh` — FOUND (executable bit set)
- `contracts/tests/mock_margin_pool.move` — FOUND
- `dashboard/package.json` — modified (typecheck script + tidied deps)
- `dashboard/tsconfig.json` — modified (include scripts/* path)
- `package.json` — modified (@mysten/sui + @types/node hoisted)
- `pnpm-lock.yaml` — modified (lock entries for SDK + transitives)

Commits claimed to exist (verified via `git log --oneline -4`):

- `10843e6 feat(03-03): implement mock_margin_pool test-only Move module (GREEN)` — FOUND
- `d7404fe test(03-03): add failing mock_margin_pool test stubs (RED)` — FOUND
- `3bf10ae feat(03-03): add two-protocol-ptb-demo.sh FAST_FORWARD wrapper` — FOUND
- `deb1b36 feat(03-03): add two-protocol-ptb-demo.ts skeleton + hoist @mysten/sui 2.16.0` — FOUND

## Self-Check: PASSED

All claimed artifacts and commits verified present on the master branch.
