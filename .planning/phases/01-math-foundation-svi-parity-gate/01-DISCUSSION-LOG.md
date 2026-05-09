# Phase 1: Math Foundation (SVI Parity Gate) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-09
**Phase:** 1 — Math Foundation (SVI Parity Gate)
**Areas discussed:** SSVI φ-function family, Binary pricing convention, Three-way parity tolerance, Golden vector coverage

---

## SSVI φ-function family

### Q1.1 — Which SSVI φ(θ) family should the evaluator implement?

| Option | Description | Selected |
|--------|-------------|----------|
| Heston-like power-law | φ(θ) = η / (θ^γ · (1+θ)^(1−γ)); params (η, γ, ρ); η(1+|ρ|) ≤ 2 with 0 ≤ γ ≤ 1/2. Most cited in Gatheral 2014 §4; matches reference impls (sellersgaard, wangys96). | ✓ |
| Power-law (single λ) | φ(θ) = (1/(λθ)) · (1 − (1 − exp(−λθ))/(λθ)); params (λ, ρ); 2 free params + per-slice θ_t. Simpler, less expressive shape. | |
| Heston-like-decay (η/√θ) | φ(θ) = η/√θ; params (η, ρ); eSSVI γ=1/2 limit. Tight match to short-tenor crypto; less rich. | |
| You decide / read Gatheral first | Pick after reading §4; prioritize "most test cases I can audit against." | |

**User's choice:** Heston-like power-law
**Notes:** Locks (η, γ, ρ) parameter set and the closed-form no-butterfly bound η(1+|ρ|) ≤ 2.

### Q1.2 — Evaluator input contract for θ_T?

| Option | Description | Selected |
|--------|-------------|----------|
| Oracle emits θ_T per tenor | OracleSVIUpdated carries (ρ, η, γ) globally + θ_T per supported tenor; evaluator pure function. | ✓ |
| Oracle emits global θ_0 + ATM curve | (ρ, η, γ, θ_0) + interpolation across T; bigger parity surface. | |
| Spike oracle_svi.move first, then decide | Park until day-1 inspection of packages/predict/sources/oracle_svi.move. | |

**User's choice:** Oracle emits θ_T per tenor
**Notes:** Contingent on day-1 spike confirming the actual emission shape. Fallback documented in CONTEXT.md D-02.

### Q1.3 — Evaluator return shape?

| Option | Description | Selected |
|--------|-------------|----------|
| Return both w(k,T) and binary price | Single function: (k, T, θ_T, ρ, η, γ, [r=0]) → (total_variance, binary_call_price). Both gated. | ✓ |
| Return w(k,T) only; binary price separate | Two pure functions; CDF-in-Move complexity contained. | |
| Return total variance plus full diagnostic struct | (w, dw/dk, g(k)); arb-checker reads from evaluator. Bigger Move return tuple. | |

**User's choice:** Return both w(k,T) and binary price

### Q1.4 — Param-bound enforcement on invalid (η, γ, ρ)?

| Option | Description | Selected |
|--------|-------------|----------|
| Hard reject in Move; flag elsewhere | Move aborts; Python/TS return params_valid + min_g_k for dashboard diagnostic. | ✓ |
| Compute and flag everywhere | All 3 runtimes always compute and return params_valid; vault layer decides gating. | |
| Hard reject everywhere | Cleanest invariant; dashboard can't show violating surface. | |

**User's choice:** Hard reject in Move; flag elsewhere

### Q1.5 — Arb-checker split between Move and off-chain?

| Option | Description | Selected |
|--------|-------------|----------|
| Move = closed-form only; off-chain = both | Move enforces O(1) bound at mint; Python/TS run closed-form + 200-pt g(k) grid + calendar. | ✓ |
| All three run full grid scan | Belt-and-suspenders; gas-dear; closed-form is a theorem so overkill. | |
| Move skips check entirely | Cheapest; needs separate authority whitelist on oracle. | |

**User's choice:** Move = closed-form only; off-chain = both
**Notes:** Closed-form bound for Heston-like power-law SSVI is provably equivalent to grid-passing, not merely heuristic.

---

## Binary pricing convention

### Q2.1 — Risk-free rate r in the binary price formula?

| Option | Description | Selected |
|--------|-------------|----------|
| r = 0, hardcoded | Discount factor at 14d tenor ~0.998; sub-bp correction. Simplifies parity, removes one input from golden vectors. | ✓ |
| r configurable in strategy.toml | Adds risk_free_rate_bps to [svi]; more parity surface; marginal value at our tenor. | |
| r read from oracle if Predict publishes one | Defer until oracle_svi.move spike confirms field presence. | |

**User's choice:** r = 0, hardcoded
**Notes:** Whitepaper documents the assumption explicitly.

### Q2.2 — Underlying input: spot, forward, or log-moneyness?

| Option | Description | Selected |
|--------|-------------|----------|
| Pass forward F explicitly | API: binary_price(F, K, T, θ_T, ρ, η, γ); future-proof if r becomes nonzero. | ✓ |
| Pass spot S; assume r=0 internally | Simpler call site; couples function to r=0 decision. | |
| Pass log-moneyness k = ln(K/F) directly | Most quant-native; less obvious to non-quant readers. | |

**User's choice:** Pass forward F explicitly

### Q2.3 — How does formula's output map to predict::mint's actual charge?

| Option | Description | Selected |
|--------|-------------|----------|
| Theoretical fair value; compare to Predict quote | Phase 1 = pure math; Phase 2 vault decides abstain-on-mis-quote gate. | ✓ |
| Match Predict's exact pricing function | Reverse-engineer mint pricer; tighter coupling, breaks on Predict churn (Pitfall 6). | |
| Defer until predict.move spike | Day-1 read of predict.move; Phase 1 ships SSVI + textbook digital regardless. | |

**User's choice:** Theoretical fair value; compare to Predict quote
**Notes:** Day-1 spike of predict.move still happens to lock the mint input format.

### Q2.4 — Move computation of Φ (standard normal CDF)?

| Option | Description | Selected |
|--------|-------------|----------|
| Abramowitz-Stegun rational approx | 7-coeff polynomial, ~7.5e-8 absolute error; ~30 lines Move; cite A&S 1964 §7.1.26. | ✓ |
| Lookup table + linear interp | Cheaper compute, storage cost; tolerance ~1e-4 fails "1 wei equivalent" optic. | |
| Higher-order polynomial (Cody 1969) | ~16 coeffs, ~1e-15 accuracy; overkill for our tolerance budget. | |

**User's choice:** Abramowitz-Stegun rational approx
**Notes:** Same coefficients in all 3 runtimes; bit-equal output. Python additionally cross-checks against scipy.stats.norm.cdf in tests but ships A-S impl for parity.

---

## Three-way parity tolerance

### Q3.1 — How to define "1 wei tolerance" across Move u128, Python f64, TS f64?

| Option | Description | Selected |
|--------|-------------|----------|
| Shared fixed-point everywhere | Python int + TS BigInt at same 10²⁷/10¹⁸ scales as Move u128; CI exact-equality `==`. | ✓ |
| Float reference + tolerance window | Python/TS f64; CI relative tolerance < 1e-9; weaker claim. | |
| Hybrid: shared fixed-point for w, float for binary | Two parity claims with explicit, defended tolerances. | |

**User's choice:** Shared fixed-point everywhere
**Notes:** Tightest, audit-cleanest, Gatheral-paper-citable; ~50 lines of fixed-point arithmetic per runtime.

### Q3.2 — sqrt algorithm for parity?

| Option | Description | Selected |
|--------|-------------|----------|
| Newton-Raphson on integers | Iterate until convergence; bit-identical across runtimes. | ✓ |
| Babylonian with fixed iteration count | Faster, no convergence-dependent branching, parity easier to verify. | |
| Defer; delegate to Python first then mirror | math.isqrt for total variance; binary price still needs designed sqrt. | |

**User's choice:** Newton-Raphson on integers

### Q3.3 — Golden-vector schema?

| Option | Description | Selected |
|--------|-------------|----------|
| JSON of integer hex strings | Round-trips u128/BigInt/int; whitespace-stable PR diffs. | ✓ |
| JSON of decimal strings | More readable; JS parsers may coerce to Number and lose precision. | |
| Two files: human-readable + machine-encoded | TOML inputs + JSON expected; authoring-friendly; drift risk. | |

**User's choice:** JSON of integer hex strings

### Q3.4 — Who owns producing canonical golden vectors?

| Option | Description | Selected |
|--------|-------------|----------|
| Python is canonical; emits via codegen | scripts/golden_emit.py reads paper + synthetic; CI codegen-drift enforces no-diff. | ✓ |
| Hand-curated; never codegen-d | Simpler; risk of hand-editing fixed-point miscalculations. | |
| Move is canonical; emits via Move test runner | Awkward — Move test runner can't cleanly write JSON. | |

**User's choice:** Python is canonical; emits via codegen

### Q3.5 — Division rounding rule across runtimes?

| Option | Description | Selected |
|--------|-------------|----------|
| Truncate toward zero, everywhere | Matches Move u128 truncation; explicit Python (abs(a)//abs(b))*sign; TS BigInt /. | ✓ |
| Floor (toward −∞) | Python's `//` default; needs Move adjustment. | |
| Round-half-to-even (banker's) | Most accurate; expensive in Move; overkill. | |

**User's choice:** Truncate toward zero, everywhere

### Q3.6 — Overflow handling at extreme inputs?

| Option | Description | Selected |
|--------|-------------|----------|
| u256 for intermediates, u128 for inputs/outputs | Documented max safe domain: k ∈ [-5σ, +5σ], θ_T ≤ 4. | ✓ |
| u128 with explicit overflow abort | Reduced safe input domain; widens "refuse to mint" gate. | |
| Smaller scale (15 decimals) | Trades precision for headroom; churns Phase 0 codegen. | |

**User's choice:** u256 for intermediates, u128 for inputs/outputs

### Q3.7 — Are arb-checker outputs golden-vectored?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes for all three runtimes | Each vector includes expected.params_valid (all 3), min_g_k + calendar_pass (Python/TS); arb-violating vectors gate rejection paths. | ✓ |
| Boolean gate only | Just params_valid; skips min_g_k locking. | |
| Defer arb-checker vectors to Phase 4 | Phase 4 retests by eye; not parity-gated. | |

**User's choice:** Yes for all three runtimes

### Q3.8 — Binary price tolerance: exact equality or ±1 ULP?

| Option | Description | Selected |
|--------|-------------|----------|
| Exact equality — belt-and-suspenders | Lock op order in spec doc; bit-equal achievable. | ✓ |
| ±1 ULP at 10⁻¹⁸ | Weaker claim; may hide real bugs. | |
| Tighter for w, looser for binary | Two parity tiers; honest about each primitive's guarantee. | |

**User's choice:** Exact equality — belt-and-suspenders
**Notes:** Op order canonicalized in shared/svi-spec.md.

---

## Golden vector coverage

### Q4.1 — Coverage strategy mix?

| Option | Description | Selected |
|--------|-------------|----------|
| Paper + synthetic stress + open-source cross-check | ~120 vectors: Tier A (~20 Gatheral) + Tier B (~80 stress + arb-violating) + Tier C (~20 reference impl). | ✓ |
| Paper-only | ~20 vectors; misses ROADMAP "100+" target. | |
| Paper + synthetic (no cross-check) | ~100 vectors; skips third-party validation lever. | |
| Paper + synthetic + cross-check + arb-violating tier | ~140 vectors; arb-violating as separate tier; biggest test surface. | |

**User's choice:** Paper + synthetic stress + open-source cross-check
**Notes:** Arb-violating vectors fold into Tier B as a sub-tier (boundary η(1+|ρ|)=2 plus a few intentional violations).

### Q4.2 — Time-stamped replay vectors?

| Option | Description | Selected |
|--------|-------------|----------|
| No — evaluator-only, no replay | Phase 1 stays in (params, k, T) space; Phase 3 builds replay harness. | ✓ |
| Yes — add timestamped vectors from Deribit IV history | Pull Deribit snapshots, fit SSVI, write timestamped vectors. | |
| Yes — but only as pre-Phase-3 sanity smoke test | 5–10 vectors hand-fit; not part of parity gate. | |

**User's choice:** No — evaluator-only, no replay

### Q4.3 — Whitepaper claim ladder?

| Option | Description | Selected |
|--------|-------------|----------|
| "Bit-equal across 3 runtimes on 120 vectors including 20 from Gatheral & Jacquier 2014" | Strongest defensible; appendix lists vectors with sources. | ✓ |
| "Evaluator audited against published Gatheral test cases" | Vague but safe; less convincing to finance judge. | |
| Tier-structured claim with all 4 tiers named | Most quant-y; possibly too long for README laypitch. | |

**User's choice:** "Bit-equal across 3 runtimes on 120 vectors including 20 from Gatheral & Jacquier 2014"

### Q4.4 — Open-source cross-check reference impl?

| Option | Description | Selected |
|--------|-------------|----------|
| JackJacquier/SSVI (GitHub) | Co-author of canonical 2014 paper; MATLAB + Python; highest provenance. | ✓ |
| wangys96/SVI-Volatility-Surface-Calibration | Calibration-focused; we don't need calibration; secondary. | |
| sellersgaard.github.io blog post | Pedagogical, readable, license unclear; can't vendor. | |
| Two cross-refs (Jacquier + wangys96) | Strongest provenance; doubles audit-script surface. | |

**User's choice:** JackJacquier/SSVI (GitHub)

---

## Claude's Discretion

- File layout for the Python/Move/TS evaluators (`backtest/src/deepvault/svi.py`, `contracts/sources/svi_view.move`, `dashboard/src/lib/svi.ts` plus colocated tests).
- `shared/svi-spec.md` location and structure (op-order canonicalization, Φ coefficients, max safe domain, formula derivation, claim ladder).
- Newton-Raphson seed selection (`1 << (bit_length(n) / 2)` style) and termination polish.
- Test framework wiring into existing 5-job CI matrix from Plan 00-07; the `parity` job gets real assertions and the `codegen-drift` job gets a `golden-emit` drift check.
- Whether to add a `MATH:` commit-prefix policy analogous to Phase 0's `POLICY:` prefix; recorded as a Phase 1 plan sub-task candidate, not a hard requirement.

## Deferred Ideas

- Oracle authority whitelist (Phase 2 vault).
- Oracle staleness gating (Phase 2 vault; strategy.toml `max_staleness_seconds=300` consumed there).
- Abstain-on-Predict-mis-quote policy (Phase 2 vault.rebalance).
- Time-stamped replay vectors from Deribit IV history (Phase 3 backtest harness).
- SSVI calibrator (Phase 3 backtest).
- eSSVI 4-parameter extension with explicit no-calendar-arbitrage condition (post-submission v2).
- Higher-order CDF approximation (Cody 1969) — revisit only if A-S 7-coeff produces visible artifacts.
- `MATH:` commit-prefix policy for shared/svi-spec.md and canonical Φ coefficients.
