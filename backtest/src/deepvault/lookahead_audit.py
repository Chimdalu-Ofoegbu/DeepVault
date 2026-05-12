"""Lookahead-bias audit harness — BACK-06, D-06, D-07, D-08.

Type discipline: lookahead_audit is one of the few numpy-allowed modules in
the Python evaluator codebase (mirrors arb_checker.py's pattern). numpy is
used for np.random.permutation (D-06 shuffled-label test) and np.random.choice
(D-07 3-row hand recompute seed). OUTPUT crosses the module boundary back to
pure-Python int / list[int] / float so downstream parity-bound consumers
(vault_state, replay) keep their parity discipline intact.

ALLOWED HERE — audit-bound, not parity-bound: numpy is the canonical RNG
library for deterministic-permutation tests; reinventing a numpy-free PRNG
would buy nothing.

Per 03-CONTEXT.md:
  - D-06: shuffled-label test must produce |alpha| <= 0.5% APY to pass.
  - D-07: hand recompute on 3 random trade rows (np.random.choice + seed=42).
  - D-08: @strategy_fn decorator (Plan 03-02) enforces decision-bar /
          observation-bar split.

The D-06 hard-gate (|apy| <= 0.005 against the full backtest strategy) ships
in Plan 03-08 once walk_forward + the production simulation_fn exist. This
module ships the AUDIT MACHINERY; Plan 03-08 wires it into a hard CI gate.

Source: 03-RESEARCH.md Pattern 5 (audit test scaffolding).
"""

from __future__ import annotations

from typing import Any, Callable

import numpy as np  # ALLOWED HERE (audit-bound, not parity-bound).
import pandas as pd

# A9 convention: BTC trades 24/7, so the canonical annualization base is
# 8,760 hourly bars per year (NOT 252 trading days). Phase 1's parity
# discipline does not apply to this module — APY is a reporting metric,
# never an on-chain quantity.
BARS_PER_YEAR_HOURLY: int = 8_760


def pick_hand_recompute_rows(
    returns: pd.Series,
    n: int = 3,
    seed: int = 42,
) -> list[int]:
    """Per D-07: pick `n` random row indices for the hand-recompute notebook.

    Deterministic via the supplied seed (default 42 per CONTEXT.md D-07).
    Uses ``np.random.default_rng(seed).choice(replace=False)`` so the
    selection is reproducible across numpy >= 1.17.

    Output values cross the module boundary back to pure Python int.
    """
    rng = np.random.default_rng(seed)
    indices = rng.choice(len(returns), size=n, replace=False)
    return [int(i) for i in indices]


def compound_to_apy(
    total_return: float,
    bars: int,
    bars_per_year: int = BARS_PER_YEAR_HOURLY,
) -> float:
    """Annualize a cumulative return.

    Per RESEARCH.md A9: 8,760 bars/year is the canonical hourly convention
    for BTC (24/7 trading — NOT 252 trading days).

    Returns 0.0 for the degenerate ``bars == 0`` case so callers never have
    to special-case empty backtests.
    """
    if bars == 0:
        return 0.0
    return (1.0 + total_return) ** (bars_per_year / bars) - 1.0


def shuffled_label_alpha_apy(
    simulation_fn: Callable[[pd.Series], Any],
    returns: pd.Series,
    seed: int = 42,
) -> float:
    """Per D-06: shuffle labels, re-run strategy, return APY of the result.

    A strategy with no lookahead bias should produce ~zero APY on shuffled
    labels because timing — the only edge — is destroyed by shuffling.
    Required gate (enforced in Plan 03-08): ``|alpha_apy| <= 0.005`` (0.5%).
    Anything higher indicates a leak.

    ``simulation_fn`` is expected to return an object exposing
    ``.total_return: float`` and ``.bars: int`` (matches the walk_forward
    SimulationResult shape introduced in Plan 03-08).
    """
    rng = np.random.default_rng(seed)
    shuffled = pd.Series(rng.permutation(returns.values), index=returns.index)
    result = simulation_fn(shuffled)
    return float(compound_to_apy(result.total_return, result.bars))


def shuffled_label_sanity(
    simulation_fn: Callable[[pd.Series], Any],
    returns: pd.Series,
    n_shuffles: int = 1000,
    seed: int = 42,
) -> dict:
    """Run the shuffled-label test ``n_shuffles`` times and report summary stats.

    Returns a dict with:
      - ``alpha``: mean APY across all shuffles.
      - ``p_value``: fraction of shuffles whose absolute APY is >= the
        absolute mean APY (loose two-sided proxy; the load-bearing assertion
        in Plan 03-08 is ``|alpha| <= 0.005``, not the p-value).

    Per CONTEXT.md D-06 the only HARD gate is ``|alpha| <= 0.005``; this
    function exposes both the alpha estimate and a diagnostic p-value for
    the Plan 03-08 report.
    """
    apy_samples: list[float] = []
    base_seed_rng = np.random.default_rng(seed)
    seeds = base_seed_rng.integers(low=0, high=2**31 - 1, size=n_shuffles)
    for s in seeds:
        apy_samples.append(shuffled_label_alpha_apy(simulation_fn, returns, seed=int(s)))
    arr = np.asarray(apy_samples, dtype=float)
    mean_alpha = float(arr.mean())
    abs_mean = abs(mean_alpha)
    if abs_mean == 0.0:
        p_value = 1.0
    else:
        p_value = float((np.abs(arr) >= abs_mean).mean())
    return {"alpha": mean_alpha, "p_value": p_value}


def hand_recompute_samples(
    state_history: pd.DataFrame,
    n_rows: int = 3,
    seed: int = 42,
) -> list[dict]:
    """Per D-07: pick ``n_rows`` random rows from a state-history DataFrame
    for the hand-recompute notebook.

    Each returned dict carries every column of the sampled row plus the
    row's index. Deterministic via ``seed`` (default 42 per CONTEXT.md).
    """
    rng = np.random.default_rng(seed)
    indices = rng.choice(len(state_history), size=n_rows, replace=False)
    samples: list[dict] = []
    for raw_idx in indices:
        idx = int(raw_idx)
        row = state_history.iloc[idx]
        sample = {"__row_index__": idx}
        for col in state_history.columns:
            value = row[col]
            # Convert numpy scalars to Python types for cross-module clarity.
            try:
                sample[col] = value.item()
            except AttributeError:
                sample[col] = value
        samples.append(sample)
    return samples


def inspect_strategy_fn_decls(fn) -> tuple[frozenset, frozenset]:
    """Read the (reads, writes) declarations from a @strategy_fn-decorated function.

    The audit harness uses this to enumerate read/write declarations across
    all strategy functions BEFORE running the full backtest — this catches
    forgotten declarations at audit time rather than at first DataFrame access.

    Raises ``AttributeError`` if ``fn`` was not wrapped with ``@strategy_fn``.
    """
    if not hasattr(fn, "_reads") or not hasattr(fn, "_writes"):
        raise AttributeError(f"{fn.__name__} is not @strategy_fn-decorated")
    return fn._reads, fn._writes
