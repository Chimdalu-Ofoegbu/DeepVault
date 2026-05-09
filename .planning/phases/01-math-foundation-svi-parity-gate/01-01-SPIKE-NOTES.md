# Phase 1 Plan 01-01 — Wave-0 Spike Notes

**Resolved:** 2026-05-09
**Source-of-truth:** Vendored DeepBookV3 fork at `scripts/deepbookv3/`, HEAD `1159d79af33c70e09e406310e1d8f067832ede9d`
**Status:** Authoritative — Plans 01-02..01-08 cite this doc for resolved questions.

This document resolves the five Wave-0 open questions raised in `01-CONTEXT.md` §"Open
questions for the planner to resolve in Wave 0 spikes (1-hour each)" with empirical evidence
from the vendored Predict source. **For each spike, the planner did the work; downstream plans
read the resolution and proceed.** No question is left as "TBD."

---

## Spike 1: Is `oracle.compute_price` callable from `deepvault::svi_view` (different Move package)?

**Question (CONTEXT.md):** `oracle.move:331` declares `compute_price` `public(package)` — write a
tiny Move test calling `predict::get_trade_amounts(predict, oracle, key, quantity=1, clock)` and
inspect `(ask, bid)`. If `(ask + bid) / 2 ≈ oracle mid`, we can sanity-test directly; otherwise
MATH-02's "matches on-chain output" assertion lives in a Phase 2 integration test.

**Empirical evidence (from vendored source):**

- `scripts/deepbookv3/packages/predict/sources/oracle.move:331` confirms:
  ```
  public(package) fun compute_price(oracle: &OracleSVI, strike: u64): u64 {
  ```
  Package-visibility ONLY. NOT callable from `deepvault::svi_view` (a different Move package).
- `scripts/deepbookv3/packages/predict/sources/oracle.move:346` similarly shows
  `binary_price_pair` is `public(package)`.
- `scripts/deepbookv3/packages/predict/sources/predict.move:199-208` confirms `get_trade_amounts`
  IS `public`:
  ```
  public fun get_trade_amounts(
      predict: &Predict, oracle: &OracleSVI, key: MarketKey, quantity: u64, clock: &Clock,
  ): (u64, u64) {
      let (ask, bid) = predict.trade_prices(oracle, key, clock);
      (math::mul(ask, quantity), math::mul(bid, quantity))
  }
  ```
  Returns `(ask_total, bid_total)` for the supplied `quantity`. Both ask and bid are
  spread-adjusted around `compute_price` (the no-spread mid) — neither is the raw mid.

**Resolution:**

Phase 1's MATH-02 "Move evaluator matches on-chain output" assertion is asserted **INDIRECTLY**
via golden vectors. Our `deepvault::svi_view::binary_price` clones the on-chain `compute_nd2`
algorithm line-for-line (same Φ, same sqrt, same op-order, same scale per `shared/svi-spec.md`)
so the parity test is "Python evaluator output == Move evaluator output == TS evaluator output"
on 120 vectors at 1e-9. Bit-equality with on-chain is the **transitive** consequence of cloning
the same algorithm against the same constants.

A Phase 2 `vault::rebalance` integration test (out of Phase 1 scope) calls
`predict::get_trade_amounts` against testnet and asserts our local fair value falls within the
documented spread tolerance of the returned ask/bid mid — that's the live "matches on-chain
output" check, gated by Phase 2's wallet provisioning and testnet plumbing.

**Phase 1 does NOT block on a public `oracle.compute_price` wrapper.** Plan 01-05 (Move
evaluator) is unaffected by this resolution; it writes the evaluator against `&OracleSVI` ref
exactly as the on-chain `compute_nd2` does.

---

## Spike 2: Exact bit-shift sequence in `sqrt_initial_guess_u128` — does Python clone match Move on 1000 random u128 inputs?

**Question (CONTEXT.md):** Verify Python clone matches Move on 1000 random u128 inputs.

**Empirical evidence (from vendored source):**

`scripts/deepbookv3/packages/predict/sources/helper/math.move:281-292`:

```
fun sqrt_initial_guess_u128(x: u128): u128 {
    let mut bits: u8 = 0;
    let mut val = x;
    if (val >= 1u128 << 64) { val = val >> 64; bits = bits + 64; };
    if (val >= 1u128 << 32) { val = val >> 32; bits = bits + 32; };
    if (val >= 1u128 << 16) { val = val >> 16; bits = bits + 16; };
    if (val >= 1u128 << 8) { val = val >> 8; bits = bits + 8; };
    if (val >= 1u128 << 4) { val = val >> 4; bits = bits + 4; };
    if (val >= 1u128 << 2) { val = val >> 2; bits = bits + 2; };
    if (val >= 1u128 << 1) { bits = bits + 1; };
    1u128 << (((bits + 1) / 2) as u8)
}
```

Bit-shift sequence: **64, 32, 16, 8, 4, 2, 1** (each guarded by `val >= 1u128 << shift`).
Result: `1u128 << ((bits + 1) / 2)`.

This is the EXACT same sequence as the Python clone proposed in RESEARCH.md §"Pattern 3" /
lines 587-613. The algorithm is bit-shift binary search for the highest set bit, then return
`1 << ceil(highest_bit / 2)` — a deterministic operation.

**Resolution:**

The Python clone in `backtest/src/deepvault/isqrt.py` matches the Move clone bit-for-bit by
construction. The bit-shift sequence (64, 32, 16, 8, 4, 2, 1) is **locked here**.

The empirical 1000-input cross-check ("Python output equals Move output for 1000 random u128
inputs") REQUIRES both Python and Move implementations to exist, so it is gated by Plans 01-03
(Python sqrt) and 01-05 (Move sqrt). The plan-level resolution: Plan 01-05 includes a Move test
`tests/isqrt_test.move` with the **SAME 100 fixed inputs** as Plan 01-03's `tests/test_isqrt.py`
— inputs drawn deterministically from `random.Random(seed=42).randrange(0, 1<<128)`. The
cross-check is reformulated as **"Python and Move both produce these specific 100 outputs"**
rather than "compare 1000 random outputs at runtime" — the latter would require an FFI bridge
between Move and Python that we don't have.

The 7 unrolled Newton iterations + final `if g*g > x: g -= 1` overshoot correction are
deterministic constant gas (no early termination, no convergence detection) — see
`shared/svi-spec.md` §"Integer Newton sqrt".

---

## Spike 3: `[svi]` schema fill-in: top-level `[svi].scale = 9` vs `[fixed_point.svi]` sub-section?

**Question (CONTEXT.md):** Open Question 3 — recommended top-level `[svi].scale = 9`.

**Resolution: top-level `[svi].scale = 9`** (recommendation accepted; implemented in Task 2 of
this plan).

Rationale:

- Simpler schema — no nested table.
- Matches the existing `[svi].grid_points_for_arb_check` / `[svi].strike_range_sigma` flat-key
  shape from Phase 0.
- `[fixed_point]` continues to host the **vault NAV layer** scales (`decimals = 18`,
  `variance_decimals = 27`, `share_decimals = 9`) which are unchanged.
- The unit boundary is documented in `shared/svi-spec.md` §"Fixed-point scale (FLOAT_SCALING)":
  SVI math layer at 1e9; vault NAV at 1e18; vault shares at 1e9; variance precision (1e27) is
  reserved for future internal price-quoting at the vault level — NOT used by SVI math.

Already implemented in Task 2 — `shared/strategy.toml` line containing
`scale = 9                                      # re-route D-10`. Codegen propagates to all three
runtimes as `SVI_SCALE`.

---

## Spike 4: `phi.move` and `isqrt.move` location — `contracts/sources/helpers/` or flat in `contracts/sources/`?

**Question (CONTEXT.md):** Open Question 4 — recommended `contracts/sources/helpers/`.

**Resolution: `contracts/sources/helpers/`** (recommendation accepted).

Rationale: mirror Predict's `packages/predict/sources/helper/` shape — the vendored fork uses
`helper/` singular, but our project convention is `helpers/` plural per RESEARCH.md Open
Question 4 recommendation. The structural mirror is the auditability story for the whitepaper:
"our `helpers/i64.move` directly clones `packages/predict/sources/helper/i64.move`."

Confirmed structure for Plans 01-05 and downstream:

- `contracts/sources/helpers/i64.move` — clone of vendored `helper/i64.move`
- `contracts/sources/helpers/isqrt.move` — clone of vendored `helper/math.move:266-292` (sqrt fns)
- `contracts/sources/helpers/phi.move` — clone of vendored `helper/math.move:191-239` (`normal_cdf_u128`)
- `contracts/sources/helpers/math.move` — clone of vendored `helper/math.move:294-306`
  (`mul_div_round_down`)
- `contracts/sources/svi_view.move` — top level — production entry, single-file blast radius for
  OracleSVI ABI churn (Phase 2 imports this for vault.rebalance)
- `contracts/sources/phi_coefficients.move` — top level — codegen-emitted, mirrors
  `strategy_constants.move` shape

The `contracts/Move.toml` `[addresses]` map does NOT need to change. Move's package model just
nests modules under `module deepvault::helpers::i64;` declarations. Plan 01-05 verifies this
builds via `sui move build`.

---

## Spike 5: Max safe input domain for k

**Question (CONTEXT.md):** Open Question 5 — recommended `k ∈ [-2.5, +2.5]` at 1e9 →
`±2_500_000_000`.

**Resolution: `k ∈ [-2.5, +2.5]` at 1e9 → `±2_500_000_000`** (recommendation accepted;
implemented in Task 2 of this plan as `k_max_log_strike = 2_500_000_000`).

Rationale (overflow analysis at 1e9 scale, u64 max ≈ 1.8e19):

- `(k - m)^2` at `|k - m| = 2.5e9` → `6.25e18` (fits u128, far exceeds u64).
- After `/F` → `6.25e9` (fits u64 with 1.6 bits headroom — narrow, but workable).
- After `* b` at `b = b_max = 8e9` → `5e19` (EXCEEDS u64 1.8e19 maximum — overflow path WITHOUT
  the bound).
- With `|k| ≤ 2.5e9`, the inner Move arithmetic uses u128 intermediates which absorb the 5e19
  product safely; the `*F/F` round-trip lands in u64 range after the implicit re-scaling in
  `mul_scaled_u128` (vendored `helper/math.move:262-264`).

Test edge cases at `k = ±2.0, ±2.5` in golden vectors (Plan 01-04 Tier B includes these — see
"Net effect on Plans 02-08" below).

The bound is exposed as `SVI_K_MAX_LOG_STRIKE` from the codegen layer (already wired in
Task 2). Phase 2 `vault::rebalance` enforces the bound at the evaluator boundary — see
`shared/svi-spec.md` §"Fixed-point scale (FLOAT_SCALING)" / "Max safe input domain".

---

## Net effect on Plans 02-08

| Plan | Affected by spike(s) | Effect |
|------|---------------------|--------|
| 01-02 (codegen extension for Phi coefficients) | none | Proceeds against `shared/cody_phi_coefficients.toml` schema as in PATTERNS.md §"shared/cody_phi_coefficients.toml". No spike blocker. |
| 01-03 (Python evaluator) | Spikes 2, 3, 5 | Uses bit-shift sequence verified in Spike 2; uses `scale=9` from Spike 3; uses `±2_500_000_000` k bound from Spike 5 (constant via `SVI_K_MAX_LOG_STRIKE`). |
| 01-04 (golden emitter) | Spike 5 | Emits Tier B vectors at `k ∈ {-2.0, -1.5, -1.0, -0.5, 0, 0.5, 1.0, 1.5, 2.0, 2.5} × 1e9` (10 k-grid points; combined with 4 tenors × 3 (eta, gamma, rho) sweeps = 120 = Tier A 20 + Tier B 80 + Tier C 10 + Tier C2 10). |
| 01-05 (Move evaluator) | Spikes 1, 2, 4 | Uses `contracts/sources/helpers/` layout from Spike 4; does not need a public `oracle.compute_price` wrapper (Spike 1); cross-check fixed inputs from Spike 2 (same 100 inputs as Plan 01-03's Python tests). |
| 01-06 (TS evaluator) | Spikes 2, 3, 5 | Same `scale=9` + k bound + bit-shift sequence as Python; uses BigInt arithmetic. |
| 01-07 (CI parity) | none | Unchanged from PATTERNS.md. Job NAME `parity` stays stable for branch protection. |
| 01-08 (arb-checker + Tier C/C2) | Spike 1 (indirectly) | Tier C2 cross-check — see "Note on Tier C2" below. |

### Note on Tier C2 (oracle_tests.move availability)

Plan 01-01-PLAN.md §"Whitepaper claim ladder" (Section 8) references "Tier C2 (~10 cross-checks
against vendored `scripts/deepbookv3/packages/predict/tests/oracle_tests.move`)." During the
Spike 1 verification scan, **no `oracle_tests.move` file exists in the vendored fork** — the
only test file is `packages/predict/tests/helper/rate_limiter_tests.move`.

**Adjustment for Plan 01-08:** Tier C2 cross-checks must be sourced from one of:
- Re-running the on-chain `oracle::compute_nd2` against pinned (a, b, rho, m, sigma, forward,
  strike) tuples on a local Sui validator (`sui move test` with a test harness in
  `contracts/tests/svi_view_test.move`) and capturing outputs.
- Reading the Predict server's REST endpoint for live oracle prices and capturing as fixtures.

The Plan 01-08 author should pick the cheaper path. The whitepaper claim ladder in
`shared/svi-spec.md` already documents Tier C2 as "Cross-checks against vendored
`scripts/deepbookv3/packages/predict/tests/oracle_tests.move`" — that line will need a paired
update under MATH: prefix when Plan 01-08 picks the actual source. Recording the discrepancy
here so Plan 01-08 does not lose time looking for a non-existent file.
