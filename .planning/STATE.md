---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: milestone
status: executing
stopped_at: Phase 0 context gathered
last_updated: "2026-05-09T04:25:57.108Z"
last_activity: 2026-05-09
progress:
  total_phases: 7
  completed_phases: 0
  total_plans: 8
  completed_plans: 1
  percent: 13
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-08)

**Core value:** A working PLP+Hedge vault on DeepBook Predict with a credible, auditable risk dashboard, deployed on mainnet by 2026-06-16. Quality of vault math, backtest, and dashboard polish > component count.
**Current focus:** Phase 0 — Setup & Ground Rules

## Current Position

Phase: 0 (Setup & Ground Rules) — EXECUTING
Plan: 2 of 8
Status: Ready to execute
Last activity: 2026-05-09

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**

- Total plans completed: 0
- Average duration: —
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**

- Last 5 plans: —
- Trend: —

*Updated after each plan completion*
| Phase 0 P1 | 3min | 3 tasks | 10 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Two-protocol PTB (Margin + Predict), not three (drop Iron Bank) — Brief Week-6 cut adopted up front
- Fixed-ratio hedge sizing in v1, parameterized for future dynamic policies — Brief Week-8 cut adopted up front
- Mainnet redeploy in v1 scope (actual deploy, not just plan) — non-cuttable per PROJECT.md
- Live SVI surface but no time-travel slider — Brief Week-10 cut
- Quality bar over component count — math correctness > deploy hygiene > demo polish > composability breadth
- BTC-only at v1 — multi-asset is post-submission
- [Phase ?]: Plan 00-01: Repo bootstrap landed — public MIT, pnpm workspaces, indexer/dashboard placeholders

### Pending Todos

None yet.

### Blockers/Concerns

Open verification gaps to resolve in Phase 0/1:

- DeepBook Margin collateral whitelist policy (Phase 3 Track A precondition; day-1 spike)
- `OracleSVIUpdated` Move event exact struct schema (day-1 read of `oracle_svi.move`)
- Predict mainnet launch ETA unknown — tracked weekly Monday; if not shipped by 2026-06-09, mainnet redeploy degrades to documented fallback
- `react-plotly.js` last published 2022 — Phase 4 contingency: 30-line `Plotly.newPlot()` fallback hook ready
- Predict mainnet contract addresses + USDsui type tag + mainnet `predict-server` URL — Phase 5 precondition

## Hard Policy Locks (from ROADMAP.md)

1. Three-way SVI parity gate — non-cuttable
2. 30-day backtest with lookahead audit — non-cuttable
3. Two-protocol PTB demo video — non-cuttable
4. Mainnet redeploy — non-cuttable
5. Code freeze 2026-05-30
6. Mainnet smoke test deadline 2026-06-12 (day 36)
7. Demo recorded on mainnet only, after smoke test
8. No dashboard work before vault feature-complete
9. Weekly Monday Predict contract-version sweep
10. Hedge-ratio policy committed in writing before backtest opens

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none)* | | | |

## Session Continuity

Last session: 2026-05-09T04:25:29.728Z
Stopped at: Phase 0 context gathered
Resume file: None
