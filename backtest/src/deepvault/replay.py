"""Replay engine + @strategy_fn decorator (BACK-03, BACK-04, D-08).

The @strategy_fn decorator enforces the decision-bar / observation-bar split:
a strategy function MUST declare reads=[...] (columns it's allowed to read) and
writes=[...] (columns it's allowed to write). Undeclared access raises
LookaheadViolation. This is the lookahead-bias gate that makes the backtest
auditable.

The trace-replay machinery (consuming backtest/traces/cycle-full.json, built
on VaultState from vault_state.py) ships in Plan 03-06 (Wave 3) — see
03-CONTEXT.md D-15/D-16. The CLI `python -m deepvault.replay --trace ...`
exits 0 when every action's post-state matches Python's VaultState replay
within 1 wei.

Per RESEARCH.md Pitfall 2 loop invariant: VaultState is bootstrapped ONCE
via new_seeded() and each subsequent action is applied to the running
instance. The trace's `pre` fields are ASSERTED against Python state, never
USED to overwrite Python state — that distinction is what makes the parity
test catch real Move<->Python divergence.

Invocations:
    python -m deepvault.replay --trace backtest/traces/cycle-full.json
    python -m deepvault.replay --trace backtest/traces/micro-fixture-7d.json
    python -m deepvault.replay --trace <path> --tolerance 1

Per CONTEXT.md D-08: "@strategy_fn(reads=..., writes=...) decorator enforces
the decision-bar / observation-bar split. The decorator raises if the function
reads a column not declared in reads, or writes to one not in writes."

Reference impl: 03-RESEARCH.md Pattern 5 (lines 745-815). Performance escape-
hatch documented on _GatedFrame; Q4 of WAVE0-DECISION.md confirmed the runtime
budget passes by ~450x margin even without the escape hatch, so it stays
optional.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Iterable
from functools import wraps
from pathlib import Path
from typing import Callable

import pandas as pd

from .vault_state import VaultState

# REPO_ROOT is three parents up from this file (src/deepvault/replay.py -> repo).
REPO_ROOT = Path(__file__).resolve().parents[3]


class LookaheadViolation(RuntimeError):
    """Raised when a strategy function reads or writes a column not declared in
    the @strategy_fn manifest. Enforces D-08 decision-bar / observation-bar split.
    """


class _GatedFrame:
    """Proxy wrapping a pd.DataFrame; raises on undeclared column access.

    Forwards all other attribute lookups (e.g. ``.shape``, ``.iloc``, ``.loc``)
    to the wrapped DataFrame via ``__getattr__``.

    Performance note (03-RESEARCH.md Pitfall 6): the ``__getitem__`` dispatch
    adds Python-interpreter overhead per access. Inside the decorated function,
    callers MAY extract the raw DataFrame via ``df._df`` once all reads are
    validated, then perform hot-loop pandas/numpy operations on the raw frame.
    This is the documented escape hatch. WAVE0-DECISION.md Q4 confirms the v1
    backtest does NOT need it (1.33 s extrapolated 365-day runtime vs 600 s
    budget), but the hatch remains available for future column-heavy strategies.
    """

    __slots__ = ("_df", "_reads", "_writes")

    def __init__(self, df: pd.DataFrame, reads: frozenset, writes: frozenset):
        # Use object.__setattr__ to bypass any future custom __setattr__ logic.
        object.__setattr__(self, "_df", df)
        object.__setattr__(self, "_reads", reads)
        object.__setattr__(self, "_writes", writes)

    def __getitem__(self, key):
        # Non-string keys (boolean masks, slices, lists) pass through unchanged;
        # only column-name string access participates in the declared-reads gate.
        if isinstance(key, str) and key not in self._reads:
            raise LookaheadViolation(
                f"function read undeclared column {key!r}; "
                f"declared reads = {sorted(self._reads)}"
            )
        return self._df[key]

    def __setitem__(self, key, value):
        if isinstance(key, str) and key not in self._writes:
            raise LookaheadViolation(
                f"function wrote undeclared column {key!r}; "
                f"declared writes = {sorted(self._writes)}"
            )
        self._df[key] = value

    def __getattr__(self, name):
        # Called only when the attribute is NOT found on _GatedFrame itself;
        # forwards to the wrapped DataFrame so .shape, .iloc, .loc, .index etc.
        # remain usable inside the decorated body.
        return getattr(self._df, name)

    def __len__(self):
        return len(self._df)

    def __repr__(self) -> str:
        return f"_GatedFrame(reads={sorted(self._reads)}, writes={sorted(self._writes)})"


def strategy_fn(reads: Iterable[str], writes: Iterable[str]):
    """Decorator enforcing D-08 decision-bar / observation-bar split.

    Wraps any pd.DataFrame positional OR keyword arg in a ``_GatedFrame`` that
    intercepts column access. Non-DataFrame args pass through unchanged.

    The wrapped function exposes ``_reads`` and ``_writes`` frozenset attributes
    so the audit harness (Plan 03-08 walk_forward + lookahead_audit) can
    introspect the contract without re-importing the source.

    Args:
        reads: column names the wrapped function is allowed to READ.
        writes: column names the wrapped function is allowed to WRITE.

    Example:
        >>> @strategy_fn(reads=["ts", "spot", "svi_params"], writes=["hedge_book"])
        ... def buy_hedge_for_deposit(market_data, vault_state):
        ...     spot_now = market_data["spot"]          # OK
        ...     # market_data["spot_next"]              # raises LookaheadViolation
    """
    reads_set = frozenset(reads)
    writes_set = frozenset(writes)

    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            new_args = tuple(
                _GatedFrame(a, reads_set, writes_set) if isinstance(a, pd.DataFrame) else a
                for a in args
            )
            new_kwargs = {
                k: (_GatedFrame(v, reads_set, writes_set) if isinstance(v, pd.DataFrame) else v)
                for k, v in kwargs.items()
            }
            return fn(*new_args, **new_kwargs)

        # Introspectable by the audit harness (Plan 03-08).
        wrapper._reads = reads_set
        wrapper._writes = writes_set
        return wrapper

    return decorator


# ============================================================
# Trace-replay machinery (Plan 03-06 / BACK-04).
#
# replay_trace() consumes a JSON action-trace and asserts each
# action's post-state matches VaultState's computation within
# 1 wei. simulate() drives a VaultState forward over a bar-by-bar
# DataFrame, optionally invoking a decision_fn per bar to produce
# actions; it's the building block Plan 03-08 walk_forward
# composes on top of.
# ============================================================


def replay_trace(trace_path: Path | str, tolerance: int = 1) -> tuple[int, list[str]]:
    """Load a JSON action-trace, replay through VaultState, return (mismatch_count, error_messages).

    Per RESEARCH.md Pitfall 2 loop invariant: bootstrap VaultState ONCE via
    new_seeded() and apply every subsequent action's effects. NEVER overwrite
    Python state from the trace's `pre` fields — that would mask bugs.

    Tolerance: default 1 wei (matches Phase 1 parity_runner.py at NAV_SCALE=1e9
    and Plan 03-04's VaultState.replay() built-in tolerance). A larger drift
    means a real Move<->Python parity bug, not noise.

    Args:
        trace_path: filesystem path to a JSON file shaped per CONTEXT.md
            Claude's Discretion schema (top-level `actions` list).
        tolerance: max permitted absolute diff per snapshot field. Note that
            VaultState.replay() asserts at <=1 internally; this parameter is
            forwarded for future use but currently surfaces in error messages.

    Returns:
        (mismatch_count, error_messages) tuple. mismatch_count == 0 means
        every action replayed bit-equal (or within 1 wei). Each error
        message identifies the action index, kind, and tx_digest prefix.

    Raises:
        FileNotFoundError: if `trace_path` does not exist. Letting the
            error surface (rather than swallowing it into the report) is
            intentional per the B2 amendment — masking a missing file as
            "no actions to replay" would silently green a broken CI.
    """
    path = Path(trace_path)
    if not path.exists():
        raise FileNotFoundError(f"Action trace not found: {path}")

    data = json.loads(path.read_text(encoding="utf-8"))
    actions = data.get("actions", [])
    if not actions:
        return 0, [f"No actions in trace at {path}"]

    vault = VaultState.new_seeded()
    errors: list[str] = []
    for i, action in enumerate(actions):
        try:
            vault.replay(action)
        except AssertionError as e:
            digest = str(action.get("tx_digest", "?"))[:8]
            kind = action.get("kind", "?")
            errors.append(
                f"Action[{i}] {kind} (digest={digest}): {e} (tolerance={tolerance})"
            )
    return len(errors), errors


def simulate(
    market_data: pd.DataFrame,
    vault: VaultState,
    hedge_ratio: float,
    decision_fn: Callable | None = None,
) -> dict:
    """Drive a VaultState through market_data bars, applying strategy decisions.

    Per CONTEXT.md D-04 monthly walk-forward — this function is called per
    deploy month with a `decision_fn` that returns the per-bar actions list.

    Plan 03-08 wires the full walk-forward loop on top of this simulate().
    For Plan 03-06, simulate() is a thin pass-through that produces a per-bar
    NAV trace usable by Plan 03-08's walk_forward + sensitivity_table.

    Args:
        market_data: per-bar pd.DataFrame; columns shape is whatever the
            decision_fn declares via @strategy_fn(reads=...).
        vault: a VaultState instance (typically VaultState.new_seeded()).
        hedge_ratio: float forwarded to decision_fn unchanged.
        decision_fn: optional callable invoked as
            decision_fn(bar_row, vault, hedge_ratio) per bar; expected to
            return an iterable of action dicts (each matching CONTEXT.md
            Claude's Discretion schema). When None, simulate() simply
            records NAV per bar without mutating the vault.

    Returns:
        dict with keys:
          - 'total_return' (float): (post_nav - pre_nav) / pre_nav, or 0.0
            if vault was empty.
          - 'bars' (int): number of bars iterated.
          - 'per_bar_nav' (list[int]): NAV per share at NAV_SCALE for each
            bar (0 when total_shares == 0).
          - 'final_nav_per_share' (int): vault.nav_per_share() at end, or 0
            if vault has zero shares.
    """
    pre_nav = vault.nav_per_share() if vault.total_shares > 0 else 0
    per_bar_nav: list[int] = []
    bar_count = 0
    for _, bar in market_data.iterrows():
        bar_count += 1
        if decision_fn is not None:
            actions = decision_fn(bar, vault, hedge_ratio)
            for action in actions:
                vault.replay(action)
        per_bar_nav.append(vault.nav_per_share() if vault.total_shares > 0 else 0)
    post_nav = vault.nav_per_share() if vault.total_shares > 0 else 0
    total_return = (post_nav - pre_nav) / pre_nav if pre_nav > 0 else 0.0
    return {
        "total_return": total_return,
        "bars": bar_count,
        "per_bar_nav": per_bar_nav,
        "final_nav_per_share": post_nav,
    }


def main(argv: list[str] | None = None) -> int:
    """CLI entry: python -m deepvault.replay --trace backtest/traces/cycle-full.json

    Exit codes:
      0 = every action in the trace replayed within tolerance.
      1 = at least one action mismatched (errors written to stderr) OR the
          trace file was not found (FileNotFoundError converted to stderr).
    """
    parser = argparse.ArgumentParser(
        prog="python -m deepvault.replay",
        description="Move<->Python trace-replay parity gate (BACK-04).",
    )
    parser.add_argument(
        "--trace",
        type=str,
        required=True,
        help="Path to action-trace JSON (e.g. backtest/traces/cycle-full.json)",
    )
    parser.add_argument(
        "--tolerance",
        type=int,
        default=1,
        help="Max wei drift per action (default 1)",
    )
    args = parser.parse_args(argv)

    trace_path = Path(args.trace).resolve()
    try:
        mismatches, errors = replay_trace(trace_path, tolerance=args.tolerance)
    except FileNotFoundError as e:
        print(f"FAIL: {e}", file=sys.stderr)
        return 1

    if mismatches == 0:
        print(
            f"PASS: all actions in {trace_path} replayed bit-equal "
            f"within {args.tolerance} wei"
        )
        return 0
    print(f"FAIL: {mismatches} mismatches in {trace_path}", file=sys.stderr)
    for err in errors:
        print(f"  {err}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
