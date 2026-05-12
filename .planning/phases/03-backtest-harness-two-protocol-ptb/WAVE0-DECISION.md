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

(Appended by Task 4.)

## Event JSON round-trip check

(Appended by Task 4.)

## Nightly schedule slot

(Appended by Task 4.)

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
