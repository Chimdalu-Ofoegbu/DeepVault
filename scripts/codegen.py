#!/usr/bin/env python3
"""Codegen: shared/strategy.toml -> Move/Python/TS constants files.

Reads the single source of truth at shared/strategy.toml and emits three
generated files, each with a "DO NOT EDIT" header naming the source.

Invocations:
    python scripts/codegen.py          # regenerate (no args)
    python scripts/codegen.py --check  # drift check only (exits 1 on diff)

CI integration: ci.yml `codegen-drift` job runs `python scripts/codegen.py`
followed by `git diff --exit-code` on the three target files (Plan 07).
"""

from __future__ import annotations

import argparse
import sys
import tomllib
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
TOML_PATH = REPO_ROOT / "shared" / "strategy.toml"

MOVE_PATH = REPO_ROOT / "contracts" / "sources" / "strategy_constants.move"
PYTHON_PATH = REPO_ROOT / "backtest" / "src" / "deepvault" / "strategy_constants.py"
TS_PATH = REPO_ROOT / "dashboard" / "src" / "lib" / "strategy_constants.ts"

# Phi (Cody 1969) coefficient table (Plan 01-02 extension).
PHI_TOML_PATH = REPO_ROOT / "shared" / "cody_phi_coefficients.toml"
PHI_MOVE_PATH = REPO_ROOT / "contracts" / "sources" / "phi_coefficients.move"
PHI_PYTHON_PATH = REPO_ROOT / "backtest" / "src" / "deepvault" / "phi_coefficients.py"
PHI_TS_PATH = REPO_ROOT / "dashboard" / "src" / "lib" / "phi_coefficients.ts"

HEADER_LINES_GENERIC = [
    "AUTO-GENERATED - DO NOT EDIT",
    "Source: shared/strategy.toml (schema_version {schema_version})",
    "Regenerate via: make codegen   (or: python scripts/codegen.py)",
]

HEADER_LINES_PHI = [
    "AUTO-GENERATED - DO NOT EDIT",
    "Source: shared/cody_phi_coefficients.toml (schema_version {schema_version})",
    "Regenerate via: make codegen   (or: python scripts/codegen.py)",
]


def load_strategy() -> dict:
    with TOML_PATH.open("rb") as f:
        data = tomllib.load(f)
    if data.get("schema_version") != 2:
        raise SystemExit(
            f"codegen.py: unexpected schema_version {data.get('schema_version')!r} "
            f"in {TOML_PATH}; codegen.py supports schema_version=2"
        )
    return data


def load_phi() -> dict:
    with PHI_TOML_PATH.open("rb") as f:
        data = tomllib.load(f)
    if data.get("schema_version") != 1:
        raise SystemExit(
            f"codegen.py: unexpected schema_version {data.get('schema_version')!r} "
            f"in {PHI_TOML_PATH}; codegen.py supports schema_version=1"
        )
    return data


def header_block(
    comment_prefix: str, schema_version: int, lines: list[str] | None = None
) -> str:
    if lines is None:
        lines = HEADER_LINES_GENERIC
    bar = comment_prefix + " " + "=" * 75
    out = [bar]
    for line in lines:
        out.append(comment_prefix + " " + line.format(schema_version=schema_version))
    out.append(bar)
    return "\n".join(out) + "\n"


def emit_move(data: dict) -> str:
    sv = data["schema_version"]
    fp = data["fixed_point"]
    hp = data["hedge_policy"]
    tb = data["token_bucket"]
    infl = data["inflation_defense"]
    ltv = data["ltv"]
    oracle = data["oracle"]
    red = data["redemption"]
    svi = data["svi"]

    parts = [header_block("//", sv)]
    parts.append("\nmodule deepvault::strategy_constants {\n")
    parts.append("    // Fixed-point scales\n")
    parts.append(f"    public fun decimals(): u8 {{ {fp['decimals']} }}\n")
    parts.append(f"    public fun variance_decimals(): u8 {{ {fp['variance_decimals']} }}\n")
    parts.append(f"    public fun share_decimals(): u8 {{ {fp['share_decimals']} }}\n")
    parts.append("\n    // Hedge policy (locked in CONTRIBUTING.md / docs/HEDGE-POLICY.md)\n")
    parts.append(f"    public fun allocation_bps(): u64 {{ {hp['allocation_bps']} }}\n")
    parts.append(f"    public fun strike_otm_bps(): u64 {{ {hp['strike_otm_bps']} }}\n")
    parts.append(f"    public fun tenor_seconds(): u64 {{ {hp['tenor_seconds']} }}\n")
    parts.append(f"    public fun roll_trigger_seconds(): u64 {{ {hp['roll_trigger_seconds']} }}\n")
    parts.append(
        f"    public fun max_price_premium_bps(): u64 "
        f"{{ {hp['max_price_premium_bps']} }}\n"
    )
    parts.append("\n    // Token bucket (absolute u64; matches helpers/rate_limiter.move)\n")
    parts.append(
        f"    public fun token_bucket_capacity(): u64 "
        f"{{ {tb['capacity_quote_micro_units']} }}\n"
    )
    parts.append(
        f"    public fun token_bucket_refill_rate_per_ms(): u64 "
        f"{{ {tb['refill_rate_quote_micro_units_per_ms']} }}\n"
    )
    parts.append("\n    // Inflation defense (OpenZeppelin ERC-4626 v5)\n")
    parts.append(
        f"    public fun seed_quote_micro_units(): u64 "
        f"{{ {infl['seed_quote_micro_units']} }}\n"
    )
    parts.append(
        f"    public fun virtual_shares(): u64 "
        f"{{ {infl['virtual_shares']} }}\n"
    )
    parts.append("\n    // NAV scale (matches Phase 1 D-14/D-15 1e9 fixed-point)\n")
    parts.append("    public fun nav_scale(): u64 { 1_000_000_000 }\n")
    parts.append("\n    // LTV\n")
    parts.append(f"    public fun margin_ltv_cap_bps(): u64 {{ {ltv['margin_ltv_cap_bps']} }}\n")
    parts.append(
        f"    public fun worst_case_settlement_haircut_bps(): u64 "
        f"{{ {ltv['worst_case_settlement_haircut_bps']} }}\n"
    )
    parts.append("\n    // Oracle\n")
    parts.append(
        f"    public fun max_staleness_seconds(): u64 {{ {oracle['max_staleness_seconds']} }}\n"
    )
    parts.append("\n    // Redemption (1h cooldown between redeem_request and redeem_fulfill)\n")
    parts.append(
        f"    public fun redemption_cooldown_ms(): u64 "
        f"{{ {red['cooldown_ms']} }}\n"
    )
    parts.append("\n    // SVI (locked per re-routes D-01, D-10, D-13, D-14)\n")
    parts.append(f'    public fun svi_parameterization(): vector<u8> {{ b"{svi["parameterization"]}" }}\n')
    parts.append(f"    public fun svi_scale(): u8 {{ {svi['scale']} }}\n")
    parts.append(f"    public fun svi_grid_points_for_arb_check(): u64 {{ {svi['grid_points_for_arb_check']} }}\n")
    parts.append(f"    public fun svi_strike_range_sigma(): u64 {{ {svi['strike_range_sigma']} }}\n")
    parts.append(f"    public fun svi_k_max_log_strike(): u64 {{ {svi['k_max_log_strike']} }}\n")
    parts.append(f"    public fun svi_a_max(): u64 {{ {svi['a_max']} }}\n")
    parts.append(f"    public fun svi_b_max(): u64 {{ {svi['b_max']} }}\n")
    parts.append(f"    public fun svi_sigma_min(): u64 {{ {svi['sigma_min']} }}\n")
    parts.append(f"    public fun svi_sigma_max(): u64 {{ {svi['sigma_max']} }}\n")
    parts.append(f"    public fun svi_m_abs_max(): u64 {{ {svi['m_abs_max']} }}\n")
    parts.append("}\n")
    return "".join(parts)


def emit_python(data: dict) -> str:
    sv = data["schema_version"]
    fp = data["fixed_point"]
    hp = data["hedge_policy"]
    tb = data["token_bucket"]
    infl = data["inflation_defense"]
    ltv = data["ltv"]
    oracle = data["oracle"]
    red = data["redemption"]
    svi = data["svi"]

    parts = [header_block("#", sv)]
    parts.append('"""Strategy constants emitted from shared/strategy.toml."""\n')
    parts.append("from typing import Final\n\n")
    parts.append("# Fixed-point scales\n")
    parts.append(f"DECIMALS: Final[int] = {fp['decimals']}\n")
    parts.append(f"VARIANCE_DECIMALS: Final[int] = {fp['variance_decimals']}\n")
    parts.append(f"SHARE_DECIMALS: Final[int] = {fp['share_decimals']}\n\n")
    parts.append("# Hedge policy (locked in CONTRIBUTING.md / docs/HEDGE-POLICY.md)\n")
    parts.append(f"ALLOCATION_BPS: Final[int] = {hp['allocation_bps']}\n")
    parts.append(f"STRIKE_OTM_BPS: Final[int] = {hp['strike_otm_bps']}\n")
    parts.append(f"TENOR_SECONDS: Final[int] = {hp['tenor_seconds']}\n")
    parts.append(f"ROLL_TRIGGER_SECONDS: Final[int] = {hp['roll_trigger_seconds']}\n")
    parts.append(f'SIZING_FUNCTION: Final[str] = "{hp["sizing_function"]}"\n')
    parts.append(f"MAX_PRICE_PREMIUM_BPS: Final[int] = {hp['max_price_premium_bps']}\n\n")
    parts.append("# Token bucket (absolute u64; matches helpers/rate_limiter.move)\n")
    parts.append(
        f"TOKEN_BUCKET_CAPACITY: Final[int] = {tb['capacity_quote_micro_units']}\n"
    )
    parts.append(
        f"TOKEN_BUCKET_REFILL_RATE_PER_MS: Final[int] = "
        f"{tb['refill_rate_quote_micro_units_per_ms']}\n\n"
    )
    parts.append("# Inflation defense (OpenZeppelin ERC-4626 v5)\n")
    parts.append(
        f"SEED_QUOTE_MICRO_UNITS: Final[int] = {infl['seed_quote_micro_units']}\n"
    )
    parts.append(f"VIRTUAL_SHARES: Final[int] = {infl['virtual_shares']}\n\n")
    parts.append("# NAV scale (matches Phase 1 D-14/D-15 1e9 fixed-point)\n")
    parts.append("NAV_SCALE: Final[int] = 1_000_000_000\n\n")
    parts.append("# LTV\n")
    parts.append(f"MARGIN_LTV_CAP_BPS: Final[int] = {ltv['margin_ltv_cap_bps']}\n")
    parts.append(
        f"WORST_CASE_SETTLEMENT_HAIRCUT_BPS: Final[int] = "
        f"{ltv['worst_case_settlement_haircut_bps']}\n\n"
    )
    parts.append("# Oracle\n")
    parts.append(f"MAX_STALENESS_SECONDS: Final[int] = {oracle['max_staleness_seconds']}\n\n")
    parts.append("# Redemption (1h cooldown between redeem_request and redeem_fulfill)\n")
    parts.append(f"REDEMPTION_COOLDOWN_MS: Final[int] = {red['cooldown_ms']}\n\n")
    parts.append("# SVI (locked per re-routes D-01, D-10, D-13, D-14)\n")
    parts.append(f'SVI_PARAMETERIZATION: Final[str] = "{svi["parameterization"]}"\n')
    parts.append(f"SVI_SCALE: Final[int] = {svi['scale']}\n")
    parts.append(f"SVI_GRID_POINTS_FOR_ARB_CHECK: Final[int] = {svi['grid_points_for_arb_check']}\n")
    parts.append(f"SVI_STRIKE_RANGE_SIGMA: Final[int] = {svi['strike_range_sigma']}\n")
    parts.append(f"SVI_K_MAX_LOG_STRIKE: Final[int] = {svi['k_max_log_strike']}\n")
    parts.append(f"SVI_A_MAX: Final[int] = {svi['a_max']}\n")
    parts.append(f"SVI_B_MAX: Final[int] = {svi['b_max']}\n")
    parts.append(f"SVI_SIGMA_MIN: Final[int] = {svi['sigma_min']}\n")
    parts.append(f"SVI_SIGMA_MAX: Final[int] = {svi['sigma_max']}\n")
    parts.append(f"SVI_M_ABS_MAX: Final[int] = {svi['m_abs_max']}\n")
    return "".join(parts)


def emit_typescript(data: dict) -> str:
    sv = data["schema_version"]
    fp = data["fixed_point"]
    hp = data["hedge_policy"]
    tb = data["token_bucket"]
    infl = data["inflation_defense"]
    ltv = data["ltv"]
    oracle = data["oracle"]
    red = data["redemption"]
    svi = data["svi"]

    parts = [header_block("//", sv)]
    parts.append("\nexport const STRATEGY_CONSTANTS = {\n")
    parts.append("  // Fixed-point scales\n")
    parts.append(f"  DECIMALS: {fp['decimals']},\n")
    parts.append(f"  VARIANCE_DECIMALS: {fp['variance_decimals']},\n")
    parts.append(f"  SHARE_DECIMALS: {fp['share_decimals']},\n\n")
    parts.append("  // Hedge policy (locked in CONTRIBUTING.md / docs/HEDGE-POLICY.md)\n")
    parts.append(f"  ALLOCATION_BPS: {hp['allocation_bps']},\n")
    parts.append(f"  STRIKE_OTM_BPS: {hp['strike_otm_bps']},\n")
    # u64-equivalent fields -> bigint literals to maintain parity with Move
    parts.append(f"  TENOR_SECONDS: {hp['tenor_seconds']}n,\n")
    parts.append(f"  ROLL_TRIGGER_SECONDS: {hp['roll_trigger_seconds']}n,\n")
    parts.append(f"  SIZING_FUNCTION: '{hp['sizing_function']}' as const,\n")
    parts.append(f"  MAX_PRICE_PREMIUM_BPS: {hp['max_price_premium_bps']},\n\n")
    parts.append("  // Token bucket (absolute u64; matches helpers/rate_limiter.move)\n")
    parts.append(f"  TOKEN_BUCKET_CAPACITY: {tb['capacity_quote_micro_units']}n,\n")
    parts.append(
        f"  TOKEN_BUCKET_REFILL_RATE_PER_MS: "
        f"{tb['refill_rate_quote_micro_units_per_ms']}n,\n\n"
    )
    parts.append("  // Inflation defense (OpenZeppelin ERC-4626 v5)\n")
    parts.append(f"  SEED_QUOTE_MICRO_UNITS: {infl['seed_quote_micro_units']}n,\n")
    parts.append(f"  VIRTUAL_SHARES: {infl['virtual_shares']}n,\n\n")
    parts.append("  // NAV scale (matches Phase 1 D-14/D-15 1e9 fixed-point)\n")
    parts.append("  NAV_SCALE: 1_000_000_000n,\n\n")
    parts.append("  // LTV\n")
    parts.append(f"  MARGIN_LTV_CAP_BPS: {ltv['margin_ltv_cap_bps']},\n")
    parts.append(
        f"  WORST_CASE_SETTLEMENT_HAIRCUT_BPS: {ltv['worst_case_settlement_haircut_bps']},\n\n"
    )
    parts.append("  // Oracle\n")
    parts.append(f"  MAX_STALENESS_SECONDS: {oracle['max_staleness_seconds']},\n\n")
    parts.append("  // Redemption (1h cooldown between redeem_request and redeem_fulfill)\n")
    parts.append(f"  REDEMPTION_COOLDOWN_MS: {red['cooldown_ms']}n,\n\n")
    parts.append("  // SVI (locked per re-routes D-01, D-10, D-13, D-14)\n")
    parts.append(f"  SVI_PARAMETERIZATION: '{svi['parameterization']}' as const,\n")
    parts.append(f"  SVI_SCALE: {svi['scale']},\n")
    parts.append(f"  SVI_GRID_POINTS_FOR_ARB_CHECK: {svi['grid_points_for_arb_check']},\n")
    parts.append(f"  SVI_STRIKE_RANGE_SIGMA: {svi['strike_range_sigma']},\n")
    # u64-equivalent fields use bigint literal `n` suffix (RESEARCH.md Pitfall B)
    parts.append(f"  SVI_K_MAX_LOG_STRIKE: {svi['k_max_log_strike']}n,\n")
    parts.append(f"  SVI_A_MAX: {svi['a_max']}n,\n")
    parts.append(f"  SVI_B_MAX: {svi['b_max']}n,\n")
    parts.append(f"  SVI_SIGMA_MIN: {svi['sigma_min']}n,\n")
    parts.append(f"  SVI_SIGMA_MAX: {svi['sigma_max']}n,\n")
    parts.append(f"  SVI_M_ABS_MAX: {svi['m_abs_max']}n,\n")
    parts.append("} as const;\n")
    return "".join(parts)


def _fmt_underscored(n: int) -> str:
    """Format integer with `_` digit separators every 3 digits (matches TOML source).

    Move 2024, Python 3.6+, and TypeScript all accept `_` as a numeric separator
    (Move: `662_910_000`, Python: `662_910_000`, TS: `662_910_000n`). Preserving the
    grouping that appears in shared/cody_phi_coefficients.toml makes side-by-side
    audits against vendored helper/math.move:31-65 a single grep instead of a
    digit-count exercise. Required by the plan's done criterion (Plan 01-02 Task 2).
    """
    return f"{n:_d}"


def emit_phi_move(data: dict) -> str:
    sv = data["schema_version"]
    parts = [header_block("//", sv, HEADER_LINES_PHI)]
    parts.append("\nmodule deepvault::phi_coefficients {\n")
    parts.append("    // Small range threshold (|x| < 0.66291)\n")
    parts.append(
        f"    public fun small_threshold(): u128 {{ {_fmt_underscored(data['small']['threshold'])} }}\n"
    )
    parts.append("\n    // Small range numerator P(x^2)\n")
    for name, value in data["small"]["numerator"].items():
        parts.append(
            f"    public fun small_{name}(): u128 {{ {_fmt_underscored(value)} }}\n"
        )
    parts.append("\n    // Small range denominator Q(x^2)\n")
    for name, value in data["small"]["denominator"].items():
        parts.append(
            f"    public fun small_{name}(): u128 {{ {_fmt_underscored(value)} }}\n"
        )
    parts.append("\n    // Medium range threshold (0.66291 <= |x| < sqrt(32))\n")
    parts.append(
        f"    public fun medium_threshold(): u128 {{ {_fmt_underscored(data['medium']['threshold'])} }}\n"
    )
    parts.append("\n    // Medium range numerator P(|x|)\n")
    for name, value in data["medium"]["numerator"].items():
        parts.append(
            f"    public fun medium_{name}(): u128 {{ {_fmt_underscored(value)} }}\n"
        )
    parts.append("\n    // Medium range denominator Q(|x|)\n")
    for name, value in data["medium"]["denominator"].items():
        parts.append(
            f"    public fun medium_{name}(): u128 {{ {_fmt_underscored(value)} }}\n"
        )
    if "auxiliary" in data:
        parts.append("\n    // Auxiliary constants (LN2 etc.)\n")
        for name, value in data["auxiliary"].items():
            parts.append(
                f"    public fun {name.lower()}(): u128 {{ {_fmt_underscored(value)} }}\n"
            )
    parts.append("}\n")
    return "".join(parts)


def emit_phi_python(data: dict) -> str:
    sv = data["schema_version"]
    parts = [header_block("#", sv, HEADER_LINES_PHI)]
    parts.append('"""Cody 1969 normal-CDF coefficients (clone of helper/math.move:31-65)."""\n')
    parts.append("from typing import Final\n\n")
    parts.append("# Small range threshold (|x| < 0.66291)\n")
    parts.append(
        f"SMALL_THRESHOLD: Final[int] = {_fmt_underscored(data['small']['threshold'])}\n\n"
    )
    parts.append("# Small range numerator P(x^2)\n")
    for name, value in data["small"]["numerator"].items():
        parts.append(f"SMALL_{name.upper()}: Final[int] = {_fmt_underscored(value)}\n")
    parts.append("\n# Small range denominator Q(x^2)\n")
    for name, value in data["small"]["denominator"].items():
        parts.append(f"SMALL_{name.upper()}: Final[int] = {_fmt_underscored(value)}\n")
    parts.append("\n# Medium range threshold (0.66291 <= |x| < sqrt(32))\n")
    parts.append(
        f"MEDIUM_THRESHOLD: Final[int] = {_fmt_underscored(data['medium']['threshold'])}\n\n"
    )
    parts.append("# Medium range numerator P(|x|)\n")
    for name, value in data["medium"]["numerator"].items():
        parts.append(f"MEDIUM_{name.upper()}: Final[int] = {_fmt_underscored(value)}\n")
    parts.append("\n# Medium range denominator Q(|x|)\n")
    for name, value in data["medium"]["denominator"].items():
        parts.append(f"MEDIUM_{name.upper()}: Final[int] = {_fmt_underscored(value)}\n")
    if "auxiliary" in data:
        parts.append("\n# Auxiliary constants (LN2 etc.)\n")
        for name, value in data["auxiliary"].items():
            parts.append(f"{name.upper()}: Final[int] = {_fmt_underscored(value)}\n")
    return "".join(parts)


def emit_phi_typescript(data: dict) -> str:
    sv = data["schema_version"]
    parts = [header_block("//", sv, HEADER_LINES_PHI)]
    parts.append("\nexport const PHI_COEFFICIENTS = {\n")
    parts.append("  // Small range threshold (|x| < 0.66291)\n")
    parts.append(f"  SMALL_THRESHOLD: {_fmt_underscored(data['small']['threshold'])}n,\n\n")
    parts.append("  // Small range numerator P(x^2)\n")
    for name, value in data["small"]["numerator"].items():
        parts.append(f"  SMALL_{name.upper()}: {_fmt_underscored(value)}n,\n")
    parts.append("\n  // Small range denominator Q(x^2)\n")
    for name, value in data["small"]["denominator"].items():
        parts.append(f"  SMALL_{name.upper()}: {_fmt_underscored(value)}n,\n")
    parts.append("\n  // Medium range threshold (0.66291 <= |x| < sqrt(32))\n")
    parts.append(f"  MEDIUM_THRESHOLD: {_fmt_underscored(data['medium']['threshold'])}n,\n\n")
    parts.append("  // Medium range numerator P(|x|)\n")
    for name, value in data["medium"]["numerator"].items():
        parts.append(f"  MEDIUM_{name.upper()}: {_fmt_underscored(value)}n,\n")
    parts.append("\n  // Medium range denominator Q(|x|)\n")
    for name, value in data["medium"]["denominator"].items():
        parts.append(f"  MEDIUM_{name.upper()}: {_fmt_underscored(value)}n,\n")
    if "auxiliary" in data:
        parts.append("\n  // Auxiliary constants (LN2 etc.)\n")
        for name, value in data["auxiliary"].items():
            parts.append(f"  {name.upper()}: {_fmt_underscored(value)}n,\n")
    parts.append("} as const;\n")
    return "".join(parts)


def write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8", newline="\n")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="Drift check only - emit to stdout and exit nonzero if files differ from disk",
    )
    args = parser.parse_args()

    strategy = load_strategy()
    phi = load_phi()

    pairs = [
        (MOVE_PATH, emit_move(strategy)),
        (PYTHON_PATH, emit_python(strategy)),
        (TS_PATH, emit_typescript(strategy)),
        (PHI_MOVE_PATH, emit_phi_move(phi)),
        (PHI_PYTHON_PATH, emit_phi_python(phi)),
        (PHI_TS_PATH, emit_phi_typescript(phi)),
    ]

    if args.check:
        any_drift = False
        for path, expected in pairs:
            actual = path.read_text(encoding="utf-8") if path.exists() else ""
            if actual != expected:
                print(f"DRIFT: {path.relative_to(REPO_ROOT)}", file=sys.stderr)
                any_drift = True
        return 1 if any_drift else 0

    for path, content in pairs:
        write(path, content)
        print(f"codegen.py: wrote {path.relative_to(REPO_ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
