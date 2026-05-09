# Phase 1: Math Foundation (SVI Parity Gate) - Context

**Gathered:** 2026-05-09
**Status:** Ready for planning (with re-routes — see "Re-routes from RESEARCH.md (2026-05-09)" section at bottom)

<domain>
## Phase Boundary

A single SSVI evaluator algorithm — Heston-like power-law family with parameters (η, γ, ρ) plus per-tenor θ_T — implemented in three runtimes (Python, Move `deepvault::svi_view`, TypeScript `dashboard/lib/svi.ts`) that produces **bit-equal** output on a shared, codegen-emitted golden-vector suite of ~120 vectors. The evaluator's public API returns both total variance w(k,T) and the theoretical binary digital-call price. An arbitrage-free checker accompanies the evaluator: O(1) closed-form bound enforced on-chain at mint time; full closed-form + ≥200-point g(k) grid scan + calendar-monotonicity test runs off-chain (Python/TS) and produces a visible g(k) plot for the dashboard. CI's existing `parity` job (Plan 00-07, currently empty) is wired with real vectors and becomes the gate that blocks every later phase if it ever goes red.

In scope: SSVI evaluator math (3 runtimes), arbitrage-free checker (3 runtimes — closed-form everywhere, full grid only off-chain), theoretical binary-price function, golden-vector emitter (Python canonical) + JSON schema, CI parity gate wiring, op-order spec doc (`shared/svi-spec.md`), Abramowitz-Stegun Φ approximation (3 runtimes), integer Newton-Raphson sqrt (3 runtimes), oracle_svi.move struct schema spike (day-1 prerequisite), strategy.toml [svi] schema fill-in.

Out of scope: SSVI calibration from market data (Phase 3 backtest), oracle authority whitelist (Phase 2 vault), oracle staleness gating logic (Phase 2 vault — strategy.toml's `max_staleness_seconds=300` is consumed there), abstain-on-Predict-mis-quote policy (Phase 2 vault.rebalance), dashboard UI for the g(k) plot (Phase 4 — Phase 1 ships the math + parity-gated outputs the dashboard reads), time-stamped replay vectors from Deribit IV history (Phase 3).

</domain>

<decisions>
## Implementation Decisions

### SSVI Parameterization

- **D-01:** SSVI φ-function family is **Heston-like power-law**: φ(θ) = η / (θ^γ · (1+θ)^(1−γ)). The 3 free parameters are (η, γ, ρ) with constraints η > 0, 0 ≤ γ ≤ 1/2, |ρ| < 1, and the closed-form no-butterfly bound η(1+|ρ|) ≤ 2 (Gatheral & Jacquier 2014 §4). Per-slice ATM total variance θ_T enters as a separate input.
- **D-02:** Evaluator input contract: oracle emits `(ρ, η, γ)` globally + `θ_T` per supported tenor. Evaluator signature: `f(k, T, θ_T, ρ, η, γ) → (w, binary_price)`. **Contingent on day-1 spike** of `scripts/deepbookv3/packages/predict/sources/oracle_svi.move` confirming this shape; if struct emits a different shape, fallback is to project the oracle output to (θ_T, ρ, η, γ) at the evaluator boundary and document the mapping.
- **D-03:** Output contract: single function returns `(total_variance, binary_call_price)`. Both outputs are golden-vectored. Vault.rebalance reads `binary_call_price`; dashboard 3D surface reads `total_variance`; backtest reads both.

### Arbitrage-free Checker

- **D-04:** Param-bound enforcement diverges by trust boundary. **Move evaluator hard-rejects** invalid `(η, γ, ρ)` (typed error) — vault.rebalance refuses to mint. **Python/TS evaluators** always compute and return `params_valid: bool` + `min_g_k` + `calendar_pass` so the dashboard can render the violating g(k) curve per MATH-04's "visible g(k) plot, not boolean" requirement.
- **D-05:** Arb-checker scope split: **Move runs O(1) closed-form check only** (η(1+|ρ|) ≤ 2 etc.). **Python and TS run closed-form + 200-point g(k) grid across ±4σ + calendar-monotonicity** (per `strategy.toml` `[svi].grid_points_for_arb_check = 200`, `strike_range_sigma = 4`).

### Binary Pricing Convention

- **D-06:** Risk-free rate `r = 0`, hardcoded. Discount factor at 14d tenor is ~0.998; the correction is sub-bp and lives in the noise of arb-check tolerance. Whitepaper documents the assumption explicitly.
- **D-07:** Underlying input is **forward F**, passed explicitly. API: `binary_price(F, K, T, θ_T, ρ, η, γ) → u128`. With r=0, caller supplies spot directly. Future-proof if r becomes nonzero.
- **D-08:** Phase 1 binary price is the **theoretical fair value** under SSVI. Vault.rebalance (Phase 2) compares to Predict's quote and abstains if Predict mis-prices — that gate is **Phase 2's call**, not Phase 1. Day-1 spike of `scripts/deepbookv3/packages/predict/sources/predict.move` confirms the exact `predict::mint` price input format.
- **D-09:** Standard normal CDF Φ(d2) uses **Abramowitz-Stegun 1964 formula 7.1.26** (7-coefficient rational approximation, ~7.5e-8 absolute error). Same coefficients in all 3 runtimes; bit-equal output is the parity claim. Python additionally cross-checks against `scipy.stats.norm.cdf` in tests but ships the A-S impl for parity.

### Three-Way Parity

- **D-10:** **Shared fixed-point everywhere.** Python uses arbitrary-precision `int` at the same 10²⁷ scale (variance) and 10¹⁸ scale (price) as Move u128. TypeScript uses `BigInt` at the same scales. Golden vectors store integer values. CI parity assertion is **exact equality `==`** across all three runtimes — no tolerance window.
- **D-11:** Square root: **integer Newton-Raphson** with deterministic convergence (loop until x_{n+1} == x_n or x_{n+1} == x_n + 1). Same algorithm and same termination condition in all 3 runtimes; bit-identical output. Reference impl ~20 lines per runtime.
- **D-12:** Division rounding rule: **truncate toward zero, everywhere**. Python: `(abs(a)//abs(b)) * sign(a*b)`. TS: BigInt `/` already truncates. Move: u128 division truncates by default (i128 for signed intermediates, also truncating). Documented in `shared/svi-spec.md`.
- **D-13:** Overflow handling: **u256 for intermediates, u128 for inputs/outputs**. Documented max safe input domain: `k ∈ [-5σ, +5σ]`, `θ_T ≤ 4` (≈400% annualized variance). Phase 2 vault.rebalance enforces these bounds before calling the evaluator.
- **D-14:** Binary price parity claim is **exact equality at 10⁻¹⁸**. Achievable because shared fixed-point + locked Φ approximation + Newton sqrt + truncate-rounding fixes operation order. Op order is canonicalized in `shared/svi-spec.md`.

### Golden Vectors

- **D-15:** **Python is canonical**, emits via codegen. New script `scripts/golden_emit.py` reads hand-coded paper inputs + parametric stress generators and writes `shared/golden-vectors.json`. CI's existing `codegen-drift` job (Plan 00-07) is extended to run `python scripts/golden_emit.py` and assert `git diff --exit-code` on `shared/golden-vectors.json` — same enforcement pattern as `strategy.toml`.
- **D-16:** Schema: **JSON of integer hex strings**. Each vector has the shape:
  ```
  {
    "id": "v001",
    "tier": "A" | "B" | "C",
    "source": "Gatheral2014-Fig4.1" | "synthetic-stress" | "JackJacquier-SSVI",
    "inputs": {"k": "0x...", "T_seconds": 1209600, "theta_T": "0x...", "eta": "0x...", "gamma": "0x...", "rho": "0x...", "F": "0x...", "K": "0x..."},
    "expected": {"w": "0x...", "binary_price": "0x...", "params_valid": true, "min_g_k": "0x...", "calendar_pass": true}
  }
  ```
  `min_g_k` and `calendar_pass` are checked by Python/TS only — Move just asserts `params_valid` matches the closed-form check.
- **D-17:** Coverage strategy is **Tier A + Tier B + Tier C, ~120 vectors total**:
  - **Tier A (~20):** Hand-coded from Gatheral & Jacquier 2014 §4 worked numerical examples — academic provenance.
  - **Tier B (~80):** Synthetic stress at parametric grid `k ∈ {-4σ, -2σ, 0, +2σ, +4σ}` × `T ∈ {7d, 14d, 30d, 60d}` × sweep of (η, γ, ρ) including the boundary η(1+|ρ|) = 2; includes a sub-tier of intentionally-arb-violating vectors (negative g(k), η above bound) to gate the `params_valid = false` rejection paths.
  - **Tier C (~20):** Cross-check against **JackJacquier/SSVI** (GitHub) — co-author of the 2014 paper, MATLAB + Python reference implementation. Audit script vendors their reference output JSON beside ours and asserts match within Φ-approximation tolerance, then emits the canonical fixed-point vectors.
- **D-18:** Phase 1 ships **no time-stamped replay vectors from real BTC option-chain history**. The evaluator is a pure function of (params, k, T); Phase 3 backtest builds the replay harness separately.
- **D-19:** Whitepaper claim ladder (for Phase 6): "Bit-equal across 3 runtimes on 120 vectors including 20 from Gatheral & Jacquier 2014." Whitepaper appendix lists the full vector inventory with sources. README links to the parity CI job.

### Claude's Discretion

- File layout for the Python evaluator inside `backtest/src/deepvault/` (probably `svi.py` + `binary.py` + `arb_checker.py`); Move evaluator inside `contracts/sources/svi_view.move`; TS evaluator inside `dashboard/src/lib/svi.ts` per ROADMAP success criterion #3. Op-order spec lives at `shared/svi-spec.md` (new file, sibling to `strategy.toml`).
- Test framework wiring: Move uses `sui move test`; Python uses pytest; TS uses Vitest. All wired into existing 5-job CI matrix from Plan 00-07; Phase 1 just fills the `parity` job's actual assertions (currently a stub asserting `shared/golden-vectors.json` exists).
- Newton-Raphson seed selection (e.g., `1 << (bit_length(n) / 2)`) and termination polish are implementation details; spec doc records the chosen rule.
- Abramowitz-Stegun coefficient table is reproduced verbatim in all 3 runtimes; constants live in a `constants.move` / `constants.py` / `constants.ts` triple emitted by codegen if the table grows. For Phase 1, hand-coding the 7 coefficients in each runtime is fine.
- `strategy.toml [svi]` schema is filled out in Phase 1 — current Phase 0 form has only `parameterization`, `grid_points_for_arb_check`, `strike_range_sigma`. Phase 1 adds reasonable defaults for the SSVI parameter bounds and for the binary-price domain limits (k_max, theta_T_max).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents (researcher, planner, executor) MUST read these before planning or implementing.**

### Project context
- `.planning/PROJECT.md` — scope, core value, cut-lines, key decisions, constraints
- `.planning/REQUIREMENTS.md` §"Math Foundation (SVI)" — MATH-01 through MATH-06 (the 6 items this phase delivers)
- `.planning/ROADMAP.md` §"Phase 1" — goal, success criteria, hard policy locks ("three-way SVI parity gate is non-cuttable")
- `.planning/STATE.md` — current project position; "Open verification gaps to resolve in Phase 0/1" lists the OracleSVIUpdated event struct schema spike as Phase 1 day-1
- `.planning/phases/00-setup-ground-rules/00-CONTEXT.md` — Phase 0 decisions; especially decimals (variance_decimals=27, decimals=18, share_decimals=9), hedge policy locks (D-01..D-05), and the strategy.toml [svi] partial schema

### Research outputs (read before planning)
- `.planning/research/SUMMARY.md` §"Phase 1: Math Foundation" — phase rationale, deliverables, gates
- `.planning/research/STACK.md` §"Python Backtest Harness" — numpy/scipy versions, "write SVI yourself, do not pull QuantLib"
- `.planning/research/ARCHITECTURE.md` §"2. Component Responsibilities" — `deepvault::svi_view` is read-only; §"Three-way semantic parity layer" — golden-vector pattern
- `.planning/research/PITFALLS.md` §"Pitfall 3: SVI butterfly-arbitrage violation" — drives D-04, D-05, D-17 sub-tier of arb-violating vectors
- `.planning/research/PITFALLS.md` §"Pitfall 6: DeepBook Predict contract churn" — explains why oracle_svi.move spike is day-1 and why `vault::predict_adapter` (Phase 2) is a thin wrapper

### Repository artifacts the plan touches
- `shared/strategy.toml` §[svi] — partial schema from Phase 0; Phase 1 fills SSVI parameter bound defaults and binary-price domain limits (k_max, theta_T_max)
- `shared/golden-vectors.json` — `[]` placeholder from Plan 00-07; Phase 1 populates via `scripts/golden_emit.py`
- `scripts/codegen.py` — Phase 0 codegen pattern (`shared/strategy.toml` → 3 constants files); Phase 1's `scripts/golden_emit.py` follows the same emit-and-CI-drift-check pattern
- `scripts/deepbookv3/packages/predict/sources/oracle_svi.move` — vendored DeepBookV3 fork (Plan 00-05, subtree at HEAD `1159d79af33c70e09e406310e1d8f067832ede9d`); read on day 1 to confirm `OracleSVIUpdated` event struct and the (θ_T, ρ, η, γ) projection
- `scripts/deepbookv3/packages/predict/sources/predict.move` — same fork; read for `predict::mint` price-input format (informs D-08)
- `.github/workflows/ci.yml` — 5-job matrix from Plan 00-07; the `parity` job (currently asserts `shared/golden-vectors.json` exists) is wired with real cross-runtime equality assertions
- `contracts/Move.toml` — `predict-testnet-4-16` rev-pinned (Plan 00-02); imports `Predict` for type signatures
- `CONTRIBUTING.md` — code-freeze 2026-05-30, no-refactor-after-vault, hedge-ratio policy locked

### To-be-created in Phase 1 (planner allocates)
- `shared/svi-spec.md` — op-order canonicalization (multiplication then addition then division; truncate toward zero; Newton sqrt convergence rule); Φ approximation coefficients; max safe input domain; binary-price formula derivation; whitepaper claim ladder (D-19)
- `scripts/golden_emit.py` — Python canonical emitter, reads paper test cases + synthetic stress generator + JackJacquier/SSVI reference fixture, writes `shared/golden-vectors.json`
- `backtest/src/deepvault/svi.py` — Python evaluator + Φ + Newton sqrt + arb-checker (closed-form + 200-pt grid + calendar)
- `backtest/tests/test_svi_parity.py` — pytest reads `shared/golden-vectors.json` and asserts Python emit matches expected for all vectors
- `contracts/sources/svi_view.move` — Move evaluator (closed-form arb-check, hard-reject on invalid params)
- `contracts/tests/svi_view_test.move` — Move test reads `shared/golden-vectors.json` (or a Move-format companion file) and asserts each vector
- `dashboard/src/lib/svi.ts` — TypeScript evaluator (full arb-checker, returns g(k) array for plot)
- `dashboard/src/lib/svi.test.ts` — Vitest reads `shared/golden-vectors.json` and asserts BigInt equality

### External docs (referenced inline by research)
- Gatheral & Jacquier (2014), "Arbitrage-free SVI volatility surfaces" — https://arxiv.org/abs/1204.0646 — §4 picks the φ-family, §3.2 closed-form butterfly bound
- JackJacquier/SSVI on GitHub — co-author's reference implementation, MIT license, used for Tier C cross-check
- Abramowitz & Stegun (1964), "Handbook of Mathematical Functions" §7.1.26 — Φ approximation
- DeepBookV3 GitHub repo, `predict-testnet-4-16` branch, `packages/predict/sources/{oracle_svi,predict}.move` — contract source of truth (vendored at `scripts/deepbookv3/`)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`scripts/codegen.py`** — Phase 0 codegen pattern: read TOML → emit 3 constants files with `AUTO-GENERATED — DO NOT EDIT` headers. `scripts/golden_emit.py` reuses the emit-with-drift-check pattern but writes a single JSON instead of a triple of constants files.
- **`shared/strategy.toml`** — schema versioning + hedge-policy lock pattern. Phase 1 extends `[svi]` with concrete parameter-bound defaults (no new top-level section needed).
- **`shared/golden-vectors.json`** — already wired into CI's `parity` job and gated by Plan 00-07's "exists, is JSON, is array" stub assertion. Phase 1 fills the array; the wiring stays.
- **CI 5-job matrix (`.github/workflows/ci.yml`)** — `move`, `ts`, `python`, `codegen-drift`, `parity` jobs. Phase 1 adds vectors to the parity job and adds a `golden-emit-drift` assertion to the codegen-drift job. No new jobs.
- **Vendored DeepBookV3 subtree at `scripts/deepbookv3/`** — read directly during the day-1 oracle struct spike. No `git fetch` needed; HEAD is pinned at `1159d79af33c70e09e406310e1d8f067832ede9d`.

### Established Patterns

- **Triple-emit codegen with drift CI** — `strategy.toml` → `strategy_constants.{move,py,ts}`; CI's `codegen-drift` job runs codegen and `git diff --exit-code`. Phase 1's `golden_emit.py` extends this to `golden-vectors.json`.
- **Single-file blast radius for external contract churn** — `vault::predict_adapter` is the Phase 2 pattern; Phase 1 follows the same shape with the `svi_view` reader at the oracle boundary, isolating struct-schema changes to one file.
- **Variance vs price decimals split** — strategy.toml documents two scales (27 for variance precision, 18 for prices); Phase 1's spec doc canonicalizes when each is in play.

### Integration Points

- **`vault::rebalance` (Phase 2)** consumes `svi_view::binary_price(F, K, T, θ_T, ρ, η, γ) → u128`. Phase 1 commits to this signature and locks the param-bound rejection contract that the vault layer will rely on.
- **Backtest harness (Phase 3)** consumes the Python evaluator and the same golden-vector fixtures; trace-replay parity tests (BACK-04) extend Phase 1's parity contract from "evaluator output" to "vault state machine".
- **Dashboard (Phase 4)** consumes the TS evaluator's `(w, binary_price, params_valid, min_g_k, calendar_pass, g_k_array)` for the 3D surface, what-if simulator, and arb-checker UI panel (DASH-04, DASH-05, DASH-09).
- **CI parity job** is the gate that blocks every later phase if vectors fail; Phase 1 is the wiring that makes that gate real (Plan 00-07 left it as a stub).

</code_context>

<specifics>
## Specific Ideas

- **The whitepaper claim is the design objective.** D-19 ("Bit-equal across 3 runtimes on 120 vectors including 20 from Gatheral & Jacquier 2014") is the single most defensible sentence in the Phase 6 strategy whitepaper for a finance-leaning judge panel (a16z + Bridge/Stripe + Mysten leadership). Every Phase 1 decision (shared fixed-point, exact-equality parity, paper provenance, JackJacquier cross-check) ladders up to that one sentence.
- **The day-1 oracle struct spike is the only external risk gate.** If `OracleSVIUpdated` doesn't emit `(ρ, η, γ)` + per-tenor `θ_T`, D-02 reroutes through a projection layer at the evaluator boundary — but the spike must happen before the evaluator implementation begins so the API surface lock can absorb the result.
- **The codegen-drift discipline from Phase 0 carries the credibility forward.** If a contributor edits `golden-vectors.json` by hand, CI fails and the commit-message-prefix rule (analogous to the Phase 0 `POLICY:` prefix for hedge policy) flags it as a deliberate parameter change. Plan should consider a `MATH:` commit-prefix policy for any change to `shared/svi-spec.md` or the canonical Φ coefficients.
- **The arb-checker's "visible g(k) plot" is the lever.** Most teams ship a boolean. Shipping the array, tested for parity across Python and TS, lets Phase 4's dashboard show *why* the surface failed — that's the institutional-LP-grade differentiator MATH-04 calls out.
- **Move closed-form-only arb check is the gas/credibility tradeoff sweet spot.** Running a 200-point grid on-chain at every mint is gas-impractical. The closed-form bound is a *theorem* for the Heston-like power-law family — provably equivalent to grid-passing, not merely heuristic. Whitepaper cites Gatheral 2014 §4 for the equivalence.
- **Newton sqrt with deterministic termination is the parity linchpin.** The cheap version (fixed iteration count) gives weaker tolerance; the strict version (loop until converged) is bit-identical across runtimes if the seed and rounding rule match. Spec doc must lock both.

</specifics>

<deferred>
## Deferred Ideas

- **Oracle authority whitelist** — Phase 2 vault concern. Phase 1 evaluator is parameter-pure; trusting that "good params come from good oracles" is upstream policy.
- **Oracle staleness gating** — `strategy.toml [oracle].max_staleness_seconds = 300` is consumed by Phase 2 vault.rebalance, not Phase 1.
- **Abstain-on-Predict-mis-quote policy** — Phase 2 vault.rebalance compares Phase 1's fair value to Predict's quote and decides; Phase 1 only computes the fair value.
- **Time-stamped replay vectors from Deribit IV history** — Phase 3 backtest harness builds these; Phase 1's parity gate stays in (params, k, T) space.
- **SSVI calibrator** — fitting (ρ, η, γ, θ_T) to BTC option-chain data is a Phase 3 backtest concern; on-chain trusts the oracle.
- **eSSVI 4-parameter extension** — explicit no-calendar-arbitrage condition; deferred because the closed-form 3-param Heston-like family is sufficient for the 14d-tenor BTC binaries we hedge. Re-evaluate post-submission if multi-tenor surface becomes load-bearing.
- **Higher-order CDF approximation (Cody 1969)** — overkill for our tolerance budget; revisit only if the A-S 7-coeff approximation produces visible artifacts in the surface plot.
- **MATH: commit-prefix policy** — analogous to Phase 0's POLICY: prefix for hedge policy changes; capture in the Phase 1 plan as an explicit sub-task if it materially helps the audit story.

</deferred>

---

## Re-routes from RESEARCH.md (2026-05-09)

The day-1 oracle struct spike (RESEARCH.md §"Spike Findings") read the vendored `scripts/deepbookv3/packages/predict/sources/{oracle,predict}.move` + `helper/{math,i64,constants}.move` at HEAD `1159d79af33c70e09e406310e1d8f067832ede9d` and discovered six locked decisions that contradict on-chain reality. **All six re-routes ACCEPTED on 2026-05-09**, rationale: matching on-chain bit-for-bit is the only way Phase 2's D-08 "abstain on Predict mis-quote" gate can distinguish actual mispricing from model mismatch.

**The on-chain Predict implementation IS our reference implementation.** Phase 1's triple-emit clones the existing `helper/math.move` + `oracle.move::compute_nd2` into Python and TypeScript. Auditability story: spec doc cites the on-chain source for every clone.

| Decision | Original (CONTEXT.md) | Re-routed to | Source |
|---|---|---|---|
| **D-01** SSVI parameterization | Heston-like power-law (η, γ, ρ) + per-tenor θ_T | **Raw 5-param SVI** `(a, b, ρ, m, σ)` per oracle. SSVI sufficient conditions become an *additional* off-chain checker step, not the primary param interface. | `oracle.move:58-66` (`OracleSVIUpdated` event struct) |
| **D-02** Evaluator signature | `f(k, T, θ_T, ρ, η, γ) → (w, binary_price)` | `f(svi: SVIParams, k) → (w, binary_price)` where `SVIParams = (a, b, rho, m, sigma)`. T is implicit per oracle (one oracle per expiry). | `oracle.move:96-114` (`OracleSVI` struct) |
| **D-09** Φ approximation | Abramowitz-Stegun 7.1.26 (claimed 7 coeffs) | **Cody 1969 piecewise rational Chebyshev** (~30 coefficients across 3 ranges, ~1e-15 in float / ~5 units at 1e9). Coefficients emitted by codegen extension reading new `shared/cody_phi_coefficients.toml`. | `helper/math.move:31-65` (constants), `:191-239` (`normal_cdf_u128`), source comment cites Cody 1969 / GSL gauss.c |
| **D-10** Fixed-point scales | Variance 1e27 / price 1e18 (vault-internal) | **SVI math layer at 1e9** (matches `predict::constants::float_scaling!()`). Vault NAV layer keeps 1e18, vault shares keep 1e9 — those are unchanged. New `[fixed_point.svi]` sub-section (or top-level `[svi].scale = 9` field) in `shared/strategy.toml`. | `helper/constants.move` (`FLOAT_SCALING = 1e9`) |
| **D-11** Newton sqrt | Loop-until-converged (`x_{n+1} == x_n` or `+1`) | **Bit-length seed + 7 unrolled Newton iterations + final overshoot correction** `if (g*g > x) g = g - 1`. Deterministic constant gas; matches on-chain. | `helper/math.move:266-292` (`sqrt_u128`) |
| **D-13** Intermediate width | u256 intermediates / u128 IO | **u128 intermediates / u64 IO** (matches on-chain). u256 unnecessary at 1e9 scaling for SVI domain. Move 2024 still has u256 available; we just don't need it. | `helper/math.move` arithmetic + `oracle.move::compute_nd2` |
| **D-14** Parity tolerance | Exact `==` at 10⁻¹⁸ | **Exact `==` at 10⁻⁹** (auto-follows D-10). Still bit-equal; tolerance window is still zero. | Auto-follows D-10 |
| **D-17** Tier C cross-check | JackJacquier/SSVI repo only | JackJacquier/SSVI **has no LICENSE, only a Jupyter notebook, no shipped fixtures** — degraded. Tier C remains JackJacquier (execute notebook against pinned inputs, capture outputs by hand into `tests/fixtures/jackjacquier_ssvi_outputs.json` with notebook git SHA cited in spec; treat as cross-check reference, not vendored code). **Add Tier C2:** cross-check against vendored Predict's own Move tests at `scripts/deepbookv3/packages/predict/tests/oracle_tests.move`. | RESEARCH.md §"Spike Findings" + `JackJacquier/SSVI` repo metadata (4 commits, no LICENSE) |

**Decisions that auto-follow re-routes (no separate re-route needed):**

- **D-04** (param-bound enforcement diverges by trust boundary): Raw SVI's closed-form butterfly bound is non-trivial (Roper-Rutkowski / Martini-Mingone 2020). Move-side hard-reject becomes a stricter sanity check on `(a, b, rho, m, sigma)` ranges from on-chain validation; off-chain g(k) grid scan still works as primary arbitrage detection. Spec doc records the exact condition.
- **D-15..D-19** (golden vectors): unchanged structure; integer hex strings at 10⁻⁹ scale (auto-follows D-10/D-14). Tier A still Gatheral 2014 §4 worked vectors. Tier B still synthetic stress (now in raw-SVI param space). Tier C augmented per D-17 re-route above.

**Decisions that stand as written (no spike conflict):**

D-03 (output contract `(total_variance, binary_call_price)`), D-05 (off-chain checker scope), D-06 (r=0), D-07 (forward F passed explicitly), D-08 (theoretical fair value vs Phase 2 abstain), D-12 (truncate toward zero), D-16 (JSON schema of integer hex strings), D-18 (no time-stamped replay vectors), D-19 (whitepaper claim ladder — adjusts to "Bit-equal across 3 runtimes on 120 vectors at 10⁻⁹ including 20 from Gatheral & Jacquier 2014, all algorithms cloned line-for-line from the audited on-chain Predict implementation").

**Open questions for the planner to resolve in Wave 0 spikes (1-hour each):**

1. Is `oracle.compute_price` callable from `deepvault::svi_view` (different Move package)? `oracle.move:331` declares it `public(package)`. Wave 0 task: write a tiny Move test calling `predict::get_trade_amounts(predict, oracle, key, quantity=1, clock)` and inspect `(ask, bid)`. If `(ask + bid) / 2 ≈ oracle mid`, we can sanity-test directly; otherwise MATH-02's "matches on-chain output" assertion lives in a Phase 2 integration test.
2. Exact bit-shift sequence in `sqrt_initial_guess_u128` — verify Python clone matches Move on 1000 random u128 inputs.
3. `[svi]` schema fill-in: `[fixed_point.svi]` sub-section vs top-level `[svi].scale = 9`. Recommended: top-level `[svi].scale = 9`.
4. `phi.move` and `isqrt.move` location: `contracts/sources/helpers/` (mirror Predict's `packages/predict/sources/helper/`) or flat in `contracts/sources/`. Recommended: `contracts/sources/helpers/`.
5. `max safe input domain` for k: spec doc records `k ∈ [-2.5, 2.5]` (in 1e9 → ±2_500_000_000). Outside this range `(k - m)^2` may overflow at extreme strikes if `b` is also large.

---

*Phase: 1-Math Foundation (SVI Parity Gate)*
*Context gathered: 2026-05-09*
*Re-routes accepted: 2026-05-09 (post-spike)*
