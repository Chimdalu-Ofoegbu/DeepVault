---
phase: 05-testnet-demo-hardening
plan: 05
subsystem: docs
tags: [docs, readme, makefile, mainnet-readiness, phase-5-closure, deploy-09, demo-wiring]

# Dependency graph
requires:
  - phase: 05-testnet-demo-hardening
    provides: scripts/preflight.sh + scripts/predict-mainnet-check.sh (Plan 05-01)
  - phase: 05-testnet-demo-hardening
    provides: scripts/mainnet-deploy.sh + scripts/mainnet-smoke-test.{sh,ts} + MAINNET-DEPLOY.json placeholder (Plan 05-02)
  - phase: 05-testnet-demo-hardening
    provides: scripts/testnet-smoke-test.{sh,ts} (Plan 05-03)
  - phase: 05-testnet-demo-hardening
    provides: shared/strategy.toml [redemption].cooldown_ms + cross-runtime codegen (Plan 05-04)
  - phase: 02-vault-move-package-testnet-deploy
    provides: .planning/phases/02-vault-move-package-testnet-deploy/TESTNET-DEPLOY.json (consumed by README testnet-contracts subsection; currently pending_first_deploy)
provides:
  - "docs/MAINNET-READINESS.md hardened with 3 new top sections (Why deferred / 30-minute procedure / Architecture single-config-flip)"
  - "Original funding playbook preserved verbatim below new sections; Step 2 USDsui amount corrected to 60 USDsui (10 seed + 50 smoke) per RESEARCH carry-forward"
  - "README.md hardened: Demo section wired to make demo; Testnet contracts subsection citing TESTNET-DEPLOY.json + Sui testnet explorer URLs; Mainnet readiness top-level section; Week 5 build-log entry"
  - "Makefile demo target replaces TODO placeholder with bash scripts/testnet-smoke-test.sh + env-var documentation"
  - "Phase 5 closure traceability matrix mapping each DEPLOY-XX to the plan that closed it"
affects:
  - "Phase 6 (Submission Package): testnet smoke test is the demo flow + make demo is the recording target; mainnet-readiness toolkit is the post-submission contingency"
  - "Phase 6 DEPLOY-06 (README cold-read polish): Phase 5 sets up the structural pieces; Phase 6 runs the cold-read test"
  - "Post-submission mainnet operator: ≤30-minute procedure documented end-to-end"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Two-audience doc pattern: judges read top (why-deferred + posture); operator reads body (mechanical playbook)"
    - "Surgical-insert README hardening (vs full rewrite): preserves laypitch/glossary/stack/quick-start so Phase 6 can polish on a stable base"
    - "Append-only build-log Week 5 entry preserves CONTRIBUTING.md discipline"

key-files:
  created:
    - .planning/phases/05-testnet-demo-hardening/05-05-SUMMARY.md
  modified:
    - docs/MAINNET-READINESS.md
    - README.md
    - Makefile

key-decisions:
  - "make demo target wires directly to bash scripts/testnet-smoke-test.sh per D-10 — single one-liner with env-var echoes; no FAST_FORWARD branch (wall-clock only)"
  - "README testnet contracts subsection cites the TESTNET-DEPLOY.json path with PENDING placeholders honestly (no fabricated addresses) — Phase 2's testnet deploy is 0/9 plans complete and would falsify any literal addresses"
  - "MAINNET-READINESS.md keeps the existing 'Reshape note' breadcrumb at the very top + 3 new sections immediately below it (preserves the why-renamed audit trail)"
  - "MAINNET-READINESS.md Section B's 5-step CLI sequence matches the operator pipeline from Plan 05-02 SUMMARY's resume signal verbatim (single source of truth for the procedure)"
  - "USDsui Step-2 amount patched from 50 to 60 per RESEARCH carry-forward finding #1: vault::create_vault consumes a 10-USDsui seed in addition to the 50-USDsui smoke deposit"
  - "No fix for the @mysten/sui 2.16.0 SuiClient/SuiJsonRpcClient drift in scripts/e2e-vault-cycle.ts — scope-boundary'd per Plan 05-03 SUMMARY; deferred to a follow-up backlog plan (not Plan 05-05's deliverable)"

patterns-established:
  - "Phase closure SUMMARY structure: cold-read checklist + traceability matrix + dropped-pieces verification + Phase N+1 resume signals — reusable for Phase 6 closure"
  - "Forbidden-claim discipline in README: no 'mainnet redeploy completed' / 'deployed on mainnet' without a 'deferred' qualifier (T-05-24 mitigation)"

requirements-completed: [DEPLOY-09]

# Metrics
duration: ~25min
completed: 2026-05-16
---

# Phase 05 Plan 05: Phase 5 Closure (Docs + README + Makefile) Summary

**Phase 5 closes with the documentation + reproducible-run plumbing wired end-to-end: `docs/MAINNET-READINESS.md` gains 3 new top sections (why deferred + 30-minute procedure + single-config-flip architecture) explaining the mainnet posture to judges and the post-submission operator; `README.md` gains testnet contract pointers + `make demo` documentation + a mainnet-readiness top-level section + a Week 5 build-log entry; the `Makefile` `demo:` target replaces its Phase-6 TODO placeholder with `bash scripts/testnet-smoke-test.sh`. Plus this closure SUMMARY documenting the full traceability matrix, the cold-read checklist for Phase 6, and the dropped-pieces verification proving the reshape carried through.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-05-16T03:23Z
- **Completed:** 2026-05-16
- **Tasks:** 4 (all `type="auto"`)
- **Files created:** 1 (this SUMMARY)
- **Files modified:** 3 (docs/MAINNET-READINESS.md, README.md, Makefile)
- **Lines added:** ~140 (74 MAINNET-READINESS + 53 README + 6 Makefile + this SUMMARY)

## Accomplishments

- **DEPLOY-09 closed.** `docs/MAINNET-READINESS.md` gains the 3 new top sections D-09 specifies (why deferred / ≤30-min procedure / architecture single-config-flip) and preserves the entire original funding playbook (wallets, Cetus path, $80 budget, contingency, demo recording, post-submission, references) verbatim below as the post-submission operational reference.
- **Step 2 USDsui correction propagated** per RESEARCH finding #1: `~$50 → USDsui` patched to `~60 USDsui (10 seed + 50 smoke)` with inline citation. Matches `scripts/preflight.sh` gate 12 threshold of 60_000_000 micro-units (Plan 05-01).
- **README hardened (judge-skimmable per D-11; Phase 6 polishes to judge-readable).** Demo section now documents the env-var contract + the `make demo` invocation + the equivalent `bash scripts/testnet-smoke-test.sh` one-liner. Testnet contracts subsection cites TESTNET-DEPLOY.json and the Sui testnet explorer URL pattern with PENDING placeholders (no fabricated addresses). Mainnet readiness top-level section gives the 4-line post-submission deploy procedure + cross-link to MAINNET-READINESS.md. Week 5 build-log entry appended per append-only CONTRIBUTING.md discipline.
- **Makefile `demo:` target wired.** The `@echo "TODO: Phase 6 fills this in"` placeholder is gone; the recipe now echoes 4 informational lines (env vars, setup pointer, wall-clock duration) then invokes `bash scripts/testnet-smoke-test.sh`. Tab-indented per Makefile syntax.
- **Phase 5 closure traceability matrix** below maps each of the 5 DEPLOY-XX requirements to the plan(s) that closed them.

## Task Commits

Each task was committed atomically:

1. **Task 1: Prepend 3 new top sections to docs/MAINNET-READINESS.md** — `f7583d2` (docs)
2. **Task 2: Harden README.md** — `4d35f86` (docs)
3. **Task 3: Wire Makefile demo target** — `2291075` (feat)
4. **Task 4: This SUMMARY + Phase 5 closure metadata commit** — (produced in the final-commit step below)

## Files Modified

- **`docs/MAINNET-READINESS.md`** — 3 new top sections (Why deferred / ≤30-min procedure / Architecture single-config-flip) inserted between the existing Reshape note and the original "Purpose: Two audiences" line. Step 2 USDsui amount corrected from `~$50` to `~60 USDsui (10 seed + 50 smoke)` with inline RESEARCH carry-forward citation. Original funding playbook (Wallets, Funding flow Steps 1-4, Risk Flag, Contingency, Demo recording, Post-submission, References) preserved verbatim below the new sections.
- **`README.md`** — Demo section rewritten to document `make demo` + `bash scripts/testnet-smoke-test.sh` invocation + env vars + the 7-checkpoint expected output. New "Testnet contracts" subsection within Demo citing TESTNET-DEPLOY.json + Sui testnet explorer URL pattern (placeholders show PENDING). New top-level "Mainnet readiness" section between Hosting and Key policies. New "Week 5 (2026-06-09 to 2026-06-15)" build-log subsection appended after Week 1 per append-only discipline. Laypitch, Glossary, Architecture at a Glance, Quick Start, Stack, Repo layout, Hosting, Key policies, References, License sections all unchanged.
- **`Makefile`** — Header comment line for `demo` updated from `placeholder until Phase 6` to `judge-facing testnet smoke test (scripts/testnet-smoke-test.sh)`. Body replaces `@echo "TODO: Phase 6 fills this in..."` with 4 `@echo` informational lines + final `bash scripts/testnet-smoke-test.sh`. Tab-indented per Makefile syntax (cat -A verified `^I` prefixes on every recipe line).

## README cold-read smoke test checklist

Per D-11 / DEPLOY-06 anticipation. Phase 6 runs these against a judge persona; this plan sets up the structural pieces:

- [ ] A judge reading only `## Status` + `## Mainnet readiness` + `## Demo` understands the mainnet posture in under 2 minutes. (Status section is unchanged; Mainnet readiness section is new and reads "deferred to post-submission" with the ≤30-min procedure; Demo section reads "reproducible via `make demo`".)
- [ ] `make demo` is a discoverable single command; no archaeology required to find the smoke test entry point. (Documented in the Demo section + cross-cited from the Quick Start section's `make` table.)
- [ ] Mainnet readiness section links to MAINNET-READINESS.md so the curious judge has a deeper-reading path. (Markdown link `[`docs/MAINNET-READINESS.md`](docs/MAINNET-READINESS.md)` present.)
- [ ] No claims in the README falsely imply a live mainnet deployment. Forbidden patterns absent: `mainnet redeploy completed`, `deployed on mainnet` (without a `deferred` qualifier), `mainnet contract at <id>`. (T-05-24 mitigation.)
- [ ] Testnet contract pointer subsection works whether TESTNET-DEPLOY.json is populated or in placeholder state. (Cites the JSON path; placeholders show `PENDING` until Phase 2 testnet deploy runs; no literal addresses fabricated.)

## Phase 5 closure traceability matrix

| Requirement | Plan | Closure evidence |
|-------------|------|------------------|
| DEPLOY-01 | 05-01 | `scripts/preflight.sh` (276 LOC, 14 gates, write-but-don't-execute) + `scripts/predict-mainnet-check.sh` (128 LOC, JSON-verdict-first stdout, no cron per D-07). Both lint-clean; preflight intentionally fails today at gate 14 (Predict mainnet not shipped) per D-05 acceptance contract. |
| DEPLOY-02 | 05-02 | `scripts/mainnet-deploy.sh` (360 LOC, write-but-don't-execute) + `.planning/phases/05-testnet-demo-hardening/MAINNET-DEPLOY.json` placeholder (10 LOC). All static gates green (bash -n, tsc --noEmit, jq -e). Config-driven via `extract_config_value()` awk helper — no testnet literal hardcoded (Pitfall 14 mitigation). |
| DEPLOY-03 | 05-02 | AdminCap owner verification gate inline in `mainnet-deploy.sh` step 9 (jq parses `.objectChanges[].owner.AddressOwner` and aborts deploy on mismatch). Structural parity with `e2e-vault-deploy.sh` (testnet analog from Plan 02-09); divergences documented in 05-02 SUMMARY's "Mainnet-vs-testnet" table. |
| DEPLOY-04 | 05-03 + 05-04 | `scripts/testnet-smoke-test.{sh,ts}` (115 + 522 LOC) with 7 staged `[CHECKPOINT PASS]` markers + dual ±10 bps gate (Gate A per-depositor ratio + Gate B vault NAV drift). Wires to `make demo` (this plan). Cooldown sourced from `STRATEGY_CONSTANTS.REDEMPTION_COOLDOWN_MS` (Plan 05-04 codegen extension) — no hardcoded `3_600_000` literal in the smoke test. Execution gate deferred to operator per Plan 01-05 / 02-09 fallback pattern (TESTNET-DEPLOY.json still `pending_first_deploy`); recipe documented in 05-03 SUMMARY. |
| DEPLOY-09 | 05-05 | `docs/MAINNET-READINESS.md` 3 new top sections (Why deferred / ≤30-minute procedure / Architecture single-config-flip) + funding playbook preserved + Step 2 USDsui amount corrected to 60 per RESEARCH carry-forward. README mainnet-readiness section + Makefile demo target close the judge-facing surface. |

All 5 Phase-5 DEPLOY requirements closed by static gates or by deferred-with-operator-recipe per the reshape note's "scripts written, lint-clean, deferred execution" framing.

## Dropped pieces vs the prior plan run

Proof that the Phase 5 reshape (mainnet-redeploy → testnet-hardening + readiness-toolkit) carried through:

- **GitHub Actions cron for `predict-mainnet-check.sh`** — NOT created. Per D-07, the script is manual-only. `! test -f .github/workflows/predict-mainnet-check.yml` verified across Plans 05-01, 05-02, 05-05. The original plan run's `.github/workflows/predict-mainnet-check.yml` (cron firing 2026-06-09 09:00 UTC) is not in the tree.
- **`runSplitDemoPath`** — not implemented anywhere. The prior plan run's D-05 fallback (mainnet `vault::supply` + `vault::redeem` without Predict if Predict mainnet hadn't shipped) is dropped per the reshape: mainnet execution is deferred entirely, not degraded to a no-hedge variant. `grep -r runSplitDemoPath` across `scripts/` returns no matches.
- **AdminCap pause recovery procedure** — not added to the testnet smoke test (per CONTEXT.md `<specifics>` "no AdminCap pause recovery; testnet vault is faucet-funded and recreatable"). `scripts/testnet-smoke-test.ts` does not call `admin_pause` or any recovery path; the script exits 1 on gate failure with the failure context.
- **`SMOKE-TEST-SPLIT-DEMO.json` artifact** — not created. The prior plan run's split-demo result capture file is dropped per the reshape. `! test -f .planning/phases/05-testnet-demo-hardening/SMOKE-TEST-SPLIT-DEMO.json` verified.
- **Mainnet smoke test execution** — deferred per D-05. `scripts/mainnet-smoke-test.sh` exists as write-but-don't-execute; gate 4 in `MAINNET-DEPLOY.json` is `status: "not_deployed"`; `scripts/mainnet-smoke-test.sh` has a defensive gate refusing to run on a placeholder JSON.
- **The 7th plan from the prior plan run** — not created. Phase 5 is exactly 5 plans (05-01 through 05-05), as the reshape specified.

## Resume signal for Phase 6 (Submission Package)

Phase 5 closes; Phase 6 takes the baton with the testnet smoke test as the demo flow and the mainnet-readiness toolkit as the post-submission contingency. The Phase 6 deliverables:

- **DEPLOY-06 (README cold-read polish)** — Phase 5 set up the structural pieces (Status / Mainnet readiness / Demo sections; mainnet-readiness cross-link; testnet contract pointers); Phase 6 runs the cold-read test against a judge persona and polishes the laypitch + glossary + adds an architecture-diagram PNG/SVG inlined into the README.
- **DEPLOY-05 (demo video)** — Phase 5's testnet smoke test IS the demo flow. Phase 6 records the video against `make demo`, capturing the 7 `[CHECKPOINT PASS]` lines + the final dual-gate verdict. Edit can speed up the 1h cooldown segment.
- **DEPLOY-07 (architecture diagram)** — Phase 6 produces a polished PNG/SVG from `.planning/research/ARCHITECTURE.md` skeleton.
- **DEPLOY-08 (strategy whitepaper)** — Phase 6 writes the institutional-LP-grade strategy whitepaper drawing from `docs/HEDGE-POLICY.md` + the Phase 3 backtest HTML report + the Tier C JackJacquier source upgrade (currently in Deferred Items).
- **DEPLOY-10 (Devpost submission)** — Phase 6 bundles README + demo video + architecture diagram + whitepaper + backtest report into the Devpost submission by 2026-06-16.
- **Mainnet-readiness sidebar in the demo video** — Phase 6 reads `docs/MAINNET-READINESS.md` and records a ~10-second segment explaining the post-submission posture: "Mainnet deploy is deferred pending DeepBook Predict mainnet launch; the toolkit ships ready to invoke in ≤30 minutes."

## Known follow-up / backlog (out-of-scope for Plan 05-05)

- **`scripts/e2e-vault-cycle.ts` + possibly `scripts/two-protocol-ptb-demo.ts` carry broken `@mysten/sui` 2.16.0 imports** (`SuiClient`/`getFullnodeUrl` from `/client` instead of `SuiJsonRpcClient`/`getJsonRpcFullnodeUrl` from `/jsonRpc`). Plan 05-03 surfaced this latent bug; Plans 05-02 and 05-03 used the correct imports in their new files but did NOT auto-fix the existing scripts per scope-boundary rule. Phase 6 backlog or a dedicated follow-up plan should migrate `e2e-vault-cycle.ts` and audit all `scripts/*.ts` for the broken import path.
- **TESTNET-DEPLOY.json placeholder state** — Phase 2 has 0/9 plans complete; the testnet vault is `status: pending_first_deploy`. `make demo` will fail until Phase 2 is executed and the testnet vault exists. The operator recipe in 05-03 SUMMARY documents the post-Phase-2 unblock procedure. This is by-design state machine behavior (the JSON shape exists and is consumed correctly; literal values populate at deploy time), not a stub gap from Plan 05-05.

## Threat Flags

None. The threat model in the plan body (T-05-24..T-05-29) covers all surfaces this plan introduces:

- **T-05-24 (README falsely implies live mainnet):** Mitigated — forbidden-claim grep (`mainnet redeploy completed` / `deployed on mainnet` without `deferred` qualifier) returns no matches in README.md after Task 2 edits. Mainnet readiness section's only "deployed" claim is via the MAINNET-DEPLOY.json status field reference, which is currently `not_deployed`.
- **T-05-25 (≤30-min procedure missing a step):** Mitigated — Section B grep gates confirm all 4 mainnet-toolkit script paths (`scripts/predict-mainnet-check.sh`, `scripts/preflight.sh`, `scripts/mainnet-deploy.sh`, `scripts/mainnet-smoke-test.sh`) are cited in the procedure section.
- **T-05-26 (make demo fails silently when env vars missing):** Mitigated — `scripts/testnet-smoke-test.sh` (Plan 05-03) asserts `SUI_PRIVATE_KEY` + `ORACLE_SVI_ID` at the top with explicit error messages; the Makefile recipe echoes the env-var requirement before invoking. Failure is loud, not silent.
- **T-05-27 (future edit adds contradictory claim):** Mitigated — build-log append-only discipline (CONTRIBUTING.md) requires weekly entries that would surface any post-submission deploy. No code-level enforcement; risk is bounded by solo-build review.
- **T-05-28 (real testnet wallet address in README):** Accepted — all on-chain addresses are public by construction. README cites the JSON path, not literal addresses. Acceptable disclosure.
- **T-05-29 (make demo abuses testnet faucet):** Mitigated — Demo section calls out "ephemeral testnet keypair" pattern + cross-links to docs/DEV-BOOTSTRAP.md for the setup procedure.

No flags to add to a verifier register.

## Known Stubs

None. The README testnet contracts subsection uses `<package_id>`, `<vault_id>`, `<admin_cap_id>`, `<deploy_tx_digest>` as template placeholders in URL patterns — these are URL-pattern documentation, not stub data paths. The actual values populate when the operator runs `bash scripts/e2e-vault-deploy.sh` (Phase 2 deliverable), and the URLs become clickable. The subsection's "placeholders show `PENDING` until Phase 2's testnet deploy actually runs" disclaimer is honest about the state.

## Issues Encountered

- **`make` not on PATH on Windows execution environment.** The plan body's `<verify>` block included a `make -n demo 2>&1 | grep -q 'testnet-smoke-test'` dry-run gate. `make` is not installed on this Windows host (same disposition as `shellcheck` in Plans 05-01/02/03 — CI runners exercise it on push). Verified Makefile correctness via the structural gates: `grep 'bash scripts/testnet-smoke-test.sh' Makefile` PASS, `! grep 'TODO: Phase 6' Makefile` PASS, `grep '^demo:' Makefile` PASS, and `cat -A` confirmed every recipe line is tab-indented (`^I` prefix). The existing README documents the "make not on PATH (Windows)" fallback, so users on this platform invoke `bash scripts/testnet-smoke-test.sh` directly.

## TDD Gate Compliance

N/A — plan type is `execute`, not `tdd`. No RED/GREEN/REFACTOR cycle expected. Static grep gates verify shape; the live `make demo` run (operator-deferred per Plan 05-03's documented fallback pattern) verifies behavior post-Phase-2-deploy.

## Self-Check: PASSED

Verified:
- `[ -f docs/MAINNET-READINESS.md ]` → FOUND
- `[ -f README.md ]` → FOUND
- `[ -f Makefile ]` → FOUND
- `[ -f .planning/phases/05-testnet-demo-hardening/05-05-SUMMARY.md ]` → FOUND (this file)
- `git log --oneline | grep f7583d2` → FOUND (Task 1 commit)
- `git log --oneline | grep 4d35f86` → FOUND (Task 2 commit)
- `git log --oneline | grep 2291075` → FOUND (Task 3 commit)
- Plan must_haves truths checklist (verified via grep gates above):
  - 3 new top sections present in MAINNET-READINESS.md → PASS
  - README has make demo + scripts/testnet-smoke-test.sh + MAINNET-READINESS.md + suiscan.xyz/testnet + Mainnet readiness + Week 5 + TESTNET-DEPLOY.json → PASS
  - Makefile demo target invokes bash scripts/testnet-smoke-test.sh → PASS
  - MAINNET-READINESS.md preserves funding playbook (Cetus / $80 / wallet table) → PASS
  - Step 2 USDsui amount corrected to 60 USDsui → PASS
- Plan must_haves artifacts checklist:
  - docs/MAINNET-READINESS.md contains "Why deferred" + "30-minute" + "single-config-flip" → PASS
  - README.md contains "make demo" + "MAINNET-READINESS.md" + "TESTNET-DEPLOY.json" → PASS
  - Makefile contains "scripts/testnet-smoke-test.sh" → PASS
- Plan must_haves key_links checklist:
  - Makefile demo target → scripts/testnet-smoke-test.sh via bash invocation → PASS
  - README.md mainnet-readiness section → docs/MAINNET-READINESS.md via Markdown link → PASS
  - docs/MAINNET-READINESS.md ≤30-min procedure → all 4 mainnet-toolkit script paths via shell command sequence → PASS

## Next Phase Readiness

- **Phase 5 closes.** All 5 plans (05-01 through 05-05) complete. All 5 DEPLOY-XX requirements closed by static gates or by deferred-with-operator-recipe per the reshape note's framing.
- **Phase 6 (Submission Package) unblocked.** Testnet smoke test is the demo flow; `make demo` is the recording target; mainnet-readiness toolkit is the post-submission contingency. Phase 6 deliverables: demo video (DEPLOY-05), README cold-read polish (DEPLOY-06), architecture diagram (DEPLOY-07), strategy whitepaper (DEPLOY-08), Devpost submission (DEPLOY-10).
- **No blockers, no human-action checkpoints, no auth gates triggered during Plan 05-05 execution.**

---

*Phase: 05-testnet-demo-hardening*
*Plan: 05*
*Completed: 2026-05-16*
*Phase 5 closed: all 5 plans complete; testnet smoke test is the demo flow; mainnet-readiness toolkit ready for post-submission invocation when DeepBook Predict ships on mainnet*
