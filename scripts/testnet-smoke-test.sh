#!/usr/bin/env bash
# scripts/testnet-smoke-test.sh
#
# Judge-facing testnet smoke test for DeepVault — the deliverable that
# `make demo` (wired by Plan 05-05) invokes end-to-end.
#
# Closes DEPLOY-04: a staged $50-equivalent DUSDC cycle on testnet with a
# dual ±10 bps NAV verification gate.
#
# References:
#   - 05-CONTEXT.md D-02: Staged with checkpoints between every step.
#   - 05-CONTEXT.md D-03: Dual ±10 bps verification — BOTH framings must
#     pass: (a) per-depositor return ratio ≥ 99.9% of (deposit × (1 −
#     allocation_bps/10000)); (b) vault NAV-per-share drift ≤ 10 bps from
#     pre-deposit snapshot.
#   - 05-CONTEXT.md D-04: Consume existing Phase 2 testnet deployment via
#     .planning/phases/02-vault-move-package-testnet-deploy/TESTNET-DEPLOY.json.
#     No testnet redeploy.
#
# The 7 staged checkpoints (each emits a `[CHECKPOINT PASS]` line via the
# TS driver):
#   1. pre-deposit snapshot          — capture vault.total_assets,
#                                       vault.total_shares_supply, NAV-per-share.
#   2. supply tx                     — atomic deposit + hedge mint (vault::supply).
#   3. events Supplied+HedgeMinted   — assert both Move events emitted,
#                                       capture hedge cost_basis_quote.
#   4. redeem_request                — assert RedeemRequested event,
#                                       capture request timestamp.
#   5. cooldown wait                 — wait STRATEGY_CONSTANTS.REDEMPTION_COOLDOWN_MS
#                                       (1 h) + 5 s slack. Plan 05-04 codegen output.
#   6. redeem_fulfill                — assert RedeemFulfilled, capture
#                                       received Coin<DUSDC> value.
#   7. final snapshot + dual ±10 bps gate — verify both framings PASS.
#
# Inputs (env vars; judges + operator set both):
#   - SUI_PRIVATE_KEY   ephemeral testnet keypair (same shape as
#                       scripts/e2e-vault-cycle.ts).
#   - ORACLE_SVI_ID     BTC-USD OracleSVI shared object id published via
#                       Mysten's Predict server registry.
#
# Outputs:
#   stdout — checkpoint progress markers; final dual-gate verdict with the
#            actual per-depositor ratio (in bps) and NAV delta (in bps).
#   exit 0 on green (both gates PASS), exit 1 on any FAIL.
#
# Duration: ~1 hour wall-clock (REDEMPTION_COOLDOWN_MS + supply/redeem
# RPC latency).
#
# This script intentionally has no AdminCap recovery path
# (05-CONTEXT.md `<specifics>`: "no 'AdminCap pause' recovery — testnet
# vault is faucet-funded and recreatable"). The hermetic Move integration
# test path lives in scripts/e2e-vault-cycle.sh (clock-warped mode); this
# script is the wall-clock variant only — no clock-warp branch.

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

echo "==> testnet-smoke-test.sh (judge-facing DEPLOY-04 demo)"

# ============================================================
# Deploy-JSON gate (mirror of e2e-vault-cycle.sh L60-81)
#
# Hard error: the smoke test cannot run against a placeholder deploy.
# This is the demo deliverable; an unpopulated TESTNET-DEPLOY.json means
# the operator must first run scripts/e2e-vault-deploy.sh.
# ============================================================
DEPLOY_JSON=".planning/phases/02-vault-move-package-testnet-deploy/TESTNET-DEPLOY.json"
if [[ ! -f "${DEPLOY_JSON}" ]]; then
  echo "::error::${DEPLOY_JSON} not found." >&2
  echo "         Testnet vault not deployed — run scripts/e2e-vault-deploy.sh first." >&2
  exit 1
fi

DEPLOY_STATUS="$(jq -r '.status // "unknown"' "${DEPLOY_JSON}")"
PKG_ID="$(jq -r '.package_id' "${DEPLOY_JSON}")"
if [[ "${DEPLOY_STATUS}" != "deployed" ]] || [[ "${PKG_ID}" == "PENDING" ]]; then
  echo "::error::TESTNET-DEPLOY.json status='${DEPLOY_STATUS}', package_id='${PKG_ID}'." >&2
  echo "         Testnet vault not deployed — run scripts/e2e-vault-deploy.sh first." >&2
  exit 1
fi

echo "    package_id  = ${PKG_ID}"
echo "    vault_id    = $(jq -r '.vault_id' "${DEPLOY_JSON}")"

# ============================================================
# Env-var gate
#
# The smoke test is the demo deliverable; missing creds is a
# configuration error, not a soft warning. Both SUI_PRIVATE_KEY and
# ORACLE_SVI_ID must be set (same contract as e2e-vault-cycle.ts).
# ============================================================
if [[ -z "${SUI_PRIVATE_KEY:-}" ]]; then
  echo "::error::SUI_PRIVATE_KEY env var required (ephemeral testnet keypair)." >&2
  exit 1
fi
if [[ -z "${ORACLE_SVI_ID:-}" ]]; then
  echo "::error::ORACLE_SVI_ID env var required (BTC-USD OracleSVI shared object id)." >&2
  exit 1
fi

# ============================================================
# Invoke the TS PTB driver
#
# The driver lives at scripts/testnet-smoke-test.ts and uses the
# dashboard workspace's @mysten/sui 2.16.x install for the Transaction
# builder. It also imports STRATEGY_CONSTANTS from dashboard/src/lib —
# the relative path requires running from the dashboard directory so
# Node module resolution finds @mysten/sui and tsx finds the codegen
# output.
# ============================================================
echo "==> Running testnet smoke test (real wall-clock cooldown ~1h)..."
cd "${REPO_ROOT}/dashboard"
npx tsx ../scripts/testnet-smoke-test.ts
