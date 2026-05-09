#!/usr/bin/env bash
# scripts/predict-diff.sh
# Weekly Predict contract-version sweep — Pitfall 6 mitigation per .planning/research/PITFALLS.md.
#
# Usage:
#   scripts/predict-diff.sh [output-md-path]
#
# Reports new commits on predict-testnet-4-16 since the SHA recorded in .predict-diff-state.
# Output is a Markdown report suitable for piping into a GitHub Issue
# (.github/workflows/monday-predict-check.yml does this).
#
# IMPORTANT: This script does NOT auto-update .predict-diff-state.
# The state file advances only after a human triages the diff and decides whether
# to bump Move.toml's DeepBookV3 rev pin. This forces explicit acknowledgement
# of every potentially-breaking upstream change per Pitfall 6.

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
VENDOR_DIR="${REPO_ROOT}/scripts/deepbookv3"
STATE_FILE="${REPO_ROOT}/.predict-diff-state"
OUTPUT="${1:-/dev/stdout}"
BRANCH="predict-testnet-4-16"
UPSTREAM_URL="https://github.com/MystenLabs/deepbookv3.git"

# Watched paths within the DeepBookV3 fork that affect DeepVault.
#
# Resolved via Plan 00-05 Task 1 inspection (see 00-05-SUMMARY.md):
#   - packages/predict        contains predict.move + predict_manager.move + oracle.move (SVI)
#   - packages/deepbook       core spot venue (referenced by predict)
#   - packages/deepbook_margin DeepBook Margin (Phase 3 Track A precondition)
#   - packages/margin_liquidation Margin liquidation flow (Phase 3 LTV bounds)
#
# Open Question #2 (RESEARCH.md) RESOLVED: there is no `packages/predict_manager`
# nor `packages/oracle_svi` as standalone packages — predict_manager is a module
# inside predict, and oracle_svi (the OracleSVIUpdated event) lives in
# packages/predict/sources/oracle.move. The watch on `packages/predict` covers all.
WATCH_PATHS=(
  "packages/predict"
  "packages/deepbook"
  "packages/deepbook_margin"
  "packages/margin_liquidation"
)

if [[ ! -d "${VENDOR_DIR}" ]]; then
  echo "ERROR: ${VENDOR_DIR} does not exist. Did you run 'git subtree add' (see Plan 05 Task 1)?" >&2
  exit 2
fi

# Pitfall 0-G: explicitly fetch from upstream <branch>, not just origin.
# Subtree-vendored fork lives in the parent repo's tree (no inner .git), so we
# fetch upstream into a remote-tracking ref on the parent repo and diff via
# git log <last-sha>..<head-sha> -- scripts/deepbookv3/<watched-paths>.
git fetch --quiet "${UPSTREAM_URL}" "${BRANCH}" 2>/dev/null || true
HEAD_SHA="$(git rev-parse FETCH_HEAD 2>/dev/null || echo "")"

if [[ -z "${HEAD_SHA}" ]]; then
  cat > "${OUTPUT}" <<EOF
# Monday Predict Sweep — $(date -u +%F)

**Status:** ERROR — could not fetch \`${BRANCH}\` from upstream.
**Action:** Investigate network/auth (CI: check Actions runner egress; local: check git proxy).
EOF
  exit 0
fi

if [[ -f "${STATE_FILE}" ]]; then
  LAST_SHA="$(tr -d '[:space:]' < "${STATE_FILE}")"
else
  # First-ever sweep: use upstream HEAD as baseline so initial run reports "no new commits".
  LAST_SHA="${HEAD_SHA}"
fi

if [[ "${LAST_SHA}" == "${HEAD_SHA}" ]]; then
  cat > "${OUTPUT}" <<EOF
# Monday Predict Sweep — $(date -u +%F)

**Status:** No new commits on \`${BRANCH}\` since last sweep.
**HEAD:** \`${HEAD_SHA}\`
**Action:** None. CI green; no Move.toml bump needed.
EOF
  exit 0
fi

# Build the watched-paths arg list (relative to repo root, since the subtree is
# in-tree under scripts/deepbookv3/). Filter to only paths that exist on disk.
WATCH_ARGS=()
for p in "${WATCH_PATHS[@]}"; do
  full_path="scripts/deepbookv3/${p}"
  if [[ -d "${REPO_ROOT}/${full_path}" ]]; then
    WATCH_ARGS+=("${full_path}")
  fi
done

# Note: git log with a fetched but un-stored SHA range works against FETCH_HEAD.
# Use -- pathspec to restrict to watched directories (mapped through subtree path).
COMMITS_WATCHED="$(cd "${REPO_ROOT}" && git log --oneline "${LAST_SHA}..${HEAD_SHA}" -- "${WATCH_ARGS[@]}" 2>/dev/null || echo "")"
COMMITS_ALL="$(cd "${REPO_ROOT}" && git log --oneline "${LAST_SHA}..${HEAD_SHA}" 2>/dev/null || echo "")"

if [[ -z "${COMMITS_WATCHED}" ]]; then
  COMMITS_WATCHED="(none in watched paths — non-Predict commits only)"
fi
if [[ -z "${COMMITS_ALL}" ]]; then
  COMMITS_ALL="(empty range — both SHAs reachable, but no commits between)"
fi

cat > "${OUTPUT}" <<EOF
# Monday Predict Sweep — $(date -u +%F)

**Status:** New commits detected on \`${BRANCH}\`.
**Range:** \`${LAST_SHA}..${HEAD_SHA}\`
**Vendored prefix:** \`scripts/deepbookv3/\` (git subtree --squash)

## Commits affecting watched paths

\`\`\`
${COMMITS_WATCHED}
\`\`\`

## All commits in range

\`\`\`
${COMMITS_ALL}
\`\`\`

## Watched paths

${WATCH_ARGS[@]}

## Triage checklist

- [ ] Review diffs in watched paths above (\`git log -p ${LAST_SHA}..${HEAD_SHA} -- ${WATCH_ARGS[@]}\`)
- [ ] If breaking change to \`predict::supply\` / \`predict::mint\` / \`OracleSVIUpdated\` event:
  - [ ] Add label \`blocking\` to this issue (manually)
  - [ ] Halt feature work on the active phase
  - [ ] Update \`vault::predict_adapter\` to match the new ABI
  - [ ] Re-run integration suite
- [ ] If non-breaking:
  - [ ] Bump \`contracts/Move.toml\` DeepBookV3 \`rev\` pin to \`${HEAD_SHA}\`
  - [ ] Bump vendored fork: \`git subtree pull --prefix=scripts/deepbookv3 ${UPSTREAM_URL} ${BRANCH} --squash\`
  - [ ] Update state: \`echo "${HEAD_SHA}" > .predict-diff-state\`
  - [ ] Commit + push; close this issue

**State file is NOT auto-advanced.** Update manually with the command above only after triage decision is recorded.
EOF
