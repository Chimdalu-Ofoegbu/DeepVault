#!/usr/bin/env bash
# scripts/e2e-vault-deploy.sh
# One-shot deploy of the deepvault package on Sui testnet.
#
# Steps (in order):
#   1. Verify DeepBookV3 SHA pin (Pitfall 6 gate — RESEARCH.md).
#   2. Build the deepvault Move package (drives Move.toml dep resolution).
#   3. Confirm active sui env is testnet and deployer is funded.
#   4. Publish package on testnet (sui CLI, gas-budget 500000000, JSON output).
#   5. Parse package_id + PendingTreasury object_id from publish output.
#   6. Locate or split a Coin<DUSDC> with exactly 10_000_000 micro-units (10 DUSDC).
#   7. Call `vault::create_vault<DUSDC>(pending, seed, ctx)` per the
#      post-Plan 02-03 signature (3 args: pending, seed, ctx — no clock).
#   8. Parse vault_id, initial_shared_version, admin_cap_id, predict_manager_id
#      from the create-tx effects.
#   9. Write TESTNET-DEPLOY.json with all captured IDs.
#
# VAULT-11 deploy step. Closes the testnet deploy gap from CONTEXT.md
# Claude's Discretion. The downstream e2e-vault-cycle.sh consumes the
# emitted TESTNET-DEPLOY.json.
#
# Per WAVE0-DECISION.md option (b), `vault::create_vault` calls
# `predict::create_manager(ctx)` internally as a side-effect; the
# resulting shared PredictManager is captured here as the deploy-time
# admin reference. Suppliers create their own managers at supply-time.
#
# Per CLAUDE.md note 8: "No hardcoded Predict package IDs in source."
# The IDs below are configuration values written to JSON output and
# read by downstream scripts via env vars or jq.

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

DUSDC_TYPE='0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC'
SEED_AMOUNT_MICRO=10000000  # 10 DUSDC at 6 decimals
PREDICT_PACKAGE_ID='0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138'
PREDICT_REGISTRY_ID='0x43af14fed5480c20ff77e2263d5f794c35b9fab7e2212903127062f4fe2a6e64'
PREDICT_TOP_LEVEL_ID='0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a'

# ============================================================
# 1. Pin verification gate (Pitfall 6).
# ============================================================
echo "==> Verifying DeepBookV3 SHA pin alignment..."
bash scripts/verify-deepbookv3-pin.sh

# ============================================================
# 2. Build (drives Move.toml dependency resolution).
# ============================================================
echo "==> Building deepvault package..."
# --skip-fetch-latest-git-deps removed in Sui CLI v1.71.1+ (fetch is automatic).
(cd contracts && sui move build)

# ============================================================
# 3. Active environment + funded deployer
# ============================================================
DEPLOYER_ADDR="$(sui client active-address)"
echo "==> Active deployer: ${DEPLOYER_ADDR}"

ENV_NAME="$(sui client active-env)"
if [[ "${ENV_NAME}" != "testnet" ]]; then
  echo "::error::Active sui env is '${ENV_NAME}', expected 'testnet'." >&2
  echo "         Run: sui client switch --env testnet" >&2
  exit 1
fi

# ============================================================
# 4. Publish package
# ============================================================
echo "==> Publishing deepvault package on testnet..."
PUBLISH_JSON="$(cd contracts && sui client publish \
    --gas-budget 500000000 \
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
# 5. Find a DUSDC coin with sufficient balance + split a 10 DUSDC seed
# ============================================================
echo "==> Locating DUSDC coin with balance >= ${SEED_AMOUNT_MICRO} micro-units..."
SEED_COIN_ID="$(sui client objects --json \
    | jq -r --arg type "${DUSDC_TYPE}" --argjson amt ${SEED_AMOUNT_MICRO} '
        [.[] | select(.data.type == "0x2::coin::Coin<\($type)>")
              | select((.data.content.fields.balance | tonumber) >= $amt)]
        | first
        | .data.objectId')"

if [[ -z "${SEED_COIN_ID}" ]] || [[ "${SEED_COIN_ID}" == "null" ]]; then
  echo "::error::No Coin<DUSDC> with balance >= ${SEED_AMOUNT_MICRO} micro-units found." >&2
  echo "         Fund deployer first via the testnet DUSDC faucet." >&2
  exit 1
fi

echo "==> Splitting seed coin (10 DUSDC) from ${SEED_COIN_ID}..."
SPLIT_JSON="$(sui client split-coin \
    --coin-id "${SEED_COIN_ID}" \
    --amounts ${SEED_AMOUNT_MICRO} \
    --gas-budget 50000000 \
    --json)"
SEED_OUT_COIN_ID="$(echo "${SPLIT_JSON}" \
    | jq -r --arg type "${DUSDC_TYPE}" '
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
# 6. Call vault::create_vault<DUSDC>(pending, seed, ctx)
# ============================================================
echo "==> Calling vault::create_vault<DUSDC>..."
CREATE_JSON="$(sui client call \
    --package "${PACKAGE_ID}" \
    --module vault \
    --function create_vault \
    --type-args "${DUSDC_TYPE}" \
    --args "${PENDING_TREASURY_ID}" "${SEED_OUT_COIN_ID}" \
    --gas-budget 200000000 \
    --json)"

DEPLOY_TX_DIGEST="$(echo "${CREATE_JSON}" | jq -r '.digest // .effects.transactionDigest // empty')"

# ============================================================
# 7. Parse vault_id + initial_shared_version + admin_cap_id + predict_manager_id
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
# 8. Write TESTNET-DEPLOY.json
# ============================================================
OUT_FILE=".planning/phases/02-vault-move-package-testnet-deploy/TESTNET-DEPLOY.json"
DEPLOYED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

cat > "${OUT_FILE}" <<EOF
{
  "network": "testnet",
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
  "dusdc_type_tag": "${DUSDC_TYPE}"
}
EOF

echo "==> Deploy complete. Wrote ${OUT_FILE}:"
cat "${OUT_FILE}"

# ============================================================
# 9. Sanity check: vault is reachable as a shared object.
# ============================================================
echo "==> Verifying vault is a valid shared object..."
sui client object "${VAULT_ID}" --json \
  | jq -e '.data.owner.Shared.initial_shared_version' >/dev/null
echo "OK: vault ${VAULT_ID} is a shared object on testnet."
