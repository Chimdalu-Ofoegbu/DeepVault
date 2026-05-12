"""Shared pytest fixtures for the deepvault-backtest test suite.

Currently scoped to test-environment hygiene:
- Force matplotlib's Agg backend BEFORE any test imports pyplot (headless
  Linux CI runners have no DISPLAY; default TkAgg fails).
- Auto-close all matplotlib figures after each test so the figure count
  doesn't accumulate past matplotlib's max_open_warning (20) and trip
  Linux CI memory ceilings.
"""

from __future__ import annotations

import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt  # noqa: E402 — backend setup must precede pyplot import
import pytest  # noqa: E402


@pytest.fixture(autouse=True)
def _close_matplotlib_figures():
    """Close every matplotlib figure after each test."""
    yield
    plt.close("all")
