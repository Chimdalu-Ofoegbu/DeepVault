---
phase: quick
task: 260619-foo
title: Rewrite README to lead with clear product details
status: complete
date: 2026-06-19
commit: a6394a1
---

# Quick Task 260619-foo — Summary

## What changed

`README.md` reorganized **product-first** (245 → 280 lines). New top-down order:

1. Title + tagline + badges (unchanged)
2. **What is DeepVault?** — product definition + target user (institutional LPs / DeepBook Predict LPs)
3. **How it works** — ~90/10 PLP/hedge split, SVI-priced binary tail hedges, payoff, 8% APY caveat, the single-PTB composability moment
4. **What you get** — three surfaces (on-chain vault / PLP Risk Studio dashboard / Python backtest harness)
5. **Performance (honest)** — frozen window-labeled numbers
6. **Known limitations (pre-mainnet)** — not-audited + mainnet-deferred + H1/H2 per-supplier hedge custody
7. then existing: Status → Glossary → Quick Start → Stack → Demo (+ Testnet contracts) → Architecture → Repository layout → Hosting → Mainnet readiness → Key policies → Build log → References → License

## Honesty / hard-preserve verification (grep-confirmed against the new README)

- **[absent]** No `SECURITY-AUDIT` reference — audit detail stays private.
- **[present]** Frozen figures verbatim: full-window 365d **+7.52%** (one −15% breach fired); calm OOS **−2.30%** APY, Sharpe **−1.87**; phrase "the honest cost-of-carry of crash insurance"; `NUMBERS-CANONICAL.md` source link.
- **[present]** H1/H2 hedge-custody paragraph + `WHITEPAPER.md` §8.1 link; "cost basis" NAV wording; `ctx.sender() == manager.owner()` gate; "supplier-owned".
- **[present]** not-audited, mainnet deferred, `mock_margin_pool` (Margin leg not live on testnet), 8% PLP APY assumption.
- **[present]** all four testnet addresses + deploy tx verbatim; repo URL; dates 2026-05-16 / 2026-06-16 / 2026-05-30.
- **[absent]** No `vercel.app` / `onrender.com` URL — hosting stays "not hosted in the submission window"; the live hosted deploy is separately in progress and gated.

## De-duplication

Frozen numbers now live in exactly ONE place (Performance section) with the source link; the References "backtest numbers" bullet became a pointer to that section to stop two phrasings drifting apart. The H1/H2 + not-audited/mainnet-deferred lines moved OUT of Status into the dedicated Known-limitations section (no double-statement).

## Notes

- Authored inline by the orchestrator (not delegated to `gsd-executor`): a single delicate, honesty-sensitive doc rewrite where the orchestrator holds the full session context (security-audit arc, cold-read fixes, frozen numbers). GSD guarantees preserved: planned artifact (PLAN.md), atomic commit, STATE.md tracking.
- Deliverable commit: **a6394a1** (README only). Bookkeeping (PLAN + SUMMARY + STATE) in the follow-on docs commit.
- Committed **LOCALLY only** — push is separately gated by the user.
- No source code touched; no tests affected (README-only change).
