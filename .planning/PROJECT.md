# DeepVault

## What This Is

DeepVault is a composable structured product on Sui's DeepBook Predict that fuses PLP (Predict Liquidity Provision) yield with automated tail-risk hedging, paired with an institutional-grade PLP Risk Studio dashboard streaming live SVI volatility surfaces. Built for Sui Overflow 2026's DeepBook specialized track ($70k pool), it targets institutional LPs and the foundation-blessed "third primitive in the DeepBook stack" narrative — a flagship demo of what Sui DeFi composability means.

## Core Value

**A working PLP+Hedge vault on DeepBook Predict with a credible, auditable risk dashboard, deployed on mainnet by submission.** If everything else is cut, this single artifact — vault that sells "PLP yield minus crash insurance" plus a live SVI surface and what-if simulator — is a competitive, foundation-aligned submission. Quality of the vault math, the backtest, and the dashboard polish takes priority over component count.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

(None yet — ship to validate)

### Active

<!-- Current scope. Building toward these. Quality-first ordering: math correctness > deploy hygiene > demo polish > composability breadth. -->

**Vault & Strategy**
- [ ] PLP+Hedge vault as a Move package: `vault::supply`, `vault::redeem`, `vault::rebalance`
- [ ] Tokenized vault share (object) usable as collateral in DeepBook Margin
- [ ] SVI-priced hedge purchases via `predict::mint` (theoretical binary price from oracle SVI parameters)
- [ ] Fixed-ratio hedge sizing policy in v1, parameterized so dynamic sizing is a config swap, not a rewrite
- [ ] Sell-back / roll handling for hedges near expiry
- [ ] Withdrawal queue for vault redemption with token-bucket limiter

**Backtest (handbook-required)**
- [ ] Python backtest harness: BTC historical ingestion, replay loop, PnL accounting, drawdown calculation
- [ ] 30+ days of replayed history across normal markets, trending markets, and stress events
- [ ] Lookahead-bias audit: explicit assumption ledger, manual cross-check of critical numbers
- [ ] Exportable backtest report (institutional-LP grade)

**Composability (two-protocol path, quality over breadth)**
- [ ] Single PTB opener: DeepBook Margin borrow → Predict PLP supply + hedge mint, atomic
- [ ] Liquidation path bounded against worst-case Predict outcomes (LTV math documented and tested)

**PLP Risk Studio Dashboard**
- [ ] Live 3D SVI surface plot streamed from `OracleSVIUpdated` Move events via WebSocket
- [ ] Arbitrage-free checker (butterfly + calendar violations) flagging surface anomalies
- [ ] Vault utilization, withdrawal-limiter token-bucket state, per-oracle exposure panels
- [ ] What-if scenario simulator: PLP PnL under ±5σ BTC moves
- [ ] Vault deposit / withdraw / position viewer with PnL attribution

**Deploy & submission**
- [ ] Testnet integration end-to-end against current Predict contracts (verified each Monday)
- [ ] Mainnet redeploy actually executed before submission (USDsui, Predict mainnet contracts)
- [ ] Demo video showing single PTB opening Margin + Predict + vault share atomically, with dashboard
- [ ] Documentation: README, architecture diagram, strategy whitepaper
- [ ] Submission package complete by 2026-06-16

### Out of Scope

<!-- Explicit boundaries with reasoning so we don't re-add under pressure. -->

- **Iron Bank integration / three-protocol PTB** — Brief flags this as the Week 6 cut. With 39 days solo, the additional protocol surface is the highest-risk item and Mysten's "Story still works" verdict on dropping it stands. Two-protocol PTB (Margin + Predict) is still a flagship composability moment.
- **Dynamic hedge sizing function** — Brief's Week 8 cut. Fixed ratio shipped correctly beats dynamic sizing shipped buggy. Sizing is parameterized so a future phase can swap policies without touching the vault.
- **Time-travel slider on the SVI surface plot** — Brief's Week 10 cut. Live plot is the high-leverage piece; replay is polish.
- **Historical drawdown replay as a live dashboard widget** — Backtest output ships as a static institutional report, not a live dashboard view.
- **Live delta/gamma/vega panels for the binary book** — Useful but not on the critical path. Backtest + arbitrage-free checker carry the "is this safe?" story.
- **Multi-asset support beyond BTC at v1** — Brief targets BTC for SVI/backtest; expanding the asset universe is post-submission work.
- **Permissionless vault factory / curator framework** — DeepVault is a single curated strategy at v1, not a factory.
- **Solver/keeper infrastructure for hedge rebalancing** — Manual rebalance + on-chain `vault::rebalance` callable is enough for the demo; automated solver is post-submission.

## Context

**The window.** Sui Overflow 2026 DeepBook track. DeepBook Predict launched on testnet 2026-05-05, three days before registration opened. Mysten explicitly framed Predict as "the third composable financial primitive in the DeepBook stack." The first-mover window for a foundation-blessed submission closes at registration end. Today is 2026-05-08; submission target is **2026-06-16** (39 days), with the hackathon closing 2026-06-20 as the absolute backstop.

**The judges.** a16z, Bridge/Stripe, finance-leaning Mysten leadership. Institutional safety surface (dashboard + audited backtest) plus a clean composability demo lands harder with this panel than a flashy consumer product.

**The bar.** Handbook explicitly requires "proper simulation result if you are building a vault strategy." Backtest credibility is non-negotiable — a backtest showing 80% APY with no drawdown is buggy and gets thrown out.

**The build.** Solo build with Claude Code as implementation partner. Human role: spot financial nonsense, make product calls (hedge ratio policy, OTM strike width, roll handling), keep the cut-line discipline. Skill bar: comfort with numpy/pandas, willingness to read the Gatheral SVI paper.

**The risk.** Predict docs warn smart contracts may change before mainnet. Weekly Monday contract-version check is non-negotiable; a breaking change halts feature work and forces a refactor before continuing.

## Constraints

- **Timeline**: Hard ship date 2026-06-16, 39 days from start. Cuts are non-negotiable; the brief's "hard floor" (vault + dashboard with live SVI) is the primary path, not the fallback.
- **Team**: Solo builder. No parallelizable second pair of hands; sequencing matters more than it would on a team build.
- **Smart contracts**: Move on Sui. Mainnet redeploy must execute by submission, not just be planned.
- **Quant work bar**: Hedge pricing must be mathematically correct (SVI evaluator audited against Gatheral paper); sizing is fixed at v1 but parameterized for future dynamic policies.
- **Backtest integrity**: Lookahead-bias audit is required before any backtest number is published. Manual cross-checks on PnL distribution, drawdown, and hedge cost.
- **Tech stack**: Move (vault), Python numpy/pandas (backtest), Node.js or Rust event-subscription service, React + TypeScript + Plotly + Recharts (dashboard), DeepBookV3 SDK + DeepBook Predict package + deepbook_margin.
- **Data**: `predict-server.testnet.mystenlabs.com` indexer + Sui RPC `OracleSVIUpdated` event subscriptions; BTC historical data for backtest.
- **Composability primitives that must be load-bearing**: Programmable Transaction Blocks, Move object model, BalanceManager + TradeCap pattern, shared objects, Move events.
- **Submission**: Working end-to-end testnet flow + mainnet redeploy + handbook-grade backtest + demo video + documentation, all bundled by 2026-06-16.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Two-protocol PTB (Margin + Predict), not three (drop Iron Bank) | 39-day solo window. Brief's Week 6 cut. Iron Bank is the highest-risk integration; story still works without it. | — Pending |
| Fixed-ratio hedge sizing in v1, parameterized for future dynamic policies | Correct fixed sizing > buggy dynamic sizing under time pressure. Brief's Week 8 cut adopted up front. | — Pending |
| Mainnet redeploy in v1 scope (actual deploy, not just plan) | User decision. Handbook expects day-one redeploy; doing it real differentiates submission. | — Pending |
| Live SVI surface but no time-travel slider | Brief's Week 10 cut. Live plot is high-leverage; slider is polish. | — Pending |
| Quality bar over component count | User explicit: "I want everything to be quality." Vault math, backtest integrity, and dashboard polish take priority over breadth. | — Pending |
| BTC-only at v1 | Brief targets BTC for SVI/backtest; multi-asset is post-submission. | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-08 after initialization*
