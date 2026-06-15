---
phase: 06-submission-package
plan: 05
subsystem: docs
tags: [devpost, submission, deepbook-predict, sui-overflow, honesty-bar, plp-hedge]

# Dependency graph
requires:
  - phase: 06-01
    provides: NUMBERS-CANONICAL.md (window-labeled figures) + force-committed backtest report (full-365d.json / full-365d-report.html)
  - phase: 06-02
    provides: docs/architecture.svg (four-tier diagram + single-PTB moment)
  - phase: 06-03
    provides: docs/WHITEPAPER.md (SVI math, hedge pricing, sizing, liquidation, risk disclosures)
  - phase: 06-04
    provides: docs/DEMO-SCRIPT.md (demo storyboard; the video URL the Devpost draft links)
provides:
  - "docs/DEVPOST-SUBMISSION.md — complete paste-ready Devpost / Sui Overflow 2026 submission draft (DEPLOY-10 preparatory artifact)"
  - "All standard Devpost sections + real testnet addresses + window-labeled honest numbers + artifact links + two clearly-marked fill-at-filing placeholders"
affects: [devpost-filing, submission-package]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Honesty bar (LD-1): every published figure window-labeled + traced to a committed artifact via NUMBERS-CANONICAL.md; full-window cites backtest-assumptions.md, OOS cites full-365d.json; never mixed"
    - "Human-action preparatory pattern: deliver the complete artifact autonomously; hold the external-publishing step (portal filing) as a blocking checkpoint with a resume signal"

key-files:
  created:
    - docs/DEVPOST-SUBMISSION.md
  modified: []

key-decisions:
  - "DEPLOY-10 NOT marked complete in REQUIREMENTS.md: the requirement is 'submission package complete on the portal' (= filing), which is the held human-action checkpoint; only the preparatory draft shipped. Marking it complete would falsely claim the package was filed."
  - "Repo URL + demo-video URL left as literal <REPO-URL-PLACEHOLDER> / <DEMO-VIDEO-URL-PLACEHOLDER> tokens (greppable); not fabricated — repo push is user-gated, video comes from the 06-04 recording."
  - "Two-protocol PTB framed mock-proven (mock_margin_pool integration test) + documented-future/live-on-testnet-pending; no live testnet Margin borrow claimed (Pitfall 3)."
  - "No third-party audit implied anywhere; audit listed only as v2 future work and explicitly negated in the honesty notes."

patterns-established:
  - "Paste-ready submission draft with a Fill-at-filing checklist that re-states the honesty guardrails (keep window labels, add no off-ledger figure, no implied audit)"

requirements-completed: []  # DEPLOY-10 preparatory artifact shipped; the requirement itself (portal filing) is held as a human-action checkpoint and is NOT complete yet.

# Metrics
duration: ~8min
completed: 2026-06-15
---

# Phase 6 Plan 05: Devpost Submission Draft Summary

**Complete, paste-ready Devpost / Sui Overflow 2026 submission draft (`docs/DEVPOST-SUBMISSION.md`) with all standard sections, real testnet addresses + Suiscan links, window-labeled honest backtest numbers (+7.52% full-window / −2.30% OOS), artifact links, and two clearly-marked fill-at-filing placeholders — with the actual portal filing held as a human-action checkpoint.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-06-15T17:34:43Z
- **Completed:** 2026-06-15T17:42:00Z (approx)
- **Tasks:** 1 of 1 autonomous task complete; 1 human-action checkpoint held (not performed)
- **Files modified:** 1 created

## Accomplishments
- Wrote `docs/DEVPOST-SUBMISSION.md` — title, tagline, and all six standard Devpost sections (inspiration / what it does / how we built it / challenges / accomplishments / what's next), plus a Submission-details block and a Fill-at-filing checklist.
- Embedded the real deployed testnet addresses verbatim from `TESTNET-DEPLOY.json` (package `0xbc9aaeaa…`, vault `0x2824d97e…`, admin_cap `0x9e40150e…`, deploy tx `ETYPnLemp761…`) with Suiscan object/tx links.
- Stated the honest backtest asymmetry with both windows labeled and traced: full-window total return **+7.52%** (1 breach fired, hedge payoff +9.98%, hedged max DD −1.66% vs unhedged BTC −52.86%, source `backtest-assumptions.md`) AND the calm OOS holdout where the hedge was a net cost (APY **−2.30%**, Sharpe **−1.87**, 7 cycles / 0 payoffs, source `backtest/reports/full-365d.json`). Never mixed the two windows.
- Linked the committed artifacts: `docs/WHITEPAPER.md`, `docs/architecture.svg`, `backtest/reports/full-365d-report.html`, `README.md`, `docs/MAINNET-READINESS.md`.
- Framed the two-protocol single-PTB as mock-proven (`mock_margin_pool`) + documented-future; framed mainnet as deferred (Predict not on mainnet in the window) with the ≤30-min readiness toolkit; explicitly stated the codebase is not audited.
- Left repo URL and demo-video URL as obvious literal placeholder tokens (6 `PLACEHOLDER` occurrences across body / submission block / checklist); fabricated neither.

## Task Commits

Each task was committed atomically:

1. **Task 1: Write the complete paste-ready Devpost draft** - `dd5812f` (docs)

**Plan metadata:** (this SUMMARY + STATE/ROADMAP) committed separately as the final docs commit.

## Files Created/Modified
- `docs/DEVPOST-SUBMISSION.md` - Complete paste-ready Devpost / Sui Overflow 2026 submission draft with all fields filled and two clearly-marked fill-at-filing placeholders.

## Decisions Made
- **DEPLOY-10 left Pending (not marked complete).** The requirement text is "submission package complete on the Devpost / Sui Overflow portal" — that is the filing, which is the held human-action checkpoint. Only the preparatory draft shipped here, so marking DEPLOY-10 complete would be dishonest. It flips to complete after the user files (resume signal "filed"). Mirrors how 06-04 held the DEPLOY-05 recording.
- **Placeholders kept literal, not guessed.** Repo URL push is user-gated; the demo-video URL comes from the 06-04 recording (itself a held checkpoint). Tokens are greppable so they cannot be missed at filing time.
- **Honest PTB + audit framing** preserved per CONTEXT Pitfall 3 / LD-1: mock-proven/documented-future PTB; audit strictly v2 future and explicitly negated.

## Deviations from Plan

None - plan executed exactly as written. (Pre-flight verification confirmed all referenced artifacts — whitepaper, architecture.svg, MAINNET-READINESS.md, README.md, and both backtest report files — already exist and are git-tracked, so the Pitfall-1 force-commit was already handled by Plan 06-01; no additional fix was required.)

## Issues Encountered
- The `gsd-sdk` CLI on PATH uses space-separated subcommands (`gsd-sdk query state load`), not the dotted form (`state.load`) shown in the generic agent prompt; the local `node_modules/@gsd-build/sdk` is not installed. Resolved by using the PATH binary with space-separated args. No impact on the artifact.

## Known Stubs
None. The draft is a complete document; the two `<…PLACEHOLDER>` tokens are intentional, documented fill-at-filing fields (repo URL + demo-video URL), not stubs — both are external/user-gated values that cannot be invented under LD-1.

## User Setup Required
**External action required to complete DEPLOY-10.** Filing on the Devpost / Sui Overflow portal is external publishing that needs the user's account and the recorded demo-video link. See the held human-action checkpoint below / the `user_setup` block in `06-05-PLAN.md`. The draft is ready; the user pastes it into the portal after filling the two placeholders.

## Next Phase Readiness
- The Devpost submission is paste-ready. Remaining steps are entirely the user's: (1) record/obtain the demo-video URL (06-04 recording checkpoint), (2) run the user-gated `git push` to get the repo URL, (3) fill both placeholders, (4) paste into the portal and submit before the deadline (ROADMAP 2026-06-16; working target 2026-06-19).
- DEPLOY-10 remains Pending until the user confirms filing (resume signal: "filed").

## Self-Check: PASSED

- FOUND: docs/DEVPOST-SUBMISSION.md (git-tracked at HEAD)
- FOUND: .planning/phases/06-submission-package/06-05-SUMMARY.md
- FOUND commit: dd5812f (docs(06-05): paste-ready Devpost submission draft)

---
*Phase: 06-submission-package*
*Completed: 2026-06-15*
