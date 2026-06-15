# NUMBERS-CANONICAL.md — the single source-of-truth for every publishable figure

**Status:** Canonical (Phase 06, Plan 06-01). **Created:** 2026-06-15.

> **This file is the only place a downstream artifact (whitepaper, README, Devpost
> draft, demo script) may copy a backtest number from.** Every figure below is pasted
> verbatim from a *committed* source and carries (a) its window label and (b) its
> source `file:field`. **Do not recompute. Do not invent. If a number is not in this
> ledger, it is not published** (LD-1, the non-negotiable honesty bar).
>
> Two distinct backtest windows exist and must never be mixed (06-RESEARCH.md §1,
> Pitfall 2): the **full 365-day window** and the **out-of-sample (OOS) 30% holdout**.
> A return from one window placed next to a Sharpe from the other describes a run that
> never happened. Always label the window.

---

## Full-window (365-day) block

**Source:** `.planning/backtest-assumptions.md` L185–208 (git-tracked ledger,
"Validated numbers (365-day window, hedge_ratio = 0.10, run 2026-06-15)").
**These figures are NOT in `full-365d.json`** — the JSON reports only the OOS holdout.

| Figure | Value | Window | Committed source `file:field` |
| --- | --- | --- | --- |
| Total return | **+7.52%** | full-window 365d | `backtest-assumptions.md` L197 |
| PLP yield | +7.14% | full-window 365d | `backtest-assumptions.md` L193 |
| PLP LVR drag | −4.16% | full-window 365d | `backtest-assumptions.md` L194 |
| Hedge cost | −5.43% | full-window 365d | `backtest-assumptions.md` L195 |
| Hedge payoff | +9.98% (1 payoff fired) | full-window 365d | `backtest-assumptions.md` L196 |
| Hedged max drawdown | −1.66% | full-window 365d | `backtest-assumptions.md` L198 |
| Unhedged buy-and-hold BTC max DD | −52.86% | full-window 365d | `backtest-assumptions.md` L199 |

Supporting full-window numerics (same source): realized σ_ann across priced cycles
26.3%–60.3% (mean 40.4%, L189); binary put price p (−15% / 14d) 0.0009–0.0939 (mean
0.028, L190); annual hedge cost 5.43% of NAV (L192).

The full-window total return decomposes exactly as
`total_return = plp_yield − plp_lvr − hedge_cost + hedge_payoff`
= +7.14% − 4.16% − 5.43% + 9.98% = **+7.52%** (`backtest-assumptions.md` L181, L197).

---

## OOS-holdout (recent 30%) block

**Source:** `backtest/reports/full-365d.json` (force-committed in Plan 06-01 — the
machine-generated snapshot; the JSON's top-level keys report the out-of-sample 30%
holdout). These are the **preferred** OOS values (see Rule (c) below).

| Figure | Value | Window | Committed source `file:field` |
| --- | --- | --- | --- |
| OOS APY | −2.30% | OOS holdout | `full-365d.json` `oos_apy` (−0.022970276023766778) |
| OOS Sharpe | −1.87 | OOS holdout | `full-365d.json` `oos_sharpe` (−1.8690399608930919) |
| OOS Sortino | −0.71 | OOS holdout | `full-365d.json` `oos_sortino` (−0.712804447615134) |
| OOS hedged max DD | −0.98% | OOS holdout | `full-365d.json` `oos_max_drawdown_bps` (−98) |
| OOS unhedged BTC max DD | −28.02% | OOS holdout | `full-365d.json` `unhedged_max_drawdown_bps` (−2802) |
| OOS hedge cycles / payoffs | 7 / 0 | OOS holdout | `full-365d.json` `n_hedge_cycles` / `n_hedge_payoffs` |
| OOS total return | −0.69% | OOS holdout | `full-365d.json` `strategy_attribution.total_return` (−0.006947216841157473) |

### OOS hedge-ratio sensitivity table

**Source:** `backtest/reports/full-365d.json` `sensitivity_table[]`. The locked v1
ratio (0.10) is deliberately **not** the OOS-optimal row (0.05 is) — no retrospective
re-tuning (`docs/HEDGE-POLICY.md` §"Re-tuning policy"). Monotonic insurance
cost-of-carry, not an overfit peak.

| hedge_ratio | in_sample_sharpe | OOS Sharpe | OOS max-DD bps | OOS APY |
| --- | --- | --- | --- | --- |
| 0.05 | 1.3696 | +0.5721 | −36 | +0.36% |
| **0.10 (LOCKED v1)** | 1.0841 | −1.8690 | −98 | −2.30% |
| 0.15 | 0.9884 | −2.6953 | −165 | −4.89% |
| 0.20 | 0.9402 | −3.1089 | −238 | −7.42% |
| 0.30 | 0.8913 | −3.5221 | −392 | −12.28% |

---

## Honest framing (LD-1)

The exact one-paragraph story downstream artifacts (whitepaper, README, Devpost)
reuse verbatim — both windows labeled, no number from a window it did not come from:

> **Over the full 365-day window the strategy returned +7.52% (one −15% breach fired;
> payoff +9.98%); in the calm out-of-sample 30% holdout the hedge was a net cost (APY
> −2.30%, Sharpe −1.87) — the honest cost-of-carry of crash insurance.** Over the full
> window, where a −15% breach fired, the tail payoff dominates and the strategy is net
> positive while cutting max drawdown to −1.66% versus −52.86% for buy-and-hold BTC
> (~32× tighter). In the OOS holdout BTC ranged sideways, no breach fired, and the
> insurance was pure premium bleed. This asymmetry — a small steady bleed in calm
> regimes, large protection in a crash — *is* the "PLP yield minus crash insurance"
> profile, presented without inflation.

---

## Rules (binding on every downstream artifact)

(a) **Every published figure MUST carry its window label** ("full-window 365d" or "OOS
holdout"). A bare return or Sharpe with no window label is forbidden.

(b) **Never place a full-window return next to an OOS Sharpe** (or any cross-window
pairing) without explicitly labeling both windows. Mixing windows fabricates a run
that never existed (06-RESEARCH.md Pitfall 2).

(c) **Prefer the JSON values for OOS claims.** `full-365d.json` is the machine-generated
artifact and is canonical for OOS. The git-tracked ledger
(`backtest-assumptions.md` L200–201) reports slightly-drifted OOS values from a
different run (OOS Sharpe −1.92 vs JSON −1.87; OOS APY −2.37% vs JSON −2.30%; OOS
Sortino −0.73 vs JSON −0.71; OOS hedged max DD −0.99% vs JSON −0.98%). Use the JSON
numbers for any OOS claim; do not cite the ledger's OOS drift.

(d) **The +7.52% full-window total return lives ONLY in the ledger
(`backtest-assumptions.md`), not in `full-365d.json`.** Cite full-window claims to
`backtest-assumptions.md`; cite OOS claims to `full-365d.json`. Do not attribute
+7.52% to the JSON.

(e) **Both sources are committed git artifacts.** `backtest/reports/full-365d.json` was
force-added past `.gitignore:54` in Plan 06-01 (LD-1 gate); `backtest-assumptions.md`
is tracked under `.planning/`. On a fresh clone, both numbers exist.
