"""Integer sqrt tests — bit-equal with on-chain sqrt_u128.

Source under test: backtest/src/deepvault/isqrt.py
Cross-runtime parity: Plan 01-05 Move test reads the same random inputs
(see test_deterministic_random_inputs_for_move_cross_check below) for cross-check.
"""
import random
from pathlib import Path

import pytest

from deepvault.isqrt import isqrt_initial_guess, isqrt_u128

SNAPSHOT_PATH = Path(__file__).parent / "test_isqrt_random_snapshot.txt"


def test_zero():
    assert isqrt_u128(0) == 0


def test_small():
    assert isqrt_u128(1) == 1
    assert isqrt_u128(2) == 1
    assert isqrt_u128(3) == 1


def test_returns_int_type():
    result = isqrt_u128(42)
    assert isinstance(result, int)
    assert not isinstance(result, bool)


@pytest.mark.parametrize("n", [4, 9, 16, 25, 100, 10_000, 1_000_000, 10**9, 10**18])
def test_perfect_squares(n: int):
    assert isqrt_u128(n * n) == n


@pytest.mark.parametrize("n", [10, 100, 1000, 1_000_000])
def test_off_by_one_floor(n: int):
    assert isqrt_u128(n * n + 1) == n
    assert isqrt_u128(n * n - 1) == n - 1


def test_large_u64():
    assert isqrt_u128(2**64 - 1) == 4_294_967_295


def test_large_u128():
    assert isqrt_u128(2**128 - 1) == 18_446_744_073_709_551_615


def test_deterministic_random_inputs_for_move_cross_check():
    """Generate 100 deterministic random u128 inputs, assert floor-sqrt invariant,
    and snapshot the outputs to a file Plan 01-05's Move test can ingest.
    """
    rng = random.Random(42)
    inputs = [rng.randrange(0, 1 << 128) for _ in range(100)]
    outputs = []
    for x in inputs:
        s = isqrt_u128(x)
        # Floor-sqrt invariant: s^2 <= x < (s+1)^2
        assert s * s <= x, f"isqrt_u128({x}) = {s}; s*s = {s * s} > x"
        assert (s + 1) * (s + 1) > x, (
            f"isqrt_u128({x}) = {s}; (s+1)*(s+1) = {(s + 1) * (s + 1)} <= x"
        )
        outputs.append(s)
    # Write snapshot for Plan 01-05's Move test cross-check.
    SNAPSHOT_PATH.write_text(
        "".join(f"{x:032x}={s:032x}\n" for x, s in zip(inputs, outputs)),
        encoding="utf-8",
        newline="\n",
    )


def test_initial_guess_returns_power_of_two():
    """seed should always be a power of two by construction."""
    for x in [1, 4, 100, 10**18, 2**64 - 1, 2**128 - 1]:
        g = isqrt_initial_guess(x)
        assert g > 0
        assert (g & (g - 1)) == 0  # power of two
