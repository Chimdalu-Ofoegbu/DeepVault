"""End-to-end report rendering test (W5 closure).

Loads the 7-day micro-fixture, runs simulate() + compute_attribution() +
render_html(), and asserts the resulting HTML contains all 11 D-13 section
headings AND is non-trivial in size (>=50KB).

This is the e2e gate that proves the full Plan 03-09 closure pipeline
(fixture -> simulate -> attribution -> render) produces a usable report.
"""

from __future__ import annotations

import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pandas as pd
import plotly.graph_objects as go

from deepvault.pnl_attribution import compute_attribution
from deepvault.replay import simulate
from deepvault.report import render_html
from deepvault.vault_state import VaultState

REPO_ROOT = Path(__file__).resolve().parents[2]
MICRO_FIXTURE = REPO_ROOT / "backtest" / "traces" / "micro-fixture-7d.json"


def _build_market_data(actions: list[dict]) -> pd.DataFrame:
    """Build a market-data DataFrame stand-in from the trace's action timestamps."""
    rows = []
    for a in actions:
        rows.append(
            {
                "ts_ms": int(a["ts_ms"]),
                "open": 60_000.0,
                "close": 60_000.0,
                "volume_btc": 100.0,
                "volume_usdt": 6_000_000.0,
            }
        )
    return pd.DataFrame(rows)


def test_e2e_render_micro_fixture(tmp_path):
    """E2E: micro-fixture -> simulate -> attribution -> render_html, file written."""
    assert MICRO_FIXTURE.exists(), f"micro-fixture not found at {MICRO_FIXTURE}"
    trace_data = json.loads(MICRO_FIXTURE.read_text(encoding="utf-8"))
    actions = trace_data["actions"]
    md = _build_market_data(actions)

    vault = VaultState.new_seeded()
    simulate(md, vault, hedge_ratio=0.10, decision_fn=None)

    attribution_df = compute_attribution(actions, md)

    out = tmp_path / "e2e-report.html"
    fig_surface = go.Figure(data=go.Surface(z=[[1, 2], [3, 4]]))
    fig_equity = go.Figure(data=go.Scatter(x=[0, 1], y=[100, 105]))
    fig_drawdown = go.Figure(data=go.Scatter(x=[0, 1], y=[0, -0.02]))
    fig_pnl_hist = plt.figure()
    fig_regime = plt.figure()

    render_html(
        executive_summary={"headline_apy": 0.05, "oos_sharpe": 1.0},
        assumption_ledger="# Assumption Ledger\n\navailable_at: hourly\n",
        strategy_description={
            "allocation_bps": 1000,
            "strike_otm_bps": 1500,
            "tenor_seconds": 1_209_600,
        },
        data_ledger={
            "window_start": "2025-05-11",
            "window_end": "2025-05-18",
            "bars": len(md),
        },
        walk_forward_results={
            "oos_sharpe": 1.0,
            "oos_sortino": 1.2,
            "oos_max_drawdown_bps": -200,
        },
        pnl_attribution_df=attribution_df,
        drawdown_metrics={"max_drawdown_bps": -200, "underwater_bars": 24},
        stress_event_narratives=[{"name": "micro-fixture stress", "detail": "synthetic"}],
        sensitivity_table_df=pd.DataFrame({"hedge_ratio": [0.05, 0.10], "oos_sharpe": [1.0, 1.0]}),
        shuffled_label_test={
            "alpha_apy": 0.001,
            "threshold": 0.005,
            "passed": True,
        },
        hand_recompute_appendix={"rows": [0, 1, 2], "all_match_to_wei": True},
        svi_snapshot_plot=fig_surface,
        equity_curve_plot=fig_equity,
        drawdown_timeline_plot=fig_drawdown,
        pnl_histogram_fig=fig_pnl_hist,
        regime_heatmap_fig=fig_regime,
        # W6: per-trade table populated from attribution_df
        per_trade_table=(
            attribution_df.to_dict(orient="records") if not attribution_df.empty else []
        ),
        svi_snapshot_evolution=[
            {
                "label": "Start of window",
                "plot_html": fig_surface.to_html(include_plotlyjs=False, full_html=False),
            },
            {
                "label": "Mid window",
                "plot_html": fig_surface.to_html(include_plotlyjs=False, full_html=False),
            },
            {
                "label": "End of window",
                "plot_html": fig_surface.to_html(include_plotlyjs=False, full_html=False),
            },
        ],
        output_path=out,
    )

    assert out.exists(), "e2e report file was not written"


def test_html_contains_all_11_d13_sections(tmp_path):
    """All 11 D-13 section anchors must be present in the rendered HTML."""
    assert MICRO_FIXTURE.exists()
    trace_data = json.loads(MICRO_FIXTURE.read_text(encoding="utf-8"))
    actions = trace_data["actions"]
    md = _build_market_data(actions)

    vault = VaultState.new_seeded()
    simulate(md, vault, hedge_ratio=0.10, decision_fn=None)
    attribution_df = compute_attribution(actions, md)

    out = tmp_path / "e2e-report.html"
    render_html(
        executive_summary={"headline_apy": 0.05, "oos_sharpe": 1.0},
        assumption_ledger="# Assumption Ledger\n\navailable_at: hourly\n",
        strategy_description={
            "allocation_bps": 1000,
            "strike_otm_bps": 1500,
            "tenor_seconds": 1_209_600,
        },
        data_ledger={
            "window_start": "2025-05-11",
            "window_end": "2025-05-18",
            "bars": len(md),
        },
        walk_forward_results={
            "oos_sharpe": 1.0,
            "oos_sortino": 1.2,
            "oos_max_drawdown_bps": -200,
        },
        pnl_attribution_df=attribution_df,
        drawdown_metrics={"max_drawdown_bps": -200, "underwater_bars": 24},
        stress_event_narratives=[{"name": "micro-fixture stress", "detail": "synthetic"}],
        sensitivity_table_df=pd.DataFrame({"hedge_ratio": [0.05, 0.10], "oos_sharpe": [1.0, 1.0]}),
        shuffled_label_test={
            "alpha_apy": 0.001,
            "threshold": 0.005,
            "passed": True,
        },
        hand_recompute_appendix={"rows": [0, 1, 2], "all_match_to_wei": True},
        svi_snapshot_plot=go.Figure(data=go.Surface(z=[[1, 2], [3, 4]])),
        equity_curve_plot=go.Figure(data=go.Scatter(x=[0, 1], y=[100, 105])),
        drawdown_timeline_plot=go.Figure(data=go.Scatter(x=[0, 1], y=[0, -0.02])),
        pnl_histogram_fig=plt.figure(),
        regime_heatmap_fig=plt.figure(),
        output_path=out,
    )

    html = out.read_text(encoding="utf-8")
    expected_section_anchors = [
        "Executive Summary",
        "Assumption Ledger",
        "Strategy Description",
        "Data Ledger",
        "Walk-Forward Methodology",
        "PnL Attribution",
        "Drawdown",
        "Stress Event",
        "Sensitivity Table",
        "Shuffled-Label",
        "Hand Recompute",
    ]
    for anchor in expected_section_anchors:
        assert anchor in html, f"Section '{anchor}' missing from e2e report"


def test_html_size_at_least_50kb(tmp_path):
    """E2E HTML file size >= 50 KB — proves non-empty rendering."""
    assert MICRO_FIXTURE.exists()
    trace_data = json.loads(MICRO_FIXTURE.read_text(encoding="utf-8"))
    actions = trace_data["actions"]
    md = _build_market_data(actions)

    vault = VaultState.new_seeded()
    simulate(md, vault, hedge_ratio=0.10, decision_fn=None)
    attribution_df = compute_attribution(actions, md)

    out = tmp_path / "e2e-report.html"
    render_html(
        executive_summary={"headline_apy": 0.05, "oos_sharpe": 1.0},
        assumption_ledger="# Assumption Ledger\n\navailable_at: hourly\n",
        strategy_description={
            "allocation_bps": 1000,
            "strike_otm_bps": 1500,
            "tenor_seconds": 1_209_600,
        },
        data_ledger={
            "window_start": "2025-05-11",
            "window_end": "2025-05-18",
            "bars": len(md),
        },
        walk_forward_results={
            "oos_sharpe": 1.0,
            "oos_sortino": 1.2,
            "oos_max_drawdown_bps": -200,
        },
        pnl_attribution_df=attribution_df,
        drawdown_metrics={"max_drawdown_bps": -200, "underwater_bars": 24},
        stress_event_narratives=[{"name": "micro-fixture stress", "detail": "synthetic"}],
        sensitivity_table_df=pd.DataFrame({"hedge_ratio": [0.05, 0.10], "oos_sharpe": [1.0, 1.0]}),
        shuffled_label_test={
            "alpha_apy": 0.001,
            "threshold": 0.005,
            "passed": True,
        },
        hand_recompute_appendix={"rows": [0, 1, 2], "all_match_to_wei": True},
        svi_snapshot_plot=go.Figure(data=go.Surface(z=[[1, 2], [3, 4]])),
        equity_curve_plot=go.Figure(data=go.Scatter(x=[0, 1], y=[100, 105])),
        drawdown_timeline_plot=go.Figure(data=go.Scatter(x=[0, 1], y=[0, -0.02])),
        pnl_histogram_fig=plt.figure(),
        regime_heatmap_fig=plt.figure(),
        output_path=out,
    )

    size_kb = out.stat().st_size / 1_000
    assert size_kb >= 50, (
        f"E2E report size {size_kb:.1f} KB < 50 KB; suggests template rendered empty"
    )
