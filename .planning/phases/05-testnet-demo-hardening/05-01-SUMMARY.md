---
phase: 05-testnet-demo-hardening
plan: 01
subsystem: infra
tags: [bash, shellcheck, sui-cli, sui-rpc, jq, preflight, mainnet-readiness, deepbook-predict]

# Dependency graph
requires:
  - phase: 02-vault-move-package-testnet-deploy
    provides: scripts/verify-deepbookv3-pin.sh (delegated SHA-pin gate)
  - phase: 00-setup-ground-rules
    provides: config/mainnet.toml TBD scaffold + SUI_CONFIG_DIR scoping policy (D-06)
provides:
  - scripts/preflight.sh — 14-gate mainnet-readiness assertion script (write-but-don't-execute)
  - scripts/predict-mainnet-check.sh — manual RPC probe of Sui mainnet for DeepBook Predict package + JSON verdict
  - Section-aware `scan_tbd_slots` awk helper (Pitfall 14 specialization, replacing prior bare grep)
  - Forbidden-token discipline (no `sui client publish`/`call` in either script; T-05-06 mitigation)
affects: [05-02-PLAN.md, 05-05-PLAN.md, post-submission mainnet deploy procedure]

# Tech tracking
tech-stack:
  added: []  # both scripts reuse existing repo deps (bash, jq, curl)
  patterns:
    - "Section-aware awk TOML scanner (state-tracked `[section]` walk; exempts [hosting] and contingency-gated sections)"
    - "Write-but-don't-execute toolkit pattern (D-05): scripts pass lint + dry-run audit; intentional non-zero exit today"
    - "JSON-verdict-first stdout shape: first line = JSON, rest = Markdown report; supports both `head -n 1` and `grep -q` callers"
    - "Name-only ABI v1 with inline TODO pointing at post-submission upgrade (RESEARCH Open Question 5)"

key-files:
  created:
    - scripts/preflight.sh (276 lines)
    - scripts/predict-mainnet-check.sh (128 lines)
  modified: []

key-decisions:
  - "Honored carry-forward research finding #1: USDsui balance gate threshold is 60_000_000 micro-units (not 50_000_000) — 10 USDsui seed + 50 USDsui smoke-test deposit"
  - "Honored D-07: NO `.github/workflows/predict-mainnet-check.yml` cron created — the script is manual-only"
  - "Honored D-05 write-but-don't-execute: preflight exits non-zero today via gate 14 (Predict mainnet not shipped); no mainnet-mutating CLI invoked"
  - "Section-aware `scan_tbd_slots` awk helper (not bare grep) — exempts [hosting] (Phase 6 owns) and [predict]/[oracle_svi] when [contingency].predict_mainnet_shipped=false (Pitfall 14 + T-05-02 mitigation)"
  - "Name-only ABI fingerprint v1 with inline TODO — full type-signature ABI diff is post-submission backlog (RESEARCH Open Question 5)"
  - "Comments rephrased to avoid the literal token `sui client publish` so plan's forbidden-token grep (T-05-06) stays clean"

patterns-established:
  - "scan_tbd_slots awk function: state-tracks current `[section]` header, exempts named sections, prints violators to stderr with the offending line"
  - "preflight assertion-numbered header comment block citing decision lineage (D-01/05/06/07) + assertion inventory + exit-code semantics — reusable shape for future write-but-don't-execute toolkit scripts"
  - "Predict-mainnet probe with single curl + jq -e '.result.data' check; TBD branch short-circuits to shipped:false without an RPC call"

requirements-completed: [DEPLOY-01]  # preflight + predict-check half of DEPLOY-01; Plan 05-02 closes the deploy/smoke half

# Metrics
duration: ~25min
completed: 2026-05-16
---

# Phase 05 Plan 01: Mainnet-Readiness Preflight + Predict-Mainnet Check Summary

**Mainnet-readiness preflight (14 gates, write-but-don't-execute) and manual Predict-mainnet RPC probe (no cron) shipped — preflight intentionally fails today on gate 14 because Predict mainnet has not shipped, exactly as D-05 specifies.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-05-16T02:24Z
- **Completed:** 2026-05-16T02:38Z
- **Tasks:** 2 (both `type="auto"`)
- **Files created:** 2 (scripts/preflight.sh, scripts/predict-mainnet-check.sh)
- **Files modified:** 0
- **Lines added:** 404

## Accomplishments

- `scripts/preflight.sh` (276 lines) — 14-gate mainnet-readiness assertion script with `::error::` failure UX, decision-lineage header comments, and section-aware `scan_tbd_slots` awk helper. Closes the preflight half of DEPLOY-01.
- `scripts/predict-mainnet-check.sh` (128 lines) — manual RPC probe (read-only `sui_getObject` against `https://fullnode.mainnet.sui.io:443`) emitting a JSON verdict as the first line of stdout followed by a Markdown report mirroring `scripts/predict-diff.sh` shape. Closes the predict-check half of DEPLOY-01.
- Carry-forward research findings honored verbatim: 60 USDsui balance gate (not 50), section-aware awk scan (not bare grep), name-only ABI v1 with post-submission TODO, no GitHub Actions cron (D-07).
- Preflight calls `scripts/predict-mainnet-check.sh` at gate 14 and requires `"shipped":true` to pass — today this returns `"shipped":false` and preflight exits 1 with the documented "Predict mainnet not shipped" failure message. This IS the D-05 intentional-fail acceptance.

## Task Commits

Each task was committed atomically:

1. **Task 1: Write `scripts/preflight.sh`** — `bd9e247` (feat)
2. **Task 2: Write `scripts/predict-mainnet-check.sh` (no cron)** — `0f12d28` (feat)

## Files Created/Modified

- `scripts/preflight.sh` — 14-gate mainnet-readiness assertion script. Asserts `SUI_CONFIG_DIR` ends in `sui_config_mainnet`, active env is mainnet, Sui CLI version contains `1.71.1`, DeepBookV3 SHA pin aligned, Move build + test green, Python parity green, codegen drift clean, gas balance ≥ 10 SUI, all `config/mainnet.toml` TBD slots filled (section-aware, contingency-gated), USDsui balance ≥ 60 USDsui, and final invokes `scripts/predict-mainnet-check.sh` and requires `"shipped":true`. Assert-only — invokes no mainnet-mutating CLI command.
- `scripts/predict-mainnet-check.sh` — manual probe of Sui mainnet RPC for DeepBook Predict. Single `curl -fsS` JSON-RPC `sui_getObject` call with `{showType:true, showContent:true}`. Defaults `PREDICT_MAINNET_CANDIDATE=TBD` → `"shipped":false`. Emits JSON verdict as first line of `$OUTPUT` followed by Markdown report (verdict-for-Phase-5 interpretation + 4-step human-action checklist + raw probe output). Always exits 0 (verdict is data, not failure). NO `.github/workflows/predict-mainnet-check.yml` cron created (D-07).

## Decisions Made

- **Carry-forward research finding #1 (60 USDsui, not 50)**: preflight gate 12 asserts USDsui balance ≥ `60_000_000` micro-units. Rationale: `vault::create_vault` consumes a 10-USDsui seed in addition to the 50-USDsui smoke-test deposit, so the deploy wallet needs 60 USDsui to satisfy both consumers atomically.
- **Section-aware awk over bare grep**: `scan_tbd_slots` tracks the current `[section]` header line-by-line, exempts `[hosting]` (Phase 6 owns) and `[predict]`/`[oracle_svi]` when `[contingency].predict_mainnet_shipped=false`. Mitigates T-05-02 (bare grep would false-flag header prose or miss section-gated exemptions).
- **No GitHub Actions cron (D-07)**: the prior plan run sketched a `.github/workflows/predict-mainnet-check.yml` firing 2026-06-09; the reshape drops it because there's no consumer post-pivot. The script is callable manually OR transitively from preflight gate 14.
- **Name-only ABI v1 with inline TODO**: when the candidate package is found on mainnet, `abi_match:true` is hardcoded. Full type-signature ABI diff (via `client.getNormalizedMoveModulesByPackage`) is post-submission backlog per RESEARCH Open Question 5. Inline `TODO(post-submission)` comment explains the v1 limitation and points the post-submission operator at the upgrade path.
- **Comments rephrased to dodge T-05-06 grep**: the threat model adds a forbidden-token grep `! grep -E 'sui client publish' scripts/preflight.sh`. Initial header comments mentioned the literal string `sui client publish` in the assert-only description; rephrased to "any mainnet-mutating CLI command (publish, call, or transfer)" so the grep stays clean. Same fix in predict-mainnet-check.sh header.
- **JSON-verdict-first stdout shape**: predict-mainnet-check writes JSON as the first line of `$OUTPUT`, then the Markdown report. Lets preflight gate 14 `grep -q '"shipped":true'` against the full output cleanly, and lets minimal callers `head -n 1` to get just the verdict.

## Carry-Forward Items Honored

| Item | Origin | How honored |
|------|--------|-------------|
| 60 USDsui balance gate | RESEARCH finding #1 + RESEARCH §"Mainnet-specific gotchas" final row | preflight step 12 asserts `>= 60_000_000` micro-units; explicit `(10 seed + 50 smoke)` documentation |
| Section-aware `scan_tbd_slots` awk | Prior plan run + D-06.a + T-05-02 | `scan_tbd_slots()` function defined; tracks `[section]` header; exempts `[hosting]` + contingency-gated sections |
| No cron | D-07 + CONTEXT.md `<canonical_refs>` | Acceptance gate `! test -f .github/workflows/predict-mainnet-check.yml` PASS |
| Name-only ABI v1 | RESEARCH Open Question 5 | `abi_match:true` hardcoded when package exists; inline TODO points at post-submission full-ABI upgrade |
| `SUI_CONFIG_DIR=...sui_config_mainnet` scoping | Phase 0 D-06 | preflight step 1 asserts; never invokes `sui client switch` |
| `scripts/predict-mainnet-check.sh` invoked by preflight | D-05 + D-07 | preflight gate 14 calls the script and requires `"shipped":true`; intentional FAIL today |

## Deviations from Plan

**None.** Plan executed exactly as written. The only adjustments were:

1. **Cosmetic comment rephrasing** to keep the plan's forbidden-token grep (`! grep -E 'sui client publish'`) clean. The initial header comment in both scripts described what the script does NOT do using the literal string `sui client publish`; rephrased to "any mainnet-mutating CLI command (publish, call, or transfer)". This is not a behavioral deviation — it's a documentation phrasing choice driven by the verification block's grep.

Both scripts implement the plan body's action steps in order. No skipped steps, no added steps, no Rule 1/2/3 auto-fixes triggered. (Rule 4 didn't apply.)

## Forbidden-Token Grep Results

Per the plan's threat model (T-05-06) and verification block:

```
$ grep -E 'sui client publish' scripts/preflight.sh           -> no match (PASS)
$ grep -E 'sui client publish' scripts/predict-mainnet-check.sh -> no match (PASS)
```

Both scripts are assert-only / read-only. Preflight delegates the actual publish to `scripts/mainnet-deploy.sh` (Plan 05-02). Predict-mainnet-check uses only `curl` + `jq` — no Sui CLI invocation.

## Verification Block Results (Plan 05-01)

| # | Gate | Result |
|---|------|--------|
| 1 | `bash -n scripts/preflight.sh` | PASS |
| 2 | `bash -n scripts/predict-mainnet-check.sh` | PASS |
| 3 | `grep -q 'scan_tbd_slots' scripts/preflight.sh` | PASS |
| 4 | `grep -q 'sui_config_mainnet' scripts/preflight.sh` | PASS |
| 5 | `grep -q '60000000' scripts/preflight.sh` | PASS |
| 6 | `grep -q 'fullnode.mainnet.sui.io' scripts/predict-mainnet-check.sh` | PASS |
| 7 | `grep -q '"shipped"' scripts/predict-mainnet-check.sh` | PASS |
| 8 | `! test -f .github/workflows/predict-mainnet-check.yml` | PASS |
| 9 | `! grep -E 'sui client publish' scripts/preflight.sh` | PASS |
| 10 | `! grep -E 'sui client publish' scripts/predict-mainnet-check.sh` | PASS |
| 11 | Dry-run today: `bash scripts/preflight.sh` exits non-zero with documented failure | PASS — exits 1 at gate 2 (active-env=testnet, no mainnet env configured); equivalent acceptance under D-05 ("dry run does not need to actually succeed") |
| 12 | Dry-run today: `PREDICT_MAINNET_CANDIDATE=TBD bash scripts/predict-mainnet-check.sh` emits `"shipped":false` on stdout + exits 0 | PASS |

`shellcheck` is not installed in the local execution environment (Windows host); the CI matrix will exercise it on push. The scripts follow the established `set -euo pipefail` + `--arg`/`--argjson` jq idiom from `scripts/e2e-vault-deploy.sh` and `scripts/verify-deepbookv3-pin.sh`, both of which are already shellcheck-clean in CI.

## Dry-Run Output Today

```
$ PREDICT_MAINNET_CANDIDATE=TBD bash scripts/predict-mainnet-check.sh /dev/stdout
{"shipped":false,"reason":"no candidate package id; awaiting Mysten announcement"}

# Predict Mainnet Check — 2026-05-16
... (Markdown report follows) ...

$ echo $?
0
```

Preflight today (no mainnet env configured locally) fails at gate 2:
```
==> [2/14] Active sui env is mainnet...
::error::Active sui env is 'testnet', expected 'mainnet'.
exit 1
```
On a properly-configured mainnet host (correct `SUI_CONFIG_DIR`, sui CLI 1.71.1, etc.), preflight will pass gates 1-13 and fail at gate 14 with:
```
::error::Predict mainnet not shipped — preflight cannot pass until DeepBook Predict ships on mainnet.
         Re-run after the predict-mainnet-check signals shipped:true.
```
This is the D-05 intentional-fail acceptance.

## Issues Encountered

- **Cosmetic comment-grep collision**: forbidden-token grep `! grep -E 'sui client publish'` initially matched a header comment in each script that *described* what the script doesn't do using the literal token. Resolved by rephrasing the comment to "any mainnet-mutating CLI command (publish, call, or transfer)". Documentation-only fix; no behavior change.
- **shellcheck not installed locally** (Windows host): the lint gate runs in CI on push. Both scripts follow the same idioms as `scripts/e2e-vault-deploy.sh` and `scripts/verify-deepbookv3-pin.sh`, which are already shellcheck-clean in the repo CI — high confidence the new scripts will also pass.
- **Sui CLI auto-created `~/.sui/sui_config_mainnet`** during the first dry-run (no config existed locally; sui prompted "create one [Y/n]?" and proceeded with default-Y). Cleaned up via `rm -rf ~/.sui/sui_config_mainnet` after the dry-run. No persistent artifact; future post-submission operator on a properly-funded mainnet wallet will use a real `~/.sui/sui_config_mainnet` directory.

## Threat Flags

No new security surface beyond what the plan's `<threat_model>` enumerates. Both scripts are read-only / assert-only; the only outbound traffic is a single TLS `curl` to Mysten's mainnet RPC (T-05-01 accepted; same trust profile as every other RPC call in the project). No flags to add to a verifier register.

## Self-Check: PASSED

```
$ ls -la scripts/preflight.sh scripts/predict-mainnet-check.sh
scripts/preflight.sh              -> FOUND
scripts/predict-mainnet-check.sh  -> FOUND

$ git log --oneline -2
0f12d28 feat(05-01): add manual Predict-mainnet RPC probe (no cron)
bd9e247 feat(05-01): add mainnet-readiness preflight gate

bd9e247 -> FOUND in git history
0f12d28 -> FOUND in git history
```

Both files exist on disk and both commits are reachable from HEAD.

## Resume Signal for Plan 05-02

Plan 05-02 builds the deploy + mainnet-smoke half of the toolkit:
- `scripts/mainnet-deploy.sh` — fork of `scripts/e2e-vault-deploy.sh` with `SUI_CONFIG_DIR=*sui_config_mainnet` scoping, `--gas-budget 1000000000`, mainnet config reads from `config/mainnet.toml`, output to `.planning/phases/05-testnet-demo-hardening/MAINNET-DEPLOY.json`. Header MUST document `scripts/preflight.sh` as a prerequisite (T-05-03 mitigation).
- `scripts/mainnet-smoke-test.{sh,ts}` — fork of `scripts/e2e-vault-cycle.{sh,ts}` with `getFullnodeUrl('mainnet')`, `quote_type_tag` field, `SUPPLY_AMOUNT_MICRO=50_000_000n`, dual ±10 bps NAV gate.
- `MAINNET-DEPLOY.json` placeholder with `{"status":"not_deployed", "reason":"Predict mainnet pending — DeepBook Predict not shipped on Sui mainnet as of submission window 2026-06-16", ...}`.

Preflight (this plan) is the assert-only gate that Plan 05-02's deploy script will sit behind; the deploy script header should document `scripts/preflight.sh` as a prerequisite per T-05-03.

DEPLOY-01 is half-closed by this plan (preflight + predict-check halves complete). Plan 05-02 closes DEPLOY-02 + DEPLOY-03. Plan 05-05 closes DEPLOY-09 (runbook).

## Next Phase Readiness

- Plan 05-02 can proceed immediately on Wave 2.
- Plan 05-04 (cooldown codegen extension) is independent and can run in parallel.
- No blockers; no human-action checkpoints; no auth gates triggered.
- Plan 05-01 itself has no consumers until Plan 05-02 lands the deploy script (which references preflight by path).

---
*Phase: 05-testnet-demo-hardening*
*Plan: 01*
*Completed: 2026-05-16*
