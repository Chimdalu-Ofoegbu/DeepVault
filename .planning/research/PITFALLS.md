# Pitfalls Research

**Domain:** Composable structured-product vault on Sui DeepBook Predict (PLP+Hedge with SVI volatility-surface dashboard, Python backtest, two-protocol PTB), built solo for Sui Overflow 2026 in 39 days
**Researched:** 2026-05-09
**Confidence:** HIGH on backtest/SVI/share-token traps (well-documented academic + industry sources). MEDIUM on DeepBook Predict-specific churn (contract is 4 days old). MEDIUM on hackathon submission failure modes (general patterns apply; Sui Overflow specifics inferred).

This file is opinionated and load-bearing. Each pitfall maps to a phase that must explicitly address it. Solo-builder time impact estimates assume the builder is competent but not a domain specialist (per PROJECT.md).

---

## Critical Pitfalls

These are the disqualifying-tier failures. Any one of them, missed, can sink the submission outright.

---

### Pitfall 1: Lookahead bias in the backtest (judge-disqualifying)

**What goes wrong:**
The backtest uses information at time `t` that wasn't available until `t+Δt`. Common in this exact domain: pricing today's hedge using today's *closing* SVI fit (which is fitted from today's full session of trades) instead of the SVI surface as of the previous reb-bar. Also: rebalancing on a candle's close using that same candle's *high/low* for fills, sizing today's hedge using a vol estimate that includes today's realized return, or computing PnL with a survivor-only BTC tape.

**Why it happens:**
Pandas defaults make this trivial: `df.shift(0)` instead of `df.shift(1)`, fitting the SVI surface on the full window and then "looking up" historical params, or merging an option-chain frame that was actually published 30 minutes after its timestamp. The pandas merge looks correct; the timing is wrong by minutes — and minutes is enough to inflate APY by orders of magnitude on a hedged-vol product. Lookahead bias is widely cited as the worst class of backtest bug because results look great and the failure mode (out-of-sample collapse) only appears post-deploy.

**How to avoid:**
1. **Explicit assumption ledger** as a markdown file (`.planning/backtest-assumptions.md`) — every dataset's "available-at" timestamp documented. Every join condition uses `available_at <= decision_time`, never `==`.
2. **Decision-bar / observation-bar split.** Vault decisions execute on bar `t+1` open using only data with `available_at <= t.close`. No exceptions, no inline `.shift()` calls.
3. **Pessimistic fill assumptions.** Fills at next-bar VWAP, not next-bar open. Slippage model documented and applied.
4. **Hedge price = SVI(t-1) only.** The SVI fit used to mint a hedge at decision time `t` must be the fit produced from data ending strictly before `t`. Tag every SVI fit with its training window in the cached object.
5. **Sanity test: shuffle labels, re-run.** A shuffled-label backtest should produce ~zero alpha. Anything else is data leakage.
6. **Cross-check by hand.** Pick 3 trade rows from the backtest, recompute PnL from scratch in a notebook, compare.
7. **Walk-forward, not whole-sample.** Train SVI calibration / hedge ratio on rolling windows; test on the next window only.
8. **The "80% APY no drawdown" smell test.** If the backtest produces >40% APY on a hedged vol product with sub-5% drawdown, assume a bug until proven otherwise. The brief explicitly flags this.

**Warning signs:**
- Sharpe > 4 across the entire backtest window
- Drawdown < 5% across a stress event (March 2020, May 2022 Luna, FTX 2022, March 2023 banking)
- Equity curve that is monotonic upward
- Strategy has no losing month
- "It just works" feeling without any debugging cycles
- Hedge cost line that doesn't grow during high-vol regimes
- Backtest parameters that "happened to be" the best across multiple grid runs

**Phase to address:**
Phase 2 (Backtest harness) — built before any "results" are recorded, with the assumption ledger checked in alongside the first run.

**Solo-builder time impact:** 2–4 days budgeted up front, vs. days-to-weeks of unwinding a buggy backtest the night before submission. Lookahead-induced rewrites at week 5 are submission-killing.

---

### Pitfall 2: Hindsight-tuned hedge ratio (overfitting to the backtest window)

**What goes wrong:**
Builder runs the backtest, sees that hedge ratio = 0.18 produces the cleanest Sharpe, hard-codes 0.18 into v1 vault config, and ships. The backtest now retroactively "validates" itself, and judges who ask "how did you pick 0.18?" get a hand-wave. Worse: the chosen ratio was the best across hundreds of grid points (multiple-testing inflation), so the in-sample Sharpe is meaningless out of sample. Institutional studies report >90% of academic strategies fail on real capital largely from this class of bug.

**Why it happens:**
Backtest is fast, parameter sweep is easy, and there's no judging-side incentive to pick a "worse" ratio. Builder convinces themselves the optimum is "principled" because the curve looks smooth.

**How to avoid:**
1. **Pick the hedge ratio policy *before* running the backtest.** Document the choice in PROJECT.md *before* fitting. Default: 1.0× notional hedge on the binary's max-loss leg, OR a fixed fraction derived from a pre-stated drawdown target (e.g., "we cap monthly drawdown at 8%, hedge ratio = whatever achieves that on the *prior* year's regime"). Brief already commits to fixed-ratio v1 — preserve that.
2. **Walk-forward validation.** Calibrate ratio on month *N*, deploy on month *N+1*, never look at *N+1* during calibration. Report walk-forward stats, not whole-sample.
3. **Out-of-sample window held back.** Reserve the last 30% of the BTC history; never touch it during development. Final backtest report shows in-sample and out-of-sample side by side.
4. **Report sensitivity, not the optimum.** Show how Sharpe varies across ratio = {0.1, 0.2, 0.3, 0.5, 1.0}. A robust strategy is *flat* across this range; an overfit one peaks.
5. **No retrospective re-tuning.** If the v1 ratio underperforms in backtest, do *not* search for a better one. Document the underperformance and ship with the principled choice.

**Warning signs:**
- Choice of hedge ratio mentioned only in code, never in design doc
- Ratio is a non-round number (0.183, not 0.2 or 1/5)
- Sharpe collapses by >50% if ratio shifts ±20%
- "I tried a few values" in commits without a documented decision

**Phase to address:**
Phase 1 (Vault design) — the policy choice goes in PROJECT.md *before* Phase 2 (Backtest) opens. Phase 2 verifies on out-of-sample only.

**Solo-builder time impact:** Saves 3–5 days of "tuning" cycles that would have produced a worse submission anyway.

---

### Pitfall 3: SVI butterfly-arbitrage violation silently mispricing binaries

**What goes wrong:**
SVI parameters fit each oracle update fall outside the no-butterfly-arbitrage region. The implied risk-neutral density goes negative somewhere on the strike axis. Binary options priced from this surface are systematically mispriced — typically *under*priced at strikes near the negative-density region — so the vault buys cheap-looking hedges that are actually overpriced or pays too little for hedges that should cost more. APY looks great in backtest because the model is paying itself; in production the vault bleeds. Brief explicitly flags this as the **#1 quant risk**.

**Why it happens:**
Raw SVI has 5 parameters per slice. Gatheral & Jacquier proved the no-butterfly-arbitrage region is highly non-linear in those parameters; there is no clean closed-form constraint for the raw form. Calibrators that just minimize least-squares error frequently land in the arbitrage region, especially on noisy intraday data with low strike coverage. The g(k) function (second-derivative test for non-negative density) can dip below zero subtly — across a narrow strike band — and the backtest "works" because that band is rarely traded.

**How to avoid:**
1. **Use SSVI (Surface SVI) or eSSVI, not raw SVI per-slice.** SSVI has 3 parameters and Gatheral provides explicit, tractable no-butterfly-arbitrage conditions. eSSVI (Hendriks-Martini) extends this with explicit no-calendar-arbitrage conditions. The single-letter cost — slightly less expressive fit — is overwhelmingly worth the safety.
2. **Arbitrage-free checker as a hard gate, not a warning.** Before any binary is priced from a fit, evaluate g(k) on a dense strike grid (≥200 points across ±4σ). If `min(g(k)) < 0`: refuse to mint, log to dashboard, fall back to last known good surface.
3. **Calendar check on every roll.** No-calendar-arbitrage requires that total variance is non-decreasing in maturity at each log-strike (no crossed lines on the total-variance plot). Check before every hedge roll.
4. **Audit calibrator output against published Gatheral test cases.** The 2014 Gatheral-Jacquier paper has worked numerical examples. Hit the same numbers within float tolerance before trusting your calibrator on BTC data.
5. **Numerical-stability guardrails on extreme strikes.** SVI total variance grows linearly in |k| asymptotically; binary prices at deep OTM/ITM strikes are dominated by tail behavior. Cap strike range to ±5σ for pricing; refuse to quote outside.
6. **Sanity check: butterfly spread = nonneg.** For any three adjacent strikes K1 < K2 < K3, the butterfly C(K1) - 2·C(K2) + C(K3) must be ≥ 0. If not, the surface is arbitrageable.

**Warning signs:**
- Calibration RMSE that's "too good" (< 1bp) on 5-param SVI — likely overfit
- g(k) plot dipping into negative region anywhere
- Total-variance slices that cross between maturities
- Hedge cost in backtest that's negative (the vault is being *paid* to hedge)
- Binary mid-prices > 1.0 or < 0.0 even momentarily
- A "tiny" SVI fitter test failure ignored as flaky

**Phase to address:**
Phase 3 (SVI calibrator + arbitrage-free checker) — the checker is built *before* the binary pricer, not after. Pricer reads from the checker's verified-cache only.

**Solo-builder time impact:** Choosing SSVI up front saves 4–6 days of debugging raw-SVI calibration bugs. The arbitrage checker is 1–2 days of focused work and prevents an unbounded class of silent wrong answers.

---

### Pitfall 4: First-deposit share-inflation attack on the vault

**What goes wrong:**
Attacker watches mempool for vault deployment. First action: deposit 1 wei of underlying (gets 1 share). Second action: directly transfer (donate) 10,000 USDC into the vault's balance object — bypassing the deposit path. The share/asset ratio is now 1 share = 10,000 USDC. Next legitimate depositor of 9,999 USDC gets `9999 * 1 / 10000 = 0` shares (rounded down) and loses their entire deposit to the attacker, who then redeems their 1 share for the donation back plus the victim's principal. Documented, exploited multiple times in EVM ERC-4626; structurally identical risk in any Move vault that uses balance-of-vault-object as its denominator.

**Why it happens:**
Naive `shares_to_mint = deposit * total_supply / total_assets` is the canonical formula. With `total_supply == 1` and `total_assets == 10001`, integer division destroys precision. Every fresh-deploy vault is vulnerable on day one if not mitigated.

**How to avoid:**
1. **Virtual shares + virtual assets (OpenZeppelin pattern, ported to Move).** Add a `decimals_offset` (typically 6-9 decimals worth, i.e. 10^6 to 10^9) of virtual shares and virtual assets to *both* sides of the ratio. Math: `shares = (deposit + virtual_assets) * (total_supply + virtual_shares) / (total_assets + virtual_assets) - virtual_shares`. Makes the donation attack uneconomical unless attacker donates `~10^offset × victim_deposit`.
2. **Seed the vault on deploy.** Same Move transaction that publishes the package also calls `vault::supply` for a meaningful seed (e.g., 100 USDC of dev's own funds) and burns/locks the resulting shares to a non-recoverable address. Closes the empty-vault window.
3. **Reject direct balance transfers.** Vault accounting does *not* read `balance::value(vault.balance)`. It reads an internal `total_assets` counter that is only mutated by `supply`/`redeem`/`rebalance`. Donated tokens become non-accounted dust; attacker has no leverage.
4. **Round in the vault's favor on every operation.** `shares_to_mint` rounds down; `assets_to_return` rounds down. Both directions favor the vault, against the user, by 1 wei. This compounds to negligible cost for legit users but blocks single-wei rounding-arb attacks.

**Warning signs:**
- Vault accounting reads on-chain balance directly instead of an internal counter
- No `decimals_offset` constant or virtual-shares logic
- No deploy-time seed transaction in the launch script
- Any `total_supply == 0` branch in `supply` that uses naive 1:1 minting

**Phase to address:**
Phase 1 (Vault Move package) — both the virtual-shares math and the deploy-seed script ship in the same milestone. Audit checklist item.

**Solo-builder time impact:** ~1 day to implement virtual shares + 0.5 day to write the deploy-seed script. Failure mode is total vault drain; this is non-negotiable.

---

### Pitfall 5: TradeCap / capability leakage in PTB composability

**What goes wrong:**
The vault's `TradeCap` (DeepBook BalanceManager pattern) gets exposed via a `public` function or a `public(package) entry` function. Any wallet can call the path and trade against the vault's BalanceManager — submitting orders, draining inventory, or front-running rebalances. In Sui Move, `public(package)` + `entry` is directly callable by anyone despite the appearance of being internal; this exact pattern is a documented Sui Move bug class.

**Why it happens:**
Move's visibility model is subtle. `entry` functions are tx-callable. `public(package)` *means* "callable from anywhere within this package," but combined with `entry` the function is also tx-callable from outside. Builders read "package" and assume scoping; they're wrong. Generic phantom-type role params (`Role<phantom T>`) compound this — you can sometimes instantiate `T` to bypass intended access.

**How to avoid:**
1. **TradeCap is a hot-potato style object.** Stored inside the vault's shared object, never returned by value to a caller. All trading paths happen inside `vault::rebalance` which holds the cap by reference internally. The cap is never `take`-able by anyone but the package's own functions.
2. **No `public entry` functions return capability objects.** Audit the entire ABI: `grep` for `entry fun .* : .*Cap` patterns; every match is a bug.
3. **Use `friend` declarations or true `public(package)` without `entry` for internal-only helpers.** If a helper function takes a `&mut TradeCap`, it must not be `entry`.
4. **One PTB composition surface, well-tested.** The single PTB opener (Margin → Predict + hedge mint) is the only externally-callable composition path. Everything else is `entry` only via dedicated user-facing functions.
5. **Sui Prover for the critical path.** Sui Prover (open-sourced Jan 2026) can express "no caller without `&mut Vault` can mutate `total_assets`." Worth running on `vault::supply`, `vault::redeem`, `vault::rebalance` even if not on the rest.
6. **Negative test in the integration suite.** "Random wallet attempts to call every public function with crafted arguments. Vault state must be unchanged." This catches accidental visibility leaks.

**Warning signs:**
- Any `public entry` function whose return type is or contains a capability
- `TradeCap` referenced outside the `vault` module
- `public(package)` and `entry` modifiers on the same function
- Phantom type parameters used for "role gating" without explicit witness pattern
- Tests only cover happy paths, never adversarial calls

**Phase to address:**
Phase 1 (Vault Move package) — visibility audit before testnet deploy. Phase 4 (PTB composition) — re-audit when Margin/Predict integration introduces new entry points.

**Solo-builder time impact:** A 2-hour visibility-audit checklist scales to entire-vault security. Missed: total loss.

---

### Pitfall 6: DeepBook Predict contract churn breaking the vault mid-build

**What goes wrong:**
DeepBook Predict launched 2026-05-05 (4 days before this research). Mysten docs explicitly warn the contracts may change before mainnet. A breaking change ships on, say, 2026-05-25 — a Move struct field gets renamed, a function signature gains a parameter, an event payload changes. Vault and dashboard both break. Builder discovers it on 2026-05-26 by accident (a user transaction reverts in testing) or worse, on submission day. With ~3 weeks already invested, the refactor cost is days of unplanned work. PROJECT.md mandates a weekly Monday check exactly because of this risk.

**Why it happens:**
Pre-mainnet contracts are by definition unstable. Mysten owns Predict; their incentive is to ship a clean v1, which can mean breaking changes. Builder's natural inclination is to "lock in" testnet integration once it works and stop checking — this is exactly what gets you killed.

**How to avoid:**
1. **Weekly Monday contract-version check is non-negotiable.** Each Monday: pull latest `predict` package, diff against the version pinned in `Move.toml`, run the integration test suite. Block all feature work until the build is green again. Brief mandates this; do not skip.
2. **Pin exact published-at version of Predict in `Move.toml`.** Not "latest." A breaking upgrade upstream cannot break our build silently; it can only fail loudly when we explicitly bump the dep.
3. **Thin adapter layer.** All Predict calls go through `vault::predict_adapter::*`. Vault core never imports Predict types directly. When Predict's API breaks, the diff is contained to one file.
4. **Subscribe to Mysten Discord / Predict release notes.** A 30-minute weekly skim of the dev channel catches breaking changes before they break our build.
5. **Two "throwaway-budget" days reserved.** PROJECT.md should reserve 2 days of slack specifically for Predict refactors. Better to have unused slack than to miss submission.
6. **What to do on a mid-build break:**
   a. Stop feature work.
   b. Document the diff in `.planning/predict-version-bumps.md`.
   c. Fix the adapter; rerun integration suite.
   d. If the break is structural (e.g., binary-pricing math changes in Predict), assess whether the v1 strategy still works *before* fixing — sometimes the right call is to scope back, not fix forward.
   e. Resume feature work only when green.

**Warning signs:**
- It's been > 7 days since the last Monday check
- The Predict package on testnet has a different `published-at` than `Move.toml`
- Mysten Discord has chatter about "v0.X.Y" without an obvious breaking-change call-out — investigate anyway
- An integration test that was green last week fails today with no local change

**Phase to address:**
Phase 0 (Setup) establishes the weekly check ritual. *Every* phase honors it. Phase 4 (PTB composition) is the highest-risk phase because it touches the most Predict surface; budget extra slack here.

**Solo-builder time impact:** 30 min/week of preventive cost vs. 3–5 days of disaster recovery on a missed breaking change.

---

### Pitfall 7: Liquidation / LTV math wrong against worst-case Predict outcome

**What goes wrong:**
Vault shares are used as collateral in DeepBook Margin. Builder sets the LTV using the *current* share-price, not the *worst-case post-event* share-price. A binary expires at the unfavorable side; vault NAV drops 30% in one block. Margin position now has LTV > 100%; liquidator partially seizes, but the liquidation reward + bad-debt accounting wasn't tested for this magnitude of jump and the vault books bad debt the dashboard can't explain. Submission's "liquidation path bounded against worst-case Predict outcomes" requirement was satisfied on paper but not under stress.

**Why it happens:**
Margin's LTV check is continuous (stale-price-friendly); Predict's binary-resolution is discrete (cliff-shaped). The two interact badly without explicit modeling. DeepBook Margin docs note SUI/USDC pairs ship at 5x leverage initial, ~3x on DEEP, with 55% LTV recommended ceiling — these numbers assume continuous-collateral assets, not vault shares with a Predict binary leg.

**How to avoid:**
1. **Compute `worst_case_nav`, not `current_nav`, for collateral valuation.** For each open Predict position, model the loss if all binaries resolve adversely. Use this in the vault's reported share-price-floor for collateral purposes. Margin reads the floor, not the spot.
2. **Hard cap on LTV.** Even with worst-case NAV, cap user-facing LTV at 50% (well below Margin's recommended 55%). Defensive, but this is a hackathon submission, not a yield-max product.
3. **Explicit pre-binary-resolution rebalance window.** N hours before any binary expires, rebalance: close the binary leg or reduce vault exposure such that worst-case NAV change is < 5%. Documented in strategy whitepaper; tested in backtest stress runs.
4. **Liquidation simulation in tests.** Property test: "Inject a -30% NAV shock at any block. Margin position reaches `LTV ≤ liquidation_threshold` AND liquidation completes without bad debt to vault depositors." Run on testnet; show the trace in the demo.
5. **Document the math explicitly.** The strategy whitepaper has a "Liquidation under worst-case Predict outcome" section with the inequality and a worked example. Judges see the math; doubt is removed.

**Warning signs:**
- Vault's reported NAV equals current spot NAV (not worst-case)
- No "binary resolution buffer" rebalance scheduled
- Tests don't include a NAV-shock liquidation scenario
- LTV ceiling set to Margin's max (55%) instead of a defensive lower number

**Phase to address:**
Phase 4 (PTB composition + Margin integration) — worst-case NAV computation and the test suite ship in this phase, not Phase 5.

**Solo-builder time impact:** ~2 days for the math + tests. Failure mode is bad debt + a judge question you can't answer. Both are bad.

---

## Moderate Pitfalls

These won't disqualify, but they meaningfully degrade submission quality.

---

### Pitfall 8: Survivorship bias in BTC historical data

**What goes wrong:**
Backtest uses BTC-only price history, no problem there (BTC didn't go to zero). But if any auxiliary data source — vol estimates from a competitor's option chain, a "reference DEX" that may have de-pegged, an exchange's public BTC perp tape — has been silently delisted or cleaned-up, the data has selection bias. Examples that matter: Deribit's vol data is fine; FTX's BTC perps tape is 2018-2022 and stops abruptly (survivorship not in the underlying but in the venue). May 2022 (Luna), Nov 2022 (FTX), Mar 2023 (banking) all wiped out venues; if any vol or funding data comes from those, the backtest implicitly says "we'd have been on whatever venue survived," which is unrealistic.

**Why it happens:**
Convenient data is survivor-biased data. Researcher pulls "BTC perp funding rate, 2020-present" without thinking about which venue's API still serves that endpoint.

**How to avoid:**
1. **Single venue, single source per data type.** Pick one venue for spot price, one for vol, one for funding. Document the choice in the assumption ledger. Acknowledge: "if this venue had failed, the strategy could not have been deployed there."
2. **Use exchange-agnostic indices where possible.** BTC: CoinMetrics or similar reference price, not a single exchange's tape.
3. **Stress event coverage check.** Backtest must include March 2020 (COVID), May 2022 (Luna), Nov 2022 (FTX), Mar 2023 (banking), and any 2024-2025 stress event. If any is missing, document why.

**Warning signs:**
- Vol data gap or sudden source-change in mid-backtest
- "Cleanest" historical data starts conveniently after a major stress event
- One venue used for everything because "it has the best API"

**Phase to address:**
Phase 2 (Backtest harness) — data source choices logged before first run.

**Solo-builder time impact:** 1 day of data-source vetting up front.

---

### Pitfall 9: Stale data on dashboard without "last updated" indicator

**What goes wrong:**
The dashboard streams `OracleSVIUpdated` events via WebSocket. Connection drops at 2 AM Saturday, judges open the demo at 10 AM Sunday. The 3D vol surface plot shows the Saturday-2-AM data but the timestamp in the panel is the *current* render time. Judges see a confidently rendered surface that's 32 hours stale; they ask why BTC's vol smile shows nothing about a 10% Saturday-night move; they conclude the dashboard is fake. A foundation-level submission with an institutional-grade pitch evaluated as "demo-grade only."

**Why it happens:**
React + Plotly + Recharts default behavior is "render whatever's in state." WebSocket reconnection logic is non-trivial to get right. The "last update" time naturally lives in the data payload, but UI shows wall-clock unless you explicitly wire it up.

**How to avoid:**
1. **Every panel shows `last_event_ts` (from on-chain event timestamp), not wall-clock.** Render in UTC + relative ("3s ago" / "2h ago" / "1d ago — STALE").
2. **Staleness threshold + visible warning.** If `now - last_event_ts > 60s`, panel border turns yellow. > 5 min: red, with "DATA STALE — investigate" overlay. Staleness threshold per-panel (vault NAV: 60s; SVI surface: 5 min; arbitrage checker: with the surface).
3. **WebSocket auto-reconnect with backoff.** Test by killing the connection mid-demo recording — the dashboard should visibly recover, not silently lie.
4. **Heartbeat / connection-state indicator.** Top-right "connected • 24ms" or "disconnected — retry 3/∞." Always visible.
5. **Refuse to render stale arbitrage-checker results.** If the underlying SVI fit is > 5 min old, the arbitrage-free checker shows "stale, cannot verify" rather than rendering the previous result.

**Warning signs:**
- Demo recording uses cached data because "the indexer is slow"
- No visible timestamp on the live panels
- `setInterval(refresh, 5000)` somewhere — usually a sign the code is polling instead of subscribing
- WebSocket close handler is empty

**Phase to address:**
Phase 5 (Dashboard) — staleness indicators are a Day 1 feature, not polish.

**Solo-builder time impact:** 0.5 day for proper timestamp + staleness UX. Saves the institutional pitch.

---

### Pitfall 10: Arbitrage-free checker false negatives (rendering "all clear" on a broken surface)

**What goes wrong:**
The checker runs g(k) at 50 strike points. The negative-density region of the fit lies between two adjacent grid points; the checker doesn't see it. Dashboard reports "no butterfly arbitrage detected." Vault prices a hedge into that hidden region; mispricing leaks. Worse: the dashboard's own credibility is now load-bearing for the submission's institutional pitch, and it's silently wrong.

**Why it happens:**
The g(k) function is highly non-linear. Coarse grids miss narrow violation bands. Default "100 points across ±3σ" is borderline.

**How to avoid:**
1. **Dense grid: ≥200 points, range ±4σ minimum.** SSVI's smoothness allows interpolation between grid points to be trustworthy with 200 points; raw SVI does not (more reason to use SSVI).
2. **Combine with closed-form sufficient conditions where available.** SSVI has sufficient conditions on the parameters that imply no butterfly arbitrage everywhere. Check those *first*; if they hold, the surface is provably safe and the grid check is a sanity confirmation. If they fail, run grid + flag as "potentially arbitrageable."
3. **Show the checker's output in detail, not as a green light.** Plot g(k) as a panel; show min(g) value numerically; show strike where minimum occurs. Judges and reviewers see the actual evidence, not a misleading binary.
4. **Calendar arbitrage check via total-variance crossing.** For multi-maturity, plot total variance vs. log-strike for each maturity; flag any maturity pair where lines cross. This is visual and unambiguous.

**Warning signs:**
- Checker has a single boolean output ("safe" / "unsafe") with no diagnostic detail
- Strike grid hard-coded to "≥100 points"
- No closed-form parameter check, only grid scan
- Checker has never reported "unsafe" in any test fit (likely too coarse)

**Phase to address:**
Phase 3 (SVI calibrator) — checker built with the calibrator, with closed-form + grid + visualization.

**Solo-builder time impact:** 0.5 day to upgrade grid + add diagnostic plotting.

---

### Pitfall 11: What-if simulator using wrong shock magnitudes

**What goes wrong:**
The PROJECT.md spec says "PLP PnL under ±5σ BTC moves." Builder implements ±5% moves (confusing σ with %), or uses ±5σ at *daily* vol when the binary's relevant horizon is hourly, or applies the shock to spot but not to vol (spot-only shock dramatically understates losses on a vol-sensitive book). Demo shows judges a "-5σ shock causes -3% PnL" panel when the realistic answer is -25%. Looks reassuring; is wrong; institutional pitch undermined.

**Why it happens:**
Dimensional confusion (% vs σ vs basis points) is a classic. Vol-sensitive books need joint shocks (spot AND vol), not single-axis. Builder underestimates this without reviewing literature.

**How to avoid:**
1. **Define σ explicitly.** σ = realized BTC daily return std-dev over the trailing 90d (or annualized then scaled). Document the choice; show the value (e.g., "1σ ≈ 3.2% daily as of 2026-05-08").
2. **Joint shock: spot AND vol surface.** A -5σ spot move is empirically accompanied by a +10-30% pop in implied vol (vol skew steepening). The simulator applies both: spot shock + a calibrated vol-pop function. Show the calibration source.
3. **Show the shock magnitudes numerically alongside the PnL.** "-5σ ≈ -16% spot move, +25% IV pop. Vault PnL: -4.2%." Judges can sanity-check the inputs.
4. **Cross-check against backtest.** The worst day in the backtest had a known spot move and PnL. The simulator should reproduce that PnL within a reasonable tolerance when fed that day's shock.
5. **No claims of safety the math doesn't support.** If the simulator shows -25% under -5σ, the strategy whitepaper says "max simulated drawdown -25% under -5σ scenario," not "robust to extreme moves."

**Warning signs:**
- Simulator's σ is hard-coded to a number (always the wrong move)
- Spot shock without vol shock
- PnL under stress is < PnL under backtest's actual worst day (means simulator is too gentle)
- Shock magnitudes only shown in σ, never in % terms

**Phase to address:**
Phase 5 (Dashboard) — but the σ definition + shock model gets reviewed by the human (per PROJECT.md "spot financial nonsense") *before* the simulator panel is finalized.

**Solo-builder time impact:** 0.5 day for proper joint-shock model.

---

### Pitfall 12: Rounding errors in supply/redeem accounting

**What goes wrong:**
Supply mints rounded-up shares; redeem returns rounded-up assets. Or both round to nearest. Each operation leaks 1 wei somewhere. Across thousands of transactions, the leak is significant; worse, a sequence of micro-supply + micro-redeem operations can systematically extract value from the vault. Sui Move auditors specifically call this out as a vulnerability class — subtle math errors weaponizable across many execution paths.

**Why it happens:**
Move's `u64`/`u128` integer division always truncates. Builder thinks "round to nearest is fairer"; it isn't, in a vault context — *always* round in the vault's favor.

**How to avoid:**
1. **Supply (deposit → shares):** round shares-out *down*. User gets ≤ fair share count.
2. **Redeem (shares → assets):** round assets-out *down*. User gets ≤ fair asset amount.
3. **Both: the wei lost goes to the vault (NAV per share strictly non-decreasing absent strategy losses).** Document this: "vault accounting is conservative; users may lose up to 1 wei per operation to rounding, in vault's favor."
4. **Property tests: NAV/share monotonically non-decreasing under any sequence of supply/redeem (no rebalance, no losses).** If this property fails, rounding is wrong.
5. **Use Sui Prover on these two functions specifically.** OpenZeppelin's Sui Prover example does *exactly* this — it proves share-price monotonicity for a Move vault. ~1 day to write the spec, then mathematical proof of correctness.
6. **No `round-half-to-even`, no `+0.5 then truncate`.** Plain integer division (which truncates toward zero) in the vault's favor.

**Warning signs:**
- "Round half" or "rounded to nearest" anywhere in vault math
- NAV/share value oscillates over time absent strategy losses
- Property test "NAV/share is non-decreasing" not in the suite
- Different rounding direction in supply vs. redeem

**Phase to address:**
Phase 1 (Vault Move package) — rounding direction documented and tested on Day 1.

**Solo-builder time impact:** Trivial to do right (≤ 0.5 day with Sui Prover); subtle to find later.

---

### Pitfall 13: Withdrawal-queue token-bucket implementation bugs

**What goes wrong:**
Token bucket limits redemption rate. Bug class 1: bucket "refills" on withdraw call only (not on time elapsed) — first user of each block gets the whole accumulated capacity, others get rate-limited unfairly. Bug class 2: bucket capacity stored in `u64` and overflows on a long quiet period (e.g., 30 days of refill at 1 token/sec = 2.6M tokens, fits in u64, but if the rate is wei-per-sec the math wraps). Bug class 3: refill computed as `(now - last_refill) * rate` without bounds, so a clock-skew or test-time-warp allows an attacker to force the bucket to "refill" instantly. Bug class 4: bucket per-vault rather than per-user, so one whale drains capacity and blocks others.

**Why it happens:**
Token bucket is a simple algorithm to describe but easy to mis-implement, especially around clock arithmetic. Sui's `Clock` is checkpoint-driven, not block-driven, with its own subtleties.

**How to avoid:**
1. **Refill on every operation, capped at `min(refill, max_capacity)`.** No batched-refill bugs.
2. **Use `u128` for intermediate math.** `(now_ms - last_refill_ms) * rate_per_ms` can be large; use u128 then narrow.
3. **Cap `now - last_refill` at a reasonable max (e.g., 30 days).** Prevents pathological refills if state is touched after a long pause.
4. **Per-user bucket, not just per-vault.** Each address has its own rate-limit tracking; one whale can't starve others.
5. **Test: rapid-fire withdraws across blocks; long-quiet-then-burst; clock-skew sim.**
6. **Withdraw queue has a fallback "emergency mode."** If bucket logic ever throws, vault can still be redeemed slowly via a no-bucket path with a 24h delay. Defense in depth.

**Warning signs:**
- Bucket refill code uses `block_height` instead of `Clock::timestamp_ms`
- No cap on `now - last_refill`
- `u64` arithmetic with no overflow check
- Bucket state is global, not per-user

**Phase to address:**
Phase 1 (Vault Move package) — withdrawal queue is part of vault core.

**Solo-builder time impact:** 1 day to do right with tests.

---

### Pitfall 14: Mainnet redeploy disasters (config drift)

**What goes wrong:**
Testnet build uses `dUSDC` (DeepBook test stablecoin), USDsui-testnet oracle address, Predict-testnet package ID. Mainnet redeploy is a copy-paste-edit of the deploy script. Builder misses one address: the SVI oracle's `OracleSVIUpdated` event filter is still pointing at a testnet object ID. Mainnet vault deploys; users supply real USDsui; vault's hedge logic listens to a testnet object that never emits on mainnet; vault sits there with no hedges as BTC moves. Discovered by a user (or judge) before the builder.

**Why it happens:**
Move package IDs, oracle object IDs, BalanceManager IDs, USDsui vs dUSDC type tags, Predict mainnet vs testnet — these differ between environments and there is no compile-time enforcement that they're consistent. Copy-paste deploys with manual address swaps are error-prone, especially under deadline pressure.

**How to avoid:**
1. **Single config file for all addresses, separated by env.** `config/testnet.toml` and `config/mainnet.toml`. Deploy script reads the env's file; never hard-codes addresses.
2. **Smoke test on mainnet immediately after deploy.** A 5-tx sequence: supply, observe vault state, observe one rebalance, redeem 10% of supply. If any step fails, halt and fix before publicizing.
3. **Validate addresses via on-chain reads, not assumption.** Deploy script reads each referenced object's type and metadata, asserts it matches the expected type tag. If `USDsui` deploy expects `0xdee9::usdsui::USDSUI` but config points at `0xdeadbeef::dusdc::DUSDC`, fail loud at deploy time.
4. **Mainnet redeploy practice run on a fresh testnet instance first.** Throw away the deploy. Do it again. Third time on mainnet. Three reps catches the muscle-memory mistakes.
5. **Gas budget surprises:** mainnet gas is real money. First mainnet deploy of a Move package can be 0.5–2 SUI. Have ≥10 SUI in the deploy wallet; budget for 2-3 retries.
6. **Don't deploy to mainnet at 11 PM the night before submission.** Brief mandates "mainnet redeploy actually executed before submission" — interpret this as "completed and smoke-tested by 2026-06-12, not 2026-06-15."

**Warning signs:**
- Hard-coded addresses anywhere in Move code or deploy scripts
- Deploy script uses `sed` or manual edits to swap testnet→mainnet addresses
- No on-chain type-tag assertion at deploy time
- Mainnet smoke test deferred until "after the demo recording"

**Phase to address:**
Phase 6 (Mainnet redeploy + submission) — but the config-file structure is set up in Phase 0.

**Solo-builder time impact:** 1 day for the config infra, 0.5 day for the smoke test. Avoids 1–3 days of redeploy disasters.

---

### Pitfall 15: Demo recorded against testnet but mainnet broken

**What goes wrong:**
Builder records the demo video on testnet (it works there, the builder's wallet is configured, the data flows). Mainnet redeploy was Friday; demo was recorded Wednesday. By Saturday's submission, mainnet has a config bug the builder hasn't found. Judges click the demo's mainnet link, transaction reverts, submission feels broken even though the testnet flow is genuinely solid.

**Why it happens:**
Demo recording happens last in production; mainnet deploy slips later than planned; recording the demo *again* on mainnet feels like wasted time.

**How to avoid:**
1. **Demo is recorded on mainnet, after smoke test passes.** Period. Even if testnet has cleaner data, the demo is mainnet.
2. **Submission package includes both.** README links the *mainnet* package as primary, with a footnote: "testnet deployment available at \[id\] for judges who prefer to test without funding a wallet — flow is equivalent." This shows preparation and gives judges options.
3. **Demo includes the actual on-chain tx digest.** A judge can paste the digest into Sui explorer and see the real PTB happen. This proves it's not a screen recording with mocks.
4. **Pre-submission "judge dry run."** Imagine a judge clicks the README's first link cold. What do they see? Does it work? If not, fix.

**Warning signs:**
- Demo video has testnet URLs / chain prefixes visible
- README has dead links to a not-yet-deployed mainnet package
- "We'll re-record after deploy" in the planning notes — never happens

**Phase to address:**
Phase 6 (Submission) — demo recording is a milestone after mainnet smoke test, not before.

**Solo-builder time impact:** Plan demo recording = mainnet smoke test + 4 hours, on a single day, no earlier than 2026-06-13.

---

### Pitfall 16: Documentation that assumes context judges don't have

**What goes wrong:**
README opens with "DeepVault is a PLP+Hedge vault on DeepBook Predict with SVI volatility-surface dashboard." Judges from a16z and Bridge/Stripe know finance but may not know what "PLP" stands for in DeepBook (Predict Liquidity Provision — distinct from generic LP), what SSVI parameterization is exactly, what "the third primitive in the DeepBook stack" framing means in foundation context. They give up before figuring it out and rate the submission as muddled.

**Why it happens:**
Builder is deep in their own domain. The "obvious" framing isn't.

**How to avoid:**
1. **README opens with a one-paragraph laypitch.** "DeepVault sells BTC volatility-yield with crash insurance, on Sui. Users deposit dUSDC, get a vault share that pays the spread between Predict's market-making fees and a tail-risk hedge. Built on Sui's three composable primitives (DeepBook Spot, Margin, Predict)."
2. **One-page architecture diagram, well-labeled.** Boxes for Vault, Margin, Predict; arrows labeled with the actual function calls. PNG or SVG, viewable on GitHub without rendering.
3. **Glossary section.** PLP, SVI/SSVI, PTB, BalanceManager, TradeCap defined inline.
4. **Strategy whitepaper as a separate doc.** Does the heavy math, links from README. README itself stays under 3 screens of scroll.
5. **Read it cold, the day before submission.** Forget what you know; read like a judge with 10 min to evaluate. If anything is unclear, fix.

**Warning signs:**
- README jumps into technical details without a high-level pitch
- Acronyms used without expansion on first use
- No diagram, or diagram is hand-drawn and unlabeled
- Strategy explanation is in code comments, not in a doc

**Phase to address:**
Phase 6 (Submission) — but the diagram and glossary start in Phase 0 and grow organically.

**Solo-builder time impact:** 1 day total across the project for doc craft. Disproportionate impact on judge perception.

---

## Minor Pitfalls

Won't sink the submission alone but compound with the moderate ones if neglected.

---

### Pitfall 17: Funding/fee/slippage modeling omitted from backtest

**What goes wrong:**
Backtest assumes zero spread, zero gas, zero LP-mint fee, zero hedge purchase impact. Real APY is 30% lower than backtest claims. Judge with hedge-fund background (a16z et al.) asks "what's the funding cost?" and there's no answer.

**How to avoid:**
1. Document each fee/cost line explicitly: DeepBook trading fee, Predict mint fee, gas (in USDsui), funding/borrow cost on Margin leg, hedge slippage estimate.
2. Apply each in the backtest's PnL accounting. Show pre-cost and post-cost APY.
3. Slippage model: at minimum, flat bps assumption documented; ideally, a depth-of-book impact function.

**Warning signs:** Backtest APY > 25% on a hedged-vol product. Cost line absent from PnL attribution.

**Phase to address:** Phase 2 (Backtest harness).

**Solo-builder time impact:** 0.5 day.

---

### Pitfall 18: Refactor temptation when tempted by elegant abstractions

**What goes wrong:**
Week 4. Vault works. SVI calibrator works. Builder notices that with one more abstraction, both could share a "Pricing" trait. Yields 3 days of refactor; 2 days of subtle bugs introduced; 1 day of recovery; net 6 days lost. Submission misses the dashboard polish phase.

**How to avoid:**
1. **No refactor unless it unblocks a specific feature on the active list.** "It's nicer this way" is not a feature.
2. **Code freeze date for vault & calibrator.** After 2026-05-30, only bug fixes and integration work, no internal-architecture changes.
3. **Refactor instinct → write a TODO comment, move on.** Real refactor cycles wait for v2.

**Warning signs:** Branch named `refactor/*` open longer than 2 days. Architecture doc rewritten more than once per week.

**Phase to address:** Cross-cutting; mention in Phase 0 ground rules.

**Solo-builder time impact:** Saves 3–6 days over the project.

---

### Pitfall 19: Yak-shaving on dashboard polish before vault works

**What goes wrong:**
Builder spends Week 1 on a beautiful 3D Plotly surface plot before the vault has a working `supply` function. Week 2: dashboard is a 9/10, vault is a 3/10. Brief is explicit: "Quality of the vault math, the backtest, and the dashboard polish takes priority over component count" — but vault math comes first within that.

**How to avoid:**
1. **Phase order in PROJECT.md is not a suggestion.** Vault → backtest → SVI → composition → dashboard → submission. No Phase 5 (dashboard) work before Phase 4 (composition) is feature-complete.
2. **Dashboard is built against mocked data first.** Real WebSocket integration is the *last* dashboard task, not the first.
3. **"Is this the highest-leverage thing right now?" check.** Daily. If the vault's `redeem` doesn't work, the SVI surface plot's color gradient doesn't matter.

**Warning signs:** Dashboard branch ahead of vault branch in commits. CSS commits in Week 2.

**Phase to address:** Cross-cutting.

**Solo-builder time impact:** Variable; can save the entire submission.

---

### Pitfall 20: PTB demo that fails on the judge's wallet config

**What goes wrong:**
PTB requires the user to have a `BalanceManager` already. Demo wallet has one (builder created it weeks ago). Judge's wallet is fresh. Demo's "open this PTB" link reverts because BalanceManager doesn't exist yet, and the error message is opaque.

**How to avoid:**
1. **PTB has a "first-time user" path that includes BalanceManager creation as a step.** Idempotent: if the user already has one, skip; if not, create.
2. **Demo doc / README explicitly notes prerequisites: "you'll need ~5 SUI for gas, the PTB will create a BalanceManager if needed."**
3. **Test on a fresh wallet.** Burner wallet, no prior state, fund with 5 SUI, click the link, see what happens. Iterate.

**Warning signs:** Demo only ever tested with the builder's wallet. README has no prerequisites section.

**Phase to address:** Phase 4 (PTB composition) and Phase 6 (Submission).

**Solo-builder time impact:** 0.5 day.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Skip Sui Prover; rely on tests | 1–2 days saved | Subtle vault math bugs that surface late, possibly post-submission | Acceptable for non-vault modules; never for `supply`/`redeem`/`rebalance` |
| Hard-code Predict package ID instead of pinning via Move.toml | 1 hour saved | Silent breakage on Predict upgrade | Never |
| Single venue for all backtest data | 0.5 day saved | Survivorship bias risk; judge can't audit | Acceptable if explicitly documented in assumption ledger |
| Raw 5-param SVI per-slice instead of SSVI | Marginally tighter fit | No closed-form arbitrage check; debugging hell | Never for v1 |
| `round half` rounding in vault math | Feels "fairer" | 1 wei/op leak compounds; rounding-arb attacks | Never |
| Skip weekly Predict version check | 30 min/week saved | 3–5 day disaster recovery on breaking change | Never |
| Demo recorded on testnet | Easier wallet config | Mainnet bugs invisible; judges hit reverts | Never |
| PnL accounting in `u64` everywhere | Slightly less code | Overflow risk on large amounts | Only if upper bound proven < 2^63 |
| Dashboard auto-refresh via `setInterval` instead of WebSocket | 0.5 day saved | Stale data, no event-driven freshness | Acceptable as fallback only, with staleness banner |
| Skip walk-forward, use whole-window backtest | 1 day saved | Hindsight overfit; results inflated; loses credibility | Never |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| DeepBook Predict | Treat testnet contracts as stable; pin "latest" | Pin exact published-at; weekly Monday check; thin adapter layer |
| DeepBook Margin | Use spot NAV for collateral valuation | Use worst-case-post-binary-resolution NAV; hard-cap user LTV at 50% |
| BalanceManager / TradeCap | Expose `TradeCap` via `public entry` accidentally | Cap held inside vault shared object; never returned by value; Sui Prover assertion |
| Sui Clock | Use block height for time-based logic | Use `Clock::timestamp_ms`; cap `now - last_event` to prevent overflow exploits |
| OracleSVIUpdated events | Subscribe by package ID hard-coded | Subscribe by event type tag, parameterized by env config |
| `OracleSVIUpdated` indexer (predict-server.testnet) | Assume it's always up | Health-check the indexer; fall back to direct RPC event subscription if down |
| USDsui (mainnet) vs dUSDC (testnet) | Same code path, different type tag, missed in deploy | Config-driven type-tag; deploy script asserts correct type |
| Sui RPC | One endpoint, no failover | Multiple RPC endpoints in config; client retries with backoff |
| Plotly 3D surface | Render every event update | Throttle UI updates to ≥1s intervals; show "last updated" |

---

## Performance Traps

This project's expected scale is *very low* for the demo (judge wallets, possibly a handful of curious users) but the dashboard must look responsive. Optimize for *perceived* performance, not throughput.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Re-fitting SVI on every event | Dashboard CPU pegged; UI lags | Throttle: at most one fit per 1s, or per N events, whichever is later | First multi-user demo |
| Fetching backtest results from disk on every page load | Initial load > 5s | Pre-render backtest report to static HTML / PNG | Demo day with > 1 viewer |
| Plotly 3D plot re-rendering whole surface every update | Choppy dashboard | Use Plotly's `restyle` for incremental updates instead of full redraw | Always |
| Indexer query for every NAV display | Indexer rate-limits or 504s | Subscribe to events; cache last-known NAV; only re-query on event | First demo with > 10 panel views |
| Move package size from including unused deps | Slow deploy, large gas | Strip dev-only modules from mainnet build | Mainnet deploy |
| Backtest run-time > 10 min | Iteration loop too slow; bugs not caught | Profile + cache SVI fits; vectorize PnL accounting; reuse fitted surfaces | Days 5+ of backtest dev |

---

## Security Mistakes

Domain-specific issues beyond general web/contract security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| First-deposit share inflation | Total user-deposit drain | Virtual shares + virtual assets; deploy-time seed; internal balance counter |
| TradeCap leakage via `public entry` | Anyone can trade vault inventory | Visibility audit; Sui Prover; negative tests |
| Oracle freshness not checked | Vault prices off stale data; mispricings systematic | Refuse to mint hedges if `OracleSVIUpdated` is older than threshold (e.g., 5 min); fall back to "vault paused for new hedges" |
| Binary-resolution liquidation cascade | Bad debt to vault depositors | Worst-case NAV for collateral valuation; pre-resolution rebalance; LTV cap |
| Rounding direction wrong | Wei-per-op leak; rounding-arb attacks | Always round in vault's favor; Sui Prover assertion; monotonicity test |
| Withdrawal-bucket clock-skew exploit | Force-instant bucket refill | Cap `now - last_refill` at sane max; per-user buckets |
| Reused dev wallet for mainnet deploy | Key compromise = vault compromise | Fresh deploy keypair; multisig publication if available; transfer admin to a separate ops key |
| Move package upgrade left enabled with old upgrade cap | Anyone holding the cap can upgrade vault | After mainnet smoke test, transfer upgrade cap to a burn address OR a multisig OR explicitly state "upgradeable, here's the cap holder" |
| Predict event payload trusted blindly | Malicious oracle event causes wrong hedge sizing | Validate each `OracleSVIUpdated` event against known oracle authorities; sanity-bound parameter values |
| Testnet `dUSDC` faucet logic in mainnet code path | Anyone can mint USDsui from vault | Strip all faucet/mock paths from the mainnet deploy; assert in deploy script |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| "Connecting wallet…" hangs with no timeout | User thinks the dapp is broken | 10s timeout + "retry" button |
| PTB success but user can't find what changed | "Did it work?" anxiety | Post-tx panel: "You deposited X. Vault balance now Y. Tx: \[explorer link\]" |
| Dashboard shows numbers with no units | Users misread (USDC vs SUI) | Always show unit; large numbers humanized (1.2M instead of 1234567) |
| Same color for "you have a position" and "no position" | Hard to scan | Empty state visually distinct from populated state |
| Withdrawal queue position not surfaced | "Where's my redemption?" | "You're #N in queue, ETA M minutes" panel |
| Failure modes shown as opaque hex error | Users panic | Map common revert reasons to plain text (e.g., "vault paused — recent SVI update missing") |
| 3D surface plot unreadable on mobile | Judges on phone see broken UI | Mobile fallback: heatmap version of the surface, with "view on desktop for 3D" hint |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces. Verify each before submission.

- [ ] **Vault deploy:** Often missing seed-tx + virtual-shares — verify share inflation attack does not succeed in a hostile-deposit test
- [ ] **PTB opener:** Often missing fresh-wallet path — verify by clicking the link from a brand-new burner wallet
- [ ] **SVI calibrator:** Often missing arbitrage-checker as a hard gate — verify pricer refuses to quote when `min(g(k)) < 0`
- [ ] **Backtest report:** Often missing assumption ledger + walk-forward results — verify by reviewing the report cold and asking "what assumptions are baked in?"
- [ ] **Dashboard:** Often missing staleness indicators + WebSocket auto-reconnect — verify by killing the connection during a recording test
- [ ] **What-if simulator:** Often missing joint spot+vol shock — verify σ definition is documented and shock magnitudes shown numerically
- [ ] **Mainnet deploy:** Often missing on-chain type-tag assertions in deploy script — verify by intentionally swapping a config address and confirming deploy fails loud
- [ ] **Demo video:** Often recorded on testnet — verify mainnet tx digest is shown and is real
- [ ] **README:** Often missing one-paragraph laypitch + glossary — verify by giving it to a non-Sui-native finance person and asking what the project does
- [ ] **Liquidation path:** Often passes happy-path tests but no -30% NAV shock test — verify property-test scenario exists
- [ ] **Worst-case NAV math:** Often documented in code but not in the strategy whitepaper — verify whitepaper has the inequality and a worked example
- [ ] **Rounding direction:** Often inconsistent between supply and redeem — verify monotonicity test + Sui Prover assertion in CI
- [ ] **Withdrawal queue:** Often per-vault not per-user — verify whale-can't-starve-others test
- [ ] **Predict version pin:** Often "latest" — verify Move.toml has exact published-at
- [ ] **Weekly Monday check:** Often skipped after week 3 — verify ritual still being honored

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Lookahead bias discovered late | HIGH (3–5 days) | 1) Stop publishing backtest results. 2) Audit join semantics file-by-file. 3) Rerun on cleaned harness. 4) Update report. 5) If APY drops materially, update strategy whitepaper claims accordingly |
| SVI butterfly violation in production | MEDIUM (1–2 days) | 1) Refuse new hedge mints (vault enters "paused for hedges" mode). 2) Switch to last known good surface. 3) Re-fit with tighter calibrator constraints. 4) Add closed-form sufficient check. 5) Resume |
| Share inflation attack happens | CATASTROPHIC | 1) Pause vault. 2) Snapshot state. 3) Estimate damage. 4) Either bribe attacker (won't work) or admit the bug + ship v2. 5) Likely submission DQ. PREVENTION-ONLY pitfall |
| Predict breaking change mid-build | MEDIUM (1–3 days) | 1) Stop feature work. 2) Diff Predict in adapter file. 3) Run integration tests. 4) Decide: fix forward, scope back, or pivot. 5) Resume only when green |
| Mainnet deploy bug at submission | MEDIUM (1–2 days, but no slack) | 1) If discovered before deadline: re-deploy with fix; re-record demo if visible. 2) If deadline imminent: submit with a clear README disclaimer + working testnet link as fallback |
| WebSocket dies during demo recording | LOW (1 hour) | 1) Restart WebSocket service. 2) Re-record affected segment. 3) Add reconnect logic if missing |
| Hedge ratio overfit and collapses on out-of-sample | MEDIUM (1 day) | 1) Stop claiming the in-sample number. 2) Report walk-forward only. 3) Update strategy whitepaper to acknowledge sensitivity |
| Liquidation cascade in test | MEDIUM (1–2 days) | 1) Reduce LTV cap. 2) Add pre-resolution rebalance. 3) Re-test with -30% NAV shock. 4) Document |
| Demo fails on judge wallet | HIGH if discovered post-submission, LOW if pre | 1) Pre: test on fresh wallet, fix path. Post: respond to judge feedback with clear repro + fix; submit follow-up |
| README acronyms confuse a judge | LOW (2 hours) | 1) Add glossary. 2) Edit README opening. 3) Re-publish |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls. A roadmap that doesn't explicitly cover all "Critical" rows is a roadmap that's setting up the submission to fail.

| # | Pitfall | Prevention Phase | Verification |
|---|---------|------------------|--------------|
| 1 | Lookahead bias | Phase 2 (Backtest harness) | Assumption ledger checked in; shuffle-label test passes; manual cross-check on 3 trade rows |
| 2 | Hindsight-tuned hedge ratio | Phase 1 (Vault design) → Phase 2 verify | Hedge ratio choice in PROJECT.md *before* Phase 2 opens; walk-forward stats reported |
| 3 | SVI butterfly arbitrage violation | Phase 3 (SVI + checker) | Closed-form SSVI conditions checked; g(k) plot in dashboard; published Gatheral test cases reproduced |
| 4 | First-deposit share inflation | Phase 1 (Vault Move) | Hostile-deposit test passes; deploy-seed script in repo |
| 5 | TradeCap leakage | Phase 1 (Vault) + Phase 4 (PTB) | Visibility audit; Sui Prover spec on `vault::*`; negative tests |
| 6 | Predict contract churn | Phase 0 (Setup) → cross-cutting | Weekly Monday check ritual; Move.toml exact-version pin; thin adapter |
| 7 | Liquidation/LTV math | Phase 4 (Composition + Margin) | Worst-case NAV in whitepaper; -30% shock property test; LTV cap at 50% |
| 8 | Survivorship bias | Phase 2 (Backtest) | Assumption ledger documents data sources; stress event coverage list |
| 9 | Stale dashboard data | Phase 5 (Dashboard) | Every panel shows `last_event_ts`; staleness threshold; WebSocket auto-reconnect tested |
| 10 | Arbitrage checker false negative | Phase 3 (SVI) | ≥200 grid points; closed-form pre-check; g(k) plot visible |
| 11 | Wrong shock magnitudes | Phase 5 (Dashboard) | σ definition documented; joint spot+vol shock; cross-checked against backtest worst day |
| 12 | Rounding errors | Phase 1 (Vault) | Sui Prover share-price-monotonicity spec; supply/redeem round-down tests |
| 13 | Token-bucket bugs | Phase 1 (Vault) | Per-user bucket; clock-skew test; emergency mode |
| 14 | Mainnet config drift | Phase 0 (config infra) → Phase 6 (deploy) | Single config file; on-chain type-tag assertion; smoke test |
| 15 | Demo recorded on testnet | Phase 6 (Submission) | Demo recorded post-mainnet-smoke; tx digest visible; mainnet links primary in README |
| 16 | Documentation context gap | Phase 6 (Submission) | README laypitch + diagram + glossary; cold-read review |
| 17 | Fees/funding/slippage missing | Phase 2 (Backtest) | PnL attribution shows each cost line; pre-cost and post-cost APY both shown |
| 18 | Refactor temptation | Cross-cutting (Phase 0 ground rules) | Code freeze date; refactor-branch lifetime monitored |
| 19 | Dashboard yak-shaving | Cross-cutting (Phase 0 ground rules) | Phase 5 cannot start until Phase 4 is feature-complete |
| 20 | PTB fails on judge wallet | Phase 4 (PTB) + Phase 6 (Submission) | Fresh-wallet test; README prerequisites section |

---

## Solo-builder Time Risk Summary

Aggregated time impact of skipping prevention vs. doing it right. Use this to defend the schedule when tempted to cut corners.

| Pitfall class | Prevention cost (days) | Disaster recovery cost (days) | Net savings |
|---------------|------------------------|-------------------------------|-------------|
| Lookahead bias prevention | 2–4 | 3–5 (and credibility loss) | 1–7 |
| SVI arbitrage checker | 1–2 | Unbounded (silent mispricing) | Mandatory |
| Share inflation defense | 1.5 | Catastrophic / DQ | Mandatory |
| TradeCap visibility audit | 0.25 | Catastrophic / DQ | Mandatory |
| Predict weekly check | 0.07/wk × 6 wks = 0.4 | 3–5 per missed change | 2.5–4.5 |
| Mainnet config infra | 1 | 1–3 | 0–2 |
| Demo on mainnet (vs testnet) | 0.2 (extra time on demo day) | 1 (re-record) + credibility | 0.5–1.5 |
| Code freeze / no refactor | Cultural | 3–6 lost to refactor cycles | 3–6 |
| Dashboard yak-shaving discipline | Cultural | Variable, can lose phase 5 entirely | Variable |
| **Total preventive budget** | **~7–10 days** | **vs. potentially submission-killing recovery** | **Buy the prevention** |

The 39-day window has approximately 30 working days after carve-outs. Burning 7–10 of those on prevention is large; burning the *same number* on recovery from a single critical failure is worse and produces a broken submission. The math favors prevention overwhelmingly.

---

## Sources

- [Look-Ahead Bias In Backtests And How To Detect It (Michael Harris)](https://mikeharrisny.medium.com/look-ahead-bias-in-backtests-and-how-to-detect-it-ad5e42d97879) — HIGH confidence on lookahead diagnostics
- [Backtesting AI Crypto Trading Strategies Safely (Blockchain Council)](https://www.blockchain-council.org/cryptocurrency/backtesting-ai-crypto-trading-strategies-avoiding-overfitting-lookahead-bias-data-leakage/) — MEDIUM
- [Survivorship Bias in Crypto Backtesting (CoinAPI)](https://www.coinapi.io/blog/how-to-eliminate-survivorship-bias-in-crypto-backtesting) — MEDIUM
- [Statistical Overfitting and Backtest Performance (Bailey et al., LBNL)](https://sdm.lbl.gov/oapapers/ssrn-id2507040-bailey.pdf) — HIGH (academic)
- [Why 90% of Backtests Lie (TargetHit)](https://targethit.ai/learn/backtests-lie) — MEDIUM
- [Arbitrage-free SVI volatility surfaces (Gatheral & Jacquier, 2014)](https://arxiv.org/pdf/1204.0646) — HIGH (the canonical reference; required reading per PROJECT.md)
- [No-arbitrage SVI (Martini & Mingone, 2020)](https://arxiv.org/pdf/2005.03340) — HIGH (academic, refines Gatheral conditions)
- [The SVI arbitrage-free volatility surface parameterization (Gatheral, Imperial lectures)](https://www.imperial.ac.uk/media/imperial-college/research-centres-and-groups/cfm-imperial-institute-of-quantitative-finance/events/distinguished-lectures/Gatheral-2nd-Lecture.pdf) — HIGH
- [No arbitrage global parametrization for the eSSVI volatility surface](https://arxiv.org/pdf/2204.00312) — MEDIUM
- [ERC-4626 Tokens in DeFi: Exchange Rate Manipulation Risks (OpenZeppelin)](https://www.openzeppelin.com/news/erc-4626-tokens-in-defi-exchange-rate-manipulation-risks) — HIGH on inflation attack mechanics
- [A Novel Defense Against ERC4626 Inflation Attacks (OpenZeppelin)](https://www.openzeppelin.com/news/a-novel-defense-against-erc4626-inflation-attacks) — HIGH
- [Build Secure ERC-4626 Vaults: Mastering Inflation Attack Prevention](https://medium.com/@regis-graptin/build-secure-erc-4626-vaults-mastering-inflation-attack-prevention-64169912f188) — MEDIUM
- [Critical Bug Patterns in Sui Move: Lessons from Real Audits (OpenZeppelin)](https://www.openzeppelin.com/news/critical-bug-patterns-in-sui-move) — HIGH on TradeCap/visibility/rounding
- [Sui Prover: Bringing Formal Verification to Sui (Mysten blog)](https://blog.sui.io/asymptotic-move-prover-formal-verification/) — HIGH
- [Sui Prover Goes Open Source (BlockEden, 2026-01-20)](https://blockeden.xyz/blog/2026/01/20/sui-prover-formal-verification-smart-contract-security-move/) — HIGH (recent, post-cutoff)
- [Move Smart Contract Audit Checklist (Hacken)](https://hacken.io/discover/move-smart-contract-audit-checklist/) — MEDIUM
- [DeepBook Margin documentation (Sui docs)](https://docs.sui.io/standards/deepbook-margin) — HIGH on Margin parameters
- [DeepBook Margin Design (Sui docs)](https://docs.sui.io/standards/deepbook-margin/design) — HIGH
- [Building Programmable Transaction Blocks (Sui docs)](https://docs.sui.io/guides/developer/sui-101/building-ptb) — HIGH on PTB failure semantics
- [Programmable Transaction Blocks concepts (Sui docs)](https://docs.sui.io/concepts/transactions/prog-txn-blocks) — HIGH
- [Module sui::clock (Sui docs)](https://docs.sui.io/references/framework/sui_sui/clock) — HIGH on Clock semantics
- [Devpost — Video-making best practices](https://help.devpost.com/article/84-video-making-best-practices) — MEDIUM on demo failure modes
- [Best Practices for Web3 Hackathon Project Submissions (HackQuest)](https://www.hackquest.io/blog/Best-Practices-for-Successful-Web3-Hackathon-Project-Submissions) — MEDIUM
- [PROJECT.md](.planning/PROJECT.md) — primary; brief explicitly flags many of these pitfalls

---

*Pitfalls research for: DeepVault — composable structured product on Sui DeepBook Predict (PLP+Hedge vault, SVI dashboard, Python backtest)*
*Researched: 2026-05-09*
*Confidence: HIGH on quant + share-token + Move-vault classes; MEDIUM on Predict-specific churn (contracts 4 days old) and hackathon-submission failure modes (general patterns applied)*
