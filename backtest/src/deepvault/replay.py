"""Replay engine + @strategy_fn decorator (BACK-03, BACK-04, D-08).

The @strategy_fn decorator enforces the decision-bar / observation-bar split:
a strategy function MUST declare reads=[...] (columns it's allowed to read) and
writes=[...] (columns it's allowed to write). Undeclared access raises
LookaheadViolation. This is the lookahead-bias gate that makes the backtest
auditable.

Note: this module ships in Plan 03-02 (Wave 1) with the decorator ONLY. The
trace-replay machinery (consuming backtest/traces/cycle-full.json, building on
VaultState from vault_state.py) lands in Plan 03-06 (Wave 3) — see
03-CONTEXT.md D-15/D-16.

Invocations:
    (decorator-only API; no CLI in Plan 03-02)

Per CONTEXT.md D-08: "@strategy_fn(reads=..., writes=...) decorator enforces
the decision-bar / observation-bar split. The decorator raises if the function
reads a column not declared in reads, or writes to one not in writes."

Reference impl: 03-RESEARCH.md Pattern 5 (lines 745-815). Performance escape-
hatch documented on _GatedFrame; Q4 of WAVE0-DECISION.md confirmed the runtime
budget passes by ~450x margin even without the escape hatch, so it stays
optional.
"""

from __future__ import annotations

from collections.abc import Iterable
from functools import wraps

import pandas as pd


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
