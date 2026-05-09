# Phase 1: Math Foundation (SVI Parity Gate) - Research

**Researched:** 2026-05-09
**Domain:** Cross-runtime fixed-point quant math (SVI volatility surface evaluator across Move + Python + TypeScript)
**Confidence:** HIGH on stack/tooling, HIGH on day-1 spike findings (vendored source read directly), MEDIUM-HIGH on bit-equality engineering, HIGH on math references — but **the spike has surfaced four CONTEXT.md decisions that need re-confirmation before planning**.

## Summary

Phase 1 builds a **read-only** SVI evaluator triple-emit: a single algorithm in Python (canonical), Move (`deepvault::svi_view`), and TypeScript (`dashboard/lib/svi.ts`), gated by a CI parity job that asserts bit-identical integer output on ~120 golden vectors. Phase 0 left the gate as a stub asserting `shared/golden-vectors.json` exists; Phase 1 wires the actual cross-runtime equality assertion.

**Day-1 spike on the vendored DeepBookV3 source (`scripts/deepbookv3/packages/predict/sources/oracle.move`) has surfaced four LOCKED decisions in CONTEXT.md that contradict on-chain reality and need planner attention before implementation can begin.** The bigger story is that the Predict protocol *already* ships a complete on-chain SVI evaluator with Cody-1969 normal CDF, Newton sqrt, ln, and the exact raw-SVI formula DeepVault must mirror. This dramatically reduces Move-side implementation risk but rewrites the parameterization, scaling, and Φ approximation choices the planner must hand the executor.

**Primary recommendation:** Re-open the four contradicted decisions (D-01 SSVI vs raw SVI, D-09 A-S vs Cody Φ, D-10 1e27/1e18 scales vs Predict's 1e9 FLOAT_SCALING, D-11 sqrt convergence rule) with a 30-minute discuss-phase touch-up, THEN plan. Otherwise Phase 1 ships a parity gate that is internally consistent but **disagrees with the on-chain Predict math** — which means Phase 2's `vault::rebalance` will read prices from `predict::mint` (using Predict's own evaluator) that disagree with our `svi_view::binary_price`, defeating the whole point of D-08 (theoretical fair price comparison).

## User Constraints (from CONTEXT.md)

### Locked Decisions (D-01..D-19, copied verbatim — see CONTEXT.md for full text)

**SSVI Parameterization**
- **D-01:** SSVI φ-function family is **Heston-like power-law**: φ(θ) = η / (θ^γ · (1+θ)^(1−γ)). Free params (η, γ, ρ); η > 0, 0 ≤ γ ≤ 1/2, |ρ| < 1; closed-form no-butterfly bound η(1+|ρ|) ≤ 2. Per-slice ATM total variance θ_T enters separately.
  - **⚠️ CONTRADICTED BY DAY-1 SPIKE.** See "Spike Findings" below. The vendored `oracle.move` emits raw 5-parameter SVI `(a, b, ρ, m, σ)`, NOT SSVI Heston-like power-law params. D-02's contingency clause IS triggered ("if struct emits a different shape, project to (θ_T, ρ, η, γ) at evaluator boundary, document the mapping"). Two real options: (a) execute D-02's projection — derive θ_T from raw params and impose Heston-power-law constraints downstream; or (b) re-decide and use raw SVI as the canonical evaluator. Planner must surface this. Recommendation: option (b) — match on-chain reality, ship the same math the oracle ships, retain the Heston-power-law arbitrage bound as one of multiple sufficient conditions checked in the off-chain arb panel only. Rationale: the vault calls `predict::mint` which prices via raw SVI on the same params; computing a "theoretical price" with a different parameterization gives a different number for unrelated reasons (model mismatch, not Predict mispricing) — defeats D-08's "abstain on Predict mis-quote" comparison.

- **D-02:** Evaluator input contract: oracle emits `(ρ, η, γ)` globally + `θ_T` per supported tenor. Evaluator signature: `f(k, T, θ_T, ρ, η, γ) → (w, binary_price)`. **Contingent on day-1 spike.** Spike DONE: oracle emits `(a, b, ρ, m, σ)` per oracle (one oracle per underlying+expiry). See "Spike Findings."

- **D-03:** Output contract: `(total_variance, binary_call_price)`. Both golden-vectored. ✅ Compatible with raw-SVI re-route under D-01 contingency.

**Arbitrage-free Checker**
- **D-04:** Move evaluator hard-rejects invalid (η, γ, ρ); Python/TS return `params_valid: bool` + `min_g_k` + `calendar_pass` for visible-violation rendering. ⚠️ Re-route required if D-01 switches to raw SVI: closed-form butterfly bound for raw SVI is non-trivial (Roper-Rutkowski / Martini-Mingone). Off-chain g(k) grid scan still works; on-chain hard-reject is harder to express cleanly without SSVI. See "Decision Re-route" below.
- **D-05:** Move = O(1) closed-form. Python+TS = closed-form + 200-pt g(k) grid + calendar-monotonicity. Compatible if D-04 re-routed.

**Binary Pricing Convention**
- **D-06:** r = 0 hardcoded. ✅ Matches on-chain (oracle does not multiply by discount factor). Sub-bp at 14d.
- **D-07:** Underlying = forward F, passed explicitly. API: `binary_price(F, K, T, θ_T, ρ, η, γ) → u128`. ⚠️ Phase 1 should use signature that mirrors on-chain order: `binary_price(svi_params, forward, strike) → u64` (not u128 — see D-10/D-13 contradiction below). Spike: on-chain reads `forward = oracle.forward_price()` and `strike = K (u64)`. T is implicit in the oracle (one oracle per expiry).
- **D-08:** Phase 1 = theoretical fair value; Phase 2 vault.rebalance compares to Predict's quote and abstains. Day-1 spike of `predict.move::mint` confirms format. **Spike DONE:** `predict::mint(predict, manager, oracle, key: MarketKey, quantity, clock, ctx)` — `MarketKey` carries `(oracle_id, expiry, strike, is_up)`. The price is computed inside `predict::trade_prices(oracle, key, clock)` (called by `mint`) which reads `oracle.compute_price(strike)` (pure CDF) and adds Bernoulli spread. The "fair value" we want for D-08 comparison is `oracle.compute_price(strike)` (the no-spread mid), and Predict's actual ask is `mid + spread`. ✅ D-08 holds; vault compares against `oracle.compute_price` mid, not `predict::trade_prices` ask.
- **D-09:** Φ uses **Abramowitz-Stegun 1964 formula 7.1.26** (7-coefficient rational approximation, ~7.5e-8 absolute error). Same coefficients in all 3 runtimes; bit-equal output. Python additionally cross-checks against `scipy.stats.norm.cdf`.
  - **⚠️ TWO CONTRADICTIONS.** (1) The on-chain implementation in `predict_math::normal_cdf` uses **Cody 1969 rational Chebyshev** (per the source comment `Source: W.J. Cody (1969), as implemented in GSL gauss.c`), with three piecewise ranges and ~10 coefficients per range — significantly more accurate than A-S 7.1.26 (1e-15 in float, ~5 units at 1e9). (2) A-S 7.1.26 actually has **5 coefficients** (a1..a5 + p), not 7 — the figure ~7.5e-8 absolute error matches the 5-coefficient form. The "7-coefficient" line in CONTEXT.md is a transcription error in the original research summary. See "Decision Re-route" below; recommend: ship the Cody-1969 algorithm in all 3 runtimes (matches on-chain bit-for-bit) — easier than ship A-S and have D-08's "abstain on mis-quote" trigger constantly because our prices are ~1e-7 off from oracle prices that use Cody.

**Three-Way Parity**
- **D-10:** Shared fixed-point everywhere. Python int + TS BigInt + Move u128 at **10²⁷ (variance) and 10¹⁸ (price)**. CI parity = exact `==`.
  - **⚠️ CONTRADICTED.** The on-chain Predict protocol uses **FLOAT_SCALING = 1e9 (10⁹)** for ALL quantities (variance, price, log-strike). See `predict::constants::float_scaling!()`. Phase 0's `strategy.toml` `[fixed_point]` block declared 18/27/9 scales to match the *vault's* internal accounting, but the SVI math layer needs to operate at the same scale as the oracle it reads from — 1e9. The variance_decimals=27 was a *guess* about the future SVI scale, made before the oracle source was read.
  - **Real architecture:** SVI math at 1e9 (matches oracle); vault NAV/price math at 1e18 (industry standard for token prices); vault shares at 1e9 (Sui Coin convention). The 1e9 scale for SVI is fine because total_variance values are typically in [1e-4, 4] which at 1e9 scaling fits comfortably in u64 with 6+ orders of headroom; intermediate products fit in u128.
  - **Planner action:** add a new `[fixed_point.svi]` sub-section to `shared/strategy.toml` declaring `svi_scale = 9` (matching FLOAT_SCALING), and clarify that variance_decimals=27 is for the *vault's* future internal price-quoting, not the SVI layer. Phase 1's `svi_view` uses 1e9 throughout. Document the unit boundary in `shared/svi-spec.md`.

- **D-11:** Square root: integer Newton-Raphson with deterministic convergence (loop until x_{n+1} == x_n or x_{n+1} == x_n + 1). Same algorithm + termination in all 3 runtimes; bit-identical output. Reference impl ~20 lines per runtime.
  - **⚠️ MISMATCH WITH ON-CHAIN.** On-chain `sqrt_u128` uses **bit-length initial guess + 7 unrolled Newton iterations + final overshoot correction `if (g * g > x) g = g - 1`**. NOT loop-until-converged. This is faster (deterministic constant gas) but only converges fully for u128 inputs ≤ ~2^128. For our domain (variance values ≤ ~4 * 1e9 = 4e9, fits in 32 bits), 7 iterations is gross overkill but identical result. **Recommend: clone the on-chain algorithm verbatim into Python and TypeScript.** Mirrors the canonical implementation; eliminates "did we converge yet?" branching that subtle differences in convergence detection could cause across runtimes. Code-citation goes in `shared/svi-spec.md`.

- **D-12:** Truncate toward zero everywhere. ✅ Matches on-chain (Move `/` truncates).
- **D-13:** u256 for intermediates, u128 for inputs/outputs.
  - **⚠️ MISMATCH.** On-chain uses u128 for intermediates and u64 for inputs/outputs. u256 IS available in Move 2024 ([Sui issue #14062](https://github.com/MystenLabs/sui/issues/14062), and Sui CLI mainnet-v1.71.1 supports it), but the vendored Predict code chose u128 + u64 because all SVI quantities at 1e9 scaling fit comfortably. **Recommend: u128 intermediates, u64 inputs/outputs**, matching on-chain. u256 is unnecessary at 1e9 scaling for the SVI domain (k ∈ ~[-1, 1] in 1e9, w ≤ 4e9, products of two 1e9 values fit in u64 after `/F`, products of three fit in u128 after one `/F`). This also relaxes Move's typing burden — no `as u256` casts littered through the code.

- **D-14:** Binary price parity claim is exact equality at 10⁻¹⁸. Locked op-order in `shared/svi-spec.md`. **Re-route to 10⁻⁹** following D-10 re-route. Achievable: shared FLOAT_SCALING + locked Cody Φ + on-chain Newton sqrt + truncate rounding fully determines op order.

**Golden Vectors**
- **D-15..D-19:** Python is canonical via `scripts/golden_emit.py`; codegen-drift extends to `shared/golden-vectors.json`; integer hex strings; ~120 vectors across Tier A (Gatheral 2014 §4), Tier B (synthetic stress), Tier C (JackJacquier/SSVI cross-check); no time-stamped replay; whitepaper claim ladder.
  - **⚠️ JackJacquier/SSVI is for Tier C cross-check.** Spike findings: the JackJacquier/SSVI repo ([github.com/JackJacquier/SSVI](https://github.com/JackJacquier/SSVI)) has **no LICENSE file** (legally ambiguous for direct vendoring), **only 4 commits** (last activity not visible — appears mostly inert), and ships **a single Jupyter notebook (`SSVILocalVol.ipynb`)** computing implied + local vol. **It does NOT ship reference test vectors** as a JSON or fixture file; we'd have to execute the notebook ourselves and capture outputs. Tier C is therefore: (a) execute the notebook against pinned inputs, (b) capture the output table by hand into `tests/fixtures/jackjacquier_ssvi_outputs.json`, (c) document the input parameters and notebook git SHA in `shared/svi-spec.md`. License-wise: the absence of a LICENSE file means MIT/Apache assumption is unsafe; treat the notebook as a *reference for cross-checking* (fair use), not as code to vendor. Citation in whitepaper is fine.
  - **If D-01 re-routes to raw SVI**, JackJacquier/SSVI is *less* aligned (it's an SSVI repo) but still useful — raw SVI per slice is what Gatheral & Jacquier 2014 builds atop. Tier C value reduces; supplement with the on-chain Predict tests (the vendored fork has unit tests in `packages/predict/tests/oracle_tests.move` we can read for output-shape sanity checks).

### Claude's Discretion (verbatim, see CONTEXT.md)

- File layout: `backtest/src/deepvault/{svi,binary,arb_checker}.py` + `contracts/sources/svi_view.move` + `dashboard/src/lib/svi.ts`. Op-order spec at `shared/svi-spec.md`. ✅ Recommend: locate Φ + sqrt as separate modules (`backtest/src/deepvault/{phi,isqrt}.py`, `contracts/sources/{phi,isqrt}.move`, `dashboard/src/lib/{phi,isqrt}.ts`) for direct testability and clean references in the spec doc.
- Test framework: `sui move test` + pytest + Vitest. ✅ Compatible with Phase 0 CI matrix.
- Newton-Raphson seed selection — recommendation per spike: clone on-chain `sqrt_initial_guess_u128` (bit-length-rounded-up-then-halved), reproduce in Python + TS.
- A-S coefficient table hand-coded in 3 runtimes. **Re-route per D-09:** Cody-1969 coefficients (about 30 numbers across 3 piecewise ranges) — too many for the planner to "hand-code" reliably; **recommend codegen.** Add a new emitter: `scripts/codegen.py` reads a new `shared/cody_phi_coefficients.toml` and emits `phi_coefficients.{move,py,ts}`. Same drift-check pattern as `strategy.toml`.
- `[svi]` schema fill-in: Phase 1 adds parameter bound defaults and binary-price domain limits. ✅ Re-route to raw-SVI bounds: per-param bounds documented in spec; the closed-form arb bound is the open question.

### Deferred Ideas (verbatim, OUT OF SCOPE)

- Oracle authority whitelist (Phase 2)
- Oracle staleness gating (Phase 2)
- Abstain-on-Predict-mis-quote policy (Phase 2)
- Time-stamped replay vectors (Phase 3)
- SSVI calibrator (Phase 3)
- eSSVI 4-parameter extension (post-submission)
- Higher-order CDF approximation (Cody 1969 — **NOTE: ON-CHAIN ALREADY USES CODY**, so what's actually deferred is upgrading from there, e.g., Hart 1968. Phase 1 ships Cody.)
- MATH: commit-prefix policy — recommend Phase 1 plan creates this as a sub-task.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MATH-01 | Python SSVI evaluator audited against Gatheral & Jacquier 2014 published test cases | `backtest/src/deepvault/svi.py` (Python canonical); pytest reads `shared/golden-vectors.json` Tier A vectors against `scipy.stats.norm.cdf` cross-check (MEDIUM-tolerance) PLUS `phi.py` (Cody) for bit-equal parity. Audit rendered as a separate test file (`tests/test_gatheral_paper_vectors.py`) for clarity. |
| MATH-02 | Move `deepvault::svi_view` SSVI evaluator producing identical output to Python on 100+ golden vectors | `contracts/sources/svi_view.move` consumes `OracleSVI` shared object via `&OracleSVI` ref, calls `oracle::svi(oracle)` to get `SVIParams`, evaluates locally using triple-emitted formula matching on-chain `oracle::compute_nd2`. **Note:** since Predict's `oracle.move::compute_nd2` is `private fun`, we re-implement it in `svi_view`; the parity gate against Predict's actual outputs is implicit (same algorithm = same output, asserted via Tier B vectors that compare both). Move test reads vectors from `shared/golden-vectors.json` via `aborts_if_not_implemented` workaround OR a parallel `golden-vectors.move` constants file emitted by `scripts/golden_emit.py`. **Recommend: emit a Move-format companion** (`contracts/tests/golden_vectors_data.move`) containing `vector<vector<u64>>` of the test cases. CI's parity job compares the JSON and the Move data file for drift. |
| MATH-03 | TypeScript `dashboard/lib/svi.ts` evaluator producing identical output to Python | `dashboard/src/lib/svi.ts` exports `evaluateSVI(params, k_q64): { w: bigint, binaryPrice: bigint, paramsValid: boolean, minGk: bigint, calendarPass: boolean, gK: bigint[] }` — same shape as Python. Vitest reads `shared/golden-vectors.json` and BigInt-asserts equality. |
| MATH-04 | Arb-free checker with closed-form + ≥200-pt g(k) grid + calendar-monotonicity, with diagnostic visualization (visible g(k) plot, not boolean) | Python+TS return `g_k` array of length ≥200 across `±strike_range_sigma` (=4) at 200 sample points (per `strategy.toml`). The g(k) formula for raw SVI total-variance smile is in Gatheral 2014 §3.2: `g(k) = (1 - k·w'(k)/(2·w(k)))² - w'(k)²/4 · (1/w(k) + 1/4) + w''(k)/2`. Plot is rendered in Phase 4 dashboard; Phase 1 ships the data array, parity-tested. Calendar test = check that `w(k, T_long) ≥ w(k, T_short)` for all k on the grid (when multi-tenor — currently single-oracle-per-expiry, so calendar test is a no-op stub returning `true` with documented reason). |
| MATH-05 | Three-way parity gate enforced in CI — failing the gate blocks any further phase work | `.github/workflows/ci.yml` `parity` job already exists (Phase 0 stub, asserts file exists). Phase 1 wires real cross-runtime check: (a) `cd backtest && uv run python -m deepvault.parity_runner` → reads JSON, evaluates each vector via Python, exits 1 on any mismatch; (b) `cd dashboard && pnpm exec tsx scripts/parity_runner.ts` → same in TS; (c) `cd contracts && sui move test --filter golden_vectors` → Move tests reading the Move-format companion data. JOB NAME `parity` stays stable so branch protection survives (Plan 00-07 closure note). |
| MATH-06 | Theoretical binary-price function derived from SVI parameters at target strike | `binary_price(svi_params, forward, strike) → u64` in all 3 runtimes. Powers vault hedge pricing (Phase 2 reads it via `svi_view::binary_price` to compare against Predict's quote per D-08) AND backtest (Phase 3 prices the simulated hedge book via the same Python function). |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| SVI total-variance evaluation `w(k,T,params)` | Move (`svi_view`), Python (`svi.py`), TypeScript (`svi.ts`) — all read-only | — | Triple-emit by design (D-01..D-19); mathematically pure function; no side effects |
| Standard normal CDF Φ | Move (`svi_view::phi` re-impl), Python (`phi.py`), TypeScript (`phi.ts`) | Python `scipy.stats.norm.cdf` for cross-check only | Cody-1969 in fixed-point integer math; coefficient table emitted by codegen; verified at HIGH precision against scipy in test |
| Integer Newton sqrt | Move, Python, TypeScript (triple-emit) | — | Pure function; on-chain `sqrt_u128` is the canonical algorithm |
| Closed-form arb-bound (params validity) | Move (hard-reject), Python (returns bool), TypeScript (returns bool) | — | On-chain rejects mint at `assert!(!i64::is_negative(&inner), ECannotBeNegative)` — the existing oracle math already implicitly enforces a subset; svi_view rejects on a stricter bound for our purposes |
| 200-pt g(k) grid scan | Python (`arb_checker.py`), TypeScript (`arb_checker.ts`) | NOT Move (gas) | Off-chain only per D-05; Python output drives the backtest's pre-trade safety gate, TS output drives the Phase 4 dashboard plot |
| Calendar-monotonicity test | Python, TypeScript | — | Multi-tenor required; currently single-oracle-per-expiry so stub returns true |
| Binary-call price `N(d2)` | Move, Python, TypeScript (triple-emit) | — | Pure function of (forward, strike, total_variance); D-06 r=0; bit-equal at 1e-9 |
| Golden-vector emission | Python (canonical) → JSON + Move companion file | — | Codegen drift discipline (Plan 00-07 pattern) |
| CI parity assertion | GitHub Actions `parity` job | — | Existing stub gets actual content; same job name preserves branch protection |
| Op-order spec | `shared/svi-spec.md` (new) | — | Single source of truth for "(a*b)/c is canonical, never a*(b/c)"; documents Φ coefficients, sqrt seed rule, max safe input domain |

## Standard Stack

### Core (Phase 1 ships these)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Sui CLI | `mainnet-v1.71.1` | Move build/test for `svi_view.move` | Already pinned per Phase 0 (`Move.toml`, CI). u256 + u128 + u64 all available; `sui move test --gas-limit 100000000000` per `.claude/rules/move.md` from vendored fork |
| Move Edition | `2024.beta` | `contracts/Move.toml` already pinned | u256 supported; macros + `use fun` aliases available |
| Python | `3.12+` | Canonical evaluator + emitter | `pyproject.toml` already pins `>=3.12`; `int` is arbitrary-precision = correct for our 1e9-scaled fixed-point math |
| `numpy` | `>=2.4` | Vector math for grid sampling in arb-checker | Already in `pyproject.toml`. **Note:** numpy is for the off-chain g(k) grid only; the canonical evaluator uses Python `int` arithmetic (NOT numpy `float64`) to maintain bit-equality with Move u64. Use numpy ONLY for the visualization-bound g(k) array — and even there, output is converted to Python int / hex string for JSON serialization. |
| `scipy` | `>=1.14` | `scipy.stats.norm.cdf` for HIGH-precision cross-check ONLY | Already in `pyproject.toml`. **Never used in the canonical evaluator** — only as a sanity ground truth in `tests/test_phi_against_scipy.py`. |
| `pytest` | `>=8.3` | Test runner | Already in `pyproject.toml` dev deps |
| TypeScript | `^5.6+` | `dashboard/src/lib/svi.ts` | Phase 0 default; BigInt is the canonical integer type — `bigint` literal syntax `1209600n` already used in `strategy_constants.ts` |
| Vitest | `^4.1+` | TS test runner | Phase 0 default; ships in dashboard workspace |
| `tomli-w` | `>=1.0` | Python writes TOML for `phi_coefficients.toml` if codegen extends | Already in `pyproject.toml` dev deps |

### Supporting (Phase 1 reads, doesn't ship)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Vendored DeepBookV3 (`scripts/deepbookv3/`) | rev `1159d79af33c70e09e406310e1d8f067832ede9d` | Source-of-truth for raw SVI formula, FLOAT_SCALING, Cody Φ coefficients, Newton sqrt | Read `packages/predict/sources/{oracle,oracle_config}.move` and `helper/{math,i64,constants}.move` directly. Do NOT import or vendor any Predict code into our `contracts/` — `Move.toml` already imports the package via `[dependencies]`. |
| `tomllib` (stdlib Python 3.11+) | builtin | Read `shared/strategy.toml` and (if codegen extends) `shared/cody_phi_coefficients.toml` | `scripts/golden_emit.py` and possibly an extended `scripts/codegen.py` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Cody 1969 Φ (matches on-chain) | Abramowitz-Stegun 7.1.26 (5-coef, ~7.5e-8) | A-S is *intuitively simpler* but the on-chain oracle ships Cody — using A-S guarantees ~1e-7 disagreement with `predict::mint` prices, defeating D-08's "abstain on mis-quote" comparison. Cody coefficients are larger but emitted via codegen. |
| Raw 5-param SVI (matches on-chain) | SSVI Heston-power-law 3-param (D-01) | SSVI has a clean closed-form butterfly bound (η(1+|ρ|) ≤ 2). Raw SVI's bound is harder (Roper-Rutkowski, Martini-Mingone 2020). BUT: on-chain emits raw, so to match Predict's prices we must evaluate raw. Off-chain arb panel can apply *additional* SSVI sufficient conditions on top of the grid scan if a future phase wants the cleaner whitepaper claim. |
| u128 intermediates (matches on-chain) | u256 intermediates (D-13) | u256 is overkill at 1e9 scaling; u128 fits with 6+ orders of headroom. u128 also matches on-chain bit-for-bit so identity transformations between our svi_view and oracle compute_nd2 are obviously equivalent. |
| 1e9 FLOAT_SCALING (matches on-chain) | 1e27 variance / 1e18 price (D-10) | 1e9 matches the oracle we read from. The Phase 0 vault-internal scales (18/27/9) stay for the *vault NAV* layer (Phase 2), but the SVI math layer operates at 1e9. |
| 7-iteration unrolled Newton sqrt (matches on-chain) | Loop-until-convergence (D-11) | Convergence detection is a divergence vector across runtimes; fixed-iteration is safer and matches on-chain. 7 iterations is overkill for our domain so we get full precision regardless. |

**Installation:** No new packages needed for Phase 1; `pyproject.toml` already pins everything. Verify Python emitter runs:
```bash
cd backtest && uv run python -c "import scipy.stats; print(scipy.stats.norm.cdf(0.5))"
```

**Version verification:**
- `numpy`: latest 2.x is 2.4.x as of 2026-05 per CLAUDE.md Stack. Phase 0 pinned `>=2.4`.
- `scipy`: 1.14.x is current per CLAUDE.md.
- Sui CLI mainnet-v1.71.1 is the pinned version (Plan 00-07 ships an explicit release-tarball download in CI).

## Spike Findings (Day-1 Prerequisite — DONE)

The vendored DeepBookV3 fork at `scripts/deepbookv3/` (HEAD `1159d79af33c70e09e406310e1d8f067832ede9d`) is the source of truth. Reading `packages/predict/sources/oracle.move` + `helper/math.move` + `helper/i64.move` + `helper/constants.move` resolves the day-1 spike CONTEXT.md flagged.

### Finding 1 — `OracleSVIUpdated` event struct shape

**Location:** `oracle.move:58-66`. The event struct emits:
```move
public struct OracleSVIUpdated has copy, drop, store {
    oracle_id: ID,
    a: u64,                    // SVI vertical level (≥0)
    b: u64,                    // smile-wing slope (≥0)
    rho: i64::I64,             // SIGNED skew param
    m: i64::I64,               // SIGNED horizontal shift
    sigma: u64,                // ATM curvature (≥0)
    timestamp: u64,
}
```

**Implication:** The oracle emits **5-parameter raw SVI** (Gatheral 2004 / 2014 §2 form), NOT the SSVI Heston-power-law 3-parameter (η, γ, ρ) that D-01 picked. Per CONTEXT.md D-02 contingency, this triggers re-decision: project to (θ_T, ρ, η, γ) at evaluator boundary, OR re-decide and ship raw SVI. **Strong recommendation: ship raw SVI** to match the oracle that vault.rebalance reads from. SSVI sufficient conditions can be added as an *additional* off-chain check in `arb_checker.py` for the whitepaper claim ladder.

### Finding 2 — One oracle per (underlying, expiry)

**Location:** `oracle.move:96-114` (`OracleSVI` struct + `create_oracle` doc comment). The shared `OracleSVI` object stores `expiry: u64` and a single `SVIParams svi` per oracle. **There is NO concept of "per-tenor θ_T within one oracle"** — each tenor is its own oracle object. Calendar-monotonicity test across tenors therefore requires reading multiple oracle objects; for Phase 1 (single hedge tenor = 14d per `strategy.toml`), the calendar test is a no-op (returns `true` with documented reason in spec).

### Finding 3 — On-chain SVI evaluator already exists

**Location:** `oracle.move:400-429` (private `compute_nd2`). The full algorithm:
```
k = predict_math::ln(strike / forward)        // signed log-strike, 1e9 scaled
k_minus_m = k - svi.m                           // i64
k_minus_m_squared = (k_minus_m)² / 1e9          // u64 (squared signed → unsigned)
sigma_squared = svi.sigma * svi.sigma / 1e9     // u64
sq = predict_math::sqrt(k_minus_m_squared + sigma_squared, 1e9)   // u64
rho_km = svi.rho * (k - svi.m) / 1e9            // signed multiplied
inner = rho_km + sq                             // i64
total_var = svi.a + svi.b * |inner| / 1e9       // u64; assert inner >= 0
sqrt_var = predict_math::sqrt(total_var, 1e9)
half_var = total_var / 2
d2_numerator = k + half_var
d2 = -(d2_numerator / sqrt_var)                 // i64
return predict_math::normal_cdf(&d2)            // u64, the binary call price
```

This IS our canonical algorithm. Phase 1's `svi_view::binary_price` should produce **exactly** this output for the same (oracle, strike) pair (as a tested invariant — vault.rebalance can sanity-check that fair value computed locally equals fair value as the oracle would compute).

### Finding 4 — Φ uses Cody 1969, not Abramowitz-Stegun 7.1.26

**Location:** `helper/math.move:31-65` (constants), `:191-239` (`normal_cdf_u128`). Source comment: `// Source: W.J. Cody (1969), as implemented in GSL gauss.c`. Three piecewise ranges:
- Small (|x| < 0.66291): `Φ(x) = 0.5 + x · P(x²) / Q(x²)`, ~10 coefficients.
- Medium (0.66291 ≤ |x| < √32): `complement = exp(-x²/2) · P(|x|) / Q(|x|)`, ~18 coefficients.
- Large (|x| ≥ √32 ≈ 5.657): clamps to 0 or 1 (extreme tail < 1e-7).

Cody 1969 is significantly more accurate than A-S 7.1.26 (1e-15 in float, ~5 units at 1e9). Coefficient table is in `helper/math.move:31-65` — large but mechanically transcribable. **Recommend: codegen all three runtimes from a single TOML.**

### Finding 5 — Newton sqrt is fixed-iteration with bit-length seed

**Location:** `helper/math.move:266-292`. The algorithm:
```move
sqrt_u128(x):
  if x == 0 return 0
  if x < 4 return 1
  g = sqrt_initial_guess_u128(x)    // bit-length-rounded-up-then-halved
  // 7 unrolled Newton iterations
  g = (g + x / g) / 2
  g = (g + x / g) / 2
  ... (7 total)
  if (g * g > x) g = g - 1          // overshoot correction
  return g
```

Fully deterministic. Seven iterations is more than enough for u128 inputs to converge fully. **Recommend cloning verbatim.**

### Finding 6 — Signed integer wrapper `i64::I64`

**Location:** `helper/i64.move`. Sign-magnitude representation: `{ magnitude: u64, is_negative: bool }`. Provides `add`, `sub`, `neg`, `mul_scaled`, `div_scaled`, `square_scaled`, `from_u64`, `from_parts`, `is_negative`, `magnitude`. **Important:** zero is normalized — `from_parts(0, true)` returns `zero()` with `is_negative: false`. Multiplication uses `1e9` (FLOAT_SCALING) as the divisor.

For Python: subclass `int` (Python `int` is signed, so trivial). For TypeScript: `BigInt` is signed natively. **In both off-chain runtimes**, the i64 wrapper is mostly conceptual — we just track sign in arithmetic. The Move side is the one that needs the explicit wrapper. Recommend: in `shared/svi-spec.md`, document the boundary: "Python and TS use signed `int`/`bigint` directly; Move uses `i64::I64`. Sign convention: zero is positive (`is_negative: false`)."

### Finding 7 — `predict::mint` price-input format (informs D-08)

**Location:** `predict.move:219-266`. Signature:
```move
public fun mint<Quote>(
    predict: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    key: MarketKey,           // (oracle_id, expiry, strike, is_up)
    quantity: u64,
    clock: &Clock,
    ctx: &mut TxContext,
)
```
The price the user pays is `cost = ask · quantity` where `ask` comes from `predict.trade_prices(oracle, key, clock)`. `trade_prices` (not shown but called from `mint`) reads `oracle.compute_price(strike)` (the no-spread mid = our "fair value") and adds Bernoulli scaling spread (`base_spread * sqrt(p*(1-p))`). For D-08's "abstain on Predict mis-quote" comparison, vault.rebalance compares our local `svi_view::binary_price(oracle, strike)` (≈ `oracle.compute_price(strike)` mid) against the on-chain `predict.get_trade_amounts(...)` returned ask, with a tolerance ≥ the maximum expected `base_spread + min_spread + utilization_multiplier` overhead. The fair-value-vs-ask delta in normal markets is ~1-3% at 50/50 strikes. ✅ D-08 is implementable; spike-confirmed.

### Finding 8 — Strike grid is enforced by `oracle_config`

**Location:** `oracle_config.move:33-37, 157-167`. Each oracle has a `min_strike`, `max_strike`, `tick_size`. `predict::mint` validates the strike is on-grid via `oracle_config.assert_valid_strike`. **Implication for Phase 1:** the binary_price function must accept *any* u64 strike (not just on-grid) for backtest sweeps and dashboard what-if simulator; the on-grid check is Phase 2's vault.rebalance concern. Document in spec: "Phase 1 evaluator is parameter-pure; on-grid validation is the caller's responsibility."

### Finding 9 — Predict has its own validation TODO

**Location:** `oracle.move:140-141, 184-185`. Both `update_prices` and `update_svi` carry a `// TODO: Add validation on pushed spot/forward data so obviously bad oracle updates are rejected before they mutate state.` Mysten ships the trust-the-oracle posture with no on-chain SVI param validation. **Implication:** Phase 1's `svi_view` MUST defensively reject params that produce arbitrage (D-04 hard-reject in Move). The vault is the LAST line of defense; the oracle is permissive.

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│  Phase 1: Math Foundation — read-only, parameter-pure functions     │
│                                                                      │
│  shared/strategy.toml         shared/golden-vectors.json (Phase 1   │
│  shared/svi-spec.md  ◄────────fills via golden_emit.py)             │
│  shared/cody_phi_coefs.toml                                          │
│      │                                │                              │
│      │  scripts/codegen.py            │                              │
│      │  (Phase 0 pattern, extended    │  scripts/golden_emit.py     │
│      │   for Phi coefficients)        │  (NEW Phase 1)              │
│      ▼                                ▼                              │
│  ┌────────────────────────────────────────────────────────────┐     │
│  │  Triple-emit constants:                                    │     │
│  │   - contracts/sources/strategy_constants.move (existing)   │     │
│  │   - backtest/src/deepvault/strategy_constants.py (existing)│     │
│  │   - dashboard/src/lib/strategy_constants.ts (existing)     │     │
│  │   + phi_coefficients.{move,py,ts} (NEW Phase 1)            │     │
│  └────────────────────────────────────────────────────────────┘     │
│                                                                      │
│  ┌─────────────────┐  ┌──────────────────┐  ┌──────────────────┐   │
│  │  Move           │  │  Python          │  │  TypeScript      │   │
│  │  svi_view.move  │  │  svi.py          │  │  svi.ts          │   │
│  │  phi.move       │  │  phi.py          │  │  phi.ts          │   │
│  │  isqrt.move     │  │  isqrt.py        │  │  isqrt.ts        │   │
│  │  arb_check      │  │  arb_checker.py  │  │  arb_checker.ts  │   │
│  │   (closed-form  │  │  (closed-form +  │  │  (closed-form +  │   │
│  │    only)        │  │   200-pt grid +  │  │   200-pt grid +  │   │
│  │                 │  │   calendar)      │  │   calendar)      │   │
│  │     │           │  │     │            │  │     │            │   │
│  │  reads OracleSVI│  │  consumes JSON   │  │  consumes JSON   │   │
│  │  shared object  │  │  golden vectors  │  │  golden vectors  │   │
│  │  (real or test) │  │  + scipy cross-  │  │                  │   │
│  │                 │  │    check         │  │                  │   │
│  └────────┬────────┘  └────────┬─────────┘  └────────┬─────────┘   │
│           │                    │                     │              │
│           ▼                    ▼                     ▼              │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  CI parity job (Phase 1 wires actual content into existing  │   │
│  │   Phase 0 stub):                                            │   │
│  │   1. Move: sui move test --filter golden_vectors             │   │
│  │   2. Python: uv run pytest tests/test_svi_parity.py          │   │
│  │   3. TS: pnpm exec vitest run lib/svi.test.ts                │   │
│  │   4. Cross-asserter: parity_runner.{py,ts} compares JSON     │   │
│  │      values to runtime outputs and exits 1 on any mismatch   │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  Reads (NOT writes):                                                 │
│   - Phase 2 vault.rebalance imports svi_view::binary_price          │
│   - Phase 3 backtest imports deepvault.svi.binary_price             │
│   - Phase 4 dashboard imports svi.ts evaluateSVI for plot + sim     │
└─────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

Phase 1 adds these files (all NEW; reuses Phase 0 dirs):

```
shared/
├── svi-spec.md                     # NEW: op-order canonicalization, Φ coefs reference,
│                                   #   sqrt rule, max safe input domain, formula derivation,
│                                   #   whitepaper claim ladder (D-19)
├── golden-vectors.json             # Phase 0 stub `[]`; Phase 1 fills with ~120 vectors
├── cody_phi_coefficients.toml      # NEW: source for codegen of Φ coef tables
└── strategy.toml                   # Phase 0; Phase 1 extends [svi] section + adds [fixed_point.svi]

scripts/
├── codegen.py                      # Phase 0; Phase 1 extends to emit phi_coefficients triple
└── golden_emit.py                  # NEW: Python canonical emitter; reads paper inputs,
                                    #   stress generators, JackJacquier fixture; writes JSON
                                    #   AND a Move companion data file
contracts/
├── sources/
│   ├── strategy_constants.move     # Phase 0 generated; unchanged
│   ├── phi_coefficients.move       # NEW: codegen-emitted from cody_phi_coefficients.toml
│   ├── isqrt.move                  # NEW: integer Newton sqrt (clones on-chain sqrt_u128)
│   ├── phi.move                    # NEW: Cody 1969 normal CDF (clones on-chain normal_cdf)
│   └── svi_view.move               # NEW: SVI total variance + binary_price + closed-form arb
└── tests/
    ├── golden_vectors_data.move    # NEW: Move-format companion to golden-vectors.json
    ├── svi_view_test.move          # NEW: reads golden_vectors_data; asserts each vector
    ├── phi_test.move               # NEW: tests Φ at A-S benchmark points (0, 0.5, 1, 2, etc.)
    └── isqrt_test.move             # NEW: tests sqrt at perfect-square + odd-input cases

backtest/src/deepvault/
├── strategy_constants.py           # Phase 0 generated; unchanged
├── phi_coefficients.py             # NEW: codegen-emitted
├── isqrt.py                        # NEW: integer Newton sqrt (mirrors Move)
├── phi.py                          # NEW: Cody 1969 normal CDF (mirrors Move)
├── svi.py                          # NEW: total_variance + binary_price + i64-equivalent helpers
├── arb_checker.py                  # NEW: closed-form + g(k) grid + calendar-monotonicity
└── parity_runner.py                # NEW: reads golden-vectors.json, asserts each Python output

backtest/tests/
├── test_phi_against_scipy.py       # NEW: cross-check Cody Φ vs scipy.stats.norm.cdf
├── test_isqrt.py                   # NEW: perfect squares, odd inputs, large u64
├── test_svi_parity.py              # NEW: reads golden-vectors.json, asserts equality
├── test_gatheral_paper_vectors.py  # NEW: Tier A vectors with paper provenance
└── test_arb_checker.py             # NEW: knwon-arb-violating slices return params_valid=false

dashboard/src/lib/
├── strategy_constants.ts           # Phase 0 generated; unchanged
├── phi_coefficients.ts             # NEW: codegen-emitted
├── isqrt.ts                        # NEW: BigInt Newton sqrt
├── phi.ts                          # NEW: Cody 1969 CDF in BigInt
├── svi.ts                          # NEW: evaluateSVI(params, k_q64): {w, binaryPrice, ...}
├── arb_checker.ts                  # NEW: same shape as Python
└── parity_runner.ts                # NEW: reads golden-vectors.json, asserts each TS output
                                    #   (callable from Vitest OR standalone CLI for CI)

dashboard/src/lib/__tests__/
├── phi.test.ts                     # NEW
├── isqrt.test.ts                   # NEW
└── svi.test.ts                     # NEW: reads golden-vectors.json, asserts BigInt equality
```

### Pattern 1: Triple-emit codegen with drift CI (extending Phase 0)

**What:** A single Python script reads a TOML and emits 3 constants files, one per runtime. CI runs the script in `--check` mode and fails if any generated file differs.

**When:** Any cross-runtime constants table that exceeds ~5 numbers and would be error-prone to hand-maintain.

**Phase 1 application:** `cody_phi_coefficients.toml` → `phi_coefficients.{move,py,ts}`. Same emission shape as Phase 0's `strategy.toml` → `strategy_constants.{move,py,ts}`.

**Example:**
```python
# scripts/codegen.py (extended; existing pattern)
def emit_phi_move(coefs: dict) -> str:
    parts = [header_block("//", coefs["schema_version"])]
    parts.append("\nmodule deepvault::phi_coefficients {\n")
    parts.append(f"    public fun small_threshold(): u128 {{ {coefs['small']['threshold']} }}\n")
    for name, value in coefs['small']['numerator'].items():
        parts.append(f"    public fun small_a_{name}(): u128 {{ {value} }}\n")
    # ... (medium, large) ...
    parts.append("}\n")
    return "".join(parts)
```

### Pattern 2: Single-file blast radius for external schema churn

**What:** Phase 0 established `vault::predict_adapter` as the single file that imports Predict types — if Predict's ABI changes, only that file edits. Phase 1 follows the same shape:

**Phase 1 application:** `svi_view::binary_price(oracle: &OracleSVI, strike: u64) → u64` is the ONLY function in `contracts/sources/` that imports `deepbook_predict::oracle::OracleSVI`. All Phase 1 internals (`phi.move`, `isqrt.move`, the actual SVI arithmetic) take `SVIParams` (or unpacked `(a, b, rho, m, sigma)`) directly. If Predict's `OracleSVI` field naming or `svi()` accessor changes, only `svi_view.move`'s signature changes.

### Pattern 3: Fixed-iteration unrolled Newton sqrt (cloned from on-chain)

**What:** Bit-length initial guess + N unrolled iterations + final overshoot correction.

**When:** Any sqrt that needs deterministic gas / cross-runtime parity.

**Example (paste-ready, Python):**
```python
# backtest/src/deepvault/isqrt.py
# Source: oracle.move sqrt_u128 + sqrt_initial_guess_u128
# Bit-equal in Move u128, Python int, TypeScript BigInt.

def isqrt_u128(x: int) -> int:
    if x == 0:
        return 0
    if x < 4:
        return 1
    # bit-length-based seed: 1 << ((bits + 1) // 2)
    bits = x.bit_length() - 1   # position of highest set bit
    g = 1 << ((bits + 1) // 2 + 1)  # match Move's normalize convention
    # 7 unrolled iterations
    for _ in range(7):
        g = (g + x // g) // 2
    if g * g > x:
        g -= 1
    return g
```
*(Note: the seed formula needs careful verification against `sqrt_initial_guess_u128`'s exact bit-shift sequence. Plan task should include a cross-check test: 10,000 random u64 inputs, assert Python output == Move output.)*

### Pattern 4: g(k) array as visible diagnostic (MATH-04 lever)

**What:** The arbitrage checker returns the full g(k) array (length ≥ 200) PLUS the boolean `params_valid`. Phase 4 dashboard renders this as a chart; the actual violation curve is visible to the user, not a green/red light.

**When:** Whenever a boolean is *technically sufficient* but a visual is judge-credibility multiplier.

**g(k) formula** (Gatheral & Jacquier 2014 §3.2 / Eqn 2.2):
```
For raw SVI w(k) = a + b * (rho * (k - m) + sqrt((k - m)^2 + sigma^2)):

w'(k) = b * (rho + (k - m) / sqrt((k - m)^2 + sigma^2))
w''(k) = b * sigma^2 / ((k - m)^2 + sigma^2)^(3/2)

g(k) = (1 - k * w'(k) / (2 * w(k)))^2 - (w'(k))^2 / 4 * (1/w(k) + 1/4) + w''(k) / 2
```

g(k) ≥ 0 is the no-butterfly-arbitrage condition (equivalent to risk-neutral density ≥ 0). When g(k) dips negative, the surface admits butterfly arbitrage and the binary at that k is mispriced.

**Visualization sample**: x-axis log-strike k ∈ [-4σ, +4σ] (200 points); y-axis g(k). Valid surface: smooth curve ≥ 0 everywhere. Arb-violating: curve dips below zero in a visible band. Annotate `min(g(k))` and the strike where it occurs.

### Anti-Patterns to Avoid

- **Mixing `float` and `int` in Python evaluator:** `numpy.float64` arithmetic in the Python canonical evaluator destroys bit-equality with Move u64. Allowed ONLY in `arb_checker.py`'s grid sampling (which is for visualization, not parity). Cross-check via `assert isinstance(result, int)` in the parity_runner.
- **`Number` arithmetic in TypeScript evaluator:** TS `Number` is IEEE 754 float; mixing with `BigInt` requires explicit conversion and silently destroys parity. Lint rule: `no-implicit-coercion` strict; CI greps for `Number(` in `dashboard/src/lib/{svi,phi,isqrt}.ts` and fails if found.
- **Non-canonical operation order:** `(a*b)/c` ≠ `a*(b/c)` in integer math. Spec doc must lock the order; reviewers flag any deviation. Recommend: `mul_div_round_down(a, b, c)` style helper in all three runtimes that takes 3 args explicitly, no chaining.
- **Off-by-one in Φ piecewise range thresholds:** Cody 1969 has 3 ranges with sharp boundaries (0.66291, √32). At the boundary, two formulas can produce slightly different output. Spec doc locks `<` vs `≤` choice; tests assert continuity at the boundary within 1 unit at 1e9.
- **JSON key ordering drift:** if codegen emits JSON with non-deterministic key order, `git diff` flags spurious changes. `json.dumps(..., sort_keys=True)` is the safe default. Same for `golden-vectors.json`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Standard normal CDF Φ | Custom polynomial fit | Cody 1969 (clone on-chain `normal_cdf_u128`) | On-chain ships it; matching guarantees parity with `predict::mint` |
| Integer sqrt | Linear search / `int(math.sqrt(x))` | Newton-Raphson with bit-length seed (clone on-chain `sqrt_u128`) | Deterministic; matches on-chain |
| Natural log `ln(x)` | Series expansion from scratch | Clone on-chain `ln` from `helper/math.move` (range reduction + Padé) | On-chain ships it; needed for log-strike `k = ln(K/F)`. Note: Phase 1 only needs `ln` if vault.rebalance computes `k` itself; if the oracle does it for us via `compute_price(strike)`, we don't need `ln` in `svi_view`. SPIKE: oracle's `compute_nd2` calls `predict_math::ln` internally — `svi_view::binary_price(oracle, strike)` can re-implement the same call chain, so YES we need `ln`. |
| Signed integer arithmetic in Move | Two's complement custom | Clone `helper/i64::I64` (sign-magnitude, normalized zero) | Already on-chain; Move has no native signed |
| Codegen for coefficient tables | Hand-typed in 3 places | `scripts/codegen.py` extension reading `cody_phi_coefficients.toml` | Phase 0 pattern; mistakes in 30+ coefficients would be error-prone |
| g(k) function for raw SVI arb-check | Numerical differentiation | Closed-form derivatives (Gatheral 2014 §3.2 — see Pattern 4 formula) | Numerical differentiation introduces step-size sensitivity that breaks parity |
| BTC-from-spot strike grid | Custom logic | Phase 1 doesn't need this — strike comes from caller (Phase 2 vault picks it via `strike_otm_bps`) | Out of scope; document boundary |
| SSVI calibration | Optimizer | Phase 1 evaluator is parameter-pure; calibration is Phase 3 backtest | Out of scope per CONTEXT.md Deferred |

**Key insight:** **The on-chain Predict implementation IS our reference implementation for the math primitives** (Φ, sqrt, ln, signed i64, raw SVI). Cloning it line-for-line into Python and TypeScript is the safest path to parity, and the spec doc cites the on-chain source for every clone — the auditability story for whitepaper / judges is rock-solid.

## Common Pitfalls

### Pitfall A: Floating-point creep in the Python "canonical" evaluator

**What goes wrong:** Builder writes `svi.py` using `numpy.sqrt`, `math.exp`, `numpy.float64` — runs it locally, emits golden vectors, commits. Move evaluator computes integer-arithmetic outputs that differ by ~1e-7. Parity gate fails. Builder spends 2 days debugging "why the math is wrong" when the math is fine — only the Python representation drifted.

**Why it happens:** Python's "obvious" math is float; the discipline of "everything is `int` at 1e9 scaling" is unintuitive and easy to forget under deadline pressure.

**How to avoid:**
1. **Type annotations everywhere.** `def total_variance(a: int, b: int, ...) -> int:` — mypy strict mode flags any `float` slip.
2. **Runtime assertion in tests.** Every test asserts `isinstance(result, int)`. Vector outputs assert all elements are `int`.
3. **Linter rule.** `ruff` rule `no-implicit-float` (or custom AST check) for `backtest/src/deepvault/{svi,phi,isqrt}.py`.
4. **No `numpy` import in canonical evaluator.** Only `arb_checker.py` may import numpy, and only for the visualization-bound g(k) grid (output converted to Python int before serialization).
5. **`scipy.stats.norm.cdf` is for cross-check ONLY**, never imported in `svi.py` or `phi.py`. Imported only in `tests/test_phi_against_scipy.py`.

**Warning signs:** Any function returning `np.float64` or `numpy.ndarray` with `dtype=float64`. Any `math.sqrt`, `math.exp` import in canonical evaluator modules.

### Pitfall B: TypeScript `Number` ↔ `BigInt` implicit coercion

**What goes wrong:** TS author writes `const w = a * b / c` where `a, b, c` are `bigint` — runtime exception "Cannot mix BigInt and other types." Author wraps in `Number(...)`, "fixes" it. Now produces float output. Parity gate fails.

**Why it happens:** `bigint` doesn't auto-coerce; `Number(BigInt)` lossily converts; ESLint default rules don't catch this.

**How to avoid:**
1. **TypeScript strict mode + `noImplicitAny: true`.**
2. **ESLint rule `@typescript-eslint/no-loss-of-precision: error`.**
3. **Custom lint:** grep `dashboard/src/lib/{svi,phi,isqrt}.ts` for `Number(` and `parseFloat(` — fail CI on match.
4. **All numeric literals in evaluator use `n` suffix:** `1_000_000_000n`, not `1_000_000_000`.
5. **Explicit return type on every exported function:** `: bigint`, not `: any`.

**Warning signs:** Any `Number(...)` call in evaluator modules. Any arithmetic between `bigint` and number-literal without `n` suffix.

### Pitfall C: Move's lack of negative integers — where do we represent log-strike?

**What goes wrong:** `k = log(K/F)`. For OTM puts (K < F), k < 0. Move u64 can't hold a negative. Builder forgets to wrap in `i64::I64`, gets compiler error or wraparound bug.

**Why it happens:** Moving from "k as `f64`" mental model to "k as `i64::I64`" requires discipline.

**How to avoid:**
1. **All log-strike code uses `i64::I64`.** Spec doc documents: "k is signed; sign indicates ITM (positive) vs OTM (negative)."
2. **Clone on-chain `predict_math::ln`** which already returns `i64::I64`.
3. **Test vector for OTM puts in golden vectors:** Tier B includes `K = 0.85 * F` cases (k ≈ -0.16 at 1e9 scale), exercising the negative path.
4. **Off-chain evaluators:** Python `int` and TypeScript `bigint` are signed natively — no wrapper needed; just `int` / `bigint`. Spec doc records the asymmetry: "Move uses i64::I64 explicitly; Python/TS use signed primitives."

### Pitfall D: Op-order ambiguity `(a*b)/c` vs `a*(b/c)`

**What goes wrong:** Two expressions that are mathematically equivalent in real arithmetic produce different integer results. `(7*5)/3 = 11`, but `7*(5/3) = 7*1 = 7`. Across runtimes, if reviewer "improves" one expression, parity breaks.

**Why it happens:** The expressions look identical to a refactoring eye.

**How to avoid:**
1. **Op-order canonical form locked in `shared/svi-spec.md`:** "All multiply-then-divide expressions use the form `mul_div_round_down(a, b, c) = (a * b) / c`. Never `a * (b / c)` even if it appears equivalent."
2. **Helper functions in each runtime that take 3 args:**
   - Move: `predict::math::mul_div_round_down(a, b, c)` (already exists)
   - Python: `def mul_div(a: int, b: int, c: int) -> int: return (a * b) // c`
   - TypeScript: `function mulDiv(a: bigint, b: bigint, c: bigint): bigint { return (a * b) / c; }`
3. **Code review checklist:** any direct `*` followed by `/` in an evaluator file is flagged for the helper.
4. **MATH: commit-prefix policy** — any change to the canonical op order in `shared/svi-spec.md` requires `MATH:` prefix and extra review.

### Pitfall E: IEEE 754 in any test asserter

**What goes wrong:** Test compares `actual` (int) against `expected` (loaded from JSON as `int` via `json.loads`) — but `json.loads` decodes large numbers as `float` for compatibility. Assertion passes for small numbers, fails silently with rounding error for large ones.

**Why it happens:** JSON has no integer/float distinction beyond what the parser inferst; large integers can lose precision.

**How to avoid:**
1. **Store all golden-vector integers as hex strings.** D-16 already specifies this: `"k": "0x..."`. Loader parses via `int(s, 16)` (Python) / `BigInt(s)` (TypeScript) / `vector::from_hex` (Move) — all preserve full precision.
2. **Loader assertions:** `assert isinstance(loaded_k, int)` immediately after parse.
3. **JSON canonical form check:** `scripts/golden_emit.py` always writes hex strings (never decimal); CI greps for non-hex integer literals in `shared/golden-vectors.json` and fails.

### Pitfall F: CI runner GLIBC / CRT differences

**What goes wrong:** Local Move `sui move test` produces output X; CI runs Ubuntu and produces output X' differing by 1 unit. Cause: a `pow`/`exp`/`log` somewhere in the toolchain depends on libc that varies. Hours lost.

**Why it happens:** Sui CLI installs OS-native binaries; underlying syscalls can vary.

**How to avoid:**
1. **All math is integer math.** No system `pow`/`exp`/`log` in svi_view, phi, isqrt — they're our own integer implementations of these.
2. **Test on Ubuntu locally before push** (Phase 0 already targets ubuntu-latest in CI per `ci.yml`).
3. **If a discrepancy appears**: the bug is in our integer math, NOT in CI's environment. Trace via golden vector that fails — Python, TS, Move outputs printed side-by-side with intermediate values exposed.

### Pitfall G: Codegen-drift JSON sort-key amnesia

**What goes wrong:** Local `python scripts/golden_emit.py` writes JSON with one key order; another developer's machine writes with a different order (Python dict iteration order is now stable per insertion, but JSON encoders historically varied). CI's `git diff --exit-code` flags spurious diff.

**Why it happens:** Defaulting to non-deterministic serialization.

**How to avoid:**
1. **`json.dumps(data, indent=2, sort_keys=True, ensure_ascii=False)`** in `golden_emit.py`. Document this in the script.
2. **Final newline:** `path.write_text(content + "\n", encoding="utf-8", newline="\n")` — same as Phase 0 codegen pattern.
3. **Line endings:** `newline="\n"` enforces LF on Windows. Phase 0 codegen.py already does this; Phase 1 mirror.

### Pitfall H: Arb-checker false negatives from coarse grid (Pitfall 10 in PITFALLS.md)

**What goes wrong:** g(k) at 100 points misses a narrow violation band between adjacent samples. Surface marked safe; isn't.

**How to avoid:**
1. **200 points minimum** (locked in `strategy.toml [svi].grid_points_for_arb_check = 200`).
2. **Range ±4σ** (locked in `strategy.toml [svi].strike_range_sigma = 4`).
3. **Closed-form check first** (when applicable); grid is sanity confirmation.
4. **Show the curve, not just the boolean** (D-04 + MATH-04 lever).

## Code Examples

### Cloning on-chain Newton sqrt to Python

```python
# backtest/src/deepvault/isqrt.py
"""Integer Newton-Raphson sqrt for u128 inputs.

Clone of deepbook_predict::math::sqrt_u128 + sqrt_initial_guess_u128.
See shared/svi-spec.md §"sqrt: bit-length seed + 7 unrolled Newton iterations".

Source: scripts/deepbookv3/packages/predict/sources/helper/math.move:266-292
SHA: 1159d79af33c70e09e406310e1d8f067832ede9d
"""

def isqrt_initial_guess(x: int) -> int:
    """Bit-length-based initial guess: 1 << ceil(bit_length(x) / 2)."""
    if x == 0:
        return 0
    bits = 0
    val = x
    if val >= 1 << 64:
        val >>= 64
        bits += 64
    if val >= 1 << 32:
        val >>= 32
        bits += 32
    if val >= 1 << 16:
        val >>= 16
        bits += 16
    if val >= 1 << 8:
        val >>= 8
        bits += 8
    if val >= 1 << 4:
        val >>= 4
        bits += 4
    if val >= 1 << 2:
        val >>= 2
        bits += 2
    if val >= 1 << 1:
        bits += 1
    return 1 << ((bits + 1) // 2)


def isqrt_u128(x: int) -> int:
    """Integer sqrt of x; matches on-chain sqrt_u128 bit-for-bit for x in [0, 2^128)."""
    if x == 0:
        return 0
    if x < 4:
        return 1
    g = isqrt_initial_guess(x)
    # 7 unrolled Newton iterations — convergence after ~ceil(log2(bits)) steps;
    # 7 is safe for u128 (max bits = 128, log2(128) = 7).
    g = (g + x // g) // 2
    g = (g + x // g) // 2
    g = (g + x // g) // 2
    g = (g + x // g) // 2
    g = (g + x // g) // 2
    g = (g + x // g) // 2
    g = (g + x // g) // 2
    if g * g > x:
        g -= 1
    return g
```

### Closed-form raw SVI total variance — bit-equal Python

```python
# backtest/src/deepvault/svi.py (excerpt)
"""Raw SVI total variance evaluator.

Clones on-chain oracle.move::compute_nd2 (the variance portion).
All inputs/outputs at FLOAT_SCALING = 1e9.

Source: scripts/deepbookv3/packages/predict/sources/oracle.move:400-417
"""
from typing import NamedTuple
from .isqrt import isqrt_u128

F: int = 1_000_000_000  # FLOAT_SCALING — matches deepbook_predict::constants


class SVIParams(NamedTuple):
    a: int          # u64, ≥ 0
    b: int          # u64, ≥ 0
    rho: int        # signed (-F, +F)
    m: int          # signed
    sigma: int      # u64, > 0


def total_variance(svi: SVIParams, k: int) -> int:
    """Compute w(k) = a + b * (rho * (k - m) + sqrt((k - m)^2 + sigma^2)).

    Args:
        svi: parameters at FLOAT_SCALING.
        k: log-strike at FLOAT_SCALING (signed Python int).

    Returns:
        Total variance at FLOAT_SCALING (Python int, ≥ 0).

    Raises:
        ValueError: if (rho * (k - m) + sqrt(...)) is negative or w == 0.
    """
    k_minus_m = k - svi.m  # signed
    k_minus_m_sq = (k_minus_m * k_minus_m) // F  # |k-m|^2 / F (always non-negative)
    sigma_sq = (svi.sigma * svi.sigma) // F
    sq = isqrt_u128((k_minus_m_sq + sigma_sq) * F)  # sqrt at scale F
    rho_km = (svi.rho * k_minus_m) // F  # signed
    inner = rho_km + sq  # signed; on-chain asserts inner >= 0
    if inner < 0:
        raise ValueError("SVI inner term negative — invalid params")
    w = svi.a + (svi.b * inner) // F
    if w == 0:
        raise ValueError("Total variance is zero")
    return w
```

### Op-order canonical helper (TypeScript)

```typescript
// dashboard/src/lib/math.ts
// Canonical mul-div helper. ALL svi.ts arithmetic uses this; never inline `a*b/c`.
// See shared/svi-spec.md §"Op-order canonical form".

export function mulDivRoundDown(a: bigint, b: bigint, c: bigint): bigint {
  return (a * b) / c;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hand-coded constants in 3 runtimes | TOML + codegen with drift CI | Phase 0 (Plan 00-03) | Eliminates "the Python sim says X but the contract does Y" drift |
| QuantLib for SVI | ~10 lines of integer math (clones on-chain) | Phase 1 spike | 30 MB binary saved; auditable; matches on-chain bit-for-bit |
| A-S 7.1.26 Φ (~7.5e-8 error) | Cody 1969 (~1e-15 / ~5 units at 1e9) | Phase 1 spike | Matches on-chain; eliminates D-08 false-positive abstain triggers |
| `subscribeEvent` JSON-RPC | `queryEvents` polling | (Phase 4 concern; Phase 1 unaffected) | Sunset 2026-07-31 |

**Deprecated/outdated:**
- The Python `math.erf`-based Φ implementation referenced in some SVI tutorials: too lossy for our parity claim; use Cody.
- The "5-coefficient Hastings approximation = A-S 7.1.26" framing in CONTEXT.md D-09: technically the formula is A-S 26.2.17 (CDF) which DOES have 5 coefs and ~7.5e-8 error; A-S 7.1.26 is the erf-based form. The "7-coefficient" figure in D-09 is a transcription artifact and no widely-published 7-coefficient form exists. RE-DECIDE per Decision Re-route.

## Assumptions Log

> Claims tagged `[ASSUMED]` in this research that need confirmation before locking into the plan.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | JackJacquier/SSVI repo's last commit is "mostly inert" | D-17 / Spike Finding C | LOW — Tier C downgrade plan still works; if repo is actively maintained, even better |
| A2 | `predict::trade_prices` adds Bernoulli scaling spread (`base_spread * sqrt(p*(1-p))`) on top of `oracle.compute_price` | Spike Finding 7 (D-08) | MEDIUM — the exact spread function determines the tolerance band for the abstain check in Phase 2. If different, vault.rebalance's tolerance computation changes (but Phase 1 itself is unaffected). |
| A3 | Move CLI mainnet-v1.71.1 supports u256 in `2024.beta` edition | D-13 re-route | LOW — D-13 re-route recommends u128 anyway; even if u256 isn't fully supported, we don't need it |
| A4 | A-S 7.1.26 has 5 coefficients (a1..a5 + p) ~7.5e-8, NOT 7 coefs | D-09 critique | LOW — recommendation is to switch to Cody 1969 anyway; the count critique just clarifies the original CONTEXT.md transcription |
| A5 | Phase 1's Move test reads golden vectors via a Move-format companion data file (NOT the JSON directly) | MATH-02 plan note | LOW — Move test framework cannot easily read JSON; companion file is standard pattern. Worst case: Phase 1 plan task budgets 1 day for a JSON-reading parser instead. |
| A6 | The on-chain `oracle.compute_nd2` is private but its outputs are observable via `binary_price_pair(oracle, strike, clock)` and `compute_price(oracle, strike)` | Spike Finding 3 | LOW — oracle.move:332-349 confirms `binary_price_pair` and `compute_price` are `public(package)`. From OUR Move package's perspective, they're external (different package); we'd need a public wrapper OR call via `predict::get_trade_amounts`. Phase 1 may need a tiny shim or accept that "verify our svi_view matches predict prices" is asserted off-chain (Python comparing both via testnet RPC). |

**A6 is the most material assumption.** If `oracle.compute_price` is not callable from outside the Predict package, Phase 1's MATH-02 cannot directly assert "our `svi_view::binary_price` output equals the on-chain oracle's output for the same params." We'd assert it via golden vectors that we computed with our impl, with the *claim* (citation in spec doc) that the algorithm is identical. The strongest defense is then a Phase 2 integration test that calls `predict::get_trade_amounts` against testnet and asserts our local price matches the returned ask within the documented spread tolerance.

## Decision Re-route Summary (handoff to planner / discuss-phase)

| CONTEXT.md Decision | Original | Spike-discovered Reality | Recommended Action |
|---|---|---|---|
| D-01 (SSVI parameterization) | Heston-power-law (η, γ, ρ) | Oracle emits raw 5-param (a, b, ρ, m, σ) | **Re-decide:** ship raw SVI as canonical; SSVI sufficient conditions become an ADDITIONAL off-chain checker step (not the primary param interface). Update `[svi].parameterization` in strategy.toml from "ssvi" to "raw_svi_5param". |
| D-02 (evaluator input contract) | `f(k, T, θ_T, ρ, η, γ)` | `f(svi: SVIParams, k)` where SVIParams = (a, b, rho, m, sigma) | **Re-decide:** signature mirrors on-chain. T is implicit per oracle. |
| D-09 (Φ approximation) | Abramowitz-Stegun 7.1.26 (claimed 7 coefficients) | Oracle uses Cody 1969 piecewise (~30 coefs across 3 ranges); A-S 7.1.26 actually has 5 coefs not 7 | **Re-decide:** ship Cody 1969 in all 3 runtimes; emit coefficients via codegen extension. |
| D-10 (fixed-point scales) | 1e27 variance / 1e18 price | Oracle uses 1e9 (FLOAT_SCALING) for everything in SVI math | **Re-decide:** SVI math layer at 1e9 to match oracle; vault NAV layer (Phase 2) keeps 1e18; vault shares stay 1e9. Add `[fixed_point.svi]` sub-section to strategy.toml. |
| D-11 (Newton sqrt convergence) | Loop until x_{n+1} == x_n | Oracle uses 7 unrolled iterations + overshoot correction | **Re-decide:** clone on-chain fixed-iteration approach; deterministic across runtimes. |
| D-13 (intermediate width) | u256 intermediates | Oracle uses u128 intermediates with u64 IO | **Re-decide:** u128 intermediates; matches on-chain. |
| D-14 (parity tolerance) | Exact `==` at 10⁻¹⁸ | At 10⁻⁹ scale | **Auto-follows D-10:** parity is exact `==` at 10⁻⁹. Still bit-equal; tolerance window is still zero. |
| D-17 Tier C | "JackJacquier/SSVI" reference cross-check | Repo is inactive Jupyter notebook with no LICENSE; ships no test vectors | **Soft re-decide:** Tier C remains JackJacquier (execute notebook, capture outputs) BUT add a Tier C2: cross-check against the on-chain Predict's own Move tests (vendored at `scripts/deepbookv3/packages/predict/tests/`). |

The other locked decisions (D-03, D-04 modulo D-01 re-route, D-05, D-06, D-07, D-08, D-12, D-15, D-16, D-18, D-19) are unaffected and stand as written.

**Recommendation:** A 30-minute discuss-phase touch-up to re-confirm the re-routed decisions is the cleanest path. Alternative: planner notes the re-routes in 01-PLAN.md design-decisions section, executor proceeds, and any divergence from CONTEXT.md is logged as a "discovered constraint" in the plan summary. Either is acceptable.

## Open Questions

1. **Is `oracle.compute_price` callable from `deepvault::svi_view` (different Move package)?**
   - What we know: `oracle.move:331` declares it `public(package)` — callable only within `deepbook_predict`.
   - What's unclear: whether `predict.get_trade_amounts` (which IS `public`, line 199) returns the mid-price or only the spread-adjusted ask/bid.
   - Recommendation: 1-hour spike during Wave 0 of execution: write a tiny Move test that calls `predict::get_trade_amounts(predict, oracle, key, quantity=1, clock)` and inspects `(ask, bid)`. If `(ask + bid) / 2 ≈ oracle mid`, we have what we need; if not, plan a Phase 2 integration test that asserts our local computation matches the on-chain ask/bid pair.

2. **What is the exact bit-shift sequence in `sqrt_initial_guess_u128`?**
   - What we know: bit-length probe (64, 32, 16, 8, 4, 2, 1) accumulating into `bits`, then `1 << ((bits + 1) / 2)`.
   - What's unclear: the off-by-one between Move's seed and a naive Python `1 << (x.bit_length() // 2)` for some inputs.
   - Recommendation: Wave 0 task — write 1000 random u128 inputs, run both Move and Python, assert bit-equal. If divergence on some input, the off-by-one is visible and easy to fix. Test belongs in `tests/test_isqrt.py`.

3. **Will the `[svi]` section of `strategy.toml` need a `[fixed_point.svi]` sub-section, or do we add a top-level `[svi].scale = 9` field?**
   - Recommendation: top-level `[svi].scale = 9` is simpler. Document that SVI math operates at 1e9 inline.

4. **Should `phi.move` and `isqrt.move` live in `contracts/sources/` or in `contracts/sources/helpers/`?**
   - Recommendation: helpers/ subdirectory mirrors Predict's structure (`packages/predict/sources/helper/`). Phase 0 didn't establish a sources/helpers convention but Phase 1 introduces it cleanly.

5. **What is the canonical "max safe input domain" Phase 2 vault.rebalance must check before calling svi_view?**
   - Spike data: oracle's strike grid bounds enforce on-chain; off-grid strikes never reach `compute_price`. For us: any u64 strike is technically computable but values outside `[min_strike, max_strike]` are economically meaningless.
   - Recommendation: spec doc records `k ∈ [-2.5, 2.5]` (in 1e9 → ±2_500_000_000) as the safely-tested domain. Outside this range, `(k - m)^2` may overflow at very extreme strikes if `b` is also large. Test edge cases at `k = ±2σ, ±3σ, ±4σ` in golden vectors.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Sui CLI | Move test runner | ✓ (Phase 0 verified, pinned in CI) | mainnet-v1.71.1 | None — required for MATH-02 |
| Python | All Phase 1 emitters + tests | ✓ | 3.12+ | None — required |
| `uv` | Python env management | ✓ (Phase 0 verified) | latest | None |
| Node.js + pnpm | Vitest, parity_runner.ts | ✓ (Phase 0 verified) | Node 22, pnpm 10 | None |
| `numpy` | arb_checker.py grid sampling | ✓ (in pyproject.toml) | >=2.4 | Pure-Python loops (slower; acceptable for ~200 points/test) |
| `scipy` | phi cross-check test only | ✓ (in pyproject.toml) | >=1.14 | Skip cross-check; rely solely on Tier A Gatheral vectors |
| Vendored DeepBookV3 fork | Reference for cloning Φ, sqrt, ln, raw SVI | ✓ (`scripts/deepbookv3/`, HEAD `1159d79af33c70e09e406310e1d8f067832ede9d`) | pinned | None — read-only access; if SHA changes, predict-diff cron flags it |
| JackJacquier/SSVI repo | Tier C cross-check | ✓ (public GitHub) | (no version; 4 commits) | Tier C2: predict's own Move tests (vendored) |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None — all primary deps available.

## Validation Architecture

> `nyquist_validation` is currently DISABLED per init.json. This section is included for completeness in case the user toggles it on; if disabled, the orchestrator skips populating VALIDATION.md from this section.

### Test Framework

| Property | Value |
|----------|-------|
| Frameworks | pytest >=8.3 (Python), Vitest ^4.1 (TypeScript), `sui move test` (Move) |
| Config files | `backtest/pyproject.toml`, `dashboard/vite.config.ts` (when added in Phase 4 — Phase 1 may need to add a minimal config), `contracts/Move.toml` |
| Quick run command | `cd backtest && uv run pytest tests/test_svi_parity.py -x` (Python only, fastest signal) |
| Full suite command | `make test` (Phase 0 placeholder) → expand to: `cd backtest && uv run pytest && cd ../dashboard && pnpm test && cd ../contracts && sui move test --gas-limit 100000000000` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| MATH-01 | Python evaluator matches Gatheral 2014 §4 worked vectors within tolerance | unit | `cd backtest && uv run pytest tests/test_gatheral_paper_vectors.py -v` | ❌ Wave 0 |
| MATH-02 | Move evaluator bit-equal to Python on golden vectors | unit | `cd contracts && sui move test --gas-limit 100000000000 --filter golden_vectors` | ❌ Wave 0 |
| MATH-03 | TypeScript evaluator bit-equal to Python on same vectors | unit | `cd dashboard && pnpm exec vitest run lib/svi.test.ts` | ❌ Wave 0 |
| MATH-04 | g(k) array returned with parity (and arb-violating slices flagged) | unit | `cd backtest && uv run pytest tests/test_arb_checker.py -v` AND TS counterpart | ❌ Wave 0 |
| MATH-05 | CI three-way parity gate is green | integration | `.github/workflows/ci.yml` `parity` job — runs all of the above | ⚠️ Stub exists; Wave 0 wires real content |
| MATH-06 | binary_price function emits (price) bit-equal across runtimes for OTM-put inputs | unit | covered by golden vectors test files (subset of MATH-02/03) | ❌ Wave 0 (tests included with above) |

### Sampling Rate

- **Per task commit:** `cd backtest && uv run pytest tests/test_svi_parity.py -x` (~3s)
- **Per wave merge:** `make test` (Python + TS + Move; ~2-3 minutes)
- **Phase gate:** Full CI pipeline including parity job; required-status-check on `main`

### Wave 0 Gaps

- [ ] `backtest/tests/test_svi_parity.py` — covers MATH-01, MATH-02 (Python side), MATH-03 (Python side), MATH-06
- [ ] `backtest/tests/test_gatheral_paper_vectors.py` — covers MATH-01 academic provenance
- [ ] `backtest/tests/test_phi_against_scipy.py` — covers Φ accuracy claim
- [ ] `backtest/tests/test_isqrt.py` — covers integer sqrt parity
- [ ] `backtest/tests/test_arb_checker.py` — covers MATH-04 visualization data + boolean
- [ ] `backtest/src/deepvault/parity_runner.py` — CLI for CI's parity job
- [ ] `dashboard/src/lib/__tests__/svi.test.ts` — covers MATH-03 (TS side)
- [ ] `dashboard/src/lib/__tests__/phi.test.ts` — Φ unit tests
- [ ] `dashboard/src/lib/__tests__/isqrt.test.ts` — sqrt unit tests
- [ ] `dashboard/src/lib/parity_runner.ts` — CLI for CI's parity job
- [ ] `contracts/tests/svi_view_test.move` — MATH-02 (Move side)
- [ ] `contracts/tests/phi_test.move` — Φ benchmark points
- [ ] `contracts/tests/isqrt_test.move` — sqrt edge cases
- [ ] `contracts/tests/golden_vectors_data.move` — Move-format companion (emitted by `golden_emit.py`)
- [ ] `dashboard/vite.config.ts` (or vitest.config.ts) — minimal Vitest config; Phase 0 stubbed test scripts but config not yet added
- [ ] `dashboard/package.json` test script — `"test": "vitest run"` (verify Phase 0 wired this; if not, add)
- [ ] Vitest framework install in dashboard workspace — Phase 0 placeholder may need `pnpm add -D vitest@^4.1` per CLAUDE.md Stack pin

## Project Constraints (from CLAUDE.md)

- **Math correctness > deploy hygiene > demo polish > composability breadth** (quality bar). Phase 1 IS the math correctness phase — top priority.
- **No QuantLib.** Custom integer math only.
- **No floats for parity-gated paths.** Python `int`, TS `BigInt`, Move u128 only in svi/phi/isqrt evaluators.
- **Sui CLI mainnet-v1.71.1, Move 2024 edition.** Pinned in `contracts/Move.toml` and CI.
- **Python 3.12+, numpy>=2.4, scipy>=1.14, pyarrow>=18, pytest>=8.3.** Pinned in `backtest/pyproject.toml`.
- **TypeScript 5.6+, Vitest 4.1+.** Per CLAUDE.md Stack.
- **Hard ship date: 2026-06-16.** Phase 1 must close in ~6-8 days to leave Phase 2-6 enough time.
- **Code freeze 2026-05-30.** Phase 1 closes well before this.
- **Weekly Monday Predict sweep is non-negotiable.** Phase 1 directly depends on the vendored fork; if the SHA `1159d79af33c70e09e406310e1d8f067832ede9d` advances on the upstream `predict-testnet-4-16` branch, predict-diff cron flags it. Phase 1 must verify before re-publishing golden vectors.
- **POLICY: commit-prefix discipline** (Phase 0 introduced this for `[hedge_policy]`). Phase 1 introduces a parallel **MATH:** prefix for changes to `shared/svi-spec.md` or `shared/cody_phi_coefficients.toml` (per CONTEXT.md "specifics" guidance). Spec doc + ADR rationale + paired commit prefix.

## Sources

### Primary (HIGH confidence — verified by reading vendored source)

- `scripts/deepbookv3/packages/predict/sources/oracle.move` — `OracleSVIUpdated` event struct, `OracleSVI` shared object, `compute_nd2` private fun (the on-chain SVI evaluator we clone)
- `scripts/deepbookv3/packages/predict/sources/oracle_config.move` — strike grid, `assert_live_oracle`, ask bounds (informs Phase 2)
- `scripts/deepbookv3/packages/predict/sources/predict.move` — `mint`, `supply`, `redeem`, `get_trade_amounts` signatures (D-08 spike)
- `scripts/deepbookv3/packages/predict/sources/helper/math.move` — `ln`, `exp`, `normal_cdf` (Cody 1969), `sqrt` (Newton) — clone targets
- `scripts/deepbookv3/packages/predict/sources/helper/i64.move` — signed integer wrapper
- `scripts/deepbookv3/packages/predict/sources/helper/constants.move` — `FLOAT_SCALING = 1e9`, `staleness_threshold_ms`, `default_curve_samples`
- `shared/strategy.toml` (Phase 0) — `[svi]` partial schema, `[fixed_point]` decimals
- `contracts/Move.toml` (Phase 0) — `predict-testnet-4-16 rev 1159d79af33...` pin
- `.github/workflows/ci.yml` (Phase 0) — 5-job matrix; parity stub at line 151
- `scripts/codegen.py` (Phase 0) — emit-and-CI-drift-check pattern reference
- `backtest/pyproject.toml` (Phase 0) — Python deps already pinned
- `CONTRIBUTING.md` (Phase 0) — POLICY: commit-prefix discipline (template for MATH: prefix)
- `.planning/phases/01-math-foundation-svi-parity-gate/01-CONTEXT.md` — locked decisions D-01..D-19
- `.planning/REQUIREMENTS.md` §"Math Foundation (SVI)" — MATH-01..06
- `.planning/research/STACK.md` §"Python Backtest Harness" — "write SVI yourself, do not pull QuantLib"
- `.planning/research/PITFALLS.md` Pitfall 3 (SVI butterfly arb) and Pitfall 6 (Predict churn)
- `.planning/research/ARCHITECTURE.md` §2 (component responsibilities), §10 Pattern 4 (three-way semantic parity via golden vectors)
- `scripts/deepbookv3/CLAUDE.md` + `.claude/rules/move.md` — Move 2024 best practices, `sui move test --gas-limit 100000000000`, error-constant naming convention (`EPascalCase`)
- `scripts/deepbookv3/.claude/rules/code-review.md` — math-comment-must-match-call rule (informs how we document op order)

### Secondary (MEDIUM confidence — public docs / repo metadata)

- [JackJacquier/SSVI on GitHub](https://github.com/JackJacquier/SSVI) — Surface SVI parameterization reference; single Jupyter notebook, no LICENSE, 4 commits
- [Gatheral & Jacquier (2014) "Arbitrage-free SVI volatility surfaces"](https://arxiv.org/abs/1204.0646) — canonical paper for §4 SSVI families and §3.2 closed-form butterfly bound; published Quantitative Finance 14(1):59-71
- [Sui issue #14062 — Move 2024 features](https://github.com/MystenLabs/sui/issues/14062) — confirms u256 + macros + `use fun` aliases
- [OpenZeppelin Math.sol sqrt](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/utils/math/Math.sol) — Newton + bit-length seed (Hacker's Delight Ch. 11) — confirms our cloned approach is industry-standard
- [Abramowitz and Stegun handbook (UBC mirror)](https://personal.math.ubc.ca/~cbm/aands/abramowitz_and_stegun.pdf) — for spec-doc citation of A-S 26.2.17 (the actual 5-coef CDF, ~7.5e-8 error) for whitepaper provenance

### Tertiary (LOW confidence — needs confirmation)

- Cody 1969 W.J. paper — referenced via on-chain comment ("as implemented in GSL gauss.c"). Spec doc should cite the GSL source file URL for full provenance.
- The exact relative magnitudes of `base_spread`, `min_spread`, `utilization_multiplier` in production Predict deployment — informs Phase 2 D-08 tolerance, not Phase 1 directly.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — pinned per Phase 0; no new deps in Phase 1
- Architecture (file layout, codegen extension, parity wiring): HIGH — extends established Phase 0 patterns
- Spike findings (oracle struct, Φ algorithm, sqrt algorithm, scaling): HIGH — read directly from vendored source
- Decision re-routes (D-01, D-09, D-10, D-11, D-13, D-14): HIGH on the *facts* triggering the re-route; MEDIUM on whether the user accepts our recommended re-routes vs. picks a different remediation
- Parity engineering pitfalls: HIGH — well-known cross-runtime arithmetic class
- JackJacquier/SSVI usability: MEDIUM — repo metadata seen but not contents executed
- CI parity wiring complexity: HIGH — straightforward extension of Phase 0 stub

**Research date:** 2026-05-09
**Valid until:** 7 days (until next Monday Predict sweep on 2026-05-12) — if vendored DeepBookV3 SHA advances, re-spike. Stable otherwise; no fast-moving deps in Phase 1.
