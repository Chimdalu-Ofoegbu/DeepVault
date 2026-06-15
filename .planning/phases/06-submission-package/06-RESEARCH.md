# Phase 6: Submission Package — Research

**Researched:** 2026-06-15
**Domain:** Documentation/artifact assembly (README polish, architecture SVG, strategy whitepaper, demo-video script, Devpost draft, backtest report export) under a strict honesty bar (LD-1)
**Confidence:** HIGH (all source material located in-repo and quoted with file:line; the few gaps are flagged explicitly)

## Summary

This phase produces only docs/artifacts — no new product code. The job is to **extract and verify the real source material** so the planner/executors never invent a number. I traced every Phase-6 deliverable to its committed source and found the source material is **almost entirely present and real**, but with **four landmines the planner MUST handle before any artifact is written**:

1. **The backtest report files are GITIGNORED.** `backtest/reports/full-365d.json` and `...-report.html` exist with real numbers but are excluded by `.gitignore:50` and `.gitignore:54`. Under LD-1 ("if a number isn't in a committed artifact, it is not published"), **no backtest number is publishable until the report is force-committed OR the numbers are sourced from an already-tracked artifact.** [VERIFIED: `git check-ignore`]
2. **Two different headline number sets exist, with different windows.** The committed JSON reports the **OOS-window** headline (APY **−2.30%**, Sharpe −1.87, 0 hedge payoffs). The git-tracked ledger `.planning/backtest-assumptions.md` + `03-10-SUMMARY.md` report a **full-window** headline (**+7.52%** total return, 1 payoff, hedged max DD −1.66% vs unhedged BTC −52.86%). They are not contradictory (different windows) but they ARE different numbers and slightly different OOS values (−2.30% vs −2.37%, Sharpe −1.87 vs −1.92) from different runs. The planner must pick ONE canonical source per claim and label the window precisely.
3. **The "single PTB opening Margin + Predict + vault share atomically" (DEPLOY-05 headline) CANNOT be filmed against live testnet.** No DUSDC margin pool exists on testnet (MARGIN-WHITELIST = UNDETERMINED-FALLBACK-TO-MOCK); `two-protocol-ptb-demo.ts` gracefully exits 0 (skips) when Margin pool IDs are absent. The two-protocol PTB is proven only by `mock_margin_pool` Move tests. The honestly-filmable demo is `make demo` → supply + **real on-chain hedge mint** + redeem (no Margin).
4. **README is stale and has 4 broken links.** It says "Phase 0 COMPLETE / Phase 1 next-up" (project is at Phase 04.2) and references `docs/MAINNET-FUNDING.md` 4× — that file was renamed to `docs/MAINNET-READINESS.md`.

The testnet vault IS deployed with real, canonical addresses (`TESTNET-DEPLOY.json`, git-tracked, `status: "deployed"`, real `deploy_tx_digest`). SVI math, hedge policy, golden vectors, liquidation anchors, and the four-tier architecture all have real committed source. STATE.md and 05-VERIFICATION.md are stale (they predate the testnet deploy + the Phase-04 dashboard); the actual code is further along than the metadata says.

**Primary recommendation:** Before writing artifacts, the planner must (a) decide the report-commit strategy (force-add past gitignore is the recommended path — see Pitfall 1), (b) pick the canonical number set + window per claim from the table in §1, and (c) re-scope DEPLOY-05's demo claim to what is honestly filmable (supply+hedge+redeem live; two-protocol PTB as "architecturally proven via mock + documented-future on live testnet").

## Architectural Responsibility Map

This phase is documentation; "tiers" map to which artifact owns which content.

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Published return/risk numbers | Backtest JSON / ledger | Whitepaper, README, Devpost | Single number-source-of-truth; everything else cites it (LD-1) |
| SVI math correctness narrative | `shared/svi-spec.md` + golden vectors | Whitepaper | Spec is the Phase-1 contract; whitepaper summarizes with citations |
| Sizing policy bounds | `shared/strategy.toml` + `docs/HEDGE-POLICY.md` | Whitepaper | strategy.toml is runtime SoT; HEDGE-POLICY is the ADR |
| Testnet contract addresses | `TESTNET-DEPLOY.json` | README, Devpost, demo script | One canonical JSON; README/Devpost cite it verbatim |
| Reproducible demo | `Makefile` + `scripts/testnet-smoke-test.sh` | README, demo script | `make demo` is the judge-facing entry point |
| Architecture content | `.planning/research/ARCHITECTURE.md` + real code roots | `docs/architecture.svg` | SVG depicts the 4 real tiers |

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions (verbatim from CONTEXT.md `## Locked Decisions`)

- **LD-1 — Honesty bar (non-negotiable).** The whitepaper, README, and Devpost draft use ONLY real numbers from the committed Phase 03 backtest outputs (`reports/full-365d.json` / the rendered report). Modest, believable returns with honest drawdown and hedge-cost drag — NO fabricated, rounded-up, or implausible figures. If a number isn't in a committed artifact, it is not published. Every performance claim cites its source artifact. (Honors the standing "ship no implausible numbers" constraint.)
- **LD-2 — Strategy whitepaper** → `docs/WHITEPAPER.md` (Markdown, GitHub-renderable, Gatheral-style, target 6–12 "pages" of content). MUST cover, with citations: (a) SSVI / raw-SVI math (cite Gatheral & Jacquier 2014, "Arbitrage-free SVI volatility surfaces"); (b) the hedge price formula (binary / digital pricing off the SVI surface as implemented in the Predict oracle clone); (c) sizing policy bounds (fixed `allocation_bps = 1000` = 10%, `strike_otm_bps = 1500`, `tenor = 14d`, `roll_trigger = 2d` — from `shared/strategy.toml` / `docs/HEDGE-POLICY.md`); (d) a liquidation-under-worst-case-Predict-outcome section (the −60% compound shock analysis from Phase 03-07); (e) risk disclosures. Source the math from `shared/svi-spec.md`, the golden vectors, and the three-way parity gate; source returns from the backtest report.
- **LD-3 — Architecture diagram** → `docs/architecture.svg`, hand-authored SVG (GitHub-renderable as a committed file; no build dependency). Depict the FOUR tiers — (1) Move package (vault + Predict adapter + SVI evaluator on Sui), (2) event relay/indexer (Node `queryEvents` → WS), (3) React dashboard (Vault + Risk Studio), (4) Python backtest harness — with data-flow arrows, and call out the two-protocol single-PTB composability moment (Margin + Predict + vault share atomic open). Embed/reference it in the README.
- **LD-4 — README** → polish the EXISTING `README.md` (already advanced in Phase 0/5; do not rewrite from scratch). Guarantee the DEPLOY-06 cold-read criteria: one-paragraph laypitch, glossary, prerequisites, a reproducible `make demo` (→ `scripts/testnet-smoke-test.sh`) path, testnet contract addresses, and links to the whitepaper, the exported backtest report, the architecture diagram, and `docs/MAINNET-READINESS.md`. The cold-read test itself (a fresh-eyes pass) is part of acceptance.
- **LD-5 — Demo-video script** → `docs/DEMO-SCRIPT.md`: a shot-by-shot ~3-minute storyboard (timestamps, on-screen narration, the exact testnet PTB command(s) to run on camera, where the wallet-diff and the pasteable tx digest appear, and the ~10s mainnet-readiness sidebar). This is the autonomous deliverable for DEPLOY-05; the recording is a human-action checkpoint.
- **LD-6 — Devpost draft** → `docs/DEVPOST-SUBMISSION.md`: a complete, paste-ready draft with title, tagline, the four standard Devpost sections (inspiration / what it does / how we built it / challenges / accomplishments / what's next), testnet contract addresses, repo URL, a demo-video-link placeholder, the backtest-report link, and the mainnet-readiness pointer. This is the autonomous deliverable for DEPLOY-10; filing on the portal is a human-action checkpoint.
- **LD-7 — Backtest report export** → run the existing Phase 03-09 report CLI (`python -m deepvault walk_forward --window-days 365 --out reports/full-365d.json` then the HTML renderer) to produce/refresh `reports/full-365d-report.html` as the attachable artifact. If the committed report already exists and is current, reuse it; otherwise regenerate. Do NOT hand-edit the numbers.

### Autonomy Boundary (verbatim — drives task `autonomous` flags)

**AUTONOMOUS (produce now, fully):** DEPLOY-06 (README polish), DEPLOY-07 (architecture SVG), DEPLOY-08 (whitepaper), Backtest HTML report export, DEPLOY-05 preparatory (demo script/storyboard + exact testnet PTB commands + mainnet-readiness sidebar narration), DEPLOY-10 preparatory (complete Devpost draft, all fields filled).

**HUMAN-ACTION CHECKPOINTS (`autonomous: false` — DO NOT execute; document and hold):** DEPLOY-05 recording (needs human + funded testnet wallet running live PTBs on camera — plan delivers script, recording is the user's); DEPLOY-10 filing (Devpost/Sui Overflow portal — plan delivers draft, filing is the user's); mainnet redeploy (already deferred, out of scope here). Each human-action checkpoint task MUST still exist in a plan and produce its preparatory artifact.

### Out of Scope / Human-Action (held for the user)

- Recording the demo video (DEPLOY-05 recording).
- Filing on Devpost / Sui Overflow portal (DEPLOY-10 filing).
- Mainnet redeploy (deferred to post-submission per DEPLOY-09 / `docs/MAINNET-READINESS.md`).
- `git push` (gated by the user explicitly).

### Open Questions (resolved with recommendation; do not block)

- **Whitepaper format:** Markdown (`docs/WHITEPAPER.md`). **Diagram authoring:** committed SVG (`docs/architecture.svg`). **Backtest report:** reuse if current; regenerate only if stale or missing — never hand-edit (LD-1).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DEPLOY-05 | Demo video (~3 min) against TESTNET showing the single PTB opening Margin + Predict + vault share atomically, wallet-diff + tx digest visible; ~10s mainnet-readiness sidebar. (Phase 6: script only — recording is human-action.) | §7 PTB demo facts. **CRITICAL re-scope: the live two-protocol PTB cannot be filmed (no DUSDC margin pool — §7 + Pitfall 3). Filmable: `make demo` supply+hedge+redeem + tx digest on suiscan. Two-protocol PTB shown as architecturally-proven via mock + documented-future.** |
| DEPLOY-06 | README: laypitch, glossary, prerequisites, reproducible `make demo`, cold-read tested | §6 README gap list. Laypitch/glossary/prereqs already present; deltas = stale status, 4 broken MAINNET-FUNDING links, placeholder testnet addresses, missing whitepaper/report/SVG links |
| DEPLOY-07 | Architecture diagram (PNG/SVG, GitHub-renderable) showing all components + data flow | §5 architecture inventory — all 4 tiers exist as real committed code; `.planning/research/ARCHITECTURE.md` is the content source |
| DEPLOY-08 | Strategy whitepaper (Gatheral-style 6–12pp): SSVI math, hedge price formula, sizing bounds, liquidation-under-worst-case section, risk disclosures | §2 SVI math + §3 sizing + §4 liquidation + §1 backtest numbers. All sourced |
| DEPLOY-10 | Submission package complete on Devpost/Sui Overflow portal | §7 addresses + repo URL + report link. (Phase 6: draft only — filing is human-action.) |
</phase_requirements>

---

## 1. Backtest Numbers (DEPLOY-08 + Devpost + README) — CRITICAL

### Where the numbers live (NOT where CONTEXT.md says)

**CONTEXT.md and LD-7 reference `reports/full-365d.json`. The actual committed files are at `backtest/reports/`** (the CLI's `--out` is relative to CWD; the canonical run lands them under `backtest/`):

- `backtest/reports/full-365d.json` (25,557 bytes, mtime 2026-06-15 04:34) [VERIFIED: filesystem]
- `backtest/reports/full-365d-report.html` (4,957,703 bytes ≈ 4.96 MB, mtime 2026-06-15 04:37; under the 5 MB ceiling) [VERIFIED: filesystem]

### ⚠️ HONESTY-BAR LANDMINE: both report files are GITIGNORED

```
.gitignore:49  # Phase 3 backtest cache (gitignored — large parquet, fetched on demand)
.gitignore:50  backtest/data/
.gitignore:52  # Phase 3 backtest generated reports (regenerated on demand ...)
.gitignore:54  backtest/reports/
```
`git ls-files backtest/reports/` → empty; `git log` on either file → no commits. [VERIFIED: `git check-ignore -v`, `git ls-files`]

**Under LD-1's exact wording ("If a number isn't in a committed artifact, it is not published"), the JSON is NOT currently a committed artifact.** See Pitfall 1 for the fix (force-add `git add -f`, recommended). The 03-10-SUMMARY explicitly notes the report is "gitignored" (line 213).

### Headline figures — verbatim from `backtest/reports/full-365d.json` [VERIFIED: file read]

These are the **OOS-window** headline values (the JSON's top-level keys report the out-of-sample 30% holdout):

| Field path | Value | Meaning |
|---|---|---|
| `window_days` | `365` | full data window |
| `bars` | `8760` | hourly bars (365×24) |
| `oos_apy` | `-0.022970276023766778` | **OOS APY ≈ −2.30%** |
| `oos_sharpe` | `-1.8690399608930919` | **OOS Sharpe ≈ −1.87** |
| `oos_sortino` | `-0.712804447615134` | OOS Sortino ≈ −0.71 |
| `oos_max_drawdown_bps` | `-98` | **OOS hedged max DD = −0.98%** |
| `oos_underwater_bars` | `2566` | longest underwater run |
| `unhedged_max_drawdown_bps` | `-2802` | **buy-and-hold BTC max DD over OOS = −28.02%** |
| `n_hedge_cycles` | `7` | **7 hedge cycles** |
| `n_hedge_payoffs` | `0` | **0 payoffs in OOS (calm regime)** |
| `strategy_attribution.plp_yield` | `0.020650924207626247` | OOS PLP yield +2.07% |
| `strategy_attribution.plp_lvr` | `0.012494332014334789` | OOS PLP LVR drag −1.25% |
| `strategy_attribution.hedge_cost` | `0.01510380903444893` | OOS hedge premium −1.51% |
| `strategy_attribution.hedge_payoff` | `0.0` | OOS hedge payoff +0.00% |
| `strategy_attribution.total_return` | `-0.006947216841157473` | **OOS total return = −0.69%** |
| `pnl_attribution_summary.total_bps_mean` | `-69.47216841157473` | net −69.5 bps (OOS) |
| `risk_metrics_cross_check.sharpe` | `-1.8690399608930919` | cross-check matches `oos_sharpe` |

**Sensitivity table** (`sensitivity_table[]`, OOS Sharpe / max-DD bps / APY by hedge ratio) [VERIFIED]:

| hedge_ratio | in_sample_sharpe | oos_sharpe | oos_max_dd_bps | oos_apy |
|---|---|---|---|---|
| 0.05 | 1.3696 | **+0.5721** | −36 | +0.36% |
| **0.10 (LOCKED v1)** | 1.0841 | **−1.8690** | −98 | −2.30% |
| 0.15 | 0.9884 | −2.6953 | −165 | −4.89% |
| 0.20 | 0.9402 | −3.1089 | −238 | −7.42% |
| 0.30 | 0.8913 | −3.5221 | −392 | −12.28% |

The locked v1 ratio (0.10) is **not** the OOS-optimal row (0.05 is) — this is by design (no retrospective re-tuning, HEDGE-POLICY.md §"Re-tuning policy"). The sensitivity table shows monotonic insurance cost-of-carry, not an overfit peak.

**Per-cycle hedge trades** (`hedge_trades[]`, 7 cycles) — all have `"payoff": 0.0`; spot ranged 66,061–81,630, strikes 56,152–69,386, `binary_price` 0.0045–0.0914, `sigma_ann` 0.314–0.597. [VERIFIED] First cycle: `ts_ms=1773244800000`, `spot_open=70570.71`, `strike=59985.10`, `binary_price=0.0914`, `premium=0.00383`. Monthly PnLs (`monthly_pnls`): 2026-02 −0.017%, 2026-03 −0.635%, 2026-04 −0.203%, 2026-05 +0.232%, 2026-06 −0.074%.

### ⚠️ The full-window +7.52% number is NOT in the committed JSON

The JSON contains only OOS headline + OOS attribution. The **+7.52% full-window** story lives ONLY in two git-tracked markdown artifacts:

- `.planning/backtest-assumptions.md` lines 185–208 ("Validated numbers (365-day window, hedge_ratio = 0.10, run 2026-06-15)") [VERIFIED: git-tracked]
- `.planning/phases/03-backtest-harness-two-protocol-ptb/03-10-SUMMARY.md` lines 123–158 [VERIFIED: git-tracked]

**Full-window figures (ledger + summary, NOT in JSON):**

| Quantity | Value | Source |
|---|---|---|
| PLP yield (full-window cum) | +7.14% | assumptions L193 / summary L133 |
| PLP LVR drag (full-window cum) | −4.16% | assumptions L194 / summary L134 |
| Hedge cost (full-window cum) | −5.43% | assumptions L195 / summary L135 |
| Hedge payoff (full-window cum) | +9.98% (**1 payoff fired**) | assumptions L196 / summary L136 |
| **Total return (full window)** | **+7.52%** | assumptions L197 / summary L137 |
| Hedged max drawdown (full window) | −1.66% | assumptions L198 / summary L138 |
| Unhedged buy-and-hold BTC max DD (full) | −52.86% | assumptions L199 / summary L139 |
| Realized σ_ann (priced cycles) | 26.3%–60.3% (mean 40.4%) | assumptions L189 |
| Binary put price p (−15%/14d) | 0.0009–0.0939 (mean 0.028) | assumptions L190 |
| Annual hedge cost | 5.43% of NAV | assumptions L192 |

**OOS holdback figures per the ledger/summary** (slightly different from JSON — different run): OOS Sharpe **−1.92** (JSON: −1.87), OOS Sortino **−0.73** (JSON: −0.71), OOS APY **−2.37%** (JSON: −2.30%), OOS hedged max DD **−0.99%** (JSON: −0.98%), OOS unhedged BTC DD −28.02% (matches JSON). [VERIFIED: cross-read]

### Regeneration command (verified CLI signature)

If the planner regenerates (recommended only if committing fresh; see Pitfall 1), the exact two-step chain from `backtest/src/deepvault/__main__.py` [VERIFIED: file read]:

```bash
# from repo root (REPO_ROOT discovery is parents[3]); run inside backtest/ venv
cd backtest
uv run python -m deepvault walk_forward --window-days 365 --out reports/full-365d.json
uv run python -m deepvault report --input reports/full-365d.json --output reports/full-365d-report.html
```

- `walk_forward` subcommand: `--window-days <int> --out <path>` (both required). Calls `run_walk_forward(data, hedge_ratio=0.10)` + `sensitivity_table(data)`.
- `report` subcommand: `--input <path> --output <path>` (both required); delegates to `deepvault.report.render_html_from_summary`.
- **⚠️ Non-determinism:** `_load_data_for_window_days` calls `fetch_btc_hourly()` which pulls from `https://data-api.binance.vision/api/v3/klines` and caches to the **gitignored** `backtest/data/btcusdt_1h.parquet`. Re-running re-fetches live BTC data; the window slides to "now," so **regenerated numbers will differ from the committed report**. The committed JSON is the only stable snapshot. [VERIFIED: data_ingest.py + __main__.py read]

### Renderer caveat for whitepaper audit claims

`render_html_from_summary` (report.py:317–321) hardcodes `shuffled_label_test={"alpha_apy": 0.0, ..., "passed": True}` and `hand_recompute_appendix={"rows": [], "all_match_to_wei": True}` as **stubs** — these are NOT computed from a real audit run in the summary-based render path. The real lookahead-audit machinery lives in `backtest/src/deepvault/lookahead_audit.py` (D-06 gate `|alpha| <= 0.005`; D-07 3-row hand-recompute, seed 42; notebook `backtest/notebooks/hand-recompute.ipynb`). [VERIFIED] **For the whitepaper's "lookahead audit passed" claim, cite the lookahead_audit module + the assumptions ledger §"Lookahead-Bias Audit" + the test names, NOT the HTML report's stub block.**

---

## 2. SVI / Hedge Math (DEPLOY-08)

**Canonical contract:** `shared/svi-spec.md` ("Status: LOCKED post-Phase-1"). Vendored Predict reference SHA `1159d79af33c70e09e406310e1d8f067832ede9d`. [VERIFIED: file read]

### Parameterization: raw 5-parameter SVI (NOT SSVI)

`shared/strategy.toml [svi]`: `parameterization = "raw_svi_5param"`, `scale = 9` (FLOAT_SCALING = 1e9, matches `deepbook_predict::constants::float_scaling`). [VERIFIED: strategy.toml:64-65]

> ⚠️ **Terminology note for the whitepaper:** CONTEXT.md LD-2 and REQUIREMENTS.md (MATH-01..03) call it "SSVI", but the implementation is **raw 5-param SVI** per `strategy.toml:64` and svi-spec.md. Param shape `SVIParams { a: u64, b: u64, rho: i64, m: i64, sigma: u64 }` (svi-spec.md:226, verbatim from vendored `oracle.move:72-83`). The whitepaper should describe raw SVI and cite Gatheral & Jacquier 2014 as the arbitrage-free-SVI source; it can note the dashboard renders the *surface* (SSVI-style across tenors) but the on-chain evaluator is per-slice raw SVI. [ASSUMED that "SSVI" in CONTEXT was loose usage — flag A1]

### Binary/digital hedge price formula (as implemented)

Canonical pseudocode that appears verbatim across Move/Python/TS (`shared/svi-spec.md:233-251`), cloned from vendored `oracle.move::compute_nd2` (`oracle.move:400-429`) [VERIFIED]:

```
binary_price(svi, forward, strike):
  k = ln(strike * F / forward)                  # signed i64 at 1e9
  k_minus_m = k - svi.m
  k_minus_m_squared = (k_minus_m * k_minus_m) / F
  sigma_squared = (svi.sigma * svi.sigma) / F
  sq = sqrt(k_minus_m_squared + sigma_squared, F)
  rho_km = (svi.rho * k_minus_m) / F
  inner = rho_km + sq                            # assert !is_negative (ECannotBeNegative)
  total_var = svi.a + (svi.b * |inner|) / F      # assert > 0 (EZeroVariance)
  sqrt_var = sqrt(total_var, F)
  half_var = total_var / 2
  d2_numerator = k + half_var
  d2 = -((d2_numerator * F) / sqrt_var)
  return normal_cdf(d2)                          # u64 in [0, F]
```

This is a **zero-drift Black–Scholes digital (binary) put**: total variance from raw SVI, then `Φ(d2)`. Pricing conventions (svi-spec.md "Pricing convention"): **D-06: `r = 0` hardcoded** (14d discount ≈0.998, sub-bp; whitepaper documents the assumption). **D-08: on-chain ships theoretical fair value (`oracle.compute_price` mid); `vault::rebalance` compares against `predict.get_trade_amounts` ask and abstains on Predict misquote.** [VERIFIED]

**Supporting numerics** (all cloned line-for-line, svi-spec.md):
- **Φ:** Cody 1969 piecewise rational Chebyshev, 3 ranges, ~30 coeffs (svi-spec.md:107-155; coeff table verbatim from vendored `helper/math.move:31-65`; source comment "W.J. Cody (1969), as implemented in GSL gauss.c").
- **sqrt:** integer Newton, bit-length seed + **7 unrolled iterations** + overshoot correction (svi-spec.md:159-215; vendored `helper/math.move:266-292`). Fixed-iteration is the cross-runtime parity invariant (no convergence detection).
- **Op-order:** `mul_div_round_down(a,b,c) = (a*b)/c`, truncate toward zero everywhere (svi-spec.md:21-57; vendored `helper/math.move:294-306`).
- **Max safe input domain:** `k ∈ [-2.5, +2.5]` (±2,500,000,000 at 1e9); `vault::rebalance` enforces `|k| <= 2_500_000_000` (svi-spec.md:90-104).

### Three-way parity gate (Python / TS / Move)

- **Vectors:** `shared/golden-vectors.json` (git-tracked) holds **141** vectors: **A=21** (Gatheral & Jacquier 2014 worked examples), **B=100** (synthetic + arb-violating sub-tier), **C=20** (10 JackJacquier + 10 PredictTests cross-checks). [VERIFIED: `node` count]
  - ⚠️ svi-spec.md:305-318 still says "**120 vectors / 20 from Gatheral**" (aspirational/stale). The real numbers are **141 total / 21 Gatheral (Tier A)**. Use the real numbers in the whitepaper claim ladder. [VERIFIED]
- **Tolerance:** 1 unit at 1e9 (forward-defense; empirically all 141 pass at exact equality across all three runtimes — STATE.md Phase 01-07 decision). [VERIFIED: STATE.md]
- **CI gate:** the `parity` job (5-job matrix) enforces bit-equality and blocks further phase work (MATH-05). Forbidden-token grep on the TS evaluator (no `Number`/`Math.X`/`parseFloat`). [VERIFIED: STATE.md Phase 01-07/08]
- **Gatheral citation (exact):** "Arbitrage-free SVI volatility surfaces", Gatheral & Jacquier (2014), **arXiv: https://arxiv.org/abs/1204.0646** [VERIFIED: `backtest/tests/test_gatheral_paper_vectors.py:7` cites `https://arxiv.org/abs/1204.0646`; CLAUDE.md Sources cites the same paper at archive.org/details/arxiv-1204.0646].

### What is / isn't provable on-chain

- **Provable on-chain:** `binary_price` (the production entry `deepvault::svi_view::binary_price` IS fully functional — `oracle::svi` + `SVIParams` accessors are public, per STATE.md Phase 01-05). The fair-value-vs-Predict-ask abstain (`EPredictMisquote`) executes on-chain in `rebalance.move`. [VERIFIED]
- **NOT directly callable:** `oracle.compute_price` is `public(package)` (oracle.move:331), so MATH-02 parity is asserted **indirectly** via the 141 golden vectors + a live testnet `predict.get_trade_amounts` comparison in `vault.rebalance`, not by calling Predict's internal pricer from `svi_view`. [VERIFIED: STATE.md Phase 01-01 Spike 1]
- **Arb-free check:** off-chain only (Python/TS `arb_checker`, g(k) array length 200 at 1e9); on-chain uses the closed-form butterfly check, no g(k) accessor. [VERIFIED: STATE.md Phase 01-08]

---

## 3. Sizing Policy Bounds (DEPLOY-08)

**Locked params — verbatim from `shared/strategy.toml [hedge_policy]`** (git-tracked; "LOCKED per CONTEXT.md D-01..D-04; FROZEN PERMANENTLY after Phase 3") [VERIFIED: strategy.toml:20-29]:

| Param | Value | toml field |
|---|---|---|
| Allocation | 10% of new deposit | `allocation_bps = 1000` |
| Strike | −15% OTM | `strike_otm_bps = 1500` |
| Tenor | 14 days (1,209,600 s) | `tenor_seconds = 1209600` |
| Roll trigger | expiry < 2 days (172,800 s) | `roll_trigger_seconds = 172800` |
| Sizing function | `"fixed"` (v1; "dynamic" reserved for v2) | `sizing_function = "fixed"` |
| Misquote abstain | refuse `predict::mint` if Predict ask > SVI fair value by >0.5% | `max_price_premium_bps = 50` |

**ADR source:** `docs/HEDGE-POLICY.md` (git-tracked; Status: Locked) — decision table at L15-21, per-parameter rationale L30-52, re-tuning policy L54-68 (walk-forward only: 60d in-sample / 14d out-of-sample / 30% held-out; "If the locked policy underperforms in backtest, document the underperformance and ship with the principled choice" L68). [VERIFIED: file read] **This sentence is the whitepaper's honest framing for the negative OOS numbers.**

**Inflation defense / token-bucket / cooldown constants** (other `strategy.toml` blocks, all git-tracked) [VERIFIED]:
- `[inflation_defense]`: `seed_quote_micro_units = 10_000_000` (10 DUSDC seed, burned to `@0xdead`), `virtual_shares = 1_000_000` (10^6 decimals_offset) — OpenZeppelin ERC-4626 v5 ports (strategy.toml:39-44; STATE.md Phase 02-02/02-03).
- `[token_bucket]`: `capacity_quote_micro_units = 100_000_000` (100 DUSDC burst cap), `refill_rate_quote_micro_units_per_ms = 1200` (~24h full regen) — per-user withdrawal limiter, cloned from vendored Predict `rate_limiter.move` (strategy.toml:31-37).
- `[redemption]`: `cooldown_ms = 3_600_000` (1h between redeem_request and redeem_fulfill) — single SoT for on-chain gate + smoke-test wait (strategy.toml:54-58).
- `[ltv]`: `margin_ltv_cap_bps = 5000` (50% defensive cap), `worst_case_settlement_haircut_bps = 10000` (100% — assume full adverse Predict outcome) (strategy.toml:46-49).
- `[oracle]`: `max_staleness_seconds = 300` (5 min) (strategy.toml:51-52). Note: the on-chain Predict 30s staleness gate is separate and cannot be relaxed by AdminCap (STATE.md Phase 02-06).

### Strategy simulation model assumptions (whitepaper MUST disclose — `[ASSUMED]`)

The backtest's returns come from `strategy_sim.py`, NOT the on-chain SVI path. Two load-bearing assumptions, documented in `.planning/backtest-assumptions.md` §"Strategy Simulation Model" (git-tracked) [VERIFIED: strategy_sim.py + ledger read]:
- **`PLP_APY = 0.08` (8% APY) — an ASSUMPTION** (strategy_sim.py:88; ledger L97-102). "Conservative; Predict PLP markets double-digit — picked defensible over promotional." **`[ASSUMED]` — flag A2.**
- **`PLP_LVR_COEFF = 0.25`** variance-scaled LP inventory drag (Loss-Versus-Rebalancing, Milionis-Moallemi-Roughgarden 2022) (strategy_sim.py:98; ledger L103-113). ~4–5%/yr on BTC; injects realistic per-bar NAV variance (without it OOS Sharpe was an indefensible ~7.7). **`[ASSUMED]` — flag A3.**
- **Hedge pricing in the backtest = zero-drift BS digital put using trailing-30d realized vol as the IV proxy** — NOT the on-chain SVI evaluator (no historical IV surface; Deribit deferred to v2). On-chain uses the audited SVI evaluator. (strategy_sim.py:47-62, 138-158; ledger L144-166). **The whitepaper MUST state these are two different pricing paths.** [VERIFIED]
- **Coverage-based sizing** (not naive fixed-premium): target payout = `hedge_ratio × NAV`, premium capped at `hedge_ratio × NAV × (tenor/365)`. The naive `notional = premium/p` produced ~1000:1 jackpots at low p (an economic bug, fixed). (strategy_sim.py:324-349; ledger L115-143; 03-10-SUMMARY deviation #1). **`[ASSUMED]`/documented-deviation — flag A4.**
- **Settlement = expiry-spot** (not path-minimum); a hedge that dips below K intraperiod but recovers does NOT pay. v1 simplification (ledger L161-166). Other v1 conventions: `fees_bps = 0`, `gas = 1 bp/PTB`, `slippage = (next-bar VWAP − next-bar open)/open × 1e4`, `rf = 0`, `BARS_PER_YEAR = 8760`. [VERIFIED]

---

## 4. Liquidation Under Worst-Case Predict Outcome (DEPLOY-08)

**Move source:** `contracts/sources/ltv.move` (git-tracked, closes VAULT-06) [VERIFIED: file read]:
- `worst_case_nav_per_share` (ltv.move:60-68): pessimistic NAV = **liquid `balance` / total_shares** — assumes ALL open hedges expire worthless (D-14). Excludes the hedge cost basis ("the cost-basis quote that was sent to Predict is gone"). Instantaneous, no time-decay (D-16). Does NOT call `svi_view` on this path (D-09 — zero blast radius for the Margin liquidation path).
- `nav_per_share` (ltv.move:41-49): `total_assets × nav_scale / total_shares`, NAV-per-share at 1e9 (D-15).
- `worst_case_haircut_bps` (ltv.move:76-83): `10_000 × (nav − worst_case) / nav`.

**Worst-case analysis (Phase 03-07, PTB-05) — committed artifacts:** `contracts/tests/liquidation_test.move` (3 property tests) + `backtest/tests/test_liquidation_parity.py` (11 tests) [VERIFIED: 03-07-SUMMARY.md read]:
- **Parity anchors (hardcoded in BOTH runtimes, 1-wei):** `wcn_pre = 9_009_900_990`, `wcn_post = 6_306_930_693` under a −30% balance shock. [VERIFIED]
- **Compound −60% shock model:** a pure −30% balance shock at the 50% LTV-open cap does NOT cross the 1.15 risk gate (risk_ratio = 0.7/0.5 = 14,000 bps > 11,500). CONTEXT.md D-20's "binary expires worthless AND vault collateral drops 30%" compounds to a **−60% effective magnitude** on liquid balance; the full integration test uses −60% so the liquidation gate fires (`risk_ratio_bps = 8_101 < 11_500 LIQUIDATION_LTV_BPS`). [VERIFIED: 03-07-SUMMARY decisions + STATE.md]
- **Parametrized shock sweep −5%..−90%** confirms the worst_case_nav formula is bit-equal across the full range. Negative control: −5% healthy shock → liquidation aborts `ENotLiquidatable` (603). [VERIFIED]
- **`worst_case_settlement_haircut_bps = 10000`** (100%) in strategy.toml is the policy anchor: the vault assumes a full adverse Predict outcome for LTV purposes. [VERIFIED]

**Whitepaper framing:** "Under the worst-case Predict outcome (all open binaries expire worthless), NAV-per-share collapses to the liquid quote balance; the Margin liquidation path consumes `worst_case_nav_per_share`, and a compound −60% shock (worthless hedges + 30% collateral haircut) triggers liquidation at risk_ratio 8,101 bps < the 11,500 bps threshold, proven bit-equal across Move and Python." Cite ltv.move + liquidation_test.move + test_liquidation_parity.py + strategy.toml `[ltv]`.

---

## 5. Architecture Inventory (DEPLOY-07)

All four tiers exist as **real committed code** (NOT placeholders). Content source for the SVG: `.planning/research/ARCHITECTURE.md` (45 KB, git-tracked). [VERIFIED: directory listings]

### Tier 1 — Move package (`contracts/sources/`) [VERIFIED: `ls`]
Modules: `vault.move` (shared object: total_assets, hedge registry, pause flag, 18-field schema), `supply.move` (deposit + atomic hedge mint), `redeem.move` (request/fulfill/cancel + token-bucket), `rebalance.move` (buy_hedge_for_deposit + permissionless roll_expiring), `share.move` (TreasuryCap quarantine), `ltv.move` (worst-case NAV), `svi_view.move` (binary_price evaluator), `predict_adapter.move` (thin Predict ABI wrapper — single-file blast radius), `strategy_constants.move` (codegen), `phi_coefficients.move` (codegen). Helpers: `helpers/{isqrt,ln,math,phi,rate_limiter}.move`.

### Tier 2 — Event relay / indexer (`indexer/src/`, Node) [VERIFIED: `find`]
`index.ts`, `relay.ts`, `wsServer.ts` (WS server with replay-on-connect), `pollOracleSVI.ts` (`queryEvents` for `OracleSVIUpdated` at 2s cadence), `pollVaultEvents.ts` (Supplied/HedgeMinted/Redeem* events), `snapshot.ts` (in-memory state), `cursor.ts` (disk-persisted cursor), `decodeI64.ts` (BCS i64 decode), `deployInfo.ts`, `types.ts`, `logger.ts` (pino). Deploys to Render (`indexer/render.yaml`).

### Tier 3 — React dashboard (`dashboard/src/`, Vite + dapp-kit) [VERIFIED: `find`]
**11 panels** in `components/panels/`: `SurfacePanel` (3D Plotly SVI surface), `ArbCheckerPanel` (g(k) plot), `VaultPanel`, `BucketGauge` (token-bucket state), `ExposurePanel` (hedge book by oracle/strike/expiry), `PositionViewer` (per-user PnL), `WhatIfSimulator` (client-side shock sim), `EventStreamPanel` (live OracleSVIUpdated ticker), `DepositWithdrawPanel`, `RelayStatusPill`. Hooks: `useWebSocket`, `useVaultState`, `useSurfaceSnapshot`, `useBucketState`, `useExposure`, `usePositions`. Libs: `svi.ts`, `arb_checker.ts`, `whatIf.ts`. **`App.tsx` has the Vault | Risk-Studio mode split** (Phase 04.2: Radix Tabs controlling two conditionally-mounted sibling subtrees — Vault default; Risk Studio = surface/exposure/event-stream/what-if/backtest). [VERIFIED: STATE.md Phase 04.2 + `find`]

### Tier 4 — Python backtest harness (`backtest/src/deepvault/`) [VERIFIED: `find`]
`strategy_sim.py` (PLP+hedge economic model), `walk_forward.py` (OOS split + sensitivity), `vault_state.py` (Move-parity machine, 1-wei), `replay.py` (`@strategy_fn` trace replay), `pnl_attribution.py` (6-column), `lookahead_audit.py` (shuffled-label + hand-recompute), `svi.py`/`isqrt.py`/`ln.py`/`phi.py` (parity evaluator), `arb_checker.py`, `report.py` (HTML renderer), `data_ingest.py` (Binance mirror), `__main__.py` (CLI).

### Two-protocol single-PTB composability path (the diagram's centerpiece)

**The 5-call PTB** (`scripts/two-protocol-ptb-demo.ts`, locked by WAVE0-DECISION.md "5-call PTB shape") [VERIFIED: file read]:
1. `margin_manager::deposit<BTC, DUSDC, BTC>` — collateral in
2. `margin_manager::borrow_quote<BTC, DUSDC>` — borrows DUSDC (auto-deposits, no return)
3. `margin_manager::withdraw<BTC, DUSDC, DUSDC>` — **bridge:** extract free `Coin<DUSDC>` (load-bearing; without it supply has nothing to consume)
4. `vault::supply::supply<DUSDC>` — atomic deposit + hedge mint (`supply.move:89` calls `rebalance::buy_hedge_for_deposit` internally; `supply.move:110` emits `Supplied`; `rebalance.move:301` emits `HedgeMinted`)
5. (OPTIONAL) `margin_manager::deposit<BTC, DUSDC, SHARE>` — VAULT_SHARE as collateral; **SKIP in v1** (Margin whitelist pending)

Atomicity: any moveCall failing aborts the whole PTB (Move tx semantics). Capability discipline: TradeCap stays inside the MarginManager's wrapped BalanceManager, never escapes (D-19); proven by `ptb_capability_test.move` + `test_ptb_capability_grep.py`. Expected events: `LoanBorrowed` + `Supplied` + `HedgeMinted`. [VERIFIED: two-protocol-ptb-demo.ts:498-540]

> ⚠️ See Pitfall 3 — this PTB **cannot run live on testnet** (no DUSDC margin pool); the SVG/whitepaper should label it "architecturally proven via `mock_margin_pool` integration test; live on testnet pending Mysten Margin DUSDC pool."

---

## 6. README Gaps (DEPLOY-06) — itemized deltas (do NOT rewrite)

Existing `README.md` is git-tracked and already has the cold-read skeleton. Present and good: **Laypitch** (L17-23, "PLP yield minus crash insurance"), **Glossary** (L24-32: PLP, SVI, Vault share, PTB, Hedge ratio, NAV), **Quick Start / prerequisites** (L56-87: make install/codegen/test/lint + Windows fallback), **Demo section** (L101-120: `make demo` + env vars + 7-checkpoint flow), **Mainnet readiness** (L160-175). [VERIFIED: full read]

**Precise deltas to fix:**

| # | Gap | Location | Fix |
|---|-----|----------|-----|
| G1 | Stale status: "Phase 0 COMPLETE / Phase 1 next-up" | L8-14 | Update to reflect Phases 0–5 + dashboard complete; submission-ready |
| G2 | **4 broken links to `docs/MAINNET-FUNDING.md`** (renamed → `MAINNET-READINESS.md`) | L41, L146, L184, L213 (+ prose L10) | Repoint all to `docs/MAINNET-READINESS.md` [VERIFIED: Grep] |
| G3 | Testnet addresses are `<placeholder>` template strings | L124-133 | Fill from `TESTNET-DEPLOY.json` (§7): real package_id/vault_id/admin_cap_id/deploy_tx_digest + suiscan URLs |
| G4 | No link to whitepaper | — | Add link to `docs/WHITEPAPER.md` (DEPLOY-08 output) |
| G5 | No link to exported backtest report | — | Add link to `backtest/reports/full-365d-report.html` (after it's committed — Pitfall 1) |
| G6 | Architecture link points to `.planning/research/ARCHITECTURE.md` (internal); no `docs/architecture.svg` | L54 | Add/repoint to `docs/architecture.svg` (DEPLOY-07 output), embed in README |
| G7 | Demo claims env requires `ORACLE_SVI_ID` but doesn't say where to get it; no two-protocol-PTB honesty note | L101-120 | Add OracleSVI source (Mysten Predict testnet registry) + note that `make demo` is supply+hedge+redeem (Margin demo is mock/documented-future) |
| G8 | CI badge + clone URL use `<owner>` placeholder | L5-6, L61 | Fill real GitHub owner/repo once repo is pushed (gated; may stay placeholder until push) |
| G9 | Build log stops at Week 5; references `.planning/research/{SUMMARY,STACK,PITFALLS}.md` | L201-215 | Optionally add a Week-6 closure entry; verify referenced research docs still exist (they do) |

The **cold-read test itself** (LD-4 acceptance) is a fresh-eyes pass — a Phase-6 task, not a delta.

---

## 7. Testnet Addresses + Demo Facts (DEPLOY-05 / DEPLOY-10)

### Canonical testnet addresses — verbatim from `TESTNET-DEPLOY.json` [VERIFIED: file read; git-tracked]

| Field | Value |
|---|---|
| network | `testnet` |
| status | `deployed` |
| deployed_at | `2026-05-16T14:48:36Z` |
| **deploy_tx_digest** | `ETYPnLemp761HsXeWigdh7h5hMvqEa2id4KDm8auBBCS` (valid 44-char base58) |
| deployer | `0xa92cdd29fe8170210b3f376a3c325eab27c4d006eb548645ad96e79a81cf1b2d` |
| **package_id** | `0xbc9aaeaa237400179e4c55cf49209dcf6ed0492be6eeb0088677e754ebd6e862` |
| **vault_id** | `0x2824d97e221413660fd9f8e23155bd4d1d459c06a893b1d350eb279c3bf7a911` (initial_shared_version 850638510) |
| admin_cap_id | `0x9e40150e07ce223019afbaca425cb08b84c541ad402b428ee4a9942dfaaba3e7` |
| predict_manager_id | `0xde7d773b058e22b508669c87e5b193b2e67b2836ee6a38a49f56112f17ac9bfb` |
| predict_package_id | `0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138` |
| predict_registry_id | `0x43af14fed5480c20ff77e2263d5f794c35b9fab7e2212903127062f4fe2a6e64` |
| predict_top_level_id | `0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a` |
| dusdc_type_tag | `0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC` |

Suiscan URL pattern (README uses this): `https://suiscan.xyz/testnet/object/<id>` and `https://suiscan.xyz/testnet/tx/<digest>`.

### The filmable demo command (DEPLOY-05 script)

```bash
SUI_PRIVATE_KEY=<ephemeral testnet key> ORACLE_SVI_ID=<BTC-USD OracleSVI shared object id> make demo
# → bash scripts/testnet-smoke-test.sh → npx tsx scripts/testnet-smoke-test.ts (from dashboard/)
```
[VERIFIED: Makefile:40-45, testnet-smoke-test.sh, testnet-smoke-test.ts read]

**7 staged checkpoints** (each prints `[CHECKPOINT PASS]`): 1 pre-deposit snapshot → 2 supply tx (atomic deposit + **real on-chain hedge mint** via Predict testnet) → 3 assert `Supplied`+`HedgeMinted` events → 4 redeem_request → 5 wait `REDEMPTION_COOLDOWN_MS` (1h) + 5s → 6 redeem_fulfill → 7 dual ±10 bps gate (Gate A per-depositor ratio ≥99.9%, Gate B NAV drift ≤10 bps), printing `ratio_bps=...` and `nav_delta_bps=...`. Demo amount: 50 DUSDC (`SUPPLY_AMOUNT_MICRO = 50_000_000n`). Wall-clock ≈ 1h5m (the cooldown). [VERIFIED]

**Where the tx digest surfaces:** the supply tx digest is returned from `client.signAndExecuteTransaction` and printed; the demo script should have the operator paste it into `https://suiscan.xyz/testnet/tx/<digest>` on camera. The wallet-diff (DUSDC balance −50, then redeemed back) is visible via the wallet extension between checkpoints 1 and 7.

**Mainnet-readiness sidebar (~10s):** narrate from `docs/MAINNET-READINESS.md` §"Why mainnet deploy is deferred" + the 5-step ≤30-min procedure. Honest line (MAINNET-READINESS.md:7): a mainnet smoke test today "would degrade to `vault::supply` + `vault::redeem` with `allocation_bps=0` (no hedge mint) ... strictly worse than the full-PTB testnet demo." [VERIFIED]

### Devpost draft facts (DEPLOY-10)
Title/tagline from CLAUDE.md project blurb; testnet addresses from the table above; repo URL = the GitHub URL once pushed (placeholder until push, gated); demo-video link = placeholder; backtest-report link = `backtest/reports/full-365d-report.html` (after commit); mainnet-readiness pointer = `docs/MAINNET-READINESS.md`. Standard sections: inspiration / what it does / how we built it / challenges / accomplishments / what's next.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Backtest numbers | Re-deriving or estimating returns | Quote `backtest/reports/full-365d.json` (after commit) + ledger | LD-1; re-running re-fetches live data and changes numbers |
| SVI math description | Re-deriving the formula | Quote `shared/svi-spec.md` pseudocode + oracle.move:400-429 citation | The spec IS the locked contract; cloned from audited Predict |
| Architecture content | Inventing a component map | `.planning/research/ARCHITECTURE.md` + the verified file roots in §5 | Real committed code; diagram just renders it |
| Testnet addresses | Typing addresses from memory | `TESTNET-DEPLOY.json` verbatim | One canonical source; the JSON is read by the demo script too |
| Demo flow | Scripting an imagined PTB | The real 7-checkpoint `testnet-smoke-test.ts` | The only honestly-filmable flow; matches `make demo` |

---

## Runtime State Inventory

This phase writes docs; it does not rename or migrate runtime state. **None of the five categories apply** — verified: no string rename, no datastore key change, no OS-registration change, no secret/env rename, no build-artifact rename is in scope for DEPLOY-05..08/10. The only "state" concern is the **gitignore status of the report artifacts** (Pitfall 1), which is a tracking decision, not runtime state.

---

## Common Pitfalls

### Pitfall 1: Backtest report is gitignored — publishing its numbers violates LD-1
**What goes wrong:** The whitepaper/README/Devpost cite `backtest/reports/full-365d.json`, but the file is excluded by `.gitignore:54` (and the parquet source by `.gitignore:50`). On a fresh clone the numbers don't exist, and LD-1 says un-committed numbers can't be published.
**Why it happens:** Phase 3 deliberately gitignored the multi-MB HTML + large parquet as "regenerated on demand."
**How to avoid (recommended):** **Force-add the report files past gitignore** so they become committed artifacts: `git add -f backtest/reports/full-365d.json backtest/reports/full-365d-report.html`. This makes them committed (satisfies LD-1) without un-gitignoring the directory (future regens still ignored). The parquet need NOT be committed if numbers are sourced from the committed JSON. Document this as a deliberate Phase-6 exception in the commit message. **Do NOT regenerate-then-publish** unless committing the fresh output, because regen re-fetches live BTC data and produces different numbers (see §1).
**Warning signs:** `git status` shows the report files as untracked/ignored; a fresh clone has no `backtest/reports/`.

### Pitfall 2: Two number sets / two windows — mixing them fabricates a story
**What goes wrong:** The JSON headline is OOS (−2.30% APY, 0 payoffs); the ledger headline is full-window (+7.52%, 1 payoff). Quoting "+7.52% return" next to "Sharpe −1.87" (an OOS number) creates a number that never existed in any single run.
**How to avoid:** Pick ONE source per claim and **always label the window**. Recommended: headline the honest asymmetry — "Full-window total return +7.52% (one −15% breach fired, payoff +9.98%); in the calm OOS holdout the hedge was a net cost (APY −2.30%, Sharpe −1.87) — the honest cost-of-carry of crash insurance." Cite the full-window numbers to `backtest-assumptions.md` (git-tracked) and OOS numbers to `full-365d.json` (after commit). Note the minor JSON-vs-ledger OOS drift (−2.30 vs −2.37) and prefer the JSON values as the machine-generated artifact, OR re-run both from one run and commit. [VERIFIED: §1]
**Warning signs:** A return number and a Sharpe number cited without a window label.

### Pitfall 3: The two-protocol PTB cannot be filmed live — DEPLOY-05's headline claim must be re-scoped
**What goes wrong:** DEPLOY-05 text says "single PTB opening Margin + Predict + vault share atomically." But no DUSDC margin pool exists on testnet (MARGIN-WHITELIST-DECISION.md: UNDETERMINED-FALLBACK-TO-MOCK; the live pool is DBUSDC, a different token). `two-protocol-ptb-demo.ts` exits 0 (graceful skip) when Margin pool IDs are absent. Filming a live Margin+Predict PTB is impossible today.
**How to avoid:** The demo script must film the **honestly-real** flow: `make demo` (supply + real on-chain hedge mint + redeem) showing `Supplied`+`HedgeMinted` events and the tx digest on suiscan. Present the two-protocol PTB as **"architecturally proven via the `mock_margin_pool` integration test (5-call shape compiles and runs); live on testnet pending Mysten's DUSDC Margin pool"** — exactly the framing MARGIN-WHITELIST-DECISION.md §"Implications" prescribes. The whitepaper/Devpost get the same honest framing. [VERIFIED: MARGIN-WHITELIST-DECISION.md + two-protocol-ptb-demo.ts:633-644]
**Warning signs:** A demo storyboard shot that shows a `LoanBorrowed` event from a live testnet tx.

### Pitfall 4: Stale metadata (STATE.md, 05-VERIFICATION.md, REQUIREMENTS.md traceability) understates real progress
**What goes wrong:** STATE.md and 05-VERIFICATION.md say `TESTNET-DEPLOY.json` is `pending_first_deploy` / "Phase 2 not executed," and REQUIREMENTS.md marks DASH-01..13 and VAULT-03/06 "Pending." But the deploy JSON shows `status: "deployed"` with real addresses (deployed 2026-05-16T14:48, after the 05:40-UTC verification), and the dashboard (11 panels) + ltv.move (VAULT-06) clearly exist.
**How to avoid:** Trust the **artifacts** (TESTNET-DEPLOY.json, the actual `contracts/`/`dashboard/`/`indexer/` source) over the tracking metadata. Don't write "dashboard pending" into the README/Devpost. Flag the traceability staleness to the user but don't block. [VERIFIED: cross-read of TESTNET-DEPLOY.json vs 05-VERIFICATION.md vs `find`]
**Warning signs:** An artifact says "pending" while the corresponding code/JSON is clearly complete.

### Pitfall 5: "SSVI" vs "raw 5-param SVI" terminology
**What goes wrong:** CONTEXT.md LD-2 and REQUIREMENTS.md say "SSVI"; the implementation is raw 5-param SVI (`strategy.toml:64`). Calling the on-chain evaluator "SSVI" in the whitepaper is technically inaccurate.
**How to avoid:** Whitepaper describes the **raw 5-parameter SVI** slice evaluator (a, b, ρ, m, σ), cites Gatheral & Jacquier 2014 for the arbitrage-free SVI framework, and may note the dashboard surface is SSVI-style across tenors. Use "raw SVI" for the on-chain math. [VERIFIED: strategy.toml + svi-spec.md]

---

## Code Examples (verified, for whitepaper/demo citation)

### Binary price (on-chain, the hedge pricer) — `shared/svi-spec.md:234-251` / vendored `oracle.move:400-429`
See §2 pseudocode block (verbatim, appears in all 3 runtimes). Production entry: `deepvault::svi_view::binary_price(oracle: &OracleSVI, strike: u64): u64`.

### SVI fair-value abstain (on-chain misquote guard) — `contracts/sources/rebalance.move:264-270`
```move
let (predict_ask_unit, _) = predict::get_trade_amounts(predict, oracle, key, 1, clock);
let max_premium_bps = strategy_constants::max_price_premium_bps();  // 50
assert!(
    (predict_ask_unit as u128) * 10_000u128
        <= (fair_value as u128) * ((10_000 + max_premium_bps) as u128),
    EPredictMisquote,  // abstains if Predict ask > SVI fair value by >0.5%
);
```

### Two-protocol PTB shape — `scripts/two-protocol-ptb-demo.ts:347-437`
5 moveCalls: margin deposit → borrow_quote → withdraw (bridge) → `vault::supply::supply` → optional SHARE re-deposit. See §5.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `docs/MAINNET-FUNDING.md` | `docs/MAINNET-READINESS.md` | Phase 5 (2026-05-13 reshape) | README has 4 broken links (G2); whitepaper/Devpost must use the new name |
| Naive fixed-premium binary (`notional=premium/p`) | Coverage-based sizing (capped premium) | Phase 03-10 (2026-06-15) | Backtest payout bounded; whitepaper documents the deviation |
| CryptoDataDownload CSV | Binance public data-mirror klines | Phase 03 (2026-06-15) | Backtest data source; assumptions ledger updated |
| Backtest all-zeros (flat NAV) | Real PLP+hedge model (`strategy_sim.py`) | Phase 03-10 (2026-06-15) | Real numbers now exist; report regenerated (but gitignored — Pitfall 1) |

**Deprecated/outdated in-repo:**
- README status block (Phase 0 "next-up Phase 1") — stale by ~5 phases.
- svi-spec.md "120 vectors / 20 Gatheral" — real is 141 / 21.
- STATE.md + 05-VERIFICATION.md "pending_first_deploy" — testnet is deployed.
- REQUIREMENTS.md traceability DASH-*/VAULT-03/06 "Pending" — code exists.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | CONTEXT/REQUIREMENTS "SSVI" is loose usage for raw 5-param SVI | §2, Pitfall 5 | Whitepaper mislabels the math; low risk (implementation is unambiguous in strategy.toml) |
| A2 | `PLP_APY = 0.08` (8%) is a defensible modeling assumption, not a measured Predict PLP yield | §3 | Headline return depends on it; MUST be disclosed as an assumption (it is, in the ledger) |
| A3 | `PLP_LVR_COEFF = 0.25` is a reasonable LVR proxy | §3 | Affects NAV variance/Sharpe; disclosed in ledger |
| A4 | Coverage-based hedge sizing is the defensible interpretation of the locked policy | §3 | Documented deviation; affects payoff magnitude; disclosed in ledger + 03-10-SUMMARY |
| A5 | Force-adding the gitignored report (vs un-gitignoring) is the right LD-1 fix | Pitfall 1 | If user prefers regenerate+commit, numbers will differ from the current snapshot |
| A6 | The repo will be pushed to GitHub before/at submission (repo URL, CI badge, clone URL) | §6 G8, §7 | Devpost/README links stay placeholder until push (push is user-gated) |

**Note:** A2/A3/A4 are already documented as assumptions in the git-tracked `backtest-assumptions.md` — they are honest, disclosed assumptions, not hidden ones. The whitepaper must carry the same disclosures.

## Open Questions

1. **Report commit strategy (Pitfall 1).**
   - Known: report files exist with real numbers but are gitignored.
   - Unclear: force-add (recommended, preserves the verified snapshot) vs regenerate-then-commit (changes numbers) vs un-gitignore the directory.
   - Recommendation: `git add -f` the two existing report files; keep `.gitignore` as-is for future regens; note the exception in the commit message. Resolve in the first Phase-6 plan before any number is quoted.

2. **Canonical number set + window labeling (Pitfall 2).**
   - Known: JSON = OOS headline; ledger = full-window headline; minor OOS drift between them.
   - Recommendation: headline the full-window +7.52% (cite ledger) AND the OOS −2.30%/−1.87 cost-of-carry (cite JSON), each window-labeled. If the user wants a single coherent run, re-run once and commit JSON+HTML+refresh the ledger in one commit.

3. **DEPLOY-05 demo re-scope (Pitfall 3).**
   - Known: live two-protocol PTB unfilmable (no DUSDC margin pool).
   - Recommendation: film `make demo` (supply+hedge+redeem); present two-protocol PTB as mock-proven + documented-future. Confirm this re-scope is acceptable vs the literal DEPLOY-05 wording (it is the only honest option).

4. **Repo URL / GitHub push timing (A6).**
   - Known: README CI badge + clone URL + Devpost repo URL need the real owner/repo; push is user-gated.
   - Recommendation: write artifacts with a clearly-marked placeholder + a resume note for the user to fill at push time.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Committed `full-365d.json` | All published numbers | ✗ (gitignored) | — | Force-add (Pitfall 1) |
| `full-365d-report.html` | DEPLOY-10 attachable report | ✗ (gitignored) | — | Force-add (Pitfall 1) |
| `TESTNET-DEPLOY.json` | README/Devpost/demo addresses | ✓ (git-tracked, deployed) | — | — |
| `.planning/research/ARCHITECTURE.md` | DEPLOY-07 SVG content | ✓ (git-tracked, 45 KB) | — | — |
| `backtest-assumptions.md` | Whitepaper assumptions + full-window numbers | ✓ (git-tracked) | — | — |
| `shared/svi-spec.md` / `golden-vectors.json` | Whitepaper math + parity claim | ✓ (git-tracked) | 141 vectors | — |
| `docs/HEDGE-POLICY.md` / `strategy.toml` | Sizing bounds | ✓ (git-tracked) | — | — |
| `docs/MAINNET-READINESS.md` | README/demo/Devpost mainnet pointer | ✓ (git-tracked) | — | — |
| Python backtest venv (for optional regen) | LD-7 regen path | not probed (no Sui CLI / venv check run) | — | Use committed snapshot (no regen needed) |
| DUSDC testnet Margin pool | Live two-protocol PTB demo | ✗ (not deployed by Mysten) | — | Mock + documented-future (Pitfall 3) |

**Missing with no fallback:** none that block Phase 6 (all artifacts are doc-writing; the report is recoverable via force-add).
**Missing with fallback:** committed report (force-add); live Margin PTB (mock + documented-future).

## Validation Architecture

> Phase 6 produces docs/artifacts, not testable code. Standard unit/integration validation does not apply. The validation that matters here is **provenance/honesty validation**, not test execution.

### Phase Requirements → Validation Map
| Req ID | Behavior | Validation Type | Check | Source Exists? |
|--------|----------|-----------------|-------|----------------|
| DEPLOY-08 | Every published number cites a committed artifact | provenance audit | grep each number in whitepaper → trace to committed file:field | ✅ after Pitfall-1 fix |
| DEPLOY-06 | README cold-read passes; no broken links; real addresses | manual cold-read + link check | fresh-eyes pass; `grep MAINNET-FUNDING` → 0; addresses match TESTNET-DEPLOY.json | ✅ |
| DEPLOY-07 | SVG depicts 4 real tiers + PTB moment; GitHub-renderable | visual render check | open SVG in GitHub preview; cross-check tiers vs §5 | ✅ |
| DEPLOY-05 | Demo script commands actually run; honest scope | dry-trace | every command in script exists in repo; no unfilmable live-Margin shot | ✅ |
| DEPLOY-10 | Devpost draft fields filled; links resolve | completeness check | all 6 sections present; addresses + report link + mainnet pointer | ✅ after Pitfall-1 |

### Existing automated test posture (context, not Phase-6 gates)
- Move: `cd contracts && sui move test` (≥85% coverage gate on supply/redeem/rebalance; liquidation_test 3/3). [VERIFIED: 03-07-SUMMARY]
- Python: `cd backtest && uv run pytest` (246 tests as of Phase 03-10). [VERIFIED: 03-10-SUMMARY L208]
- TS: `pnpm -r run test` (dashboard 427/427; indexer suite). [VERIFIED: STATE.md Phase 04.2]
- Parity: 5-job CI matrix (`move`, `ts`, `python`, `codegen-drift`, `parity`) — 141 vectors bit-equal. [VERIFIED: STATE.md]

### Wave 0 Gaps
- [ ] Resolve report-commit strategy (Pitfall 1) — BLOCKS quoting any number.
- [ ] Pick canonical number set + window labels (Pitfall 2).
- [ ] Confirm DEPLOY-05 demo re-scope (Pitfall 3).
*(No test files to create — this is a docs phase.)*

## Security Domain

> `security_enforcement` not found in config; treat as enabled. This phase writes docs (no new attack surface), but the artifacts make security claims that must be accurate.

### Applicable controls for the artifacts
| Concern | Applies | Standard control / source |
|---------|---------|---------------------------|
| V5 Input Validation (claims) | yes | Every published number traces to a committed artifact (LD-1 provenance) |
| Secret leakage in docs | yes | `.gitignore` excludes `.sui/`, keystores, `.env`; demo script uses `SUI_PRIVATE_KEY` as an **ephemeral** testnet key — the script/README must NOT embed any private key, and the demo wallet must be a throwaway. [VERIFIED: .gitignore:12-16] |
| Capability-containment claims | yes | Whitepaper's "TradeCap/TreasuryCap never escape" claim is real — proven by `ptb_capability_test.move` + `test_ptb_capability_grep.py` + Sui Prover specs (VAULT-10). Cite these, don't overclaim. [VERIFIED: STATE.md] |
| Audit-status honesty | yes | No third-party audit (v2 per REQUIREMENTS.md AUDIT-V2-01). Whitepaper risk-disclosures MUST say "unaudited; admin-paused single-key v1." Don't imply an audit. |

### Known accurate security claims (safe to publish)
- Inflation-attack defense: virtual shares (10^6) + 10-DUSDC seed burned to `@0xdead` (ERC-4626 v5 port). [VERIFIED: strategy.toml + STATE.md Phase 02-03]
- AdminCap is `key`-only (non-transferable v1); cannot relax Predict's 30s oracle staleness gate. [VERIFIED: STATE.md Phase 02-06]
- Misquote abstain (`EPredictMisquote`, 0.5% premium cap) on every hedge mint. [VERIFIED: rebalance.move:264-270]

## Sources

### Primary (HIGH confidence) — all in-repo, read this session
- `backtest/reports/full-365d.json` — OOS headline numbers, sensitivity, hedge_trades (gitignored)
- `.planning/backtest-assumptions.md` — full-window numbers + model assumptions (git-tracked)
- `.planning/phases/03-backtest-harness-two-protocol-ptb/03-10-SUMMARY.md` — strategy-sim + validated numbers
- `.planning/phases/03-backtest-harness-two-protocol-ptb/03-07-SUMMARY.md` — liquidation anchors / −60% shock
- `shared/svi-spec.md` — SVI math contract (op-order, Φ, sqrt, binary_price pseudocode, parity)
- `shared/strategy.toml` — locked sizing/inflation/token-bucket/ltv/oracle/redemption params
- `docs/HEDGE-POLICY.md` — hedge-ratio ADR + re-tuning policy
- `contracts/sources/ltv.move`, `rebalance.move`, `supply.move` — worst-case NAV, abstain, atomic hedge
- `scripts/two-protocol-ptb-demo.ts`, `scripts/testnet-smoke-test.{sh,ts}`, `Makefile` — PTB shape + demo
- `.planning/phases/03.../MARGIN-WHITELIST-DECISION.md` — no DUSDC margin pool (UNDETERMINED-FALLBACK-TO-MOCK)
- `TESTNET-DEPLOY.json` — canonical testnet addresses (git-tracked, deployed)
- `docs/MAINNET-READINESS.md` — mainnet deferral + 30-min procedure (demo sidebar source)
- `backtest/src/deepvault/{__main__,report,strategy_sim,walk_forward,lookahead_audit,data_ingest}.py` — CLI + model
- `shared/golden-vectors.json` (141 vectors), `backtest/tests/test_gatheral_paper_vectors.py` (Gatheral citation)
- `.gitignore` — report + parquet exclusion (the LD-1 landmine)
- `README.md` — existing content + broken links (gap source)
- `.planning/research/ARCHITECTURE.md` — DEPLOY-07 content source (git-tracked)

### Secondary (MEDIUM confidence)
- STATE.md / 05-VERIFICATION.md / REQUIREMENTS.md traceability — useful for history but **stale** (Pitfall 4); trust artifacts over these.

### External (cited, not re-verified this session)
- Gatheral & Jacquier (2014), "Arbitrage-free SVI volatility surfaces", arXiv:1204.0646 — https://arxiv.org/abs/1204.0646
- Milionis, Moallemi, Roughgarden (2022) — Loss-Versus-Rebalancing (the LVR drag source)

## Metadata

**Confidence breakdown:**
- Backtest numbers: HIGH — read the actual JSON + ledger; the only risk is the commit-strategy decision (flagged).
- SVI/hedge math: HIGH — svi-spec.md is the locked contract with vendored citations; pseudocode verbatim.
- Sizing/liquidation: HIGH — strategy.toml + ltv.move + 03-07 anchors all read directly.
- Architecture: HIGH — all four tiers enumerated from real `find`/`ls` of committed code.
- Demo/PTB facts: HIGH — read the actual scripts + deploy JSON + Margin decision; re-scope is unambiguous.
- README gaps: HIGH — full read + Grep on broken links.

**Research date:** 2026-06-15
**Valid until:** ~2026-06-22 (stable docs phase; the only volatility is if the backtest is re-run or the repo is pushed — both flagged as open questions).
