#!/usr/bin/env bash
# contracts/tests/coverage_check.sh
#
# VAULT-09 coverage gate.
# Enforces >= 85% line coverage on supply.move, redeem.move, rebalance.move.
#
# Runs after `sui move test --coverage` has produced the .coverage_map.mvcov
# instrumentation file. Parses `sui move coverage summary` and asserts the
# per-module % coverage line for each required module exceeds the THRESHOLD.
# Exits 0 on pass, 1 on fail. Stdout is preserved for CI logs so reviewers
# can see the exact summary text that drove the decision.
#
# Format target (per Sui docs):
#
#     +-------------------------+
#     | Move Coverage Summary   |
#     +-------------------------+
#     Module 0x0::supply
#     >>> % Module coverage: 92.45
#     Module 0x0::redeem
#     >>> % Module coverage: 87.13
#     ...
#
# Parsing strategy: AWK state machine that tracks the most recent `Module
# X::<modname>` line and prints the next `% Module coverage:` value when
# the module name matches.

set -euo pipefail

THRESHOLD=85.0
REQUIRED_MODULES=("supply" "redeem" "rebalance")

# Working directory: contracts/ (one level up from tests/).
cd "$(dirname "$0")/.."

# Idempotency: if the user already ran `sui move test --coverage`, the
# build/.coverage_map.mvcov file (or top-level .coverage_map.mvcov) will
# exist. If neither is present, run the instrumented tests now. CI calls
# the instrumented test step explicitly before this script, so this
# branch is for local re-runs only.
if [[ ! -f .coverage_map.mvcov ]] && [[ ! -f build/.coverage_map.mvcov ]]; then
  echo "Coverage map not found; running 'sui move test --coverage'..."
  sui move test --gas-limit 100000000000 --coverage
fi

# Capture the summary output once; reuse for each module check.
SUMMARY="$(sui move coverage summary 2>&1)"
echo "${SUMMARY}"

FAILED=0

for MOD in "${REQUIRED_MODULES[@]}"; do
  # AWK state machine:
  #   - On `Module .*::<name>` lines, set `found=1` if name matches MOD,
  #     else `found=0`.
  #   - On `% Module coverage:` lines that follow a matching module,
  #     extract the first decimal token (e.g. 92.45) and exit.
  COV="$(echo "${SUMMARY}" \
    | awk -v mod="${MOD}" '
        /^Module .*::/ {
          line = $0
          sub(/^Module [^:]+::/, "", line)
          if (line == mod) { found=1 } else { found=0 }
          next
        }
        found && /% Module coverage:/ {
          # Replace non-numeric / non-dot chars with spaces; pick first
          # decimal-looking token.
          gsub(/[^0-9.]/, " ", $0)
          n = split($0, parts, " ")
          for (i = 1; i <= n; i++) {
            if (parts[i] ~ /^[0-9]+\.[0-9]+$/) { print parts[i]; exit }
          }
        }
      ')"

  if [[ -z "${COV}" ]]; then
    echo "::error::Could not parse coverage for module '${MOD}'. See sui move coverage summary output above."
    FAILED=1
    continue
  fi

  # Numeric comparison via awk (bash arithmetic doesn't handle decimals).
  if awk -v c="${COV}" -v t="${THRESHOLD}" 'BEGIN { exit (c+0 >= t+0 ? 0 : 1) }'; then
    echo "OK: ${MOD}.move coverage ${COV}% >= ${THRESHOLD}%"
  else
    echo "::error::${MOD}.move coverage ${COV}% < ${THRESHOLD}% threshold (VAULT-09)"
    FAILED=1
  fi
done

if [[ ${FAILED} -ne 0 ]]; then
  echo "::error::Coverage gate failed. See REQUIREMENTS.md VAULT-09."
  exit 1
fi

echo "Coverage gate passed: all required modules >= ${THRESHOLD}%."
exit 0
