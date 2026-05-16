#!/usr/bin/env bash
# scripts/preflight.sh
#
# Mainnet-readiness gate. Refuses to proceed if ANY locked check or operational
# gate fails. Run by the post-submission operator immediately before invoking
# scripts/mainnet-deploy.sh.
#
# Decision lineage:
#   - D-01     : Phase 5 deliverable — mainnet-readiness toolkit (write-but-don't-execute)
#   - D-05     : write-but-don't-execute — preflight is assert-only; NEVER invokes
#                any mainnet-mutating CLI command (publish, call, or transfer).
#                Caller pipeline is preflight (this script) -> mainnet-deploy.sh
#                -> mainnet-smoke-test.sh; only the second of those publishes.
#   - D-06     : preflight covers locked checks + 3 operational gates:
#                (a) every config/mainnet.toml TBD slot is filled (Pitfall 14)
#                (b) deploy wallet gas balance >= 10 SUI raw
#                (c) USDsui balance on deploy wallet >= 60 USDsui
#                   (= 10 USDsui seed consumed by vault::create_vault
#                    + 50 USDsui smoke-test deposit; carry-forward research #1)
#   - D-07     : no GitHub Actions cron; predict-mainnet-check.sh is invoked
#                manually OR by this preflight (step 14) — never on a schedule.
#   - DEPLOY-01: this script closes the preflight half of DEPLOY-01.
#
# Pitfall mitigations:
#   - Pitfall 14 specialization: section-aware TBD slot scan via `scan_tbd_slots`
#     (NOT a bare grep — see step 11).
#   - Pitfall 6:  DeepBookV3 SHA pin verification delegated to
#     scripts/verify-deepbookv3-pin.sh.
#
# Assertion inventory (each FAIL_LOUD with `::error::` for GitHub Actions compat):
#    1. SUI_CONFIG_DIR ends in 'sui_config_mainnet'           -> exit 1
#    2. sui client active-env == "mainnet"                    -> exit 1
#    3. sui --version contains "1.71.1"                       -> exit 1
#    4. DeepBookV3 SHA pin matches vendored subtree           -> propagate
#    5. Move build clean                                       -> propagate
#    6. Move test suite green                                  -> propagate
#    7. Python parity suite green                              -> propagate
#    8. Codegen drift check (--check) clean                    -> propagate
#    9. (D-06.b) gas balance >= 10 SUI raw                    -> exit 1
#   10. RESERVED (USDsui balance — see step 12)
#   11. (D-06.a) Section-aware TBD scan: no TBD slots in
#       config/mainnet.toml outside [hosting] (Phase 6 owns)
#       and outside [predict] / [oracle_svi] when
#       [contingency].predict_mainnet_shipped = false.        -> exit 1
#   12. (D-06.c) USDsui balance >= 60 USDsui (60_000_000
#       micro-units at 6 decimals)                            -> exit 1
#   13. RESERVED (kept for future ABI-fingerprint gate;
#       see Plan 05-02 backlog)
#   14. Predict mainnet readiness via predict-mainnet-check.sh:
#       require `"shipped":true`                              -> exit 1
#       (THIS IS THE INTENTIONAL FAIL TODAY per D-05.)
#
# Exit codes:
#   0  All preflight assertions green; safe to invoke mainnet-deploy.sh.
#   1  One or more assertions failed (see the `::error::` line above for which).
#   2  Repo state precludes meaningful check (e.g. missing config file).

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

MAINNET_CONFIG="config/mainnet.toml"

if [[ ! -f "${MAINNET_CONFIG}" ]]; then
    echo "::error::${MAINNET_CONFIG} not found." >&2
    exit 2
fi

# ============================================================
# 1. SUI_CONFIG_DIR scoping gate (D-06; never use `sui client switch`)
# ============================================================
echo "==> [1/14] SUI_CONFIG_DIR scoping gate..."
if [[ -z "${SUI_CONFIG_DIR:-}" ]] || [[ "${SUI_CONFIG_DIR}" != *"sui_config_mainnet"* ]]; then
    echo "::error::SUI_CONFIG_DIR must be set and end in 'sui_config_mainnet'." >&2
    echo "         Remediation: SUI_CONFIG_DIR=~/.sui/sui_config_mainnet bash scripts/preflight.sh" >&2
    exit 1
fi

# ============================================================
# 2. Active env is mainnet (defensive — should always be true with the above)
# ============================================================
echo "==> [2/14] Active sui env is mainnet..."
ENV_NAME="$(sui client active-env)"
if [[ "${ENV_NAME}" != "mainnet" ]]; then
    echo "::error::Active sui env is '${ENV_NAME}', expected 'mainnet'." >&2
    echo "         Remediation: sui client new-env --alias mainnet --rpc https://fullnode.mainnet.sui.io:443" >&2
    exit 1
fi

# ============================================================
# 3. Sui CLI version pin gate (mainnet-v1.71.1 per Phase 0)
# ============================================================
echo "==> [3/14] Sui CLI version pin (mainnet-v1.71.1)..."
SUI_VERSION_OUT="$(sui --version)"
if [[ "${SUI_VERSION_OUT}" != *"1.71.1"* ]]; then
    echo "::error::Sui CLI version is '${SUI_VERSION_OUT}', expected to contain '1.71.1'." >&2
    echo "         Remediation: install mainnet-v1.71.1 release tarball (see docs/MAINNET-READINESS.md)." >&2
    exit 1
fi

# ============================================================
# 4. DeepBookV3 SHA pin gate (Pitfall 6)
# ============================================================
echo "==> [4/14] DeepBookV3 SHA pin gate..."
bash scripts/verify-deepbookv3-pin.sh

# ============================================================
# 5. Move build gate
# ============================================================
echo "==> [5/14] Move build (contracts/)..."
(cd contracts && sui move build)

# ============================================================
# 6. Move test suite gate
# ============================================================
echo "==> [6/14] Move test suite..."
(cd contracts && sui move test --gas-limit 100000000000)

# ============================================================
# 7. Python parity gate
# ============================================================
echo "==> [7/14] Python parity tests (backtest/)..."
(cd backtest && uv run --no-project pytest)

# ============================================================
# 8. Codegen drift gate
# ============================================================
echo "==> [8/14] Codegen drift check..."
if ! (cd backtest && uv run --no-project python ../scripts/codegen.py --check); then
    echo "::error::Codegen drift detected. Remediation: run \`make codegen\` and commit the result." >&2
    exit 1
fi

# ============================================================
# 9. Gas balance operational gate (D-06.b): >= 10 SUI raw
# ============================================================
echo "==> [9/14] Gas balance >= 10 SUI raw..."
GAS_MIST="$(sui client gas --json | jq -r '[.[].mistBalance | tonumber] | add // 0')"
if (( GAS_MIST < 10000000000 )); then
    echo "::error::Deploy wallet gas balance ${GAS_MIST} mist < 10_000_000_000 mist (10 SUI)." >&2
    echo "         Remediation: top up deploy wallet per docs/MAINNET-READINESS.md." >&2
    exit 1
fi
echo "    gas balance: ${GAS_MIST} mist (>= 10 SUI required)"

# ============================================================
# 11. Section-aware TBD slot scan (D-06.a, Pitfall 14 specialization)
# ============================================================
# Walks config/mainnet.toml tracking the current [section] header. For any line
# matching `= "TBD"`, records it UNLESS the current section is:
#   - [hosting]                                       (Phase 6 owns these fills)
#   - [predict] / [oracle_svi]                         when predict_mainnet_shipped=false
#     (Predict mainnet has not shipped; these slots
#      legitimately stay TBD until Predict ships.)
#
# Implementation is an awk function — NOT a bare grep — because:
#   (T-05-02 mitigation) a bare grep would false-flag header prose containing
#   the literal string "TBD", and would not be section-aware (cannot exempt
#   [hosting] or contingency-gated sections without state).
#
# Returns 0 if no violating TBDs, 1 otherwise. Prints violators to stderr.
echo "==> [11/14] Section-aware TBD slot scan..."

# Capture contingency flag first (read literal value from [contingency]
# block of config/mainnet.toml; tolerates either bool literal).
PREDICT_MAINNET_SHIPPED="$(awk -F'[ =]+' '
    /^\[/ { section = $0; next }
    section == "[contingency]" && $1 == "predict_mainnet_shipped" { print $2; exit }
' "${MAINNET_CONFIG}")"

if [[ -z "${PREDICT_MAINNET_SHIPPED}" ]]; then
    echo "::error::Could not read [contingency].predict_mainnet_shipped from ${MAINNET_CONFIG}." >&2
    exit 2
fi

# Strip any quotes that may surround the bool literal.
PREDICT_MAINNET_SHIPPED="${PREDICT_MAINNET_SHIPPED//\"/}"

scan_tbd_slots() {
    local config_path="$1"
    local predict_shipped="$2"

    awk -v predict_shipped="${predict_shipped}" '
        BEGIN { section = ""; violators = 0 }

        # Section header line — capture the section name.
        /^[[:space:]]*\[[a-zA-Z_]+\][[:space:]]*$/ {
            # Strip leading [ and trailing ] to get bare section name.
            line = $0
            sub(/^[[:space:]]*\[/, "", line)
            sub(/\][[:space:]]*$/, "", line)
            section = line
            next
        }

        # Skip comment-only and blank lines.
        /^[[:space:]]*#/  { next }
        /^[[:space:]]*$/  { next }

        # Match `key = "TBD"` (allow leading whitespace; literal "TBD" only).
        /=[[:space:]]*"TBD"/ {
            # Section-aware exemptions.
            if (section == "hosting") next
            if (predict_shipped == "false" && (section == "predict" || section == "oracle_svi")) next

            printf("    [%s] %s\n", section, $0) > "/dev/stderr"
            violators++
        }

        END {
            if (violators > 0) {
                printf("::error::config/mainnet.toml has %d unfilled TBD slot(s); see lines above.\n", violators) > "/dev/stderr"
                exit 1
            }
        }
    ' "${config_path}"
}

scan_tbd_slots "${MAINNET_CONFIG}" "${PREDICT_MAINNET_SHIPPED}"

# ============================================================
# 12. USDsui balance operational gate (D-06.c): >= 60 USDsui
# ============================================================
# Per carry-forward research finding #1: vault::create_vault consumes a
# 10-USDsui seed, and the mainnet smoke test deposits a further 50 USDsui.
# Total wallet requirement = 60 USDsui (= 60_000_000 micro-units at 6 decimals).
#
# This gate SKIPS gracefully (::notice::) when quote_type_tag is still "TBD",
# because step 11 has already failed louder on that exact slot.
echo "==> [12/14] USDsui balance >= 60 USDsui..."
QUOTE_TYPE="$(grep -E '^quote_type_tag[[:space:]]*=' "${MAINNET_CONFIG}" | sed -E 's/.*"([^"]+)".*/\1/')"

if [[ "${QUOTE_TYPE}" == "TBD" ]] || [[ -z "${QUOTE_TYPE}" ]]; then
    echo "::notice::USDsui balance gate SKIPPED — quote_type_tag is TBD (step 11 already flagged)." >&2
else
    USDSUI_MICRO="$(sui client objects --json \
        | jq -r --arg type "${QUOTE_TYPE}" '
            [.[].data
             | select(.type == "0x2::coin::Coin<\($type)>")
             | (.content.fields.balance | tonumber)]
            | add // 0')"
    if (( USDSUI_MICRO < 60000000 )); then
        echo "::error::USDsui balance ${USDSUI_MICRO} micro-units < 60_000_000 (60 USDsui)." >&2
        echo "         (60 USDsui = 10 seed for vault::create_vault + 50 for smoke test.)" >&2
        echo "         Remediation: Cetus swap per docs/MAINNET-READINESS.md." >&2
        exit 1
    fi
    echo "    USDsui balance: ${USDSUI_MICRO} micro-units (>= 60_000_000 required)"
fi

# ============================================================
# 14. Predict-mainnet readiness gate (final; intentional FAIL today per D-05)
# ============================================================
# Re-invoke scripts/predict-mainnet-check.sh and require its verdict JSON to
# contain `"shipped":true`. Today this will report `"shipped":false` (Predict
# mainnet has not shipped) and preflight will exit 1 — that is the documented
# D-05 "write-but-don't-execute" expected state.
echo "==> [14/14] Predict mainnet readiness check..."
PREDICT_CHECK_OUT="$(bash scripts/predict-mainnet-check.sh /dev/stdout)"

if echo "${PREDICT_CHECK_OUT}" | grep -q '"shipped":true'; then
    echo "    Predict mainnet check: shipped=true (proceed)."
else
    echo "::error::Predict mainnet not shipped — preflight cannot pass until DeepBook Predict ships on mainnet." >&2
    echo "         Re-run after the predict-mainnet-check signals shipped:true." >&2
    echo "         Probe output:" >&2
    echo "${PREDICT_CHECK_OUT}" | head -n 5 >&2
    exit 1
fi

# ============================================================
# All gates green
# ============================================================
echo "==> preflight: all gates green; safe to publish."
exit 0
