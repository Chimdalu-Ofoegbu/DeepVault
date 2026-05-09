---
phase: 00-setup-ground-rules
plan: 06
subsystem: docs
tags: [policy-locks, hedge-policy, code-freeze, mainnet-funding, contributing, adr, pitfall-2, pitfall-14, pitfall-18, pitfall-19]

# Dependency graph
requires: [00-01, 00-02, 00-03, 00-05]
provides:
  - "CONTRIBUTING.md at repo root with five hard policy locks: code freeze 2026-05-30, no-refactor-after-vault-ships (Pitfall 18), no-dashboard-before-vault-feature-complete (Pitfall 19), hedge-ratio policy summary, weekly Monday Predict sweep ritual"
  - "CONTRIBUTING.md branch strategy (main only, push direct, CI required-status-check) and editing-generated-code workflow (make codegen + paired ADR update for [hedge_policy] changes)"
  - "CONTRIBUTING.md ship-date hard locks table: 2026-05-30 (code freeze), 2026-06-12 (mainnet smoke deadline), 2026-06-13..2026-06-15 (demo recording), 2026-06-16 (submission)"
  - "docs/HEDGE-POLICY.md — full ADR with Status:Locked header, decision table mapping each parameter to its shared/strategy.toml [hedge_policy] field, per-parameter rationale, walk-forward re-tuning policy gated to Phase 3, permanent freeze at Phase 3 close (~2026-05-29), alternatives considered (5%/20%, -10%/-20%, 7d/30d, dynamic v1)"
  - "docs/MAINNET-FUNDING.md — Phase 5 mechanical playbook: two-wallet setup with SUI_CONFIG_DIR isolation (D-06), $80 budget breakdown (D-07: $50 USDsui + $15 gas + $15 buffer), Cetus DEX swap path (D-08), Step 1-4 deploy flow (fund SUI → swap to USDsui → preflight + publish → smoke test), $30-buffer-tight risk flag with $150 top-up trigger, DEPLOY-09 contingency (predict_mainnet_shipped flag), AdminCap discipline, demo-recording wallet hygiene"
  - "Three-file number parity: allocation_bps=1000, strike_otm_bps=1500, tenor_seconds=1209600, roll_trigger_seconds=172800, sizing_function=\"fixed\" all appear verbatim in CONTRIBUTING.md AND docs/HEDGE-POLICY.md AND shared/strategy.toml"
affects: [00-07, 00-08, phase-1, phase-2, phase-3, phase-4, phase-5, phase-6]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Policy-as-code: locked numeric parameters live in shared/strategy.toml as the source of truth, are summarized human-readably in CONTRIBUTING.md, and are fully justified in docs/HEDGE-POLICY.md ADR — three-way parity is grep-verifiable"
    - "ADR pattern with Status header + Decision table + per-parameter Rationale section + Re-tuning policy + Alternatives considered + Cross-references + Change log (Gatheral-style, institutional-LP-grade for the hedge-ratio doc)"
    - "Phase 5 deploy as mechanical playbook: every command is paste-ready with SUI_CONFIG_DIR=~/.sui/sui_config_mainnet prefixed, every captured output field maps to a config/mainnet.toml [section] field, eliminating decisions during high-pressure mainnet deploy"
    - "Hard-lock dates appear verbatim across CONTRIBUTING.md AND ROADMAP.md (T-00-24 mitigation: prevents 'end of May' misremembering of 2026-05-30 code-freeze date)"
    - "POLICY: commit-message prefix convention introduced: changes to [hedge_policy] fields require both shared/strategy.toml + regenerated constants AND a paired update to docs/HEDGE-POLICY.md ADR Decision section"

key-files:
  created:
    - CONTRIBUTING.md
    - docs/HEDGE-POLICY.md
    - docs/MAINNET-FUNDING.md
  modified: []

key-decisions:
  - "CONTRIBUTING.md lives at repo root (not docs/) — GitHub auto-surfaces it on PR templates and the root README. The two longer policy ADRs (HEDGE-POLICY.md, MAINNET-FUNDING.md) live in docs/ to keep root tidy; CONTRIBUTING.md cross-references them so a contributor can drill from summary to full rationale in one click."
  - "Hedge-ratio table in CONTRIBUTING.md uses BOTH the human-readable percentages (10%, -15%, 14 days) AND the verbatim shared/strategy.toml field-and-value strings (allocation_bps = 1000, etc.). This satisfies Plan 00-06 acceptance criteria for both readability AND grep parity, and gives reviewers a single-line cross-check to shared/strategy.toml without leaving CONTRIBUTING.md."
  - "HEDGE-POLICY.md Status header uses 'Locked' (not 'Proposed' or 'Draft'). Per Plan 00-06 acceptance criteria, the doc must mark itself locked at commit time — not 'pending review'. Permanent freeze date stated as '~2026-05-29' to acknowledge the day-before-code-freeze alignment without tying to a specific Phase 3 close hour."
  - "Re-tuning methodology in HEDGE-POLICY.md prescribes a specific walk-forward protocol: 60-day rolling in-sample, 14-day out-of-sample, final 30% held-out validation. This locks Phase 3 backtest discipline before Phase 3 starts — Pitfall 2 mitigation strengthened beyond CONTEXT.md's general 'walk-forward analysis' phrasing."
  - "MAINNET-FUNDING.md Step 2 includes a USDsui type-tag verification note ('shape 0x{USDSUI_PACKAGE}::usdsui::USDSUI; capture exact value at swap time'). This preempts a Phase 5 ambush where the swap completes but the type tag in config/mainnet.toml [assets] quote_type_tag is still TBD — preflight would fail. The note tells Phase 5 to capture the tag DURING the swap, not after."
  - "Demo-recording wallet section in MAINNET-FUNDING.md documents D-09 (CONTEXT.md) explicitly: ephemeral keypair generated at recording time, funded with ~$10 SUI + ~$10 USDsui from deploy wallet via single transfer. Cleaner than reusing the deploy wallet (which holds AdminCap and could leak in a recording mistake)."
  - "AdminCap recorded in config/mainnet.toml [deepvault] treasury_cap_holder field per the existing Plan 00-04 schema. MAINNET-FUNDING.md flags this as a Pitfall 14 mitigation: holding the cap in a known wallet means Move-package upgrade authority is auditable and recoverable, not lost in a forgotten ephemeral keypair."
  - "POLICY: commit-prefix discipline introduced in CONTRIBUTING.md §'Editing generated code'. Changing any [hedge_policy] field requires (a) edit shared/strategy.toml, (b) make codegen, (c) update docs/HEDGE-POLICY.md ADR Decision section, (d) commit-message prefix 'POLICY:'. This adds a second human gate beyond CI codegen-drift — a reviewer (even self-review) must consciously confirm the ADR is updated."

patterns-established:
  - "Three-way number parity for locked policy parameters: (1) source of truth in shared/strategy.toml, (2) human-readable summary in CONTRIBUTING.md, (3) full ADR in docs/HEDGE-POLICY.md. Cross-grep verification is the gate (grep -l on each value returns all three files)."
  - "ADR cross-reference convention: short-form policy locks in CONTRIBUTING.md link to long-form ADRs in docs/, ADRs link back to CONTEXT.md decision IDs (D-01..D-09) for original capture, and ADRs link to PITFALLS.md sections for the rationale-of-rationale (why this lock matters)."
  - "Mechanical playbook structure for high-pressure execution: Step N includes (a) the exact paste-ready command with environment-variable prefix, (b) what to capture from the output, (c) where the captured value goes in config, (d) expected gas/cost. Eliminates in-the-moment decisions."

requirements-completed: [SETUP-06, SETUP-07]

# Metrics
duration: 4min
completed: 2026-05-09
---

# Phase 0 Plan 06: CONTRIBUTING.md + HEDGE-POLICY.md + MAINNET-FUNDING.md Summary

**Three policy documents committed end-to-end, locking the strategy against hindsight tuning and turning the Phase 5 mainnet redeploy into a mechanical playbook. CONTRIBUTING.md at repo root documents all five hard policy locks (code freeze 2026-05-30, no-refactor-after-vault-ships per Pitfall 18, no-dashboard-before-vault per Pitfall 19, hedge-ratio summary with verbatim shared/strategy.toml field values, weekly Monday Predict sweep) plus branch strategy, editing-generated-code workflow with POLICY: commit-prefix discipline, and the ship-date hard-locks table (2026-05-30 / 2026-06-12 / 2026-06-13..15 / 2026-06-16). docs/HEDGE-POLICY.md is a full ADR (Status: Locked, decision table mapping each parameter to its [hedge_policy] field, per-parameter rationale, walk-forward re-tuning policy gated to Phase 3 with held-out 30% validation, permanent freeze at ~2026-05-29, alternatives considered, change log). docs/MAINNET-FUNDING.md is a four-step mechanical Phase 5 playbook (CEX→SUI→Cetus→USDsui→preflight+publish→smoke test) with $80 budget breakdown, $30-buffer-tight risk flag with $150 top-up trigger, DEPLOY-09 contingency for un-shipped Predict mainnet, AdminCap discipline, and demo-recording wallet hygiene. Cross-grep parity verified: all five locked numbers (allocation_bps=1000, strike_otm_bps=1500, tenor_seconds=1209600, roll_trigger_seconds=172800, sizing_function=\"fixed\") appear verbatim in CONTRIBUTING.md AND docs/HEDGE-POLICY.md AND shared/strategy.toml. SETUP-06 + SETUP-07 satisfied; ROADMAP Phase 0 success criterion #4 verbatim text present in CONTRIBUTING.md.**

## Performance

- **Duration:** ~4 min (paste-ready content + verification + commits)
- **Started:** 2026-05-09T05:12:41Z
- **Completed:** 2026-05-09T05:16:54Z
- **Tasks:** 3 of 3 (no deferrals, no checkpoints, no deviations)
- **Files created:** 3
- **Files modified:** 0

## Accomplishments

- **CONTRIBUTING.md committed at repo root (123 lines).** Five hard policy locks present in §1-§5: (1) Code freeze 2026-05-30 with explicit allowed-after-freeze list (bug fixes with linked Issue, integration glue, docs/README/demo-script edits, mainnet deploy + smoke-test code) and forbidden-after-freeze list (vault:: core architecture, new features, public-API renames, "for cleanliness" refactors); (2) No refactor after vault ships with the "does this unblock a specific feature?" test and 2-day cap on `refactor/*` branches (Pitfall 18); (3) No dashboard before vault feature-complete with explicit ordering "vault → backtest → SVI → composition → dashboard → submission" (Pitfall 19); (4) Hedge-ratio policy locked with the full table including BOTH human-readable values (10%, -15%, 14 days) AND the shared/strategy.toml field strings verbatim (`allocation_bps = 1000`, `strike_otm_bps = 1500`, `tenor_seconds = 1209600`, `roll_trigger_seconds = 172800`, `sizing_function = "fixed"`); (5) Weekly Monday Predict sweep with the 5-step blocking-issue protocol (label, halt, update predict_adapter, re-run integration, resume on green) and the .predict-diff-state advances-only-on-human-triage discipline. Plus: branch strategy (main only, push direct, CI required-status-check on default), editing-generated-code workflow (4-step process + POLICY: commit-prefix for [hedge_policy] changes), commit-log conventions (≤72-char imperative subjects, REQ-ID references, POLICY: prefix), build-log discipline (append-only weekly bullets), ship-date hard-locks table (2026-05-30 / 2026-06-12 / 2026-06-13..15 / 2026-06-16), and a References section linking docs/HEDGE-POLICY.md, docs/MAINNET-FUNDING.md, docs/DEV-BOOTSTRAP.md, .planning/research/PITFALLS.md, .planning/ROADMAP.md.

- **docs/HEDGE-POLICY.md committed (95 lines).** Header block: Status: Locked, Locked: 2026-05-09 (Phase 0), Next review: Phase 3 backtest, Permanent freeze: Phase 3 close (~2026-05-29), Owner: DeepVault solo builder. Context section explains the doc-before-backtest rule with explicit Pitfall 2 cross-reference. Decision table maps all five parameters to their `shared/strategy.toml [hedge_policy]` field-name-and-value strings AND human-readable values (10% / -15% OTM / 14 days / Expiry < 2 days / Fixed v1). Build-time flow documented: shared/strategy.toml → scripts/codegen.py → contracts/sources/strategy_constants.move + backtest/src/deepvault/strategy_constants.py + dashboard/src/lib/strategy_constants.ts. Per-parameter rationale section: 10% allocation = "preserves >85% of PLP APY in normal regimes" + DOV-class institutional-norm framing; -15% OTM = "pays on -2σ to -3σ weekly BTC moves" + tighter-vs-wider tradeoff; 14-day tenor + <2-day roll = vol-decay vs transaction-cost vs overlap-complexity tradeoffs explicit; Fixed v1 = "correct fixed > buggy dynamic" with sizing_function-as-future-swap-point note. Re-tuning policy section prescribes specific walk-forward protocol: (1) 60-day rolling in-sample, (2) 14-day out-of-sample, (3) walk forward, (4) final 30% held-out validation. Specifically forbidden: re-tuning after testnet stress, re-tuning after mainnet smoke, "polishing for the demo video". Alternatives considered enumerates 5%/20% allocation, -10%/-20% strike, 7-day/30-day tenor, dynamic v1 — each with one-line rejection rationale. Cross-references back to shared/strategy.toml, scripts/codegen.py, PITFALLS.md Pitfall 2, research/SUMMARY.md Hard Policy Locks #10, CONTRIBUTING.md §"Hedge-ratio policy is locked", and CONTEXT.md D-01..D-05. Change log table seeded with the initial-lock entry; "After Phase 3 close, this section is closed" stamp.

- **docs/MAINNET-FUNDING.md committed (134 lines).** Wallets table per CONTEXT.md D-06: testnet dev wallet (`~/.sui/sui_config/sui.keystore`, default) vs mainnet deploy wallet (`~/.sui/sui_config_mainnet/sui.keystore`, set `SUI_CONFIG_DIR` when invoking). Key safety section: keystores in `~/`, .gitignore excludes `.sui/` + `**/.sui/` + `sui_config*/` + `*.keystore`, encrypted-external-storage backup mandate before any mainnet activity, mnemonic-only-in-password-manager rule. Funding flow Step 1 (~$30 SUI to mainnet wallet via CEX, confirmed via `sui client gas`); Step 2 (~$50 USDsui via Cetus DEX swap with the type-tag verification note flagging the `0x{USDSUI_PACKAGE}::usdsui::USDSUI` shape and `config/mainnet.toml [assets] quote_type_tag` capture point); Step 3 (~$15 gas, preflight via `scripts/preflight.sh` asserting all TBDs filled + Move.toml/mainnet-config alignment + golden vectors green + Predict pkg pinned + Margin pkg pinned + full Move test suite + Python parity tests, then `sui client publish --gas-budget 1000000000 contracts/` with all four output captures mapped to `[deepvault]` config fields); Step 4 (smoke test = supply 50 USDsui → buy_hedge_for_deposit → redeem_request 50% → wait token-bucket → redeem_fulfill, NAV-per-share post-cycle within tolerance of pre-cycle, deadline 2026-06-12 = Day 36). Risk Flag section: $30 buffer is tight, four redeploy triggers enumerated (Predict churn, config bug, USDsui slippage, second `sui client publish` retry), top-up-to-$150-before-Day-36 mandate. Contingency section per DEPLOY-09 / D-09: if Predict mainnet not shipped by 2026-06-09 set `predict_mainnet_shipped = false` in `[contingency]`, fallback per ROADMAP P5 success criterion #4 ("vault + Margin path on mainnet, testnet-only Predict path"), demo-video adjustment, README documentation. Demo recording section: mainnet vault + mainnet wallet (Hard Policy Lock #7), ephemeral third keypair option per D-09, tx digest pasteable into suiscan.xyz/mainnet/home, Vite dev server is recording target per D-14. Post-submission section: deploy wallet keeps residual SUI, AdminCap location recorded in `config/mainnet.toml [deepvault] treasury_cap_holder` per Pitfall 14, upgrade cap covered by DEPLOY-09 contingency.

## Cross-Grep Verification (three-file parity)

All five locked policy values appear verbatim in CONTRIBUTING.md AND docs/HEDGE-POLICY.md AND shared/strategy.toml:

```
$ grep -l "allocation_bps = 1000" CONTRIBUTING.md docs/HEDGE-POLICY.md shared/strategy.toml
CONTRIBUTING.md
docs/HEDGE-POLICY.md
shared/strategy.toml

$ grep -l "strike_otm_bps = 1500" CONTRIBUTING.md docs/HEDGE-POLICY.md shared/strategy.toml
CONTRIBUTING.md
docs/HEDGE-POLICY.md
shared/strategy.toml

$ grep -l "tenor_seconds = 1209600" CONTRIBUTING.md docs/HEDGE-POLICY.md shared/strategy.toml
CONTRIBUTING.md
docs/HEDGE-POLICY.md
shared/strategy.toml

$ grep -l "roll_trigger_seconds = 172800" CONTRIBUTING.md docs/HEDGE-POLICY.md shared/strategy.toml
CONTRIBUTING.md
docs/HEDGE-POLICY.md
shared/strategy.toml

$ grep -l 'sizing_function = "fixed"' CONTRIBUTING.md docs/HEDGE-POLICY.md shared/strategy.toml
CONTRIBUTING.md
docs/HEDGE-POLICY.md
shared/strategy.toml
```

T-00-23 (hedge-policy-numbers-drift) mitigation in place: any future numeric change to one of these files that fails to land in the other two will be caught by the next grep audit (and Plan 00-07's CI codegen-drift job catches strategy.toml/generated drift independently).

## Verbatim phrase confirmations

- "2026-05-30" — present in CONTRIBUTING.md (§1 Code freeze heading + §"Ship-date hard locks" table). T-00-24 mitigation in place.
- "fixed-ratio v1" — present in CONTRIBUTING.md §4 Hedge-ratio policy ("Locked numbers (v1, fixed-ratio v1)").
- "Fixed (v1)" — present in docs/HEDGE-POLICY.md Decision table sizing-function row.
- "Status: Locked" header — present in docs/HEDGE-POLICY.md.
- "Permanent freeze" — present in docs/HEDGE-POLICY.md (Re-tuning policy section + footer).
- "Pitfall 2" — present in docs/HEDGE-POLICY.md (Context + Re-tuning policy sections).
- "Pitfall 14" — present in docs/MAINNET-FUNDING.md (Step 3 preflight + Post-submission AdminCap sections).
- "Pitfall 18" — present in CONTRIBUTING.md §2.
- "Pitfall 19" — present in CONTRIBUTING.md §3.
- "predict_mainnet_shipped" — present in docs/MAINNET-FUNDING.md Contingency section.
- "Cetus" — present in docs/MAINNET-FUNDING.md Step 2 + heading.
- "SUI_CONFIG_DIR=~/.sui/sui_config_mainnet" — present in docs/MAINNET-FUNDING.md (Wallets table + Steps 1, 2, 3).
- "AdminCap" — present in docs/MAINNET-FUNDING.md (Step 3 capture list + Post-submission section).
- "preflight" — present in docs/MAINNET-FUNDING.md (Step 3 + Risk Flag retry trigger).
- "config/mainnet.toml" — present in docs/MAINNET-FUNDING.md (Step 2 type-tag note + Step 3 capture-mapping list + Contingency + Post-submission + References).
- "Day 36" / "2026-06-12" — both present in docs/MAINNET-FUNDING.md (Step 4 deadline + Risk Flag top-up trigger).
- "$50 USDsui" / "$15" / "$150" / "~$80" — all present in docs/MAINNET-FUNDING.md.

## Task Commits

Each task was committed atomically:

1. **Task 1: Write CONTRIBUTING.md (code freeze + policy locks)** — `de1d70f` (docs)
2. **Task 2: Write docs/HEDGE-POLICY.md (full ADR)** — `55c45b9` (docs)
3. **Task 3: Write docs/MAINNET-FUNDING.md (Phase 5 deploy playbook)** — `254b0ad` (docs)

**Plan metadata commit (after this SUMMARY):** to follow.

## Files Created/Modified

- `CONTRIBUTING.md` (created) — 123-line policy-lock document at repo root with five hard locks, branch strategy, editing-generated-code workflow, ship-date hard-locks table, references
- `docs/HEDGE-POLICY.md` (created) — 95-line ADR with Status:Locked header, decision table, per-parameter rationale, walk-forward re-tuning policy, permanent-freeze stamp, alternatives, cross-references, change log
- `docs/MAINNET-FUNDING.md` (created) — 134-line mechanical Phase 5 playbook with two-wallet setup, $80 budget breakdown, Cetus DEX swap path, four-step deploy flow, $30-buffer-tight risk flag with $150 top-up trigger, DEPLOY-09 contingency, AdminCap discipline, demo-recording wallet hygiene, post-submission notes

## Decisions Made

See frontmatter `key-decisions` for the full list. The most consequential decisions were:

- **Three-way parity by design.** All five locked numbers appear verbatim in three files (shared/strategy.toml as source-of-truth, CONTRIBUTING.md as summary, docs/HEDGE-POLICY.md as ADR). Future drift is grep-catchable.
- **Walk-forward protocol prescribed in HEDGE-POLICY.md.** Beyond CONTEXT.md's general "walk-forward" phrasing, the ADR commits to specific window sizes (60-day in-sample, 14-day out-of-sample, 30% held-out validation). Phase 3 backtest discipline is locked before Phase 3 starts.
- **POLICY: commit-prefix discipline.** Changes to [hedge_policy] fields require both the codegen update AND a paired ADR Decision-section update; the commit-message prefix forces a second human gate beyond CI codegen-drift.

## Deviations from Plan

None — plan executed exactly as written. Paste-ready content from the plan was committed verbatim with no Rule 1/2/3 auto-fixes triggered. All grep verification commands in `<verify>` blocks passed on first run for each task.

## Notes for Plan 00-07

Plan 00-07 wires CI (`.github/workflows/ci.yml`) with a `codegen-drift` job among others. That job's failure message should point users at CONTRIBUTING.md §"Editing generated code" (the 4-step regenerate-and-commit-together workflow + POLICY: prefix rule). The error-message string can use the literal anchor `CONTRIBUTING.md#editing-generated-code` (GitHub auto-anchors on H2 headings).

Plan 00-07 should also assert in CI that `2026-05-30` literally appears in CONTRIBUTING.md (T-00-24 mitigation hardened: code-freeze date can never be silently relaxed via doc edit).

## Self-Check: PASSED

- [x] CONTRIBUTING.md exists at repo root (`test -f CONTRIBUTING.md` returns true)
- [x] docs/HEDGE-POLICY.md exists (`test -f docs/HEDGE-POLICY.md` returns true)
- [x] docs/MAINNET-FUNDING.md exists (`test -f docs/MAINNET-FUNDING.md` returns true)
- [x] Commit `de1d70f` exists in `git log` (Task 1)
- [x] Commit `55c45b9` exists in `git log` (Task 2)
- [x] Commit `254b0ad` exists in `git log` (Task 3)
- [x] All Task 1 grep checks passed (17 patterns)
- [x] All Task 2 grep checks passed (15 patterns)
- [x] All Task 3 grep checks passed (15 patterns)
- [x] Three-way number parity verified for all five locked values
