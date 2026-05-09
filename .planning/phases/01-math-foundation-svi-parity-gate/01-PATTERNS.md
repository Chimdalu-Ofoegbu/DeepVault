# Phase 1: Math Foundation (SVI Parity Gate) - Pattern Map

**Mapped:** 2026-05-09
**Files analyzed:** 36 NEW files + 4 MODIFIED files
**Analogs found:** 38 / 40 (2 files have weak/no in-repo analog and reference RESEARCH.md examples)

## Notes on Analog Sources

Phase 1 has **two distinct analog sources**:

1. **Phase 0 in-repo files** — establish the project's idiomatic shape (codegen header, drift-check pattern, TOML schema, BigInt literal convention, CI job structure, commit-prefix policy). Use these for *project-shape* patterns.
2. **The vendored DeepBookV3 fork at `scripts/deepbookv3/packages/predict/sources/`** (HEAD `1159d79af33c70e09e406310e1d8f067832ede9d`) — is the **canonical algorithmic reference**. Phase 1's `helpers/{i64,isqrt,phi}.move`, `svi_view.move`, and the Python/TS clones reproduce this code line-for-line. Use these for *math/algorithm* patterns. The vendored source is read-only (it lives under `scripts/deepbookv3/`, not `contracts/sources/`); we do NOT import or modify it — we clone the algorithms into our own package, citing exact line numbers in `shared/svi-spec.md`.

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `shared/svi-spec.md` | spec/doc | static-doc | `CONTRIBUTING.md` (policy doc) + RESEARCH.md §"Op-order canonical form" | partial |
| `shared/cody_phi_coefficients.toml` | config | static-config | `shared/strategy.toml` | exact |
| `shared/golden-vectors.json` (modify) | config/data | static-config | `shared/golden-vectors.json` (Phase 0 stub `[]`) | exact |
| `shared/strategy.toml` (modify) | config | static-config | self (Phase 0; extend `[svi]` section) | exact |
| `scripts/codegen.py` (modify) | utility/codegen | transform | self (Phase 0; extend with `emit_phi_*` functions) | exact |
| `scripts/golden_emit.py` | utility/codegen | transform (computes + writes) | `scripts/codegen.py` | role-match |
| `contracts/sources/helpers/i64.move` | helper module | transform | `scripts/deepbookv3/.../helper/i64.move` (canonical clone target) | exact |
| `contracts/sources/helpers/isqrt.move` | helper module | transform | `scripts/deepbookv3/.../helper/math.move:266-292` (`sqrt_u128` + `sqrt_initial_guess_u128`) | exact |
| `contracts/sources/helpers/phi.move` | helper module | transform | `scripts/deepbookv3/.../helper/math.move:191-239` (`normal_cdf_u128`) | exact |
| `contracts/sources/phi_coefficients.move` | constants/codegen | static | `contracts/sources/strategy_constants.move` | exact |
| `contracts/sources/svi_view.move` | service/view | request-response (read OracleSVI → return u64 price) | `scripts/deepbookv3/.../oracle.move:400-429` (`compute_nd2`) | exact |
| `contracts/tests/golden_vectors_data.move` | test data/codegen | static | `contracts/sources/strategy_constants.move` (codegen shape) | role-match |
| `contracts/tests/svi_view_test.move` | test | request-response | `scripts/deepbookv3/.../tests/helper/rate_limiter_tests.move` (Move test idioms) | partial |
| `contracts/tests/phi_test.move` | test | request-response | `scripts/deepbookv3/.../tests/helper/rate_limiter_tests.move` | partial |
| `contracts/tests/isqrt_test.move` | test | request-response | `scripts/deepbookv3/.../tests/helper/rate_limiter_tests.move` | partial |
| `backtest/src/deepvault/isqrt.py` | utility | transform (pure fn) | `scripts/deepbookv3/.../helper/math.move:266-292` (clone target) + `backtest/src/deepvault/strategy_constants.py` (Python module shape) | exact |
| `backtest/src/deepvault/phi.py` | utility | transform (pure fn) | `scripts/deepbookv3/.../helper/math.move:191-239` (clone target) | exact |
| `backtest/src/deepvault/phi_coefficients.py` | constants/codegen | static | `backtest/src/deepvault/strategy_constants.py` | exact |
| `backtest/src/deepvault/svi.py` | service/utility | transform (pure fn) | `scripts/deepbookv3/.../oracle.move:400-429` (clone target) | exact |
| `backtest/src/deepvault/arb_checker.py` | service | transform (closed-form + grid + calendar) | RESEARCH.md §"Pattern 4: g(k) array" (no in-repo analog) | research-only |
| `backtest/src/deepvault/parity_runner.py` | utility/CLI | request-response (read JSON → assert) | `scripts/codegen.py` (CLI argparse + `--check` shape) | role-match |
| `backtest/tests/test_phi_against_scipy.py` | test | request-response | (no Phase 0 test analog; first pytest in repo) | research-only |
| `backtest/tests/test_isqrt.py` | test | request-response | (none) | research-only |
| `backtest/tests/test_svi_parity.py` | test | request-response (read JSON → assert) | (none) | research-only |
| `backtest/tests/test_gatheral_paper_vectors.py` | test | request-response | (none) | research-only |
| `backtest/tests/test_arb_checker.py` | test | request-response | (none) | research-only |
| `dashboard/src/lib/isqrt.ts` | utility | transform (pure fn) | `scripts/deepbookv3/.../helper/math.move:266-292` (clone target) + `dashboard/src/lib/strategy_constants.ts` (TS module shape) | exact |
| `dashboard/src/lib/phi.ts` | utility | transform (pure fn) | `scripts/deepbookv3/.../helper/math.move:191-239` (clone target) | exact |
| `dashboard/src/lib/phi_coefficients.ts` | constants/codegen | static | `dashboard/src/lib/strategy_constants.ts` | exact |
| `dashboard/src/lib/svi.ts` | service/utility | transform (pure fn) | `scripts/deepbookv3/.../oracle.move:400-429` (clone target) | exact |
| `dashboard/src/lib/arb_checker.ts` | service | transform | (mirrors `backtest/src/deepvault/arb_checker.py`) | research-only |
| `dashboard/src/lib/math.ts` | utility | transform | `scripts/deepbookv3/.../helper/math.move:295-297` (`mul_div_round_down`) | exact |
| `dashboard/src/lib/parity_runner.ts` | utility/CLI | request-response | (mirrors `backtest/src/deepvault/parity_runner.py`) | role-match |
| `dashboard/src/lib/__tests__/phi.test.ts` | test | request-response | (none) | research-only |
| `dashboard/src/lib/__tests__/isqrt.test.ts` | test | request-response | (none) | research-only |
| `dashboard/src/lib/__tests__/svi.test.ts` | test | request-response | (none) | research-only |
| `.github/workflows/ci.yml` (modify) | config/ci | event-driven | self (Phase 0; extend `parity` job content; preserve job NAME `parity`) | exact |
| `dashboard/vitest.config.ts` (or `vite.config.ts`) | config | static | (none — first config of its kind) | research-only |
| `dashboard/package.json` (modify) | config | static | self (Phase 0; replace `"test"` echo stub with `"vitest run"`) | exact |
| `CONTRIBUTING.md` (modify) | policy/doc | static-doc | self (Phase 0; mirror `POLICY:` section to add `MATH:` section) | exact |

---

## Pattern Assignments

### `shared/cody_phi_coefficients.toml` (config, static)

**Analog:** `shared/strategy.toml` (Phase 0)

**Schema-versioning + comment-block pattern** (`shared/strategy.toml` lines 1-12):

```toml
# shared/strategy.toml
# Single source of truth for cross-runtime constants.
# Edit this file, then run `make codegen` to regenerate the three constants files:
#   - contracts/sources/strategy_constants.move
#   - backtest/src/deepvault/strategy_constants.py
#   - dashboard/src/lib/strategy_constants.ts
#
# DO NOT edit the generated files directly — they are overwritten on next codegen.
# CI's `codegen-drift` job (Plan 07) fails the build if generated files are out of sync.

schema_version = 1
last_updated = "2026-05-09"
```

**Coefficient values to seed** — copy verbatim from `scripts/deepbookv3/packages/predict/sources/helper/math.move:31-65`:

```move
// Source: W.J. Cody (1969), as implemented in GSL gauss.c

// Small range (|x| < 0.66291): Φ(x) = 0.5 + x * P(x²) / Q(x²)
const SMALL_THRESHOLD: u128 = 662_910_000;
const A0: u128 = 2_235_252_035;
const A1: u128 = 161_028_231_069;
const A2: u128 = 1_067_689_485_460;
const A3: u128 = 18_154_981_253_344;
const A4: u128 = 65_682_338;
const B0: u128 = 47_202_581_905;
const B1: u128 = 976_098_551_738;
const B2: u128 = 10_260_932_208_619;
const B3: u128 = 45_507_789_335_027;
// ... (medium range coefficients C0..C8, D0..D7; large range threshold)
```

**Recommended TOML structure** (sections mirror Cody's three piecewise ranges):

```toml
schema_version = 1
last_updated = "2026-05-09"
source = "W.J. Cody (1969), as implemented in GSL gauss.c"
upstream_move = "scripts/deepbookv3/packages/predict/sources/helper/math.move:31-65"

[small]
threshold = 662_910_000

[small.numerator]   # P(x^2): A0..A4
a0 = 2_235_252_035
# ...

[small.denominator] # Q(x^2): B0..B3
b0 = 47_202_581_905
# ...

[medium]
threshold = 5_656_854_249

[medium.numerator]  # C0..C8
# ...

[medium.denominator] # D0..D7
# ...
```

---

### `shared/strategy.toml` (modify, config)

**Analog:** self (Phase 0)

**Existing `[svi]` section to extend** (`shared/strategy.toml` lines 44-48):

```toml
[svi]
# SSVI parameterization placeholders — Phase 1 fills full schema after Gatheral evaluator audit.
parameterization = "ssvi"
grid_points_for_arb_check = 200     # ≥200-point g(k) grid scan per MATH-04
strike_range_sigma = 4              # ±4σ around spot for arb scan
```

**Phase 1 modifications** (per CONTEXT.md re-routes D-01, D-10):
- Change `parameterization = "ssvi"` → `parameterization = "raw_svi_5param"`
- Add `scale = 9` (top-level inside `[svi]` per Open Question 3 recommendation), documenting that SVI math operates at 1e9 (FLOAT_SCALING) — not at the vault's 1e27 variance / 1e18 price scales which are for the vault NAV layer
- Add per-param bounds for `(a, b, rho, m, sigma)` (recommended defaults from Gatheral §4 / on-chain Predict's permissive ranges)
- Add `k_max_log_strike = 2_500_000_000` (max safe input domain at 1e9 → ±2.5)

**`[hedge_policy]` lock pattern** (lines 20-28) shows the conservative-comments style for any field that ties into a policy doc:

```toml
[hedge_policy]
# LOCKED per CONTEXT.md D-01..D-04 (Phase 0 commit, before backtest opens).
# Re-tunable ONLY in Phase 3 backtest on out-of-sample-aware walk-forward analysis.
# After Phase 3 close, FROZEN PERMANENTLY (see CONTRIBUTING.md §"Hedge-ratio policy is locked").
allocation_bps = 1000               # D-01: 10% of new deposit (10000 bps = 100%)
```

Mirror this for `[svi]`: cite the spec doc (`shared/svi-spec.md`) as the canonical lock target, and reference the on-chain `oracle.move:58-66` line range as the immutable upstream definition.

---

### `scripts/codegen.py` (modify, utility)

**Analog:** self (Phase 0)

**Existing emit-with-drift-check pattern** — the planner extends three things:

**1. Header block** (`scripts/codegen.py` lines 29-53) — Phase 1 reuses verbatim:

```python
HEADER_LINES_GENERIC = [
    "AUTO-GENERATED - DO NOT EDIT",
    "Source: shared/strategy.toml (schema_version {schema_version})",
    "Regenerate via: make codegen   (or: python scripts/codegen.py)",
]


def header_block(comment_prefix: str, schema_version: int) -> str:
    bar = comment_prefix + " " + "=" * 75
    lines = [bar]
    for line in HEADER_LINES_GENERIC:
        lines.append(comment_prefix + " " + line.format(schema_version=schema_version))
    lines.append(bar)
    return "\n".join(lines) + "\n"
```

**Phase 1 addition:** add a sibling `HEADER_LINES_PHI` constant whose `Source:` line points at `shared/cody_phi_coefficients.toml`. Do not change `header_block(...)` signature — just allow it to be called with either constant by extracting the constant list as a parameter.

**2. Move emitter shape** (`scripts/codegen.py` lines 56-103) — Phase 1's `emit_phi_move` mirrors:

```python
def emit_move(data: dict) -> str:
    sv = data["schema_version"]
    fp = data["fixed_point"]
    # ...
    parts = [header_block("//", sv)]
    parts.append("\nmodule deepvault::strategy_constants {\n")
    parts.append("    // Fixed-point scales\n")
    parts.append(f"    public fun decimals(): u8 {{ {fp['decimals']} }}\n")
    # ... one `public fun X(): TYPE { VALUE }` per constant ...
    parts.append("}\n")
    return "".join(parts)
```

**Phase 1 addition** — `emit_phi_move(data)` produces:

```move
// (header block)
module deepvault::phi_coefficients {
    public fun small_threshold(): u128 { 662_910_000 }
    public fun small_a0(): u128 { 2_235_252_035 }
    public fun small_a1(): u128 { 161_028_231_069 }
    // ... A2..A4, B0..B3 ...
    public fun medium_threshold(): u128 { 5_656_854_249 }
    public fun medium_c0(): u128 { 398_941_512 }
    // ... C1..C8, D0..D7 ...
}
```

**3. Python emitter shape** (`scripts/codegen.py` lines 106-148) — uses `Final[int]`:

```python
def emit_python(data: dict) -> str:
    parts = [header_block("#", sv)]
    parts.append('"""Strategy constants emitted from shared/strategy.toml."""\n')
    parts.append("from typing import Final\n\n")
    parts.append("# Fixed-point scales\n")
    parts.append(f"DECIMALS: Final[int] = {fp['decimals']}\n")
    # ...
```

**Phase 1 addition** — `emit_phi_python(data)` produces `phi_coefficients.py` with `SMALL_THRESHOLD: Final[int] = 662_910_000`, etc. Note: use Python int (not float, not numpy) per RESEARCH.md Pitfall A.

**4. TypeScript emitter shape** (`scripts/codegen.py` lines 151-189) — uses BigInt literal `n` suffix for u64-equivalent fields:

```python
def emit_typescript(data: dict) -> str:
    parts = [header_block("//", sv)]
    parts.append("\nexport const STRATEGY_CONSTANTS = {\n")
    # ...
    # u64-equivalent fields -> bigint literals to maintain parity with Move
    parts.append(f"  TENOR_SECONDS: {hp['tenor_seconds']}n,\n")
    parts.append(f"  ROLL_TRIGGER_SECONDS: {hp['roll_trigger_seconds']}n,\n")
```

**Phase 1 addition** — Cody Φ coefficients are u128 in Move; in TS they MUST emit with `n` suffix (BigInt literals): `SMALL_THRESHOLD: 662_910_000n`. Do NOT emit as `number` literals — RESEARCH.md Pitfall B documents the loss-of-precision risk.

**5. CLI / drift-check pattern** (`scripts/codegen.py` lines 197-230):

```python
def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="Drift check only - emit to stdout and exit nonzero if files differ from disk",
    )
    args = parser.parse_args()

    data = load_strategy()
    move_text = emit_move(data)
    py_text = emit_python(data)
    ts_text = emit_typescript(data)

    if args.check:
        any_drift = False
        for path, expected in (
            (MOVE_PATH, move_text),
            (PYTHON_PATH, py_text),
            (TS_PATH, ts_text),
        ):
            actual = path.read_text(encoding="utf-8") if path.exists() else ""
            if actual != expected:
                print(f"DRIFT: {path.relative_to(REPO_ROOT)}", file=sys.stderr)
                any_drift = True
        return 1 if any_drift else 0

    write(MOVE_PATH, move_text)
    write(PYTHON_PATH, py_text)
    write(TS_PATH, ts_text)
```

Phase 1 extends the tuple to include three additional pairs `(MOVE_PHI_PATH, move_phi_text)` etc. The single `--check` flag verifies all six files; CI's existing `codegen-drift` job picks them up automatically by adding the three new file paths to its `git diff --exit-code` check.

**6. File-write helper** (line 192-194) — LF newlines + final newline; never use `Bash(cat << 'EOF')`:

```python
def write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8", newline="\n")
```

---

### `scripts/golden_emit.py` (NEW, utility/codegen)

**Analog:** `scripts/codegen.py` (role-match — same emit-with-drift-check pattern; different output shape)

**Imports + entry-point** (mirror `scripts/codegen.py` lines 14-44):

```python
#!/usr/bin/env python3
"""Golden-vector emitter: paper inputs + stress generators + JackJacquier fixture
-> shared/golden-vectors.json + contracts/tests/golden_vectors_data.move.

Reuses the same emit-and-CI-drift-check pattern as scripts/codegen.py.

Invocations:
    python scripts/golden_emit.py          # regenerate
    python scripts/golden_emit.py --check  # drift check (exit 1 on diff)

CI integration: ci.yml `codegen-drift` job extends to also assert no drift on
shared/golden-vectors.json + contracts/tests/golden_vectors_data.move.
"""

from __future__ import annotations

import argparse
import json
import sys
import tomllib
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
JSON_PATH = REPO_ROOT / "shared" / "golden-vectors.json"
MOVE_DATA_PATH = REPO_ROOT / "contracts" / "tests" / "golden_vectors_data.move"
```

**Schema** (per CONTEXT.md D-16, integer hex strings — RESEARCH.md Pitfall E):

```python
def make_vector(id_: str, tier: str, source: str, inputs: dict, expected: dict) -> dict:
    return {
        "id": id_,
        "tier": tier,
        "source": source,
        "inputs": {k: hex(v) if isinstance(v, int) else v for k, v in inputs.items()},
        "expected": {k: hex(v) if isinstance(v, int) else v for k, v in expected.items()},
    }
```

**JSON emit** (per RESEARCH.md Pitfall G — sort_keys + LF + trailing newline):

```python
def emit_json(vectors: list[dict]) -> str:
    return json.dumps(vectors, indent=2, sort_keys=True, ensure_ascii=False) + "\n"


def write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8", newline="\n")
```

**Move companion data emit** (mirror `emit_move` shape from codegen.py — header + module + `vector<vector<u64>>` constants):

```python
def emit_move_data(vectors: list[dict]) -> str:
    parts = [header_block("//", schema_version=1)]
    parts.append("\nmodule deepvault::golden_vectors_data;\n\n")
    parts.append("public fun vector_count(): u64 { ")
    parts.append(f"{len(vectors)} }}\n\n")
    parts.append("public fun all_inputs(): vector<vector<u64>> {\n")
    parts.append("    vector[\n")
    for v in vectors:
        # Pack (a, b, rho_mag, rho_neg, m_mag, m_neg, sigma, k_mag, k_neg, F, K)
        parts.append(f"        vector[{...}],   // {v['id']} {v['source']}\n")
    parts.append("    ]\n")
    parts.append("}\n\n")
    parts.append("public fun all_expected_w(): vector<u64> { vector[ ... ] }\n")
    parts.append("public fun all_expected_binary_price(): vector<u64> { vector[ ... ] }\n")
    parts.append("public fun all_params_valid(): vector<bool> { vector[ ... ] }\n")
    return "".join(parts)
```

**CLI / drift-check** — paste the body of `codegen.py:main` (lines 197-230) verbatim, swap the file paths.

---

### `contracts/sources/helpers/i64.move` (helper module)

**Analog (algorithmic clone target):** `scripts/deepbookv3/packages/predict/sources/helper/i64.move`

**Module label + `use` block** (lines 1-9):

```move
// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/// Signed u64 magnitude with normalized zero.
module deepbook_predict::i64;

use deepbook::constants::max_u64;
use deepbook_predict::constants;
```

**Phase 1 adaptation:** change module label to `module deepvault::i64;` and import from `deepvault::strategy_constants` (or a NEW `deepvault::float_scaling_constants` if a 1e9 macro is needed for `mul_scaled` / `div_scaled`). Per CONTEXT.md Re-route D-10, our SVI math operates at FLOAT_SCALING = 1e9, matching on-chain. Provide a `float_scaling()` macro in a `deepvault::math_constants` module emitted by codegen, OR just inline the literal `1_000_000_000` as a `const` (clearer for parity audits). Recommended: emit a `deepvault::math_constants::float_scaling!()` macro from codegen so both `i64.move` and `phi.move` consume the same source value.

**Struct + ability set** (lines 13-16):

```move
public struct I64 has copy, drop, store {
    magnitude: u64,
    is_negative: bool,
}
```

**Zero-normalization invariant** (lines 30-53) — CRITICAL, do NOT skip:

```move
public fun zero(): I64 {
    I64 {
        magnitude: 0,
        is_negative: false,
    }
}

public fun from_u64(value: u64): I64 {
    I64 {
        magnitude: value,
        is_negative: false,
    }
}

public fun from_parts(magnitude: u64, is_negative: bool): I64 {
    if (magnitude == 0) {
        zero()              // <-- ALWAYS normalize zero to is_negative: false
    } else {
        I64 {
            magnitude,
            is_negative,
        }
    }
}
```

**Add/sub** (lines 66-80) — clone verbatim; the magnitude-comparison branch is the source-of-truth for sign-magnitude arithmetic:

```move
public fun add(a: &I64, b: &I64): I64 {
    if (a.is_negative == b.is_negative) {
        assert!(a.magnitude <= max_u64() - b.magnitude, EOverflow);
        from_parts(a.magnitude + b.magnitude, a.is_negative)
    } else if (a.magnitude >= b.magnitude) {
        from_parts(a.magnitude - b.magnitude, a.is_negative)
    } else {
        from_parts(b.magnitude - a.magnitude, b.is_negative)
    }
}
```

**`mul_scaled` / `div_scaled`** (lines 83-96) — these are the FLOAT_SCALING-aware ops `compute_nd2` calls; clone verbatim, only swapping the `constants::float_scaling!()` reference to our `deepvault::math_constants::float_scaling!()` (per RESEARCH.md A6 — `oracle.compute_price` is `public(package)`, so we cannot call into Predict's helpers from a different package; we must clone).

**Error constants — naming** (lines 10-11): use `EPascalCase` per `scripts/deepbookv3/.claude/rules/move.md` "Error Constants are in `EPascalCase`":

```move
const EOverflow: u64 = 0;
const EZeroDivisor: u64 = 1;
```

---

### `contracts/sources/helpers/isqrt.move` (helper module)

**Analog (algorithmic clone target):** `scripts/deepbookv3/packages/predict/sources/helper/math.move:266-292`

**Core algorithm** (clone verbatim):

```move
fun sqrt_u128(x: u128): u128 {
    if (x == 0) return 0;
    if (x < 4) return 1;
    let mut g = sqrt_initial_guess_u128(x);
    g = (g + x / g) / 2;
    g = (g + x / g) / 2;
    g = (g + x / g) / 2;
    g = (g + x / g) / 2;
    g = (g + x / g) / 2;
    g = (g + x / g) / 2;
    g = (g + x / g) / 2;
    if (g * g > x) { g = g - 1; };
    g
}

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

**Public API** — Phase 1 must expose `sqrt_u128` and the FLOAT_SCALING-aware `sqrt(x: u64, precision: u64): u64` (clone math.move:120-125):

```move
public fun sqrt(x: u64, precision: u64): u64 {
    assert!(precision > 0 && precision <= constants::float_scaling!(), EInvalidPrecision);
    let multiplier = (constants::float_scaling!() / precision) as u128;
    let scaled = (x as u128) * multiplier * F;
    (sqrt_u128(scaled) / multiplier) as u64
}
```

**Defense-in-depth comment** (per `.claude/rules/move.md`): "Don't remove a leaf-level underflow/overflow guard because the current caller validates first." Keep the `precision > 0` guard even though `svi_view::binary_price` always passes `float_scaling!()`.

---

### `contracts/sources/helpers/phi.move` (helper module)

**Analog (algorithmic clone target):** `scripts/deepbookv3/packages/predict/sources/helper/math.move:191-239`

**Public entry** (lines 109-116):

```move
/// Standard normal CDF Φ(x) using Cody's rational Chebyshev approximation.
/// Three piecewise ranges for high accuracy (~1e-15 in float, <5 units at 1e9).
public fun normal_cdf(x: &i64::I64): u64 {
    let x_mag = i64::magnitude(x);
    let x_negative = i64::is_negative(x);
    if (x_mag > 8 * constants::float_scaling!()) {
        return if (x_negative) { 0 } else { constants::float_scaling!() }
    };
    (normal_cdf_u128((x_mag as u128), x_negative) as u64)
}
```

**Internal Cody implementation** (lines 191-239) — clone verbatim, replace `A0..B3` / `C0..D7` references with calls into `deepvault::phi_coefficients::small_a0()` etc. (the codegen-emitted module):

```move
fun normal_cdf_u128(x: u128, x_negative: bool): u128 {
    if (x < SMALL_THRESHOLD) {
        // Small range: Φ(x) = 0.5 + x * P(x²) / Q(x²)
        let xsq = x * x / F;
        // Horner evaluation following GSL pattern
        let mut xnum = A4 * xsq / F;
        let mut xden = xsq;
        xnum = (xnum + A0) * xsq / F;
        xden = (xden + B0) * xsq / F;
        xnum = (xnum + A1) * xsq / F;
        xden = (xden + B1) * xsq / F;
        xnum = (xnum + A2) * xsq / F;
        xden = (xden + B2) * xsq / F;
        let ratio = (xnum + A3) * F / (xden + B3);
        let term = x * ratio / F;
        if (x_negative) { F / 2 - term } else { F / 2 + term }
    } else if (x < MEDIUM_THRESHOLD) {
        // Medium range: complement = exp(-x²/2) * P(|x|) / Q(|x|)
        // ... (lines 209-233; clone verbatim) ...
    } else {
        // Large range: |x| >= sqrt(32) ≈ 5.657, extreme tail
        if (x_negative) { 0 } else { F }
    }
}
```

**`exp_u128` / `exp_series_u128`** (lines 149-187) — needed for the medium-range Φ branch; clone verbatim. RESEARCH.md "Don't Hand-Roll" lists this as a clone target.

**Op-order discipline** (RESEARCH.md Pitfall D): the canonical form is `mul_div(a, b, c) = (a * b) / c`, NEVER `a * (b / c)`. Note the on-chain code already follows this; the `xnum = (xnum + A0) * xsq / F` line is exactly `mul_div((xnum + A0), xsq, F)`. In our spec doc, document each `* X / F` pattern as a `mul_div_round_down` invocation.

---

### `contracts/sources/phi_coefficients.move` (constants/codegen-emitted)

**Analog:** `contracts/sources/strategy_constants.move`

**Header + module shape** (lines 1-7):

```move
// ===========================================================================
// AUTO-GENERATED - DO NOT EDIT
// Source: shared/strategy.toml (schema_version 1)
// Regenerate via: make codegen   (or: python scripts/codegen.py)
// ===========================================================================

module deepvault::strategy_constants {
    // Fixed-point scales
    public fun decimals(): u8 { 18 }
```

**Phase 1 file shape** — `Source:` line points at `shared/cody_phi_coefficients.toml`:

```move
// ===========================================================================
// AUTO-GENERATED - DO NOT EDIT
// Source: shared/cody_phi_coefficients.toml (schema_version 1)
// Regenerate via: make codegen   (or: python scripts/codegen.py)
// ===========================================================================

module deepvault::phi_coefficients {
    // Small range threshold
    public fun small_threshold(): u128 { 662_910_000 }

    // Small range numerator (A0..A4)
    public fun small_a0(): u128 { 2_235_252_035 }
    public fun small_a1(): u128 { 161_028_231_069 }
    // ... etc ...
}
```

**Public-fun-per-constant pattern** (matches `strategy_constants.move:9-33`): no `const` declarations exposed to other modules; all access via accessor functions. This is the established Phase 0 pattern.

**Comment grouping** — every section gets a `//` comment describing the group, mirroring `strategy_constants.move` lines 8, 13, 19, 24, 28, 31:

```move
    // Fixed-point scales
    // Hedge policy (locked in CONTRIBUTING.md / docs/HEDGE-POLICY.md)
    // Token bucket
    // LTV
    // Oracle
    // SVI placeholders (Phase 1 may extend)
```

---

### `contracts/sources/svi_view.move` (service/view, request-response)

**Analog (algorithmic clone target):** `scripts/deepbookv3/packages/predict/sources/oracle.move:400-429` (`compute_nd2`)

**Module + imports** (mirror `oracle.move:10-15`):

```move
/// Read-only SVI evaluator: clones on-chain compute_nd2 line-for-line.
/// Consumes &OracleSVI ref + strike u64; returns binary call price u64.
/// Source: scripts/deepbookv3/packages/predict/sources/oracle.move:400-429
module deepvault::svi_view;

use deepbook_predict::{oracle::{Self, OracleSVI, SVIParams}};
use deepvault::{i64, math as deepvault_math};
```

**Function signature** (per CONTEXT.md re-route D-02, RESEARCH.md spike Finding 7):

```move
/// Binary pricing from SVI total variance:
/// - k = ln(strike / forward)
/// - w(k) = a + b * (rho * (k - m) + sqrt((k - m)^2 + sigma^2))
/// - d2 = -((k + w(k) / 2) / sqrt(w(k)))
public fun binary_price(oracle: &OracleSVI, strike: u64): u64 {
    let forward = oracle::forward_price(oracle);
    assert!(forward > 0, EZeroForward);

    let svi = oracle::svi(oracle);
    // ... (clone oracle.move:400-429 algorithm body verbatim, but using
    //      deepvault::math (our cloned phi/isqrt/ln) instead of
    //      deepbook_predict::math which is private to that package) ...
}
```

**Algorithmic body to clone** (oracle.move:400-429):

```move
fun compute_nd2(oracle: &OracleSVI, strike: u64): u64 {
    let forward = oracle.forward_price();
    assert!(forward > 0, EZeroForward);

    let svi = oracle.svi;

    // SVI: compute total variance from log-moneyness.
    let k = predict_math::ln(math::div(strike, forward));
    let k_minus_m = i64::sub(&k, &svi.m);
    let k_minus_m_squared = i64::square_scaled(&k_minus_m);
    let sigma_squared = math::mul(svi.sigma, svi.sigma);
    let sq = predict_math::sqrt(k_minus_m_squared + sigma_squared, constants::float_scaling!());
    let sq_i64 = i64::from_u64(sq);

    let rho_km = i64::mul_scaled(&svi.rho, &k_minus_m);
    let inner = i64::add(&rho_km, &sq_i64);
    assert!(!i64::is_negative(&inner), ECannotBeNegative);
    let total_var = svi.a + math::mul(svi.b, i64::magnitude(&inner));
    assert!(total_var > 0, EZeroVariance);

    // d2 = -((k + total_var/2) / sqrt(total_var)), then N(±d2).
    let sqrt_var = predict_math::sqrt(total_var, constants::float_scaling!());
    let sqrt_var_i64 = i64::from_u64(sqrt_var);
    let half_var_i64 = i64::from_u64(total_var / 2);
    let d2_numerator = i64::add(&k, &half_var_i64);
    let d2 = i64::div_scaled(&d2_numerator, &sqrt_var_i64);
    let d2 = i64::neg(&d2);

    predict_math::normal_cdf(&d2)
}
```

**Single-file blast radius pattern** (RESEARCH.md §"Pattern 2"): `svi_view::binary_price` is the ONLY function in `contracts/sources/` that imports `deepbook_predict::oracle::OracleSVI`. All Phase 1 internals (phi.move, isqrt.move, the SVI arithmetic) take `SVIParams` (or unpacked `(a, b, rho, m, sigma)`) directly. Phase 1 should ALSO expose:

```move
/// Same algorithm as binary_price but accepts unpacked params.
/// Used by golden-vector tests that don't have a real OracleSVI to feed in.
public fun binary_price_from_params(
    a: u64, b: u64, rho: i64::I64, m: i64::I64, sigma: u64,
    forward: u64, strike: u64,
): u64 {
    // ... same body, but svi is constructed locally from args ...
}

public fun total_variance_from_params(
    a: u64, b: u64, rho: i64::I64, m: i64::I64, sigma: u64,
    k: i64::I64,
): u64 { /* ... */ }
```

This split lets golden-vector tests target the params variant without faking an `OracleSVI` shared object.

**Error constants** (`oracle.move:19-25`):

```move
const EInvalidOracleCap: u64 = 0;
const EOracleAlreadyActive: u64 = 1;
const EOracleExpired: u64 = 2;
const EZeroForward: u64 = 3;
const ECannotBeNegative: u64 = 4;
const EZeroVariance: u64 = 5;
const EOracleSettled: u64 = 6;
```

Phase 1 uses a subset; `EZeroForward`, `ECannotBeNegative`, `EZeroVariance` carry over directly. Reuse the names — they match the on-chain semantics, which is the auditability lever.

---

### `contracts/tests/svi_view_test.move` + `phi_test.move` + `isqrt_test.move` (tests)

**Analog (project-shape):** `scripts/deepbookv3/packages/predict/tests/helper/rate_limiter_tests.move`

**Module label + `#[test_only]`** (lines 1-8):

```move
// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

#[test_only]
module deepbook_predict::rate_limiter_tests;

use deepbook_predict::rate_limiter;
use sui::clock;
```

**Setup helper** (lines 15-20) — Phase 1 svi_view_test.move follows the same pattern; for phi/isqrt tests, the simpler `dummy_ctx` shape from `scripts/deepbookv3/.claude/rules/move.md` "Do Not Use TestScenario Where Not Necessary":

```move
// good! there's a dummy context for simple cases
let ctx = &mut tx_context::dummy();
app::mint(ctx).destroy();
```

**Test naming + assertion idioms** (per `.claude/rules/move.md` + `unit-tests.md`):

```move
// Module is already named *_tests, so don't prefix functions with test_:
#[test]
fun this_feature_works() { /* ... */ }

// Use assert_eq! for value checks (unit-tests.md rule 10):
use std::unit_test::assert_eq;
assert_eq!(svi_view::binary_price(&oracle, strike), 500_000_000);  // exact value
```

**Golden-vector loading** (per RESEARCH.md MATH-02, A5): use the `contracts/tests/golden_vectors_data.move` companion file (codegen-emitted). Move test framework can't easily read JSON; the companion data file exposes `vector<vector<u64>>` constants. Loop through and assert each:

```move
#[test]
fun golden_vectors_all_pass() {
    let n = golden_vectors_data::vector_count();
    let inputs = golden_vectors_data::all_inputs();
    let expected_w = golden_vectors_data::all_expected_w();
    let mut i = 0;
    while (i < n) {
        let row = &inputs[i];
        // unpack (a, b, rho_mag, rho_neg, m_mag, m_neg, sigma, k_mag, k_neg, F, K)
        let actual = svi_view::total_variance_from_params(/* ... */);
        assert_eq!(actual, expected_w[i]);
        i = i + 1;
    };
}
```

(Per `.claude/rules/move.md` "Prefer explicit loop bounds over while (true)" — but a counter `while (i < n)` is fine because `n` is known.)

**Expected-failure tests** (`.claude/rules/move.md` + `unit-tests.md` rule 4):

```move
#[test, expected_failure(abort_code = deepvault::svi_view::ECannotBeNegative)]
fun rejects_arb_violating_inner() {
    // construct params where rho * (k-m) + sqrt(...) < 0
    let _ = svi_view::binary_price_from_params(/* ... */);
    abort  // guard with bare abort, not test_scenario::end
}
```

Per `unit-tests.md` rule 1: the expected values in `assert_eq!` must come from `golden_vectors_data` (codegen-emitted by `golden_emit.py`), NOT computed via `svi_view::*` itself (no circular logic).

---

### `backtest/src/deepvault/isqrt.py` (utility, transform)

**Analog (algorithmic):** `scripts/deepbookv3/.../helper/math.move:266-292` (already cited above)
**Analog (Python module shape):** `backtest/src/deepvault/strategy_constants.py`

**Module docstring + imports** (mirror RESEARCH.md §"Cloning on-chain Newton sqrt to Python"):

```python
"""Integer Newton-Raphson sqrt for u128 inputs.

Clone of deepbook_predict::math::sqrt_u128 + sqrt_initial_guess_u128.
See shared/svi-spec.md §"sqrt: bit-length seed + 7 unrolled Newton iterations".

Source: scripts/deepbookv3/packages/predict/sources/helper/math.move:266-292
SHA: 1159d79af33c70e09e406310e1d8f067832ede9d
"""
```

**Type discipline** (RESEARCH.md Pitfall A): all signatures `def f(x: int) -> int`. NO numpy. NO float. NO `math.sqrt` import.

**Reference implementation** (RESEARCH.md lines 587-635 — paste-ready):

```python
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

**Per RESEARCH.md Open Question 2:** the seed formula needs cross-check against Move's bit-shift sequence on 1000 random u128 inputs (Wave 0 task). Test belongs in `tests/test_isqrt.py`.

---

### `backtest/src/deepvault/phi.py` (utility, transform)

**Analog (algorithmic):** `scripts/deepbookv3/.../helper/math.move:191-239`

**Module docstring + imports**:

```python
"""Standard normal CDF using Cody's 1969 rational Chebyshev approximation.

Three piecewise ranges; ~1e-15 accuracy in float, ~5 units at 1e9 fixed-point.
Bit-equal output with on-chain normal_cdf_u128.

Source: scripts/deepbookv3/packages/predict/sources/helper/math.move:191-239
SHA: 1159d79af33c70e09e406310e1d8f067832ede9d
"""

from .phi_coefficients import (
    SMALL_THRESHOLD, A0, A1, A2, A3, A4, B0, B1, B2, B3,
    MEDIUM_THRESHOLD, C0, C1, C2, C3, C4, C5, C6, C7, C8,
    D0, D1, D2, D3, D4, D5, D6, D7,
)

F: int = 1_000_000_000  # FLOAT_SCALING — must match deepvault::math_constants::float_scaling
LN2: int = 693_147_180  # ln(2) * F
```

**Cody Φ body** — clone the Move `normal_cdf_u128` (lines 191-239) line-for-line into Python `int` arithmetic:

```python
def normal_cdf(x: int) -> int:
    """Φ(x) where x is signed Python int at FLOAT_SCALING. Returns u64-equivalent int.

    Args:
        x: Signed log-moneyness or d2, in 1e9 fixed-point. Sign indicates < 0 vs >= 0.

    Returns:
        Φ(x) at 1e9 fixed-point in [0, 1_000_000_000].
    """
    x_negative = x < 0
    x_mag = -x if x_negative else x
    if x_mag > 8 * F:
        return 0 if x_negative else F
    return _normal_cdf_u128(x_mag, x_negative)


def _normal_cdf_u128(x: int, x_negative: bool) -> int:
    if x < SMALL_THRESHOLD:
        # Small range: Φ(x) = 0.5 + x * P(x²) / Q(x²)
        xsq = x * x // F
        xnum = A4 * xsq // F
        xden = xsq
        xnum = (xnum + A0) * xsq // F
        xden = (xden + B0) * xsq // F
        xnum = (xnum + A1) * xsq // F
        xden = (xden + B1) * xsq // F
        xnum = (xnum + A2) * xsq // F
        xden = (xden + B2) * xsq // F
        ratio = (xnum + A3) * F // (xden + B3)
        term = x * ratio // F
        return F // 2 - term if x_negative else F // 2 + term
    elif x < MEDIUM_THRESHOLD:
        # Medium range: clone math.move:209-233 ... (Horner P/Q + exp(-x²/2))
        ...
    else:
        # Large: clamp
        return 0 if x_negative else F
```

**Op-order discipline** (RESEARCH.md Pitfall D): use `//` truncating division everywhere. Each `* x // F` IS the canonical `mul_div_round_down(num, x, F)`. Never refactor to `* (x / F)`.

---

### `backtest/src/deepvault/phi_coefficients.py` (constants/codegen-emitted)

**Analog:** `backtest/src/deepvault/strategy_constants.py`

**Header + Final[int] declarations** (`strategy_constants.py` lines 1-19):

```python
# ===========================================================================
# AUTO-GENERATED - DO NOT EDIT
# Source: shared/strategy.toml (schema_version 1)
# Regenerate via: make codegen   (or: python scripts/codegen.py)
# ===========================================================================
"""Strategy constants emitted from shared/strategy.toml."""
from typing import Final

# Fixed-point scales
DECIMALS: Final[int] = 18
VARIANCE_DECIMALS: Final[int] = 27
SHARE_DECIMALS: Final[int] = 9
```

**Phase 1 emits**:

```python
# ===========================================================================
# AUTO-GENERATED - DO NOT EDIT
# Source: shared/cody_phi_coefficients.toml (schema_version 1)
# Regenerate via: make codegen   (or: python scripts/codegen.py)
# ===========================================================================
"""Cody 1969 normal-CDF coefficients (clone of helper/math.move:31-65)."""
from typing import Final

# Small range threshold (|x| < 0.66291)
SMALL_THRESHOLD: Final[int] = 662_910_000

# Small range numerator P(x²)
A0: Final[int] = 2_235_252_035
A1: Final[int] = 161_028_231_069
A2: Final[int] = 1_067_689_485_460
A3: Final[int] = 18_154_981_253_344
A4: Final[int] = 65_682_338

# Small range denominator Q(x²)
B0: Final[int] = 47_202_581_905
# ...
```

Use `Final[int]` (not float, not numpy). All values come from the TOML codegen source.

---

### `backtest/src/deepvault/svi.py` (service/utility)

**Analog (algorithmic):** `scripts/deepbookv3/.../oracle.move:400-429`
**Analog (Python module shape):** `backtest/src/deepvault/strategy_constants.py`

**Module docstring** (RESEARCH.md lines 638-687 — paste-ready):

```python
"""Raw SVI total variance evaluator.

Clones on-chain oracle.move::compute_nd2.
All inputs/outputs at FLOAT_SCALING = 1e9.

Source: scripts/deepbookv3/packages/predict/sources/oracle.move:400-429
SHA: 1159d79af33c70e09e406310e1d8f067832ede9d
"""
from typing import NamedTuple
from .isqrt import isqrt_u128
from .phi import normal_cdf

F: int = 1_000_000_000  # FLOAT_SCALING
```

**SVIParams type** (mirrors on-chain `oracle.move:72-83`):

```python
class SVIParams(NamedTuple):
    a: int          # u64, ≥ 0
    b: int          # u64, ≥ 0
    rho: int        # signed (-F, +F)
    m: int          # signed
    sigma: int      # u64, > 0
```

**total_variance** (RESEARCH.md lines 662-687) — clones `oracle.move:400-417`:

```python
def total_variance(svi: SVIParams, k: int) -> int:
    """w(k) = a + b * (rho * (k - m) + sqrt((k - m)^2 + sigma^2))."""
    k_minus_m = k - svi.m
    k_minus_m_sq = (k_minus_m * k_minus_m) // F
    sigma_sq = (svi.sigma * svi.sigma) // F
    sq = isqrt_u128((k_minus_m_sq + sigma_sq) * F)
    rho_km = (svi.rho * k_minus_m) // F
    inner = rho_km + sq
    if inner < 0:
        raise ValueError("SVI inner term negative — invalid params")
    w = svi.a + (svi.b * inner) // F
    if w == 0:
        raise ValueError("Total variance is zero")
    return w
```

**binary_price** clones `oracle.move:420-428`:

```python
def binary_price(svi: SVIParams, forward: int, strike: int) -> int:
    """Theoretical binary call price at FLOAT_SCALING.

    Caller must ensure forward > 0 and strike on-grid (Phase 2 vault.rebalance concern).
    """
    if forward <= 0:
        raise ValueError("forward must be > 0")
    k = ln_signed(strike * F // forward)  # see svi.ln helper
    w = total_variance(svi, k)
    sqrt_var = isqrt_u128(w * F)
    half_var = w // 2
    d2_numerator = k + half_var
    d2 = -(d2_numerator * F // sqrt_var)  # signed truncating divide
    return normal_cdf(d2)
```

**Type-assert in tests** (RESEARCH.md Pitfall A): every test asserts `isinstance(result, int)`.

---

### `backtest/src/deepvault/arb_checker.py` (service)

**Analog:** RESEARCH.md §"Pattern 4: g(k) array as visible diagnostic" + §"g(k) formula" (research-only — no in-repo analog because Phase 0 ships no off-chain checkers).

**g(k) formula** (RESEARCH.md lines 432-441):

```
For raw SVI w(k) = a + b * (rho * (k - m) + sqrt((k - m)^2 + sigma^2)):
w'(k)  = b * (rho + (k - m) / sqrt((k - m)^2 + sigma^2))
w''(k) = b * sigma^2 / ((k - m)^2 + sigma^2)^(3/2)
g(k) = (1 - k * w'(k) / (2 * w(k)))^2 - (w'(k))^2 / 4 * (1/w(k) + 1/4) + w''(k) / 2
```

**Module shape** (project convention from `strategy_constants.py`):

```python
"""Arb-free checker: closed-form butterfly bound + 200-pt g(k) grid + calendar test.

Off-chain only (Move evaluator hard-rejects on closed-form alone per CONTEXT.md D-05).
Returns full g(k) array for dashboard visualization (MATH-04 lever).

Source: Gatheral & Jacquier (2014) §3.2 + on-chain bound check (CONTEXT.md D-04).
"""
from typing import NamedTuple
import numpy as np   # ALLOWED here (visualization-bound, not parity-bound)

from .strategy_constants import SVI_GRID_POINTS_FOR_ARB_CHECK, SVI_STRIKE_RANGE_SIGMA
from .svi import SVIParams, total_variance


class ArbResult(NamedTuple):
    params_valid: bool
    min_g_k: int        # at FLOAT_SCALING
    calendar_pass: bool # currently a no-op stub returning True (single-tenor; CONTEXT.md re-route)
    g_k: list[int]      # length >= SVI_GRID_POINTS_FOR_ARB_CHECK; integers at FLOAT_SCALING
```

**Type-discipline boundary** (RESEARCH.md Pitfall A): numpy is allowed inside the grid sampler for vector math, but **the output is converted to Python `int` before serialization or comparison.** The parity_runner asserts `all(isinstance(x, int) for x in result.g_k)`.

---

### `backtest/src/deepvault/parity_runner.py` (utility/CLI)

**Analog:** `scripts/codegen.py` (role-match — same argparse + read-and-assert shape)

**Module docstring + entry-point** (mirror codegen.py:1-13, 197-230):

```python
#!/usr/bin/env python3
"""Parity runner: read shared/golden-vectors.json, evaluate via deepvault.svi,
   assert each (w, binary_price, params_valid) matches expected.

Invocation:
    python -m deepvault.parity_runner             # full check, exit 1 on mismatch
    python -m deepvault.parity_runner --first N   # only first N vectors (debug)

CI integration: ci.yml `parity` job runs this after move/ts/python/codegen-drift pass.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .svi import SVIParams, binary_price, total_variance

REPO_ROOT = Path(__file__).resolve().parents[3]
JSON_PATH = REPO_ROOT / "shared" / "golden-vectors.json"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--first", type=int, default=None)
    args = parser.parse_args()

    vectors = json.loads(JSON_PATH.read_text(encoding="utf-8"))
    if args.first:
        vectors = vectors[: args.first]

    failures: list[str] = []
    for v in vectors:
        # Parse hex strings (RESEARCH.md Pitfall E)
        inputs = {k: int(s, 16) if isinstance(s, str) else s for k, s in v["inputs"].items()}
        expected = {k: int(s, 16) if isinstance(s, str) else s for k, s in v["expected"].items()}
        svi = SVIParams(a=inputs["a"], b=inputs["b"], rho=inputs["rho"], m=inputs["m"], sigma=inputs["sigma"])
        actual_w = total_variance(svi, inputs["k"])
        if actual_w != expected["w"]:
            failures.append(f"{v['id']}: w mismatch (expected {expected['w']:#x}, got {actual_w:#x})")
        # ... binary_price comparison ...

    if failures:
        for f in failures:
            print(f"FAIL {f}", file=sys.stderr)
        return 1
    print(f"OK: {len(vectors)} vectors pass.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

---

### `backtest/tests/test_*.py` (5 test files)

**Analog:** None in repo (Phase 0's `backtest/tests/__init__.py` is the only tests file). Use RESEARCH.md §"Wave 0 Gaps" as the recipe.

**pytest discovery convention:** Phase 0 wired `uv run pytest` in CI (`.github/workflows/ci.yml:117`); discovery defaults to `tests/test_*.py`. Use that filename pattern.

**Standard pytest test shape** (per `pyproject.toml` pinning `pytest>=8.3`):

```python
"""SVI parity test: read golden-vectors.json, assert Python evaluator matches expected."""
import json
from pathlib import Path

import pytest

from deepvault.svi import SVIParams, total_variance, binary_price

REPO_ROOT = Path(__file__).resolve().parents[2]
JSON_PATH = REPO_ROOT / "shared" / "golden-vectors.json"


@pytest.fixture(scope="module")
def vectors():
    return json.loads(JSON_PATH.read_text(encoding="utf-8"))


def test_total_variance_parity(vectors):
    for v in vectors:
        inputs = _parse_hex(v["inputs"])
        expected = _parse_hex(v["expected"])
        svi = SVIParams(**{k: inputs[k] for k in ("a", "b", "rho", "m", "sigma")})
        actual = total_variance(svi, inputs["k"])
        assert actual == expected["w"], f"{v['id']}: w mismatch"
        assert isinstance(actual, int)  # Pitfall A guard
```

**For `test_phi_against_scipy.py`** (cross-check; CONTEXT.md D-09):

```python
"""Cross-check Cody Φ against scipy.stats.norm.cdf within 1e-7 tolerance.

scipy is the ground truth here; our Cody clone is the unit under test.
This is the ONLY test file allowed to import scipy in evaluator code paths
(Pitfall A: scipy must NEVER be imported by deepvault.svi or deepvault.phi).
"""
import scipy.stats

from deepvault.phi import normal_cdf, F


@pytest.mark.parametrize("x_float", [-3.0, -1.0, -0.5, 0.0, 0.5, 1.0, 2.0, 3.0])
def test_cody_matches_scipy(x_float: float) -> None:
    x_int = int(x_float * F)
    actual = normal_cdf(x_int) / F   # convert to float ONLY for cross-check display
    expected = scipy.stats.norm.cdf(x_float)
    assert abs(actual - expected) < 1e-7
```

---

### `dashboard/src/lib/isqrt.ts` + `phi.ts` + `svi.ts` + `phi_coefficients.ts` + `math.ts`

**Analog (algorithmic):** Same as Python — `scripts/deepbookv3/.../helper/math.move` + `oracle.move:400-429`
**Analog (TS module shape):** `dashboard/src/lib/strategy_constants.ts`

**TS module shape** (`strategy_constants.ts` lines 1-37):

```typescript
// ===========================================================================
// AUTO-GENERATED - DO NOT EDIT
// Source: shared/strategy.toml (schema_version 1)
// Regenerate via: make codegen   (or: python scripts/codegen.py)
// ===========================================================================

export const STRATEGY_CONSTANTS = {
  // Fixed-point scales
  DECIMALS: 18,
  VARIANCE_DECIMALS: 27,
  SHARE_DECIMALS: 9,

  // u64-equivalent fields -> bigint literals to maintain parity with Move
  TENOR_SECONDS: 1209600n,
  ROLL_TRIGGER_SECONDS: 172800n,
} as const;
```

**Critical pattern: `n` suffix for u64-equivalents** (lines 16-17). Phase 1's `phi_coefficients.ts` MUST emit every coefficient with `n` suffix because they fit u128 — no `Number` literals (RESEARCH.md Pitfall B):

```typescript
export const PHI_COEFFICIENTS = {
  SMALL_THRESHOLD: 662_910_000n,
  A0: 2_235_252_035n,
  A1: 161_028_231_069n,
  // ...
  C8: 11n,
} as const;
```

**math.ts canonical helper** (RESEARCH.md lines 691-698 — paste-ready):

```typescript
// dashboard/src/lib/math.ts
// Canonical mul-div helper. ALL svi.ts arithmetic uses this; never inline `a*b/c`.
// See shared/svi-spec.md §"Op-order canonical form".

export function mulDivRoundDown(a: bigint, b: bigint, c: bigint): bigint {
  return (a * b) / c;
}
```

This mirrors `scripts/deepbookv3/.../helper/math.move:295-297` (`mul_div_round_down`):

```move
public fun mul_div_round_down(a: u64, b: u64, c: u64): u64 {
    ((a as u128) * (b as u128) / (c as u128)) as u64
}
```

**isqrt.ts** — translate the Python isqrt module to BigInt:

```typescript
// Source: scripts/deepbookv3/packages/predict/sources/helper/math.move:266-292
// SHA: 1159d79af33c70e09e406310e1d8f067832ede9d

export function isqrtInitialGuess(x: bigint): bigint {
  if (x === 0n) return 0n;
  let bits = 0n;
  let val = x;
  if (val >= 1n << 64n) { val >>= 64n; bits += 64n; }
  if (val >= 1n << 32n) { val >>= 32n; bits += 32n; }
  if (val >= 1n << 16n) { val >>= 16n; bits += 16n; }
  if (val >= 1n << 8n) { val >>= 8n; bits += 8n; }
  if (val >= 1n << 4n) { val >>= 4n; bits += 4n; }
  if (val >= 1n << 2n) { val >>= 2n; bits += 2n; }
  if (val >= 1n << 1n) { bits += 1n; }
  return 1n << ((bits + 1n) / 2n);
}

export function isqrtU128(x: bigint): bigint {
  if (x === 0n) return 0n;
  if (x < 4n) return 1n;
  let g = isqrtInitialGuess(x);
  g = (g + x / g) / 2n;
  g = (g + x / g) / 2n;
  g = (g + x / g) / 2n;
  g = (g + x / g) / 2n;
  g = (g + x / g) / 2n;
  g = (g + x / g) / 2n;
  g = (g + x / g) / 2n;
  if (g * g > x) g -= 1n;
  return g;
}
```

**Forbidden patterns** (RESEARCH.md Pitfall B): no `Number(...)`, no `parseFloat`, no `Math.sqrt`. CI greps for `Number(` in `dashboard/src/lib/{svi,phi,isqrt}.ts` and fails on match.

---

### `dashboard/src/lib/__tests__/*.test.ts`

**Analog:** None in repo (Phase 0 ships test stub: `dashboard/package.json:8` is `"test": "echo 'Phase 4 fills this in' && exit 0"`).

**Vitest + dashboard config:** Phase 1 must:
1. Add `vitest` + `@types/node` (or whatever Vitest needs in a non-Vite TS workspace) to `dashboard/package.json` devDependencies via pnpm.
2. Replace `dashboard/package.json:8` `"test": "echo ..."` with `"test": "vitest run"`.
3. Add a minimal `dashboard/vitest.config.ts` (since dashboard has no Vite config yet — Phase 4's frontend scaffold lands later). Recommended:

```typescript
// dashboard/vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/lib/__tests__/**/*.test.ts'],
    globals: true,
  },
});
```

**Test file shape** (Vitest convention; per CLAUDE.md Stack `vitest >= 4.1`):

```typescript
// dashboard/src/lib/__tests__/svi.test.ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { totalVariance, binaryPrice, type SVIParams } from '../svi';

const REPO_ROOT = resolve(__dirname, '../../../..');
const VECTORS = JSON.parse(readFileSync(resolve(REPO_ROOT, 'shared/golden-vectors.json'), 'utf-8'));

describe('SVI parity', () => {
  it.each(VECTORS)('%s: total_variance bit-equal', (v) => {
    const inputs = parseHex(v.inputs);
    const expected = parseHex(v.expected);
    const svi: SVIParams = { a: inputs.a, b: inputs.b, rho: inputs.rho, m: inputs.m, sigma: inputs.sigma };
    const actual = totalVariance(svi, inputs.k);
    expect(actual).toBe(expected.w);   // BigInt equality
    expect(typeof actual).toBe('bigint'); // Pitfall B guard
  });
});
```

`parseHex` parses every `"0x..."` string via `BigInt(s)` (Pitfall E).

---

### `.github/workflows/ci.yml` (modify)

**Analog:** self (Phase 0)

**Existing parity job stub** (lines 151-168) — Phase 1 wires the actual content while preserving the `parity` job NAME (CONTRIBUTING.md:72 requires this for branch protection):

```yaml
  parity:
    name: Three-way golden-vector parity (Phase 0 stub)   # <-- Phase 1 rename
    runs-on: ubuntu-latest
    needs: [move, ts, python, codegen-drift]
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      # Phase 0 SCAFFOLD: vectors file is empty []. Job exists but is a no-op.
      # Phase 1 (MATH-05) wires the actual cross-runtime parity check here:
      #   - invoke Move test runner that loads vectors and asserts on chain
      #   - run python -m deepvault.parity_runner against vectors
      #   - run pnpm -r exec tsx scripts/parity_runner.ts against vectors
      #   - assert all three runtimes produce identical output within tolerance
      - name: Phase 0 stub — assert vectors file exists
        run: |
          test -f shared/golden-vectors.json
          echo "Phase 0 parity stub OK (empty vectors). Phase 1 MATH-05 wires the actual cross-runtime check."
```

**Phase 1 wiring** — replace the stub step with three steps. Reuse the install patterns from existing jobs:
- For Sui CLI install: copy lines 34-49 (`Install Sui CLI (mainnet-v1.71.1)` + `Verify Sui version`) verbatim
- For uv: copy lines 100-105 (`Install uv` block)
- For pnpm: copy lines 66-79 (`Install pnpm` + `Install Node 22` + `Install (frozen lockfile)`)

```yaml
  parity:
    name: parity   # <-- KEEP exact job NAME for branch protection (CONTRIBUTING.md §"Branch strategy")
    runs-on: ubuntu-latest
    needs: [move, ts, python, codegen-drift]
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      # ... copy install steps from `move`, `python`, `ts` jobs ...

      - name: Python parity runner
        working-directory: backtest
        run: uv run python -m deepvault.parity_runner

      - name: TypeScript parity runner
        working-directory: dashboard
        run: pnpm exec tsx src/lib/parity_runner.ts

      - name: Move golden vectors test
        working-directory: contracts
        run: sui move test --gas-limit 100000000000 --filter golden_vectors
```

**Codegen-drift job extension** (lines 119-149) — Phase 1 adds three more files to the `git diff --exit-code` list:

```yaml
      - name: Verify no drift
        run: |
          if ! git diff --exit-code --stat \
              contracts/sources/strategy_constants.move \
              backtest/src/deepvault/strategy_constants.py \
              dashboard/src/lib/strategy_constants.ts \
              contracts/sources/phi_coefficients.move \
              backtest/src/deepvault/phi_coefficients.py \
              dashboard/src/lib/phi_coefficients.ts \
              shared/golden-vectors.json \
              contracts/tests/golden_vectors_data.move; then
            echo "::error::generated files out of sync — run 'make codegen' AND 'python scripts/golden_emit.py' locally and commit the regenerated files."
            exit 1
          fi
```

**Job-name preservation** (CONTRIBUTING.md:72): the existing job key is `parity` (line 151) and `name:` is `Three-way golden-vector parity (Phase 0 stub)` (line 152). Branch protection in GitHub binds against the **job key** (`parity`) — keep that. The display `name:` field can be updated; Phase 1 should update it to `Three-way golden-vector parity` (drop "Phase 0 stub").

---

### `CONTRIBUTING.md` (modify)

**Analog:** self (Phase 0)

**`POLICY:` prefix section to mirror** (`CONTRIBUTING.md` lines 87-92):

```markdown
## Commit log conventions

- Subject: imperative mood, ≤72 chars (e.g., "feat(vault): add token-bucket refill cap")
- Reference REQ-IDs where relevant (e.g., "closes SETUP-08")
- For policy changes: include "POLICY: ..." prefix and link the relevant ADR
```

**And the hedge-policy lock pattern** (lines 42-56) — POLICY changes are paired with `docs/HEDGE-POLICY.md` updates and a `POLICY:` commit prefix.

**Phase 1 addition** — add a new `## 6. Math foundation is locked` section under "Hard policy locks" (after the section 5 weekly-Predict-sweep block at line 68), mirroring the hedge-policy structure:

```markdown
### 6. SVI math layer is locked to the on-chain reference

The SVI math primitives (Φ, sqrt, raw-SVI evaluator, op order, fixed-point scale) are cloned line-for-line from the vendored DeepBookV3 fork at SHA `1159d79af33c70e09e406310e1d8f067832ede9d`. Bit-equality with the on-chain Predict implementation is **the** Phase 1 deliverable — see `shared/svi-spec.md` §"Whitepaper claim ladder".

Numbers come from `shared/cody_phi_coefficients.toml` (Cody 1969 coefficients) and `shared/strategy.toml [svi]`. Both files are **MATH:** policy. Once Phase 1 closes (CI parity job green on 120 vectors), the spec doc, op order, and coefficient tables are frozen until submission.

**MATH:** changes (analogous to Phase 0's POLICY: prefix) require:
1. A `MATH:` commit-message prefix
2. A paired update to `shared/svi-spec.md` justifying the change
3. Re-running `python scripts/golden_emit.py` and committing the regenerated vectors
4. CI's `parity` job staying green
```

**Update the commit-conventions section** (line 91):

```markdown
- For policy changes: include "POLICY: ..." prefix and link the relevant ADR
- For SVI math changes: include "MATH: ..." prefix and link the relevant section of shared/svi-spec.md
```

---

### `shared/svi-spec.md` (NEW, spec/doc)

**Analog:** `CONTRIBUTING.md` (Phase 0 — for the lock-block voice and ADR-style structure) — partial match.

**Section structure** (no exact in-repo analog; pull structure from RESEARCH.md):

1. **Op-order canonicalization** — RESEARCH.md Pitfall D ("All multiply-then-divide expressions use the form `mul_div_round_down(a, b, c) = (a * b) / c`. Never `a * (b / c)` even if it appears equivalent.")
2. **Φ approximation** — Cody 1969 with citation: `scripts/deepbookv3/packages/predict/sources/helper/math.move:31-65, 191-239`. Source comment from line 32: `// Source: W.J. Cody (1969), as implemented in GSL gauss.c`.
3. **sqrt rule** — `bit-length seed + 7 unrolled Newton iterations + final overshoot correction`. Cite `helper/math.move:266-292`.
4. **Max safe input domain** — `k ∈ [-2.5, 2.5]` at 1e9 (i.e., `±2_500_000_000`). RESEARCH.md Open Question 5.
5. **Formula derivation** — D-08 binary-price formula at r=0; cite Gatheral 2014 §2.
6. **Whitepaper claim ladder** — D-19 phrasing: "Bit-equal across 3 runtimes on 120 vectors at 10⁻⁹ including 20 from Gatheral & Jacquier 2014, all algorithms cloned line-for-line from the audited on-chain Predict implementation (SHA `1159d79af33c70e09e406310e1d8f067832ede9d`)."
7. **Sign convention** — RESEARCH.md Finding 6: "Move uses `i64::I64` explicitly; Python/TS use signed primitives. Zero is positive (`is_negative: false`) — this is the on-chain normalization."
8. **MATH: commit-prefix policy** — pointer to CONTRIBUTING.md §6 (above).

---

## Shared Patterns

These cross-cutting patterns apply to ALL relevant Phase 1 files. Plans for individual files should reference this section by name rather than re-citing.

### A. Codegen header + drift-check (applies to: `phi_coefficients.{move,py,ts}`, `golden-vectors.json`, `golden_vectors_data.move`)

**Source:** `scripts/codegen.py:29-53` (`HEADER_LINES_GENERIC` + `header_block`)
**Apply to:** All emitted files

Every codegen-emitted file starts with the `=` separator + 3 lines (`AUTO-GENERATED`, `Source: ...`, `Regenerate via: ...`) + `=` separator. The comment prefix is per-runtime (`#` Python, `//` Move/TS, `// ` for JSON via wrapper). The Phase 0 pattern enforces:
- LF line endings (`newline="\n"` in `path.write_text(...)`)
- Final newline at EOF
- Deterministic key order (Python dict insertion order is stable; for JSON use `sort_keys=True` per RESEARCH.md Pitfall G)

CI's `codegen-drift` job runs the emitter and `git diff --exit-code` on each output path. Phase 1 simply adds three more file paths to the existing job (no new job, no new pattern).

### B. Type discipline at the parity boundary (applies to: all `*.py`, `*.ts`, `*.move` evaluator code)

**Source:** RESEARCH.md Pitfalls A, B, C, E (all four address parity-killing bugs)
**Apply to:** `isqrt.py`, `phi.py`, `svi.py`, `arb_checker.py`, `parity_runner.py` AND their `.ts`/`.move` counterparts

**Python:**
- All function signatures `def f(x: int) -> int`
- No `numpy` import in `svi.py`/`phi.py`/`isqrt.py` (only `arb_checker.py` may import numpy, and only for the visualization-bound g(k) array; outputs converted to Python `int` before serialization)
- `scipy.stats.norm.cdf` only in `tests/test_phi_against_scipy.py`
- Tests: `assert isinstance(result, int)` after every parity-bound call

**TypeScript:**
- All function signatures `: bigint` return types
- All numeric literals use `n` suffix
- Forbidden: `Number(...)`, `parseFloat(...)`, `Math.sqrt(...)`
- CI grep step in `parity` job: `grep -E "Number\(|parseFloat\(" dashboard/src/lib/{svi,phi,isqrt}.ts && exit 1 || exit 0`

**Move:**
- u64 inputs/outputs, u128 intermediates (RESEARCH.md re-route D-13)
- Use `i64::I64` for signed quantities (`k`, `rho`, `m`, `d2`)
- Match on-chain naming and structure exactly so cross-package audits are trivial

### C. Op-order canonical form (applies to: all evaluator code)

**Source:** RESEARCH.md Pitfall D + `scripts/deepbookv3/.../helper/math.move:294-306` (`mul_div_round_down` / `mul_div_round_up`)
**Apply to:** Every `*` followed by `/` in evaluator code

**Helper triple:**
- Move: `predict::math::mul_div_round_down(a, b, c)` (existing on-chain) — Phase 1 clones this into `deepvault::math::mul_div_round_down`
- Python: `def mul_div(a: int, b: int, c: int) -> int: return (a * b) // c`
- TypeScript: `mulDivRoundDown(a: bigint, b: bigint, c: bigint): bigint { return (a * b) / c; }`

**Comment-style requirement** from `scripts/deepbookv3/.claude/rules/code-review.md`: "Math comments must match the actual function being called. If the code calls `mul_div_round_down(a, b, c)`, write `a * b / c`, not an invented two-step expression."

### D. Single-file blast radius for Predict ABI churn (applies to: `svi_view.move`)

**Source:** RESEARCH.md §"Pattern 2" + the existing Phase 2 plan for `vault::predict_adapter`
**Apply to:** `contracts/sources/svi_view.move` ONLY

`svi_view::binary_price(oracle: &OracleSVI, strike: u64) → u64` is the ONLY function in `contracts/sources/` that imports `deepbook_predict::oracle::OracleSVI`. All Phase 1 internals (phi.move, isqrt.move, the SVI arithmetic in `binary_price_from_params`) take unpacked params directly. If Predict's `OracleSVI` field naming or `oracle::svi(...)` accessor changes, only `svi_view.move`'s signature shim changes.

### E. Move test discipline (applies to: all `contracts/tests/*_test.move`)

**Source:** `scripts/deepbookv3/.claude/rules/move.md` + `unit-tests.md`
**Apply to:** `svi_view_test.move`, `phi_test.move`, `isqrt_test.move`

- Tests in module `*_tests` (plural) do NOT prefix function names with `test_` (rule)
- Use `assert_eq!` from `std::unit_test`, not `assert!`
- Every `expected_failure` test has a trailing `abort` guard with a different code (rule)
- Expected values come from independent ground-truth (`golden_vectors_data` codegen-emitted, NOT `svi_view::*` itself — the no-circular-logic rule)
- Use `tx_context::dummy()` not `test_scenario` for pure math (rule)
- Error constant naming: `EPascalCase` (rule)

### F. JSON schema discipline (applies to: `golden-vectors.json`)

**Source:** RESEARCH.md Pitfalls E and G + CONTEXT.md D-16
**Apply to:** `shared/golden-vectors.json` and any test code that loads it

- All integers stored as hex strings: `"k": "0x..."`. Never decimal (large ints lose precision in some JSON parsers).
- Loader uses `int(s, 16)` (Python) / `BigInt(s)` (TypeScript) / `vector::from_hex` (Move).
- Loader assertions: `assert isinstance(loaded_k, int)` immediately after parse.
- Emitter (`golden_emit.py`) calls `json.dumps(data, indent=2, sort_keys=True, ensure_ascii=False) + "\n"`.
- LF line endings, final newline (Phase 0 codegen pattern).

### G. Branch-protection-stable CI job names (applies to: `.github/workflows/ci.yml`)

**Source:** `CONTRIBUTING.md:72` ("required status checks: move, ts, python, codegen-drift, parity")
**Apply to:** Any modification of `ci.yml`

The five job KEYS (`move`, `ts`, `python`, `codegen-drift`, `parity`) are bound to GitHub branch protection. Phase 1 must NOT rename any of them. Display `name:` strings can be updated. Adding new steps inside an existing job is fine.

### H. POLICY/MATH commit-prefix discipline (applies to: any change to locked configs)

**Source:** `CONTRIBUTING.md:42-56` (POLICY: prefix for `[hedge_policy]`)
**Apply to:** Future changes to `shared/svi-spec.md`, `shared/cody_phi_coefficients.toml`, `shared/strategy.toml [svi]` after Phase 1 closes

Phase 1 introduces the `MATH:` prefix as a parallel mechanism to `POLICY:` for SVI math changes. CONTRIBUTING.md is the file that documents both prefixes.

---

## No Analog Found

No file in this phase truly lacks an analog — the algorithmic clones (3 sources from the vendored Predict source) and the project-shape clones (Phase 0 codegen + CI + module skeletons) cover every file. Two file groups are weak in-repo and rely on RESEARCH.md examples:

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `backtest/src/deepvault/arb_checker.py` + `dashboard/src/lib/arb_checker.ts` | service | transform | No off-chain checker exists in the project today; Phase 0 ships zero analog. The g(k) closed-form formula in Gatheral 2014 §3.2 (RESEARCH.md lines 432-441) is the algorithmic source. Project-shape patterns from `deepvault.svi`/`svi.ts` apply. |
| All `backtest/tests/test_*.py` and `dashboard/src/lib/__tests__/*.test.ts` | test | request-response | Phase 0 ships only `backtest/tests/__init__.py` (a 1-line file) and a Vitest test stub in `dashboard/package.json`. Use the recipes in this PATTERNS.md §"Pattern Assignments" + RESEARCH.md §"Wave 0 Gaps". |

---

## Metadata

**Analog search scope:**
- `scripts/codegen.py`, `shared/strategy.toml`, `shared/golden-vectors.json` (Phase 0 codegen anchors)
- `contracts/sources/strategy_constants.move`, `backtest/src/deepvault/strategy_constants.py`, `dashboard/src/lib/strategy_constants.ts` (Phase 0 emitted files — module-shape templates)
- `contracts/sources/`, `contracts/tests/` (Phase 0 left only `.gitkeep` here)
- `backtest/src/deepvault/`, `backtest/tests/` (Phase 0 has only `__init__.py`)
- `dashboard/src/lib/`, `dashboard/src/lib/__tests__/` (Phase 0 has only `strategy_constants.ts`)
- `.github/workflows/ci.yml` (Phase 0 5-job matrix)
- `CONTRIBUTING.md` (POLICY: prefix template)
- `scripts/deepbookv3/packages/predict/sources/{oracle.move, oracle_config.move, predict.move, helper/math.move, helper/i64.move, helper/constants.move}` (vendored canonical algorithmic source, HEAD `1159d79af33c70e09e406310e1d8f067832ede9d`)
- `scripts/deepbookv3/packages/predict/tests/helper/rate_limiter_tests.move` (Move test idioms)
- `scripts/deepbookv3/.claude/rules/{move.md, code-review.md, unit-tests.md}` (Move convention rules)

**Files scanned:** 22 (Phase 0 + vendored Predict reference)

**Pattern extraction date:** 2026-05-09
