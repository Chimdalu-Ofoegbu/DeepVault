#!/usr/bin/env bash
# scripts/mainnet-smoke-test.sh
#
# Mainnet $50-equivalent USDsui round-trip with staged ±10 bps NAV
# verification gate. Forked from scripts/testnet-smoke-test.sh (Plan 05-03,
# 115 LOC). The only differences are environment-scoping and the
# MAINNET-DEPLOY.json target.
#
# Decision lineage:
#   - DEPLOY-02 : Mainnet smoke test script written (this file); execution
#                 deferred to post-submission per Phase 5 reshape.
#   - DEPLOY-03 : Validates that the mainnet vault works end-to-end after
#                 mainnet-deploy.sh runs.
#   - D-05      : write-but-don't-execute. This script is committed and
#                 intentionally NOT invoked at plan-execute time. The
#                 post-submission operator runs it AFTER:
#                   (1) scripts/predict-mainnet-check.sh reports shipped:true
#                   (2) scripts/preflight.sh exits 0
#                   (3) scripts/mainnet-deploy.sh succeeds (writes
#                       MAINNET-DEPLOY.json with status="deployed")
#
# The 7 staged checkpoints (each emits a `[CHECKPOINT PASS]` line via the
# TS driver — identical shape to scripts/testnet-smoke-test.sh):
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
#                                       received Coin<USDsui> value.
#   7. final snapshot + dual ±10 bps gate — verify both framings PASS.
#
# Inputs (env vars; post-submission operator sets both):
#   - SUI_PRIVATE_KEY   ephemeral mainnet keypair scoped to the mainnet
#                       deploy wallet (or a sibling smoke-test wallet).
#   - ORACLE_SVI_ID     BTC-USD OracleSVI shared object id published via
#                       Mysten's Predict server mainnet registry.
#
# Outputs:
#   stdout — checkpoint progress markers; final dual-gate verdict with the
#            actual per-depositor ratio (in bps) and NAV delta (in bps).
#   exit 0 on green (both gates PASS), exit 1 on any FAIL.
#
# Duration: ~1 hour wall-clock (REDEMPTION_COOLDOWN_MS + supply/redeem
# RPC latency). NEVER FAST_FORWARD — mainnet has no clock-warp branch.
#
# This script intentionally has no AdminCap recovery path (mirrors testnet
# variant). For mainnet, the operator's recourse on a failed run is to
# inspect on-chain state via suiscan.xyz/mainnet and decide whether to
# re-attempt or escalate via the AdminCap unwind path documented in the
# runbook.

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

echo "==> mainnet-smoke-test.sh (write-but-don't-execute post-submission deliverable)"

# ============================================================
# SUI_CONFIG_DIR scoping defensive gate (Phase 0 D-06)
# ============================================================
# Mirror of mainnet-deploy.sh + preflight.sh gates; refuse to run
# against ambient testnet keystore.
if [[ -z "${SUI_CONFIG_DIR:-}" ]] || [[ "${SUI_CONFIG_DIR}" != *"sui_config_mainnet"* ]]; then
    echo "::error::SUI_CONFIG_DIR must be set and end in 'sui_config_mainnet'." >&2
    echo "         Remediation: SUI_CONFIG_DIR=~/.sui/sui_config_mainnet bash scripts/mainnet-smoke-test.sh" >&2
    exit 1
fi

# ============================================================
# Deploy-JSON gate
#
# Hard error: the smoke test cannot run against a placeholder deploy. If
# status=="not_deployed" (placeholder shipped by Plan 05-02 Task 3), the
# operator must first run scripts/mainnet-deploy.sh (which itself sits
# behind scripts/preflight.sh).
# ============================================================
DEPLOY_JSON=".planning/phases/05-testnet-demo-hardening/MAINNET-DEPLOY.json"
if [[ ! -f "${DEPLOY_JSON}" ]]; then
    echo "::error::${DEPLOY_JSON} not found." >&2
    exit 1
fi

DEPLOY_STATUS="$(jq -r '.status // "unknown"' "${DEPLOY_JSON}")"
if [[ "${DEPLOY_STATUS}" != "deployed" ]]; then
    echo "::error::MAINNET-DEPLOY.json status='${DEPLOY_STATUS}'; expected 'deployed'." >&2
    echo "         Mainnet vault not deployed — run scripts/mainnet-deploy.sh first" >&2
    echo "         (post-submission, after Predict mainnet ships)." >&2
    exit 1
fi

PKG_ID="$(jq -r '.package_id' "${DEPLOY_JSON}")"
echo "    package_id  = ${PKG_ID}"
echo "    vault_id    = $(jq -r '.vault_id' "${DEPLOY_JSON}")"

# ============================================================
# Env-var gate
#
# Both SUI_PRIVATE_KEY and ORACLE_SVI_ID required. Mainnet deploy wallet
# private key is sensitive — gate is hard error, never silent default.
# ============================================================
if [[ -z "${SUI_PRIVATE_KEY:-}" ]]; then
    echo "::error::SUI_PRIVATE_KEY env var required (mainnet keypair)." >&2
    exit 1
fi
if [[ -z "${ORACLE_SVI_ID:-}" ]]; then
    echo "::error::ORACLE_SVI_ID env var required (BTC-USD OracleSVI shared object id on mainnet)." >&2
    exit 1
fi

# ============================================================
# Invoke the TS PTB driver
#
# The driver lives at scripts/mainnet-smoke-test.ts and uses the dashboard
# workspace's @mysten/sui 2.16.x install for the Transaction builder. It
# also imports STRATEGY_CONSTANTS from dashboard/src/lib — relative path
# requires running from the dashboard directory so Node module resolution
# finds @mysten/sui and tsx finds the codegen output.
# ============================================================
echo "==> Running mainnet smoke test (real wall-clock cooldown ~1h)..."
cd "${REPO_ROOT}/dashboard"
npx tsx ../scripts/mainnet-smoke-test.ts
