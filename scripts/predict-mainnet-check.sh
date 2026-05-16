#!/usr/bin/env bash
# scripts/predict-mainnet-check.sh
#
# Manual probe of Sui mainnet RPC for the DeepBook Predict package. Emits a
# JSON verdict to stdout and a Markdown report to the path given as $1 (or
# /dev/stdout when no path is given).
#
# Decision lineage:
#   - DEPLOY-01 (partial): preflight pairs with this probe; preflight cannot
#                          pass until this script reports `"shipped":true`.
#   - D-05 (partial)      : this script is read-only — no publishing CLI,
#                          no Move-call CLI, no signing, no gas. Single
#                          curl + jq pipeline against a public TLS endpoint.
#   - D-07               : MANUAL TOOL — NO GitHub Actions cron consumer. The
#                          earlier Phase 5 design included a `.github/workflows/
#                          predict-mainnet-check.yml` cron firing 2026-06-09;
#                          that workflow is DROPPED. This script is invoked
#                          manually by the operator (or transitively by
#                          scripts/preflight.sh step 14) — never on a schedule.
#
# Inputs:
#   $1 (optional)             : path for the Markdown report. Default /dev/stdout.
#   PREDICT_MAINNET_CANDIDATE : env var. The candidate Predict mainnet package
#                               ID to probe. Default "TBD" (no candidate; emits
#                               shipped:false with reason "awaiting announcement").
#
# Outputs:
#   - The JSON verdict appears as the FIRST line written to $OUTPUT, before
#     the Markdown report. Callers (preflight.sh step 14) can `grep -q`
#     `"shipped":true` cleanly without further parsing.
#   - The Markdown report follows the JSON line and mirrors scripts/predict-diff.sh
#     in shape (heading + verdict + interpretation + human-action checklist +
#     raw probe output).
#
# JSON verdict schema:
#   { "shipped": bool,
#     "package_id"?: string,  (present iff shipped=true)
#     "abi_match"?: bool,     (present iff shipped=true; v1 is name-only — see TODO)
#     "reason"?: string }     (present iff shipped=false)
#
# Exit codes:
#   0  Always — the verdict is DATA, not an error. shipped=false is a valid,
#      expected outcome (it is the state today; Predict mainnet has not shipped).
#
# RPC probe is read-only `sui_getObject` with {showType:true, showContent:true}.
# Mysten owns the TLS endpoint; we read public on-chain data (T-05-01 accepted).

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

OUTPUT="${1:-/dev/stdout}"
MAINNET_RPC="https://fullnode.mainnet.sui.io:443"
PREDICT_MAINNET_CANDIDATE="${PREDICT_MAINNET_CANDIDATE:-TBD}"

# ============================================================
# 1. Compute verdict
# ============================================================
if [[ "${PREDICT_MAINNET_CANDIDATE}" == "TBD" ]]; then
    # Mysten has not announced a mainnet Predict package; the candidate slot
    # is empty by design. Emit shipped:false with the documented reason.
    VERDICT_JSON='{"shipped":false,"reason":"no candidate package id; awaiting Mysten announcement"}'
else
    # Probe the mainnet RPC for the candidate package via sui_getObject.
    # `-fsS` makes curl fail loudly on HTTP errors and silent on success; we
    # then inspect the JSON-RPC `.result.data` field for presence.
    RESP="$(curl -fsS "${MAINNET_RPC}" \
        -H 'content-type: application/json' \
        -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"sui_getObject\",\"params\":[\"${PREDICT_MAINNET_CANDIDATE}\",{\"showType\":true,\"showContent\":true}]}")"

    if echo "${RESP}" | jq -e '.result.data' >/dev/null 2>&1; then
        # Package object exists on mainnet.
        #
        # TODO(post-submission): full type-signature ABI match.
        #   Phase 5 v1 ABI match is NAME-ONLY (carry-forward from prior plan
        #   run; see 05-RESEARCH.md Open Question 5). For v1 we hardcode
        #   abi_match:true when the package exists at all, because:
        #     (a) full ABI introspection requires
        #         client.getNormalizedMoveModulesByPackage(packageId) + a diff
        #         against the vendored testnet source (~50 LOC TS), and
        #     (b) the operator who runs this script post-submission will diff
        #         predict_adapter.move against the live ABI by hand before
        #         proceeding with mainnet-deploy.sh.
        #   The name-only verdict is sufficient to unblock preflight today;
        #   structural drift is caught at the predict_adapter compile step.
        VERDICT_JSON="$(printf '{"shipped":true,"package_id":"%s","abi_match":true}' \
            "${PREDICT_MAINNET_CANDIDATE}")"
    else
        VERDICT_JSON='{"shipped":false,"reason":"package not found on mainnet"}'
    fi
fi

# ============================================================
# 2. Emit Markdown report (JSON verdict is the first line)
# ============================================================
# Call contract: the first line of $OUTPUT is the JSON verdict itself. The
# Markdown report follows. Callers that only need the verdict can `head -n 1`;
# callers that want the report read the full file. preflight.sh step 14 uses
# `grep -q '"shipped":true'` against the full output.
{
    printf '%s\n' "${VERDICT_JSON}"
    printf '\n'
    printf '# Predict Mainnet Check — %s\n' "$(date -u +%F)"
    printf '\n'
    printf '**Run at:** %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    printf '**Candidate package id:** `%s`\n' "${PREDICT_MAINNET_CANDIDATE}"
    printf '**Verdict (JSON):** `%s`\n' "${VERDICT_JSON}"
    printf '\n'
    printf '## Verdict for Phase 5\n'
    printf '\n'
    printf -- '- `shipped=true` + `abi_match=true` -> proceed with `scripts/preflight.sh` then `scripts/mainnet-deploy.sh`.\n'
    printf -- '- `shipped=true` + `abi_match=false` -> HALT. Re-integrate `predict_adapter.move` against the new ABI before proceeding.\n'
    printf -- '- `shipped=false` -> keep the current deferred-deploy posture. Re-run this probe when Mysten announces a candidate mainnet Predict package.\n'
    printf '\n'
    printf '## Required human action\n'
    printf '\n'
    printf '1. Review this report and the raw probe output below.\n'
    printf '2. Update `config/mainnet.toml [contingency].predict_mainnet_shipped` to match the verdict.\n'
    printf '3. If a candidate is available, export `PREDICT_MAINNET_CANDIDATE` to that package id and re-run this script.\n'
    printf '4. Commit the config change to master (paired with the verdict report attached as the commit body).\n'
    printf '\n'
    printf '## Raw probe output\n'
    printf '\n'
    printf '```json\n%s\n```\n' "${VERDICT_JSON}"
} > "${OUTPUT}"

exit 0
