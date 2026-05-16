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

# 1. Extract the rev pin from contracts/Move.toml.
#
# Post-2026-05-16: deepbook_predict is local-vendored (no `rev =`), because
# upstream packages/predict/ is missing Published.toml. deepbook stays git-based
# (its upstream Published.toml is present). The vendored predict source must
# match the deepbook SHA — verified below via subtree-split equivalence.
extract_rev() {
  local key="$1"
  grep -E "^${key}\s*=" "${MOVE_TOML}" \
    | sed -E 's/.*rev\s*=\s*"([0-9a-f]+)".*/\1/' \
    | head -n 1
}

DEEPBOOKV3_REV="$(extract_rev deepbook)"

if [[ -z "${DEEPBOOKV3_REV}" ]] || [[ ! "${DEEPBOOKV3_REV}" =~ ^[0-9a-f]{40}$ ]]; then
  echo "::error::Could not parse a 40-char SHA rev from ${MOVE_TOML} DeepBookV3 line."
  exit 2
fi

# Sanity: deepbook_predict line MUST be present and MUST be a `local = "..."`
# pointer at the vendored subtree. If it ever flips back to a git dep, the
# author needs to confirm upstream finally shipped Published.toml.
PREDICT_LINE="$(grep -E '^deepbook_predict\s*=' "${MOVE_TOML}" | head -n 1)"
if [[ -z "${PREDICT_LINE}" ]]; then
  echo "::error::No deepbook_predict line found in ${MOVE_TOML}."
  exit 2
fi
if [[ ! "${PREDICT_LINE}" =~ local[[:space:]]*=[[:space:]]*\"\.\./scripts/deepbookv3/packages/predict\" ]]; then
  echo "::error::deepbook_predict is not the expected local-vendor pointer in ${MOVE_TOML}."
  echo "         Found:    ${PREDICT_LINE}"
  echo "         Expected: deepbook_predict = { local = \"../scripts/deepbookv3/packages/predict\" }"
  echo "         If upstream has shipped Published.toml for predict, you can revert to a"
  echo "         git dep — also re-symmetrize this script's rev-equality check."
  exit 1
fi

# Assert the vendored predict ships its hand-authored Published.toml (the whole
# reason we switched to local-vendor).
PREDICT_PUBLISHED="scripts/deepbookv3/packages/predict/Published.toml"
if [[ ! -f "${PREDICT_PUBLISHED}" ]]; then
  echo "::error::${PREDICT_PUBLISHED} missing — local-vendor predict requires it."
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
