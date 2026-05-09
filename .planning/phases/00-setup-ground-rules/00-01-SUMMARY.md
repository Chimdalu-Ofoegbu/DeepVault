---
phase: 00-setup-ground-rules
plan: 01
subsystem: infra
tags: [pnpm, workspace, monorepo, mit-license, gitignore, build-in-public]

# Dependency graph
requires: []
provides:
  - "Public-from-day-1 (D-10), MIT-licensed (D-11) repo root scaffolding"
  - ".gitignore that excludes keystores/.env but commits lockfiles (Pitfall 0-B/0-C)"
  - "Root pnpm workspace manifest with engines pin (Node >=22, pnpm >=10)"
  - "Placeholder @deepvault/indexer and @deepvault/dashboard workspace packages for Phase 4"
  - "README.md with laypitch, glossary, append-only Build log section seeded for Week 1 (D-12)"
  - "Committed pnpm-lock.yaml proving workspace install reproducibility"
affects: [00-02, 00-03, 00-04, 00-05, 00-06, 00-07, 00-08, phase-1, phase-4]

# Tech tracking
tech-stack:
  added: [pnpm@10.0.0, prettier@3.3.3, eslint@9.13.0, typescript@5.6.3]
  patterns:
    - "pnpm workspaces (no Turborepo) per CONTEXT Implementation Defaults"
    - "Exact-version pin (=) for reproducibility per RESEARCH version-pin discipline"
    - "Phase-N placeholder packages with no-op exit-0 scripts so pnpm -r run is safe"

key-files:
  created:
    - .gitignore
    - LICENSE
    - README.md
    - package.json
    - pnpm-workspace.yaml
    - pnpm-lock.yaml
    - indexer/package.json
    - indexer/README.md
    - dashboard/package.json
    - dashboard/README.md
  modified: []

key-decisions:
  - "Author/copyright name = 'Ben Sagesol' (per 00-01-PLAN.md task body, matches PROJECT.md). The execute-phase prompt's plan_specifics section paraphrased this as 'Ben Sage'; plan body wins (more specific, matches user email bensagesol@gmail.com)."
  - "Committed pnpm-lock.yaml in this plan rather than deferring (Rule 2: critical for reproducibility per Pitfall 0-B; .gitignore was specifically authored to NOT exclude it)."
  - "Root package.json scripts use pnpm -r (recursive) per CONTEXT Implementation Defaults; Phase 0-02 will add a Makefile that wraps these for cross-language tasks."

patterns-established:
  - "Atomic per-task commits with subject 'chore(00-01): <one-line>' and body bullets describing each artifact"
  - "Workspace placeholder pattern: package.json with private:true + scripts that echo + exit 0 so pnpm -r run never fails on Phase-N stubs"
  - "Build log discipline: README.md '## Build log' section is append-only weekly bullets; first entry seeded for Week 1 (2026-05-09 to 2026-05-15)"

requirements-completed: [SETUP-01]

# Metrics
duration: 3min
completed: 2026-05-09
---

# Phase 0 Plan 01: Repo Bootstrap Summary

**Public MIT-licensed pnpm monorepo root scaffolded — `.gitignore` (with keystore protection and lockfile-preservation), LICENSE, README laypitch+build-log, root `package.json` with Node >=22 / pnpm >=10 engine pins, and `@deepvault/indexer` + `@deepvault/dashboard` Phase-4 placeholder workspaces; `pnpm install` confirmed all 3 workspace projects.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-05-09T04:20:17Z
- **Completed:** 2026-05-09T04:23:14Z
- **Tasks:** 3 of 3 (plus 1 follow-up commit for pnpm-lock.yaml)
- **Files created:** 10

## Accomplishments

- Repo is now legally publishable on GitHub (MIT LICENSE, copyright 2026 Ben Sagesol per D-11).
- `.gitignore` excludes the four classes of secret-leak risks: `.sui/` keystores (T-00-01), `.env*` files (T-00-02), Sui CLI config dirs, generic `*.keystore`. Verified `pnpm-lock.yaml` is NOT excluded (Pitfall 0-B reproducibility, T-00-04).
- Root pnpm workspace manifest committed with engine pins (`node>=22`, `pnpm>=10`) matching CLAUDE.md stack pins; devDependencies pinned to exact patch versions (prettier 3.3.3, eslint 9.13.0, typescript 5.6.3).
- `pnpm install` succeeded against the new manifest, recognizing 3 workspace projects: `deepvault@0.1.0`, `@deepvault/indexer@0.0.0`, `@deepvault/dashboard@0.0.0`.
- README.md seeded with laypitch, glossary (PLP/SVI/PTB/hedge ratio), prerequisites table, repo layout table, append-only build-log section with Week 1 entry, and hosting placeholders for Phase 4.

## Task Commits

Each task was committed atomically on `master`:

1. **Task 1: Initialize repo root files (.gitignore, LICENSE, README skeleton)** — `42ce187` (chore)
2. **Task 2: Initialize pnpm workspace (root package.json + pnpm-workspace.yaml)** — `935b100` (chore)
3. **Task 3: Create placeholder workspace packages (indexer/ + dashboard/)** — `4f85326` (chore)
4. **Follow-up: Commit pnpm-lock.yaml after `pnpm install` verification** — `164dba1` (chore — Rule 2 reproducibility)

**Plan metadata commit:** to be added after this SUMMARY.md is written.

## Files Created/Modified

- `.gitignore` — Excludes node_modules, .pnpm-store, .venv, __pycache__, .sui keystores, build artifacts, .env files, editor metadata, .predict-diff-state.local. Intentionally does NOT exclude `pnpm-lock.yaml` or `uv.lock` (PITFALLS 0-B/0-C).
- `LICENSE` — MIT License, copyright 2026 Ben Sagesol.
- `README.md` — Project entry: laypitch, glossary, prerequisites, build/test/demo commands, repo layout table, Build log seeded with Week 1 (2026-05-09 to 2026-05-15) entry, Vercel/Render hosting placeholders, MIT footer.
- `package.json` — Root pnpm workspace manifest. `name: "deepvault"`, `private: true`, `license: "MIT"`, `engines: { node: ">=22", pnpm: ">=10" }`, `packageManager: "pnpm@10.0.0"`. Scripts: `build`, `test`, `lint`, `typecheck` via `pnpm -r`. devDependencies pinned exactly: prettier 3.3.3, eslint 9.13.0, typescript 5.6.3.
- `pnpm-workspace.yaml` — Lists `indexer` and `dashboard` as workspace packages.
- `pnpm-lock.yaml` — Generated by `pnpm install`. Committed for reproducibility (Pitfall 0-B). 90 packages resolved.
- `indexer/package.json` — `@deepvault/indexer@0.0.0`, private, Phase 4 placeholder. Scripts (build/test/lint) echo "Phase 4 fills this in" and `exit 0`.
- `indexer/README.md` — Phase-4 placeholder note pointing at DASH-01..DASH-03 in REQUIREMENTS.md.
- `dashboard/package.json` — `@deepvault/dashboard@0.0.0`, private, Phase 4 placeholder. Scripts echo + exit 0.
- `dashboard/README.md` — Phase-4 placeholder note pointing at DASH-04..DASH-13 in REQUIREMENTS.md.

## Decisions Made

- **Author/copyright name resolved to "Ben Sagesol"** — The 00-01-PLAN.md task body specified "Ben Sagesol" verbatim (matches user email `bensagesol@gmail.com` and PROJECT.md context). The execute-phase prompt's `plan_specifics` block paraphrased this as "Ben Sage"; the plan body is the authoritative spec, so I used "Ben Sagesol". This is consistent with the GSD principle that the PLAN.md is the contract.
- **Lockfile committed in this plan, not deferred** — `pnpm install` was run as part of overall verification, which generated `pnpm-lock.yaml`. Per RESEARCH.md Pitfall 0-B and the deliberately-authored `.gitignore` (which does NOT exclude lockfiles), the lockfile MUST be committed. Treated as Rule 2 (auto-add missing critical functionality for reproducibility).
- **Did NOT touch `.planning/STATE.md` or `.planning/config.json` modifications visible in `git status`** — those pre-existed before this plan started (initialization context). Out of scope for this commit; they will be updated by `state.advance-plan`/`state.update-progress` SDK calls in the post-plan state-updates step (or, if the SDK is unavailable, deferred for the orchestrator).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Committed `pnpm-lock.yaml` after install verification**
- **Found during:** Overall plan verification (after Task 3, before SUMMARY.md)
- **Issue:** Plan's overall verification step says "`pnpm install` succeeds at repo root and reports indexer + dashboard as workspace members". Running `pnpm install` produced `pnpm-lock.yaml` as a tracked-but-uncommitted artifact. The plan's `.gitignore` (Task 1) was deliberately authored to NOT exclude this file (Pitfall 0-B reference). Leaving it uncommitted would create a state where the next agent's first `pnpm install` could resolve different versions (no lockfile = no reproducibility).
- **Fix:** Committed `pnpm-lock.yaml` as a separate atomic commit (`164dba1`) with rationale referring to Pitfall 0-B in the commit body.
- **Files modified:** `pnpm-lock.yaml` (new, 714 lines).
- **Verification:** `pnpm list -r --depth=-1` reports all 3 workspace projects; lockfile present in repo.
- **Committed in:** `164dba1`.

---

**Total deviations:** 1 auto-fixed (1 missing critical / reproducibility).
**Impact on plan:** Auto-fix essential for reproducibility. No scope creep — the lockfile is exactly the artifact the `.gitignore` was deliberately written to preserve.

## Issues Encountered

- Git CRLF warnings on every Write under Windows (e.g., "LF will be replaced by CRLF the next time Git touches it"). Cosmetic; does not affect file contents in the index. A `.gitattributes` to normalize line endings is a Phase 0-02 candidate but not required by this plan.
- `pnpm install` reported newer versions are available (eslint 10.2.0, prettier 3.8.3, typescript 6.0.3). Intentionally ignored — RESEARCH.md pins exact patch versions. Phase 0-02 may upgrade if needed.

## Threat Surface

No new surface introduced — this plan only adds repo metadata files. The `<threat_model>` mitigations in 00-01-PLAN.md are all satisfied:

| Threat ID | Mitigation Verification |
|-----------|-------------------------|
| T-00-01 (`.sui/` keystore disclosure) | `.gitignore` lines `.sui/`, `**/.sui/`, `sui_config*/`, `*.keystore` present (`grep` verified). |
| T-00-02 (`.env` file disclosure) | `.gitignore` lines `.env`, `.env.local`, `.env.*.local` present. |
| T-00-03 (License missing → repudiation) | `LICENSE` exists with MIT text and year 2026 (`grep -q "MIT License"` passed). |
| T-00-04 (Stale lockfile non-reproducibility) | `.gitignore` does NOT contain `pnpm-lock.yaml`; lockfile committed in `164dba1`. |

## User Setup Required

None — this plan is fully autonomous and requires no manual configuration. The repo is ready for Plan 00-02 (toolchain pins: Move.toml, Makefile, Python uv project).

## Self-Check: PASSED

Verified after writing this SUMMARY:
- FOUND: `.gitignore`, `LICENSE`, `README.md`, `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `indexer/package.json`, `indexer/README.md`, `dashboard/package.json`, `dashboard/README.md`.
- FOUND commit `42ce187` (Task 1).
- FOUND commit `935b100` (Task 2).
- FOUND commit `4f85326` (Task 3).
- FOUND commit `164dba1` (lockfile follow-up).
- VERIFIED: `pnpm install` reports 3 workspace projects.
- VERIFIED: `grep -q "MIT License" LICENSE` passes; `grep -q "## Build log" README.md` passes; `grep -q "node_modules/" .gitignore` passes; `grep -q "pnpm-lock.yaml" .gitignore` returns 1 (not present, as intended).

## Next Phase Readiness

- Repo root scaffolding committed; ready for **Plan 00-02** (Move toolchain pin, Makefile, Python uv project) to write into `contracts/`, `backtest/`, and `scripts/`.
- `pnpm-workspace.yaml` already lists `indexer/` and `dashboard/` so any TS code added under those paths in Phases 4+ is automatically wired into the workspace.
- Hard policy locks (ROADMAP §"Hard Policy Locks") that this plan touches: #10 ("Hedge-ratio policy committed in writing before backtest opens") — out of scope for 00-01; will be Plan 00-04 (HEDGE-POLICY.md).

---
*Phase: 00-setup-ground-rules*
*Plan: 01*
*Completed: 2026-05-09*
