#!/usr/bin/env python3
"""Parity runner: read shared/golden-vectors.json, evaluate via deepvault.svi,
   assert each (w, binary_price, params_valid) matches expected at FLOAT_SCALING (1e9).

Invocations:
    python -m deepvault.parity_runner             # full check, exit 1 on any mismatch
    python -m deepvault.parity_runner --first N   # only first N vectors (debug)
    python -m deepvault.parity_runner --tier A    # filter by tier (A/B/C/C2)
    python -m deepvault.parity_runner --tolerance N  # max diff per vector (default 1)

CI integration: ci.yml `parity` job runs this after move/ts/python/codegen-drift
pass. Exit codes:
    0 = all vectors match expected within tolerance (default 1 unit at 1e9 — auto-
        follows D-14 re-route for re-routed bit-equality semantics; the Python
        evaluator is BOTH the producer of expected values via golden_emit.py AND
        the consumer in this runner, so in practice this is exact equality, but
        tolerance <= 1 protects against off-by-one rounding edge cases).
    1 = at least one vector mismatched (or arb-violating vector did not raise as
        expected, or the JSON file is missing / empty).

Note: the Python evaluator is both the producer (via golden_emit.py invokes
deepvault.svi.binary_price) AND the consumer in this runner. So Python parity is
essentially self-consistent. The MATH-05 parity gate's load-bearing comparisons
happen in the Move and TS runners (which independently re-evaluate and check).
The Python runner exists for symmetry and as a regression detector if golden_emit.py
is later modified to derive expected from a different source (e.g., scipy ground
truth, predict-server REST values).
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .svi import SVIParams, binary_price, total_variance

REPO_ROOT = Path(__file__).resolve().parents[3]
JSON_PATH = REPO_ROOT / "shared" / "golden-vectors.json"


def _decode_signed(enc: dict) -> int:
    """Decode a signed value encoded as {mag: '0x...', neg: bool}."""
    mag = int(enc["mag"], 16)
    return -mag if enc["neg"] else mag


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
    if args.tier:
        vectors = [v for v in vectors if v["tier"] == args.tier]
    if args.first:
        vectors = vectors[: args.first]

    if not vectors:
        print("FAIL: no vectors loaded (empty JSON or filtered out)", file=sys.stderr)
        return 1

    failures: list[str] = []
    for v in vectors:
        try:
            inputs = v["inputs"]
            expected = v["expected"]
            svi = SVIParams(
                a=int(inputs["a"], 16),
                b=int(inputs["b"], 16),
                rho=_decode_signed(inputs["rho"]),
                m=_decode_signed(inputs["m"]),
                sigma=int(inputs["sigma"], 16),
            )
            k = _decode_signed(inputs["k"])
            forward = int(inputs["forward"], 16)
            strike = int(inputs["strike"], 16)

            if expected["params_valid"]:
                actual_w = total_variance(svi, k)
                expected_w = int(expected["w"], 16)
                if abs(actual_w - expected_w) > args.tolerance:
                    failures.append(
                        f"{v['id']} ({v['tier']}): w mismatch — "
                        f"actual={actual_w:#x}, expected={expected_w:#x}, "
                        f"diff={abs(actual_w - expected_w)}"
                    )
                actual_bp = binary_price(svi, forward, strike)
                expected_bp = int(expected["binary_price"], 16)
                if abs(actual_bp - expected_bp) > args.tolerance:
                    failures.append(
                        f"{v['id']} ({v['tier']}): binary_price mismatch — "
                        f"actual={actual_bp:#x}, expected={expected_bp:#x}, "
                        f"diff={abs(actual_bp - expected_bp)}"
                    )
            else:
                # Arb-violating vector: total_variance MUST raise (per Plan 01-04
                # design, all arb-violating vectors trigger EZeroVariance via a=0,b=0
                # — the reachable rejection path; ECannotBeNegative is defensive
                # parity per Plan 01-03 analysis).
                try:
                    _ = total_variance(svi, k)
                    failures.append(f"{v['id']} ({v['tier']}): expected ValueError but got result")
                except ValueError:
                    pass  # Expected — params_valid=false correctly rejected
        except (KeyError, ValueError, ZeroDivisionError) as exc:
            # Catch unexpected exceptions for valid vectors (genuine bugs).
            # ValueError on invalid vectors is handled above; this clause covers
            # malformed JSON entries (KeyError) or arithmetic edge cases.
            if not v.get("expected", {}).get("params_valid", True):
                # Already handled — this path only fires for valid vectors.
                continue
            failures.append(f"{v['id']} ({v['tier']}): unexpected exception {exc!r}")

    if failures:
        print(
            f"PARITY FAIL: {len(failures)} mismatches across {len(vectors)} vectors",
            file=sys.stderr,
        )
        for f in failures[:20]:  # cap output to first 20 for readability
            print(f"  {f}", file=sys.stderr)
        if len(failures) > 20:
            print(f"  ... and {len(failures) - 20} more.", file=sys.stderr)
        return 1
    print(f"PARITY OK: {len(vectors)} vectors pass within tolerance <= {args.tolerance}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
