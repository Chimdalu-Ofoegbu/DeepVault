# Phase 2: Vault Move Package + Testnet Deploy - Context

**Gathered:** 2026-05-09
**Status:** Ready for planning

<domain>
## Phase Boundary

A deployed `deepvault::` Move package on Sui **testnet** supporting end-to-end supply→hedge→redeem with vault share tokens, withdrawal queue (token-bucket limited), pause authority, and an integration-verified rebalance against current Predict contracts. ≥85% line coverage on supply/redeem/rebalance, Sui Prover spec on the three load-bearing invariants (inflation-safety, share-NAV monotonicity, capability containment), and a green E2E supply→hedge→redeem CI script.

In scope: `deepvault::vault` shared object, `deepvault::share` (TreasuryCap quarantined), `vault::supply` with virtual-shares/dead-address-seed inflation defense, `vault::redeem_request` + `vault::redeem_fulfill` + `vault::redeem_cancel` with per-user token-bucket limiter, `vault::rebalance::buy_hedge_for_deposit` (atomic with supply), `vault::rebalance::roll_expiring` (permissionless), `vault::ltv::worst_case_haircut`, `vault::predict_adapter` thin wrapper, AdminCap (single-key, non-transferable v1) for pause + oracle-staleness override + runtime parameter tuning + force-unwind, Move test suite + property tests + Sui Prover spec, E2E testnet cycle script in CI.

Out of scope: Mainnet deploy (Phase 5 — DEPLOY-01..10), backtest harness (Phase 3), DeepBook Margin two-protocol PTB integration (Phase 4 — PTB-01..06), dashboard (Phase 4 — DASH-01..13), dynamic hedge sizing (v2 — STRAT-V2-01), key-rotation / AdminCap transferability (v2), fees / treasury (v2), multi-asset support beyond BTC binaries (v2).

</domain>

<decisions>
## Implementation Decisions

### Withdrawal Queue Mechanics (VAULT-04)

- **D-01: `redeem_request` → `redeem_fulfill` cooldown = 1 hour fixed.** User calls `redeem_request(vault, shares, ctx)` (escrows shares in a per-user request slot, records `request_timestamp`), waits 1h, then calls `redeem_fulfill(vault, clock, ctx)`. Single timestamp comparison on-chain (`now_ms - request_timestamp_ms >= 3_600_000`); cheap, audit-friendly. Gives the rebalancer a 1h window to roll/unwind a hedge if needed without forcing an in-fulfill unwind.
- **D-02: Per-user independent request slot — no global queue.** Each user has their OWN `RequestSlot { shares_escrowed, timestamp_ms, claimed_so_far }` keyed by user address inside the vault's `Table<address, RequestSlot>`. `redeem_fulfill` is purely a per-caller action: if YOUR cooldown elapsed AND YOUR bucket has tokens AND vault has liquid quote, you get paid. No FIFO sequencing, no contention, no whale-blocks-retail edge cases.
- **D-03: Liquidity-short fulfill = pay what's liquid, leave the rest queued.** `redeem_fulfill` pays `min(user_pro_rata_NAV_at_fulfill, vault_liquid_balance, bucket_tokens_remaining)`. Remaining un-paid shares stay escrowed in the request slot with `request_timestamp` UNTOUCHED (cooldown remains satisfied). User can call `redeem_fulfill` again after the next rebalance/roll frees liquidity. **No forced hedge unwind** at fulfill time — keeps the deterministic D-03-from-Phase-0 roll schedule intact.
- **D-04: `redeem_cancel` allows free cancellation.** User can cancel an outstanding request at any time (before or after cooldown). Cancel returns escrowed shares to the user's wallet, deletes the request slot, no fee. Shares are escrowed inside the vault's request-slot Table — cancel is a pure inverse of request, no token-supply movement.
- **D-05: Token-bucket = Conservative.** Per-user capacity = `2 * 86400 * (NAV_per_share / total_users_estimate)` quote micro-units... ACTUALLY a simpler frame: per-user capacity = 2-days-of-pro-rata-equal-share withdrawal, refill rate = capacity / 86400 per second (full bucket regenerates over 24h). Concrete numbers go into `shared/strategy.toml [token_bucket]` as `capacity_quote_micro_units` and `refill_rate_quote_micro_units_per_sec`. Initial values are conservative defaults — AdminCap can tune them at runtime per D-12.

### Hedge Purchase Timing & Rebalance Trigger (VAULT-05)

- **D-06: Atomic hedge purchase inside `vault::supply` PTB.** `vault::supply` ends with an internal call to `vault::rebalance::buy_hedge_for_deposit` for the 10% allocation (Phase 0 D-01). Same Programmable Transaction Block — depositor's gas pays the `predict::mint`. **This is the demo's flagship single-PTB composability moment** (and the foundation for Phase 4's two-protocol PTB extension to Margin).
- **D-07: `predict::mint` failure → abort whole supply (atomic rollback).** If `predict::mint` aborts (oracle stale per `[svi].max_staleness_seconds=300`, ask-price diverges from theoretical SSVI, max_total_exposure_pct exceeded, etc.), the entire `vault::supply` reverts. No partial state, no orphan-hedge-backlog. Tight invariant: every supply either fully completes (deposit + hedge minted) or doesn't happen. User sees a typed error, retries when conditions improve.
- **D-08: Permissionless `vault::rebalance::roll_expiring(vault, oracle_id, clock)`.** Anyone can call it. The function iterates open hedges via the registry; for each hedge whose `expiry_ms - now_ms < 2 * 86400 * 1000` (Phase 0 D-03), calls `predict::redeem` to close it and `predict::mint` for `now + 14 days` at the fresh SSVI binary price. Caller pays the gas. Tested in CI by warping `clock` past expiry. (Solver/keeper reward pattern is V2 — STRAT-V2 territory; v1 just exposes the entry function.)
- **D-09: NAV is marked using Phase 1's theoretical SSVI binary price.** `vault::ltv::nav` and `vault::ltv::worst_case_haircut` both call `svi_view::binary_price(F, K, T, theta_T, rho, eta, gamma)` for every open hedge. Bit-equal across all 3 runtimes (Phase 1 parity gate already proves it). The dashboard reads this same path, so on-chain NAV and dashboard NAV are guaranteed to match. **No dependency on Predict's market price** for NAV — keeps the `predict_adapter` blast-radius story tight.

### AdminCap Scope & Pause Semantics (VAULT-08)

- **D-10: `pause` halts supply only — redeems and rolls flow.** When `vault.paused == true`, `vault::supply` reverts; `redeem_request`, `redeem_fulfill`, `redeem_cancel`, AND `rebalance::roll_expiring` all keep working. Users can ALWAYS exit, vault can ALWAYS keep its hedge book alive. Strongest 'safe to LP here' story for institutional judges and the most defensible security posture.
- **D-11: AdminCap (single-key, non-transferable v1) has these powers, and only these.**
  1. `admin_pause(cap, vault, paused: bool)` — toggle the pause flag.
  2. `admin_oracle_staleness_override(cap, vault, max_seconds: u64)` — runtime override of `max_staleness_seconds`. Emits an `AdminOverride` event with old/new values for audit. Resets to `strategy.toml` default on next deploy.
  3. `admin_tune_strategy(cap, vault, key: String, value: u64)` — runtime mutation of one of: `[token_bucket].capacity`, `[token_bucket].refill_rate`, `[hedge_policy].ratio_bps`, `[hedge_policy].strike_otm_bps`, `[hedge_policy].tenor_seconds`. Strategy.toml codegen values are deploy-time defaults; runtime mutable state in the vault overrides. Emits `AdminTune` event.
  4. `admin_emergency_unwind(cap, vault, hedge_id: ID)` — calls `predict::redeem` on one specific hedge regardless of expiry. Narrow but load-bearing for institutional 'we can pull the plug if oracle is wrong' story. Emits `AdminUnwind` event.
- **D-12: `admin_transfer_cap` is NOT in v1 (per VAULT-08).** AdminCap is bound to its initial owner at deploy time. Sui Prover spec on VAULT-10 will assert this property. Key rotation = redeploy. (Future v2 may relax via STRAT-V2 / GOV-V2.)
- **D-13: No fees in v1.** PLP yield + hedge P&L flow 100% to LPs (minus gas). `vault` has no `treasury_balance` field. `admin_withdraw_fees` is NOT in v1. PROJECT.md scope confirmed; matches the "institutional-grade backtest credibility" framing for judges.

### Worst-Case Haircut Formula (VAULT-06)

- **D-14: Formula = sum-of-worst-payouts / total_shares.** For each open binary hedge, the worst payout direction is "binary resolves the way that pays full notional to the holder" — but for a vault that BUYS hedges, the worst case is "binary resolves opposite, hedge expires worthless." So: `worst_NAV_quote = liquid_quote_balance + Σ_open_hedges 0` (all hedges expire worthless) — i.e., the vault's worst case is just its current liquid balance. Plus any in-flight P&L on closed-but-not-settled positions (zero in v1 by construction — `predict::redeem` is atomic). Concretely: `worst_case_NAV_per_share = vault.liquid_quote_balance / total_shares`. Pessimistic, bit-equal-deterministic, no SVI math in the haircut path.
- **D-15: Output unit = u64 NAV per share at 10⁹ fixed-point** (matches Phase 1 D-14 / `svi_view::binary_price` scale). Future Margin liquidation path computes its own bps haircut as `10000 * (current_NAV_per_share - worst_NAV_per_share) / current_NAV_per_share`. Returning the raw NAV preserves precision and matches the dashboard's display path.
- **D-16: Instantaneous worst case (no time-decay discount).** `worst_case_haircut` assumes any open hedge could resolve worst-case RIGHT NOW — does not run the SVI evaluator on the haircut path, does not weight by `T_remaining`. Cleanest LTV bound for Margin to consume: a single number Margin can rely on without re-checking expiry per hedge.

### Claude's Discretion

The following are chosen by me (builder) — recorded so downstream agents don't re-ask.

- **Module layout:** `contracts/sources/vault.move` (shared object + AdminCap + lifecycle), `contracts/sources/share.move` (`Coin<VAULT_SHARE>` type + TreasuryCap quarantined inside vault), `contracts/sources/supply.move` (supply entry + virtual-shares math), `contracts/sources/redeem.move` (request/fulfill/cancel + token-bucket), `contracts/sources/rebalance.move` (buy_hedge_for_deposit + roll_expiring), `contracts/sources/ltv.move` (worst_case_haircut + nav), `contracts/sources/predict_adapter.move` (thin wrapper over Predict ABI). Each one ≤ 200 lines target.
- **Hedge registry storage:** `Table<ID, HedgePosition>` inside the shared `Vault` object (NOT a child object) — keeps reads cheap for `nav`/`worst_case_haircut` and avoids dynamic-field overhead. `HedgePosition` records `oracle_id`, `strike`, `expiry_ms`, `notional_quote`, `cost_basis_quote`, `position_shares` (the Predict supply-side share count returned by `predict::mint`).
- **Quote asset abstraction:** `vault::Vault<Quote>` is generic over the quote coin type. Testnet ships with `Quote = DUSDC` (per CLAUDE.md `predict-testnet-4-16` constants); mainnet (Phase 5) instantiates with `Quote = USDsui`. One package, two `Vault<Q>` instances if desired — but Phase 2 only deploys testnet `Vault<DUSDC>`.
- **Inflation defense seed amount:** Deploy-time seed transaction supplies `10_000_000` quote micro-units (= 10 DUSDC at 6 decimals) and burns the resulting shares to `0x0000...0000dead` via `transfer::public_transfer(coin, @0xdead)`. Combined with `decimals_offset = 10⁶` (per VAULT-03), this puts the inflation attack break-even cost at ~$10M, well above any plausible attack budget. The seed is performed in `vault::create_vault` so it CAN'T be skipped.
- **Sui Prover spec scope (VAULT-10):** Three properties — `inflation_safe` (post-supply share-count strictly increases per quote unit deposited modulo virtual-shares rounding), `nav_monotone_after_supply` (NAV-per-share never DECREASES on a supply call, ignoring per-second hedge re-mark), `capability_containment` (TreasuryCap<VAULT_SHARE> and AdminCap never leave their containing struct in any reachable code path). The Prover spec lives in `contracts/sources/specs.move` (or `specs/` subdir if multi-file).
- **Property test scope (VAULT-09 supplement):** Round-down-in-vault-favor invariant on `vault::supply` math (computed shares ≤ exact ratio); deposit-then-redeem returns ≤ deposited (never gains from rounding); seed transaction must succeed exactly once and revert thereafter.
- **E2E CI script (VAULT-11):** Bash + `sui client` driving a fresh testnet wallet through `vault::create_vault` → `vault::supply` (atomic with hedge mint) → wait → `vault::redeem_request` → wait 1h (fast-forward `clock` in tests, real wait in CI nightly job) → `vault::redeem_fulfill`. Lives at `scripts/e2e-vault-cycle.sh` and runs in a NEW CI job `e2e-vault` (added to `.github/workflows/ci.yml` extending Phase 0's matrix). Runs nightly on cron + on every push touching `contracts/`.
- **Event surface:** Emit `Supplied`, `RedeemRequested`, `RedeemFulfilled`, `RedeemCanceled`, `HedgeMinted`, `HedgeRolled`, `HedgeUnwound`, `Paused`, `AdminOverride`, `AdminTune`, `AdminUnwind`. Each event carries the actor, vault id, relevant amounts. Phase 4 dashboard subscribes to these for live state.
- **Coin metadata for `Coin<VAULT_SHARE>`:** symbol `dvUSDC` on testnet (Quote=DUSDC), `dvUSDsui` on mainnet (Quote=USDsui). Decimals = 9 (matches Phase 0 `share_decimals=9` and DEPLOY/whitepaper convention). Icon URL deferred to Phase 5 deploy hygiene.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents (researcher, planner, executor) MUST read these before planning or implementing.**

### Project context
- `.planning/PROJECT.md` — scope, core value, cut-lines, key decisions, constraints
- `.planning/REQUIREMENTS.md` §"Vault Move Package" — VAULT-01 through VAULT-11 (the 11 items this phase delivers)
- `.planning/ROADMAP.md` §"Phase 2" — goal, success criteria
- `.planning/STATE.md` — current project position
- `.planning/phases/00-setup-ground-rules/00-CONTEXT.md` — Phase 0 decisions; especially **D-01..D-05 (hedge-ratio policy: 10% allocation, -15% OTM strike, 14d tenor, roll trigger expiry<2d, sizing parameterized in [hedge_policy])**, decimals (`share_decimals=9`, quote_decimals=6 for DUSDC, variance_decimals=27, decimals=18), wallet/funding decisions (D-06..D-09), repo layout (D-13..D-16)
- `.planning/phases/01-math-foundation-svi-parity-gate/01-CONTEXT.md` — Phase 1 decisions; especially D-04 (Move evaluator hard-rejects invalid params — vault.rebalance refuses to mint), D-05 (Move runs O(1) closed-form arb-check), D-08 (theoretical fair value pricing for binary), D-13 (k bounds, theta_T_max), D-14 (binary price exact at 10⁻¹⁸)

### Research outputs (read before planning)
- `.planning/research/SUMMARY.md` — phase-ordering rationale, hard policy locks
- `.planning/research/STACK.md` — pinned versions, Move CLI version, sui-framework matching
- `.planning/research/ARCHITECTURE.md` §"Component Responsibilities" — `deepvault::vault` is shared-object-with-internal-state; §"Three-tier trust boundary" — Move = settlement, TS dashboard = display, Python backtest = parity check; §"Capability discipline" — TreasuryCap and AdminCap quarantine pattern
- `.planning/research/PITFALLS.md` §"Pitfall 6: DeepBook Predict contract churn" — `predict_adapter` thin-wrapper rationale (single-file blast-radius)
- `.planning/research/PITFALLS.md` §"Pitfall 8: Inflation attack on first deposit" — virtual-shares + decimals_offset + dead-address seed
- `.planning/research/PITFALLS.md` §"Pitfall 9: TreasuryCap escape" — quarantine-inside-shared-object pattern
- `.planning/research/PITFALLS.md` §"Pitfall 14: Mainnet redeploy disasters" — config drift; Phase 5 concern but the testnet Vault<Q> generic abstraction lives here

### Repository artifacts the plan touches
- `contracts/Move.toml` — already pins DeepBookV3 SHA `1159d79af33c70e09e406310e1d8f067832ede9d`; Phase 2 adds `[dev-dependencies]` only if needed for tests
- `contracts/sources/svi_view.move` — Phase 1 deliverable; `binary_price(F, K, T, theta_T, rho, eta, gamma)` and `binary_price_from_params(...)` are the entry points `vault::ltv::nav` and `vault::rebalance::buy_hedge_for_deposit` consume. EZeroVariance / EZeroForward / EKOutOfRange / EParamOutOfRange / EZeroStrike abort codes documented in `contracts/sources/svi_view.move:30-35`
- `contracts/sources/strategy_constants.move` — Phase 0 codegen output; `[hedge_policy].ratio_bps`, `.strike_otm_bps`, `.tenor_seconds`; `[svi].max_staleness_seconds`; `[token_bucket].capacity_quote_micro_units` + `.refill_rate_quote_micro_units_per_sec` (Phase 2 fills these defaults during planning)
- `shared/strategy.toml` — single source of truth; Phase 2 fills `[token_bucket]` defaults per D-05 and confirms `[hedge_policy]` numbers per Phase 0 D-01..D-05
- `scripts/codegen.py` — Phase 0 codegen; Phase 2 may extend it if new constants need emitting (drift-check still enforced via existing `--check` job)
- `scripts/deepbookv3/packages/predict/sources/predict.move` — vendored Predict source at SHA `1159d79a`; entry points `vault::predict_adapter` wraps:
  - `predict::mint<Quote>` (line 219) — mints binary outcome on a specific oracle
  - `predict::redeem<Quote>` (line 285) — closes a binary position post-resolution
  - `predict::supply<Quote>` (line 437) — NOT used by Phase 2 (PLP supply, that's Phase 4 territory; we're a HEDGE BUYER not a PLP)
  - `predict::ask_bounds(predict, oracle_id)` (line 212) — read current ask price for sanity-check
- `scripts/deepbookv3/packages/predict/sources/oracle.move` + `oracle_svi.move` — `OracleSVIUpdated` event struct (vault doesn't subscribe but reads the current SVI via public accessors before calling `predict::mint`)
- `.github/workflows/ci.yml` — Phase 0 5-job matrix (move, ts, python, codegen-drift, parity); Phase 2 ADDS a 6th job `e2e-vault` per D-17 in Claude's Discretion

### External docs (referenced inline by research)
- Sui Move 2024 edition language reference (entry functions, shared objects, capabilities, Table) — https://docs.sui.io/concepts/sui-move-concepts
- Sui Prover documentation — `sui prove` invocation and spec syntax (lives in `sui-framework`)
- DeepBook Predict docs — https://docs.sui.io/onchain-finance/deepbook-predict/ (mint/redeem flow, oracle authority)
- Sui CLI `sui client publish` and `sui client call` patterns for E2E script
- OpenZeppelin ERC-4626 inflation attack writeup (the canonical reference for D-05 / VAULT-03 virtual-shares pattern; ported to Move idiom)
- @mysten/sui 2.16.0 Transaction-builder docs (for the testnet E2E script)

</canonical_refs>

<specifics>
## Specific Ideas

- **Inflation defense**: 10 DUSDC seed at deploy with `decimals_offset = 10⁶`, shares burned to `@0xdead`. Sui Prover spec proves `inflation_safe` formally.
- **Single-PTB demo moment**: `vault::supply` ends with `vault::rebalance::buy_hedge_for_deposit` in the same PTB. The depositor's wallet sees ONE tx digest, ONE atomic state transition. This is the foundation Phase 4 extends to add `Margin::borrow_quote` at the front for the full two-protocol PTB.
- **Permissionless roll**: `rebalance::roll_expiring` is callable by anyone — no admin needed for normal operation. Tested by warping `clock` in Move tests.
- **Testnet Vault<DUSDC>**: the testnet deploy creates `Vault<DUSDC>` as the live instance. Mainnet (Phase 5) creates `Vault<USDsui>`. One package, parameterized by quote coin type.
- **NAV computation**: All NAV / haircut paths use Phase 1's `svi_view::binary_price` for hedge mark — bit-equal to dashboard, audit-friendly, no Predict-internal market-price dependency.
- **Worst-case haircut**: Pessimistic (assumes ALL open hedges expire worthless), instantaneous (no time-decay discount), simple u64 NAV-per-share output.

</specifics>

<deferred>
## Deferred Ideas

- **Solver/keeper reward for `roll_expiring`** — STRAT-V2 territory; Phase 2 ships permissionless callable, v2 adds bps-of-notional reward.
- **`admin_transfer_cap` for key rotation** — VAULT-08 says non-transferable v1; Phase 2 honors. Future v2 phase or governance integration handles rotation.
- **Fees / management fee / performance fee / treasury** — PROJECT.md is silent; Phase 2 ships fee-free. Future fee model is a v2 design conversation.
- **Two-level pause (`pause_supply` and `pause_all`)** — Phase 2 ships single `pause` (= supply only). If experience post-mainnet shows we need full freeze, v2 splits.
- **Joint-distribution / SVI-weighted worst-case haircut** — D-14 ships sum-of-worst-payouts pessimistic. Future Margin liquidation calibration may want a tighter bound; Phase 2 deliberately overshoots conservatively.
- **Auto-unwind hedge during `redeem_fulfill`** — D-03 says no forced unwind at fulfill; user re-calls fulfill after rebalance. If LP UX feedback says this is too clunky, v2 can add an opt-in auto-unwind path.
- **Multi-asset (ETH, SOL binary hedges)** — Phase 2 is BTC binary only via `oracle_svi`. v2 STRAT-V2-03 expansion.
- **Live delta/gamma/vega panels** — STRAT-V2-02; Phase 2 emits hedge-position events but doesn't compute Greeks. Phase 4 dashboard could compute them client-side from the SVI.
- **Permissionless vault factory / curator framework** — COMP-V2-02; Phase 2 is a single curated `Vault<Q>`.
- **0.5%/yr management fee or 10% performance fee** — explicitly considered and rejected for v1 per D-13.

</deferred>

---

*Phase: 02-vault-move-package-testnet-deploy*
*Context gathered: 2026-05-09 via /gsd-discuss-phase*
