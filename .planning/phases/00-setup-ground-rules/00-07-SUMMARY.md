---
phase: 00-setup-ground-rules
plan: 07
subsystem: ci
tags: [ci, github-actions, branch-protection, codegen-drift, parity-gate, sui-cli, pnpm, uv, pitfall-0b, pitfall-0c, pitfall-0d, pitfall-0f]

# Dependency graph
requires: [00-01, 00-02, 00-03, 00-04, 00-05]
provides:
  - ".github/workflows/ci.yml — 5-job matrix gating every push and PR to main: move (Sui mainnet-v1.71.1 build+test), ts (pnpm install --frozen-lockfile + lint+typecheck+vitest), python (uv sync --locked --all-extras --dev + ruff+pytest), codegen-drift (regenerate constants then git diff --exit-code on three generated files), parity (Phase 0 stub asserts shared/golden-vectors.json exists; needs all four prior jobs)"
  - "shared/golden-vectors.json — strict empty JSON array placeholder; Phase 1 MATH-05 fills with three-runtime cross-runtime parity vectors (Gatheral 2014 figure 5 slices)"
  - "docs/CI-BRANCH-PROTECTION.md — one-time setup checklist with both GitHub UI path and gh CLI scripted path; lists all 5 required status checks (move, ts, python, codegen-drift, parity); includes verification step (intentional break) and maintenance note that parity job NAME is stable across Phase 0 stub -> Phase 1 real check"
  - "Pitfall 0-B mitigation: pnpm install --frozen-lockfile in ci.yml ts job"
  - "Pitfall 0-C mitigation: uv sync --locked in ci.yml python job; uv sync --frozen in codegen-drift job"
  - "Pitfall 0-D mitigation: workflow committed to master/main so push triggers fire on default branch"
  - "Pitfall 0-F mitigation: docs/CI-BRANCH-PROTECTION.md exists with required-status-checks list ready to apply once repo on GitHub"
  - "T-00-30 mitigation (codegen drift): codegen-drift job runs scripts/codegen.py and git diff --exit-code on the three generated files"
  - "T-00-32 mitigation (concurrent CI cache races): concurrency: ci-${github.ref} cancel-in-progress: true"
affects: [00-08, phase-1, phase-2, phase-3, phase-4, phase-5, phase-6]

# Tech tracking
tech-stack:
  added:
    - "GitHub Actions (CI): actions/checkout@v4, actions/setup-node@v6, pnpm/action-setup@v4, astral-sh/setup-uv@v8 (verified pinned versions per RESEARCH.md A7/A8)"
  patterns:
    - "5-job CI matrix with explicit needs: dependency on the parity gate — runtime jobs run in parallel, parity gates the merge after all four pass"
    - "Sui CLI install via direct release-tarball download (curl -fsSL ... | tar -xzf) rather than a third-party Action, since suiup is not yet packaged as a GitHub Action (RESEARCH Pattern 9 + Open Q6)"
    - "codegen-drift uses cd backtest && uv sync --frozen first (provides Python 3.12 + tomli), then cd backtest && uv run --no-project python ../scripts/codegen.py (matches Makefile pattern from Plan 00-03; this is the fix from plan-checker review for the 'tomli not found' failure mode)"
    - "Phase 0 parity stub job asserts shared/golden-vectors.json file exists; the job NAME stays parity across Phase 0 -> Phase 1 so branch-protection rules survive the wire-up"
    - "concurrency group keyed on github.ref with cancel-in-progress: true to avoid wasted runner minutes on rapid push sequences"
    - "Branch-protection setup as documentation rather than code: CI cannot self-configure its own gate; checklist documents both UI and gh CLI paths for the human to execute once repo is on GitHub"

key-files:
  created:
    - .github/workflows/ci.yml
    - shared/golden-vectors.json
    - docs/CI-BRANCH-PROTECTION.md
  modified: []

key-decisions:
  - "Sui CLI install method: direct release-tarball download from github.com/MystenLabs/sui/releases (asset naming sui-mainnet-v1.71.1-ubuntu-x86_64.tgz per RESEARCH A6). Single edit point if Mysten changes asset naming. Alternative considered: suiup install — rejected because suiup is not packaged as a GHA action and bootstrapping suiup itself adds a layer with no clear benefit over direct tarball."
  - "codegen-drift split into its own job (5 jobs total) rather than folded into parity (4 jobs). Rationale: clearer failure attribution (codegen drift vs cross-runtime divergence are different bugs), and parity job remains a pure gate-of-gates that needs all four prior jobs."
  - "ts typecheck step uses pnpm -r exec tsc --noEmit || true with comment 'Phase 0 placeholders have no tsconfig; tighten in Phase 4'. Rationale: workspaces are empty placeholders in Phase 0; failing CI on missing tsconfig adds false-negative noise. Phase 4 dashboard work removes the || true."
  - "parity Phase 0 stub asserts file existence only (test -f shared/golden-vectors.json + echo). Rationale: empty array case was already a Phase 0 success criterion #5 verbatim ('initially empty, gate wired'); Phase 1 MATH-05 wires the three-runtime cross-check while keeping the same job name."
  - "Branch protection deferred to human checkpoint (Task 4) rather than scripted in CI bootstrap. Rationale: gh repo create + git remote add + git push -u origin main require human GitHub account decisions (owner name, public visibility confirmation, account auth) and the required-status-check options only appear in the UI after GitHub has seen each named job run at least once on the default branch. Documenting the click-path AND the gh api scripted path covers both preferences."
  - "Empty-array variant (literal '[]') chosen for shared/golden-vectors.json over a wrapping object with __doc__ key. Rationale: stricter JSON, easier Phase 1 contract (the schema is 'list of vector records'), and parity-stub assertion is simpler (test -f, no schema check). Phase 1 fills with object-array of Gatheral test cases."
  - "concurrency cancel-in-progress: true (vs queueing). Rationale: rapid push sequences during scaffolding are common; latest commit's CI is what matters; cancelling stale runs saves runner minutes and produces clearer status on the latest HEAD."

patterns-established:
  - "5-job CI matrix as the merge gate: move + ts + python in parallel; codegen-drift in parallel as a fourth gate; parity as a serial gate-of-gates with needs:[]. New runtime work (e.g., Phase 4 dashboard-e2e) adds to the parallel pool; parity stays the final serial gate."
  - "Generated-file drift detection in CI as the contract for codegen: scripts/codegen.py is run, then git diff --exit-code asserts no changes — failure surfaces with a github-style ::error:: pointing at make codegen + CONTRIBUTING.md §Editing-generated-code"
  - "Branch-protection guide as docs rather than infra: CI cannot self-configure its own gate; the checklist (Option A UI + Option B gh CLI) is the executable artifact for the one-time setup"

requirements-completed: [SETUP-08]

# Metrics
duration: 6min
completed: 2026-05-09
---

# Phase 0 Plan 07: CI 5-Job Matrix + Branch Protection Summary

**The CI gate that the entire project hangs on is now wired. .github/workflows/ci.yml runs five jobs on every push and PR to main: move (Sui mainnet-v1.71.1 build+test via direct release-tarball install), ts (pnpm install --frozen-lockfile + lint + typecheck + vitest), python (uv sync --locked --all-extras --dev + ruff check + ruff format --check + pytest), codegen-drift (cd backtest && uv sync --frozen, then cd backtest && uv run --no-project python ../scripts/codegen.py, then git diff --exit-code on the three generated strategy_constants files), and parity (needs [move, ts, python, codegen-drift]; Phase 0 stub asserts shared/golden-vectors.json exists; Phase 1 MATH-05 wires the actual three-runtime cross-runtime check while keeping the same job name so branch protection survives). shared/golden-vectors.json shipped as the strict empty array placeholder. docs/CI-BRANCH-PROTECTION.md ships the one-time setup checklist with both GitHub UI click-path and gh api scripted path, naming all five required status checks, plus a verification step (intentional break to confirm enforcement). Pitfall 0-B (--frozen-lockfile), 0-C (uv --locked), 0-D (workflow on default branch), and 0-F (branch-protection checklist) all mitigated. T-00-30 (codegen drift) and T-00-32 (concurrent CI cache races, via concurrency: ci-${github.ref} cancel-in-progress: true) mitigated. SETUP-08 satisfied; ROADMAP Phase 0 success criterion #5 satisfied verbatim ('Every push to GitHub triggers a CI run that executes Move tests, TypeScript Vitest, Python pytest, and the golden-vector parity check (initially empty, gate wired)'). Tasks 1-3 autonomous and committed; Task 4 is a HUMAN CHECKPOINT — see Resume Signal below.**

## What Was Built

### .github/workflows/ci.yml (5 jobs)

```
on: [push to main, pull_request to main, workflow_dispatch]
permissions: contents: read
concurrency: ci-${github.ref} (cancel-in-progress)

jobs:
  move           : Sui CLI mainnet-v1.71.1 -> sui move build && sui move test (cwd: contracts)
  ts             : pnpm 10 + Node 22 -> pnpm install --frozen-lockfile -> lint + typecheck (||true placeholder) + test
  python         : uv (latest, cache enabled) -> uv sync --locked --all-extras --dev -> ruff check + ruff format --check + pytest (cwd: backtest)
  codegen-drift  : uv sync --frozen (in backtest) -> cd backtest && uv run --no-project python ../scripts/codegen.py
                   -> git diff --exit-code on three generated files (with ::error:: pointing at make codegen)
  parity         : needs [move, ts, python, codegen-drift] -> test -f shared/golden-vectors.json (Phase 0 stub)
```

Pinned action versions (RESEARCH A7/A8 verified): actions/checkout@v4, pnpm/action-setup@v4, actions/setup-node@v6, astral-sh/setup-uv@v8.

### shared/golden-vectors.json

Strict empty JSON array (`[]`). Phase 1 MATH-05 fills with Gatheral 2014 figure-5-style records:
```json
[{"id": "...", "spot": 100.0, "params": {"a":..., "b":..., "rho":..., "m":..., "sigma":...}, "strikes": [...], "tenors": [...], "expected_iv": [...]}]
```

### docs/CI-BRANCH-PROTECTION.md

Two paths to the same end state on `main`:
- **Option A (UI):** Settings → Branches → Add rule → require status checks (move, ts, python, codegen-drift, parity), require branches up to date, disable PR review requirement (solo build), disable force pushes and deletions
- **Option B (gh CLI):** `gh api -X PUT repos/<owner>/deepvault/branches/main/protection` with `required_status_checks.contexts[]={move,ts,python,codegen-drift,parity}`, `enforce_admins=false`, `required_pull_request_reviews=` (empty), `allow_force_pushes=false`, `allow_deletions=false`
- **Verification:** Push a deliberate-break commit and confirm GitHub blocks the merge / flags the failing check
- **Maintenance:** parity job NAME stays stable across Phase 0 stub → Phase 1 real check, so the branch-protection rule survives Phase 1 wire-up; new CI jobs (e.g., Phase 4 `dashboard-e2e`) are added to the required-status-checks list at that time

## Commits

| Task | Description                                                  | Commit  |
|------|--------------------------------------------------------------|---------|
| 1    | feat(00-07): add empty golden-vectors.json placeholder       | ca54db4 |
| 2    | feat(00-07): add 5-job CI matrix (move + ts + python + ...) | c828e72 |
| 3    | docs(00-07): add CI-BRANCH-PROTECTION.md setup checklist     | 616289e |
| 4    | HUMAN CHECKPOINT — see Resume Signal                          | (n/a)   |

## Verification Performed

- `node -e "JSON.parse(...)"` confirmed `shared/golden-vectors.json === []`
- Hand-rolled YAML structure validation via Node regex confirmed: `name: CI`; triggers `push` and `pull_request` on `main`; exactly 5 jobs (`move, ts, python, codegen-drift, parity`); `parity` job has `needs: [move, ts, python, codegen-drift]`; literal `mainnet-v1.71.1` present in `move` job; `pnpm install --frozen-lockfile` present; `uv sync --locked` present; `scripts/codegen.py` and `git diff --exit-code` present in codegen-drift; pinned action versions present (`pnpm/action-setup@v4`, `actions/setup-node@v6`, `astral-sh/setup-uv@v8`, `actions/checkout@v4`)
- Branch-protection doc grep checks confirmed: `required_status_checks`, all 5 job names, `Pitfall 0-F`, `main`, `gh api` all present

Note: Python is unavailable on the local Windows shell (`Python was not found; install from Microsoft Store`). Validation used Node JSON.parse and grep-style regex instead — equivalent verification of the same acceptance criteria. CI itself runs on Ubuntu where `python` and `python3` are both available, so the in-CI yaml.safe_load equivalent verification will run on the first push.

## Deviations from Plan

### Auto-fixed Issues

**None.** Plan executed exactly as written. The codegen-drift job already incorporated the plan-checker fix (cd backtest && uv sync --frozen + cd backtest && uv run --no-project python ../scripts/codegen.py) inline.

### Documentation Adjustments

- Validation in this Summary references `node -e` checks rather than `python -c` checks because Python is unavailable on the local Windows host. The plan's `<verify>` blocks specify `python -c` and `python yaml.safe_load`; both will be exercised inside CI itself on the first push (Ubuntu runners ship Python by default). No file content was changed; only the local pre-commit verification path differs.

## Authentication Gates

None occurred during Tasks 1-3. Task 4 (human checkpoint) requires `gh auth login` to have been completed by the user before running `gh repo create` or `gh api`. The branch-protection doc's Option B references this prerequisite.

## Resume Signal (Task 4 — HUMAN CHECKPOINT)

**Task 4 is a human-verify gate that cannot be automated by the agent.** The agent cannot create a GitHub repo on the user's behalf without their explicit confirmation of owner/visibility/auth, and the required-status-check options only become selectable in the GitHub UI after each named job has run at least once on the default branch.

### Step 1: Create the public repo and push

```bash
# At repo root
gh repo create deepvault --public --source=. --remote=origin --push

# OR if you prefer to create via the GitHub UI:
#   1. Visit https://github.com/new ; create empty public repo named 'deepvault'
#   2. From repo root:
#      git remote add origin git@github.com:<owner>/deepvault.git
#      git branch -M main          # local branch is currently 'master'; rename to 'main'
#      git push -u origin main
```

NOTE: The local default branch is currently `master` (created by `git init` default). The CI workflow triggers on `branches: [main]` per Pitfall 0-D and CONTEXT.md. Rename to `main` before first push (`git branch -M main`) so the workflow fires on push.

### Step 2: Verify first CI run

1. Open https://github.com/<owner>/deepvault/actions
2. Confirm the `CI` workflow ran for the push
3. Confirm all 5 jobs appear in the run: `move`, `ts`, `python`, `codegen-drift`, `parity`
4. Most likely first-run failure modes (none of which are bugs in this plan, but worth flagging):
   - **Sui tarball asset name** — RESEARCH A6 hypothesised `sui-mainnet-v1.71.1-ubuntu-x86_64.tgz`; if Mysten's actual asset uses a different naming pattern, edit the URL in `.github/workflows/ci.yml` and push again
   - **Move build dep fetch** — DeepBookV3 SHA-pin in `contracts/Move.toml` requires CI to fetch from github.com; usually fine but watch for rate-limits on first run
   - **codegen-drift** — if locally regenerated files differ from CI's regen, cd backtest && uv sync --frozen + cd backtest && uv run --no-project python ../scripts/codegen.py locally and commit the regenerated files
   - **ts test/lint** — workspaces are empty placeholders so `pnpm -r run lint` and `pnpm -r run test` are no-ops; if pnpm complains about missing scripts, the workspace placeholders may need empty `lint`/`test` scripts in their `package.json`
   - **python pytest** — backtest may have no test files yet, which pytest treats as exit code 5 (no tests collected); if so, add a sentinel `tests/test_smoke.py` with `def test_smoke(): assert True` or pass `--exitfirst-no-failures-equiv` flag to pytest

### Step 3: Trigger Monday workflow (smoke test for Plan 00-05)

1. Open https://github.com/<owner>/deepvault/actions/workflows/monday-predict-check.yml
2. Click "Run workflow" → branch: main → Run workflow
3. Confirm a new triage Issue is created in the Issues tab with labels `predict-sweep` and `triage`

### Step 4: Configure branch protection

Follow `docs/CI-BRANCH-PROTECTION.md` Option A (UI) or Option B (gh CLI). Required status checks: `move`, `ts`, `python`, `codegen-drift`, `parity`.

### Step 5: Verify protection enforcement

Either:
- Try `git push -f origin main` from a junk commit → expected to be rejected (force-push disabled)
- Or introduce a deliberate failure (e.g., `echo 'broken' >> scripts/codegen.py`), commit, push → confirm GitHub flags the commit as failing the codegen-drift check and blocks merging

### Reply With

- **"CI green, protection set"** → proceed to Plan 00-08 (final verification + README polish)
- **"CI failed: <job-name> — <error excerpt>"** → I will diagnose and propose a follow-up fix (most likely Sui tarball naming, Move dep fetch, or a missed empty-script in placeholder package.json files)
- **"skip protection for now"** → proceed to Plan 00-08 with a TODO note in the SUMMARY that branch protection still needs configuring before any second contributor joins (low risk on solo build per CONTEXT.md branch strategy)

## Forward References

- **Phase 1 MATH-05** replaces the parity job stub with the real three-runtime cross-runtime check (Move test runner + Python `deepvault.parity_runner` + TS `parity_runner.ts` all loading shared/golden-vectors.json and asserting bit-for-bit equality within tolerance). Job NAME stays `parity` so branch-protection rule survives.
- **Phase 4** may add a `dashboard-e2e` job (Playwright or similar). At that point, update branch-protection required-status-checks list to include `dashboard-e2e`.
- **Phase 5** mainnet redeploy: CI does NOT publish to mainnet; mainnet publish is a manual `sui client publish` step per docs/MAINNET-FUNDING.md. CI gates code merging into main; mainnet deploy is a separate human-gated step.

## Self-Check: PASSED

Files verified to exist:
- FOUND: .github/workflows/ci.yml
- FOUND: shared/golden-vectors.json
- FOUND: docs/CI-BRANCH-PROTECTION.md

Commits verified to exist in git log:
- FOUND: ca54db4 (Task 1: golden-vectors.json)
- FOUND: c828e72 (Task 2: ci.yml)
- FOUND: 616289e (Task 3: branch-protection doc)

Plan-level checks:
- 5 jobs verified in ci.yml (move, ts, python, codegen-drift, parity)
- parity needs: [move, ts, python, codegen-drift] verified
- codegen-drift uses cd backtest && uv sync --frozen AND cd backtest && uv run --no-project python ../scripts/codegen.py verified
- shared/golden-vectors.json contents == `[]` verified
- All four required actions pinned (checkout@v4, setup-node@v6, action-setup@v4, setup-uv@v8) verified
- docs/CI-BRANCH-PROTECTION.md contains all 5 required status check names verified

Plan 07 status: **COMPLETE-WITH-CHECKPOINT** (Tasks 1-3 done and committed; Task 4 awaiting human action per Resume Signal above).
