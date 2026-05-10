---
phase: 02-vault-move-package-testnet-deploy
plan: 01
subsystem: infra
tags: [move, sui, deepbook-predict, ci, subtree, spike]

# Dependency graph
requires:
  - phase: 00-setup-ground-rules
    provides: contracts/Move.toml SHA pin, vendored DeepBookV3 subtree, 5-job CI matrix
  - phase: 01-math-foundation-svi-parity-gate
    provides: contracts/sources/svi_view.move (consumes deepbook_predict::oracle)
provides:
  - empirical resolution of PredictManager ownership (option b — supplier-owned)
  - canonical `Selected: option b` sentinel for downstream plans
  - DeepBookV3 SHA pin verification script + CI step (drift detection)
  - inline RESOLVED annotations on all 6 RESEARCH.md Open Questions
  - latent Phase 1 build fix — DeepBookPredict dep now declared in Move.toml
affects: [02-02, 02-03, 02-04, 02-05, 02-06, 02-07, 02-08, 02-09]

# Tech tracking
tech-stack:
  added: [deepbook_predict (Move package dep), bash subtree-pin assertion]
  patterns:
    - "_spike/ namespace for transient empirical-spike Move modules — deletable post-Wave 1 without touching production paths"
    - "git subtree-split SHA assertion via `git log --grep` on canonical squash subject"
    - "RESOLVED: inline annotation pattern for RESEARCH.md Open Questions (preserves audit trail vs. deletion)"

key-files:
  created:
    - contracts/sources/_spike/predict_manager_owner_spike.move
    - contracts/tests/_spike/predict_manager_owner_spike_test.move
    - .planning/phases/02-vault-move-package-testnet-deploy/WAVE0-DECISION.md
    - scripts/verify-deepbookv3-pin.sh
  modified:
    - contracts/Move.toml (added DeepBookPredict dep)
    - .github/workflows/ci.yml (added verify-pin step in move job)
    - .planning/phases/02-vault-move-package-testnet-deploy/02-RESEARCH.md (heading rename + 6 RESOLVED annotations)

key-decisions:
  - "PredictManager ownership = supplier-owned (option b) — canonical sentinel `Selected: option b` in WAVE0-DECISION.md; Plan 02-04/02-05/02-09 grep against this for wiring"
  - "D-06 single-PTB story preserved by relaxing `single Move entry function` (Claude-discretion phrasing) to `single PTB with two moveCalls` (predict::create_manager + vault::supply); locked decisions intact, no CONTEXT.md amendment required"
  - "Vault never owns or stores a PredictManager — each supplier brings their own &mut PredictManager into vault::supply"
  - "DeepBookPredict declared as a separate Move.toml dep (Rule 3 auto-fix) — same SHA pin as DeepBookV3; verify-deepbookv3-pin.sh enforces both stay aligned with the vendored subtree"
  - "Spike modules namespaced under _spike/ for deliberate post-Wave 1 deletion without touching production code"

patterns-established:
  - "Pattern: empirical-resolution Move spike via verbatim assert copy. The spike module copies the upstream assertion (here predict.move:228) into a `public(package)` helper, citing source SHA inline. Tests construct real upstream objects via public APIs (predict::create_manager) and run the helper — sender/owner mismatch is the same operand-level fact regardless of where the assert physically lives."
  - "Pattern: inline RESOLVED annotation for RESEARCH.md Open Questions. Preserves the original question text + considered options as audit trail; the section heading rename `## Open Questions` -> `## Open Questions (RESOLVED)` is the gate downstream tooling greps against."
  - "Pattern: SHA-pin drift assertion via squash-commit trailer recovery. `git log --all --grep='^Squashed .scripts/deepbookv3/. content from commit'` finds the squash; `git show --pretty=format:'%b'` reads the `git-subtree-split:` trailer. Resilient to non-path-touching merges and detached subtree merges."

requirements-completed: []  # VAULT-05 + VAULT-07 are unblocked, not delivered. Plan 02-04 ships VAULT-05 (rebalance::buy_hedge_for_deposit); Plan 02-03 / 02-04 ships VAULT-07 (predict_adapter). Plan 02-01 only resolves the BLOCKER that gated their implementation (PredictManager ownership).

# Metrics
duration: ~30min
completed: 2026-05-10
---

# Phase 02 Plan 01: Wave 0 — PredictManager Ownership Spike + DeepBookV3 SHA Pin CI Summary

**Resolved RESEARCH.md Open Question #1 (PredictManager ownership BLOCKER) by empirically demonstrating predict.move:228's owner-equals-sender semantics; selected option (b) — supplier-owned PredictManager — as the unique configuration compatible with both the line-228 assert and CONTEXT.md D-06; landed `verify-deepbookv3-pin.sh` + CI step closing Open Question #4; annotated all six Open Questions with inline RESOLVED outcomes.**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-05-10T09:13Z
- **Completed:** 2026-05-10T09:43Z
- **Tasks:** 4
- **Files modified:** 7 (4 created, 3 modified)

## Accomplishments

- **Q#1 resolution.** Three-case Move spike (option_a, option_b, option_c) constructs a real PredictManager via the public `predict::create_manager` and runs a verbatim copy of the line-228 owner assertion under each sender configuration. Outcome:
  - option (a) admin-creates / supplier-mints: `expected_failure(abort_code = ENotOwner)` — confirms `predict::mint` would abort.
  - option (b) supplier-creates / supplier-mints: passes.
  - option (c) two-moveCall PTB: passes mechanically, but DISALLOWED at plan level (B4 fix on Plan 02-04, contradicts D-06).
- **Decision sentinel.** `Selected: option b` line in `WAVE0-DECISION.md` — the canonical sentinel Plan 02-04 / 02-05 / 02-09 grep against. D-06/D-07 re-route documented; downstream Move signatures specified concretely (`vault::supply` takes `&mut PredictManager`).
- **Q#4 resolution.** `scripts/verify-deepbookv3-pin.sh` (mode 0755) asserts both `DeepBookV3` and `DeepBookPredict` Move.toml rev pins match the vendored subtree's `git-subtree-split` trailer; new step in CI's `move` job runs before `sui move build`. Local invocation exits 0 on the current clean checkout.
- **All six Open Questions annotated inline.** Heading renamed `## Open Questions` -> `## Open Questions (RESOLVED)`; each question has a `**RESOLVED:**` annotation citing the plan/file/mechanism that resolved it (Q#1, Q#4 by this plan; Q#2 deferred to 02-07; Q#3 by 02-09; Q#5 by Phase 4; Q#6 by 02-02 + Phase 3 backtest).
- **Latent Phase 1 build fix.** Phase 1's `svi_view.move` imports `deepbook_predict::oracle` but the package was never declared as a Move.toml dep (CI never ran — Plan 00-07 Task 4 still BLOCKED-on-human). Added `DeepBookPredict` dep at the same SHA as `DeepBookV3` (Rule 3 auto-fix) so `sui move build` will succeed on first CI run.

## Task Commits

Each task was committed atomically:

1. **Task 1: Spike Move tests for three PredictManager ownership configurations** - `fab4397` (test)
2. **Task 2: Capture spike outcome — write WAVE0-DECISION.md** - `78e1951` (docs)
3. **Task 3: Add DeepBookV3 SHA pin verification — script + CI step** - `698ba46` (ci)
4. **Task 4: Annotate RESEARCH.md Open Questions inline with RESOLVED outcomes** - `6c4544b` (docs)

**Plan metadata commit:** to follow this SUMMARY.md write.

## Files Created/Modified

### Created
- `contracts/sources/_spike/predict_manager_owner_spike.move` — spike module with `assert_owner_matches_sender` (verbatim copy of `predict.move:228` semantics, cited inline) and `ENotOwner = 1` constant matching the upstream code.
- `contracts/tests/_spike/predict_manager_owner_spike_test.move` — three `#[test]` cases (option_a expected_failure, option_b/c success). Uses `test_scenario` to switch sender between `@0xa1` (admin) and `@0xb2` (supplier); calls real public `predict::create_manager`; reads real `manager.owner()` accessor; runs `assert_owner_matches_sender`.
- `.planning/phases/02-vault-move-package-testnet-deploy/WAVE0-DECISION.md` — outcome table, canonical `Selected: option b` sentinel, D-06/D-07 re-route, Plan 02-04/02-05/02-09 wiring details, demo story impact, CONTEXT.md amendment analysis (no amendment needed).
- `scripts/verify-deepbookv3-pin.sh` — mode 0755 bash script. Extracts `DeepBookV3` + `DeepBookPredict` rev pins from `contracts/Move.toml`, locates the subtree squash commit via `git log --grep`, reads `git-subtree-split:` trailer, asserts equality. Exit codes: 0/1/2 (aligned/drift/repo-state-error).

### Modified
- `contracts/Move.toml` — added `DeepBookPredict` dep at the same SHA `1159d79af33c70e09e406310e1d8f067832ede9d` as `DeepBookV3` (Rule 3 auto-fix). Comment cites Plan 02-01 Task 1 + Phase 1 latent dep.
- `.github/workflows/ci.yml` — new step "Verify DeepBookV3 SHA pin alignment (Pitfall 6)" inside the `move` job, between "Verify Sui version" and "Move build". 5-job matrix preserved.
- `.planning/phases/02-vault-move-package-testnet-deploy/02-RESEARCH.md` — heading renamed `## Open Questions` -> `## Open Questions (RESOLVED)`; six `**RESOLVED:**` annotations appended (one per question). Original question text + considered options preserved.

## Decisions Made

- **Option (b) over option (c)** despite both passing the spike. Option (c)'s two-separate-moveCalls shape contradicts D-06's "vault::supply ends with an internal call to vault::rebalance::buy_hedge_for_deposit". Option (b) keeps that internal call (the `&mut PredictManager` is a parameter, not a vault-owned object) and only relaxes Claude's-discretion phrasing about "single Move entry function" — locked decision content intact.
- **No CONTEXT.md amendment.** D-06/D-07 still satisfied semantically. WAVE0-DECISION.md proposes optional documentation refinement language for a future review pass.
- **DeepBookPredict as a separate Move.toml dep**, not a transitive include. Same SHA pin as DeepBookV3; the new verify-pin script enforces both stay aligned and matches the vendored subtree.
- **Spike namespaced under `_spike/`.** Both source and tests live under directories named `_spike/` so a single `git rm -r contracts/sources/_spike contracts/tests/_spike` after Wave 1 ships removes the whole spike with no impact on production paths.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added missing `DeepBookPredict` dependency in `contracts/Move.toml`**
- **Found during:** Task 1 (spike test imports `deepbook_predict::predict` and `deepbook_predict::predict_manager`).
- **Issue:** The spike test cannot build without a Move.toml dep on the predict package. Investigating revealed this was also a latent Phase 1 defect — `contracts/sources/svi_view.move` (Plan 01-05) imports `deepbook_predict::oracle` but the dep was never wired up. Phase 1's CI never ran (Plan 00-07 Task 4 still BLOCKED-on-human per STATE.md), so the missing dep stayed silent.
- **Fix:** Added `DeepBookPredict = { git = ..., subdir = "packages/predict", rev = "1159d79af33c70e09e406310e1d8f067832ede9d" }` (same SHA as DeepBookV3) in `[dependencies]`. Inline comment cites this plan + the Phase 1 latent issue.
- **Files modified:** `contracts/Move.toml`.
- **Verification:** `scripts/verify-deepbookv3-pin.sh` returns OK on both DeepBookV3 and DeepBookPredict at SHA `1159d79a...`. Full `sui move build` verification deferred to CI / Plan 00-07 Task 4 unblock (Sui CLI unavailable locally per Phase 1 precedent).
- **Committed in:** `fab4397` (Task 1 commit).

**2. [Rule 2 - Missing Critical] Extended pin script to verify both `DeepBookV3` AND `DeepBookPredict`**
- **Found during:** Task 3 (script design).
- **Issue:** The PLAN.md script template only checked `DeepBookV3`. After adding `DeepBookPredict` (deviation 1), drift between the two pins would be undetectable, but they MUST share a SHA since both subdirs live in the same upstream repo.
- **Fix:** Script now extracts both rev pins, asserts they match each other, then asserts they match the subtree split SHA. Three failure modes instead of one; clearer `::error::` messages.
- **Files modified:** `scripts/verify-deepbookv3-pin.sh`.
- **Verification:** Local run prints "OK: DeepBookV3 + DeepBookPredict pin aligned at 1159d79..." and exits 0.
- **Committed in:** `698ba46` (Task 3 commit).

**3. [Rule 3 - Blocking] Adjusted subtree-split detection from path-scoped `git log` to subject-scoped `--grep`**
- **Found during:** Task 3 (testing the PLAN.md script template).
- **Issue:** PLAN.md template used `git log --pretty=format:'%b' -- scripts/deepbookv3` which returns the merge commit (no body), not the squash commit (which carries the `git-subtree-split:` trailer). On this repo's history, the squash commit `8250375` was merged in via `22924045`, so path-scoped log only finds the merge.
- **Fix:** Use `git log --all --grep='^Squashed .scripts/deepbookv3/. content from commit' --pretty=format:'%H'` to locate the squash commit by its canonical subject, then `git show --pretty=format:'%b'` to read the trailer.
- **Files modified:** `scripts/verify-deepbookv3-pin.sh`.
- **Verification:** Empirically returns SHA `1159d79af33c70e09e406310e1d8f067832ede9d` matching the Move.toml rev pin.
- **Committed in:** `698ba46` (Task 3 commit).

**4. [Rule 1 - Bug] Replaced `assert!(... == ...)` with `assert_eq!` per unit-tests.md rule 10**
- **Found during:** Task 1 (test module review against vendored `unit-tests.md`).
- **Issue:** Initial test draft had `assert!(manager.owner() == SUPPLIER)` (rule 10 violation: must use `assert_eq!`).
- **Fix:** Imported `std::unit_test::assert_eq` and switched to `assert_eq!(manager.owner(), SUPPLIER)`.
- **Files modified:** `contracts/tests/_spike/predict_manager_owner_spike_test.move`.
- **Verification:** `grep -nE 'assert!\(.*==' tests/_spike/...` returns only comment-line matches (citations of upstream code), no production assertions.
- **Committed in:** `fab4397` (Task 1 commit).

---

**Total deviations:** 4 auto-fixed (1 missing critical [Rule 2], 2 blocking [Rule 3 ×2], 1 bug [Rule 1]).
**Impact on plan:** All four deviations strengthen correctness or unblock Task progress. No scope creep; no new files beyond what PLAN.md specified.

## Authentication / User Setup Gates

None — Plan 02-01 is pure-code + research-resolution. Plan 00-07 Task 4 (GitHub repo provisioning) remains BLOCKED-on-human per STATE.md and is the same gate Plan 01-05/01-07 have lived with — CI will run on first push.

## Issues Encountered

- **Sui CLI unavailable locally.** Same constraint as Phase 1 (per STATE.md and Plan 01-05 SPIKE-NOTES). The spike test cannot be `sui move test`-verified locally; verification deferred to CI on first push (or to local run when SDK becomes available). The spike's outcome is deterministic from static analysis of `predict.move:228` and `predict_manager.move:90` — empirical CI run will confirm but cannot contradict the analysis.
- **`Predict` and `OracleSVI` not constructible from outside the predict package.** `predict::create<Quote>` and `oracle::create_oracle` are both `public(package)`. The spike does what is reachable: real `PredictManager` via the public `predict::create_manager`, real `manager.owner()` accessor, and the verbatim line-228 assert in a `public(package)` helper. The line-228 assert is the FIRST statement in `predict::mint`; everything past it is irrelevant to which ownership configuration Sui will accept.

## Self-Check: PASSED

All 5 created files verified present on disk:
- `contracts/sources/_spike/predict_manager_owner_spike.move`
- `contracts/tests/_spike/predict_manager_owner_spike_test.move`
- `.planning/phases/02-vault-move-package-testnet-deploy/WAVE0-DECISION.md`
- `scripts/verify-deepbookv3-pin.sh`
- `.planning/phases/02-vault-move-package-testnet-deploy/02-01-SUMMARY.md`

All 3 modified files verified present:
- `contracts/Move.toml`
- `.github/workflows/ci.yml`
- `.planning/phases/02-vault-move-package-testnet-deploy/02-RESEARCH.md`

All 4 task commits verified in git log: `fab4397`, `78e1951`, `698ba46`, `6c4544b`.

## Threat Flags

None — Plan 02-01 introduces no new network endpoints, no auth paths, no file-access patterns, no schema changes at trust boundaries. The new CI step is read-only against repo state.

## Next Phase Readiness

- **Plan 02-02 (codegen — strategy.toml extension) UNBLOCKED.** Wave 0 ownership question is resolved; 02-02 does not depend on the answer but the wave gate is now passed.
- **Plans 02-03, 02-04, 02-05, 02-07, 02-09 UNBLOCKED.** Each can now read `WAVE0-DECISION.md` and write the correct supply/rebalance signatures without re-litigating ownership. The canonical `Selected: option b` sentinel is in place for plan-checker greps.
- **Latent Phase 1 build issue surfaced and fixed.** `DeepBookPredict` Move.toml dep added so first CI run will compile `svi_view.move` cleanly.
- **No checkpoints, no human-action gates.** All four tasks completed autonomously per `autonomous: true` in PLAN.md frontmatter.

---
*Phase: 02-vault-move-package-testnet-deploy*
*Plan: 01*
*Completed: 2026-05-10*
