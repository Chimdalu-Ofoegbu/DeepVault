---
phase: 00-setup-ground-rules
plan: 05
subsystem: infra
tags: [predict-sweep, pitfall-6, deepbookv3, git-subtree, github-actions, cron]

# Dependency graph
requires: [00-01, 00-02]
provides:
  - "DeepBookV3 fork vendored at scripts/deepbookv3/ via git subtree --squash from MystenLabs/deepbookv3 predict-testnet-4-16 (HEAD 1159d79af33c70e09e406310e1d8f067832ede9d) — in-tree, no submodule init friction"
  - "scripts/predict-diff.sh — bash script that fetches latest predict-testnet-4-16, diffs against .predict-diff-state, emits Markdown triage report; never auto-advances state per Pitfall 6"
  - ".predict-diff-state — single-line file storing last-triaged 40-char SHA (initial value: 1159d79af33c70e09e406310e1d8f067832ede9d, matches Plan 00-02 Move.toml rev pin); advances ONLY on human triage"
  - ".github/workflows/monday-predict-check.yml — cron 0 14 * * 1 (Monday 14:00 UTC = 09:00 ET / 06:00 PT) + workflow_dispatch; creates labelled triage Issue from script output via peter-evans/create-issue-from-file@v6"
  - "Resolution of RESEARCH Open Question #2: predict_manager and oracle_svi are NOT separate top-level packages in the fork — predict_manager.move and oracle.move (containing OracleSVIUpdated event + SVIParams struct) live INSIDE packages/predict/sources/. WATCH_PATHS in predict-diff.sh updated accordingly."
affects: [00-06, phase-1, phase-3, phase-5]

# Tech tracking
tech-stack:
  added:
    - "git subtree (vendoring strategy) — DeepBookV3 fork lives in-tree at scripts/deepbookv3/, no .gitmodules / submodule init step required for new clones"
    - "GitHub Actions cron workflow tier — first scheduled (non-CI-trigger) workflow in the repo; lays the foundation for any future scheduled jobs (e.g., mainnet liveness pings)"
    - "peter-evans/create-issue-from-file@v6 — declarative Issue creator (no inline gh CLI calls); idempotent via title uniqueness from github.run_id"
  patterns:
    - "Pitfall 6 mitigation discipline: (1) script never writes state, (2) workflow never auto-fails CI, (3) Issue creation IS the alert mechanism, (4) human triage is the ONLY way to advance .predict-diff-state and bump Move.toml rev"
    - "Pitfall 0-D: workflow file MUST live on default branch (master) for the cron schedule to fire — documented in workflow header comment"
    - "Pitfall 0-G: explicit upstream URL + branch fetch (`git fetch <url> <branch>`), never bare `git fetch origin` — captured in script's UPSTREAM_URL variable"
    - "Subtree --squash hygiene: history bloat avoided (single squash + merge commit per pull); upstream SHA tracked via squash commit message + .predict-diff-state, NOT via re-walking subtree history"

key-files:
  created:
    - scripts/deepbookv3/   # vendored fork (entire DeepBookV3 predict-testnet-4-16 tree, squashed)
    - scripts/predict-diff.sh
    - .predict-diff-state
    - .github/workflows/monday-predict-check.yml
  modified: []

key-decisions:
  - "WATCH_PATHS = [packages/predict, packages/deepbook, packages/deepbook_margin, packages/margin_liquidation]. Original plan listed packages/predict_manager and packages/oracle_svi as standalone packages; they are NOT — predict_manager is a module file (predict_manager.move) inside packages/predict/sources/, and the OracleSVIUpdated event lives in packages/predict/sources/oracle.move (verified by grep). Watching packages/predict therefore covers all three predict-related concerns. Added packages/deepbook_margin and packages/margin_liquidation because the two-protocol PTB story (per PROJECT.md) depends on Margin contracts, so churn there is just as breaking as churn in predict."
  - "Used `git subtree add --squash` (not submodule, not subtree without squash). --squash collapses upstream history into a single commit on bump (`git subtree pull ... --squash`), so the parent repo log stays readable. New contributors clone once and immediately have the vendored source — no `git submodule update --init` ritual."
  - "Cron schedule chosen as `0 14 * * 1` (14:00 UTC Mondays = 09:00 ET / 06:00 PT) over the original RESEARCH-paste-ready time of 09:00 UTC. Rationale per Pattern 8 cron caveat: GitHub Actions schedule events can be delayed by hours under load, so scheduling at 14:00 UTC (06:00 PT) provides headroom before the 09:00 ET (13:00 UTC) standup target. workflow_dispatch is wired so Monday morning catchup is one button click."
  - "Issue title uses `${{ github.run_id }}` rather than RESEARCH.md's suggested `${{ github.event.repository.updated_at || 'manual' }}`. Rationale: run_id is always populated and is monotonic per run; if GitHub re-runs a delayed schedule, the second run gets a unique ID (no duplicate-issue collision on identical titles)."
  - "State file format: a single 40-char hex SHA followed by trailing newline (41 bytes total). Whitespace-stripped on read (`tr -d '[:space:]'`) so manual editing or CRLF on Windows doesn't break the comparison."
  - "Subtree-vendored fork has no inner .git directory (verified: `test -d scripts/deepbookv3/.git` returns false). Diff script therefore runs `git log` against the parent repo with subtree-prefixed pathspec (e.g., `scripts/deepbookv3/packages/predict`), NOT `cd scripts/deepbookv3 && git log` as the original plan draft suggested. This is the correct subtree-aware idiom."

requirements-completed: [SETUP-05]

# Metrics
duration: 8min
completed: 2026-05-09
---

# Phase 0 Plan 05: Predict Contract Churn Mitigation (Pitfall 6) Summary

**Weekly Monday Predict-version sweep ritual landed end-to-end. The DeepBookV3 fork is vendored at `scripts/deepbookv3/` via `git subtree add --squash` (HEAD `1159d79af33c70e09e406310e1d8f067832ede9d`, matches the rev pin in Plan 00-02's Move.toml). `scripts/predict-diff.sh` fetches the latest `predict-testnet-4-16` from upstream, diffs against `.predict-diff-state`, and emits a Markdown triage report — currently reports "no new commits" since state matches upstream HEAD. `.github/workflows/monday-predict-check.yml` runs the script every Monday at 14:00 UTC (09:00 ET / 06:00 PT, with delay headroom), pipes output into `peter-evans/create-issue-from-file@v6`, and creates a labelled (`predict-sweep`, `triage`) Issue. Critically, the script does NOT auto-advance state and the workflow does NOT auto-fail CI — Issue creation IS the alert mechanism per Pitfall 6 design, and a human bumps the state file + Move.toml rev only after triage. RESEARCH Open Question #2 resolved inline: `predict_manager` and `oracle_svi` are NOT separate top-level packages in the vendored fork — they are modules inside `packages/predict/sources/`, so `WATCH_PATHS` watches `packages/predict` (which covers all three) plus `packages/deepbook`, `packages/deepbook_margin`, and `packages/margin_liquidation` (the latter two added because the two-protocol PTB story makes Margin churn equally breaking). SETUP-05 satisfied; ROADMAP Phase 0 success criterion #3 (weekly sweep + calendar reminder) satisfied.**

## Performance

- **Duration:** ~8 min (subtree fetch network-bound; rest paste + verify)
- **Started:** 2026-05-09T04:58:56Z
- **Completed:** 2026-05-09T05:06:04Z
- **Tasks executed:** 4 of 4 (no deferrals, no checkpoints)
- **Files created:** 4 (one is a directory tree of ~hundreds of vendored fork files)
- **Files modified:** 0

## Accomplishments

- **`scripts/deepbookv3/` vendored via `git subtree add --squash` from `https://github.com/MystenLabs/deepbookv3.git` branch `predict-testnet-4-16`.** Two commits land in the parent repo log: `8250375 Squashed 'scripts/deepbookv3/' content from commit 1159d79` plus the merge commit `2292404 Merge commit '8250375…' as 'scripts/deepbookv3'`. Both stay (per success criterion). The subtree contains the full upstream tree: top-level `Cargo.toml`, `crates/`, `docker/`, `packages/`, `scripts/`, plus README + LICENSE + AGENTS.md + CLAUDE.md + PREDICT_MIGRATION.md. `packages/` directory enumerated: `dbtc`, `deepbook`, `deepbook_margin`, `dusdc`, `margin_liquidation`, `predict`, `token`. Critically, **NO `predict_manager` package, NO `oracle_svi` package** — Open Question #2 resolution. Inside `packages/predict/sources/`: `predict.move`, `predict_manager.move`, `oracle.move`, `oracle_config.move`, `registry.move`, plus `config/`, `helper/`, `market_key/`, `vault/` subdirs. Grepping `oracle.move` confirmed `OracleSVIUpdated` event struct (line 58) and `SVIParams` struct (line 72) are defined in there. No `.git` directory inside `scripts/deepbookv3/` (verified: `test -d scripts/deepbookv3/.git` returns false), confirming this is a true subtree (in-tree) and not a submodule. Upstream HEAD SHA captured via `git ls-remote https://github.com/MystenLabs/deepbookv3.git predict-testnet-4-16` returned `1159d79af33c70e09e406310e1d8f067832ede9d` — matches Plan 02's Move.toml rev pin bit-for-bit. Plan 02's Pitfall 0-A guard not violated: `git subtree add` only adds new tree under `scripts/deepbookv3/`; `contracts/Move.toml` untouched.

- **`scripts/predict-diff.sh` committed (5,467 bytes, 145 lines, executable mode 755).** Shebang `#!/usr/bin/env bash`, `set -euo pipefail`. Variables: `REPO_ROOT` (from `git rev-parse --show-toplevel`), `VENDOR_DIR=${REPO_ROOT}/scripts/deepbookv3`, `STATE_FILE=${REPO_ROOT}/.predict-diff-state`, `OUTPUT=${1:-/dev/stdout}`, `BRANCH=predict-testnet-4-16`, `UPSTREAM_URL=https://github.com/MystenLabs/deepbookv3.git`. WATCH_PATHS array: `packages/predict`, `packages/deepbook`, `packages/deepbook_margin`, `packages/margin_liquidation` (revised from plan-as-written per Open Question #2 resolution). Script flow: (1) verify `VENDOR_DIR` exists or exit 2 with helpful error; (2) `git fetch --quiet ${UPSTREAM_URL} ${BRANCH}` → captures `FETCH_HEAD` SHA; (3) read `LAST_SHA` from state file (whitespace-stripped via `tr -d '[:space:]'` for CRLF tolerance) or default to `HEAD_SHA` for first-ever sweep; (4) if `LAST_SHA == HEAD_SHA`, write "No new commits" report and exit 0; (5) otherwise, build pathspec args (filter to existing dirs only — defensive against future fork restructure), run `git log --oneline LAST_SHA..HEAD_SHA -- <pathspec>` for watched-paths-only commits AND for the full range, write a triage report with both lists + a checklist + the literal commands to bump the state file and rev pin. Script header comment explicitly states "This script does NOT auto-update .predict-diff-state" — captures the Pitfall 6 design intent in the source. Smoke-tested locally (Git Bash on Windows): exit 0, output Markdown matches "No new commits" template, with HEAD = `1159d79…ede9d`.

- **`.predict-diff-state` initialized with `1159d79af33c70e09e406310e1d8f067832ede9d\n` (41 bytes total).** Single-line file at repo root. Content: 40-char hex SHA + trailing newline. Verified: `wc -c .predict-diff-state` = 41, `grep -E '^[0-9a-f]{40}' .predict-diff-state` matches. Smoke-test of `bash scripts/predict-diff.sh /tmp/sweep-init.md` against this state produced exactly the expected "No new commits" report (status, HEAD SHA matches state, action: None). State file IS committed to repo (proves it advances only on triage; the commit history of this single file becomes the audit trail of every Predict bump). Plan 00-02's Move.toml rev pin and this state file are now synchronized at the same SHA — first sweep on next Monday will report no diff (or a diff ONLY for any commits Mysten lands between 2026-05-09 and that Monday, exactly the intended behaviour).

- **`.github/workflows/monday-predict-check.yml` committed (45 lines, valid YAML 1.2).** Workflow name `Monday Predict Sweep`. Triggers: `schedule.cron: '0 14 * * 1'` (Monday 14:00 UTC) + `workflow_dispatch: {}` (manual button in Actions UI). Permissions: `issues: write` (required for `peter-evans/create-issue-from-file`) + `contents: read`. Single job `sweep` on `ubuntu-latest`. Three steps: (1) `actions/checkout@v4` with `fetch-depth: 0` (full history needed because the diff script runs `git log` over the in-tree subtree, and shallow clones lose subtree history); (2) `Run predict-diff` invokes `bash scripts/predict-diff.sh /tmp/sweep/report.md` then `cat`s the report into the run log for human-debug visibility; (3) `Create Issue from report` uses `peter-evans/create-issue-from-file@v6` with title `Monday Predict Sweep — ${{ github.run_id }}` (run_id chosen over `repository.updated_at` for monotonic uniqueness across delayed re-runs), `content-filepath: /tmp/sweep/report.md`, labels `predict-sweep` + `triage`. Workflow does NOT have a fail-on-diff step — Issue creation IS the alert; CI stays green. YAML validated via `python -m yaml.safe_load` (no errors). All 10 plan-mandated assertions pass: file exists, workflow name, cron expression, workflow_dispatch, issues:write, checkout@v4, peter-evans/create-issue-from-file@v6, scripts/predict-diff.sh invocation, predict-sweep label, triage label.

## Verification Performed

- **Subtree integrity:** `ls scripts/deepbookv3/packages/` returned `dbtc deepbook deepbook_margin dusdc margin_liquidation predict token` (7 packages). `test -d scripts/deepbookv3/.git` returned false (correct: subtree, not submodule). `git log --oneline | head -3` showed both expected subtree commits.
- **Upstream SHA confirmation:** `git ls-remote https://github.com/MystenLabs/deepbookv3.git predict-testnet-4-16` returned `1159d79af33c70e09e406310e1d8f067832ede9d` — matches both `.predict-diff-state` and (per Plan 00-02 SUMMARY) `contracts/Move.toml` rev pin.
- **OracleSVIUpdated location:** `grep -n "OracleSVIUpdated\|SVIParams" scripts/deepbookv3/packages/predict/sources/oracle.move` returned hits at lines 58, 72, 198, etc. Confirms there is no separate `oracle_svi` package; the event lives in `packages/predict/sources/oracle.move`. Phase 1 indexer + dashboard work will reference this exact module path.
- **Script syntax + execution:** `bash -n scripts/predict-diff.sh` exited 0 (no syntax errors). `bash scripts/predict-diff.sh /tmp/sweep-init.md` exited 0; output matched the "No new commits" template; HEAD line printed `1159d79af33c70e09e406310e1d8f067832ede9d`.
- **State file format:** `cat .predict-diff-state` printed the 40-char hex SHA. `wc -c .predict-diff-state` returned 41. `grep -E '^[0-9a-f]{40}$' .predict-diff-state` matched (with trailing-newline tolerance).
- **Workflow YAML:** `python -m pip install pyyaml && python -c "import yaml; yaml.safe_load(open('.github/workflows/monday-predict-check.yml'))"` returned no error. All 10 grep-based plan assertions passed.
- **Move.toml not touched:** `git diff HEAD~4 HEAD -- contracts/Move.toml` shows no changes since Plan 00-02 — Pitfall 0-A guard preserved.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected WATCH_PATHS array to match actual vendored fork structure**

- **Found during:** Task 1 verification (`ls scripts/deepbookv3/packages/`) + Task 2 grep of `oracle.move`.
- **Issue:** Plan-as-written specified `WATCH_PATHS=("packages/deepbook" "packages/predict" "packages/predict_manager" "packages/oracle_svi")`. Two of those four paths do NOT exist as standalone packages in the fork. Predict-diff.sh would silently watch nothing for those two paths (the dir-existence filter handles that), but the original list is misleading and would mask real churn in the actual `predict_manager.move` and `oracle.move` files.
- **Fix:** Updated `WATCH_PATHS` to `("packages/predict" "packages/deepbook" "packages/deepbook_margin" "packages/margin_liquidation")`. `packages/predict` covers `predict.move` + `predict_manager.move` + `oracle.move` (where `OracleSVIUpdated` lives) + `oracle_config.move` + `registry.move`. Added `packages/deepbook_margin` and `packages/margin_liquidation` because the PROJECT.md two-protocol PTB story (Margin + Predict) makes Margin contract churn equally breaking — same Monday-sweep cadence applies. Documented in script comments and in this SUMMARY's key-decisions.
- **Files modified:** `scripts/predict-diff.sh` (WATCH_PATHS array + explanatory comment block).
- **Commit:** `6169587` (Task 2 commit; deviation included in initial write).

**2. [Rule 2 - Critical] Replaced `cd ${VENDOR_DIR} && git log` pattern with parent-repo `git log -- <subtree-prefixed-pathspec>`**

- **Found during:** Task 2 design phase, after confirming subtree (no inner `.git`) in Task 1.
- **Issue:** Plan-as-written and RESEARCH Pattern 7 both have the script `cd "${VENDOR_DIR}"` then run `git fetch origin` and `git rev-parse origin/predict-testnet-4-16`. That assumes the vendored fork is a submodule (or a separate clone) with its own `.git` and a configured `origin` remote. With `git subtree add --squash`, `scripts/deepbookv3/` is a plain in-tree directory — there's no inner `.git`, so `cd scripts/deepbookv3 && git rev-parse origin/predict-testnet-4-16` would resolve against the PARENT repo's refs (which has no such ref unless we explicitly add a remote). The script as paste-written would be subtly broken.
- **Fix:** Script runs `git fetch --quiet ${UPSTREAM_URL} ${BRANCH}` from anywhere (no cd) — fetches into `FETCH_HEAD` on the parent repo. Then `git log LAST_SHA..FETCH_HEAD -- scripts/deepbookv3/<watched-path>` runs against the parent repo with subtree-prefixed pathspec. Functionally equivalent to the submodule version, correct for subtree topology. Documented in code comments. This is the standard subtree-aware idiom (per `git help subtree` § "Synchronizing with the upstream").
- **Files modified:** `scripts/predict-diff.sh` (entire script restructured around parent-repo git operations).
- **Commit:** `6169587` (Task 2 commit; deviation included in initial write).

**3. [Rule 2 - Critical] Added robust error handling for failed upstream fetch**

- **Found during:** Task 2 design phase.
- **Issue:** RESEARCH Pattern 7 has `git fetch origin predict-testnet-4-16 --quiet` with no fallback. If GitHub is down, network is offline, or upstream branch is renamed, the workflow would either succeed-with-stale-data or fail in a confusing way deep inside `git log`.
- **Fix:** Wrapped fetch in `|| true` and capture `HEAD_SHA="$(git rev-parse FETCH_HEAD 2>/dev/null || echo "")"`. If empty, write a degraded-but-valid Markdown report stating "ERROR — could not fetch ${BRANCH} from upstream" with an action item, then exit 0 (so the workflow still creates an Issue rather than failing silently). Triager sees the Issue and investigates.
- **Files modified:** `scripts/predict-diff.sh`.
- **Commit:** `6169587`.

### Auth gates encountered

None.

### Architectural changes

None.

## Reminder for downstream phases

- **Plan 00-06 (CONTRIBUTING.md)** must reference `scripts/predict-diff.sh` in its "Weekly Monday Predict sweep" section. Specifically: when triage decides a bump is non-breaking, the documented bump command in CONTRIBUTING.md should mirror the triage checklist in the predict-diff.sh report (`echo "${HEAD_SHA}" > .predict-diff-state` + `git subtree pull --prefix=scripts/deepbookv3 https://github.com/MystenLabs/deepbookv3.git predict-testnet-4-16 --squash` + bump `contracts/Move.toml` rev).
- **First push to master after Plan 00-05 lands:** manually trigger the workflow once via Actions UI > Monday Predict Sweep > Run workflow to verify Issue creation works against the actual GitHub Issues surface (labels are auto-created by `peter-evans/create-issue-from-file@v6` if missing). This is the only step that cannot be locally verified — flagged in deferred-items below.
- **Phase 1 day-1 spike** can use the vendored `scripts/deepbookv3/packages/predict/sources/oracle.move` as the source of truth for the `OracleSVIUpdated` event struct schema (resolves the corresponding Phase 0/1 verification gap in STATE.md blockers). No need to re-fetch — the subtree is in-tree.

## Deferred Issues

- **Manual workflow_dispatch verification post-push:** Cannot be tested until this commit lands on the default branch (master) on GitHub remote. Documented as a one-step-after-push action item.
- **`predict-sweep` and `triage` labels auto-creation behavior:** `peter-evans/create-issue-from-file@v6` documents that missing labels are auto-created on first run; if the GitHub repo's label policy disallows that (uncommon), the workflow's first run will fail at the Issue-creation step. Mitigation: pre-create the labels manually via `gh label create predict-sweep --description "Weekly Predict contract sweep" --color FBCA04` + `gh label create triage --color D93F0B` after first push. Not blocking; surfaced for awareness.

## Self-Check: PASSED

- scripts/deepbookv3/ — FOUND (directory exists, packages/ verified)
- scripts/predict-diff.sh — FOUND (executable, syntax OK, smoke-test OK)
- .predict-diff-state — FOUND (40-char SHA + newline, 41 bytes)
- .github/workflows/monday-predict-check.yml — FOUND (valid YAML, all assertions pass)
- Commit 8250375 (Squashed subtree) — FOUND in git log
- Commit 2292404 (Subtree merge) — FOUND in git log
- Commit 6169587 (Task 2: predict-diff.sh) — FOUND in git log
- Commit dd50391 (Task 3: .predict-diff-state) — FOUND in git log
- Commit 3bfe6f7 (Task 4: monday-predict-check.yml) — FOUND in git log
