---
phase: 06-submission-package
plan: 02
subsystem: docs
tags: [whitepaper, svi, gatheral, hedge-pricing, backtest, liquidation, risk-disclosure, honesty-bar]

# Dependency graph
requires:
  - phase: 06-submission-package (Plan 06-01)
    provides: NUMBERS-CANONICAL.md (window-labeled numbers ledger) + force-committed backtest/reports/full-365d.json
  - phase: 01-svi-parity
    provides: shared/svi-spec.md locked math contract + 141-vector three-way parity gate
  - phase: 03-backtest-harness-two-protocol-ptb (Plan 03-07/03-08/03-10)
    provides: worst-case liquidation anchors (ltv.move + parity tests) + strategy_sim.py backtest numbers
  - phase: 00-setup-ground-rules
    provides: shared/strategy.toml [hedge_policy] locked bounds + docs/HEDGE-POLICY.md re-tuning ADR
provides:
  - "docs/WHITEPAPER.md — Gatheral-style strategy whitepaper (505 lines, 8 sections + references)"
  - "Raw 5-parameter SVI math description + binary/digital hedge price formula with arXiv:1204.0646 citation"
  - "Window-labeled backtest results (full-window +7.52% / OOS −2.30%) every figure traced to a committed artifact"
  - "Worst-case-Predict liquidation section (compound −60% shock, risk_ratio 8_101 bps) + honest risk disclosures (unaudited/single-key/testnet)"
affects: [DEPLOY-06 README (links to whitepaper), DEPLOY-10 Devpost draft (cites whitepaper), demo-script credibility narration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Honesty-bar discipline: every published number window-labeled + cited to a committed artifact via NUMBERS-CANONICAL.md (LD-1)"
    - "Two-pricing-paths disclosure: backtest (trailing-30d realized-vol IV proxy) vs on-chain (audited raw-SVI evaluator) stated explicitly, never conflated"
    - "No-implied-audit rule: risk disclosures state 'unaudited; admin-paused single-key v1'; two-protocol PTB labeled mock-proven not live"

key-files:
  created:
    - docs/WHITEPAPER.md
  modified: []

key-decisions:
  - "Described the on-chain pricer as RAW 5-parameter SVI (not SSVI) per strategy.toml:64 / Pitfall 5; cited Gatheral & Jacquier 2014 (arXiv:1204.0646) as the arbitrage-free framework, noting the dashboard renders an SSVI-style surface across tenors"
  - "Used the real 141/21 parity-vector counts and actively flagged the spec's stale 120/20 note rather than repeating it"
  - "Used the JSON OOS values (−2.30% APY / −1.87 Sharpe) over the ledger drift (−2.37% / −1.92) per NUMBERS-CANONICAL.md Rule (c)"
  - "Cited the +7.52% full-window total return to backtest-assumptions.md (NOT the JSON, which holds only OOS) per Rule (d)"
  - "Grounded the lookahead-audit claim in lookahead_audit.py + the assumptions ledger, explicitly NOT the HTML renderer stub block"

patterns-established:
  - "Whitepaper claim ladder: every implementation claim carries a file:line citation; every number carries a window label + committed source"

requirements-completed: [DEPLOY-08]

# Metrics
duration: 5min
completed: 2026-06-15
---

# Phase 6 Plan 02: Strategy Whitepaper Summary

**Gatheral-style `docs/WHITEPAPER.md` (505 lines): raw 5-parameter SVI math + zero-drift BS digital-put hedge price + locked sizing bounds + worst-case-Predict liquidation + honest, window-labeled backtest numbers and unaudited/single-key/testnet risk disclosures.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-06-15T17:01:33Z
- **Completed:** 2026-06-15T17:06:03Z
- **Tasks:** 2
- **Files modified:** 1 (`docs/WHITEPAPER.md`, created)

## Accomplishments

- **Part A (math + policy)** — abstract; §1 raw 5-parameter SVI total-variance function `w(k)` with the `SVIParams { a, b, rho, m, sigma }` shape and 1e9 fixed-point scale, citing Gatheral & Jacquier 2014 (arXiv:1204.0646); §2 the binary/digital hedge price formula (zero-drift BS digital put: `total_var → d2 → Φ(d2)`) with the Cody-1969 Φ, the D-06 `r=0` convention, and the on-chain `EPredictMisquote` 0.5% abstain (rebalance.move:264-270); §3 the three-way parity gate (141 golden vectors / 21 Tier-A Gatheral, bit-equal across Move/Python/TS, CI `parity` job + forbidden-token grep); §4 the locked sizing bounds verbatim (allocation_bps=1000, strike_otm_bps=1500, tenor_seconds=1209600, roll_trigger_seconds=172800, fixed v1) + the walk-forward re-tuning policy with the honest "ship the principled choice" quote.
- **Part B (results + risk)** — §5 backtest results with the honest-framing paragraph and two explicitly-labeled windows (full-window +7.52% / payoff +9.98% / hedged DD −1.66% vs BTC −52.86%; OOS −2.30% APY / −1.87 Sharpe / 7 cycles 0 payoffs) plus the sensitivity table (locked 0.10 is NOT the OOS-optimal 0.05 — by design); §6 model assumptions (PLP_APY=8% assumption, 0.25 LVR, two pricing paths, coverage-based sizing, expiry-spot settlement, lookahead audit grounded in lookahead_audit.py not the HTML stub); §7 worst-case-Predict liquidation (worst_case_nav = liquid balance/shares, compound −60% shock → risk_ratio 8_101 bps < 11_500, anchors wcn_pre=9_009_900_990 / wcn_post=6_306_930_693, bit-equal Move+Python); §8 risk disclosures (UNAUDITED, admin-paused single-key, testnet-only, fixed-ratio drag; mitigations in place; two-protocol PTB labeled mock-proven not live); §References.
- **Honesty bar held (LD-1):** zero recomputed numbers; every figure pulled verbatim from NUMBERS-CANONICAL.md with its window label and committed source; no audit implied anywhere.

## Task Commits

Each task was committed atomically:

1. **Task 1: Whitepaper part A — overview, SVI math, hedge price formula, sizing policy** — `5c20628` (docs)
2. **Task 2: Whitepaper part B — backtest results (window-labeled), worst-case liquidation, model assumptions, risk disclosures** — `9c50035` (docs)

**Plan metadata:** _(this SUMMARY + STATE/ROADMAP/REQUIREMENTS update — see final commit)_

## Files Created/Modified

- `docs/WHITEPAPER.md` (created, 505 lines) — the full Gatheral-style strategy whitepaper: abstract + 8 sections (SVI surface, binary hedge price, parity gate, sizing policy, backtest results, model assumptions, worst-case liquidation, risk disclosures) + references. GitHub-renderable Markdown with a TOC.

## Decisions Made

- **Raw SVI, not SSVI (Pitfall 5):** described the on-chain pricer as raw 5-parameter SVI per `strategy.toml:64`, cited Gatheral & Jacquier 2014 (arXiv:1204.0646) for the arbitrage-free framework, and noted the dashboard's SSVI-style surface render is separate from the per-slice on-chain math. Did NOT claim SSVI is implemented on-chain.
- **Real parity counts:** used 141 vectors / 21 Tier-A Gatheral and explicitly flagged the spec's stale "120 vectors / 20 Gatheral" note as outdated rather than repeating it.
- **OOS source = JSON (Rule c):** used `full-365d.json` OOS values (−2.30% APY, −1.87 Sharpe, −0.71 Sortino, −0.98% DD) over the slightly-drifted ledger values (−2.37% / −1.92 / −0.73 / −0.99%).
- **Full-window source = ledger (Rule d):** attributed the +7.52% full-window total return (and its +7.14% / −4.16% / −5.43% / +9.98% decomposition) to `backtest-assumptions.md`, NOT the JSON.
- **Lookahead-audit provenance:** cited `lookahead_audit.py` + the assumptions ledger (D-06 |alpha|≤0.005, D-07 3-row hand-recompute seed 42), explicitly NOT the HTML renderer's stubbed shuffled-label / hand-recompute blocks.

## Deviations from Plan

None — plan executed exactly as written. Both tasks' `<action>` blocks were followed verbatim, all `<acceptance_criteria>` greps pass, and every fact was pasted from the verified `<facts>` block / source files rather than re-derived. No deviation rules (1–4) were triggered; no architectural decisions, no auth gates, no blocking issues.

## Issues Encountered

None. Two non-blocking notes:

- The `gsd-sdk query state.load` command in the execute-plan boilerplate is not a valid SDK command (the CLI is `gsd-tools` with hyphenated subcommands: `state`, `requirements`, `roadmap`, `commit`, …). State was read directly from `.planning/STATE.md` and commits made via `gsd-sdk commit`. No impact on execution.
- Two grep-based self-audit "WARN" hits were verified false positives: line 196 ("120 vectors") is the sentence *correcting* the stale spec note, and line 63 ("…not SSVI") is the correct disclaimer — both are honesty-preserving, not violations.

## Self-Check: PASSED

- `docs/WHITEPAPER.md` — FOUND (505 lines, GitHub-renderable Markdown)
- `.planning/phases/06-submission-package/06-02-SUMMARY.md` — FOUND
- Task 1 commit `5c20628` — FOUND in git history
- Task 2 commit `9c50035` — FOUND in git history
- All acceptance greps pass (arXiv:1204.0646, allocation_bps/1000, raw 5-param SVI, 141, EPredictMisquote, 7.52 + full-window, 2.30 + 1.87 + OOS, unaudited, 8_101 + worthless, trailing-30d/realized vol, ≥200 lines); no audit-implied phrasing.

## User Setup Required

None — no external service configuration required. This plan produced documentation only.

## Next Phase Readiness

- **DEPLOY-08 complete.** `docs/WHITEPAPER.md` is filing-ready and is the credibility document for the submission package.
- **Ready for downstream Wave plans:** DEPLOY-06 (README) can now link to `docs/WHITEPAPER.md`; DEPLOY-10 (Devpost draft) can cite it. Both depend only on the whitepaper existing, which it now does.
- **No blockers.** The honesty bar (LD-1) is satisfied: every number traces to a committed artifact (`NUMBERS-CANONICAL.md` → `backtest-assumptions.md` / `full-365d.json`), so a fresh clone can verify each figure.
- Carry-forward (unchanged, not introduced here): `git push` remains user-gated; the two-protocol PTB live-testnet leg remains pending Mysten's DUSDC Margin pool (documented honestly in §8).

---
*Phase: 06-submission-package*
*Completed: 2026-06-15*
