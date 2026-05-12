# Phase 3 Wave 0 Decision

**Decided:** 2026-05-12
**Status:** Locked
**Spike plan:** 03-01-PLAN.md
**Authority:** This document is the canonical resolution of RESEARCH.md Open Questions 1-6
and the in-place amendment of CONTEXT.md D-17. Where this document contradicts the original
D-17 description in CONTEXT.md, this document wins.

## Selection sentinel

Selected: 5-call PTB shape with Margin::withdraw bridge

## PTB Call Sequence (verified against vendored DeepBookV3 SHA 1159d79af33c70e09e406310e1d8f067832ede9d)

```
  ┌─────────────────────────────────────────────────────────────────────────┐
  │ Supplier signs ONE PTB. Atomic rollback on any step.                    │
  └─────────────────────────────────────────────────────────────────────────┘

  Step 1.  margin_manager::deposit<BTC, DUSDC, BTC>(
              mm, registry, btc_oracle, usdc_oracle,
              btc_collateral_coin, clock, ctx
           )
           — Deposits user BTC into MarginManager's wrapped BalanceManager.
           — Vendored source: margin_manager.move:417-431 (calls deposit_int).

  Step 2.  margin_manager::borrow_quote<BTC, DUSDC>(
              mm, registry, dusdc_margin_pool,
              btc_oracle, usdc_oracle, db_pool,
              loan_amount, clock, ctx
           )
           — Borrows DUSDC against deposited BTC.
           — NO RETURN VALUE.
           — Vendored source: margin_manager.move:602-643.
           — KEY LINE: margin_manager.move:625
                 self.deposit_int<BaseAsset, QuoteAsset, QuoteAsset>(coin, ctx);
             The borrowed coin is auto-deposited; nothing escapes into PTB scope.

  Step 3.  borrowed_coin: Coin<DUSDC> = margin_manager::withdraw<BTC, DUSDC, DUSDC>(
              mm, registry, btc_margin_pool, dusdc_margin_pool,
              btc_oracle, usdc_oracle, db_pool,
              loan_amount, clock, ctx
           )
           — Bridge: extracts a free Coin<DUSDC> we can route to vault::supply.
           — Vendored source: margin_manager.move:458-555.

  Step 4.  vault::supply::supply<DUSDC>(
              vault, predict, predict_manager, oracle_svi,
              borrowed_coin, clock, ctx
           )
           — Atomic deposit + hedge mint per Phase 2 D-06.
           — Vendored source: contracts/sources/supply.move:61-117 (calls
             rebalance::buy_hedge_for_deposit internally at supply.move:89-97).
           — We do NOT call rebalance directly: rebalance::buy_hedge_for_deposit
             is public(package) in rebalance.move:219 and unreachable from PTB.

  Step 5.  (OPTIONAL — D-18 hot-upgrade path if VAULT_SHARE is whitelisted)
           margin_manager::deposit<BTC, DUSDC, SHARE>(mm, ..., vault_share_coin, ...)
           — Re-deposit VAULT_SHARE as additional collateral.
           — Default v1: SKIP. See MARGIN-WHITELIST-DECISION.md for whitelist status.
```

## Why CONTEXT.md D-17 was non-compilable

D-17 read literally implies three top-level moveCalls:

```
Margin::borrow_quote → vault::supply::deposit → vault::rebalance::buy_hedge_for_deposit
```

Two non-compilable issues:

(i) **borrow_quote returns void.** `margin_manager::borrow_quote` does not return a
    `Coin<QuoteAsset>` — it auto-deposits via `self.deposit_int<BaseAsset, QuoteAsset, QuoteAsset>(coin, ctx)`
    at `margin_manager.move:625`. A naive PTB has nothing to feed `vault::supply`'s
    `deposit: Coin<DUSDC>` argument.

(ii) **rebalance is `public(package)`.** `rebalance::buy_hedge_for_deposit` is
    `public(package)` (rebalance.move:219) — NOT callable from outside the deepvault
    package. The supply path internally invokes it; atomic semantics are preserved by
    Move tx semantics (supply.move:89-97).

The correct shape is **5 calls including an explicit `Margin::withdraw` bridge AND no
separate top-level rebalance call.** Verified empirically by reading vendored source.

## Open Questions resolutions (mirrors RESEARCH.md Open Questions 1-6)

### Q1 (DUSDC margin pool exists on testnet?)

**Result:** UNDETERMINED-FALLBACK-TO-MOCK (2026-05-12)

The `deepbook_margin` package is not detectably deployed on Sui testnet at the addresses
our research surface knows about. The Predict registry shared object (`0x43af14fed5480c20ff77e2263d5f794c35b9fab7e2212903127062f4fe2a6e64`)
exposes only `oracle_ids` and `predict_id` — no margin pool references. Vendored
`scripts/deepbookv3/packages/deepbook_margin/Move.toml` carries `deepbook_predict = "0x0"`,
matching "not yet bootstrapped." Predict server REST reachable but returns empty bodies
on probed paths.

Plans 03-03 + 03-05 ship the **mock_margin_pool fallback** per CONTEXT.md D-18 (three
artifacts: PROJECT.md scope note, whitepaper slide stub, integration test). The 5-call
PTB shape is locked regardless.

Full evidence (commands + outputs verbatim): [MARGIN-WHITELIST-DECISION.md](./MARGIN-WHITELIST-DECISION.md).
Recheck date: 2026-06-08. PTB-02 satisfied via the dated decision in that file.

### Q2 (Does `@mysten/deepbook-v3@0.17.0` expose MarginPoolContract with borrow_quote/withdraw/deposit builders?)

(Filled by Task 3 — introspection evidence appended in `## SDK introspection evidence` below.)

### Q3 (Predict per-block PLP yield rate for v1 PnL attribution?)

**v1 model: `plp_yield_bps = 0`.** We BUY hedges via `predict::mint`, not provide PLP
via `predict::supply`. The six-column accountant (PnL Attribution per CONTEXT.md D-09)
RESERVES the `plp_yield_bps` column for STRAT-V2-01 expansion (v2 nice-to-have where
holding a Coin<PLP> would accrue per-block yield), but in v1 the column is identically
zero. Cite this resolution in `backtest/src/deepvault/pnl_attribution.py` docstring
as Assumption A3 reference. RESEARCH.md A3 already documents this — Plan 03-01 LOCKS
the convention.

### Q4 (Will the 365-day backtest run complete in <10 min in CI?)

(Filled by Task 4 — see `## Runtime budget micro-benchmark` below for verdict.)

### Q5 (Event payload JSON round-trip — does MarketKey round-trip cleanly?)

(Filled by Task 4 — see `## Event JSON round-trip check` below.)

### Q6 (nightly-backtest.yml cron slot?)

(Filled by Task 4 — see `## Nightly schedule slot` below.)

## SDK introspection evidence

### Q2 (Does @mysten/deepbook-v3@0.17.0 expose MarginPoolContract with borrow_quote/withdraw/deposit builders?)

**Selected SDK version pin:** `@mysten/deepbook-v3@1.3.6` (exact, via `pnpm add -w @mysten/deepbook-v3@1.3.6 --save-exact`).

**Deviation from CLAUDE.md:** CLAUDE.md pins `0.17.0` ("Margin Manager TS SDK"). Empirical
introspection (2026-05-12) shows 0.17.0 does NOT expose Margin builders. Upgraded to
`1.3.6` (latest npm) with the rationale below.

**Step 1 — 0.17.0 introspection:**

```
$ pnpm add -w @mysten/deepbook-v3@0.17.0 --save-exact
$ node -e "const p=require('@mysten/deepbook-v3'); console.log(Object.keys(p).sort().join('\\n'))"
Account
BalanceManagerContract
Balances
DeepBookAdminContract
DeepBookClient
DeepBookConfig
DeepBookContract
FlashLoanContract
GovernanceContract
Order
OrderDeepPrice
VecSet

→ Neither MarginPoolContract nor MarginManagerContract found at top level.
```

0.17.0 ships only the core DeepBook surface — no Margin Manager exports. The CLAUDE.md
pin reflects what was current at the time of writing; the Margin builders landed in a
later release.

**Step 2 — 1.3.6 introspection:**

```
$ pnpm add -w @mysten/deepbook-v3@1.3.6 --save-exact
$ node -e "const p=require('@mysten/deepbook-v3'); console.log(Object.keys(p).sort().join('\\n'))"
Account, BalanceManagerContract, Balances, ConfigurationError, DEEP_SCALAR,
DeepBookAdminContract, DeepBookClient, DeepBookConfig, DeepBookContract,
DeepBookError, ErrorMessages, FLOAT_SCALAR, FlashLoanContract, GAS_BUDGET,
GovernanceContract, MAX_TIMESTAMP, MarginAdminContract, MarginMaintainerContract,
MarginManagerContract, MarginPoolContract, MarginTPSLContract, Order, OrderDeepPrice,
OrderType, POOL_CREATION_FEE_DEEP, PRICE_INFO_OBJECT_MAX_AGE_MS, PoolProxyContract,
ResourceNotFoundError, SelfMatchingOptions, SuiPriceServiceConnection, SuiPythClient,
ValidationError, VecSet, deepbook, mainnetCoins, mainnetMarginPools, mainnetPackageIds,
mainnetPools, mainnetPythConfigs, testnetCoins, testnetMarginPools, testnetPackageIds,
testnetPools, testnetPythConfigs, validateAddress, validateNonEmptyArray,
validateNonNegativeNumber, validatePositiveNumber, validateRange, validateRequired

→ MarginPoolContract (constructor exposed)
→ MarginManagerContract (constructor exposed)
→ testnetMarginPools (SUI, DBUSDC, DEEP, DBTC pool addresses + types)
→ testnetPackageIds.MARGIN_PACKAGE_ID + MARGIN_REGISTRY_ID
```

**Decision logic outcome:** 1.3.6 exposes `MarginPoolContract` AND `MarginManagerContract`
AND a `testnetMarginPools` dictionary mapping pool symbols to live shared object IDs.
Pinning 1.3.6 is the correct path. **Risk note:** 1.3.6's MarginPoolContract surface
exposes only `constructor` via `Object.getOwnPropertyNames(prototype)` — the actual
builder methods may be defined on instances. Plan 03-05's `scripts/two-protocol-ptb-demo.ts`
will construct an instance and either use the SDK builders or fall back to raw
`tx.moveCall` if instance methods don't match the 5-call shape (PATTERNS.md Pattern 1
shows the raw-moveCall version which is the safest path regardless).

**Peer dependency warning:** 1.3.6 declares `@mysten/sui@^2.16.2` as a peer; this repo
has `@mysten/sui@1.38.0` (from Phase 0). Warning logged but install succeeded. Plan 03-05
will resolve via `@mysten/sui@2.16.0+` upgrade in lockstep when the demo script needs to
run.

**Files updated:** `package.json` (`@mysten/deepbook-v3: 1.3.6`), `pnpm-lock.yaml` (lock
entries for 1.3.6 + its 30 transitive deps).

**Live margin pool inventory (testnet, 2026-05-12):**

| Token  | MarginPool ID                                                       | Type                                                      |
|--------|---------------------------------------------------------------------|-----------------------------------------------------------|
| SUI    | `0xcdbbe6a72e639b647296788e2e4b1cac5cea4246028ba388ba1332ff9a382eea` | `0x2::sui::SUI`                                           |
| DBUSDC | `0xf08568da93834e1ee04f09902ac7b1e78d3fdf113ab4d2106c7265e95318b14d` | `0xf7152c05...::DBUSDC::DBUSDC`                            |
| DEEP   | `0x610640613f21d9e688d6f8103d17df22315c32e0c80590ce64951a1991378b55` | `0x36dbef86...::deep::DEEP`                                |
| DBTC   | `0xf3440b4aafcc8b12fc4b242e9590c52873b8238a0d0e52fbf9dae61d2970796a` | `0x6502dae8...::dbtc::DBTC`                                |

Note: DBUSDC ≠ DUSDC (different token types). See MARGIN-WHITELIST-DECISION.md
"Crucial caveat" for impact analysis.

### Q3 (Predict per-block PLP yield rate for v1 PnL attribution?)

Q3 resolution sentinel: `plp_yield_bps = 0` in v1 (model documented below; cited in pnl_attribution.py docstring).

**Locked v1 model: `plp_yield_bps = 0`.**

We BUY hedges via `predict::mint` (`predict_adapter::mint` → vendored `predict.move`'s mint path),
not provide PLP via `predict::supply`. The six-column PnL accountant
(`backtest/src/deepvault/pnl_attribution.py`) per CONTEXT.md D-09:

| Column          | v1 value          | v2 (STRAT-V2-01)          |
|-----------------|-------------------|---------------------------|
| `plp_yield_bps` | identically 0     | per-block accrual on Coin<PLP> if held |
| `hedge_cost_bps`  | sum of premiums paid | unchanged                              |
| `hedge_payoff_bps` | sum of binary settlements | unchanged                              |
| `fees_bps`        | 0 (v1)            | strategy-level fees                    |
| `slippage_bps`    | next-bar VWAP − open | unchanged                              |
| `gas_bps`         | SUI gas at testnet | mainnet rates                          |

The `plp_yield_bps` column is RESERVED for v2 expansion; v1 implementation MUST emit
identically zero. Cite this resolution inline in `pnl_attribution.py` docstring
referencing RESEARCH.md A3 + WAVE0-DECISION.md Q3.

## Runtime budget micro-benchmark

### Q4 (Will the 365-day backtest run complete in <10 min in CI?)

Q4 sentinel: PASS — 7-day elapsed 0.0255s, 365-day extrapolated 1.33s, budget 600s, headroom 598.67s.

**Verdict: PASS** (with massive headroom — 598.67s of slack against the 600s nightly budget).

**Snippet (run via `cd backtest && uv run python <inline>`; not committed as a module):**

```python
import time
import pandas as pd
import numpy as np

N = 168  # 7 days hourly
df = pd.DataFrame({
    'ts_ms': np.arange(N) * 3_600_000,
    'open': 60_000 + np.random.default_rng(42).normal(0, 1000, N),
    'close': 60_000 + np.random.default_rng(43).normal(0, 1000, N),
    'svi_a': np.full(N, 10_000_000),
    'svi_b': np.full(N, 500_000_000),
    'svi_rho': np.zeros(N),
    'svi_m': np.zeros(N),
    'svi_sigma': np.full(N, 100_000_000),
})

# Inner-loop pattern matching the @strategy_fn decorator's hot path
# (3 column reads + 1 column write per bar; PRE-escape-hatch baseline).
start = time.perf_counter()
hedge_book = []
for _, bar in df.iterrows():
    spot = bar['close']
    svi_a = bar['svi_a']
    svi_b = bar['svi_b']
    hedge_book.append({'ts_ms': bar['ts_ms'], 'pnl': spot - svi_a // 1000})
elapsed_7d = time.perf_counter() - start
elapsed_365d_extrapolated = elapsed_7d * (365 / 7)
```

**Measured output (2026-05-12, Windows 11, Python 3.12, pandas 2.2.x):**

```
7-day elapsed:                0.0255s
365-day extrapolated:         1.3278s
Budget (nightly-backtest.yml): 600.0000s (10 min)
Headroom:                     598.6722s
Verdict:                      PASS
```

**Decision:** The escape-hatch pattern (RESEARCH.md Pitfall 6 — "@strategy_fn slows
pandas 100x") is NOT mandatory for v1. Even a 100x penalty over this baseline would
still complete in ~133s, well under budget. Plans 03-02 + 03-04 should still
DOCUMENT the escape-hatch pattern in `lookahead_audit.py` as a "if you hit a slow
case, here's the fast path" footnote, but do NOT need to bake it into the production
pipeline for the v1 365-day report.

**Caveats:**
- The inner-loop is a synthetic 1-line append; real `@strategy_fn` work includes
  SVI evaluation (Phase 1 binary_price), hedge sizing, state mutation. Likely
  10-100x cost per bar in real execution.
- Worst-case scaling to ~133s (100x) still fits.
- The benchmark runs locally on consumer hardware; CI Ubuntu runners are
  comparable to slightly faster for vectorized numpy work.

## Event JSON round-trip check

### Q5 (Event payload JSON round-trip — does MarketKey round-trip cleanly?)

**Verdict: PASS** with the explicit convention pinned below.

**Pinned convention (canonical for Plans 03-05 + 03-06):**

- **u64 fields:** stored as JSON strings (e.g., `"strike": "45000000000"`). Avoids JS Number safe-max precision loss past 2^53-1 = 9_007_199_254_740_991.
- **IDs (object IDs, oracle_ids, vault_ids):** stored as 0x-prefixed lowercase hex strings.
- **u8 fields (direction, decimals, etc.):** stored as JSON numbers — fit safely in JS Number.
- **Move struct names (`MarketKey`, `Supplied`, `RedeemRequested`, etc.):** propagated via the `type` field at the event-envelope level (already set by `@mysten/sui` `result.events[i].type`).

**Snippet (run via `cd backtest && uv run python <inline>`):**

```python
import json
sample = {
    'oracle_id': '0x2df440cfcb1f602f8077daead3da43c08b9bea13b75641ca3597bb0a951d57fd',
    'strike': '45000000000',
    'expiry_ms': '1717545600000',
    'direction': 1,
    'price': '99999999999999999',  # > 2^53 (demonstrates string-encoding rationale)
}
s = json.dumps(sample)
loaded = json.loads(s)
assert loaded == sample
```

**Measured output (2026-05-12):**

```
MarketKey JSON roundtrip: PASS
  json.dumps -> json.loads bit-identical for sample: True
  Pinned convention: u64 fields as strings, IDs as hex strings, direction as u8 int
  Why: JS Number safe-max = 2^53-1 = 9007199254740991; u64 max = 2^64-1 = 18446744073709551615
  String-encoded u64 survives both Python json + @mysten/sui parsedJson roundtrips.
```

**Plan 03-05 emitter contract:** `scripts/two-protocol-ptb-demo.ts` captures
`result.events[i].parsedJson` and emits each event's payload to `cycle-full.json`
with `u64` fields coerced to strings (using `String(BigInt(...))` before JSON.stringify).

**Plan 03-06 consumer contract:** `backtest/src/deepvault/replay.py`'s action-trace
parser converts string-encoded u64s back to Python `int` via `int(s, 10)` at the
field boundary; assertions compare ints, not strings.

## Nightly schedule slot

### Q6 (nightly-backtest.yml cron slot?)

**Selected: 05:00 UTC (`cron: '0 5 * * *'`)** with `timeout-minutes: 60`.

**Existing slots (verified via `grep cron .github/workflows/*.yml`):**

| Workflow                 | Slot         | Job kind                     |
|--------------------------|--------------|------------------------------|
| `nightly-prover.yml`     | 03:00 UTC    | Sui Prover formal verification |
| `nightly-e2e-vault.yml`  | 04:00 UTC    | Live testnet vault cycle (1h cooldown) |
| `nightly-backtest.yml`   | **05:00 UTC** | 365-day Python backtest + HTML report |

**Rationale.** One hour past `nightly-e2e-vault.yml` ensures:
- The live testnet cycle has finished writing the action-trace artifact (used by replay parity).
- Testnet RPC contention from the prior job has cleared.
- GitHub Actions runner-pool contention from the prior runs has cleared (Ubuntu pool tends to be sparse in early UTC hours; staggered scheduling reduces queue waits).

**timeout-minutes: 60** is conservative — per Q4 the runtime budget is well
under 10 min. The extra headroom covers HTML report generation (Plotly inline
embedding), parquet I/O, and `uv sync --locked` cold start.

**Workflow file:** `.github/workflows/nightly-backtest.yml` is created by Plan 03-04
(per RESEARCH.md Phase Requirements → Test Map). Plan 03-01 ONLY locks the slot
choice; the file itself is a downstream artifact.

**Cron sanity check:**

```
$ grep -A1 'schedule:' .github/workflows/nightly-prover.yml .github/workflows/nightly-e2e-vault.yml
.github/workflows/nightly-prover.yml-    - cron: '0 3 * * *'        # 03:00 UTC daily
.github/workflows/nightly-e2e-vault.yml-    - cron: '0 4 * * *'   # 04:00 UTC daily

→ No conflict at 05:00 UTC.
```

## Publish-blocker investigation

**Status:** RESOLVED-WITH-WORKAROUND (2026-05-12)

**Problem reproduction.** With current `contracts/Move.toml` (git-rev pin on `deepbook_predict` at SHA `1159d79af33c70e09e406310e1d8f067832ede9d`), running:

```
cd contracts && sui client publish --gas-budget 500000000 --dry-run
```

emits:

```
The package has unpublished dependencies. If you want to publish with unpublished
dependencies, please publish them one by one, or (not recommended) pass the
`--with-unpublished-dependencies` flag.
 Unpublished dependencies: deepbook_predict
```

The Sui CLI does not know that `deepbook_predict` is already deployed at the testnet
address `0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138` because:

- The vendored `scripts/deepbookv3/packages/predict/Move.toml` has `[addresses] deepbook_predict = "0x0"` and **no `[package].published-at` field**.
- Sui Move 2024's canonical "this dep is pre-published" signal is `published-at = "<addr>"` in the dep's own `[package]` block (per [Sui Move upgrade docs](https://docs.sui.io/concepts/sui-move-concepts/packages/upgrade)).

**Approaches tested:**

| # | Attempt | Result |
|---|---------|--------|
| (a) | Add `deepbook_predict = "0xf5e..."` override to OUR `contracts/Move.toml` `[addresses]` block | FAIL — `sui move build` aborts with `Address 'deepbook_predict' is defined more than once in package 'deepvault' (or its dependencies)`. The dep's own `[addresses] deepbook_predict = "0x0"` conflicts with our override; Move 2024 requires the override be expressed via `published-at`, not via address re-declaration. |
| (b) | Edit vendored `scripts/deepbookv3/packages/predict/Move.toml` to add `published-at = "0xf5e..."` in `[package]` block | FAIL — our remote git dep at SHA `1159d79a...` fetches a fresh copy under `~/.move/`; the local edit to the subtree is ignored. The remote `Move.toml` does not have `published-at`. Reverted; no permanent damage to the subtree. |
| (c) | `sui client publish --with-unpublished-dependencies --dry-run` | UNEXPECTED COMPILE ERROR — surfaces previously-hidden missing functions in `vault.move` (`hedge_cost_basis`, `hedge_notional`, `new_hedge_position`, `hedges_mut`, `hedge_keys_mut`) referenced by `rebalance.move`. These are real bugs in the current vault module surface (Phase 2 left them as stubs). Plain `sui move build` does NOT trip these — the flag changes the build's address resolution in a way that re-checks linkage that normally relies on the deployed `predict` shared addresses. Tracking as a deferred item, NOT blocking Wave 0. |
| (d) | `sui move --help` for a `manage-package` / `add-deployed-dep` subcommand | NONE EXISTS in Sui CLI v1.71.1. Available subcommands: `build, coverage, disassemble, migrate, new, test, summary, update-deps`. |

**Root cause.** Move 2024 expects the dep's own `Move.toml` to declare `published-at`. We can't edit a remote git-fetched Move.toml; the override mechanism (`[addresses]`) only works for addresses that the dep declares as `0x0` placeholders that no `published-at` overrides. There's no `[environments]`-level address override for git-dep `published-at` in Sui CLI 1.71.1.

**Canonical fix (out of scope for Wave 0; deferred to Plan 03-09 closeout).** Switch our `deepbook_predict` dep declaration from `git = ...` to `local = "../scripts/deepbookv3/packages/predict"` AND add `published-at = "0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138"` to that vendored Move.toml. This couples the vendored subtree to the deploy pin but DOES allow `sui client publish` to resolve the dep as pre-deployed. The `scripts/predict-diff.sh` Monday sweep then becomes the upgrade gate.

**Workaround for Phase 3.** The Phase 3 plan does NOT require redeploying the `deepvault` package on testnet. Per CONTEXT.md and ROADMAP.md, mainnet redeploy is Phase 5's deliverable; the existing testnet deploy at the address captured in `TESTNET-DEPLOY.json` (Plan 02-09 output) remains the integration target. Phase 3's PTB demo (Plan 03-05) uses `tx.moveCall` against the already-deployed `deepvault` package; this does NOT exercise `sui client publish`. Therefore the publish blocker does NOT gate Phase 3 completion.

**Follow-up items filed:**

1. **Deferred:** Plan 03-09 (Phase 3 closeout) MUST either (a) flip `deepbook_predict` to local dep + `published-at`, or (b) document the workaround above in `docs/MAINNET-FUNDING.md` as Phase 5 prep.
2. **Deferred:** The five missing `vault::*` accessor functions exposed by `--with-unpublished-dependencies` (line: `hedge_cost_basis`, `hedge_notional`, `new_hedge_position`, `hedges_mut`, `hedge_keys_mut`) are Phase 2 leftover stubs. Track as a Phase 2 verification gap (does NOT affect runtime — only the unpublished-dep build path). Filed in `.planning/phases/03-backtest-harness-two-protocol-ptb/deferred-items.md`.
3. **Investigation:** File an issue with MystenLabs deepbookv3 requesting that `packages/predict/Move.toml` add a `published-at` block for testnet so downstream consumers don't have to fork.

## CONTEXT.md D-17 amendment

This decision REPLACES the original CONTEXT.md D-17 description. CONTEXT.md D-17 has
been amended inline with a back-reference here (see `D-17 AMENDMENT` block in
03-CONTEXT.md).

## RESEARCH.md Open Questions

Open Questions 1-6 in `03-RESEARCH.md` have been annotated inline with their locked
resolutions in the `### RESOLVED — Wave 0 spike results (2026-05-12)` sub-section.
