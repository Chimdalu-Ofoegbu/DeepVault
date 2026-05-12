"""Cross-language capability-containment grep test (PTB-04).

Per CONTEXT.md D-19: TradeCap lives inside the user's BalanceManager and
never escapes. Per REQUIREMENTS.md PTB-04: capability-flow tests proving
TradeCap and TreasuryCap<VAULT_SHARE> never escape their owners.

Layered enforcement (three independent layers per Plan 03-05):

  1. Move type system — TradeCap/TreasuryCap are non-droppable,
     non-copyable, non-storable outside their host struct. The borrow
     checker rejects extraction at compile time.

  2. Move test — contracts/tests/ptb_capability_test.move (Plan 03-05
     Task 2) — STRUCTURAL + FUNCTIONAL adversarial tests prove the
     capability-quarantine pattern.

  3. THIS FILE — grep gate that catches if a regression adds a public
     function returning a capability by value or by mutable reference.

Mirrors the existing Phase 2 capability_containment grep step in
`.github/workflows/ci.yml` (W4 lock from Plan 02-07), extended to also
cover the Margin SDK surface (TradeCap, MockMarginPool) the Phase 3
PTB demo touches.

Plan 03-09 wires this test into CI. This plan ships the test only.

Source citations:
  - .github/workflows/ci.yml Capability containment step (lines 87-114):
    canonical grep idiom this file extends.
  - contracts/sources/share.move:53-62: PendingTreasury → consume_pending
    capability-quarantine bridge (proves TreasuryCap<SHARE> never escapes).
  - WAVE0-DECISION.md "5-call PTB shape": the demo PTB shape this file
    asserts against.
"""

from __future__ import annotations

import subprocess
from pathlib import Path

# Locate the repo root from this file's location:
#   backtest/tests/test_ptb_capability_grep.py  →  parents[2] = repo root
REPO_ROOT = Path(__file__).resolve().parents[2]


def _grep(pattern: str, root: Path, glob: str = "*.move") -> list[str]:
    """Run grep across `root` for `pattern`; return matching lines.

    Returns the stdout lines (or empty list when grep exits 1 = no match).
    grep -E enables extended regex; -n prepends line numbers; -r recurses
    into subdirectories. The --include glob filter is applied per file.
    """
    result = subprocess.run(
        [
            "grep",
            "-rnE",
            pattern,
            str(root),
            "--include",
            glob,
        ],
        capture_output=True,
        text=True,
    )
    # grep exits 1 on no-match (success for negative-grep assertions),
    # 0 on match, ≥2 on error. We treat ≥2 as test failure indirectly via
    # the assertion below.
    if result.returncode >= 2:
        raise RuntimeError(
            f"grep failed (exit {result.returncode}): {result.stderr}",
        )
    return result.stdout.splitlines()


# ============================================================
# Test 1: production sources must not return TradeCap, TreasuryCap<SHARE>,
#         or MockMarginPool by value or mutable reference from a `public fun`.
# ============================================================
def test_no_public_fun_returns_tradecap_or_treasury_cap_in_production():
    """Production Move sources (contracts/sources/) MUST NOT expose
    TradeCap, TreasuryCap<SHARE>, or MockMarginPool by value or by
    mutable reference from a public (non-package-scoped) function.

    Anchor on `^public fun ` (no parenthetical scope) — this excludes
    `public(package) fun`, which is legitimately used for intra-package
    TreasuryCap borrowing (vault::treasury_cap_mut, etc.). The return
    type is detected via a regex matching the function signature's
    return position (the literal regex is on the `pattern` line below).
    """
    pattern = (
        r"^\s*public fun [^(]*\([^)]*\)\s*:\s*\&?(mut )?"
        r"(TradeCap|TreasuryCap<SHARE>|MockMarginPool)"
    )
    matches = _grep(pattern, REPO_ROOT / "contracts" / "sources")
    leaks = [m for m in matches if "_test.move" not in m]
    assert not leaks, (
        "Capability escape detected in production Move sources:\n"
        + "\n".join(leaks)
        + "\n\nPer CONTEXT.md D-19 + REQUIREMENTS.md PTB-04, NO public fun in "
        + "contracts/sources/ may return TradeCap, TreasuryCap<SHARE>, or "
        + "MockMarginPool by value or &mut. Use public(package) if intra-package "
        + "borrowing is required (mirror vault::treasury_cap_mut)."
    )


# ============================================================
# Test 2: production sources must not return AdminCap by value or &mut
#         from a public fun. AdminCap is single-key, non-transferable in v1.
# ============================================================
def test_no_admin_cap_returned_by_value_from_production():
    """AdminCap is single-key, non-transferable v1 (vault.move:87 —
    `has key` only, no `store`). NO public function may return AdminCap
    by value or &mut from production code.

    This is the same property the Phase 2 W4 lock (ci.yml capability
    containment step) enforces; this test pins the invariant in Python
    so the grep gate runs in the python CI job too (defense in depth)."""
    pattern = r"^\s*public fun [^(]*\([^)]*\)\s*:\s*\&?(mut )?AdminCap"
    matches = _grep(pattern, REPO_ROOT / "contracts" / "sources")
    leaks = [m for m in matches if "_test.move" not in m]
    assert not leaks, (
        "AdminCap escape detected in production Move sources:\n"
        + "\n".join(leaks)
        + "\n\nPer vault.move:87 + VAULT-08 D-12, AdminCap is single-key, "
        + "non-transferable in v1. No public fun may return it by value or &mut."
    )


# ============================================================
# Test 3: the TS PTB demo must not extract TradeCap into a free local.
# ============================================================
def test_no_ts_demo_lets_extract_tradecap_outside_sdk_layer():
    """The PTB demo TS script (scripts/two-protocol-ptb-demo.ts) MUST
    NOT have any `let`/`const` binding that extracts a TradeCap or
    pool-internal capability as a free variable.

    The Margin SDK may have INTERNAL TradeCap usage inside its own
    classes (MarginManagerContract instance methods); those are
    package-private to @mysten/deepbook-v3 and don't show up at our
    scripts/ layer. The pattern here catches user-code extraction
    attempts that would defeat D-19.

    Per WAVE0-DECISION.md, the demo uses raw tx.moveCall (not SDK
    builders that might return capability objects), so this grep
    is the canonical enforcement.
    """
    pattern = r"^\s*(const|let)\s+(tradeCap|trade_cap|TradeCap|withdrawCap|depositCap)\s*="
    matches = _grep(pattern, REPO_ROOT / "scripts", glob="*.ts")
    leaks = [m for m in matches if "node_modules" not in m]
    assert not leaks, (
        "TS demo extracts capability outside SDK layer:\n"
        + "\n".join(leaks)
        + "\n\nPer CONTEXT.md D-19, TradeCap must stay inside the wrapped "
        + "BalanceManager — no `let tradeCap = ...` patterns allowed in scripts/."
    )


# ============================================================
# Test 4: Phase 2 capability_containment grep step must still be present
#         in ci.yml (regression guard).
# ============================================================
def test_capability_containment_pattern_present_in_ci_yml():
    """Sanity: confirm the existing Phase 2 capability_containment grep
    step is still present in .github/workflows/ci.yml. Plan 03-09 will
    extend it; this test catches accidental deletion before then.

    The Phase 2 grep is the load-bearing CI enforcement of VAULT-10;
    losing it silently would degrade the three-layer capability
    discipline to two layers.
    """
    ci_yml = REPO_ROOT / ".github" / "workflows" / "ci.yml"
    assert ci_yml.exists(), f"ci.yml not found at {ci_yml}"
    content = ci_yml.read_text(encoding="utf-8")
    assert "Capability containment" in content, (
        "Phase 2 capability_containment grep step missing from ci.yml — "
        "regression? See Plan 02-07 W4 lock."
    )


# ============================================================
# Test 5: the PTB demo TS file presents the locked 5-call PTB shape.
# ============================================================
def test_ptb_demo_contains_5_call_shape():
    """Plan 03-05 Task 1 lands the complete PTB body per WAVE0-DECISION.md
    5-call shape. This test pins the call-shape grep so a regression
    that drops a step (e.g., collapsing margin_manager::withdraw out of
    the PTB and silently using the auto-deposited internal balance)
    is caught by CI.
    """
    demo_path = REPO_ROOT / "scripts" / "two-protocol-ptb-demo.ts"
    assert demo_path.exists(), f"Demo script not found: {demo_path}"
    content = demo_path.read_text(encoding="utf-8")

    # Each canonical target must appear at least once.
    required_targets = [
        "margin_manager::deposit",
        "margin_manager::borrow_quote",
        "margin_manager::withdraw",
        "supply::supply",
    ]
    missing = [t for t in required_targets if t not in content]
    assert not missing, (
        "Demo PTB missing required moveCall targets per WAVE0-DECISION.md:\n  "
        + "\n  ".join(missing)
    )

    # tx.moveCall call count must be >= 4 (5-call shape; Step 5 is optional
    # per WAVE0-DECISION.md MARGIN-WHITELIST fallback).
    move_call_count = content.count("tx.moveCall")
    assert move_call_count >= 4, (
        f"Expected >= 4 tx.moveCall invocations in demo PTB; saw {move_call_count}. "
        f"Per WAVE0-DECISION.md the locked shape is 5 calls (Step 5 optional)."
    )
