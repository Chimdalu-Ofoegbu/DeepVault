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

HEADER_LINES_GENERIC = [
    "AUTO-GENERATED - DO NOT EDIT",
    "Source: shared/strategy.toml (schema_version {schema_version})",
    "Regenerate via: make codegen   (or: python scripts/codegen.py)",
]


def load_strategy() -> dict:
    with TOML_PATH.open("rb") as f:
        data = tomllib.load(f)
    if data.get("schema_version") != 1:
        raise SystemExit(
            f"codegen.py: unexpected schema_version {data.get('schema_version')!r} "
            f"in {TOML_PATH}; codegen.py supports schema_version=1"
        )
    return data


def header_block(comment_prefix: str, schema_version: int) -> str:
    bar = comment_prefix + " " + "=" * 75
    lines = [bar]
    for line in HEADER_LINES_GENERIC:
        lines.append(comment_prefix + " " + line.format(schema_version=schema_version))
    lines.append(bar)
    return "\n".join(lines) + "\n"


def emit_move(data: dict) -> str:
    sv = data["schema_version"]
    fp = data["fixed_point"]
    hp = data["hedge_policy"]
    tb = data["token_bucket"]
    ltv = data["ltv"]
    oracle = data["oracle"]
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
    parts.append("\n    // Token bucket\n")
    parts.append(f"    public fun bucket_capacity_bps(): u64 {{ {tb['capacity_bps']} }}\n")
    parts.append(
        f"    public fun bucket_refill_rate_bps_per_sec(): u64 "
        f"{{ {tb['refill_rate_bps_per_sec']} }}\n"
    )
    parts.append(f"    public fun bucket_period_seconds(): u64 {{ {tb['period_seconds']} }}\n")
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
    parts.append("\n    // SVI placeholders (Phase 1 may extend)\n")
    parts.append(
        f"    public fun svi_grid_points_for_arb_check(): u64 "
        f"{{ {svi['grid_points_for_arb_check']} }}\n"
    )
    parts.append(
        f"    public fun svi_strike_range_sigma(): u64 "
        f"{{ {svi['strike_range_sigma']} }}\n"
    )
    parts.append("}\n")
    return "".join(parts)


def emit_python(data: dict) -> str:
    sv = data["schema_version"]
    fp = data["fixed_point"]
    hp = data["hedge_policy"]
    tb = data["token_bucket"]
    ltv = data["ltv"]
    oracle = data["oracle"]
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
    parts.append(f'SIZING_FUNCTION: Final[str] = "{hp["sizing_function"]}"\n\n')
    parts.append("# Token bucket\n")
    parts.append(f"BUCKET_CAPACITY_BPS: Final[int] = {tb['capacity_bps']}\n")
    parts.append(
        f"BUCKET_REFILL_RATE_BPS_PER_SEC: Final[int] = {tb['refill_rate_bps_per_sec']}\n"
    )
    parts.append(f"BUCKET_PERIOD_SECONDS: Final[int] = {tb['period_seconds']}\n\n")
    parts.append("# LTV\n")
    parts.append(f"MARGIN_LTV_CAP_BPS: Final[int] = {ltv['margin_ltv_cap_bps']}\n")
    parts.append(
        f"WORST_CASE_SETTLEMENT_HAIRCUT_BPS: Final[int] = "
        f"{ltv['worst_case_settlement_haircut_bps']}\n\n"
    )
    parts.append("# Oracle\n")
    parts.append(f"MAX_STALENESS_SECONDS: Final[int] = {oracle['max_staleness_seconds']}\n\n")
    parts.append("# SVI\n")
    parts.append(f'SVI_PARAMETERIZATION: Final[str] = "{svi["parameterization"]}"\n')
    parts.append(
        f"SVI_GRID_POINTS_FOR_ARB_CHECK: Final[int] = {svi['grid_points_for_arb_check']}\n"
    )
    parts.append(f"SVI_STRIKE_RANGE_SIGMA: Final[int] = {svi['strike_range_sigma']}\n")
    return "".join(parts)


def emit_typescript(data: dict) -> str:
    sv = data["schema_version"]
    fp = data["fixed_point"]
    hp = data["hedge_policy"]
    tb = data["token_bucket"]
    ltv = data["ltv"]
    oracle = data["oracle"]
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
    parts.append(f"  SIZING_FUNCTION: '{hp['sizing_function']}' as const,\n\n")
    parts.append("  // Token bucket\n")
    parts.append(f"  BUCKET_CAPACITY_BPS: {tb['capacity_bps']},\n")
    parts.append(f"  BUCKET_REFILL_RATE_BPS_PER_SEC: {tb['refill_rate_bps_per_sec']},\n")
    parts.append(f"  BUCKET_PERIOD_SECONDS: {tb['period_seconds']},\n\n")
    parts.append("  // LTV\n")
    parts.append(f"  MARGIN_LTV_CAP_BPS: {ltv['margin_ltv_cap_bps']},\n")
    parts.append(
        f"  WORST_CASE_SETTLEMENT_HAIRCUT_BPS: {ltv['worst_case_settlement_haircut_bps']},\n\n"
    )
    parts.append("  // Oracle\n")
    parts.append(f"  MAX_STALENESS_SECONDS: {oracle['max_staleness_seconds']},\n\n")
    parts.append("  // SVI\n")
    parts.append(f"  SVI_PARAMETERIZATION: '{svi['parameterization']}' as const,\n")
    parts.append(f"  SVI_GRID_POINTS_FOR_ARB_CHECK: {svi['grid_points_for_arb_check']},\n")
    parts.append(f"  SVI_STRIKE_RANGE_SIGMA: {svi['strike_range_sigma']},\n")
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
    print(f"codegen.py: wrote {MOVE_PATH.relative_to(REPO_ROOT)}")
    print(f"codegen.py: wrote {PYTHON_PATH.relative_to(REPO_ROOT)}")
    print(f"codegen.py: wrote {TS_PATH.relative_to(REPO_ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
