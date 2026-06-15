# DeepVault Strategy Whitepaper

**Version:** 1.0 (v1, testnet) · **Status:** Submission draft (Sui Overflow 2026, DeepBook track) · **Date:** 2026-06-15

> **Abstract.** DeepVault is a composable structured-product vault on Sui's **DeepBook Predict**
> that fuses **PLP (Predict Liquidity Provision) yield** with an **automated tail-risk hedge** —
> in one phrase, *"PLP yield minus crash insurance."* Each deposit routes a fixed 10% to a
> binary (digital) put bought through Predict, priced off a **raw 5-parameter SVI** volatility
> slice using the same arbitrage-free machinery deployed on-chain by DeepBook Predict; the
> remaining 90% earns PLP yield. The hedge pays out on a sharp BTC drawdown and bleeds a small,
> bounded premium in calm regimes — the honest cost-of-carry of insurance. This document is the
> credibility companion to the code: it states the math, the price formula, the locked sizing
> policy, the worst-case-liquidation analysis, and the risk disclosures, with **every published
> number window-labeled and traced to a committed artifact**. **This v1 is UNAUDITED, admin-paused,
> single-key, and testnet-only** — see [§8 Risk Disclosures](#8-risk-disclosures). It is presented
> without inflation: returns are modest and the out-of-sample window shows a net insurance cost.

---

## Table of Contents

1. [The SVI Volatility Surface](#1-the-svi-volatility-surface)
2. [The Binary Hedge Price](#2-the-binary-hedge-price)
3. [Three-Way Parity Gate](#3-three-way-parity-gate)
4. [Sizing Policy](#4-sizing-policy)
5. [Backtest Results](#5-backtest-results)
6. [Model Assumptions](#6-model-assumptions)
7. [Liquidation Under Worst-Case Predict Outcome](#7-liquidation-under-worst-case-predict-outcome)
8. [Risk Disclosures](#8-risk-disclosures)
9. [References](#references)

---

## 1. The SVI Volatility Surface

DeepVault's hedge is priced from an implied-volatility model. The on-chain pricer evaluates a
**raw 5-parameter SVI (Stochastic Volatility Inspired) total-variance slice** — the same
parameterization DeepBook Predict's oracle uses. SVI is the industry-standard arbitrage-free
volatility parameterization introduced by **Gatheral & Jacquier (2014), "Arbitrage-free SVI
volatility surfaces", arXiv:1204.0646** (<https://arxiv.org/abs/1204.0646>), which we cite as the
framework reference for the raw-SVI form, its no-arbitrage (butterfly) condition, and the
calibration discipline behind it.

### 1.1 The raw-SVI total-variance function

For a single maturity slice, raw SVI expresses total implied variance `w(k)` as a function of the
log-moneyness `k = ln(K / F)` (strike `K`, forward `F`):

```
w(k) = a + b · ( rho·(k − m) + sqrt( (k − m)^2 + sigma^2 ) )
```

with five parameters:

| Parameter | On-chain type | Meaning |
|-----------|---------------|---------|
| `a`     | `u64` | vertical level (overall variance floor) |
| `b`     | `u64` | wing slope (controls smile steepness; `b ≥ 0`) |
| `rho`   | `i64` (signed) | smile asymmetry / skew, in `(−1, +1)` |
| `m`     | `i64` (signed) | horizontal shift (location of the minimum) |
| `sigma` | `u64` | ATM curvature (`sigma > 0`) |

This is **raw 5-parameter SVI** (`a, b, rho, m, sigma`), not SSVI. The on-chain evaluator prices
each maturity **per-slice** with this raw form. (The Risk Studio dashboard renders a 3-D *surface*
across tenors that reads as SSVI-style, but the load-bearing on-chain pricer is the per-slice raw
SVI evaluator — see Pitfall 5 in the phase research.) The parameter shape is fixed verbatim in the
locked spec:

```
SVIParams { a: u64, b: u64, rho: i64, m: i64, sigma: u64 }
```

*(Source: `shared/svi-spec.md` §"Param shape", line 226 — cloned from the vendored Predict
`oracle.move:72-83` at SHA `1159d79a`. Parameterization `raw_svi_5param`: `shared/strategy.toml`
`[svi] parameterization`, line 64.)*

### 1.2 Fixed-point representation

All on-chain SVI math is **integer fixed-point at scale 1e9** (`FLOAT_SCALING = 1_000_000_000`,
matching `deepbook_predict::constants::float_scaling`). A variance of `0.04` is represented as
`40_000_000`; a log-moneyness of `−0.15` as `−150_000_000`. There are **no floats** anywhere on the
pricing path — this is what makes the math bit-reproducible across runtimes (§3). Signed quantities
(`rho`, `m`, intermediate `k`) use an explicit sign-magnitude `i64` representation
(`{ magnitude: u64, is_negative: bool }`, with zero normalized).

The safe input domain is bounded: `|k| ≤ 2.5` (`±2_500_000_000` at 1e9). The vault enforces
`|k| ≤ 2_500_000_000` at the evaluator boundary before pricing, because `(k − m)^2 · b` can
overflow `u64` at extreme strikes with a near-maximal wing slope.

*(Source: `shared/strategy.toml` `[svi] scale = 9`, `k_max_log_strike = 2_500_000_000`, lines 65–68;
`shared/svi-spec.md` §"Max safe input domain", lines 89–104.)*

---

## 2. The Binary Hedge Price

The hedge instrument is a **binary (digital) put**: it pays a fixed unit if BTC settles below the
strike at expiry, and zero otherwise. DeepVault prices it as a **zero-drift Black–Scholes digital
put**, using total variance read from the raw-SVI slice above. This is the production on-chain
pricer (`deepvault::svi_view::binary_price`), reproduced verbatim across all three runtimes.

### 2.1 The price formula

```
binary_price(svi, forward, strike):
  assert forward > 0                                       # EZeroForward
  k                 = ln(strike · F / forward)             # signed, 1e9 fixed-point (cloned ln)
  k_minus_m         = k − svi.m                            # signed
  k_minus_m_squared = (k_minus_m · k_minus_m) / F          # u64
  sigma_squared     = (svi.sigma · svi.sigma) / F          # u64
  sq                = sqrt(k_minus_m_squared + sigma_squared, F)
  rho_km            = (svi.rho · k_minus_m) / F            # signed
  inner             = rho_km + sq                          # signed; assert !is_negative (ECannotBeNegative)
  total_var         = svi.a + (svi.b · |inner|) / F        # u64 = w(k); assert > 0 (EZeroVariance)
  sqrt_var          = sqrt(total_var, F)                   # u64
  half_var          = total_var / 2                        # u64
  d2_numerator      = k + half_var                         # signed
  d2                = −((d2_numerator · F) / sqrt_var)     # signed
  return Phi(d2)                                           # normal CDF, u64 in [0, F]
```

The structure is the textbook digital-put identity: the binary put price equals `Φ(d₂)` under
zero drift, where `d₂` is built from log-moneyness `k` and the SVI total variance `w(k)`. The result
is a probability-like quantity in `[0, F]` — i.e. `[0, 1]` at 1e9 scale.

*(Source: `shared/svi-spec.md` §"Canonical pseudocode", lines 234–251 — the locked contract, cloned
line-for-line from the vendored Predict `oracle.move::compute_nd2`, `oracle.move:400-429`.)*

### 2.2 The normal CDF and the square root

- **`Phi` (normal CDF):** a **Cody (1969)** piecewise rational-Chebyshev approximation over three
  ranges (small `|x| < 0.66291`, medium `|x| < √32`, large tail clamped), ~30 coefficients total.
  The tail error is below `10⁻⁷` at 1e9 scale. *(Source: `shared/svi-spec.md` §"Φ approximation",
  lines 107–155; coefficient table verbatim from vendored `helper/math.move:31-65`, source comment
  "W.J. Cody (1969), as implemented in GSL gauss.c".)*
- **`sqrt`:** integer Newton with a bit-length seed plus **7 unrolled iterations** and an overshoot
  correction. The iteration count is fixed (no convergence detection) — this determinism is the
  cross-runtime parity invariant. *(Source: `shared/svi-spec.md` §"Integer Newton sqrt",
  lines 159–215; vendored `helper/math.move:266-292`.)*

### 2.3 Pricing convention: zero risk-free rate

Per locked pricing convention **D-06**, the risk-free rate `r = 0` is hardcoded. At the 14-day
tenor the discount factor is ≈ 0.998, so the omitted discounting is a **sub-basis-point** correction
that lives inside the arbitrage-check tolerance. We document this assumption explicitly rather than
carry a discount term that cannot move the price at the published precision.

*(Source: `shared/svi-spec.md` §"Pricing convention", D-06, lines 270–272.)*

### 2.4 On-chain misquote abstain

The on-chain pricer ships a **theoretical fair value**. Before any hedge is actually minted,
`vault::rebalance` compares that SVI fair value against Predict's live ask
(`predict::get_trade_amounts`) and **refuses the mint** if Predict's ask exceeds the SVI fair value
by more than **0.5%** (`max_price_premium_bps = 50`). The abort is `EPredictMisquote`. This means
the vault never overpays for crash insurance relative to its own audited model — if the market is
quoting wide, the vault abstains rather than buying into a bad fill.

```move
let (predict_ask_unit, _) = predict::get_trade_amounts(predict, oracle, key, 1, clock);
let max_premium_bps = strategy_constants::max_price_premium_bps();  // 50
assert!(
    (predict_ask_unit as u128) * 10_000u128
        <= (fair_value as u128) * ((10_000 + max_premium_bps) as u128),
    EPredictMisquote,  // abstains if Predict ask > SVI fair value by > 0.5%
);
```

*(Source: `contracts/sources/rebalance.move:264-270`; threshold `max_price_premium_bps = 50` from
`shared/strategy.toml` `[hedge_policy]`, line 29.)*

---

## 3. Three-Way Parity Gate

The hedge math is not merely specified — it is **proven bit-equal across three independent
implementations**: the on-chain **Move** evaluator, the **Python** backtest evaluator, and the
**TypeScript** dashboard evaluator. All three are cloned line-for-line from the vendored Predict
reference at SHA `1159d79a` and asserted equal on a shared corpus of golden vectors.

- **Corpus:** `shared/golden-vectors.json` holds **141** vectors:
  - **Tier A = 21** — Gatheral & Jacquier (2014) worked examples (academic provenance).
  - **Tier B = 100** — synthetic inputs plus an arbitrage-violating sub-tier (rejection coverage).
  - **Tier C = 20** — cross-checks (JackJacquier SSVI + Predict-test vectors).
- **Tolerance:** 1 unit at 1e9 (forward-defense). Empirically **all 141 vectors pass at exact
  equality** across Move, Python, and TypeScript.
- **CI enforcement:** the `parity` job (one of a six-job matrix) blocks the build on any
  bit-inequality, and additionally runs a **forbidden-token grep** on the TypeScript evaluator
  (no `Number`, `Math.*`, or `parseFloat` — bigint-only) so the TS path can never silently drift
  into float arithmetic.

This three-way gate is the project's core correctness claim: the number the dashboard shows, the
number the backtest uses, and the number the chain computes are the *same* number, to the wei.

*(Source: `shared/golden-vectors.json` (141 vectors, git-tracked); `backtest/tests/test_gatheral_paper_vectors.py:7`
cites arXiv:1204.0646; parity-gate details per Phase 01-07/01-08 — the spec's older "120 vectors"
note at `svi-spec.md:305-318` is stale; the real corpus is 141 total / 21 Tier-A Gatheral.)*

---

## 4. Sizing Policy

The hedge sizing policy is **locked and frozen**: it was committed in writing **before the backtest
opened** (to prevent hindsight tuning) and permanently frozen at Phase 3 close. The bounds are the
single source of truth in `shared/strategy.toml [hedge_policy]`, code-generated into all three
runtimes.

| Parameter | Value | `strategy.toml` field |
|-----------|-------|------------------------|
| **Allocation** | 10% of each new deposit | `allocation_bps = 1000` |
| **Strike** | −15% out-of-the-money (binary put 15% below BTC spot at mint) | `strike_otm_bps = 1500` |
| **Tenor** | 14 days (1,209,600 s) | `tenor_seconds = 1209600` |
| **Roll trigger** | roll when expiry < 2 days (172,800 s) | `roll_trigger_seconds = 172800` |
| **Sizing function** | `fixed` (v1; `dynamic` reserved for v2) | `sizing_function = "fixed"` |
| **Misquote abstain** | refuse mint if Predict ask > SVI fair value by > 0.5% | `max_price_premium_bps = 50` |

**Rationale (summary):** 10% allocation is the center of the institutional DOV-class tail-hedge
norm and preserves >85% of PLP APY in normal regimes; −15% OTM targets −2σ to −3σ weekly BTC moves
(the "crash insurance" band); a 14-day tenor with a 2-day roll trigger yields ~12-day non-overlapping
cycles that balance vol decay against roll transaction cost; fixed sizing in v1 trades a buggy
dynamic policy for a correct fixed one under deadline, with the `sizing_function` knob left in place
so a v2 phase can swap to a dynamic (vol-target / drawdown-target) policy without touching vault
internals.

*(Source: `shared/strategy.toml [hedge_policy]`, lines 24–29; `docs/HEDGE-POLICY.md` decision table
(L15–21) and per-parameter rationale (L30–52).)*

### 4.1 Re-tuning policy — the honest framing

The policy may be re-tuned **only** on out-of-sample-aware walk-forward analysis during the Phase 3
backtest:

1. Calibrate on a rolling **60-day in-sample** window.
2. Test on the next **14-day out-of-sample** window only.
3. Walk forward.
4. Reserve the final **30% of history as a held-out validation set, never touched during
   calibration**.

After Phase 3 close this is **frozen permanently**. Explicitly forbidden: re-tuning after seeing
testnet stress results, after seeing mainnet smoke-test behavior, or "polishing" a parameter for the
demo. The governing principle is stated verbatim in the ADR:

> *"If the locked policy underperforms in backtest, document the underperformance and ship with the
> principled choice."*

This rule is the reason the [backtest results in §5](#5-backtest-results) report an honest negative
out-of-sample number instead of a re-tuned flattering one: the locked 10% ratio is deliberately
**not** the out-of-sample-optimal choice, and we do not retro-fit it to become so.

*(Source: `docs/HEDGE-POLICY.md` §"Re-tuning policy", L54–68; the quoted principle is L68.)*

---

## 5. Backtest Results

> **Honest framing (read this first).** Over the full 365-day window the strategy returned
> **+7.52%** (one −15% breach fired; payoff **+9.98%**); in the calm out-of-sample 30% holdout the
> hedge was a **net cost** (APY **−2.30%**, Sharpe **−1.87**) — the honest cost-of-carry of crash
> insurance. Over the full window, where a −15% breach fired, the tail payoff dominates and the
> strategy is net positive while cutting max drawdown to **−1.66%** versus **−52.86%** for
> buy-and-hold BTC (~32× tighter). In the OOS holdout BTC ranged sideways, no breach fired, and the
> insurance was pure premium bleed. This asymmetry — a small steady bleed in calm regimes, large
> protection in a crash — *is* the "PLP yield minus crash insurance" profile, presented without
> inflation.

Two distinct backtest windows exist, and **they must never be mixed**: a return from one window
placed next to a Sharpe from the other describes a run that never happened. Every figure below
carries its window label and its committed source.

### 5.1 Full-window (365-day) block

*Source: `.planning/backtest-assumptions.md` (git-tracked ledger, "Validated numbers, 365-day
window, hedge_ratio = 0.10, run 2026-06-15"). These full-window figures are **not** in
`full-365d.json` — the JSON reports only the OOS holdout.*

| Figure | Value | Window |
|--------|-------|--------|
| Total return | **+7.52%** | full-window 365d |
| PLP yield | +7.14% | full-window 365d |
| PLP LVR drag | −4.16% | full-window 365d |
| Hedge cost | −5.43% | full-window 365d |
| Hedge payoff | +9.98% (1 payoff fired) | full-window 365d |
| Hedged max drawdown | −1.66% | full-window 365d |
| Unhedged buy-and-hold BTC max DD | −52.86% | full-window 365d |

The full-window total return decomposes exactly:

```
total_return = plp_yield − plp_lvr − hedge_cost + hedge_payoff
             = +7.14%   − 4.16%   − 5.43%      + 9.98%
             = +7.52%
```

### 5.2 Out-of-sample holdout (recent 30%) block

*Source: `backtest/reports/full-365d.json` (force-committed in Plan 06-01 — the machine-generated
snapshot; its top-level keys report the out-of-sample 30% holdout). These are the preferred OOS
values.*

| Figure | Value | Window |
|--------|-------|--------|
| OOS APY | **−2.30%** | OOS holdout |
| OOS Sharpe | **−1.87** | OOS holdout |
| OOS Sortino | −0.71 | OOS holdout |
| OOS hedged max DD | −0.98% | OOS holdout |
| OOS unhedged BTC max DD | −28.02% | OOS holdout |
| OOS hedge cycles / payoffs | 7 / 0 (calm regime) | OOS holdout |
| OOS total return | −0.69% | OOS holdout |

### 5.3 Hedge-ratio sensitivity (out-of-sample)

*Source: `backtest/reports/full-365d.json` `sensitivity_table[]`.*

| hedge_ratio | in-sample Sharpe | OOS Sharpe | OOS max-DD bps | OOS APY |
|-------------|------------------|------------|----------------|---------|
| 0.05 | 1.3696 | +0.5721 | −36 | +0.36% |
| **0.10 (LOCKED v1)** | 1.0841 | −1.8690 | −98 | −2.30% |
| 0.15 | 0.9884 | −2.6953 | −165 | −4.89% |
| 0.20 | 0.9402 | −3.1089 | −238 | −7.42% |
| 0.30 | 0.8913 | −3.5221 | −392 | −12.28% |

The table shows a **monotonic insurance cost-of-carry**, not an overfit peak: more hedge spend buys
more drawdown protection at strictly more premium bleed in the calm OOS regime. Critically, the
locked v1 ratio of **0.10 is *not* the OOS-optimal row** — `0.05` is (OOS Sharpe +0.5721, APY +0.36%).
By the [§4.1 re-tuning policy](#41-re-tuning-policy--the-honest-framing) we do **not** retro-fit the
locked ratio to the holdout; we ship the principled choice committed before the backtest opened and
disclose the gap. This is the integrity cost we pay for a credible number.

*(All §5 figures are quoted verbatim from `NUMBERS-CANONICAL.md` (Plan 06-01), the single
window-labeled numbers ledger; full-window claims cite `backtest-assumptions.md`, OOS claims cite
`backtest/reports/full-365d.json`. Nothing here was recomputed.)*

---

## 6. Model Assumptions

The backtest returns above come from an economic simulation (`strategy_sim.py`), **not** from the
on-chain SVI pricing path. The model is deliberately conservative; its load-bearing assumptions are
disclosed here in full so a reader can judge the numbers honestly.

- **PLP yield = 8% APY is an assumption, not a measured Predict yield.** `PLP_APY = 0.08` is a
  conservative placeholder (Predict PLP markets quote double-digit; we picked a defensible value
  over a promotional one). It is *not* a realized on-chain return.
  *(Source: `strategy_sim.py:88`; `backtest-assumptions.md` §"Strategy Simulation Model".)*
- **LP inventory drag = 0.25 LVR coefficient.** `PLP_LVR_COEFF = 0.25` models variance-scaled
  Loss-Versus-Rebalancing (Milionis, Moallemi & Roughgarden, 2022) — roughly 4–5%/yr on BTC. It
  injects realistic per-bar NAV variance; without it the OOS Sharpe was an indefensible ~7.7.
  *(Source: `strategy_sim.py:98`; ledger.)*
- **Two different pricing paths — stated explicitly.** The **backtest** prices each hedge with a
  zero-drift Black–Scholes digital put using **trailing-30-day realized volatility as the IV
  proxy** (there is no historical IV surface for testnet BTC; a Deribit feed is deferred to v2). The
  **on-chain** vault prices hedges with the audited **raw-SVI evaluator** of [§2](#2-the-binary-hedge-price).
  These are *different pricing paths*: the backtest approximates IV from realized vol, while
  production reads the SVI slice from the Predict oracle. We do not claim the backtest priced
  through the on-chain SVI evaluator.
  *(Source: `strategy_sim.py:47-62, 138-158`; ledger §"Strategy Simulation Model".)*
- **Coverage-based sizing.** Target payout = `hedge_ratio × NAV`, with premium capped at
  `hedge_ratio × NAV × (tenor / 365)`. (A naive `notional = premium / p` produced ~1000:1 jackpots
  at low `p` — an economic bug that was fixed.)
- **Other v1 conventions:** settlement = **expiry-spot** (a hedge that dips below the strike
  intraperiod but recovers does *not* pay — a v1 simplification, not path-minimum); `fees_bps = 0`;
  `gas = 1 bp/PTB`; `rf = 0`; `BARS_PER_YEAR = 8760`.

### 6.1 Lookahead-bias audit

The backtest passes a lookahead-bias audit. The audit machinery is
`backtest/src/deepvault/lookahead_audit.py`, with results recorded in `backtest-assumptions.md`
§"Lookahead-Bias Audit":

- **Shuffled-label sanity (gate D-06):** a shuffled-label test confirms `|alpha| ≤ 0.005` — i.e. the
  strategy earns no return on randomized labels, so it is not peeking at future bars.
- **Hand-recompute (gate D-07):** a 3-row hand-recompute (seed 42) reconciles the engine output to
  the wei.

> **Provenance note (honesty):** the HTML report's "shuffled-label" and "hand-recompute" summary
> blocks are **rendered stubs** in the summary-based render path and are *not* the audit. The
> lookahead-audit claim above is grounded in the `lookahead_audit.py` module, its tests, and the
> assumptions ledger — **not** the HTML stub block.

*(Source: `backtest/src/deepvault/lookahead_audit.py` + `backtest-assumptions.md` §"Lookahead-Bias
Audit"; renderer-stub caveat per phase research §1.)*

---

## 7. Liquidation Under Worst-Case Predict Outcome

DeepVault's hedge book interacts with a Margin position, so the relevant solvency question is:
*what happens to NAV-per-share if every open hedge is worthless at once?* The vault answers this with
a deliberately pessimistic valuation.

### 7.1 Worst-case NAV-per-share

Under the worst-case Predict outcome, **all open binaries expire worthless**, so the worst-case
NAV-per-share collapses to the **liquid quote balance ÷ total shares** — it does *not* count the
hedge cost basis, because "all hedges expire worthless" means "the cost-basis quote that was sent to
Predict is gone." The computation calls **no** SVI evaluator on this path (zero blast radius for the
Margin liquidation path) and applies no time-decay discount (instantaneous):

```move
public fun worst_case_nav_per_share<Quote>(vault: &Vault<Quote>): u64 {
    let total_shares = vault::total_shares(vault);
    assert!(total_shares > 0, EZeroShares);
    math::mul_div_round_down(
        vault::balance_value(vault),     // LIQUID balance only — hedges assumed worthless
        strategy_constants::nav_scale(), // 1e9
        total_shares,
    )
}
```

*(Source: `contracts/sources/ltv.move:60-68`.)*

### 7.2 The compound −60% shock

A pure −30% balance shock at the 50% LTV-open cap does *not* algebraically cross the liquidation
gate (`risk_ratio = 0.7 / 0.5 = 14,000 bps > 11,500 bps`). The realistic worst case compounds two
adverse events — **all open binaries expire worthless AND vault collateral takes a 30% haircut** —
into a **−60% effective magnitude** on the liquid balance. Under that compound shock:

```
risk_ratio_bps = 8_101  <  11_500  (LIQUIDATION_LTV_BPS)  ⇒  liquidation fires
```

This is proven **bit-equal across Move and Python** with hardcoded 1-wei parity anchors:

| Anchor | Value | Meaning |
|--------|-------|---------|
| `wcn_pre`  | `9_009_900_990` | worst-case NAV-per-share before the −30% balance shock |
| `wcn_post` | `6_306_930_693` | worst-case NAV-per-share after the −30% balance shock |

A parametrized shock sweep from −5% to −90% confirms the formula is bit-equal across the full range,
and a −5% healthy shock correctly **aborts** liquidation (`ENotLiquidatable`). The policy anchor is
`worst_case_settlement_haircut_bps = 10000` (100%) — the vault assumes a *full* adverse Predict
outcome for LTV purposes.

*(Source: `contracts/sources/ltv.move`; `contracts/tests/liquidation_test.move` (3 tests);
`backtest/tests/test_liquidation_parity.py` (11 tests); `shared/strategy.toml` `[ltv]
worst_case_settlement_haircut_bps = 10000`, line 49.)*

---

## 8. Risk Disclosures

DeepVault v1 is a hackathon submission. It is presented honestly; the following disclosures are
material.

- **UNAUDITED.** There is **no third-party security audit** of the Move contracts. A formal audit is
  deferred to v2. Do not treat this code as production-grade or audited.
- **Admin-paused, single-key.** The `AdminCap` is **key-only and non-transferable in v1**. It can
  pause new deposits and tune a small set of strategy parameters, but it **cannot** relax Predict's
  30-second oracle-staleness gate (that gate is enforced by Predict, not by DeepVault). Custody of
  this single key is a centralization risk for v1.
- **Testnet-only.** The deployed vault runs on Sui **testnet**. Predict did not ship on mainnet in
  the submission window; the mainnet deploy is a documented, single-config-flip ≤30-minute procedure
  deferred to post-submission (`docs/MAINNET-READINESS.md`).
- **Fixed-ratio v1 / hedge-cost drag.** Sizing is a fixed 10% ratio (no dynamic policy in v1). As
  [§5](#5-backtest-results) shows, in calm regimes the hedge is a steady premium bleed (OOS APY
  −2.30%). The strategy is net positive only when a tail event actually fires.

**Mitigations that *are* in place (and proven):**

- **Inflation-attack defense** — virtual shares (10⁶ decimals offset) plus a 10-DUSDC seed burned to
  `@0xdead` (an OpenZeppelin ERC-4626 v5 port).
- **Per-hedge misquote abstain** — `EPredictMisquote` refuses any mint priced more than 0.5% above
  the vault's own SVI fair value (see [§2.4](#24-on-chain-misquote-abstain)).
- **Capability containment** — `TradeCap` / `TreasuryCap` never escape their modules, proven by
  `ptb_capability_test.move`, `test_ptb_capability_grep.py`, and two Sui Prover specs.

**Honest scope note on the two-protocol PTB.** DeepVault's flagship composability moment is a single
programmable transaction block that opens a Margin position, supplies the vault, and mints the hedge
atomically. This 5-call PTB is **architecturally proven via the `mock_margin_pool` integration test
(the shape compiles and runs)**; the **live testnet Margin leg is pending** Mysten's DUSDC Margin
pool (none exists on testnet today). The honestly-filmable end-to-end demo is `make demo`:
supply + a **real on-chain hedge mint** through Predict + redeem. **We do not claim a live
Margin-Predict PTB.**

*(Sources: `shared/strategy.toml` `[inflation_defense]`; `contracts/sources/rebalance.move`;
capability tests + Sui Prover specs per Phase 02-07; `docs/MAINNET-READINESS.md`; two-protocol PTB
status per phase research Pitfall 3.)*

---

## References

1. **Gatheral, J. & Jacquier, A. (2014).** *Arbitrage-free SVI volatility surfaces.* arXiv:1204.0646.
   <https://arxiv.org/abs/1204.0646> — the raw-SVI parameterization and no-arbitrage framework.
2. **Milionis, J., Moallemi, C. C. & Roughgarden, T. (2022).** *Automated Market Making and
   Loss-Versus-Rebalancing.* — the LVR model behind the backtest's LP inventory drag.
3. **W. J. Cody (1969).** Rational Chebyshev approximation of the normal CDF (as implemented in GSL
   `gauss.c`) — the on-chain `Phi`.
4. `shared/svi-spec.md` — the locked SVI math contract (param shape, `binary_price` pseudocode,
   pricing conventions), cloned from vendored Predict `oracle.move` at SHA `1159d79a`.
5. `shared/strategy.toml` + `docs/HEDGE-POLICY.md` — the locked sizing-policy bounds and the
   re-tuning ADR.
6. `backtest/reports/full-365d.json` — the committed backtest report (OOS holdout snapshot);
   full-window figures in `.planning/backtest-assumptions.md`. Window-labeled and reconciled in
   `NUMBERS-CANONICAL.md`.
7. `contracts/sources/ltv.move`, `contracts/tests/liquidation_test.move`,
   `backtest/tests/test_liquidation_parity.py` — the worst-case-liquidation analysis.

---

*DeepVault v1 — Sui Overflow 2026 (DeepBook track). Every performance figure in this document is
window-labeled and traces to a committed artifact via `NUMBERS-CANONICAL.md` (the project's
non-negotiable honesty bar). This v1 is unaudited, admin-paused, single-key, and testnet-only.*
