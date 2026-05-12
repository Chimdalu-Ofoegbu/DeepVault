"""Move<->Python trace-replay parity tests (BACK-04).

Loads backtest/traces/micro-fixture-7d.json and asserts that VaultState.replay()
reproduces every action's post-state within 1 wei.

Per RESEARCH.md Pitfall 2: the loop bootstraps VaultState ONCE via new_seeded(),
then applies each action in sequence. Never reads `pre` from the trace to
overwrite Python state — that would mask bugs.

Per planner critical constraint #7: 1-wei tolerance is the parity gate.

The full cycle-full.json from a live testnet capture is consumed by the nightly
backtest workflow (Plan 03-09); this file's parity test runs on the checked-in
micro-fixture only, so per-push CI stays fast (well under the 600s phase budget).
"""
from __future__ import annotations

import json
import subprocess
import sys
from copy import deepcopy
from pathlib import Path

import pytest

from deepvault.vault_state import VaultState

REPO_ROOT = Path(__file__).resolve().parents[2]
MICRO_FIXTURE = REPO_ROOT / "backtest" / "traces" / "micro-fixture-7d.json"


def _load_fixture(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def test_micro_fixture_exists():
    """The 7-day micro-fixture is the per-push CI parity dataset."""
    assert MICRO_FIXTURE.exists(), f"Micro-fixture missing: {MICRO_FIXTURE}"


def test_micro_fixture_well_formed():
    """Top-level keys + each action has the required shape."""
    data = _load_fixture(MICRO_FIXTURE)
    assert isinstance(data, dict)
    assert "actions" in data
    actions = data["actions"]
    assert isinstance(actions, list)
    assert len(actions) >= 3, "Micro-fixture must have >= 3 actions"
    for i, a in enumerate(actions):
        assert {"kind", "tx_digest", "ts_ms", "args", "pre", "post"} <= set(a.keys()), (
            f"Action[{i}] missing required keys: {a.keys()}"
        )
        # u64 fields as strings per WAVE0-DECISION.md Q5.
        for snap_key in ("pre", "post"):
            for field in ("balance", "total_assets", "total_shares"):
                assert isinstance(a[snap_key][field], str), (
                    f"Action[{i}].{snap_key}.{field} must be string (got {type(a[snap_key][field])})"
                )


def test_replay_micro_fixture_parity():
    """Apply every action in micro-fixture-7d.json through VaultState.replay();
    every post-state must match within 1 wei (planner critical constraint #7)."""
    data = _load_fixture(MICRO_FIXTURE)
    vault = VaultState.new_seeded()
    for action in data["actions"]:
        # vault.replay() asserts pre AND post within 1 wei internally.
        vault.replay(action)
    # If we get here with no AssertionError, parity holds.


@pytest.mark.parametrize("action_idx", [0, 1, 2])
def test_replay_each_action_individually(action_idx: int):
    """Per-action diagnostic: apply actions[0..i] inclusive and confirm post-state."""
    data = _load_fixture(MICRO_FIXTURE)
    vault = VaultState.new_seeded()
    for action in data["actions"][: action_idx + 1]:
        vault.replay(action)


def test_replay_loop_invariant_uses_python_post_not_trace_pre():
    """Per RESEARCH.md Pitfall 2: corrupting `post` of action[1] MUST cause
    replay of action[1] to fail at the post-state assertion, proving that
    Python state is being computed independently and compared against the
    trace's post (not overwritten from trace.pre)."""
    data = _load_fixture(MICRO_FIXTURE)
    tampered = deepcopy(data)
    tampered["actions"][1]["post"]["balance"] = str(
        int(tampered["actions"][1]["post"]["balance"]) + 1000
    )
    vault = VaultState.new_seeded()
    vault.replay(tampered["actions"][0])  # clean action — passes
    with pytest.raises(AssertionError, match="post balance mismatch"):
        vault.replay(tampered["actions"][1])


def test_replay_loop_invariant_pre_assertion_catches_drift():
    """Corrupting action[1].pre.balance (NOT post) must also fail at the
    pre-state assertion: Python state from action[0]'s post must match the
    trace's recorded action[1].pre, or the chain is broken."""
    data = _load_fixture(MICRO_FIXTURE)
    tampered = deepcopy(data)
    tampered["actions"][1]["pre"]["balance"] = str(
        int(tampered["actions"][1]["pre"]["balance"]) - 999
    )
    vault = VaultState.new_seeded()
    vault.replay(tampered["actions"][0])
    with pytest.raises(AssertionError, match="pre balance drift"):
        vault.replay(tampered["actions"][1])


def test_replay_cli_exits_0_on_micro_fixture():
    """`python -m deepvault.replay --trace backtest/traces/micro-fixture-7d.json` exits 0."""
    result = subprocess.run(
        [sys.executable, "-m", "deepvault.replay", "--trace", str(MICRO_FIXTURE)],
        cwd=str(REPO_ROOT / "backtest"),
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, (
        f"CLI failed:\nstdout: {result.stdout}\nstderr: {result.stderr}"
    )
    assert "PASS" in result.stdout
