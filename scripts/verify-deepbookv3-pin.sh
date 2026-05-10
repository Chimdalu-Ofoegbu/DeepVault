#!/usr/bin/env bash
# scripts/verify-deepbookv3-pin.sh
#
# Asserts that contracts/Move.toml's DeepBookV3 / DeepBookPredict `rev = "..."`
# matches the upstream SHA the vendored subtree at scripts/deepbookv3/ was last
# pulled from (recorded as `git-subtree-split: <sha>` in the squash commit body).
#
# Mitigates RESEARCH.md Pitfall 6 (SHA pin drift between Move.toml and the
# vendored subtree) and Open Question #4. Wired into CI's `move` job before
# `sui move build` so drift cannot reach `main`.
#
# Exit codes:
#   0  All Move.toml rev pins match the subtree last-pull SHA.
#   1  Pin differs (drift detected).
#   2  Cannot determine subtree pull SHA (unexpected repo state, e.g. subtree
#      pulled without `--squash`).

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

MOVE_TOML="contracts/Move.toml"

# 1. Extract the rev pins from contracts/Move.toml. Both DeepBookV3 (subdir
#    deepbook) and DeepBookPredict (subdir predict) live in the same vendored
#    subtree, so they MUST share the same rev.
extract_rev() {
  local key="$1"
  grep -E "^${key}\s*=" "${MOVE_TOML}" \
    | sed -E 's/.*rev\s*=\s*"([0-9a-f]+)".*/\1/' \
    | head -n 1
}

DEEPBOOKV3_REV="$(extract_rev deepbook)"
DEEPBOOKPREDICT_REV="$(extract_rev deepbook_predict)"

if [[ -z "${DEEPBOOKV3_REV}" ]] || [[ ! "${DEEPBOOKV3_REV}" =~ ^[0-9a-f]{40}$ ]]; then
  echo "::error::Could not parse a 40-char SHA rev from ${MOVE_TOML} DeepBookV3 line."
  exit 2
fi

if [[ -z "${DEEPBOOKPREDICT_REV}" ]] || [[ ! "${DEEPBOOKPREDICT_REV}" =~ ^[0-9a-f]{40}$ ]]; then
  echo "::error::Could not parse a 40-char SHA rev from ${MOVE_TOML} DeepBookPredict line."
  exit 2
fi

if [[ "${DEEPBOOKV3_REV}" != "${DEEPBOOKPREDICT_REV}" ]]; then
  echo "::error::DeepBookV3 and DeepBookPredict rev pins disagree."
  echo "          DeepBookV3:      ${DEEPBOOKV3_REV}"
  echo "          DeepBookPredict: ${DEEPBOOKPREDICT_REV}"
  echo "          Both deps point at the same upstream repo and must share a SHA."
  exit 1
fi

MOVE_TOML_REV="${DEEPBOOKV3_REV}"

# 2. Extract the upstream SHA the subtree was last squashed from. `git subtree
#    --squash` records `git-subtree-split: <sha>` in the squash commit body.
#    The squash commit is reachable from any branch but `git log -- <path>`
#    follows the merge, not the squash itself, so we --grep the canonical
#    commit subject instead.
SQUASH_SHA="$(
  git log --all --grep='^Squashed .scripts/deepbookv3/. content from commit' \
    --pretty=format:'%H' 2>/dev/null \
  | head -n 1
)"

if [[ -z "${SQUASH_SHA}" ]]; then
  echo "::error::Could not find a squash commit for scripts/deepbookv3/ via git log."
  echo "          Was the subtree pulled with --squash? Run scripts/predict-diff.sh"
  echo "          to investigate."
  exit 2
fi

SUBTREE_SPLIT="$(
  git show --no-patch --pretty=format:'%b' "${SQUASH_SHA}" 2>/dev/null \
  | grep -E '^git-subtree-split:' \
  | head -n 1 \
  | awk '{print $2}'
)"

if [[ -z "${SUBTREE_SPLIT}" ]] || [[ ! "${SUBTREE_SPLIT}" =~ ^[0-9a-f]{40}$ ]]; then
  echo "::error::Could not extract git-subtree-split SHA from squash commit ${SQUASH_SHA}."
  exit 2
fi

# 3. Compare.
if [[ "${MOVE_TOML_REV}" != "${SUBTREE_SPLIT}" ]]; then
  echo "::error::DeepBookV3 SHA pin drift detected."
  echo "          ${MOVE_TOML} rev:        ${MOVE_TOML_REV}"
  echo "          Subtree last-pull SHA:   ${SUBTREE_SPLIT}"
  echo "          Squash commit:           ${SQUASH_SHA}"
  echo "          Fix: bump one or both. See CONTRIBUTING.md weekly Monday Predict sweep"
  echo "          and scripts/predict-diff.sh."
  exit 1
fi

echo "OK: DeepBookV3 + DeepBookPredict pin aligned at ${MOVE_TOML_REV}"
exit 0
