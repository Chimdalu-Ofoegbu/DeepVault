---
phase: 06-submission-package
plan: 03
subsystem: docs
tags: [readme, cold-read, deploy-06, honesty-bar, broken-links, testnet-addresses, artifact-links]

# Dependency graph
requires:
  - phase: 06-submission-package (Plan 06-01)
    provides: force-committed backtest/reports/full-365d-report.html + NUMBERS-CANONICAL.md (window-labeled numbers) + docs/architecture.svg
  - phase: 06-submission-package (Plan 06-02)
    provides: docs/WHITEPAPER.md (the strategy whitepaper the README now links)
  - phase: 02-vault-move-package-testnet-deploy
    provides: TESTNET-DEPLOY.json real deployed addresses (package/vault/admin-cap/deploy-tx)
  - phase: 05-testnet-demo-hardening
    provides: docs/MAINNET-READINESS.md (renamed from MAINNET-FUNDING.md) + scripts/testnet-smoke-test.sh (make demo)
provides:
  - "README.md — cold-read-passing judge front door: accurate status, real testnet addresses, links to whitepaper/report/SVG/MAINNET-READINESS, honest demo scope"
  - "Zero broken MAINNET-FUNDING links (all 5 occurrences repointed to MAINNET-READINESS.md)"
  - "Real deployed testnet contract table (package/vault/admin-cap IDs + deploy tx digest, suiscan-linked)"
  - "Demo honesty note: make demo = supply + real on-chain hedge mint + redeem; two-protocol Margin PTB scoped as mock-proven/pending"
affects: [DEPLOY-10 Devpost draft (reuses README front-door framing), demo-script credibility, judge cold-read]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Honesty-bar discipline (LD-1): every README performance number window-labeled (full-window 365d vs OOS holdout) + sourced to NUMBERS-CANONICAL.md"
    - "No-capability-overclaim: live demo (make demo, real on-chain hedge) distinguished from the aspirational two-protocol Margin PTB (mock-proven via mock_margin_pool, live-on-testnet pending)"
    - "Cold-read link integrity: every internal markdown link + inline-code doc reference verified to resolve to a committed file"

key-files:
  created:
    - .planning/phases/06-submission-package/06-03-SUMMARY.md
  modified:
    - README.md

key-decisions:
  - "Repointed ALL 5 MAINNET-FUNDING occurrences (prose L10, table L41, repo-layout L146, key-policies L184, references L213) — the plan task text enumerated only 3 (L41/L184/L213); the critical constraint + 06-RESEARCH §6 G2 required ZERO remaining, so L10 and L146 were also fixed"
  - "Rewrote the stale status block as an honest Phases 0-5 + dashboard bullet list; explicitly stated 'not audited' and 'mainnet deferred' (no overclaim)"
  - "Cold-read fix beyond the literal task list: scoped the Laypitch 'flagship demo is a single PTB' claim (old L29) to mock-proven/pending — a cold-reading judge hits the Laypitch before the Demo honesty note, so the most-prominent section must not overclaim a live Margin PTB (LD-1 / 06-RESEARCH Pitfall 3)"
  - "Added two README performance numbers (+7.52% full-window 365d / −2.30% OOS holdout), both window-labeled and sourced to NUMBERS-CANONICAL.md verbatim — satisfies the 'no unlabeled number' constraint while giving judges the honest headline"
  - "Used the real deployed addresses from TESTNET-DEPLOY.json verbatim; dropped the 'PENDING until Phase 2 runs' caveat (vault deployed 2026-05-16) and the stale e2e-vault-deploy.sh 'populate after' line"

patterns-established:
  - "README cold-read acceptance = laypitch + glossary(PLP/SVI/PTB/NAV) + prereqs + make demo + every internal link resolves; verified mechanically, not by eye"

requirements-completed: [DEPLOY-06]

# Metrics
duration: 5min
completed: 2026-06-15
---

# Phase 6 Plan 03: README Cold-Read Polish Summary

Polished the existing `README.md` (targeted edits, not a rewrite) to pass the DEPLOY-06
cold-read: fixed all broken `MAINNET-FUNDING` links, replaced placeholder testnet
addresses with the real deployed ones, corrected the stale status block, added links to
the Phase-6 artifacts (whitepaper, committed backtest report, architecture SVG), added an
honest demo-scope note, and ran a fresh-eyes cold-read pass verifying every internal link
resolves.

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | Fix broken links, stale status, placeholder testnet addresses | `67b442d` | README.md |
| 2 | Add Phase-6 artifact links, demo honesty note, cold-read pass | `5195939` | README.md |

## What Changed

**Task 1 — link/status/address integrity (G1, G2, G3):**
- **G2 (broken links):** Repointed every `docs/MAINNET-FUNDING.md` reference to
  `docs/MAINNET-READINESS.md`. Five occurrences fixed: prose (old L10), the
  Architecture-at-a-Glance table row (L41), the repository-layout `docs/` row (L146), the
  Key-policies bullet (L184), and the References "For deploy" line (L213).
  `grep -c 'MAINNET-FUNDING' README.md` now returns **0**.
- **G1 (stale status):** Replaced the "Phase 0 COMPLETE / Phase 1 next-up" block with an
  accurate bullet list — Phases 0–5 complete plus the PLP Risk Studio dashboard (04.1
  reskin + 04.2 `Vault | Risk Studio` split), testnet vault deployed 2026-05-16,
  submission-ready for Sui Overflow 2026. Explicitly states mainnet is **deferred** (links
  MAINNET-READINESS.md) and the codebase is **not audited** — no overclaim.
- **G3 (placeholder addresses):** Filled the testnet contract table with the real values
  from `TESTNET-DEPLOY.json` (package `0xbc9aaeaa…d6e862`, vault `0x2824d97e…f7a911`,
  AdminCap `0x9e40150e…aba3e7`, deploy tx `ETYPnLemp…uBBCS`), each suiscan-linked. Dropped
  the "PENDING until Phase 2 runs" caveat and the "populate after e2e-vault-deploy.sh" line.

**Task 2 — artifact links, demo honesty, cold-read (G4, G5, G6, G7):**
- **G6 (architecture):** Repointed the architecture line from the internal
  `.planning/research/ARCHITECTURE.md` to the committed `docs/architecture.svg`, embedded
  it (`![…](docs/architecture.svg)`), and kept the internal doc as a depth pointer.
- **G4 (whitepaper):** Added `docs/WHITEPAPER.md` links in both the Architecture-at-a-Glance
  table and the References "For judges" line.
- **G5 (backtest report):** Linked the committed `backtest/reports/full-365d-report.html`
  and added a window-labeled headline (full-window 365d **+7.52%** vs OOS holdout APY
  **−2.30%**, Sharpe −1.87) sourced to `NUMBERS-CANONICAL.md`.
- **G7 (demo honesty):** Added a scope note — `make demo` runs supply + a **real on-chain
  Predict hedge mint** + redeem (`Supplied`+`HedgeMinted`, 7-checkpoint dual ±10 bps cycle);
  the two-protocol single-PTB (Margin + Predict + vault) is **architecturally proven via the
  `mock_margin_pool` integration test** and **live-on-testnet pending** (no DUSDC Margin
  pool on testnet). Clarified `ORACLE_SVI_ID` is the Mysten Predict testnet registry
  `OracleSVI` object, not something the operator deploys.

## Cold-Read Pass (LD-4 / DEPLOY-06 acceptance) — PASSED

Re-read the whole README as a first-time judge. Verified mechanically:
- **(a) Laypitch** present and understandable without prior context ("PLP yield minus crash
  insurance" deposit). One in-place fix applied (see below).
- **(b) Glossary** defines all four terms — PLP, SVI, PTB, NAV (grep-confirmed: 1 each).
- **(c) Prerequisites + `make demo`** runnable; Windows fallback block present.
- **(d) Every internal link resolves to a committed file.** All 17 markdown-link targets
  exist (whitepaper, report HTML, architecture.svg, MAINNET-READINESS, HEDGE-POLICY,
  CONTRIBUTING, TESTNET-DEPLOY.json, NUMBERS-CANONICAL, PROJECT, ROADMAP, STACK,
  ARCHITECTURE, config/mainnet.toml, CLAUDE.md, LICENSE) and the 5 inline-code doc
  references (research SUMMARY/STACK/PITFALLS, REQUIREMENTS, testnet-smoke-test.sh) exist.
- No stale tokens remain: zero of `Phase 0 COMPLETE`, `SSVI`, `next-up`, `PENDING`,
  `e2e-vault-deploy`, or `<…>` address placeholders.

**Cold-read fix applied (beyond the literal task action list):** the Laypitch (originally
untouched) claimed "the flagship demo is a single PTB that opens three positions atomically
— Margin borrow + vault deposit + Predict hedge mint." A cold-reading judge reaches the
Laypitch before the Demo section's honesty note, so this was a capability-overclaim of a
flow that cannot run live on testnet (Pitfall 3 / LD-1). Rewrote it to distinguish the live
`make demo` (real on-chain hedge) from the mock-proven/pending two-protocol PTB, with an
anchor link to the Demo section. This is logged as a deviation below (Rule 1 — honesty).

**No unlabeled performance number** was introduced: the only two figures (+7.52%, −2.30%)
are each window-labeled (full-window 365d / OOS holdout) and cite NUMBERS-CANONICAL.md.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Honesty/Overclaim] Scoped the Laypitch flagship-PTB claim**
- **Found during:** Task 2 cold-read pass (LD-4).
- **Issue:** The Laypitch (the most-prominent section, reached before the Demo honesty
  note) asserted the single Margin+Predict+vault PTB as "the flagship demo" — implying a
  live capability that cannot run on testnet (no DUSDC Margin pool — 06-RESEARCH Pitfall 3).
  This contradicts the demo honesty note added two sections lower and violates LD-1.
- **Fix:** Rewrote the Laypitch paragraph to lead with the live `make demo` (deposit + real
  on-chain Predict hedge + redeem on testnet) and scope the two-protocol PTB as
  "proven via the `mock_margin_pool` integration test and pending a live testnet Margin
  pool," with an in-page anchor to the Demo section.
- **Files modified:** README.md
- **Commit:** `5195939`

**Scope-expansion note (not a separate deviation, satisfies a hard constraint):** the plan
task-1 action text enumerated three MAINNET-FUNDING links (L41/L184/L213), but the critical
constraint and 06-RESEARCH §6 G2 both require **zero** remaining occurrences. The prose
reference (old L10) and the repository-layout `docs/` row (old L146) were therefore also
repointed. This is the constraint being satisfied exactly, not a deviation from intent.

## Self-Check: PASSED

- README.md exists and is committed (FOUND).
- Task 1 commit `67b442d` exists in git log (FOUND).
- Task 2 commit `5195939` exists in git log (FOUND).
- `grep -c 'MAINNET-FUNDING' README.md` == 0; `MAINNET-READINESS.md` present.
- Real package_id / vault_id / admin_cap_id / deploy tx digest present; zero `<…>` placeholders.
- `docs/WHITEPAPER.md`, `docs/architecture.svg`, `full-365d-report.html`, `make demo`, and the
  mock-proven/pending demo note all present.
