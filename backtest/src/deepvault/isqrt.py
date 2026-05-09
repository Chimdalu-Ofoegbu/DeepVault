"""Integer Newton-Raphson sqrt for u128 inputs.

Clone of deepbook_predict::math::sqrt_u128 + sqrt_initial_guess_u128.
See shared/svi-spec.md sec 5 "Integer Newton sqrt" for the locked algorithm.

Source: scripts/deepbookv3/packages/predict/sources/helper/math.move:266-292
SHA: 1159d79af33c70e09e406310e1d8f067832ede9d

Algorithm (deterministic, constant-step):
- bit-length seed via shifts (64, 32, 16, 8, 4, 2, 1)
- 7 unrolled Newton iterations: g = (g + x // g) // 2
- final overshoot correction: if g*g > x, g -= 1

This file MUST NOT import math, numpy, or scipy. All arithmetic is
Python int (arbitrary precision), all division is `//` (floor).
"""


def isqrt_initial_guess(x: int) -> int:
    """Bit-length-based initial guess: 1 << ((bits + 1) // 2).

    Mirrors helper/math.move:281-292 sqrt_initial_guess_u128 bit-shift sequence.
    Returns a power of two by construction (or 1 for x == 0 to keep callers safe;
    sqrt_u128 short-circuits zero before this is reached anyway).
    """
    if x == 0:
        return 1
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
    """Integer sqrt: matches on-chain sqrt_u128 bit-for-bit for x in [0, 2^128).

    7 unrolled Newton iterations + overshoot correction. Deterministic, constant-step.
    Per shared/svi-spec.md sec 5: no early termination, no convergence detection.
    """
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
