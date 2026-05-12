"""Unit tests for replay.simulate() + replay.replay_trace() + replay.main() (B2 amendment).

Plan 03-06 B2 amendment requires ≥85% coverage on the extended deepvault.replay
module. This file exercises the three new entry points added by Task 2:

  - simulate(market_data, vault, hedge_ratio, decision_fn=None)
  - replay_trace(trace_path, tolerance=1)
  - main(argv=None)  (CLI driven by python -m deepvault.replay)

The fixtures below construct synthetic action traces whose pre/post numbers
match VaultState's actual integer outputs — running them through
VaultState.replay() at 1-wei tolerance is the parity gate this plan ships.

Per CONTEXT.md D-15: any drift > 1 wei means a real Move<->Python bug, not
floating-point noise.
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pandas as pd
import pytest

from deepvault.replay import main, replay_trace, simulate
from deepvault.vault_state import VaultState

REPO_ROOT = Path(__file__).resolve().parents[2]
MICRO_FIXTURE = REPO_ROOT / "backtest" / "traces" / "micro-fixture-7d.json"


# ============================================================
# Helpers — build a 3-action trace that matches VaultState.replay().
# ============================================================


def _synthetic_3_action_trace() -> dict:
    """Build a fixture whose pre/post are computed by running the Python
    VaultState forward; replay_trace() should return (0, []) on this input."""
    v = VaultState.new_seeded()
    actions: list[dict] = []

    pre1 = (v.balance, v.total_assets, v.total_shares)
    v.supply(100_000_000)
    post1 = (v.balance, v.total_assets, v.total_shares)
    actions.append(
        {
            "kind": "supply",
            "tx_digest": "0xaaaa01",
            "ts_ms": 1_717_545_600_000,
            "args": {"deposit_quote": "100000000"},
            "pre": {
                "balance": str(pre1[0]),
                "total_assets": str(pre1[1]),
                "total_shares": str(pre1[2]),
            },
            "post": {
                "balance": str(post1[0]),
                "total_assets": str(post1[1]),
                "total_shares": str(post1[2]),
            },
            "events": [],
        }
    )

    pre2 = post1
    v.supply(50_000_000)
    post2 = (v.balance, v.total_assets, v.total_shares)
    actions.append(
        {
            "kind": "supply",
            "tx_digest": "0xaaaa02",
            "ts_ms": 1_717_549_200_000,
            "args": {"deposit_quote": "50000000"},
            "pre": {
                "balance": str(pre2[0]),
                "total_assets": str(pre2[1]),
                "total_shares": str(pre2[2]),
            },
            "post": {
                "balance": str(post2[0]),
                "total_assets": str(post2[1]),
                "total_shares": str(post2[2]),
            },
            "events": [],
        }
    )

    pre3 = post2
    v.redeem_request("0xb2", 5_000_000, 1_717_552_800_000)
    post3 = (v.balance, v.total_assets, v.total_shares)
    actions.append(
        {
            "kind": "redeem_request",
            "tx_digest": "0xaaaa03",
            "ts_ms": 1_717_552_800_000,
            "args": {"user": "0xb2", "shares": "5000000"},
            "pre": {
                "balance": str(pre3[0]),
                "total_assets": str(pre3[1]),
                "total_shares": str(pre3[2]),
            },
            "post": {
                "balance": str(post3[0]),
                "total_assets": str(post3[1]),
                "total_shares": str(post3[2]),
            },
            "events": [],
        }
    )

    return {
        "vault_id": "0x" + "00" * 31 + "01",
        "package_id": "0x" + "00" * 31 + "02",
        "actions": actions,
    }


@pytest.fixture
def synthetic_trace_path(tmp_path: Path) -> Path:
    """Write a 3-action synthetic trace whose pre/post match VaultState exactly."""
    trace = _synthetic_3_action_trace()
    path = tmp_path / "trace.json"
    path.write_text(json.dumps(trace, indent=2), encoding="utf-8")
    return path


# ============================================================
# simulate()
# ============================================================


def test_simulate_replay_only_path():
    """`simulate` with `decision_fn=None` walks the bars without mutating vault."""
    df = pd.DataFrame({"ts": [0, 60_000, 120_000], "spot": [60_000, 60_500, 61_000]})
    v = VaultState.new_seeded()
    v.supply(100_000_000)
    pre_nav = v.nav_per_share()
    result = simulate(df, v, hedge_ratio=0.10, decision_fn=None)
    assert result["bars"] == 3
    assert len(result["per_bar_nav"]) == 3
    # No decision_fn -> no state mutation -> NAV constant.
    assert all(nav == pre_nav for nav in result["per_bar_nav"])
    assert result["final_nav_per_share"] == pre_nav
    assert result["total_return"] == pytest.approx(0.0)


def test_simulate_with_decision_fn():
    """`simulate` invokes decision_fn per bar; returned actions are replayed."""
    # Pre-seed vault with one supply so total_shares > 0 and we have a
    # non-trivial pre-NAV. The decision_fn fires on bar index 0 only.
    v = VaultState.new_seeded()
    v.supply(100_000_000)
    df = pd.DataFrame({"ts": [0, 60_000, 120_000], "spot": [60_000, 60_500, 61_000]})

    fired: list[int] = []

    def decision_fn(bar, vault, hedge_ratio):
        fired.append(int(bar["ts"]))
        # Return EMPTY action list — we only verify decision_fn is invoked
        # with the right shape (passing actions through vault.replay() needs
        # a matching pre/post which this synthetic per-bar caller does not
        # construct; the parity test covers that path separately).
        return []

    result = simulate(df, v, hedge_ratio=0.10, decision_fn=decision_fn)
    assert fired == [0, 60_000, 120_000]
    assert result["bars"] == 3


def test_simulate_empty_data():
    """Empty DataFrame returns bars=0 without crashing."""
    df = pd.DataFrame({"ts": [], "spot": []})
    v = VaultState.new_seeded()
    v.supply(100_000_000)
    result = simulate(df, v, hedge_ratio=0.10)
    assert result["bars"] == 0
    assert result["per_bar_nav"] == []
    # final_nav_per_share == pre_nav (vault was never touched).
    assert result["final_nav_per_share"] == v.nav_per_share()
    assert result["total_return"] == pytest.approx(0.0)


def test_simulate_handles_zero_share_vault():
    """A fresh-but-empty vault (no shares) returns pre_nav=0, total_return=0.0."""
    # Bypass new_seeded() to construct a literally-empty vault.
    v = VaultState()
    df = pd.DataFrame({"ts": [0, 1, 2], "spot": [1, 2, 3]})
    result = simulate(df, v, hedge_ratio=0.10)
    assert result["bars"] == 3
    assert result["per_bar_nav"] == [0, 0, 0]
    assert result["final_nav_per_share"] == 0
    assert result["total_return"] == pytest.approx(0.0)


# ============================================================
# replay_trace()
# ============================================================


def test_replay_trace_success_path(synthetic_trace_path: Path):
    """Synthetic 3-action trace replays bit-equal — mismatch_count == 0."""
    mismatches, errors = replay_trace(synthetic_trace_path)
    assert mismatches == 0
    assert errors == []


def test_replay_trace_mismatch_path(tmp_path: Path):
    """Perturbing one action's post.balance triggers a mismatch with rich detail."""
    trace = _synthetic_3_action_trace()
    # Inject a +1000-wei drift on action[1].post.balance.
    bad = int(trace["actions"][1]["post"]["balance"]) + 1000
    trace["actions"][1]["post"]["balance"] = str(bad)
    path = tmp_path / "tampered.json"
    path.write_text(json.dumps(trace, indent=2), encoding="utf-8")

    mismatches, errors = replay_trace(path)
    assert mismatches >= 1
    # The first error should reference action index 1 and a balance mismatch.
    assert any("Action[1]" in err and "balance" in err for err in errors)


def test_replay_trace_missing_file(tmp_path: Path):
    """A non-existent path raises FileNotFoundError cleanly (NOT swallowed)."""
    bogus = tmp_path / "does_not_exist.json"
    with pytest.raises(FileNotFoundError, match="Action trace not found"):
        replay_trace(bogus)


def test_replay_trace_empty_actions(tmp_path: Path):
    """A well-formed trace with `actions: []` returns mismatch_count=0 + advisory msg."""
    path = tmp_path / "empty.json"
    path.write_text(json.dumps({"actions": []}), encoding="utf-8")
    mismatches, errors = replay_trace(path)
    assert mismatches == 0
    # One advisory message recording the no-action condition.
    assert len(errors) == 1
    assert "No actions" in errors[0]


# ============================================================
# main() — CLI
# ============================================================


def test_cli_help_exits_0():
    """`python -m deepvault.replay --help` exits 0 (folded from the original
    verify-command smoke check per B2 amendment)."""
    result = subprocess.run(
        [sys.executable, "-m", "deepvault.replay", "--help"],
        cwd=str(REPO_ROOT / "backtest"),
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0
    assert "--trace" in result.stdout


def test_cli_with_trace_arg_success(synthetic_trace_path: Path):
    """`python -m deepvault.replay --trace <good>` exits 0 + prints PASS."""
    # Drive main() in-process so we measure the CLI's return value directly.
    rc = main(["--trace", str(synthetic_trace_path)])
    assert rc == 0


def test_cli_with_trace_arg_mismatch(tmp_path: Path, capsys):
    """`python -m deepvault.replay --trace <bad>` exits 1 on mismatch."""
    trace = _synthetic_3_action_trace()
    trace["actions"][0]["post"]["balance"] = str(
        int(trace["actions"][0]["post"]["balance"]) + 1000
    )
    path = tmp_path / "bad.json"
    path.write_text(json.dumps(trace, indent=2), encoding="utf-8")
    rc = main(["--trace", str(path)])
    assert rc == 1
    captured = capsys.readouterr()
    assert "FAIL" in captured.err


def test_cli_with_missing_trace_returns_1(tmp_path: Path, capsys):
    """CLI returns 1 (not raises) when the trace file is missing."""
    rc = main(["--trace", str(tmp_path / "nope.json")])
    assert rc == 1
    captured = capsys.readouterr()
    assert "FAIL" in captured.err


def test_cli_with_micro_fixture():
    """The bundled micro-fixture (Plan 03-06 Task 3) replays cleanly via the CLI.

    Skipped only if the fixture file is not present (e.g. when this test
    file is exercised in isolation BEFORE Task 3 lands). On a normal
    plan-end verifier pass, the fixture exists and this test gates the
    full CLI->VaultState->parity round trip.
    """
    if not MICRO_FIXTURE.exists():
        pytest.skip(f"Micro-fixture not yet created: {MICRO_FIXTURE}")
    rc = main(["--trace", str(MICRO_FIXTURE)])
    assert rc == 0
