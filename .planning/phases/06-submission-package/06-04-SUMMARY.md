---
phase: 06-submission-package
plan: 04
subsystem: docs
tags: [demo-script, storyboard, deploy-05, honesty-bar, pitfall-3, human-action-checkpoint, ephemeral-key]

# Dependency graph
requires:
  - phase: 06-submission-package (Plan 06-01)
    provides: NUMBERS-CANONICAL.md (window-labeled figures the script's LD-1 guardrail points at) + docs/architecture.svg (the composability-callout visual)
  - phase: 06-submission-package (Plan 06-03)
    provides: README.md honest demo-scope framing (mirrored verbatim into the script)
  - phase: 05-testnet-demo-hardening
    provides: docs/MAINNET-READINESS.md (sidebar source) + scripts/testnet-smoke-test.sh + Makefile demo target (make demo)
  - phase: 02-vault-move-package-testnet-deploy
    provides: TESTNET-DEPLOY.json real deployed addresses (package/vault/deploy-tx shown on suiscan)
provides:
  - "docs/DEMO-SCRIPT.md — film-ready shot-by-shot ~3-min storyboard for the make-demo flow (supply + real on-chain hedge mint + redeem, 7 checkpoints, tx digest on suiscan, dual +/-10 bps verdict)"
  - "Honest two-protocol-PTB framing: mock-proven via mock_margin_pool / live-on-testnet pending DUSDC Margin pool; explicit FORBIDDEN guardrail on any live LoanBorrowed shot"
  - "~10s mainnet-readiness sidebar narration sourced from docs/MAINNET-READINESS.md"
  - "Pre-recording checklist + 1h-cooldown cut/timelapse plan + ephemeral-key hygiene (no embedded secret)"
affects: [DEPLOY-05 recording (held human-action), Plan 06-05 Devpost filing (consumes the recorded video URL)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Honesty-bar discipline (LD-1) for video: the only on-screen quantitative figures are the live run's own ratio_bps/nav_delta_bps; backtest numbers explicitly barred from being narrated as the demo's output (guardrail G2)"
    - "No-capability-overclaim (Pitfall 3 / T-06-10): two-protocol Margin PTB filmed only over the architecture SVG / passing mock_margin_pool test; live LoanBorrowed shot FORBIDDEN in three places"
    - "Ephemeral-key hygiene (T-06-09): demo wallet is a faucet-funded throwaway; SUI_PRIVATE_KEY always a placeholder/masked; script embeds no key/seed/mnemonic"
    - "Every filmed command traces to a committed repo path (make demo -> testnet-smoke-test.sh; addresses -> TESTNET-DEPLOY.json; sidebar -> MAINNET-READINESS.md)"

key-files:
  created:
    - docs/DEMO-SCRIPT.md
    - .planning/phases/06-submission-package/06-04-SUMMARY.md
  modified: []

key-decisions:
  - "Storyboarded ONLY the honestly-filmable make-demo flow (supply + real on-chain Predict hedge mint + redeem); the two-protocol Margin PTB is framed as mock-proven/pending and a live LoanBorrowed shot is marked FORBIDDEN in the lead note, in shot 6's ON SCREEN + ACTION cells, and in guardrail G1 (Pitfall 3 / T-06-10)"
  - "Added guardrail G2 (LD-1 for video): the only numbers shown on camera are the live run's ratio_bps/nav_delta_bps from the checkpoint-7 dual gate; backtest figures (+7.52% full-window / -2.30% OOS) are explicitly barred from narration-as-demo-output and pointed to NUMBERS-CANONICAL.md as their proper home — this is the MEMORY 'verify runtime not spec' discipline applied to the camera"
  - "Held the recording as a checkpoint:human-action (autonomous: false) rather than fabricating a recorded status — recording needs a human + funded testnet wallet on camera, which the executor cannot do; auto_advance does NOT auto-approve human-action gates (only human-verify/decision)"
  - "1h REDEMPTION_COOLDOWN_MS handled with an explicit cut-&-resume (recommended) vs pre-run-&-narrate plan + an on-screen 'timelapsed' caption requirement, so the hour is never filmed live nor implied instant"
  - "Used the exact deployed testnet objects from TESTNET-DEPLOY.json verbatim (package 0xbc9aaeaa..., vault 0x2824d97e..., deploy tx ETYPnLemp...) plus the live supply-tx-digest paste target; mirrored README's honest demo-scope wording for consistency"

patterns-established:
  - "Demo-script acceptance = films make demo + walks the 7 checkpoints + the dual gate (ratio_bps/nav_delta_bps) + the pasteable suiscan tx-digest shot + two-protocol PTB scoped mock-proven/pending (no live LoanBorrowed) + ~10s MAINNET-READINESS sidebar + cooldown cut plan + no embedded secret — verified mechanically"

requirements-completed: []

# Metrics
duration: 8min
completed: 2026-06-15
---

# Phase 6 Plan 04: Demo-Video Script (DEPLOY-05 artifact) Summary

**One-liner:** Shipped `docs/DEMO-SCRIPT.md` — a film-ready ~3-minute shot-by-shot storyboard for the
honestly-real `make demo` testnet flow (supply + a **real on-chain Predict hedge mint** + redeem, the
7 staged checkpoints, the supply tx digest pasted into suiscan, the dual ±10 bps verdict), with the
two-protocol Margin PTB scoped as mock-proven/live-on-testnet-pending (no live `LoanBorrowed` shot)
and a ~10 s mainnet-readiness sidebar — then **held the recording itself as a `human-action`
checkpoint** for the user (funded testnet wallet on camera).

## What this plan delivered

The autonomous artifact task (Task 1) is **complete and committed**. The recording task (Task 2,
`checkpoint:human-action`) is **held, not performed** — see "Held checkpoint" below.

`docs/DEMO-SCRIPT.md` contains:

- **A lead "read this first" note** establishing the single honesty rule: no live two-protocol Margin
  PTB shot (Pitfall 3), because there is no DUSDC Margin pool on testnet.
- **The exact filmed command** (`SUI_PRIVATE_KEY=<ephemeral> ORACLE_SVI_ID=<BTC-USD OracleSVI> make
  demo`), the 50-DUSDC amount, the 7-checkpoint table, and the real testnet objects (package / vault /
  deploy-tx) with their suiscan URLs plus the live supply-tx-digest paste target.
- **A 7-shot timestamped storyboard** (0:00–3:00), each shot a 3-column row (ON SCREEN / NARRATION /
  ACTION-COMMAND): cold open (laypitch + composability thesis) → setup → supply + real hedge mint
  (checkpoints 1–3, digest pasted into `suiscan.xyz/testnet/tx/<digest>` on camera, wallet −50 DUSDC)
  → redeem with the cooldown cut (checkpoints 4–6) → verdict (checkpoint 7 dual gate showing live
  `ratio_bps` / `nav_delta_bps`) → composability callout (the 5-call PTB over the SVG / `mock_margin_pool`
  test, never a live tx) → ~10 s mainnet-readiness sidebar.
- **A "do NOT film the 1-hour cooldown live" section** (cut-&-resume vs pre-run-&-narrate).
- **A "Pre-recording checklist"** (funded throwaway wallet ≥ 60 DUSDC + gas, ephemeral
  `SUI_PRIVATE_KEY` exported off-camera, `ORACLE_SVI_ID` resolved, deploy JSON `deployed`, dashboard
  running, suiscan tab, wallet visible, recorder + mic, cooldown plan, dry run).
- **A "Honesty guardrails" box** restating G1 (no live `LoanBorrowed` — Pitfall 3 / T-06-10), G2
  (every on-screen number is the live demo's own output, not a quoted backtest figure — LD-1), and
  G3 (ephemeral-key hygiene — T-06-09).
- **An after-recording hand-off** pointing the resulting video URL at Plan 06-05's Devpost filing,
  with the resume signal.

## Verification

The task `<verify>` block and all six `<acceptance_criteria>` pass mechanically:

- `make demo` storyboarded — PASS
- staged checkpoints + dual gate (`ratio_bps` / `nav_delta_bps`) — PASS
- pasteable tx-digest shot (`suiscan.xyz/testnet/tx`) — PASS
- two-protocol PTB scoped mock-proven/pending (`mock_margin_pool` / `pending`) — PASS
- mainnet-readiness sidebar sourced (`MAINNET-READINESS`) — PASS
- cooldown handled (`cooldown` / `timelapse` / `cut`) — PASS

Manual threat checks (threat register):

- **T-06-10 (capability spoofing):** every `LoanBorrowed` occurrence is in a FORBIDDEN / "cannot be
  recorded" / "Never show" context — no shot depicts a live event. PASS.
- **T-06-09 (info disclosure):** no `suiprivkey` literal, no secret material; only the known public
  testnet addresses appear; `SUI_PRIVATE_KEY` is always a placeholder or masked (`***`). PASS.

## Deviations from Plan

None — Task 1 executed exactly as written. Two within-scope amplifications worth noting (not
deviations, both inside the `<action>`/critical-constraints envelope):

- The "Honesty guardrails" box's LD-1 rule (G2) was made concrete by naming the specific backtest
  figures (+7.52% full-window, −2.30% OOS) and their canonical home (`NUMBERS-CANONICAL.md`) that
  must NOT be narrated as the demo's own output — the plan asked for "the LD-1 rule"; this states it
  unambiguously so the operator cannot accidentally violate it on camera.
- The forbidden-`LoanBorrowed` guardrail is stated in three places (lead note, shot 6, guardrail G1)
  rather than once, because the operator reads shot-by-shot under time pressure and the constraint is
  non-negotiable.

## Authentication gates

None encountered (artifact task is pure documentation; no tool auth, no network calls).

## Held checkpoint (Task 2 — recording, `human-action`)

**Not performed.** Recording the ~3-minute video requires a human operator with a **funded testnet
wallet on camera** running live PTBs — outside the executor's capability, and the phase's autonomy
boundary (CONTEXT.md) explicitly classifies the DEPLOY-05 recording as a human-action checkpoint. The
script is film-ready; the user records it following the Pre-recording checklist, then returns
**"recorded" + the video share URL** (which feeds Plan 06-05's Devpost filing) or describes a blocker.
`auto_advance` does not auto-approve human-action gates (only `human-verify` / `decision`), so this is
correctly held even under the unattended-autonomous run.

## Known Stubs

None. `docs/DEMO-SCRIPT.md` is a complete artifact; the only outstanding item is the human recording
(tracked as the held checkpoint), and the demo-video URL placeholder lives in Plan 06-05's Devpost
draft, not here.

## Self-Check: PASSED

- FOUND: `docs/DEMO-SCRIPT.md`
- FOUND: `.planning/phases/06-submission-package/06-04-SUMMARY.md`
- FOUND commit: `3df2e27` (docs(06-04): shot-by-shot demo-video script)
