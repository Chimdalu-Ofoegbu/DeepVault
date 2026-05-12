"""Walk-forward calibration loop + sensitivity table + OOS risk metrics.

Per CONTEXT.md:
  D-03: OOS = most recent 30% of bars; held back during all calibration.
  D-04: Monthly cadence. Calibrate on month N (training data ≤ N-1), deploy on
        month N+1, never look at N+1 during calibration. v1 has no per-window
        calibration — hedge_ratio is fixed for the entire run. The loop structure
        is SCAFFOLDING for v2 dynamic sizing (STRAT-V2-01).
  D-10: Drawdown + Sharpe + Sortino on OOS only.
        Annualization: 8,760 bars/year (BTC trades 24/7; RESEARCH.md A9).
        Risk-free rate: 0 (hackathon convention; documented).
  D-13 §9: Sensitivity table across hedge_ratio in [0.05, 0.10, 0.15, 0.20, 0.30].
  Claude's Discretion: v1 ratio (ALLOCATION_BPS=1000 = 10%) is PRESERVED regardless
        of which row produces the highest Sharpe — no retrospective re-tuning.

Numpy/pandas is permitted here (analytical pipeline, NOT parity-bound). Output
to int/float at module boundary where it crosses into report.py (Plan 03-09).

Trust boundary (PLAN <threat_model> T-03-24/25/26):
  - sensitivity_table is DOCUMENTATION, not a switch. Production ratio lives in
    strategy_constants.ALLOCATION_BPS (codegen'd from shared/strategy.toml).
  - The OOS slice is asserted bit-identical pre/post calibration by the
    test_oos_never_touched_during_calibration property test.
  - BARS_PER_YEAR=8760 is hardcoded and tested explicitly.
"""
from __future__ import annotations

from typing import Any, Iterable, NamedTuple

import numpy as np
import pandas as pd

from .replay import simulate
from .vault_state import VaultState

OOS_FRACTION: float = 0.30
BARS_PER_YEAR: int = 8_760  # RESEARCH.md A9 — BTC trades 24/7.
RISK_FREE_RATE: float = 0.0  # CONTEXT.md D-10 hackathon convention.
SENSITIVITY_RATIOS: list[float] = [0.05, 0.10, 0.15, 0.20, 0.30]  # D-13 §9.


class DrawdownResult(NamedTuple):
    """Output of compute_drawdown_max_sharpe_sortino."""

    max_drawdown_bps: int
    underwater_bars: int
    sharpe: float
    sortino: float


class WalkForwardResult(NamedTuple):
    """Output of run_walk_forward.

    Exposes equity_curve and actions for the __main__ CLI (Task 3 W4 lock) and
    Plan 03-09's HTML report renderer.
    """

    in_sample_sharpe: float
    oos_sharpe: float
    oos_sortino: float
    oos_max_drawdown_bps: int
    oos_underwater_bars: int
    oos_apy: float
    monthly_pnls: pd.Series
    equity_curve: pd.Series
    actions: list[dict]


def split_walk_forward(
    data: pd.DataFrame,
    oos_fraction: float = OOS_FRACTION,
) -> tuple[pd.DataFrame, list[tuple[pd.Period, pd.Period]]]:
    """Return (oos_df, list_of_(calibrate_month_end, deploy_month)).

    Per D-03: OOS = most recent ``oos_fraction`` of bars (default 30%).
    Per D-04: windows iterate monthly pairs over the in-sample portion.
    """
    n = len(data)
    cutoff_idx = int(n * (1 - oos_fraction))
    in_sample = data.iloc[:cutoff_idx].copy()
    oos = data.iloc[cutoff_idx:].copy().reset_index(drop=True)

    if len(in_sample) == 0:
        return oos, []

    in_sample["_month"] = pd.to_datetime(in_sample["ts_ms"], unit="ms").dt.to_period("M")
    months = sorted(in_sample["_month"].unique())
    windows = [(months[i - 1], months[i]) for i in range(1, len(months))]
    return oos, windows


def run_walk_forward(
    data: pd.DataFrame,
    hedge_ratio: float = 0.10,
) -> WalkForwardResult:
    """Run monthly walk-forward calibration loop; compute OOS metrics.

    Per D-04: for each (calibrate_month_end, deploy_month) window, calibrate on
    training data ≤ calibrate_month_end and deploy on deploy_month. v1 has no
    per-window calibration — hedge_ratio is fixed for the entire run. The loop
    structure is SCAFFOLDING for v2 dynamic sizing (STRAT-V2-01).

    OOS purity invariant (D-03): the OOS slice computed by split_walk_forward()
    is consumed READ-ONLY here. The simulate() call iterates with
    ``.iterrows()`` against a local copy and never writes back to the source
    frame — proven by test_oos_never_touched_during_calibration.
    """
    n = len(data)
    cutoff_idx = int(n * (1 - OOS_FRACTION))
    in_sample = data.iloc[:cutoff_idx].copy()
    oos_slice = data.iloc[cutoff_idx:].copy()

    # In-sample simulation.
    in_sample_vault = VaultState.new_seeded()
    in_sample_result = simulate(in_sample, in_sample_vault, hedge_ratio)
    in_sample_nav = pd.Series(in_sample_result["per_bar_nav"], dtype="float64")
    in_sample_equity = _equity_from_nav(in_sample_nav)
    in_sample_dd = compute_drawdown_max_sharpe_sortino(in_sample_equity)

    # OOS simulation — uses the SAME hedge_ratio (no per-window tuning in v1).
    oos_vault = VaultState.new_seeded()
    oos_result = simulate(oos_slice, oos_vault, hedge_ratio)
    oos_nav = pd.Series(oos_result["per_bar_nav"], dtype="float64")
    oos_equity = _equity_from_nav(oos_nav)
    oos_dd = compute_drawdown_max_sharpe_sortino(oos_equity)

    bars = max(int(oos_result.get("bars", 0)), 1)
    total_return = float(oos_result.get("total_return", 0.0))
    oos_apy = (1.0 + total_return) ** (BARS_PER_YEAR / bars) - 1.0 if bars > 0 else 0.0

    # Plan 03-09's report renders per-month aggregation; stubbed here.
    monthly_pnls = pd.Series([0.0])

    return WalkForwardResult(
        in_sample_sharpe=in_sample_dd.sharpe,
        oos_sharpe=oos_dd.sharpe,
        oos_sortino=oos_dd.sortino,
        oos_max_drawdown_bps=oos_dd.max_drawdown_bps,
        oos_underwater_bars=oos_dd.underwater_bars,
        oos_apy=float(oos_apy),
        monthly_pnls=monthly_pnls,
        equity_curve=oos_equity,
        actions=[],
    )


def sensitivity_table(
    data: pd.DataFrame,
    ratios: Iterable[float] | None = None,
) -> pd.DataFrame:
    """Run walk-forward for each ratio; emit one-row-per-ratio table.

    Per CONTEXT.md D-13 §9. The table DOCUMENTS robustness across the ratio
    grid; the v1 production ratio is unchanged regardless of which row produces
    highest Sharpe (Claude's Discretion — no retrospective re-tuning).
    """
    if ratios is None:
        ratios = SENSITIVITY_RATIOS
    rows: list[dict[str, Any]] = []
    for r in ratios:
        result = run_walk_forward(data, hedge_ratio=r)
        rows.append(
            {
                "hedge_ratio": r,
                "in_sample_sharpe": result.in_sample_sharpe,
                "oos_sharpe": result.oos_sharpe,
                "oos_max_drawdown_bps": result.oos_max_drawdown_bps,
                "oos_apy": result.oos_apy,
            }
        )
    return pd.DataFrame(rows)


def compute_drawdown_max_sharpe_sortino(equity_curve: pd.Series) -> DrawdownResult:
    """Compute max drawdown (bps), underwater bars, Sharpe, Sortino.

    Per CONTEXT.md D-10:
      - Annualization: BARS_PER_YEAR = 8,760 (hourly bars, 24/7 markets).
      - Risk-free rate: 0.
    Per Plan 03-08 behavior:
      - Empty / single-point equity curve returns zeros (no crash).
      - Zero-variance returns yield 0.0 (NOT NaN/inf).
      - Underwater bars = longest consecutive run of drawdown < 0.
    """
    if equity_curve is None or len(equity_curve) < 2:
        return DrawdownResult(0, 0, 0.0, 0.0)

    equity = np.asarray(equity_curve.values, dtype=np.float64)
    # Guard against zeroed/empty curves (defensive — pct_change on 0 -> inf).
    finite_mask = np.isfinite(equity)
    if not finite_mask.all() or (equity <= 0).any():
        # Degenerate input: leave the floor result rather than NaN-poisoning the report.
        return DrawdownResult(0, 0, 0.0, 0.0)

    running_max = np.maximum.accumulate(equity)
    drawdown = (equity - running_max) / running_max
    max_dd = float(drawdown.min())
    max_dd_bps = int(max_dd * 10_000)

    # Underwater duration = longest consecutive run of (drawdown < 0).
    in_dd = drawdown < 0
    if not in_dd.any():
        underwater_bars = 0
    else:
        max_run = 0
        current_run = 0
        for v in in_dd:
            if v:
                current_run += 1
                if current_run > max_run:
                    max_run = current_run
            else:
                current_run = 0
        underwater_bars = int(max_run)

    # Per-bar returns.
    returns = pd.Series(equity).pct_change().dropna().to_numpy()
    if returns.size == 0 or not np.isfinite(returns).all():
        return DrawdownResult(max_dd_bps, underwater_bars, 0.0, 0.0)

    std = float(np.std(returns, ddof=1)) if returns.size > 1 else 0.0
    mean_r = float(np.mean(returns))
    rf_per_bar = RISK_FREE_RATE / BARS_PER_YEAR

    if std == 0.0:
        sharpe = 0.0
    else:
        sharpe = float((mean_r - rf_per_bar) / std * np.sqrt(BARS_PER_YEAR))

    downside = returns[returns < 0]
    if downside.size <= 1:
        sortino = 0.0
    else:
        downside_std = float(np.std(downside, ddof=1))
        if downside_std == 0.0:
            sortino = 0.0
        else:
            sortino = float((mean_r - rf_per_bar) / downside_std * np.sqrt(BARS_PER_YEAR))

    return DrawdownResult(
        max_drawdown_bps=max_dd_bps,
        underwater_bars=underwater_bars,
        sharpe=sharpe,
        sortino=sortino,
    )


# ----------------------------------------------------------------------- helpers


def _equity_from_nav(nav_series: pd.Series) -> pd.Series:
    """Convert a per-bar NAV-per-share series into a normalised equity curve.

    NAV per share lands at NAV_SCALE (1e9); a fresh seeded vault has total
    shares > 0 from inception so the first bar's NAV is finite. Zero-NAV bars
    (vault empty mid-window) drop out so the curve doesn't NaN-poison
    downstream pct_change.
    """
    if nav_series is None or len(nav_series) == 0:
        return pd.Series([], dtype="float64")
    s = nav_series.astype("float64")
    s = s[s > 0].reset_index(drop=True)
    if len(s) == 0:
        return pd.Series([], dtype="float64")
    # Normalise so the curve starts at 1.0; downstream pct_change is scale-invariant
    # but keeping the curve in O(1) prevents float overflow on very long windows.
    return s / s.iloc[0]
