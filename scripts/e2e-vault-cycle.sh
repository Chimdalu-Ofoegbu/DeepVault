#!/usr/bin/env bash
# scripts/e2e-vault-cycle.sh
# Drives the end-to-end testnet supply -> hedge -> redeem cycle.
#
# Mode is selected via the FAST_FORWARD env var:
#   FAST_FORWARD=1   Hermetic Move integration test path (clock-warped).
#                    Runs `sui move test --filter integration_test`.
#                    No live testnet ping; deterministic; ~30s.
#                    This is the per-push CI mode.
#   FAST_FORWARD=0   Real testnet PTB path. Reads TESTNET-DEPLOY.json,
#                    invokes scripts/e2e-vault-cycle.ts under tsx, which
#                    builds two-moveCall PTBs against @mysten/sui 2.16.x
#                    and waits the real 1h cooldown. This is the nightly
#                    CI mode (driven by .github/workflows/nightly-e2e-vault.yml).
#
# Default mode: FAST_FORWARD=1 (per-push hermetic). Nightly job sets
# FAST_FORWARD=0 explicitly.
#
# When FAST_FORWARD=0 and TESTNET-DEPLOY.json is still in placeholder
# state (status="pending_first_deploy"), the script aborts gracefully
# with exit code 2 + a diagnostic — per-push CI never hits this path,
# so the build stays green even before a real testnet deploy has run.
#
# VAULT-11.

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

MODE="${FAST_FORWARD:-1}"

echo "==> e2e-vault-cycle.sh (FAST_FORWARD=${MODE})"

if [[ "${MODE}" == "1" ]]; then
  # ============================================================
  # Hermetic path: Move integration test exercises the supply +
  # redeem cycle invariants with clock-warped fast-forward. No live
  # Predict / OracleSVI / PredictManager required (constructors are
  # public(package) and unreachable from this package — see
  # WAVE0-DECISION.md "Empirical evidence preserved").
  # ============================================================
  echo "==> Running Move integration tests (clock-warped, hermetic)..."
  (cd contracts && sui move test \
      --gas-limit 100000000000 \
      --filter integration_test \
      --skip-fetch-latest-git-deps)
  echo "OK: Move integration tests passed (atomic supply+hedge invariants,"
  echo "    redeem cycle, roll_expiring registry mutations)."
  exit 0
fi

# ============================================================
# Real testnet path (FAST_FORWARD=0)
# ============================================================
DEPLOY_JSON=".planning/phases/02-vault-move-package-testnet-deploy/TESTNET-DEPLOY.json"
if [[ ! -f "${DEPLOY_JSON}" ]]; then
  echo "::error::${DEPLOY_JSON} not found. Run scripts/e2e-vault-deploy.sh first." >&2
  exit 2
fi

# Validate the deploy JSON is not still placeholder. The placeholder
# carries status="pending_first_deploy"; once the deploy script runs
# successfully, status flips to "deployed".
DEPLOY_STATUS="$(jq -r '.status // "unknown"' "${DEPLOY_JSON}")"
PKG_ID="$(jq -r '.package_id' "${DEPLOY_JSON}")"
if [[ "${DEPLOY_STATUS}" == "pending_first_deploy" ]] || [[ "${PKG_ID}" == "PENDING" ]]; then
  echo "::warning::TESTNET-DEPLOY.json is still placeholder (status=${DEPLOY_STATUS})." >&2
  echo "           Run scripts/e2e-vault-deploy.sh on testnet first to populate it." >&2
  echo "           Skipping real-testnet cycle." >&2
  exit 2
fi

echo "    package_id  = ${PKG_ID}"
echo "    vault_id    = $(jq -r '.vault_id' "${DEPLOY_JSON}")"

# Run the TS PTB driver. Node + tsx are provisioned by the nightly
# workflow's setup-node@v6 + dashboard pnpm install steps. The TS
# driver lives at scripts/e2e-vault-cycle.ts and uses the dashboard
# workspace's @mysten/sui 2.16.x install for the Transaction builder.
echo "==> Running TS PTB driver (real testnet)..."
cd "${REPO_ROOT}/dashboard"
npx tsx ../scripts/e2e-vault-cycle.ts
