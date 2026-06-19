---
phase: quick
task: 260619-foo
title: Rewrite README to lead with clear product details
status: complete
date: 2026-06-19
---

# Quick Task 260619-foo: Rewrite README to lead with clear product details

## Task

Reorganize `README.md` so the PRODUCT story leads (what / who / how / what-you-get
/ honest performance / known limitations), with the build-log / phase-history
content moved below. A judge or newcomer should grasp the product before any
engineering detail. Reorganize + clarify only — invent no new performance/yield claim.

## New section order

1. Title + tagline + badges (unchanged)
2. **What is DeepVault?** — product definition + target user (institutional LPs / DeepBook Predict LPs)
3. **How it works** — elevated from Laypitch: ~90/10 PLP/hedge split, SVI-priced binary tail hedges, payoff, 8% APY caveat, the single-PTB composability moment
4. **What you get** — three surfaces: on-chain vault / PLP Risk Studio dashboard / Python backtest harness
5. **Performance (honest)** — elevated frozen window-labeled numbers
6. **Known limitations (pre-mainnet)** — not-audited + mainnet-deferred + H1/H2 per-supplier hedge custody
7. then EXISTING: Status -> Glossary -> Quick Start -> Stack -> Demo (+ Testnet contracts) -> Architecture -> Repository layout -> Hosting -> Mainnet readiness -> Key policies -> Build log -> References -> License

## Hard-preserve (verbatim substance / numbers / links)

- H1/H2 hedge-custody limitation paragraph + `docs/WHITEPAPER.md` §8.1 link
- NO link to SECURITY-AUDIT.md (audit detail stays private)
- Glossary NAV "cost basis" wording (not mark-to-market)
- Frozen figures: full-window 365d **+7.52%** (one -15% breach fired); calm OOS holdout **-2.30%** APY, Sharpe **-1.87**; phrase "the honest cost-of-carry of crash insurance"; NUMBERS-CANONICAL.md source link
- Testnet addresses + deploy tx verbatim (deployed 2026-05-16)
- Hosting = "not hosted in the submission window / run locally" (live deploy separately gated — no live *.vercel.app / onrender.com URL claimed yet)
- "not audited", mainnet deferred, Margin leg of two-protocol PTB mock-proven via mock_margin_pool (NOT live on testnet), repo URL, ship 2026-06-16, freeze 2026-05-30

## De-duplication

Frozen figures live in ONE place (Performance section) with the source link; the
References "backtest numbers" bullet becomes a pointer to that section to avoid two
phrasings drifting apart. The H1/H2 + not-audited/mainnet-deferred lines move OUT of
Status into the dedicated Known-limitations section (no double-statement).

## Execution note

Authored inline by the orchestrator (not delegated to gsd-executor): single delicate
honesty-sensitive doc rewrite; orchestrator holds full session context. GSD guarantees
preserved (planned artifact, atomic commit, STATE.md tracking). Committed LOCALLY only —
push is separately gated by the user.
