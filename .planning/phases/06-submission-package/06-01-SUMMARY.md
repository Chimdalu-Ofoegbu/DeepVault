---
phase: 06-submission-package
plan: 01
subsystem: docs
tags: [backtest-report, honesty-bar, architecture-svg, numbers-ledger, gitignore-force-add, deepbook-predict]

# Dependency graph
requires:
  - phase: 03-backtest-harness-two-protocol-ptb
    provides: "full-365d.json + full-365d-report.html (the machine-generated backtest snapshot) and the full-window ledger numbers in backtest-assumptions.md L185-208 / 03-10-SUMMARY.md"
  - phase: 01-svi-math-parity
    provides: "raw-SVI evaluator + golden-vectors parity gate (depicted in the SVG Tier 1)"
provides:
  - "backtest/reports/full-365d.json + full-365d-report.html committed as git artifacts (LD-1 honesty-bar gate satisfied — every downstream number now traces to a committed file)"
  - "NUMBERS-CANONICAL.md — the single window-labeled, source-cited numbers ledger every downstream Phase-6 plan MUST cite (whitepaper, README, Devpost, demo script)"
  - "docs/architecture.svg — hand-authored, GitHub-renderable four-tier diagram (DEPLOY-07) referenced by README (Plan 03) and whitepaper (Plan 02)"
affects: [06-02 whitepaper, 06-03 README, 06-04 demo-script, 06-05 devpost-draft]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Force-add-past-gitignore for verified honesty-bar artifacts (git add -f without un-ignoring the directory)"
    - "Window-labeled numbers ledger as single source-of-truth; downstream artifacts cite, never recompute"
    - "Hand-authored inline-style SVG with greppable <text> labels (no external CSS/JS) for GitHub rendering"

key-files:
  created:
    - .planning/phases/06-submission-package/NUMBERS-CANONICAL.md
    - docs/architecture.svg
  modified:
    - backtest/reports/full-365d.json (force-added to git index; content UNMODIFIED)
    - backtest/reports/full-365d-report.html (force-added to git index; content UNMODIFIED)

key-decisions:
  - "Force-added the report files past .gitignore:54 (git add -f) rather than un-ignoring the directory — satisfies LD-1 while keeping future regens ignored"
  - "Did NOT regenerate the report — walk_forward re-fetches live BTC and produces different numbers; the committed snapshot is the only stable artifact"
  - "Prefer JSON values for OOS claims (machine artifact: Sharpe -1.87, APY -2.30%) over the ledger's slightly-drifted OOS (-1.92 / -2.37); cite +7.52% full-window only to backtest-assumptions.md (not in the JSON)"
  - "SVG annotates the two-protocol single-PTB as architecturally-proven-via-mock / live-pending Mysten DUSDC Margin pool (Pitfall 3) — no fictional live LoanBorrowed event depicted"

patterns-established:
  - "Honesty-bar gate: no downstream plan may quote a backtest number until it is committed and NUMBERS-CANONICAL.md declares its window + source"
  - "Two-window discipline: every published figure carries a 'full-window 365d' or 'OOS holdout' label; cross-window pairing without labels is forbidden"

requirements-completed: [DEPLOY-07]

# Metrics
duration: 5min
completed: 2026-06-15
---

# Phase 6 Plan 01: Upstream Artifacts (Report Commit + Numbers Ledger + Architecture SVG) Summary

**Force-committed the verified backtest report past .gitignore, authored the canonical window-labeled numbers ledger (+7.52% full-window vs −2.30% OOS, each source-cited), and hand-authored the GitHub-renderable four-tier architecture SVG — the honesty-bar gate every other Phase-6 artifact depends on.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-06-15T16:49:07Z
- **Completed:** 2026-06-15T16:54:10Z
- **Tasks:** 3 (all `type="auto"`)
- **Files modified:** 4 (2 created, 2 force-added unchanged)

## Accomplishments
- **LD-1 honesty-bar gate satisfied:** `backtest/reports/full-365d.json` (957 lines) and `full-365d-report.html` (4,563 lines, ~4.96 MB) are now committed git artifacts. On a fresh clone every published number traces to a committed file. `.gitignore` is unchanged (future regens stay ignored).
- **Single canonical numbers ledger:** `NUMBERS-CANONICAL.md` maps every publishable figure to its window + committed `file:field`, with a reusable honest-framing paragraph and 5 binding rules (window labels mandatory; no cross-window mixing; prefer JSON for OOS; +7.52% lives only in the ledger; both sources committed).
- **Four-tier architecture SVG (DEPLOY-07):** `docs/architecture.svg` (12.7 KB, well-formed XML, strict-parsed) depicts all four real tiers with key modules, data-flow arrows (codegen → 3 runtimes; Move events → relay → WS dashboard; backtest 1-wei trace replay), and the honestly-annotated two-protocol single-PTB composability callout.

## Task Commits

Each task was committed atomically on `master`:

1. **Task 1: Force-commit the backtest report past .gitignore** — `4477008` (docs)
2. **Task 2: Write the canonical numbers ledger (window-labeled, source-cited)** — `05b6706` (docs)
3. **Task 3: Author the four-tier architecture SVG (DEPLOY-07)** — `436825a` (docs)

**Plan metadata:** (final commit — see below) `docs(06-01): complete upstream-artifacts plan`

## Files Created/Modified
- `backtest/reports/full-365d.json` — Force-added to git index (content unmodified). OOS-window headline + sensitivity table + 7 hedge_trades. Verified `oos_apy = -0.022970276023766778` intact.
- `backtest/reports/full-365d-report.html` — Force-added to git index (content unmodified). Attachable HTML report for the Devpost bundle.
- `.planning/phases/06-submission-package/NUMBERS-CANONICAL.md` — Created. Full-window block (cited to backtest-assumptions.md L185–208) + OOS-holdout block (cited to full-365d.json) + sensitivity table + Honest framing (LD-1) + 5 Rules.
- `docs/architecture.svg` — Created. viewBox 0 0 1200 800, inline styles only, greppable `<text>` labels, arrowhead markers; four tier boxes + data-flow arrows + single-PTB callout with mock/pending annotation.

## Decisions Made
- **Force-add over un-ignore:** Used `git add -f` so the two report files become committed (LD-1) without removing the `backtest/reports/` rule from `.gitignore` — future regenerations stay ignored. Documented as a deliberate Phase-6 exception in the Task 1 commit message.
- **No regeneration:** Deliberately did NOT re-run `walk_forward` (it re-fetches live BTC from Binance, sliding the window and changing the numbers). The committed JSON is the only stable snapshot (06-RESEARCH.md §1, Pitfall 1).
- **OOS source preference:** The ledger and the JSON report slightly-drifted OOS values from different runs. The ledger documents OOS Sharpe −1.92 / APY −2.37%; the JSON (machine artifact) has −1.87 / −2.30%. Ledger Rule (c) directs downstream artifacts to use the JSON values for OOS claims and reserve `backtest-assumptions.md` for the full-window +7.52% (which is not in the JSON).
- **Honest PTB framing in SVG:** Per Pitfall 3, the single-PTB callout is annotated "architecturally proven via mock_margin_pool integration test; live on testnet pending Mysten DUSDC Margin pool" — no fictional live `LoanBorrowed` event is shown.

## Deviations from Plan

None - plan executed exactly as written. All three tasks followed their `<action>` blocks verbatim; every `<acceptance_criteria>` was satisfied by grep/file/exit-code check. No bugs, missing functionality, or blocking issues were encountered (no Rule 1–4 deviations).

## Issues Encountered
- **`python` shim hits the Windows Store alias** (exit 49). Worked around for SVG XML validation by using `node` heuristics + `uv run --no-project python` (the project's pinned Python), which strict-parsed the SVG as well-formed XML rooted at `<svg>`. No impact on deliverables.
- **CRLF normalization warnings** on the two created text files (`NUMBERS-CANONICAL.md`, `architecture.svg`) — Git's standard Windows LF→CRLF notice; content unaffected, files commit cleanly.

## Known Stubs
None. This is a docs/artifacts plan with no UI data-wiring. The SVG's "mock_margin_pool / live-pending" PTB annotation is an intentional, documented honesty disclosure (LD-1 / Pitfall 3), not a stub concealing broken functionality.

## Threat Flags
None. No new network endpoints, auth paths, file-access patterns, or schema changes were introduced. The plan's threat register is satisfied: the force-added report files contain only synthetic BTC-OHLC-derived PnL (no keys/PII — T-06-01 mitigated, numbers confirmed unmodified machine output); the SVG depicts only public module names and the public testnet composability shape (T-06-02 accepted).

## User Setup Required
None - no external service configuration required. (Note: `git push` remains gated for the user per CONTEXT.md; this plan only stages/commits locally.)

## Next Phase Readiness
- **Plan 06-02 (whitepaper)** and **06-03 (README)** can now cite the committed report and `NUMBERS-CANONICAL.md`, and reference `docs/architecture.svg`. The honesty-bar gate is open.
- **Plan 06-04 (demo script)** and **06-05 (Devpost draft)** inherit the same window-labeled ledger + the honest two-protocol-PTB framing.
- No blockers introduced. Pre-existing untracked files (`.claude/`, phase CONTEXT/RESEARCH, screenshots, `DeepVault-handoff/`) were left untouched (out of scope for this plan).

## Self-Check: PASSED

- Files verified present: `full-365d.json`, `full-365d-report.html`, `NUMBERS-CANONICAL.md`, `docs/architecture.svg`, `06-01-SUMMARY.md` (all FOUND).
- Commits verified present: `4477008`, `05b6706`, `436825a` (all FOUND).
- Git-tracked verified: all four deliverable files (2 report + ledger + SVG) return TRACKED.

---
*Phase: 06-submission-package*
*Completed: 2026-06-15*
