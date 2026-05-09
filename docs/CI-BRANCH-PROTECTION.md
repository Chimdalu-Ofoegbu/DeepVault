# CI Branch Protection Setup (one-time)

**Purpose:** Enforce CI as the merge gate per CONTEXT.md "Implementation Defaults" — required status checks on main, no human reviewer requirement (solo build).

**When to run:** Once, after the first push to main creates the workflow runs in the Actions tab. The required-status-check options only appear once GitHub has seen a job by that name run at least once.

**Pitfall avoided:** 0-F — main can be pushed past failing CI if branch protection is not configured.

## Option A: GitHub UI (recommended)

1. Visit https://github.com/<owner>/deepvault/settings/branches
2. Click "Add classic branch protection rule" (or "Add branch ruleset" — UI may vary)
3. Branch name pattern: `main`
4. Enable:
   - **Require status checks to pass before merging**
   - **Require branches to be up to date before merging**
5. Search-and-add these required status checks (must match job names in `.github/workflows/ci.yml`):
   - `move`
   - `ts`
   - `python`
   - `codegen-drift`
   - `parity`
6. **Disable** "Require pull request reviews before merging" (solo build per CONTEXT.md branch strategy)
7. Allow force pushes: **off**
8. Allow deletions: **off**
9. Click "Create" / "Save changes"

## Option B: gh CLI (scripted)

```bash
# Requires: gh auth login completed; repo creation done.
# Sets required status checks to the 5 CI jobs.
gh api -X PUT \
  repos/<owner>/deepvault/branches/main/protection \
  -F required_status_checks.strict=true \
  -F 'required_status_checks.contexts[]=move' \
  -F 'required_status_checks.contexts[]=ts' \
  -F 'required_status_checks.contexts[]=python' \
  -F 'required_status_checks.contexts[]=codegen-drift' \
  -F 'required_status_checks.contexts[]=parity' \
  -F enforce_admins=false \
  -F required_pull_request_reviews= \
  -F restrictions= \
  -F allow_force_pushes=false \
  -F allow_deletions=false
```

(The `required_pull_request_reviews=` empty value disables review requirement — solo build.)

## Verification

After configuring:

1. Push a commit that intentionally breaks CI (e.g., introduce a syntax error in `scripts/codegen.py`).
2. Confirm GitHub blocks the merge / shows the failing check on the commit.
3. Revert the bad commit; CI goes green; main resumes accepting pushes.

If main accepts the bad push without blocking: branch protection is misconfigured. Re-run setup.

## Maintenance

- When a new CI job is added (e.g., Phase 4 adds a `dashboard-e2e` job), update branch protection to require it as well.
- When CI job names change (rare), update the required-status-checks list.
- The `parity` job's behavior changes between Phase 0 (stub) and Phase 1 (real cross-runtime check) but its NAME stays `parity` — branch protection survives.

## References

- `.github/workflows/ci.yml` — the 5-job matrix
- `.planning/phases/00-setup-ground-rules/00-RESEARCH.md` Pitfall 0-F
- `.planning/phases/00-setup-ground-rules/00-CONTEXT.md` "Branch strategy: main only, push directly. CI gates merges to main via required-status-check on the default branch."
