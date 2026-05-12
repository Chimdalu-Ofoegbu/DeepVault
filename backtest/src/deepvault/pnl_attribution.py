"""Six-column PnL attribution accountant (BACK-08, CONTEXT.md D-09).

Six columns sum to total return per bar plus a 7th `total_bps` column:
  plp_yield_bps:   0 in v1. We BUY hedges via predict::mint, not provide PLP via
                   predict::supply (RESEARCH.md A3 + WAVE0-DECISION.md Q3).
                   Column reserved for v2 STRAT-V2-01.
  hedge_cost_bps:  Premium paid per supply/hedge_mint/roll.
  hedge_payoff_bps: Settlement payoffs from roll actions.
  fees_bps:        0 in v1 (Phase 2 D-13 — no strategy-level fees).
  slippage_bps:    Next-bar VWAP minus next-bar open (BACK-08 pessimistic fills).
                   Negative when next-bar opens above its VWAP — the bar's later
                   prints walked DOWN so the supply's market fill was worse
                   than the next bar's open.
  gas_bps:         Assumed model: 1 bp per PTB (supply / hedge_mint / roll /
                   redeem_request / redeem_fulfill / redeem_cancel). Documented
                   in .planning/backtest-assumptions.md PnL attribution model
                   section; refined per testnet result.effects.gasUsed in
                   Plan 03-09.
  total_bps:       Sum of the 6 above. Tests assert sum invariant within 1 bp.

Risk metrics (compute_risk_metrics) are OOS-only per D-10:
  - bars_per_year = 8_760 (BTC trades 24/7; RESEARCH.md A9).
  - rf = 0 (hackathon convention; documented in backtest-assumptions.md).

Type discipline: pnl_attribution is the third pandas-allowed module after
arb_checker.py + lookahead_audit.py (analytical pipeline, NOT parity-bound).
Output to int/float at module boundary where it crosses into report.py.
"""
from __future__ import annotations

from typing import Iterable

import pandas as pd

from .strategy_constants import ALLOCATION_BPS

# Public constant — the canonical six-column PnL accountant header. Exported so
# tests + the HTML report renderer (Plan 03-09) reference the same names.
PNL_COLUMNS: tuple[str, ...] = (
    "plp_yield_bps",
    "hedge_cost_bps",
    "hedge_payoff_bps",
    "fees_bps",
    "slippage_bps",
    "gas_bps",
)

# Gas model — 1 bp per PTB per testnet observation.
# Documented in .planning/backtest-assumptions.md PnL attribution model section.
_GAS_BPS_PER_PTB: int = 1


def _to_int(value, default: int = 0) -> int:
    """Coerce a value that may be str or int (per WAVE0-DECISION.md Q5 — u64 as
    string in JSON) to int with a default."""
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _safe_div_bps(num: int, den: int) -> int:
    """Truncate-toward-zero division returning an int bps figure.

    Mirrors the round-down-in-vault-favor convention used throughout the
    backtest (matches Move's u128 / for non-negative integers).
    """
    if den == 0:
        return 0
    return num // den


def _slippage_bps_for_action(action: dict, market_data: pd.DataFrame) -> int:
    """Compute slippage_bps = (next-bar VWAP - next-bar open) / next-bar open × 10000.

    BACK-08 pessimistic-fill convention — fills land at next-bar VWAP, so
    slippage is negative when next-bar opens ABOVE its VWAP (the next bar's
    intra-bar prints walked DOWN from open). If no next bar exists or its
    volume is zero, slippage = 0.
    """
    if (
        market_data is None
        or len(market_data) == 0
        or "ts_ms" not in market_data.columns
        or "volume_btc" not in market_data.columns
        or "volume_usdt" not in market_data.columns
    ):
        return 0
    ts = int(action.get("ts_ms", 0))
    forward = market_data.loc[market_data["ts_ms"] >= ts]
    if len(forward) < 2:
        return 0
    next_bar = forward.iloc[1]
    vol_btc = float(next_bar["volume_btc"])
    vol_usdt = float(next_bar["volume_usdt"])
    open_px = float(next_bar["open"])
    if vol_btc <= 0 or open_px <= 0:
        return 0
    vwap = vol_usdt / vol_btc
    return int((vwap - open_px) / open_px * 10_000)


def _zero_row(ts_ms: int, kind: str) -> dict:
    row: dict = {"ts_ms": ts_ms, "kind": kind}
    for col in PNL_COLUMNS:
        row[col] = 0
    return row


def compute_attribution(
    actions: Iterable[dict], market_data: pd.DataFrame
) -> pd.DataFrame:
    """Return a DataFrame with 7 columns: the 6 PnL columns + total_bps.

    Each action row records its kind, ts_ms, and the per-column bps figures.
    The 7th column ``total_bps`` is the sum of the 6 and is asserted within
    1 bp by ``test_total_bps_equals_sum_of_six_columns``.

    Per WAVE0-DECISION.md Q5, integer fields in ``action['args']`` and
    ``action['pre']`` may arrive as strings (u64 JSON-as-string convention).
    Conversion is done via ``_to_int`` at the field boundary.
    """
    rows: list[dict] = []
    for action in actions:
        ts_ms = _to_int(action.get("ts_ms", 0))
        kind = str(action.get("kind", ""))
        row = _zero_row(ts_ms, kind)

        if kind == "supply":
            deposit_quote = _to_int(action.get("args", {}).get("deposit_quote", 0))
            hedge_alloc = deposit_quote * ALLOCATION_BPS // 10_000
            row["hedge_cost_bps"] = _safe_div_bps(hedge_alloc * 10_000, max(deposit_quote, 1))
            row["slippage_bps"] = _slippage_bps_for_action(action, market_data)
            row["gas_bps"] = _GAS_BPS_PER_PTB
        elif kind == "hedge_mint":
            cost = _to_int(action.get("args", {}).get("cost_basis_quote", 0))
            pre_total_assets = _to_int(action.get("pre", {}).get("total_assets", 1), default=1)
            row["hedge_cost_bps"] = _safe_div_bps(cost * 10_000, max(pre_total_assets, 1))
            row["gas_bps"] = _GAS_BPS_PER_PTB
        elif kind == "roll":
            payoff = _to_int(action.get("args", {}).get("payoff_quote", 0))
            new_cost = _to_int(action.get("args", {}).get("new_cost_basis_quote", 0))
            pre_total_assets = _to_int(action.get("pre", {}).get("total_assets", 1), default=1)
            row["hedge_payoff_bps"] = _safe_div_bps(payoff * 10_000, max(pre_total_assets, 1))
            row["hedge_cost_bps"] = _safe_div_bps(new_cost * 10_000, max(pre_total_assets, 1))
            row["gas_bps"] = _GAS_BPS_PER_PTB
        elif kind in ("redeem_request", "redeem_fulfill", "redeem_cancel"):
            row["gas_bps"] = _GAS_BPS_PER_PTB
        # Unknown kinds: leave the row at zero so the report doesn't NaN-poison.

        rows.append(row)

    if not rows:
        empty_cols = ["ts_ms", "kind", *PNL_COLUMNS, "total_bps"]
        return pd.DataFrame(columns=empty_cols)

    df = pd.DataFrame(rows)
    df["total_bps"] = df[list(PNL_COLUMNS)].sum(axis=1)
    return df


def compute_risk_metrics(
    pnl_series: pd.Series,
    bars_per_year: int = 8_760,
    rf: float = 0.0,
) -> dict:
    """Compute Sharpe + Sortino + max drawdown on a per-bar PnL series.

    Per CONTEXT.md D-10: OOS-only annualization at 8,760 bars/year, risk-free=0.
    Returns dict with keys: 'sharpe', 'sortino', 'max_drawdown_bps',
    'underwater_bars'. Empty / zero-variance inputs return zeros (not NaN).
    """
    if pnl_series is None or len(pnl_series) < 2:
        return {
            "sharpe": 0.0,
            "sortino": 0.0,
            "max_drawdown_bps": 0,
            "underwater_bars": 0,
        }

    returns = pd.Series(pnl_series, dtype="float64").to_numpy()

    # Sharpe & Sortino.
    import numpy as np  # local import — pandas-allowed module discipline

    if returns.size == 0 or not np.isfinite(returns).all():
        sharpe = 0.0
        sortino = 0.0
    else:
        std = float(np.std(returns, ddof=1)) if returns.size > 1 else 0.0
        mean_r = float(np.mean(returns))
        rf_per_bar = rf / bars_per_year if bars_per_year > 0 else 0.0
        if std == 0.0:
            sharpe = 0.0
        else:
            sharpe = float((mean_r - rf_per_bar) / std * np.sqrt(bars_per_year))
        downside = returns[returns < 0]
        if downside.size <= 1:
            sortino = 0.0
        else:
            downside_std = float(np.std(downside, ddof=1))
            if downside_std == 0.0:
                sortino = 0.0
            else:
                sortino = float(
                    (mean_r - rf_per_bar) / downside_std * np.sqrt(bars_per_year)
                )

    # Max drawdown on the equity curve implied by cumulative pnl.
    equity = (1.0 + pd.Series(returns)).cumprod().to_numpy()
    if equity.size == 0 or not np.isfinite(equity).all() or (equity <= 0).any():
        return {
            "sharpe": sharpe,
            "sortino": sortino,
            "max_drawdown_bps": 0,
            "underwater_bars": 0,
        }
    running_max = np.maximum.accumulate(equity)
    drawdown = (equity - running_max) / running_max
    max_dd_bps = int(float(drawdown.min()) * 10_000)

    in_dd = drawdown < 0
    if not in_dd.any():
        underwater_bars = 0
    else:
        max_run = 0
        current = 0
        for v in in_dd:
            if v:
                current += 1
                if current > max_run:
                    max_run = current
            else:
                current = 0
        underwater_bars = int(max_run)

    return {
        "sharpe": sharpe,
        "sortino": sortino,
        "max_drawdown_bps": max_dd_bps,
        "underwater_bars": underwater_bars,
    }
