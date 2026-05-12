"""DeepVault backtest CLI entry point (W4 lock — required by Plan 03-09).

Subcommands:
    walk_forward --window-days <int> --out <path>  — run the walk-forward backtest
    report       --input <path> --output <path>    — render HTML report (delegated
                                                     to deepvault.report.render_html
                                                     — wired by Plan 03-09)

Examples:
    python -m deepvault walk_forward --window-days 7   --out reports/micro-7d.json
    python -m deepvault walk_forward --window-days 365 --out reports/full-365d.json

Implementation rationale: closes the BACK-05 nightly-backtest gap that Plan
03-09's prior `|| echo` fallback in `nightly-backtest.yml` masked. With this
CLI in place, the nightly job can invoke
``python -m deepvault walk_forward --window-days 365 --out <path>`` directly.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .data_ingest import load_window
from .pnl_attribution import compute_attribution, compute_risk_metrics
from .walk_forward import (
    compute_drawdown_max_sharpe_sortino,
    run_walk_forward,
    sensitivity_table,
)

# REPO_ROOT discovery — matches data_ingest.py / replay.py idiom.
#   backtest/src/deepvault/__main__.py -> parents[3] is the repo root.
REPO_ROOT = Path(__file__).resolve().parents[3]

# Hourly bars per day. CONTEXT.md D-01 windows are expressed in days; we slice
# milliseconds via load_window(start_ts_ms, end_ts_ms).
_MS_PER_DAY: int = 24 * 60 * 60 * 1000


def _load_data_for_window_days(window_days: int):
    """Load the most-recent ``window_days`` of cached BTC hourly bars.

    Defensive fallback: when the cached parquet is absent (e.g. CI runs the CLI
    before data_ingest has populated the cache), we surface an empty DataFrame
    so the CLI's JSON output records ``bars: 0`` rather than raising — the
    nightly-backtest workflow then surfaces the missing-data error via its own
    "bars < 1" gate.
    """
    try:
        # Load the full cached tape first to discover the window endpoint.
        from .data_ingest import fetch_btc_hourly

        full = fetch_btc_hourly()
    except Exception:
        import pandas as pd

        return pd.DataFrame(
            columns=[
                "ts_ms",
                "available_at",
                "open",
                "high",
                "low",
                "close",
                "volume_btc",
                "volume_usdt",
            ]
        )

    if len(full) == 0:
        return full

    end_ts_ms = int(full["ts_ms"].iloc[-1])
    start_ts_ms = end_ts_ms - window_days * _MS_PER_DAY
    return load_window(start_ts_ms, end_ts_ms)


def _cmd_walk_forward(args) -> int:
    """Run walk-forward over `--window-days` of historical BTC hourly bars and
    write a summary JSON to `--out`."""
    data = _load_data_for_window_days(args.window_days)

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    if len(data) < 2:
        # Defensive — still emit a valid JSON document so callers can grep its keys.
        summary = {
            "window_days": int(args.window_days),
            "bars": int(len(data)),
            "oos_sharpe": 0.0,
            "oos_sortino": 0.0,
            "oos_max_drawdown_bps": 0,
            "oos_underwater_bars": 0,
            "sensitivity_table": [],
            "pnl_attribution_summary": {
                "total_bps_mean": 0.0,
                "total_bps_min": 0.0,
                "total_bps_max": 0.0,
            },
        }
        out_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
        print(f"walk_forward complete: {len(data)} bars (insufficient data); summary -> {out_path}")
        return 0

    result = run_walk_forward(data, hedge_ratio=0.10)
    sens = sensitivity_table(data)
    dd_metrics = compute_drawdown_max_sharpe_sortino(result.equity_curve)
    attribution_df = compute_attribution(result.actions, data)

    summary = {
        "window_days": int(args.window_days),
        "bars": int(len(data)),
        "oos_sharpe": float(dd_metrics.sharpe),
        "oos_sortino": float(dd_metrics.sortino),
        "oos_max_drawdown_bps": int(dd_metrics.max_drawdown_bps),
        "oos_underwater_bars": int(dd_metrics.underwater_bars),
        "sensitivity_table": sens.to_dict(orient="records"),
        "pnl_attribution_summary": {
            "total_bps_mean": (
                float(attribution_df["total_bps"].mean()) if len(attribution_df) > 0 else 0.0
            ),
            "total_bps_min": (
                float(attribution_df["total_bps"].min()) if len(attribution_df) > 0 else 0.0
            ),
            "total_bps_max": (
                float(attribution_df["total_bps"].max()) if len(attribution_df) > 0 else 0.0
            ),
        },
    }
    # compute_risk_metrics is the per-bar pnl variant used in Plan 03-09; we
    # invoke it here on the OOS equity-curve diff to populate a supplementary
    # cross-check block in the JSON summary.
    if len(result.equity_curve) >= 2:
        pnl_series = result.equity_curve.pct_change().dropna()
        risk_extra = compute_risk_metrics(pnl_series)
        summary["risk_metrics_cross_check"] = risk_extra

    out_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(
        f"walk_forward complete: {len(data)} bars; "
        f"OOS Sharpe={dd_metrics.sharpe:.3f}; "
        f"max DD={dd_metrics.max_drawdown_bps} bps"
    )
    print(f"summary -> {out_path}")
    return 0


def _cmd_report(args) -> int:
    """Render HTML report from a walk_forward summary JSON.

    Implementation body lives in ``deepvault.report.render_html_from_summary``
    which lands in Plan 03-09. Until then, return exit=1 with a stderr message
    so the CLI surface is correct but the body explicitly signals "not yet
    wired".
    """
    try:
        from .report import render_html_from_summary  # type: ignore[attr-defined]
    except ImportError:
        print(
            "report module not yet installed (Plan 03-09 closure)",
            file=sys.stderr,
        )
        return 1
    return int(render_html_from_summary(args.input, args.output))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m deepvault",
        description=__doc__,
    )
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_wf = sub.add_parser("walk_forward", help="Run walk-forward backtest")
    p_wf.add_argument(
        "--window-days",
        type=int,
        required=True,
        help="Lookback window in days",
    )
    p_wf.add_argument(
        "--out",
        type=str,
        required=True,
        help="Path to summary JSON output",
    )
    p_wf.set_defaults(func=_cmd_walk_forward)

    p_rpt = sub.add_parser("report", help="Render HTML report")
    p_rpt.add_argument(
        "--input",
        type=str,
        required=True,
        help="Path to walk_forward summary JSON",
    )
    p_rpt.add_argument(
        "--output",
        type=str,
        required=True,
        help="Path to output HTML file",
    )
    p_rpt.set_defaults(func=_cmd_report)

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
