#!/usr/bin/env bash
# scripts/mainnet-deploy.sh
#
# Mainnet publish of the deepvault Move package + vault::create_vault +
# MAINNET-DEPLOY.json capture. Forked from scripts/e2e-vault-deploy.sh
# (testnet analog, 237 LOC) with the mainnet divergences listed inline.
#
# Decision lineage:
#   - DEPLOY-02 : Mainnet deploy script written (this file); execution deferred
#                 to post-submission per Phase 5 reshape (Predict mainnet pending).
#   - DEPLOY-03 : Vault shared object created on mainnet with quote=USDsui;
#                 AdminCap held by deployer wallet (gate: AdminCap owner check
#                 below).
#   - D-05      : write-but-don't-execute. This script is committed and
#                 intentionally NOT invoked at plan-execute time. The
#                 post-submission operator runs it AFTER:
#                   (1) scripts/predict-mainnet-check.sh reports shipped:true
#                   (2) scripts/preflight.sh exits 0
#                 The operator pipeline is preflight (gate) -> mainnet-deploy
#                 (this script) -> mainnet-smoke-test.
#
# 9-step structure (mirrors scripts/e2e-vault-deploy.sh):
#    1. SUI_CONFIG_DIR scoping defensive gate (sui_config_mainnet only)
#    2. Config-driven constants from config/mainnet.toml (NOT hardcoded;
#       Pitfall 14 mitigation). Section-aware awk helper.
#    3. DeepBookV3 SHA pin verification (Pitfall 6)
#    4. Move build (drives Move.toml dep resolution)
#    5. Active env + funded deployer
#    6. Publish package on mainnet (gas-budget 1.0 SUI vs 0.5 SUI testnet)
#    7. Parse PendingTreasury + locate seed coin + split 10 USDsui seed
#    8. Call vault::create_vault<USDsui>(pending, seed, ctx)
#    9. Parse vault_id, admin_cap_id, predict_manager_id; verify AdminCap owner
#       == deployer; capture oracle_svi_id from config; write MAINNET-DEPLOY.json
#
# Pitfall 14 mitigation: every mainnet address is read from config/mainnet.toml
# via the section-aware extract_config_value() helper. NEVER hardcoded.
#
# This script does NOT re-run scripts/preflight.sh — separation of concerns;
# preflight is the operator's responsibility (T-05-22 mitigation per plan).
# However step 2 defensively asserts no TBD slots in the values it reads.

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

MAINNET_CONFIG="config/mainnet.toml"

if [[ ! -f "${MAINNET_CONFIG}" ]]; then
    echo "::error::${MAINNET_CONFIG} not found." >&2
    exit 2
fi

# ============================================================
# 1. SUI_CONFIG_DIR scoping defensive gate (Phase 0 D-06)
# ============================================================
# This script publishes on mainnet — under no circumstances can it run with
# an ambient testnet keystore. Mirror of scripts/preflight.sh gate 1; we
# repeat the check here so that even if an operator skips preflight, this
# script refuses to touch a wrong-keystore.
echo "==> [1/9] SUI_CONFIG_DIR scoping defensive gate..."
if [[ -z "${SUI_CONFIG_DIR:-}" ]] || [[ "${SUI_CONFIG_DIR}" != *"sui_config_mainnet"* ]]; then
    echo "::error::SUI_CONFIG_DIR must be set and end in 'sui_config_mainnet'." >&2
    echo "         Remediation: SUI_CONFIG_DIR=~/.sui/sui_config_mainnet bash scripts/mainnet-deploy.sh" >&2
    exit 1
fi

# ============================================================
# 2. Config-driven constants (Pitfall 14 mitigation)
# ============================================================
# extract_config_value <section> <key>
#
# Walks ${MAINNET_CONFIG} respecting `[section]` boundaries. Returns the
# unquoted string value for the requested (section, key) pair, or empty
# string if not found. Uses awk (NOT bare grep) so [section]-ordering
# changes in mainnet.toml don't break this helper.
extract_config_value() {
    local section_name="$1"
    local key_name="$2"
    awk -v want_section="${section_name}" -v want_key="${key_name}" '
        BEGIN { in_section = 0 }
        /^[[:space:]]*\[[a-zA-Z_]+\][[:space:]]*$/ {
            line = $0
            sub(/^[[:space:]]*\[/, "", line)
            sub(/\][[:space:]]*$/, "", line)
            in_section = (line == want_section) ? 1 : 0
            next
        }
        in_section == 1 {
            # Match `key = "value"` with optional whitespace.
            if (match($0, "^[[:space:]]*" want_key "[[:space:]]*=")) {
                # Extract the quoted value.
                if (match($0, /"[^"]*"/)) {
                    val = substr($0, RSTART + 1, RLENGTH - 2)
                    print val
                    exit
                }
            }
        }
    ' "${MAINNET_CONFIG}"
}

echo "==> [2/9] Reading config-driven mainnet constants..."

QUOTE_TYPE="$(extract_config_value assets quote_type_tag)"
PREDICT_PACKAGE_ID="$(extract_config_value predict package_id)"
PREDICT_REGISTRY_ID="$(extract_config_value predict registry_id)"
PREDICT_TOP_LEVEL_ID="$(extract_config_value predict top_level_shared_object_id)"
# OracleSVI shared object id — captured from config; populates MAINNET-DEPLOY.json
# oracle_svi_id field. Operator updates this from Mysten's Predict server
# registry before invoking mainnet-smoke-test.sh. Empty string default if
# not yet known at deploy time (carry-forward research finding).
ORACLE_SVI_ID="$(extract_config_value oracle_svi top_level_shared_object_id)"
SEED_AMOUNT_MICRO=10000000  # 10 USDsui at 6 decimals (matches testnet seed)

# Defensive: assert critical values are populated and not TBD.
# This is NOT a re-run of preflight (preflight is the operator's pipeline
# step before this); it's a belt-and-suspenders check at the consumer of
# the values.
for var_name in QUOTE_TYPE PREDICT_PACKAGE_ID PREDICT_REGISTRY_ID PREDICT_TOP_LEVEL_ID; do
    val="${!var_name}"
    if [[ -z "${val}" ]] || [[ "${val}" == "TBD" ]]; then
        echo "::error::${MAINNET_CONFIG} has TBD slot ${var_name}; run preflight.sh to enumerate." >&2
        exit 1
    fi
done
# ORACLE_SVI_ID may be empty/TBD at deploy time; just warn (operator fills
# in before smoke test).
if [[ -z "${ORACLE_SVI_ID}" ]] || [[ "${ORACLE_SVI_ID}" == "TBD" ]]; then
    echo "::notice::oracle_svi.top_level_shared_object_id is TBD; capture before mainnet-smoke-test." >&2
    ORACLE_SVI_ID=""
fi

echo "    quote_type_tag        = ${QUOTE_TYPE}"
echo "    predict_package_id    = ${PREDICT_PACKAGE_ID}"
echo "    predict_registry_id   = ${PREDICT_REGISTRY_ID}"
echo "    predict_top_level_id  = ${PREDICT_TOP_LEVEL_ID}"
echo "    oracle_svi_id         = ${ORACLE_SVI_ID:-<empty; populate post-deploy>}"

# ============================================================
# 3. Pin verification gate (Pitfall 6) — identical to testnet
# ============================================================
echo "==> [3/9] Verifying DeepBookV3 SHA pin alignment..."
bash scripts/verify-deepbookv3-pin.sh

# ============================================================
# 4. Build (drives Move.toml dependency resolution)
# ============================================================
echo "==> [4/9] Building deepvault package..."
(cd contracts && sui move build)

# ============================================================
# 5. Active environment + funded deployer
# ============================================================
DEPLOYER_ADDR="$(sui client active-address)"
echo "==> [5/9] Active deployer: ${DEPLOYER_ADDR}"

ENV_NAME="$(sui client active-env)"
if [[ "${ENV_NAME}" != "mainnet" ]]; then
    echo "::error::Active sui env is '${ENV_NAME}', expected 'mainnet'." >&2
    echo "         (Should not happen given step 1 SUI_CONFIG_DIR gate; defensive.)" >&2
    exit 1
fi

# ============================================================
# 6. Publish package on mainnet
# ============================================================
# DIVERGENCE from testnet: --gas-budget 1000000000 (1.0 SUI) vs testnet
# 500000000 (0.5 SUI). Mainnet publish has higher gas headroom per
# RESEARCH §"Sui Mainnet Publish Mechanics" point 5 (0.5-2 SUI band;
# budget 1.0 SUI gives retry buffer).
echo "==> [6/9] Publishing deepvault package on mainnet (gas-budget 1.0 SUI)..."
PUBLISH_JSON="$(cd contracts && sui client publish \
    --gas-budget 1000000000 \
    --json)"

PACKAGE_ID="$(echo "${PUBLISH_JSON}" \
    | jq -r '.objectChanges[] | select(.type == "published") | .packageId')"

if [[ -z "${PACKAGE_ID}" ]] || [[ "${PACKAGE_ID}" == "null" ]]; then
    echo "::error::Could not parse package_id from publish output." >&2
    echo "${PUBLISH_JSON}" >&2
    exit 1
fi

# Capture PendingTreasury created by share::init at publish time.
PENDING_TREASURY_ID="$(echo "${PUBLISH_JSON}" \
    | jq -r --arg pkg "${PACKAGE_ID}" '
        .objectChanges[]
        | select(.type == "created")
        | select(.objectType == "\($pkg)::share::PendingTreasury")
        | .objectId')"

if [[ -z "${PENDING_TREASURY_ID}" ]] || [[ "${PENDING_TREASURY_ID}" == "null" ]]; then
    echo "::error::Could not parse PendingTreasury object_id from publish output." >&2
    echo "${PUBLISH_JSON}" >&2
    exit 1
fi

echo "    package_id           = ${PACKAGE_ID}"
echo "    pending_treasury_id  = ${PENDING_TREASURY_ID}"

# ============================================================
# 7. Locate USDsui coin with sufficient balance + split 10-USDsui seed
# ============================================================
# DIVERGENCE from testnet: ${QUOTE_TYPE} instead of hardcoded DUSDC_TYPE.
echo "==> [7/9] Locating USDsui coin with balance >= ${SEED_AMOUNT_MICRO} micro-units..."
SEED_COIN_ID="$(sui client objects --json \
    | jq -r --arg type "${QUOTE_TYPE}" --argjson amt ${SEED_AMOUNT_MICRO} '
        [.[] | select(.data.type == "0x2::coin::Coin<\($type)>")
              | select((.data.content.fields.balance | tonumber) >= $amt)]
        | first
        | .data.objectId')"

if [[ -z "${SEED_COIN_ID}" ]] || [[ "${SEED_COIN_ID}" == "null" ]]; then
    echo "::error::No Coin<USDsui> with balance >= ${SEED_AMOUNT_MICRO} micro-units found." >&2
    echo "         Fund deployer via Cetus swap per docs/MAINNET-READINESS.md." >&2
    exit 1
fi

echo "==> Splitting seed coin (10 USDsui) from ${SEED_COIN_ID}..."
SPLIT_JSON="$(sui client split-coin \
    --coin-id "${SEED_COIN_ID}" \
    --amounts ${SEED_AMOUNT_MICRO} \
    --gas-budget 50000000 \
    --json)"
SEED_OUT_COIN_ID="$(echo "${SPLIT_JSON}" \
    | jq -r --arg type "${QUOTE_TYPE}" '
        [.objectChanges[]
            | select(.type == "created")
            | select(.objectType == "0x2::coin::Coin<\($type)>")]
        | first
        | .objectId')"

if [[ -z "${SEED_OUT_COIN_ID}" ]] || [[ "${SEED_OUT_COIN_ID}" == "null" ]]; then
    echo "::error::Failed to extract split-out seed coin id." >&2
    echo "${SPLIT_JSON}" >&2
    exit 1
fi

# ============================================================
# 8. Call vault::create_vault<USDsui>(pending, seed, ctx)
# ============================================================
echo "==> [8/9] Calling vault::create_vault<USDsui>..."
CREATE_JSON="$(sui client call \
    --package "${PACKAGE_ID}" \
    --module vault \
    --function create_vault \
    --type-args "${QUOTE_TYPE}" \
    --args "${PENDING_TREASURY_ID}" "${SEED_OUT_COIN_ID}" \
    --gas-budget 200000000 \
    --json)"

DEPLOY_TX_DIGEST="$(echo "${CREATE_JSON}" | jq -r '.digest // .effects.transactionDigest // empty')"

# ============================================================
# 9. Parse vault_id + AdminCap owner gate + write MAINNET-DEPLOY.json
# ============================================================
VAULT_ID="$(echo "${CREATE_JSON}" \
    | jq -r --arg pkg "${PACKAGE_ID}" '
        .objectChanges[]
        | select(.type == "created")
        | select(.objectType | startswith("\($pkg)::vault::Vault<"))
        | .objectId')"

VAULT_INIT_SHARED_VER="$(echo "${CREATE_JSON}" \
    | jq -r --arg pkg "${PACKAGE_ID}" '
        .objectChanges[]
        | select(.type == "created")
        | select(.objectType | startswith("\($pkg)::vault::Vault<"))
        | .owner.Shared.initial_shared_version')"

ADMIN_CAP_ID="$(echo "${CREATE_JSON}" \
    | jq -r --arg pkg "${PACKAGE_ID}" '
        .objectChanges[]
        | select(.type == "created")
        | select(.objectType == "\($pkg)::vault::AdminCap")
        | .objectId')"

# DEPLOY-03 closure gate: AdminCap owner MUST equal deployer.
ADMIN_CAP_OWNER="$(echo "${CREATE_JSON}" \
    | jq -r --arg pkg "${PACKAGE_ID}" '
        .objectChanges[]
        | select(.type == "created")
        | select(.objectType == "\($pkg)::vault::AdminCap")
        | .owner.AddressOwner')"

if [[ "${ADMIN_CAP_OWNER}" != "${DEPLOYER_ADDR}" ]]; then
    echo "::error::AdminCap owner ${ADMIN_CAP_OWNER} != deployer ${DEPLOYER_ADDR}" >&2
    echo "         DEPLOY-03 closure gate FAILED — vault deploy will not be recorded." >&2
    exit 1
fi
echo "    AdminCap owner verified: ${ADMIN_CAP_OWNER} (== deployer)"

PREDICT_MGR_ID="$(echo "${CREATE_JSON}" \
    | jq -r '
        .objectChanges[]
        | select(.type == "created")
        | select(.objectType | endswith("::predict_manager::PredictManager"))
        | .objectId')"

PREDICT_MGR_INIT_SHARED_VER="$(echo "${CREATE_JSON}" \
    | jq -r '
        .objectChanges[]
        | select(.type == "created")
        | select(.objectType | endswith("::predict_manager::PredictManager"))
        | .owner.Shared.initial_shared_version')"

# All five MUST be non-empty.
for var in PACKAGE_ID VAULT_ID VAULT_INIT_SHARED_VER ADMIN_CAP_ID PREDICT_MGR_ID; do
    eval "val=\${$var}"
    if [[ -z "${val}" ]] || [[ "${val}" == "null" ]]; then
        echo "::error::Could not parse ${var} from create_vault tx output." >&2
        echo "${CREATE_JSON}" >&2
        exit 1
    fi
done

# ============================================================
# Write MAINNET-DEPLOY.json (OVERWRITES the placeholder committed by
# Plan 05-02 Task 3).
# ============================================================
OUT_FILE=".planning/phases/05-testnet-demo-hardening/MAINNET-DEPLOY.json"
DEPLOYED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# quote_type_tag is canonical; dusdc_type_tag is an alias for back-compat
# with Phase 4 dashboard code that reads the testnet TESTNET-DEPLOY.json
# field name by string. Both fields carry the SAME value on mainnet.
cat > "${OUT_FILE}" <<EOF
{
  "network": "mainnet",
  "status": "deployed",
  "deployed_at_iso": "${DEPLOYED_AT}",
  "deploy_tx_digest": "${DEPLOY_TX_DIGEST}",
  "deployer": "${DEPLOYER_ADDR}",
  "package_id": "${PACKAGE_ID}",
  "vault_id": "${VAULT_ID}",
  "vault_initial_shared_version": ${VAULT_INIT_SHARED_VER},
  "admin_cap_id": "${ADMIN_CAP_ID}",
  "predict_manager_id": "${PREDICT_MGR_ID}",
  "predict_manager_initial_shared_version": ${PREDICT_MGR_INIT_SHARED_VER},
  "predict_package_id": "${PREDICT_PACKAGE_ID}",
  "predict_registry_id": "${PREDICT_REGISTRY_ID}",
  "predict_top_level_id": "${PREDICT_TOP_LEVEL_ID}",
  "quote_type_tag": "${QUOTE_TYPE}",
  "dusdc_type_tag": "${QUOTE_TYPE}",
  "oracle_svi_id": "${ORACLE_SVI_ID}"
}
EOF

echo "==> [9/9] Deploy complete. Wrote ${OUT_FILE}:"
cat "${OUT_FILE}"

# ============================================================
# Sanity check: vault is reachable as a shared object.
# ============================================================
echo "==> Verifying vault is a valid shared object..."
sui client object "${VAULT_ID}" --json \
  | jq -e '.data.owner.Shared.initial_shared_version' >/dev/null
echo "OK: vault ${VAULT_ID} is a shared object on mainnet."
