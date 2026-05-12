"""HTML report rendering tests (BACK-10).

Per CONTEXT.md D-12: single self-contained HTML file.
Per CONTEXT.md D-13: 11 sections in order.
Per RESEARCH.md Pitfall 5: inline plotlyjs ONLY on first plot; file size < 5 MB.
"""

from __future__ import annotations

from pathlib import Path

import matplotlib

matplotlib.use("Agg")  # headless backend for CI
import matplotlib.pyplot as plt
import pandas as pd
import plotly.graph_objects as go
import pytest
from bs4 import BeautifulSoup

from deepvault.report import matplotlib_to_base64_png, render_html

REPO_ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture
def synthetic_inputs():
    return {
        "executive_summary": {"headline_apy": 0.082, "oos_sharpe": 1.15},
        "assumption_ledger": (
            "# Test Assumption Ledger\n\nTest content with available_at semantics."
        ),
        "strategy_description": {
            "allocation_bps": 1000,
            "strike_otm_bps": 1500,
            "tenor_seconds": 1_209_600,
        },
        "data_ledger": {
            "window_start": "2025-05-11",
            "window_end": "2026-05-11",
            "bars": 8760,
        },
        "walk_forward_results": {
            "oos_sharpe": 1.15,
            "oos_sortino": 1.40,
            "oos_max_drawdown_bps": -825,
        },
        "pnl_attribution_df": pd.DataFrame(
            [
                {
                    "plp_yield_bps": 0,
                    "hedge_cost_bps": -100,
                    "hedge_payoff_bps": 80,
                    "fees_bps": 0,
                    "slippage_bps": -10,
                    "gas_bps": -1,
                    "total_bps": -31,
                }
            ]
        ),
        "drawdown_metrics": {"max_drawdown_bps": -825, "underwater_bars": 168},
        "stress_event_narratives": [
            {"name": "Aug 5 2024 yen-carry", "detail": "BTC -15% intraday"},
            {"name": "Q1 2025 selloff", "detail": "TBD"},
        ],
        "sensitivity_table_df": pd.DataFrame(
            {
                "hedge_ratio": [0.05, 0.10, 0.15, 0.20, 0.30],
                "oos_sharpe": [1.0, 1.15, 1.10, 1.05, 0.95],
            }
        ),
        "shuffled_label_test": {
            "alpha_apy": 0.001,
            "threshold": 0.005,
            "passed": True,
        },
        "hand_recompute_appendix": {
            "rows": [10, 250, 8000],
            "all_match_to_wei": True,
        },
    }


@pytest.fixture
def synthetic_plots():
    fig_surface = go.Figure(data=go.Surface(z=[[1, 2], [3, 4]]))
    fig_equity = go.Figure(data=go.Scatter(x=[0, 1], y=[100, 105]))
    fig_drawdown = go.Figure(data=go.Scatter(x=[0, 1], y=[0, -0.05]))
    fig_pnl_hist = plt.figure()
    plt.hist([0.01, -0.005, 0.02, -0.01])
    fig_regime = plt.figure()
    plt.imshow([[1, 2], [3, 4]])
    return fig_surface, fig_equity, fig_drawdown, fig_pnl_hist, fig_regime


def test_matplotlib_to_base64_png_returns_data_uri():
    fig = plt.figure()
    plt.plot([1, 2, 3])
    uri = matplotlib_to_base64_png(fig)
    assert uri.startswith("data:image/png;base64,")


def test_render_html_creates_file(tmp_path, synthetic_inputs, synthetic_plots):
    surf, eq, dd, ph, rh = synthetic_plots
    out = tmp_path / "report.html"
    render_html(
        **synthetic_inputs,
        svi_snapshot_plot=surf,
        equity_curve_plot=eq,
        drawdown_timeline_plot=dd,
        pnl_histogram_fig=ph,
        regime_heatmap_fig=rh,
        output_path=out,
    )
    assert out.exists()


def test_render_html_contains_all_11_sections(tmp_path, synthetic_inputs, synthetic_plots):
    surf, eq, dd, ph, rh = synthetic_plots
    out = tmp_path / "report.html"
    render_html(
        **synthetic_inputs,
        svi_snapshot_plot=surf,
        equity_curve_plot=eq,
        drawdown_timeline_plot=dd,
        pnl_histogram_fig=ph,
        regime_heatmap_fig=rh,
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
        assert anchor in html, f"Section '{anchor}' missing from report"


def test_render_html_file_size_under_5mb(tmp_path, synthetic_inputs, synthetic_plots):
    """Per RESEARCH.md Pitfall 5: include_plotlyjs='inline' on first plot only."""
    surf, eq, dd, ph, rh = synthetic_plots
    out = tmp_path / "report.html"
    render_html(
        **synthetic_inputs,
        svi_snapshot_plot=surf,
        equity_curve_plot=eq,
        drawdown_timeline_plot=dd,
        pnl_histogram_fig=ph,
        regime_heatmap_fig=rh,
        output_path=out,
    )
    size_mb = out.stat().st_size / 1_000_000
    assert size_mb < 5, f"Report size {size_mb:.2f} MB exceeds 5 MB ceiling (Pitfall 5)"


def test_render_html_is_valid_html(tmp_path, synthetic_inputs, synthetic_plots):
    surf, eq, dd, ph, rh = synthetic_plots
    out = tmp_path / "report.html"
    render_html(
        **synthetic_inputs,
        svi_snapshot_plot=surf,
        equity_curve_plot=eq,
        drawdown_timeline_plot=dd,
        pnl_histogram_fig=ph,
        regime_heatmap_fig=rh,
        output_path=out,
    )
    html_text = out.read_text(encoding="utf-8")
    soup = BeautifulSoup(html_text, "html.parser")
    # If parsing didn't raise, the HTML is well-formed enough for browsers.
    assert soup.find("html") is not None or soup.find("body") is not None or "<head" in html_text


def test_assumption_ledger_embedded_verbatim(tmp_path, synthetic_inputs, synthetic_plots):
    """Per CONTEXT.md D-13 §2: assumption ledger embedded into the report."""
    surf, eq, dd, ph, rh = synthetic_plots
    out = tmp_path / "report.html"
    render_html(
        **synthetic_inputs,
        svi_snapshot_plot=surf,
        equity_curve_plot=eq,
        drawdown_timeline_plot=dd,
        pnl_histogram_fig=ph,
        regime_heatmap_fig=rh,
        output_path=out,
    )
    html = out.read_text(encoding="utf-8")
    assert "available_at" in html  # the ledger's load-bearing semantics


def test_render_html_returns_output_path(tmp_path, synthetic_inputs, synthetic_plots):
    """render_html returns the output_path it wrote to."""
    surf, eq, dd, ph, rh = synthetic_plots
    out = tmp_path / "report.html"
    result = render_html(
        **synthetic_inputs,
        svi_snapshot_plot=surf,
        equity_curve_plot=eq,
        drawdown_timeline_plot=dd,
        pnl_histogram_fig=ph,
        regime_heatmap_fig=rh,
        output_path=out,
    )
    assert result == out


def test_render_html_with_per_trade_table(tmp_path, synthetic_inputs, synthetic_plots):
    """W6: per_trade_table kwarg populates Section 6.1 trade-table block."""
    surf, eq, dd, ph, rh = synthetic_plots
    out = tmp_path / "report.html"
    per_trade = [
        {
            "ts_ms": 1_700_000_000_000,
            "kind": "supply",
            "plp_yield_bps": 0,
            "hedge_cost_bps": -100,
            "hedge_payoff_bps": 0,
            "fees_bps": 0,
            "slippage_bps": -10,
            "gas_bps": -1,
            "total_bps": -111,
        }
    ]
    render_html(
        **synthetic_inputs,
        svi_snapshot_plot=surf,
        equity_curve_plot=eq,
        drawdown_timeline_plot=dd,
        pnl_histogram_fig=ph,
        regime_heatmap_fig=rh,
        per_trade_table=per_trade,
        output_path=out,
    )
    html = out.read_text(encoding="utf-8")
    assert "trade-table" in html
    assert "1700000000000" in html
    assert "supply" in html


def test_render_html_with_svi_evolution(tmp_path, synthetic_inputs, synthetic_plots):
    """W6: svi_snapshot_evolution kwarg populates Section 8.1 surface-evolution block."""
    surf, eq, dd, ph, rh = synthetic_plots
    out = tmp_path / "report.html"
    evolution = [
        {"label": "Start of window", "plot_html": "<div>start-snapshot</div>"},
        {"label": "Mid window", "plot_html": "<div>mid-snapshot</div>"},
        {"label": "End of window", "plot_html": "<div>end-snapshot</div>"},
    ]
    render_html(
        **synthetic_inputs,
        svi_snapshot_plot=surf,
        equity_curve_plot=eq,
        drawdown_timeline_plot=dd,
        pnl_histogram_fig=ph,
        regime_heatmap_fig=rh,
        svi_snapshot_evolution=evolution,
        output_path=out,
    )
    html = out.read_text(encoding="utf-8")
    assert "Start of window" in html
    assert "Mid window" in html
    assert "End of window" in html
    assert "start-snapshot" in html


def test_render_html_from_summary(tmp_path):
    """CLI-helper path: writes a real HTML report from a walk_forward summary JSON."""
    from deepvault.report import render_html_from_summary

    summary = {
        "window_days": 7,
        "bars": 168,
        "oos_sharpe": 1.15,
        "oos_sortino": 1.40,
        "oos_max_drawdown_bps": -300,
        "oos_underwater_bars": 12,
        "sensitivity_table": [
            {"hedge_ratio": 0.05, "oos_sharpe": 1.0},
            {"hedge_ratio": 0.10, "oos_sharpe": 1.15},
        ],
        "pnl_attribution_summary": {
            "total_bps_mean": -5.2,
            "total_bps_min": -100.0,
            "total_bps_max": 80.0,
        },
    }
    input_json = tmp_path / "summary.json"
    input_json.write_text(__import__("json").dumps(summary), encoding="utf-8")
    output_html = tmp_path / "report-from-summary.html"

    rc = render_html_from_summary(input_json, output_html)
    assert rc == 0
    assert output_html.exists()
    html = output_html.read_text(encoding="utf-8")
    assert "Executive Summary" in html
    assert "Hand Recompute" in html


def test_render_html_from_summary_missing_input(tmp_path):
    """render_html_from_summary returns non-zero when input JSON missing."""
    from deepvault.report import render_html_from_summary

    missing = tmp_path / "does-not-exist.json"
    out = tmp_path / "report.html"
    rc = render_html_from_summary(missing, out)
    assert rc != 0
    assert not out.exists()
