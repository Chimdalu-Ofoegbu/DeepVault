"""Tests for @strategy_fn decorator + LookaheadViolation + _GatedFrame (BACK-03 / D-08).

Per Plan 03-02 (Wave 1 / Track B foundation): the decorator wraps a function and
intercepts pd.DataFrame argument access. Reading a column not declared in
`reads=[...]` or writing one not in `writes=[...]` raises LookaheadViolation.
This is the runtime enforcement of CONTEXT.md D-08 (decision-bar / observation-bar
split).

Reference impl: 03-RESEARCH.md Pattern 5, lines 745-815 (~30 LOC).
"""

from __future__ import annotations

import pandas as pd
import pytest

from deepvault.replay import LookaheadViolation, strategy_fn


@pytest.fixture
def sample_df():
    """Canonical 3-row backtest frame; columns mirror Plan 03-04's planned shape."""
    return pd.DataFrame(
        {
            "ts": [0, 3_600_000, 7_200_000],
            "spot": [60_000, 60_500, 61_000],
            "spot_next": [60_500, 61_000, 61_500],  # the "future-bar" leak column
            "hedge_book": [None, None, None],
        }
    )


# --------------------------------------------------------------------------- #
# Reads
# --------------------------------------------------------------------------- #


def test_strategy_fn_allows_declared_read(sample_df):
    """Reading a column listed in `reads=[...]` succeeds and returns the same value."""

    @strategy_fn(reads=["ts", "spot"], writes=[])
    def f(df):
        return df["spot"].iloc[0]

    assert f(sample_df) == 60_000


def test_strategy_fn_raises_on_undeclared_read(sample_df):
    """Reading an undeclared column raises LookaheadViolation with the offending name."""

    @strategy_fn(reads=["ts", "spot"], writes=[])
    def f(df):
        return df["spot_next"].iloc[0]

    with pytest.raises(LookaheadViolation, match="spot_next"):
        f(sample_df)


# --------------------------------------------------------------------------- #
# Writes
# --------------------------------------------------------------------------- #


def test_strategy_fn_allows_declared_write(sample_df):
    """Writing a column listed in `writes=[...]` succeeds without raising."""

    @strategy_fn(reads=["ts"], writes=["hedge_book"])
    def f(df):
        df["hedge_book"] = 1

    f(sample_df)  # must NOT raise
    # The underlying DataFrame should reflect the write.
    assert (sample_df["hedge_book"] == 1).all()


def test_strategy_fn_raises_on_undeclared_write(sample_df):
    """Writing to an undeclared column raises LookaheadViolation with the offending name."""

    @strategy_fn(reads=["ts"], writes=["hedge_book"])
    def f(df):
        df["leaked_col"] = 42

    with pytest.raises(LookaheadViolation, match="leaked_col"):
        f(sample_df)


# --------------------------------------------------------------------------- #
# Pass-through behaviour
# --------------------------------------------------------------------------- #


def test_strategy_fn_passes_non_dataframe_args_unchanged(sample_df):
    """Non-DataFrame positional args (int, str, list, dict) pass through unchanged."""

    @strategy_fn(reads=[], writes=[])
    def f(df, x, y):
        return x + y

    assert f(sample_df, 1, 2) == 3


def test_strategy_fn_passes_non_dataframe_kwargs_unchanged(sample_df):
    """Non-DataFrame keyword args pass through unchanged."""

    @strategy_fn(reads=[], writes=[])
    def f(df, *, scale: int = 1):
        return scale

    assert f(sample_df, scale=42) == 42


def test_strategy_fn_wraps_dataframe_kwargs(sample_df):
    """DataFrame keyword args are wrapped in a _GatedFrame and gate column access."""

    @strategy_fn(reads=["ts"], writes=[])
    def f(*, df):
        return df["ts"].iloc[0]

    assert f(df=sample_df) == 0


def test_strategy_fn_kwargs_raises_on_undeclared_read(sample_df):
    """DataFrame kwarg respects the reads contract just like a positional arg."""

    @strategy_fn(reads=["ts"], writes=[])
    def f(*, df):
        return df["spot"].iloc[0]

    with pytest.raises(LookaheadViolation, match="spot"):
        f(df=sample_df)


# --------------------------------------------------------------------------- #
# Type hierarchy + metadata
# --------------------------------------------------------------------------- #


def test_lookahead_violation_is_runtime_error():
    """LookaheadViolation MUST be a RuntimeError subclass (downstream catches via RuntimeError)."""
    assert issubclass(LookaheadViolation, RuntimeError)


def test_decorator_preserves_wrapped_function_metadata():
    """functools.wraps preserves __name__ and __doc__ on the wrapped function."""

    @strategy_fn(reads=["ts"], writes=[])
    def documented_fn(df):
        """Docstring preserved."""
        return df["ts"].iloc[0]

    assert documented_fn.__name__ == "documented_fn"
    assert documented_fn.__doc__ == "Docstring preserved."


def test_decorator_exposes_reads_writes_attrs():
    """The decorator exposes _reads and _writes frozensets for audit-harness introspection."""

    @strategy_fn(reads=["a", "b"], writes=["c"])
    def f(df):
        pass

    assert f._reads == frozenset({"a", "b"})
    assert f._writes == frozenset({"c"})


# --------------------------------------------------------------------------- #
# Forwarded attribute access (load-bearing for downstream pandas calls)
# --------------------------------------------------------------------------- #


def test_gated_frame_forwards_shape_attribute(sample_df):
    """df.shape (a non-__getitem__ attribute) still works via _GatedFrame.__getattr__."""

    @strategy_fn(reads=["ts"], writes=[])
    def f(df):
        return df.shape

    assert f(sample_df) == (3, 4)


def test_gated_frame_forwards_iloc(sample_df):
    """df.iloc indexer is forwarded; tests that __getattr__ doesn't accidentally block it."""

    @strategy_fn(reads=["ts"], writes=[])
    def f(df):
        # df.iloc returns a pandas indexer object; we just confirm access doesn't raise.
        return df.iloc[0]["ts"]

    assert f(sample_df) == 0


# --------------------------------------------------------------------------- #
# Slicing / boolean-mask access must NOT raise (non-string keys pass through)
# --------------------------------------------------------------------------- #


def test_gated_frame_allows_boolean_mask(sample_df):
    """Boolean-mask __getitem__ (non-string key) passes through without raising."""

    @strategy_fn(reads=["ts", "spot"], writes=[])
    def f(df):
        mask = df["ts"] > 0
        return df[mask]  # mask is a Series, not a column-name string — must pass

    out = f(sample_df)
    assert len(out) == 2
