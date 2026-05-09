# SVI Math Layer Specification — Phase 1 Contract

**Status:** LOCKED post-Phase-1 (after CI parity job is green on 120 vectors)
**Authority:** this doc is the Phase 1 contract. Changes require MATH: commit-prefix per CONTRIBUTING.md §6.
**Vendored Predict reference SHA:** `1159d79af33c70e09e406310e1d8f067832ede9d` (matches contracts/Move.toml DeepBookV3 rev pin)

This document is the canonical contract for DeepVault's SVI math primitives. Every Phase 1 plan
(01-02 through 01-08) cites this file for op-order rules, fixed-point scale, sqrt algorithm, Φ
algorithm, max safe input domain, and sign convention. If this doc and an implementation diverge,
the implementation is wrong — the canonical reference is the on-chain Predict source at the SHA
above, and this doc cites the vendored copy at `scripts/deepbookv3/packages/predict/sources/`.

The triple-emit (Move + Python + TypeScript) reproduces the on-chain algorithm line-for-line so
that Phase 2's `vault::rebalance` (which compares our local fair-value to Predict's quote per
D-08) sees zero model-mismatch noise — any disagreement is real Predict mispricing, not
implementation drift.

---

## Op-order canonical form

Per CONTEXT.md D-12 + RESEARCH.md Pitfall D + vendored `helper/math.move:294-306`:

> **All multiply-then-divide expressions use `mul_div_round_down(a, b, c) = (a * b) / c`. NEVER
> `a * (b / c)` even if it appears mathematically equivalent. NEVER chained inline `a * b / c`
> without going through the helper.**

The helper exists in each runtime to enforce u128 (Move) / unbounded int (Python) / BigInt (TS)
intermediate width. Cite for clone source: `scripts/deepbookv3/packages/predict/sources/helper/math.move:294-306`.

**Required runtime helpers:**

- **Move:** `deepvault::math::mul_div_round_down(a: u64, b: u64, c: u64): u64` — clone of vendored
  `helper/math.move:294-306`. Implementation: `((a as u128) * (b as u128) / (c as u128)) as u64`.
- **Python:** `def mul_div(a: int, b: int, c: int) -> int: return (a * b) // c` — lives in
  `backtest/src/deepvault/svi.py` or a sibling math helper module. Python `int` is arbitrary
  precision so no width concern; the helper exists for op-order discipline only.
- **TypeScript:** `function mulDivRoundDown(a: bigint, b: bigint, c: bigint): bigint { return (a * b) / c; }`
  — lives in `dashboard/src/lib/math.ts`. BigInt is arbitrary precision; helper exists for
  op-order discipline.

### Rounding rule

**TRUNCATE TOWARD ZERO everywhere.**

- Move u64/u128 `/` truncates toward zero by default (also for u256 if used).
- TypeScript BigInt `/` truncates toward zero.
- Python `//` rounds **toward negative infinity** for signed operands — this is a divergence
  vector. For non-negative dividend and divisor, `(a*b)//c` matches Move/TS truncation. For
  signed values we MUST track sign separately:

```python
def signed_mul_div(a: int, b: int, c: int) -> int:
    """Truncate toward zero, matching Move u128 and TS BigInt semantics."""
    sign = -1 if (a < 0) ^ (b < 0) ^ (c < 0) else 1
    return sign * ((abs(a) * abs(b)) // abs(c))
```

The signed evaluator path uses Move's `i64::I64` which is sign-magnitude (see §"Sign convention"
below) so the magnitude is always non-negative — the truncation difference never bites in the
canonical evaluator. The `signed_mul_div` helper exists for off-chain code that constructs signed
intermediates without going through `i64::I64`.

---

## Fixed-point scale (FLOAT_SCALING)

Per re-routed D-10 + RESEARCH.md Spike Finding 4 + vendored `constants.move`:

**LOCKED:** `FLOAT_SCALING = 1_000_000_000` (1e9), the SVI math layer scale, matching on-chain
`predict::constants::float_scaling!()`.

### Unit boundary

The project operates at multiple fixed-point scales depending on which layer of the system is
in play. **Phase 1 SVI math operates exclusively at 1e9.**

| Layer | Scale | Where |
|-------|-------|-------|
| SVI math layer (Phase 1, this doc) | **1e9** | All inputs, intermediates (within u128), outputs of evaluator/Φ/sqrt |
| Vault NAV layer (Phase 2) | 1e18 | `shared/strategy.toml [fixed_point].decimals = 18` |
| Vault shares (Phase 2) | 1e9 | `share_decimals = 9`, Sui Coin convention |
| Variance precision (legacy guess from Phase 0) | 1e27 | `variance_decimals = 27` — RESERVED for future internal price-quoting at vault level; **NOT used by SVI math** |

The 1e9 scale fits comfortably for SVI quantities: total variance values are typically in
[1e-4, 4] which at 1e9 is `[100_000, 4_000_000_000]` — fits u64 with 30+ bits of headroom.
Intermediate products of two 1e9 values fit u128 trivially.

### Max safe input domain

`k ∈ [-2.5, +2.5]` log-strike (in 1e9 → ±2_500_000_000). Outside this range `(k - m)^2` may
overflow at extreme strikes if `b` is also near `b_max = 8e9`:

- `(k - m)^2` at `|k - m| = 2.5e9` → `6.25e18` (fits u128, far exceeds u64).
- After `/F` → `6.25e9` (fits u64 with 1.6 bits headroom — narrow).
- After `* b` at `b = 8e9` → `5e19` (exceeds u64 1.8e19 maximum — overflow).

The vendored on-chain code does not enforce this bound (`oracle.move:140-141` ships with a TODO
to add validation). Phase 2 `vault::rebalance` MUST enforce `|k| <= 2_500_000_000` at the
evaluator boundary. Off-chain runtimes assert the bound at their `binary_price` entry.

The bound is exposed as `SVI_K_MAX_LOG_STRIKE` from the codegen layer (Task 2) so all three
runtimes share the constant.

---

## Φ approximation — Cody 1969 piecewise rational Chebyshev

Per re-routed D-09 + RESEARCH.md Spike Finding 4. Three piecewise ranges, ~30 coefficients total
across the small/medium ranges plus a clamp threshold for the large tail.

### Algorithm

| Range | Discriminator | Form | Coefficient count |
|-------|---------------|------|-------------------|
| Small | `|x| < 0.66291` (`< SMALL_THRESHOLD = 662_910_000` at 1e9) | `Φ(x) = 0.5 + x · P(x²) / Q(x²)` | 5 numerator (A0..A4) + 4 denominator (B0..B3) |
| Medium | `0.66291 ≤ |x| < √32 ≈ 5.657` (`< MEDIUM_THRESHOLD = 5_656_854_249`) | `complement = exp(-x²/2) · P(|x|) / Q(|x|)`; `Φ = 1 - complement` (or `complement` if negative) | 9 numerator (C0..C8) + 8 denominator (D0..D7) |
| Large | `|x| ≥ √32` | Clamp to 0 (negative) or F (positive); extreme tail < 1e-7 at 1e9 scale | 0 |

### Citations

- Source: `scripts/deepbookv3/packages/predict/sources/helper/math.move:31-65` (constants);
  `scripts/deepbookv3/packages/predict/sources/helper/math.move:191-239` (function body
  `normal_cdf_u128`).
- Source comment from line 32 (vendored): `// Source: W.J. Cody (1969), as implemented in GSL gauss.c`.

### Boundary discriminator rule

Use `<` (strict) for the SMALL_THRESHOLD comparison and `<` (strict) for MEDIUM_THRESHOLD —
matching vendored `helper/math.move:191` (`if (x < SMALL_THRESHOLD)`) and `helper/math.move:209`
(`else if (x < MEDIUM_THRESHOLD)`). Tests must assert continuity at threshold within 1 unit at 1e9.

### Codegen

Coefficients live in `shared/cody_phi_coefficients.toml` (NEW Phase 1 file, populated in
Plan 01-02). `scripts/codegen.py` is extended in Plan 01-02 to emit `phi_coefficients.{move,py,ts}`
from the TOML. Same drift-check pattern as `shared/strategy.toml`.

The full constant table (verbatim from vendored `helper/math.move:31-65`):

```
SMALL_THRESHOLD = 662_910_000
A0 = 2_235_252_035    A1 = 161_028_231_069    A2 = 1_067_689_485_460
A3 = 18_154_981_253_344    A4 = 65_682_338
B0 = 47_202_581_905    B1 = 976_098_551_738    B2 = 10_260_932_208_619
B3 = 45_507_789_335_027

MEDIUM_THRESHOLD = 5_656_854_249
C0 = 398_941_512    C1 = 8_883_149_794    C2 = 93_506_656_132
C3 = 597_270_276_395    C4 = 2_494_537_585_290    C5 = 6_848_190_450_536
C6 = 11_602_651_437_647    C7 = 9_842_714_838_384    C8 = 11
D0 = 22_266_688_044    D1 = 235_387_901_782    D2 = 1_519_377_599_408
D3 = 6_485_558_298_267    D4 = 18_615_571_640_885    D5 = 34_900_952_721_146
D6 = 38_912_003_286_093    D7 = 19_685_429_676_860
```

---

## Integer Newton sqrt — bit-length seed + 7 unrolled iterations + overshoot correction

Per re-routed D-11 + RESEARCH.md Spike Finding 5. Cite for clone source:
`scripts/deepbookv3/packages/predict/sources/helper/math.move:266-292`.

### Algorithm

```
sqrt_u128(x):
  if x == 0: return 0
  if x < 4:  return 1
  g = sqrt_initial_guess_u128(x)
  g = (g + x // g) // 2          # iteration 1
  g = (g + x // g) // 2          # iteration 2
  g = (g + x // g) // 2          # iteration 3
  g = (g + x // g) // 2          # iteration 4
  g = (g + x // g) // 2          # iteration 5
  g = (g + x // g) // 2          # iteration 6
  g = (g + x // g) // 2          # iteration 7
  if g * g > x: g = g - 1        # final overshoot correction
  return g
```

### Initial guess

```
sqrt_initial_guess_u128(x):
  bits = 0; val = x
  if val >= 1<<64: val>>=64; bits+=64
  if val >= 1<<32: val>>=32; bits+=32
  if val >= 1<<16: val>>=16; bits+=16
  if val >= 1<<8:  val>>=8;  bits+=8
  if val >= 1<<4:  val>>=4;  bits+=4
  if val >= 1<<2:  val>>=2;  bits+=2
  if val >= 1<<1:  bits+=1
  return 1 << ((bits + 1) // 2)
```

### Determinism is the parity invariant

The 7 iterations are **deterministic** — no early termination, no convergence detection. This is
the cross-runtime parity invariant per CONTEXT.md re-route D-11: a "loop until converged" rule
diverges silently across runtimes when the convergence test (`x_{n+1} == x_n` vs `x_{n+1} <= x_n + 1`)
varies. Fixed-iteration removes the variance.

Verifying the Python clone matches Move on 1000 random u128 inputs is Spike 2 of this plan —
recorded in `01-01-SPIKE-NOTES.md` (Task 4). The bit-shift sequence (64, 32, 16, 8, 4, 2, 1) is
locked here; the empirical 1000-input cross-check is gated by Plans 01-03 (Python sqrt) and
01-05 (Move sqrt) implementations.

### FLOAT_SCALING-aware wrapper

The on-chain public entry `sqrt(x: u64, precision: u64): u64` (vendored `helper/math.move:120-125`)
multiplies the input by `precision` before calling `sqrt_u128`, then divides the result back.
Phase 1 clones this wrapper too — calls inside the SVI evaluator pass
`predict_math::sqrt(value, constants::float_scaling!())` to keep the result at 1e9 scale.

---

## Raw 5-parameter SVI evaluator — total_variance + binary_price

Per re-routed D-01 / D-02 + RESEARCH.md Spike Finding 3. The on-chain
`oracle.move::compute_nd2` (vendored `oracle.move:400-429`) IS the canonical algorithm.
Reproduce verbatim across all three runtimes.

### Param shape

`SVIParams { a: u64, b: u64, rho: i64::I64, m: i64::I64, sigma: u64 }`

(Move struct verbatim from vendored `oracle.move:72-83`.) Python and TS use a dataclass / object
with native signed `int` / `bigint` for `rho` and `m`.

### Canonical pseudocode (must appear verbatim across all 3 runtimes)

```
binary_price(svi: SVIParams, forward: u64, strike: u64) -> u64:
  assert forward > 0                                        # EZeroForward
  k = ln(strike * F / forward)                              # signed i64 at FLOAT_SCALING (uses cloned ln)
  k_minus_m = k - svi.m                                     # signed
  k_minus_m_squared = (k_minus_m * k_minus_m) / F           # u64 (squared signed → unsigned)
  sigma_squared = (svi.sigma * svi.sigma) / F               # u64
  sq = sqrt(k_minus_m_squared + sigma_squared, F)           # u64 (FLOAT_SCALING-aware sqrt)
  rho_km = (svi.rho * k_minus_m) / F                        # signed (mul_scaled)
  inner = rho_km + sq                                       # signed
  assert !is_negative(inner)                                # ECannotBeNegative
  total_var = svi.a + (svi.b * |inner|) / F                 # u64
  assert total_var > 0                                      # EZeroVariance
  sqrt_var = sqrt(total_var, F)                             # u64
  half_var = total_var / 2                                  # u64
  d2_numerator = k + half_var                               # signed
  d2 = -((d2_numerator * F) / sqrt_var)                     # signed (div_scaled, then negate)
  return normal_cdf(d2)                                     # u64 in [0, F]
```

Citation: `scripts/deepbookv3/packages/predict/sources/oracle.move:400-429`.

### API signatures per runtime

- **Move:**
  - `deepvault::svi_view::binary_price(oracle: &OracleSVI, strike: u64): u64` — production entry,
    single-file blast radius for Predict ABI churn.
  - `deepvault::svi_view::binary_price_from_params(a: u64, b: u64, rho: i64::I64, m: i64::I64, sigma: u64, forward: u64, strike: u64): u64`
    — test entry, bypasses needing a real `OracleSVI` shared object.
- **Python:**
  - `deepvault.svi.binary_price(svi: SVIParams, forward: int, strike: int) -> int`
  - `deepvault.svi.total_variance(svi: SVIParams, k: int) -> int`
- **TypeScript:**
  - `binaryPrice(svi: SVIParams, forward: bigint, strike: bigint): bigint`
  - `totalVariance(svi: SVIParams, k_signed: bigint): bigint`

### Pricing convention

- **D-06:** `r = 0` hardcoded. Discount factor at 14d tenor is ~0.998; correction is sub-bp and
  lives in the noise of arb-check tolerance. Whitepaper documents the assumption explicitly.
- **D-08:** Phase 1 ships theoretical fair value (= `oracle.compute_price` mid). Phase 2
  `vault::rebalance` compares against `predict.get_trade_amounts` ask/bid pair and abstains on
  Predict mis-quote.

---

## Sign convention

Per RESEARCH.md Spike Finding 6 + vendored `helper/i64.move`.

- **Move** uses `i64::I64` explicitly with sign-magnitude representation:
  `{ magnitude: u64, is_negative: bool }`. Zero is normalized — `from_parts(0, true)` returns
  `zero()` with `is_negative: false`. This normalization matters for equality checks across
  runtimes.
- **Python** `int` and **TypeScript** `bigint` are signed primitives; we do NOT wrap them in a
  struct. Native arithmetic operators apply.
- The signed-arithmetic boundary is at the Move FFI; off-chain runtimes use native signed
  arithmetic. **WHEN** converting Python `int` / TS `bigint` to Move `i64::I64` (e.g., for
  golden-vector emission), positive zero is the canonical normalization — Python `0` and TS `0n`
  always map to `i64::zero()`, never `i64::from_parts(0, true)`.
- Truncating signed division is the divergence risk (see §"Op-order canonical form" rounding
  rule). The canonical SVI evaluator path always operates on magnitudes (which are non-negative)
  so the divergence does not bite within `binary_price`. Off-chain helper code constructing
  signed intermediates outside the evaluator must use `signed_mul_div` (Python) or explicit
  sign tracking (TS).

---

## Whitepaper claim ladder

Per re-routed D-19. The Phase 6 strategy whitepaper headlines:

> **"Bit-equal across 3 runtimes on 120 vectors at 10⁻⁹ including 20 from Gatheral & Jacquier
> 2014, all algorithms cloned line-for-line from the audited on-chain Predict implementation
> (SHA `1159d79af33c70e09e406310e1d8f067832ede9d`)."**

### Vector inventory shape

| Tier | Count | Source |
|------|-------|--------|
| A | ~20 | Gatheral & Jacquier 2014 §4 worked numerical examples |
| B | ~80 | Synthetic stress (parametric grid + arb-violating sub-tier) |
| C | ~10 | JackJacquier/SSVI notebook execution captured by hand |
| C2 | ~10 | Cross-checks against vendored `scripts/deepbookv3/packages/predict/tests/oracle_tests.move` |

Total: ~120 vectors. Plan 01-04 (golden emitter) populates `shared/golden-vectors.json`. Plan
01-08 covers Tier C and C2 cross-check construction.

### Lock policy

This document and the algorithms it codifies are **MATH:** policy. See CONTRIBUTING.md §6 for
the commit-prefix discipline. Once Phase 1 closes (CI parity job green on 120 vectors), the
spec doc, op order, coefficient tables, fixed-point scale, sign convention, and runtime API
signatures are frozen until submission. Re-tuning requires a `MATH:` prefix and a paired
update to this doc justifying the change with a citation to the upstream Predict source.

If the vendored DeepBookV3 SHA bumps on the upstream `predict-testnet-4-16` branch (Monday
Predict sweep) and the bump touches `helper/math.move`, `oracle.move`, `oracle_config.move`, or
`helper/i64.move`, the changes must be re-verified against this spec before merging the bump.
