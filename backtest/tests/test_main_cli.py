"""CLI tests for ``python -m deepvault`` (Task 3 W4 lock).

Closes the BACK-05 nightly-backtest gap: Plan 03-09's nightly-backtest.yml
invokes ``python -m deepvault walk_forward --window-days 365 --out reports/...``;
this test asserts the CLI surface exists, --help exits 0, and a micro
walk_forward run produces a valid summary JSON in under 30 seconds.
"""

from __future__ import annotations

import json
import subprocess
import sys
import time

import numpy as np
import pandas as pd

from deepvault import __main__ as main_mod


def _synthetic_btc_data(n_bars: int = 7 * 24) -> pd.DataFrame:
    rng = np.random.default_rng(7)
    ts_ms = np.arange(n_bars, dtype=np.int64) * 3_600_000 + 1_700_000_000_000
    log_returns = rng.normal(0, 0.005, n_bars)
    close = 60_000 * np.exp(np.cumsum(log_returns))
    return pd.DataFrame(
        {
            "ts_ms": ts_ms,
            "available_at": ts_ms + 3_600_001,
            "open": close,
            "high": close * 1.005,
            "low": close * 0.995,
            "close": close,
            "volume_btc": np.full(n_bars, 100.0),
            "volume_usdt": np.full(n_bars, 6_000_000.0),
        }
    )


# --------------------------------------------------------------------- --help


def test_help_exits_0():
    """`python -m deepvault --help` returns 0."""
    proc = subprocess.run(
        [sys.executable, "-m", "deepvault", "--help"],
        capture_output=True,
        text=True,
        timeout=30,
    )
    assert proc.returncode == 0, f"stderr: {proc.stderr}"
    # Both subcommands must be discoverable from the top-level help text.
    assert "walk_forward" in proc.stdout
    assert "report" in proc.stdout


def test_walk_forward_help_exits_0():
    """`python -m deepvault walk_forward --help` returns 0 and prints required flags."""
    proc = subprocess.run(
        [sys.executable, "-m", "deepvault", "walk_forward", "--help"],
        capture_output=True,
        text=True,
        timeout=30,
    )
    assert proc.returncode == 0, f"stderr: {proc.stderr}"
    assert "--window-days" in proc.stdout
    assert "--out" in proc.stdout


def test_report_help_exits_0():
    """`python -m deepvault report --help` returns 0."""
    proc = subprocess.run(
        [sys.executable, "-m", "deepvault", "report", "--help"],
        capture_output=True,
        text=True,
        timeout=30,
    )
    assert proc.returncode == 0, f"stderr: {proc.stderr}"
    assert "--input" in proc.stdout
    assert "--output" in proc.stdout


# --------------------------------------------------------------------- in-process invocation


def test_walk_forward_micro_run(tmp_path, monkeypatch):
    """`python -m deepvault walk_forward --window-days 7 --out tmp/micro.json`
    against a stubbed data_ingest.fetch_btc_hourly returns 0 in <30 seconds
    AND produces a valid JSON output containing the required keys."""
    fake_data = _synthetic_btc_data()

    def fake_fetch(force_redownload: bool = False) -> pd.DataFrame:
        return fake_data

    def fake_load(start_ts_ms: int, end_ts_ms: int) -> pd.DataFrame:
        return fake_data.loc[
            (fake_data["ts_ms"] > start_ts_ms) & (fake_data["ts_ms"] <= end_ts_ms)
        ].reset_index(drop=True)

    monkeypatch.setattr(main_mod, "load_window", fake_load)
    # Patch the lazy fetch_btc_hourly the helper uses for the endpoint discovery.
    import deepvault.data_ingest as di

    monkeypatch.setattr(di, "fetch_btc_hourly", fake_fetch)

    out_path = tmp_path / "micro.json"
    start = time.perf_counter()
    rc = main_mod.main(["walk_forward", "--window-days", "7", "--out", str(out_path)])
    elapsed = time.perf_counter() - start

    assert rc == 0
    assert elapsed < 30.0, f"micro walk_forward took {elapsed:.1f}s (>30s budget)"
    assert out_path.exists()

    summary = json.loads(out_path.read_text(encoding="utf-8"))
    for key in (
        "oos_sharpe",
        "oos_sortino",
        "oos_max_drawdown_bps",
        "sensitivity_table",
        "bars",
        "window_days",
    ):
        assert key in summary, f"missing key {key!r} in summary {summary!r}"
    assert summary["window_days"] == 7
    assert isinstance(summary["sensitivity_table"], list)


def test_walk_forward_handles_empty_data(tmp_path, monkeypatch):
    """When data_ingest returns an empty frame, the CLI emits a valid JSON
    with bars=0 instead of crashing."""

    empty = pd.DataFrame(
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

    def fake_fetch(force_redownload: bool = False) -> pd.DataFrame:
        return empty

    import deepvault.data_ingest as di

    monkeypatch.setattr(di, "fetch_btc_hourly", fake_fetch)

    out_path = tmp_path / "empty.json"
    rc = main_mod.main(["walk_forward", "--window-days", "7", "--out", str(out_path)])
    assert rc == 0
    assert out_path.exists()
    summary = json.loads(out_path.read_text(encoding="utf-8"))
    assert summary["bars"] == 0
    assert summary["oos_sharpe"] == 0.0


def test_report_subcommand_succeeds_after_plan_03_09(tmp_path):
    """report subcommand returns 0 and writes HTML when given a valid summary
    JSON. Plan 03-09 wired deepvault.report.render_html_from_summary; before
    Plan 03-09 this returned 1 with an "module not installed" stderr message.
    """
    input_path = tmp_path / "in.json"
    # Minimal walk_forward summary shape (matches __main__.py output schema).
    input_path.write_text(
        '{"window_days": 7, "bars": 168, "oos_sharpe": 1.0, "oos_sortino": 1.2,'
        ' "oos_max_drawdown_bps": -200, "oos_underwater_bars": 12,'
        ' "sensitivity_table": [], "pnl_attribution_summary":'
        ' {"total_bps_mean": 0.0, "total_bps_min": 0.0, "total_bps_max": 0.0}}',
        encoding="utf-8",
    )
    out_path = tmp_path / "out.html"
    rc = main_mod.main(["report", "--input", str(input_path), "--output", str(out_path)])
    assert rc == 0
    assert out_path.exists()
    # Sanity-check the rendered HTML contains key section anchors.
    html = out_path.read_text(encoding="utf-8")
    assert "Executive Summary" in html
    assert "Hand Recompute" in html


def test_report_subcommand_returns_nonzero_when_input_missing(tmp_path):
    """report subcommand returns non-zero when --input path doesn't exist."""
    missing = tmp_path / "does-not-exist.json"
    out_path = tmp_path / "out.html"
    rc = main_mod.main(["report", "--input", str(missing), "--output", str(out_path)])
    assert rc != 0
    assert not out_path.exists()


def test_missing_subcommand_exits_nonzero():
    """`python -m deepvault` (no subcommand) exits non-zero."""
    proc = subprocess.run(
        [sys.executable, "-m", "deepvault"],
        capture_output=True,
        text=True,
        timeout=30,
    )
    assert proc.returncode != 0
