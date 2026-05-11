# Phase 3: Backtest Harness + Two-Protocol PTB — Pattern Map

**Mapped:** 2026-05-11
**Files analyzed:** 20 new + 3 modified
**Analogs found:** 22 / 23

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `backtest/src/deepvault/vault_state.py` | model (state machine) | event-driven (action replay) | `backtest/src/deepvault/svi.py` + `contracts/sources/vault.move` | role-match (Python module style) + role-mirror (Move semantics) |
| `backtest/src/deepvault/replay.py` | controller (orchestrator + decorator) | event-driven | `backtest/src/deepvault/parity_runner.py` | role-match (runner) |
| `backtest/src/deepvault/data_ingest.py` | utility (data fetcher) | batch/file-I/O | `backtest/src/deepvault/parity_runner.py` (CLI+I/O idiom) + `scripts/codegen.py` (TOML→file emit) | role-match |
| `backtest/src/deepvault/walk_forward.py` | service (calibration) | transform (DataFrame→DataFrame) | `backtest/src/deepvault/arb_checker.py` (analytical pipeline) | role-match |
| `backtest/src/deepvault/lookahead_audit.py` | service (audit) | transform | `backtest/src/deepvault/arb_checker.py` (NamedTuple result pattern) | role-match |
| `backtest/src/deepvault/pnl_attribution.py` | service (accountant) | transform | `backtest/src/deepvault/arb_checker.py` | role-match |
| `backtest/src/deepvault/report.py` | service (renderer) | transform (templated HTML output) | `scripts/codegen.py` (template→file emit) | partial (no in-repo Jinja2 yet) |
| `backtest/tests/test_vault_state.py` | test (unit) | request-response | `backtest/tests/test_svi.py` | exact |
| `backtest/tests/test_replay_parity.py` | test (parity/integration) | event-driven | `backtest/tests/test_gatheral_paper_vectors.py` + `parity_runner.py` | role-match |
| `backtest/tests/test_lookahead_audit.py` | test (property) | transform | `backtest/tests/test_arb_checker.py` | role-match |
| `backtest/tests/test_walk_forward.py` | test (property) | transform | `backtest/tests/test_arb_checker.py` | role-match |
| `backtest/tests/test_ptb_capability_grep.py` | test (grep CI gate) | batch | `.github/workflows/ci.yml` Capability containment grep step | role-match |
| `backtest/traces/cycle-full.json` | data fixture | file-I/O | `shared/golden-vectors.json` (generated JSON fixture) | role-match |
| `backtest/notebooks/hand-recompute.ipynb` | notebook | one-off computation | none in repo | NO ANALOG (greenfield) |
| `.planning/backtest-assumptions.md` | doc (assumption ledger) | doc | `.planning/phases/02-*/02-CONTEXT.md` (markdown spec) | partial (markdown structure) |
| `scripts/two-protocol-ptb-demo.ts` | controller (PTB driver) | request-response | `scripts/e2e-vault-cycle.ts` | exact |
| `scripts/two-protocol-ptb-demo.sh` | controller (bash wrapper) | request-response | `scripts/e2e-vault-cycle.sh` | exact |
| `contracts/tests/ptb_capability_test.move` | test (Move) | event-driven (capability flow) | `contracts/tests/integration_test.move` + `share.move` capability-quarantine idiom | exact |
| `contracts/tests/mock_margin_pool.move` | test (Move test-only module) | request-response (mock) | `contracts/sources/predict_adapter.move` + `contracts/tests/integration_test.move` | role-match (mock layer) |
| `contracts/tests/liquidation_test.move` | test (Move property) | event-driven | `contracts/tests/integration_test.move` + `contracts/tests/property_test.move` + `contracts/tests/ltv_test.move` | exact |
| `.github/workflows/nightly-backtest.yml` | config (CI workflow) | batch (cron + artifact) | `.github/workflows/nightly-e2e-vault.yml` + `.github/workflows/nightly-prover.yml` | exact |
| `.github/workflows/ci.yml` (MODIFIED — add backtest+ptb-grep steps) | config (CI workflow) | batch | `.github/workflows/ci.yml` existing python+move jobs | exact (extension) |
| `backtest/pyproject.toml` (MODIFIED — add plotly, jinja2) | config (deps) | n/a | `backtest/pyproject.toml` existing block | exact |

---

## Pattern Assignments

### `backtest/src/deepvault/vault_state.py` (model, event-driven state machine)

**Analog A — Python module style:** `backtest/src/deepvault/svi.py` (lines 1-50)
**Analog B — Move semantics to mirror:** `contracts/sources/supply.move` (lines 61-117) + `contracts/sources/redeem.move` (lines 1-60) + `contracts/sources/ltv.move` (lines 41-83)

**Module docstring & forbidden-import pattern** (from `svi.py:1-31`):
```python
"""Raw SVI total variance + binary_price evaluator.

Clones on-chain oracle.move::compute_nd2 (oracle.move:400-429).
All inputs/outputs at FLOAT_SCALING = 1e9.

Source: scripts/deepbookv3/packages/predict/sources/oracle.move:400-429
SHA: 1159d79af33c70e09e406310e1d8f067832ede9d

[...]

Forbidden imports: math, numpy, scipy. Pure Python int.
"""
from typing import NamedTuple
from .isqrt import isqrt_u128
F: int = 1_000_000_000  # FLOAT_SCALING
```
**Apply to vault_state.py:** Top docstring must (a) cite the Move source files (vault.move / supply.move / redeem.move / ltv.move) with SHA `1159d79a`, (b) declare "no numpy / no math" forbidden imports (parity discipline), (c) import only `strategy_constants` + `svi` siblings.

**NamedTuple result struct** (from `svi.py:46-50` + `arb_checker.py:49-67`):
```python
class SVIParams(NamedTuple):
    """Raw 5-parameter SVI (Gatheral & Jacquier 2014).
    All values at FLOAT_SCALING = 1e9. `rho` and `m` may be negative
    (native Python signed int); `a`, `b`, `sigma` are non-negative.
    """
    a: int; b: int; rho: int; m: int; sigma: int
```
**Apply:** `VaultStateSnapshot(NamedTuple)` with `total_assets: int`, `total_shares: int`, `liquid_balance: int`, `hedge_book: tuple[...]`. `Action(NamedTuple)` with `kind: str`, `args: dict`, `pre: VaultStateSnapshot`, `post: VaultStateSnapshot`.

**Mirroring Move semantics — supply formula** (from `supply.move:143-156`):
```move
public(package) fun compute_shares_to_mint<Quote>(vault: &Vault<Quote>, deposit: u64): u64 {
    let virtual_shares = strategy_constants::virtual_shares();
    let numerator =
        (deposit as u128) * ((vault::total_shares(vault) as u128) + (virtual_shares as u128));
    let denominator = (vault::total_assets(vault) as u128) + 1u128;
    let shares = numerator / denominator;
    assert!(shares <= (std::u64::max_value!() as u128), EShareOverflow);
    shares as u64
}
```
**Apply:** Python `def supply(amount: int) -> int` calls `compute_shares_to_mint` with identical integer arithmetic (no float). Use `from .strategy_constants import VIRTUAL_SHARES` to pull the same constant the Move side reads from `strategy_constants::virtual_shares()`.

**Mirroring Move semantics — worst-case NAV** (from `ltv.move:60-68`):
```move
public fun worst_case_nav_per_share<Quote>(vault: &Vault<Quote>): u64 {
    let total_shares = vault::total_shares(vault);
    assert!(total_shares > 0, EZeroShares);
    math::mul_div_round_down(
        vault::balance_value(vault),
        strategy_constants::nav_scale(),
        total_shares,
    )
}
```
**Apply:** Python `worst_case_nav()` uses `(balance_value * NAV_SCALE) // total_shares` — truncate-toward-zero is the same on Python `//` and Move `mul_div_round_down`. Raise `ValueError("EZeroShares")` to mirror the Move abort code 500. Required for D-20 −30% liquidation parity test.

**Replay assertion idiom** (from `parity_runner.py:91-107`):
```python
if expected["params_valid"]:
    actual_w = total_variance(svi, k)
    expected_w = int(expected["w"], 16)
    if abs(actual_w - expected_w) > args.tolerance:
        failures.append(
            f"{v['id']} ({v['tier']}): w mismatch — "
            f"actual={actual_w:#x}, expected={expected_w:#x}, "
            f"diff={abs(actual_w - expected_w)}"
        )
```
**Apply to `vault_state.replay(action)`:** After applying the action, compare every field of computed post-state to `action.post`; fail with `abs(actual - expected) > 1` (1-wei tolerance per D-15). Print `actual=` and `expected=` for both NAV-per-share and shares-delta on mismatch.

---

### `backtest/src/deepvault/replay.py` (controller, event-driven + `@strategy_fn` decorator)

**Analog:** `backtest/src/deepvault/parity_runner.py` (lines 1-90)

**CLI + entrypoint pattern** (from `parity_runner.py:49-72`):
```python
def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--first", type=int, default=None, help="Only check first N vectors")
    parser.add_argument("--tier", type=str, default=None, help="Filter by tier (A/B/C/C2)")
    parser.add_argument(
        "--tolerance",
        type=int,
        default=1,
        help="Max allowed diff per vector (default 1 unit at 1e9)",
    )
    args = parser.parse_args()
    if not JSON_PATH.exists():
        print(f"FAIL: golden-vectors.json not found at {JSON_PATH}", file=sys.stderr)
        return 1
    vectors = json.loads(JSON_PATH.read_text(encoding="utf-8"))
```
**Apply to replay.py:** Provide `python -m deepvault.replay --trace backtest/traces/cycle-full.json [--limit N]` CLI. Same exit-code contract: `0` on bit-parity, `1` on any mismatch with diff dump.

**`@strategy_fn(reads=..., writes=...)` decorator** (no in-repo analog — greenfield; pattern from D-08):
```python
def strategy_fn(*, reads: list[str], writes: list[str]):
    """Decorator enforcing decision-bar / observation-bar split (BACK-03, D-08).
    The decorator wraps the function so accessing any DataFrame column not in
    `reads` raises; assignment to any column not in `writes` raises.
    """
    def decorator(fn):
        @functools.wraps(fn)
        def wrapped(*args, **kwargs):
            # Walk arg list for pd.DataFrame instances; wrap each in a
            # ColumnGuard proxy that raises on undeclared __getitem__ /
            # __setitem__.
            ...
        return wrapped
    return decorator
```
**Apply:** Per D-08, raise `LookaheadError(f"undeclared read: {col!r}; declared reads={reads}")`. Tests in `test_lookahead_audit.py` exercise both `reads` and `writes` violations.

**Top docstring + invocation block** (from `parity_runner.py:1-28`):
```python
"""Parity runner: read shared/golden-vectors.json, evaluate via deepvault.svi,
   assert each (w, binary_price, params_valid) matches expected at FLOAT_SCALING (1e9).

Invocations:
    python -m deepvault.parity_runner             # full check, exit 1 on any mismatch
    python -m deepvault.parity_runner --first N   # only first N vectors (debug)
"""
```
**Apply to replay.py:** Mirror the structure — top-of-file docstring lists invocations and exit codes; reference D-14/D-15 (1-wei replay parity).

---

### `backtest/src/deepvault/data_ingest.py` (utility, file-I/O batch)

**Analog A — module style:** `backtest/src/deepvault/parity_runner.py`
**Analog B — Path-derived layout:** `scripts/codegen.py` (lines 22-34) for REPO_ROOT pattern

**REPO_ROOT discovery + cache path pattern** (from `codegen.py:22-27`):
```python
REPO_ROOT = Path(__file__).resolve().parent.parent
TOML_PATH = REPO_ROOT / "shared" / "strategy.toml"
MOVE_PATH = REPO_ROOT / "contracts" / "sources" / "strategy_constants.move"
PYTHON_PATH = REPO_ROOT / "backtest" / "src" / "deepvault" / "strategy_constants.py"
TS_PATH = REPO_ROOT / "dashboard" / "src" / "lib" / "strategy_constants.ts"
```
**Apply:** `REPO_ROOT = Path(__file__).resolve().parents[3]` (matches `parity_runner.py:39`); `CACHE_PATH = REPO_ROOT / "backtest" / "data" / "btcusdt_1h.parquet"`. `data/` is gitignored.

**Idempotent fetch idiom** (from CONTEXT.md "data/" cache; matches `codegen.py` regeneration pattern). Combined with `requests>=2.32` (already pinned in `backtest/pyproject.toml:18`):
```python
import requests
import pandas as pd
URL = "https://www.cryptodatadownload.com/cdd/Binance_BTCUSDT_1h.csv"

def load_btc_hourly(start_ts: int, end_ts: int) -> pd.DataFrame:
    if not CACHE_PATH.exists():
        resp = requests.get(URL, timeout=30)
        resp.raise_for_status()
        # CSV header per RESEARCH.md: Unix,Date,Symbol,Open,High,Low,Close,Volume BTC,Volume USDT,tradecount
        # Skip the metadata line CryptoDataDownload prepends.
        df = pd.read_csv(io.StringIO(resp.text), skiprows=1)
        df["available_at"] = df["Unix"] + 1  # decision-bar/observation-bar split (D-08)
        df.to_parquet(CACHE_PATH, compression="snappy", index=False)
    return pd.read_parquet(CACHE_PATH)
```
**Apply:** Reuse `requests` (already in deps), use `pyarrow` engine implicitly via `to_parquet`/`read_parquet`. The `available_at = Unix + 1` column is load-bearing for D-08.

---

### `backtest/src/deepvault/walk_forward.py` (service, monthly calibration)

**Analog:** `backtest/src/deepvault/arb_checker.py` (lines 124-193) — analytical pipeline with NamedTuple output + helper functions

**NamedTuple result pattern** (from `arb_checker.py:49-67`):
```python
class ArbResult(NamedTuple):
    """Output of check_arb.
    Attributes:
        params_valid: True iff min(g(k)) >= 0 across the grid AND total_variance
            evaluates without raising on every sampled k.
        min_g_k: int at FLOAT_SCALING; if negative -> arb violation.
        [...]
    """
    params_valid: bool
    min_g_k: int
    calendar_pass: bool
    g_k_array: list[int]
```
**Apply to walk_forward.py:** `class WalkForwardResult(NamedTuple)` with `is_sample_sharpe: float`, `oos_sharpe: float`, `oos_drawdown_bps: int`, `monthly_pnls: pd.Series`. Per D-04 monthly cadence: `pd.PeriodIndex(freq='M')` driven iteration; OOS holdback is `most_recent_30pct` per D-03.

**Pure-pandas iteration shape** (CONTEXT.md D-04 + RESEARCH.md "hand-rolled monthly iterator wins"):
```python
def walk_forward(data: pd.DataFrame, *, oos_split: float = 0.30) -> WalkForwardResult:
    months = data.index.to_period('M').unique()
    cutoff = int(len(months) * (1 - oos_split))
    in_sample_months, oos_months = months[:cutoff], months[cutoff:]
    # NO PARAMETER TUNING ON oos_months — enforced by @strategy_fn writes={}.
    for m in in_sample_months:
        train_data = data[data.index.to_period('M') < m]  # strictly before m
        # calibrate on train_data; deploy on m+1
        ...
```
**Apply:** No tuning on `oos_months` is a property test in `test_walk_forward.py` (see analog below).

---

### `backtest/src/deepvault/lookahead_audit.py` (service, audit harness)

**Analog:** `backtest/src/deepvault/arb_checker.py` (numpy-allowed visualization module)

**Module-level numpy permission idiom** (from `arb_checker.py:22-32`):
```python
"""[...]
Type discipline (01-RESEARCH.md "Common Pitfalls A"): arb_checker is the ONLY
numpy-allowed module in the Python evaluator codebase. numpy is used for the
visualization-bound grid generation; OUTPUT g_k_array elements are converted to
Python int at FLOAT_SCALING before returning. The parity_runner discipline (no
floats anywhere) does NOT cover this module — arb_checker is for visualization,
not parity.
"""
import numpy as np  # ALLOWED HERE (visualization-bound, not parity-bound)
```
**Apply to lookahead_audit.py:** Add identical disclaimer — lookahead_audit is allowed `np.random.permutation` (D-06 shuffled-label test), `np.random.choice` (D-07 3-row hand recompute seed). Output goes back to pure-Python int / list[int] before crossing the module boundary.

**Shuffled-label test scaffolding** (D-06):
```python
def shuffled_label_alpha_apy(simulation_fn, returns: pd.Series, seed: int = 42) -> float:
    """Per D-06: |alpha| <= 0.5% APY required to pass."""
    rng = np.random.default_rng(seed)
    shuffled = pd.Series(rng.permutation(returns.values), index=returns.index)
    sim_result = simulation_fn(shuffled)
    apy = compound_to_apy(sim_result.total_return, sim_result.bars, bars_per_year=8760)
    return apy
```
**Apply:** Wired into `test_lookahead_audit.py` as a hard CI gate.

---

### `backtest/src/deepvault/pnl_attribution.py` (service, six-column accountant)

**Analog:** `backtest/src/deepvault/arb_checker.py` (analytical pipeline with structured output)

**Pure-pandas transform** (no in-repo six-column analog; RESEARCH.md D-09 six columns enumerated):
```python
def compute_attribution(simulation: pd.DataFrame, trace: list[dict]) -> pd.DataFrame:
    """Six-column PnL attribution per D-09:
    plp_yield_bps + hedge_cost_bps + hedge_payoff_bps + fees_bps + slippage_bps + gas_bps == total_bps
    """
    out = pd.DataFrame(index=simulation.index)
    out["plp_yield_bps"] = simulation["plp_accrual"] / simulation["nav_open"] * 10_000
    out["hedge_cost_bps"] = simulation["premium_paid"].neg() / simulation["nav_open"] * 10_000
    out["hedge_payoff_bps"] = simulation["binary_payout"] / simulation["nav_open"] * 10_000
    out["fees_bps"] = 0  # reserved per D-09 (v1 has no fees per Phase 2 D-13)
    out["slippage_bps"] = (simulation["next_vwap"] - simulation["next_open"]) / simulation["nav_open"] * 10_000
    out["gas_bps"] = simulation["gas_sui"] * simulation["sui_to_usd"] / simulation["nav_open"] * 10_000
    out["total_bps"] = out.iloc[:, :6].sum(axis=1)
    # Invariant: assert sum == total (modulo 1bp rounding)
    return out
```
**Apply:** Assert `abs((out.iloc[:, :6].sum(axis=1) - out["total_bps"]).max()) <= 1` in unit tests.

---

### `backtest/src/deepvault/report.py` (service, Jinja2 HTML renderer)

**Analog A — template→file emission:** `scripts/codegen.py` (lines 35-80)
**Analog B — none in-repo for Jinja2** (Jinja2 is a NEW Phase 3 dep)

**Generated-file header pattern** (from `codegen.py:35-45`):
```python
HEADER_LINES_GENERIC = [
    "AUTO-GENERATED - DO NOT EDIT",
    "Source: shared/strategy.toml (schema_version {schema_version})",
    "Regenerate via: make codegen   (or: python scripts/codegen.py)",
]
```
**Apply to report.py:** Top of `report.html` includes an HTML comment `<!-- AUTO-GENERATED by backtest/src/deepvault/report.py; regen via `make backtest-report` -->`. Sections per D-13 (11 sections).

**Self-contained HTML output** (RESEARCH.md §"Standard Stack"):
```python
import plotly.io as pio
import base64, io
import matplotlib.pyplot as plt
import jinja2

def render_html(*, sim, attribution, oos_metrics, stress_events, sensitivity, hand_recompute, out_path: Path) -> None:
    env = jinja2.Environment(loader=jinja2.FileSystemLoader(REPO_ROOT / "backtest/src/deepvault/templates"))
    tpl = env.get_template("report.html.j2")

    # Plotly: inline
    surface_html = pio.to_html(plot_svi_surface(sim.svi_snapshot), include_plotlyjs="inline", full_html=False)

    # matplotlib: PNG base64
    buf = io.BytesIO()
    plot_pnl_histogram(attribution).savefig(buf, format="png", dpi=120, bbox_inches="tight")
    pnl_hist_b64 = base64.b64encode(buf.getvalue()).decode("ascii")

    out_path.write_text(tpl.render(
        surface_html=surface_html, pnl_hist_b64=pnl_hist_b64,
        oos=oos_metrics, stress=stress_events, sensitivity=sensitivity, hand_recompute=hand_recompute,
    ))
```
**Apply:** Single-file output (D-12); never reference external CSS/JS. The cold-read test (D-13 §"each chart has a caption") is enforced by template structure.

---

### `backtest/tests/test_vault_state.py` (test, unit)

**Analog:** `backtest/tests/test_svi.py` (lines 1-85)

**Test structure** (from `test_svi.py:1-30`):
```python
"""SVI evaluator sanity tests (NOT golden-vector parity — that's Plan 01-04+).

Tests in this file are independent of the golden vector pipeline and assert
high-level properties: ATM ~= 0.5, OTM call < 0.5, OTM put > 0.5, EZeroForward,
total variance positive, strict-int return, ECannotBeNegative.
"""
import pytest
from deepvault.svi import SVIParams, binary_price, total_variance
F: int = 1_000_000_000

def _typical_svi() -> SVIParams:
    """Sane raw-SVI params: ATM-flat, mild smile, no skew."""
    return SVIParams(a=10_000_000, b=500_000_000, rho=0, m=0, sigma=100_000_000)

def test_atm_zero_skew_returns_approximately_half():
    svi = _typical_svi()
    forward = 50 * F; strike = 50 * F
    price = binary_price(svi, forward, strike)
    assert abs(price - F // 2) < 60_000_000
```
**Apply:** `_typical_seeded_vault()` helper returning a `VaultState` seeded with the same `SEED_QUOTE_MICRO_UNITS` and `VIRTUAL_SHARES` as the Move-side `make_seeded_vault` (mirrors `ltv_test.move:25-36`). Tests: `test_supply_round_down_in_vault_favor`, `test_redeem_after_cooldown`, `test_worst_case_nav_with_no_hedges_equals_nav`, `test_worst_case_nav_with_hedges_is_less_than_nav` — direct Python ports of `ltv_test.move` tests at lines 49-100.

---

### `backtest/tests/test_replay_parity.py` (test, parity/integration)

**Analog A — paper-vector parametrized pattern:** `backtest/tests/test_gatheral_paper_vectors.py`
**Analog B — runner CLI invocation:** `backtest/src/deepvault/parity_runner.py`

**Parametrize-over-vectors idiom** (from `test_gatheral_paper_vectors.py:109-119`):
```python
@pytest.mark.parametrize(
    "vec",
    [VECTOR_1, VECTOR_2, VECTOR_3, VECTOR_4, VECTOR_5],
    ids=lambda v: v["id"],
)
def test_total_variance_matches_paper(vec):
    actual = total_variance(vec["svi"], vec["k"])
    assert abs(actual - vec["expected_w"]) <= vec["tolerance"], (
        f"{vec['id']}: actual={actual}, expected={vec['expected_w']}, "
        f"diff={abs(actual - vec['expected_w'])}, tol={vec['tolerance']}"
    )
```
**Apply:** Load `backtest/traces/cycle-full.json`, parametrize over `actions` array. For each action, instantiate a fresh `VaultState`, replay all prior actions, then assert post-state matches within 1-wei tolerance. The action's `tx_digest` becomes the test id (`ids=lambda a: a["tx_digest"][:8]`).

**Trace-file JSON parsing** (from `parity_runner.py:65-86`):
```python
vectors = json.loads(JSON_PATH.read_text(encoding="utf-8"))
[...]
for v in vectors:
    try:
        inputs = v["inputs"]
        expected = v["expected"]
        svi = SVIParams(
            a=int(inputs["a"], 16),
            b=int(inputs["b"], 16),
            rho=_decode_signed(inputs["rho"]),
            [...]
        )
```
**Apply:** Decode action effects using the same hex-encoding strategy (i128 deltas use `{"mag": "0x...", "neg": bool}` per CONTEXT.md schema; reuse the `_decode_signed` helper from parity_runner.py lines 43-46).

---

### `backtest/tests/test_lookahead_audit.py` (test, property)

**Analog:** `backtest/tests/test_arb_checker.py` (lines 1-50)

**NamedTuple-result property assertion idiom** (from `test_arb_checker.py:20-30`):
```python
def test_returns_arb_result_with_correct_shape():
    """ArbResult is the locked NamedTuple; all fields are correctly typed."""
    svi = SVIParams(a=50_000_000, b=250_000_000, rho=0, m=0, sigma=400_000_000)
    result = check_arb(svi)
    assert isinstance(result, ArbResult)
    assert isinstance(result.params_valid, bool)
    assert isinstance(result.min_g_k, int)
    assert isinstance(result.calendar_pass, bool)
    assert isinstance(result.g_k_array, list)
    assert len(result.g_k_array) >= SVI_GRID_POINTS_FOR_ARB_CHECK
```
**Apply:** `test_strategy_fn_raises_on_undeclared_read`, `test_strategy_fn_raises_on_undeclared_write`, `test_shuffled_label_alpha_within_half_pct_apy`, `test_hand_recompute_3_rows_match_harness_to_the_wei`. The shuffled-label test is the load-bearing CI gate per D-06.

**Hard-gate threshold pattern** (from `test_arb_checker.py:42-70` — pattern of asserting hard math conditions):
```python
def test_valid_slice_passes():
    """Sane SVI params should produce min_g_k >= 0."""
    svi = SVIParams(a=50_000_000, b=250_000_000, rho=-100_000_000, m=0, sigma=400_000_000)
    result = check_arb(svi)
    assert result.params_valid is True
    assert result.min_g_k >= 0
```
**Apply:** D-06 hard threshold `|alpha| <= 0.5% APY = 0.005`:
```python
def test_shuffled_label_alpha_within_half_pct_apy():
    """D-06: shuffled-label test must produce |alpha| <= 0.5% APY to pass.
    Above 0.5% blocks the entire backtest run."""
    apy = shuffled_label_alpha_apy(simulate_strategy, btc_returns, seed=42)
    assert abs(apy) <= 0.005, f"Lookahead leak detected: shuffled-label APY = {apy:.4%}"
```

---

### `backtest/tests/test_walk_forward.py` (test, property)

**Analog:** `backtest/tests/test_arb_checker.py`

**OOS holdout invariant test** (no in-repo analog; pattern from D-04):
```python
def test_oos_never_touched_during_calibration():
    """D-04: OOS holdback never written to during calibration.
    Wraps calibration in @strategy_fn(writes=in_sample_months_only); test
    invokes calibration with the full DataFrame and asserts no exception
    AND verifies OOS slice is bit-identical pre/post.
    """
    pre_oos = data.loc[oos_start:].copy(deep=True)
    calibrate(data)
    post_oos = data.loc[oos_start:]
    pd.testing.assert_frame_equal(pre_oos, post_oos)
```

---

### `backtest/tests/test_ptb_capability_grep.py` (test, grep CI gate)

**Analog:** `.github/workflows/ci.yml` lines 78-105 (Capability containment grep step)

**Grep-as-test pattern** (from `ci.yml:96-105`):
```yaml
run: |
  set -euo pipefail
  if grep -nE '\)\s*:\s*\&?(mut )?(TreasuryCap|AdminCap)' \
      contracts/sources/*.move 2>/dev/null \
      | grep -v '_test.move' \
      | grep -vE 'public\(package\) fun'; then
    echo "::error::Capability containment violated — a public function exposes TreasuryCap or AdminCap by reference. See VAULT-10 in REQUIREMENTS.md."
    exit 1
  fi
  echo "Capability containment OK: no public function returns TreasuryCap or AdminCap."
```
**Apply to test_ptb_capability_grep.py:** Cross-language Python wrapper invoked from CI; uses `subprocess.run(["grep", "-rnE", ...])` against:
1. `contracts/sources/*.move` — no return type matching `TradeCap|TreasuryCap<SHARE>` from a `public fun`
2. `scripts/two-protocol-ptb-demo.ts` — no occurrence of `withdraw_cap` or `tradeCap` as a `let` binding outside the SDK-internal layer

```python
import subprocess
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]

def test_no_public_function_returns_trade_cap_or_treasury_cap_share():
    result = subprocess.run(
        ["grep", "-nE", r"^public fun.*\):\s*\&?(mut )?(TradeCap|TreasuryCap<SHARE>)",
         "-r", str(REPO_ROOT / "contracts/sources/"),
         "--include=*.move"],
        capture_output=True, text=True,
    )
    matches = [line for line in result.stdout.splitlines() if "_test.move" not in line]
    assert not matches, f"Capability escape detected:\n" + "\n".join(matches)
```

---

### `scripts/two-protocol-ptb-demo.ts` (controller, PTB driver)

**Analog:** `scripts/e2e-vault-cycle.ts` (lines 1-273) — direct lineal analog

**Imports + types + entry shape** (from `e2e-vault-cycle.ts:30-65`):
```typescript
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Transaction } from '@mysten/sui/transactions';
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

type DeployJson = {
    network: string; status: string; package_id: string;
    vault_id: string; vault_initial_shared_version: number;
    [...]
    dusdc_type_tag: string;
};

const SUPPLY_AMOUNT_MICRO = 100_000_000n; // 100 DUSDC (6 decimals)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
```
**Apply:** Add `MARGIN_PKG`, `MARGIN_REGISTRY_ID`, `USDC_MARGIN_POOL_ID`, `BTC_MARGIN_POOL_ID`, `BTC_ORACLE_ID`, `USDC_ORACLE_ID`, `DEEPBOOK_POOL_ID` constants. Per CONTEXT.md "Claude's Discretion" — separate file from `e2e-vault-cycle.ts`.

**Shared-object reference + PTB construction** (from `e2e-vault-cycle.ts:122-150`):
```typescript
const supplyTx = new Transaction();
const [depositCoin] = supplyTx.splitCoins(supplyTx.object(depositCoinId), [
    supplyTx.pure.u64(SUPPLY_AMOUNT_MICRO),
]);
supplyTx.moveCall({
    target: `${deploy.package_id}::supply::supply`,
    typeArguments: [deploy.dusdc_type_tag],
    arguments: [
        supplyTx.sharedObjectRef({
            objectId: deploy.vault_id,
            mutable: true,
            initialSharedVersion: deploy.vault_initial_shared_version,
        }),
        supplyTx.object(deploy.predict_top_level_id),
        supplyTx.sharedObjectRef({
            objectId: deploy.predict_manager_id,
            mutable: true,
            initialSharedVersion: deploy.predict_manager_initial_shared_version,
        }),
        supplyTx.object(oracleSviId),
        depositCoin,
        supplyTx.object('0x6'), // Clock
    ],
});
```
**Apply:** Build the 5-call PTB per RESEARCH.md §"Pattern 1: PTB chaining with `Margin::withdraw` bridge". Order: (1) `margin_manager::deposit<BTC,DUSDC,BTC>` — deposit collateral; (2) `margin_manager::borrow_quote<BTC,DUSDC>` — auto-deposits into BalanceManager, **no return value**; (3) `margin_manager::withdraw<BTC,DUSDC,DUSDC>` — extracts free `Coin<DUSDC>` (CRITICAL: this is the gap CONTEXT.md D-17 glosses over per RESEARCH.md primary finding); (4) `vault::supply::supply<DUSDC>` — atomic deposit + hedge; (5) (implicit) Coin<SHARE> transferred to ctx.sender by supply.move:108.

**Margin-manager moveCall pattern** (derived from `margin_manager.move:458-555` + `margin_manager.move:602-643`):
```typescript
// Step 3 (THE LOAD-BEARING BRIDGE):
const borrowedCoin = tx.moveCall({
    target: `${MARGIN_PKG}::margin_manager::withdraw`,
    typeArguments: [BTC_TYPE, DUSDC_TYPE, DUSDC_TYPE],
    arguments: [
        tx.sharedObjectRef({ objectId: MM_ID, mutable: true, initialSharedVersion: MM_V0 }),
        tx.sharedObjectRef({ objectId: MARGIN_REGISTRY_ID, mutable: false, initialSharedVersion: MR_V0 }),
        tx.object(BTC_MARGIN_POOL_ID),
        tx.object(USDC_MARGIN_POOL_ID),
        tx.object(BTC_ORACLE_ID),
        tx.object(USDC_ORACLE_ID),
        tx.object(DEEPBOOK_POOL_ID),
        tx.pure.u64(loanAmount),
        tx.object('0x6'),
    ],
});
// borrowedCoin is now passable into supply::supply as the deposit Coin<DUSDC>.
```

**Effects → event-payload extraction** (from `e2e-vault-cycle.ts:151-173`):
```typescript
const supplyResult = await client.signAndExecuteTransaction({
    transaction: supplyTx,
    signer: keypair,
    options: { showEffects: true, showEvents: true },
});
if (supplyResult.effects?.status?.status !== 'success') {
    throw new Error(
        `supply failed: ${JSON.stringify(supplyResult.effects?.status)}`,
    );
}
const suppliedEvent = supplyResult.events?.find((e) =>
    e.type.endsWith('::supply::Supplied'),
);
const hedgeMintedEvent = supplyResult.events?.find((e) =>
    e.type.endsWith('::rebalance::HedgeMinted'),
);
if (!suppliedEvent || !hedgeMintedEvent) {
    throw new Error('Expected Supplied + HedgeMinted events; saw: ' + JSON.stringify(supplyResult.events));
}
```
**Apply:** Two-protocol PTB demo must also assert `LoanBorrowedEvent` (margin_manager.move:636) AND `Supplied` AND `HedgeMinted` are emitted in a single tx — proves atomicity.

**Action-trace JSON dump pattern** (CONTEXT.md "Action-trace JSON schema" Claude's Discretion):
```typescript
import { writeFileSync } from 'node:fs';
const trace = {
    vault_id: deploy.vault_id,
    package_id: deploy.package_id,
    actions: [
        {
            kind: 'supply',
            tx_digest: supplyResult.digest,
            ts_ms: Date.now(),
            args: { deposit_quote: SUPPLY_AMOUNT_MICRO.toString() },
            effects: { balance_delta: '...', shares_delta: '...', events: supplyResult.events },
        },
        // hedge_mint, roll, redeem_request, redeem_fulfill...
    ],
};
writeFileSync('backtest/traces/cycle-full.json', JSON.stringify(trace, null, 2));
```
**Apply:** The new `e2e-vault-cycle.ts` extension (or sibling script) emits this trace; Python `test_replay_parity.py` consumes it.

---

### `scripts/two-protocol-ptb-demo.sh` (controller, bash wrapper)

**Analog:** `scripts/e2e-vault-cycle.sh` (lines 1-84) — direct lineal analog

**Shell entry + FAST_FORWARD mode dispatch** (from `e2e-vault-cycle.sh:26-50`):
```bash
set -euo pipefail
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"
MODE="${FAST_FORWARD:-1}"
echo "==> e2e-vault-cycle.sh (FAST_FORWARD=${MODE})"

if [[ "${MODE}" == "1" ]]; then
  echo "==> Running Move integration tests (clock-warped, hermetic)..."
  (cd contracts && sui move test \
      --gas-limit 100000000000 \
      --filter integration_test \
      --skip-fetch-latest-git-deps)
  exit 0
fi
```
**Apply to two-protocol-ptb-demo.sh:** `FAST_FORWARD=1` runs `sui move test --filter ptb_capability_test` + `--filter liquidation_test` against the mock margin pool (hermetic, no live testnet). `FAST_FORWARD=0` runs `npx tsx ../scripts/two-protocol-ptb-demo.ts` (live testnet). Deploy-JSON check mirrors `e2e-vault-cycle.sh:56-72`.

---

### `contracts/tests/ptb_capability_test.move` (test, Move capability flow)

**Analog A:** `contracts/tests/integration_test.move` (lines 1-100) — test_scenario + clock-warp idiom
**Analog B:** `contracts/sources/share.move` (lines 53-62) — capability quarantine pattern

**Module header + test-only declaration** (from `integration_test.move:44-95`):
```move
#[test_only]
module deepvault::integration_test;

use deepbook_predict::market_key;
use deepvault::rebalance;
use deepvault::redeem;
use deepvault::share::{Self, SHARE};
use deepvault::strategy_constants;
use deepvault::supply;
use deepvault::vault::{Self, Vault, AdminCap};
use deepvault::vault_test::TEST_QUOTE;
use std::unit_test::assert_eq;
use sui::clock::{Self, Clock};
use sui::coin::{Self, Coin};
use sui::object;
use sui::test_scenario as ts;
use sui::test_utils::destroy;

// === Constants ===
const ADMIN: address = @0xA1;
const SUPPLIER: address = @0xB2;
```
**Apply:** Mirror imports + ADMIN/SUPPLIER constants. Add `LIQUIDATOR: address = @0xC3` for capability-flow adversarial tests.

**Capability-quarantine verification pattern** (from `share.move:53-62`):
```move
/// Unpack the PendingTreasury and return the inner TreasuryCap<SHARE>.
/// Visibility is `public(package)` — only `deepvault::vault::create_vault`
/// can consume the cap; the deployer never holds a free TreasuryCap.
public(package) fun consume_pending(pending: PendingTreasury): TreasuryCap<SHARE> {
    let PendingTreasury { id, cap } = pending;
    id.delete();
    cap
}
```
**Apply:** Tests must assert that (a) no public function in `mock_margin_pool` returns `TradeCap` by value, (b) no public function in `vault` returns `TreasuryCap<SHARE>` by value. The Move side of the test enforces this through the type system + the cross-language grep test (test_ptb_capability_grep.py) catches the regex case.

**Seeded-vault helper** (from `integration_test.move:81-94`):
```move
fun new_seeded_vault(
    scenario: &mut ts::Scenario,
): (Vault<TEST_QUOTE>, AdminCap, Clock) {
    share::init_for_testing(scenario.ctx());
    scenario.next_tx(ADMIN);
    let pending = scenario.take_from_sender<share::PendingTreasury>();
    let cap = share::consume_pending(pending);
    let seed_amt = strategy_constants::seed_quote_micro_units();
    let seed = coin::mint_for_testing<TEST_QUOTE>(seed_amt, scenario.ctx());
    let (vault, admin_cap) =
        vault::new_vault_for_testing<TEST_QUOTE>(cap, seed, scenario.ctx());
    let clock = clock::create_for_testing(scenario.ctx());
    (vault, admin_cap, clock)
}
```
**Apply:** Reuse this helper unchanged. Add `new_mock_margin_pool()` helper that constructs the mock pool (see `mock_margin_pool.move` analog below).

---

### `contracts/tests/mock_margin_pool.move` (test, Move test-only mock)

**Analog A:** `contracts/sources/predict_adapter.move` — thin-adapter pattern for an external protocol
**Analog B:** `contracts/tests/integration_test.move` — `#[test_only]` module discipline

**Test-only module header + minimal trait surface** (mock-pool design per CONTEXT.md D-18):
```move
#[test_only]
module deepvault::mock_margin_pool;

use deepvault::vault::{Vault};
use deepvault::share::SHARE;
use sui::coin::{Self, Coin};
use sui::test_scenario as ts;

public struct MockMarginPool<phantom Quote> has key, store {
    id: UID,
    registered_collateral_types: vector<vector<u8>>,  // type_name witness strings
    total_borrowed: u64,
    total_collateral_share_value: u64,
}

public fun register_collateral_type<Quote, Collat>(pool: &mut MockMarginPool<Quote>): bool { ... }
public fun borrow_quote_against_collateral<Quote, Collat>(
    pool: &mut MockMarginPool<Quote>,
    collat: Coin<Collat>,
    amount: u64,
    ctx: &mut TxContext,
): Coin<Quote> { ... }
public fun liquidate_position<Quote, Collat>(
    pool: &mut MockMarginPool<Quote>,
    borrower: address,
    shocked_nav_per_share: u64,
    ctx: &mut TxContext,
): Coin<Collat> { ... }
```
**Apply per CONTEXT.md Claude's Discretion §"Mock Margin pool":** Implements MINIMAL trait surface needed for the −30% NAV shock test. NOT a full Margin clone. Captures architectural readiness for VAULT_SHARE-as-collateral whitelist (D-18 documented-future path).

**Thin-adapter rationale** (from `predict_adapter.move` philosophy — the pattern of a thin Move module that wraps an external dependency):
The mock pool exists in `contracts/tests/` (NOT `contracts/sources/`) so production code never sees it. CI's per-push job (`sui move test --filter mock_margin_pool` or via `liquidation_test`) exercises it.

---

### `contracts/tests/liquidation_test.move` (test, Move −30% shock property test)

**Analog A:** `contracts/tests/integration_test.move` (lines 116-200) — test_scenario + supply simulation
**Analog B:** `contracts/tests/property_test.move` (lines 1-80) — property-test discipline
**Analog C:** `contracts/tests/ltv_test.move` (lines 80-100) — worst-case NAV simulation idiom

**−30% shock simulation pattern** (derived from `ltv_test.move:92-100` `worst_case_nav_per_share_pessimistically_assumes_hedges_worthless`):
```move
// Simulate "vault with open hedges": total_assets reflects the full
// deposit (incl. hedge cost basis), but vault.balance only holds the
// liquid 90%. Set up:
//   - total_assets = 20_000_000 (10M seed + 10M hypothetical extra deposit)
//   - balance = 18_000_000 (seed 10M + 8M of 10M extra; 2M went to hedge)
//   - total_shares = 2_000_000 (1M virtual + 1M minted to depositor)
//
// nav = 20_000_000 * 1e9 / 2_000_000 = 10_000_000_000 (10 quote/share)
// worst_case = 18_000_000 * 1e9 / 2_000_000 = 9_000_000_000 (9 quote/share)
```
**Apply to liquidation_test.move:** Per CONTEXT.md D-20:
1. Supply 1000 DUSDC via the simulated-supply path used in `integration_test.move:126-200`.
2. Buy hedge at SVI fair value (via mock or direct registry mutation).
3. Inject -30% NAV shock: `vault::inflate_liquid_for_testing` followed by drain, OR direct `vault::set_total_assets_for_testing` if available — produces `worst_case_nav_per_share` at 70% of initial.
4. Assert mock_margin_pool::liquidate_position triggers correctly.
5. Cross-assert `ltv::worst_case_nav_per_share(&vault) == python_vault_state.worst_case_nav()` within 1-wei (via JSON dump consumed by `test_replay_parity.py`).

**Expected-failure abort pattern** (from `integration_test.move:213-226`):
```move
// abort_code = 401 = rebalance::EPredictMisquote (constants are module-private in Move;
// hardcoded here so the cross-module reference compiles. Plan 02-04 W3 lock owns the
// number — if rebalance.move renumbers EPredictMisquote, update both sites in sync.)
#[test, expected_failure(abort_code = 401)]
fun atomic_supply_aborts_on_predict_misquote() {
    let mut scenario = ts::begin(ADMIN);
    let (vault, admin_cap, clock) = new_seeded_vault(&mut scenario);
    // The abort propagates through the supply PTB per D-07 atomicity.
    abort 401
}
```
**Apply:** If liquidation correctly bounds bad debt at zero, no abort needed. Negative test: liquidator with insufficient repayment coin → `mock_margin_pool::EInsufficientRepayment` abort (define + document the code).

---

### `.github/workflows/nightly-backtest.yml` (config, CI workflow)

**Analog A:** `.github/workflows/nightly-e2e-vault.yml` (lines 1-78) — cron + Sui CLI setup pattern
**Analog B:** `.github/workflows/nightly-prover.yml` (lines 1-93) — cron offset + artifact summary pattern

**Header doc-block + cron + permissions** (from `nightly-e2e-vault.yml:1-25`):
```yaml
# .github/workflows/nightly-e2e-vault.yml
# Nightly real-testnet E2E vault cycle (FAST_FORWARD=0).
#
# Performs the full 1h cooldown wait between redeem_request and
# redeem_fulfill. Too expensive for per-push CI — the per-push
# hermetic variant lives in ci.yml's e2e-vault job (FAST_FORWARD=1).
#
# Cron offset (04:00 UTC) is intentionally one hour past
# nightly-prover.yml (03:00 UTC) so the two nightlies do not contend
# for the same testnet RPC window or GitHub Actions runner pool.

name: Nightly E2E vault (real testnet)

on:
  schedule:
    - cron: '0 4 * * *'   # 04:00 UTC daily
  workflow_dispatch: {}

permissions:
  contents: read
```
**Apply to nightly-backtest.yml:** Cron `'0 5 * * *'` — 05:00 UTC (one hour past nightly-e2e-vault); explanatory comment about runner-pool contention. `workflow_dispatch: {}` for manual triggers. `permissions: { contents: read }`.

**Setup + run + summary step pattern** (from `nightly-prover.yml:36-93`):
```yaml
jobs:
  prover:
    name: sui-prover (2 specs)
    runs-on: ubuntu-latest
    timeout-minutes: 30          # generous for first runs; tighten after benchmarking
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Install Sui CLI (mainnet-v1.71.1)
        run: | [...]

      - name: Verify Sui version
        run: sui --version

      - name: Run sui-prover
        working-directory: contracts
        run: |
          set -euo pipefail
          echo "Running sui-prover on contracts/ — VAULT-10 nightly check"
          sui-prover

      - name: Prover summary
        if: success()
        run: |
          echo "Sui Prover passed: inflation_safe + nav_monotone specs verified."
```
**Apply to nightly-backtest.yml:** `timeout-minutes: 60` (365-day backtest is heavier than 2-spec prover). Steps: (1) Checkout, (2) Install uv, (3) `uv sync --locked --all-extras --dev` in `backtest/`, (4) `uv run python -m deepvault.replay --trace backtest/traces/cycle-full.json` (parity), (5) `uv run python -m deepvault.walk_forward --full-365d` (the load-bearing backtest), (6) Upload `backtest/report.html` as workflow artifact, (7) Summary block.

**Artifact upload pattern** (NOT present in current `nightly-*.yml` — `actions/upload-artifact@v4` is the canonical pattern):
```yaml
      - name: Upload HTML report artifact
        if: always()  # upload even on partial failure for triage
        uses: actions/upload-artifact@v4
        with:
          name: backtest-report-html
          path: backtest/report.html
          retention-days: 30
```
**Apply:** Single self-contained HTML file per D-12; gets attached to every nightly run.

---

### `.github/workflows/ci.yml` (MODIFIED — add backtest+ptb-grep steps)

**Analog:** existing `.github/workflows/ci.yml` (lines 138-165 python job; lines 78-105 capability-containment grep)

**Add a 7-day micro-fixture replay step inside `python` job** (extension after line 165):
```yaml
      - name: Test
        run: uv run pytest
      # NEW Phase 3:
      - name: 7-day micro-fixture replay parity (BACK-04 per-push gate)
        run: uv run pytest tests/test_replay_parity.py -k micro_fixture
```

**Add a PTB capability grep step inside `move` job** (extension after line 105):
```yaml
      - name: Capability containment grep (VAULT-10 lightweight check)
        run: | [...]
      # NEW Phase 3:
      - name: PTB capability flow grep (Phase 3 PTB-04)
        run: uv run --directory backtest python -m pytest tests/test_ptb_capability_grep.py
```

---

### `backtest/pyproject.toml` (MODIFIED — add plotly, jinja2)

**Analog:** existing `backtest/pyproject.toml` (lines 12-19)

**Existing dependencies block** (from `pyproject.toml:12-19`):
```toml
dependencies = [
  "numpy>=2.4",
  "pandas>=2.2",
  "scipy>=1.14",
  "pyarrow>=18",
  "matplotlib>=3.9",
  "requests>=2.32",
]
```
**Apply:** Add (sorted alphabetically):
```toml
  "jinja2>=3.1.6",
  "plotly>=5.20",
```

---

## Shared Patterns

### Cross-language Move↔Python parity discipline
**Source:** `backtest/src/deepvault/svi.py:1-31` + `backtest/src/deepvault/parity_runner.py:91-107`
**Apply to:** All `backtest/src/deepvault/*.py` mirroring Move (vault_state.py especially)

```python
"""Clones on-chain <module>.move::<function> (<module>.move:<lines>).
All inputs/outputs at FLOAT_SCALING = 1e9.

Source: contracts/sources/<module>.move:<lines>
SHA: 1159d79af33c70e09e406310e1d8f067832ede9d

Forbidden imports: math, numpy, scipy. Pure Python int.
"""
```
Every Python module mirroring Move semantics MUST cite the Move source file + commit SHA and declare the no-float discipline.

### Strategy constants come from codegen
**Source:** `backtest/src/deepvault/strategy_constants.py:1-7` (auto-generated header) + `scripts/codegen.py:22-34`
**Apply to:** vault_state.py, replay.py, walk_forward.py — all consume `strategy_constants` (`VIRTUAL_SHARES`, `NAV_SCALE`, `TENOR_SECONDS`, `ALLOCATION_BPS`, etc.) instead of hardcoding. The codegen-drift CI step (ci.yml:167-206) enforces parity with Move's `strategy_constants.move` and TS's `strategy_constants.ts`.

### Move test_scenario + clock-warp idiom
**Source:** `contracts/tests/integration_test.move:81-113` (`new_seeded_vault` helper + `cleanup`)
**Apply to:** `ptb_capability_test.move`, `liquidation_test.move`, `mock_margin_pool` usage tests

```move
fun new_seeded_vault(scenario: &mut ts::Scenario): (Vault<TEST_QUOTE>, AdminCap, Clock) {
    share::init_for_testing(scenario.ctx());
    scenario.next_tx(ADMIN);
    let pending = scenario.take_from_sender<share::PendingTreasury>();
    let cap = share::consume_pending(pending);
    let seed_amt = strategy_constants::seed_quote_micro_units();
    let seed = coin::mint_for_testing<TEST_QUOTE>(seed_amt, scenario.ctx());
    let (vault, admin_cap) = vault::new_vault_for_testing<TEST_QUOTE>(cap, seed, scenario.ctx());
    let clock = clock::create_for_testing(scenario.ctx());
    (vault, admin_cap, clock)
}

fun cleanup(vault: Vault<TEST_QUOTE>, admin_cap: AdminCap, clock: Clock) {
    vault::destroy_for_testing(vault);
    vault::destroy_admin_cap_for_testing(admin_cap);
    clock.destroy_for_testing();
}
```
The `clock.increment_for_testing(MS)` and `clock.set_for_testing(MS)` calls warp the simulated chain clock — load-bearing for the liquidation test's binary-resolution simulation.

### `ts::Scenario` next-tx address switching
**Source:** `contracts/tests/integration_test.move:266` (`scenario.next_tx(ROLLER);`) + `:178` (`scenario.next_tx(SUPPLIER);`)
**Apply to:** Any test exercising multi-party flows (PTB capability tests must switch between LIQUIDATOR, SUPPLIER, ADMIN).

### Test-only abort_code locking
**Source:** `contracts/tests/integration_test.move:213-216` (Plan 02-04 W3 lock pattern)
```move
// abort_code = 401 = rebalance::EPredictMisquote (constants are module-private in Move;
// hardcoded here so the cross-module reference compiles. Plan 02-04 W3 lock owns the
// number — if rebalance.move renumbers EPredictMisquote, update both sites in sync.)
#[test, expected_failure(abort_code = 401)]
```
**Apply to liquidation_test.move:** Any expected_failure test must inline the numeric abort code + cite the source module's lock owner.

### CI workflow consistency (Sui CLI install pattern, ubuntu-latest, cron offsets)
**Source:** `.github/workflows/ci.yml:46-58` (Sui CLI install block, repeated verbatim across jobs and workflows)
```yaml
- name: Install Sui CLI (mainnet-v1.71.1)
  run: |
    set -euo pipefail
    SUI_VERSION="mainnet-v1.71.1"
    ASSET="sui-${SUI_VERSION}-ubuntu-x86_64.tgz"
    URL="https://github.com/MystenLabs/sui/releases/download/${SUI_VERSION}/${ASSET}"
    curl -fsSL "${URL}" -o /tmp/sui.tgz
    mkdir -p "$HOME/.sui/bin"
    tar -xzf /tmp/sui.tgz -C "$HOME/.sui/bin"
    echo "$HOME/.sui/bin" >> "$GITHUB_PATH"
```
**Apply to nightly-backtest.yml:** Even though the backtest doesn't strictly need Sui CLI for the Python run, include the block if any step needs to verify mainnet/testnet state. If not needed, omit entirely for runtime.

### Capability-quarantine pattern (TreasuryCap / TradeCap)
**Source:** `contracts/sources/share.move:53-62` + `contracts/sources/vault.move:91-95`
**Apply to:** All new Move modules in `contracts/tests/` — especially `mock_margin_pool.move` (its internal `TradeCap` analog must follow the same `public(package) fun consume_pending` quarantine pattern).

The on-chain `TreasuryCap<SHARE>` lives inside the shared `Vault<Quote>` (vault.move:95: `treasury_cap: TreasuryCap<SHARE>`). No public accessor returns it by value — only `treasury_cap_mut` (public(package)) hands out `&mut TreasuryCap<SHARE>`. The capability-containment grep (ci.yml:96-105) enforces this at CI time.

---

## No Analog Found

| File | Role | Data Flow | Reason / Mitigation |
|------|------|-----------|--------------------|
| `backtest/notebooks/hand-recompute.ipynb` | notebook | one-off computation | No Jupyter notebooks exist in repo. Mitigation: planner cites D-07 directly; structure follows `test_gatheral_paper_vectors.py`'s explicit-hand-computation cells (lines 23-45 — paper-cite + step-by-step formula + expected value). Notebook produces same hand-recomputed PnL for 3 `np.random.choice`-selected trade rows; numbers must equal harness output to the wei. |

All other files have at least a partial analog identified above.

---

## Metadata

**Analog search scope:**
- `backtest/src/deepvault/` (Phase 1 modules)
- `backtest/tests/` (Phase 1 tests)
- `contracts/sources/` (Phase 2 vault package)
- `contracts/tests/` (Phase 2 tests — especially integration_test.move, property_test.move, ltv_test.move)
- `scripts/` (Phase 2 e2e drivers + Phase 0 codegen)
- `scripts/deepbookv3/packages/deepbook_margin/sources/` (Mysten-vendored Margin source for PTB design + mock-pool trait surface)
- `.github/workflows/` (existing CI/nightly workflows)

**Files scanned:** ~40 (Python, Move, TS, YAML, TOML)
**Strong analogs identified:** 22 files with named source + line-range citations
**Pattern extraction date:** 2026-05-11
**Cross-reference:** Cite the Mysten-vendored `1159d79a` SHA for any Move-side citation per repo convention (matches `svi.py:7`).

---
*Pattern mapping for Phase 3 — Backtest Harness + Two-Protocol PTB*
