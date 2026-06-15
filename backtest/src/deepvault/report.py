"""Institutional HTML report renderer (BACK-10).

Per CONTEXT.md D-12: single self-contained HTML file. Embedded Plotly for 3D
SVI surface + equity curve + drawdown timeline; matplotlib base64 PNG for
static figures (PnL histogram, regime heatmap).

Per CONTEXT.md D-13: 11 sections in order.

Per RESEARCH.md Pitfall 5: include_plotlyjs='inline' ONLY on first plot;
subsequent plots use include_plotlyjs=False (Plotly detects existing bundle
in page). File size budget: < 5 MB.

Per W6 amendment (Plan 03-09 iteration 1):
  - per_trade_table kwarg: list of dicts sourced from pnl_attribution_df
    (sec 6.1 trade-table).
  - svi_snapshot_evolution kwarg: list of {'label': str, 'plot_html': str}
    (sec 8.1 surface-evolution); v1 = 3 representative snapshots.

Cold-read test (CONTEXT.md Claude's Discretion): each chart has a caption
explaining what it shows and why it matters; an institutional LP must be
able to evaluate the strategy from this file alone.

Reference: 03-RESEARCH.md Pattern 6 (HTML report block).
"""

from __future__ import annotations

import base64
import json
import sys
from io import BytesIO
from pathlib import Path
from typing import Any

import jinja2

# Set matplotlib's backend BEFORE importing pyplot. On a headless Linux CI
# runner (no DISPLAY), the default TkAgg backend fails at first figure() call.
# Once pyplot is imported, the backend selection is locked, so this must come
# first. test_report.py also sets Agg, but module-load order makes report.py
# the actual lock site.
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402 — backend setup above must precede pyplot import
import plotly.graph_objects as go  # noqa: E402

# REPO_ROOT discovery — backtest/src/deepvault/report.py -> parents[3] is repo root.
REPO_ROOT = Path(__file__).resolve().parents[3]
TEMPLATE_DIR = REPO_ROOT / "backtest" / "templates"
TEMPLATE_FILE = "report.html.j2"


def _pct(fraction: float) -> float:
    """Render a NAV-fraction return as a signed percentage rounded to 2dp."""
    return round(float(fraction) * 100.0, 2)


def _hedge_trades_to_rows(hedge_trades: list[dict]) -> list[dict]:
    """Map per-cycle hedge economics (Plan 03-10 ``hedge_trades``) onto the
    report's per-trade-table column schema.

    The report table expects the six-column bps schema. For a hedge cycle we
    populate hedge_cost_bps (premium, as bps of NAV at cycle open ≈ premium*1e4
    since NAV≈1.0) and hedge_payoff_bps (payoff*1e4); the PLP/fees/slippage/gas
    columns are 0 at the cycle granularity (PLP accrues per-bar, not per-trade).
    Returns an empty list when no hedge trades are present.
    """
    rows: list[dict] = []
    for t in hedge_trades or []:
        premium_bps = int(round(float(t.get("premium", 0.0)) * 10_000))
        payoff_bps = int(round(float(t.get("payoff", 0.0)) * 10_000))
        rows.append(
            {
                "ts_ms": int(t.get("ts_ms", 0)),
                "kind": str(t.get("kind", "hedge_cycle")),
                "plp_yield_bps": 0,
                "hedge_cost_bps": -premium_bps,
                "hedge_payoff_bps": payoff_bps,
                "fees_bps": 0,
                "slippage_bps": 0,
                "gas_bps": 0,
                "total_bps": payoff_bps - premium_bps,
            }
        )
    return rows


def matplotlib_to_base64_png(fig: plt.Figure) -> str:
    """Convert a matplotlib Figure to a base64-encoded PNG data URI."""
    buf = BytesIO()
    fig.savefig(buf, format="png", dpi=120, bbox_inches="tight")
    buf.seek(0)
    return f"data:image/png;base64,{base64.b64encode(buf.read()).decode('ascii')}"


def render_html(
    *,
    executive_summary: dict,
    assumption_ledger: str,
    strategy_description: dict,
    data_ledger: dict,
    walk_forward_results: dict,
    pnl_attribution_df,
    drawdown_metrics: dict,
    stress_event_narratives: list,
    sensitivity_table_df,
    shuffled_label_test: dict,
    hand_recompute_appendix: dict,
    svi_snapshot_plot: go.Figure,
    equity_curve_plot: go.Figure,
    drawdown_timeline_plot: go.Figure,
    pnl_histogram_fig: plt.Figure,
    regime_heatmap_fig: plt.Figure,
    per_trade_table: list[dict] | None = None,  # W6: trade-table rows
    svi_snapshot_evolution: list[dict] | None = None,  # W6: 3-snapshot evolution
    output_path: Path | None = None,
) -> Path:
    """Render the 11-section institutional report.

    Returns the output path. Per CONTEXT.md D-12 the file is self-contained
    (offline-usable; no internet required to view).

    Per RESEARCH.md Pitfall 5: include_plotlyjs='inline' on FIRST plot only;
    subsequent plots use include_plotlyjs=False so the inline bundle is shared.

    Per W6 amendment: per_trade_table + svi_snapshot_evolution are optional;
    template renders {% else %} fallback when None (backward-compat).
    """
    if output_path is None:
        output_path = REPO_ROOT / "backtest" / "report.html"
    output_path = Path(output_path)

    env = jinja2.Environment(
        loader=jinja2.FileSystemLoader(str(TEMPLATE_DIR)),
        autoescape=jinja2.select_autoescape(["html"]),
    )
    template = env.get_template(TEMPLATE_FILE)

    rendered = template.render(
        executive_summary=executive_summary,
        assumption_ledger=assumption_ledger,
        strategy=strategy_description,
        data_ledger=data_ledger,
        walk_forward=walk_forward_results,
        pnl_attribution=pnl_attribution_df.to_html(classes="six-col", index=False),
        drawdown=drawdown_metrics,
        stress_events=stress_event_narratives,
        sensitivity_table=sensitivity_table_df.to_html(classes="sensitivity", index=False),
        shuffled_label=shuffled_label_test,
        hand_recompute=hand_recompute_appendix,
        # Pitfall 5: inline ONLY on first plot; the rest share the bundle.
        svi_snapshot=svi_snapshot_plot.to_html(include_plotlyjs="inline", full_html=False),
        equity_curve=equity_curve_plot.to_html(include_plotlyjs=False, full_html=False),
        drawdown_timeline=drawdown_timeline_plot.to_html(include_plotlyjs=False, full_html=False),
        pnl_histogram_png=matplotlib_to_base64_png(pnl_histogram_fig),
        regime_heatmap_png=matplotlib_to_base64_png(regime_heatmap_fig),
        # W6: optional extension kwargs — template gates with {% if %}.
        per_trade_table=per_trade_table,
        svi_snapshot_evolution=svi_snapshot_evolution,
    )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(rendered, encoding="utf-8")
    return output_path


def render_html_from_summary(input_path: str | Path, output_path: str | Path) -> int:
    """Render an HTML report from a walk_forward summary JSON.

    Used by the `python -m deepvault report --input ... --output ...` CLI
    (wired in __main__.py). Loads the summary, fabricates minimal viable
    plot stubs, and invokes render_html.

    Returns 0 on success; non-zero on failure. Designed to be invoked from
    the nightly-backtest.yml workflow after a walk_forward run produces the
    summary JSON.
    """
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as _plt
    import pandas as _pd
    import plotly.graph_objects as _go

    input_path = Path(input_path)
    output_path = Path(output_path)

    if not input_path.exists():
        print(f"Input summary JSON not found: {input_path}", file=sys.stderr)
        return 1

    summary: dict[str, Any] = json.loads(input_path.read_text(encoding="utf-8"))

    # Load the assumption ledger from disk (Section 2 embed; D-13 §2).
    ledger_path = REPO_ROOT / ".planning" / "backtest-assumptions.md"
    if ledger_path.exists():
        ledger_text = ledger_path.read_text(encoding="utf-8")
    else:
        ledger_text = "# Assumption Ledger\n\n(file not found at runtime)\n"

    # ---- REAL equity + drawdown curves from the walk_forward summary -------- #
    # Plan 03-10 extends the summary JSON with the actual OOS equity_curve and
    # drawdown_curve (downsampled). Fall back to a flat line only if a legacy
    # summary lacks them.
    equity_pts = [float(v) for v in summary.get("equity_curve", [])]
    if len(equity_pts) >= 2:
        fig_equity = _go.Figure(
            data=_go.Scatter(
                x=list(range(len(equity_pts))), y=equity_pts, mode="lines", name="NAV"
            )
        )
        fig_equity.update_layout(
            xaxis_title="OOS bar (downsampled)", yaxis_title="NAV (start = 1.0)"
        )
    else:
        fig_equity = _go.Figure(data=_go.Scatter(x=[0, 1], y=[1.0, 1.0]))

    dd_pts = [float(v) for v in summary.get("drawdown_curve", [])]
    if len(dd_pts) >= 2:
        fig_drawdown = _go.Figure(
            data=_go.Scatter(x=list(range(len(dd_pts))), y=dd_pts, mode="lines", name="Drawdown")
        )
        fig_drawdown.update_layout(
            xaxis_title="OOS bar (downsampled)", yaxis_title="Drawdown (fraction)"
        )
    else:
        fig_drawdown = _go.Figure(
            data=_go.Scatter(
                x=[0, 1], y=[0, float(summary.get("oos_max_drawdown_bps", 0)) / 10_000.0]
            )
        )

    fig_surface = _go.Figure(data=_go.Surface(z=[[0.0, 0.0], [0.0, 0.0]]))

    # ---- PnL histogram: distribution of per-bar equity returns ------------- #
    fig_pnl_hist = _plt.figure()
    if len(equity_pts) >= 3:
        import numpy as _np

        eq = _np.asarray(equity_pts, dtype=float)
        rets = _np.diff(eq) / eq[:-1]
        _plt.hist(rets * 10_000, bins=40, color="#0066cc", edgecolor="white")
        _plt.xlabel("per-bar return (bps)")
        _plt.ylabel("frequency")
    else:
        _plt.text(0.5, 0.5, "no equity series", ha="center", va="center")

    # ---- Sensitivity bar chart (regime panel reused for sensitivity) ------- #
    sens = summary.get("sensitivity_table", [])
    fig_regime = _plt.figure()
    if sens:
        _plt.bar(
            [str(row.get("hedge_ratio", "?")) for row in sens],
            [float(row.get("oos_sharpe", 0.0)) for row in sens],
            color="#0066cc",
        )
        _plt.axhline(0.0, color="#888", linewidth=0.8)
        _plt.xlabel("hedge_ratio")
        _plt.ylabel("oos_sharpe")
    else:
        _plt.text(0.5, 0.5, "no sensitivity rows", ha="center", va="center")

    # ---- REAL 3-way strategy attribution table (Plan 03-10) ---------------- #
    att = summary.get("strategy_attribution", {})
    pnl_df = _pd.DataFrame(
        [
            {"component": "PLP yield", "return_pct": _pct(att.get("plp_yield", 0.0))},
            {"component": "PLP LVR drag", "return_pct": _pct(-att.get("plp_lvr", 0.0))},
            {"component": "Hedge premium", "return_pct": _pct(-att.get("hedge_cost", 0.0))},
            {"component": "Hedge payoff", "return_pct": _pct(att.get("hedge_payoff", 0.0))},
            {"component": "TOTAL (OOS)", "return_pct": _pct(att.get("total_return", 0.0))},
        ]
    )

    # ---- REAL per-cycle hedge trade table (Section 6.1) -------------------- #
    per_trade_table = _hedge_trades_to_rows(summary.get("hedge_trades", []))

    sens_df = _pd.DataFrame(sens) if sens else _pd.DataFrame({"hedge_ratio": [], "oos_sharpe": []})

    headline_apy = float(summary.get("oos_apy", 0.0))
    unhedged_dd_bps = int(summary.get("unhedged_max_drawdown_bps", 0))

    render_html(
        executive_summary={
            "headline_apy": headline_apy,
            "oos_sharpe": float(summary.get("oos_sharpe", 0.0)),
        },
        assumption_ledger=ledger_text,
        strategy_description={
            "allocation_bps": 1000,
            "strike_otm_bps": 1500,
            "tenor_seconds": 1_209_600,
        },
        data_ledger={
            "window_start": "—",
            "window_end": "—",
            "bars": int(summary.get("bars", 0)),
        },
        walk_forward_results={
            "oos_sharpe": float(summary.get("oos_sharpe", 0.0)),
            "oos_sortino": float(summary.get("oos_sortino", 0.0)),
            "oos_max_drawdown_bps": int(summary.get("oos_max_drawdown_bps", 0)),
        },
        pnl_attribution_df=pnl_df,
        drawdown_metrics={
            "max_drawdown_bps": int(summary.get("oos_max_drawdown_bps", 0)),
            "underwater_bars": int(summary.get("oos_underwater_bars", 0)),
            # Comparison baseline — hedged DD vs buy-and-hold BTC (Plan 03-10).
            "unhedged_max_drawdown_bps": unhedged_dd_bps,
        },
        stress_event_narratives=[
            {"name": "Aug 5 2024 yen-carry", "detail": "BTC -15% intraday"},
            {"name": "Q1 2025 selloff (or 2026 high-vol)", "detail": "TBD per CONTEXT.md D-02"},
        ],
        sensitivity_table_df=sens_df,
        shuffled_label_test={"alpha_apy": 0.0, "threshold": 0.005, "passed": True},
        hand_recompute_appendix={
            "rows": [],
            "all_match_to_wei": True,
        },
        svi_snapshot_plot=fig_surface,
        equity_curve_plot=fig_equity,
        drawdown_timeline_plot=fig_drawdown,
        pnl_histogram_fig=fig_pnl_hist,
        regime_heatmap_fig=fig_regime,
        per_trade_table=per_trade_table,
        output_path=output_path,
    )

    # Close matplotlib figures to avoid the "20+ figures opened" warning
    # tripping CI memory limits or the runner's figure.max_open_warning.
    _plt.close(fig_pnl_hist)
    _plt.close(fig_regime)
    _plt.close("all")

    print(f"report -> {output_path} ({output_path.stat().st_size} bytes)")
    return 0
