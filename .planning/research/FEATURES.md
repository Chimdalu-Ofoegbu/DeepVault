# Feature Research

**Domain:** PLP+Hedge structured-product vault on Sui DeepBook Predict (Sui Overflow 2026 DeepBook track submission)
**Researched:** 2026-05-08
**Confidence:** HIGH for handbook-mapped requirements and Predict primitives (Sui docs + blog post + PROJECT.md), MEDIUM for institutional-LP dashboard conventions and DOV-comparable feature norms (multiple credible sources, no direct prior art on Sui), LOW for exact Overflow 2026 judging weights (handbook redirect to Notion did not return content; criteria inferred from prior Overflow + Devpost-class hackathon norms and PROJECT.md's stated panel composition).

## Feature Landscape

### Table Stakes (Handbook Compliance + Competitive Minimum)

Features a judging panel for a foundation-blessed DeepBook structured-product submission will assume exist. Missing any one of these = the submission reads as incomplete, regardless of how polished the rest is. These are non-negotiable for the 2026-06-16 ship target.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Move vault package with `vault::supply` / `vault::redeem` / `vault::rebalance` | Core artifact. A "structured-product vault" submission with no on-chain vault is not a submission. Maps to PROJECT.md Active. | MEDIUM | Vault is a shared object that wraps PLP shares + hedge inventory + accounting. Three entrypoints keep the public surface small and auditable. |
| Tokenized vault share (Move object, fungible-style) | Standard DOV/ERC-4626 expectation in DeFi: deposit → share, redeem → burn share. Without it, the vault is an opaque pool, not a composable position. | MEDIUM | Implemented as a Coin-like type or Object with metered supply. Share price = `total_assets / total_shares` accrues as PLP yield lands minus hedge cost. |
| PLP supply via `predict::supply` (vault deposits user quote → mints PLP) | Predict's table-stakes integration. The "PLP" half of "PLP+Hedge" is non-negotiable per Mysten's docs (LPs supply quote → receive PLP shares). | LOW | One PTB call into Predict's existing entrypoint. The vault holds PLP, not the user. |
| SVI-priced hedge mint via `predict::mint` (binary OTM positions sized fixed-ratio) | The "Hedge" half. Without it the product is just a PLP wrapper, which adds zero value over calling `predict::supply` directly. | HIGH | Theoretical binary price computed off OracleSVI parameters; sizing is fixed at v1 but **must be parameterized** so a future dynamic policy is a config swap (PROJECT.md Decision). |
| Hedge sell-back / roll handling near expiry | Without roll handling, the vault degrades into pure PLP after first expiry. Real LPs will not deposit into a strategy that silently turns into something else. | MEDIUM | Either sell hedge to settlement value pre-expiry, or mint replacement at next expiry. Document the rule, do not improvise. |
| Vault `rebalance` callable (manual trigger, on-chain) | Demonstrates the strategy is executable and inspectable on-chain rather than gated behind off-chain keepers. PROJECT.md explicitly puts solver/keeper out of scope but keeps this on-chain entrypoint in. | MEDIUM | Permissionless or guardian-gated. Idempotent. Emits event with before/after state for dashboard. |
| Withdrawal queue with token-bucket limiter | Predict's own withdrawal limiter exists at the protocol level. The vault inherits that constraint; users will hit it under stress and need a queued exit, not a revert. Also signals "we know this can deadlock and we engineered around it." | MEDIUM | Token-bucket: refill rate = expected sustainable outflow, capacity = burst tolerance. Queue serves users FIFO when bucket empty. |
| End-to-end testnet flow against current Predict contracts | Handbook-class baseline: judges expect to be able to actually run the thing. PROJECT.md mandates weekly Monday version check. | MEDIUM | Single deposit → hedge → settle → redeem cycle scripted, reproducible from the README. |
| Mainnet redeploy executed before submission | PROJECT.md Decision: "actually deploy, not just plan." Differentiator vs. submissions that ship testnet-only. | MEDIUM | USDsui + Predict mainnet contracts. Even one $50 LP deposit on mainnet is a credibility multiplier. |
| Python backtest harness with 30+ days of replayed BTC history | Handbook-required ("proper simulation result if you are building a vault strategy"). Non-negotiable per PROJECT.md Context. | HIGH | numpy/pandas; replay loop iterates oracle ticks; PnL accounting includes PLP yield, hedge premium paid, hedge payoff at expiry, fees. |
| Lookahead-bias audit (assumption ledger + manual cross-checks) | A backtest showing fantasy returns gets thrown out (PROJECT.md Context: "80% APY with no drawdown is buggy"). Audit is the difference between credible numbers and noise. | MEDIUM | Explicit ledger of every "what was knowable when" decision. Manual recompute of PnL for ~5 sample windows. |
| Drawdown + stress-event coverage in backtest | Institutional LPs care about max drawdown more than headline APY. Replay must include at least one stress event (e.g., 2024-08-05 yen carry unwind, 2025-02-03 BTC flash). | MEDIUM | Report max DD, time-to-recovery, hedge contribution during stress vs. PnL drag in calm regimes. |
| Two-protocol PTB opener (DeepBook Margin borrow → Predict PLP supply + hedge mint, atomic) | The flagship composability moment. PROJECT.md keeps this as the single PTB demo after dropping Iron Bank. Sui's PTBs are the load-bearing primitive Mysten is selling. | HIGH | Single PTB, up to 1024 commands, atomic rollback. Output of margin borrow flows into Predict supply input within the same block. |
| Live SVI surface plot streamed from `OracleSVIUpdated` events | The dashboard's signature visual. PROJECT.md flags as "high-leverage piece." Streams via WebSocket from a Node/Rust event subscriber. | HIGH | 3D Plotly surface; redraw on event tick. Smooth interpolation across log-moneyness × time-to-maturity. |
| Arbitrage-free checker (butterfly + calendar violation flags) | Gatheral-paper-grade no-arb check. Without it, the SVI surface is "pretty picture"; with it, it is a risk control. Institutional dashboards (FlashAlpha, eSSVI) treat this as standard. | MEDIUM | Compute g(k) for butterfly check and calendar monotonicity per Gatheral & Jacquier 2014. Flag slices that violate. |
| Vault deposit / withdraw / position viewer with PnL attribution | Basic frontend. Without it, users (and judges) cannot interact with the deployed vault. Show PnL split: PLP yield vs. hedge cost vs. hedge payoff. | MEDIUM | React + TS + Recharts. Wallet adapter. Read shares, NAV, pending withdrawals. |
| Demo video (~3 min) showing single PTB opening Margin + Predict + vault share atomically | Hackathon convention: under-3-min screencast with narration; show problem → solution → live demo. Single-PTB moment is the climax. | LOW | Record once, edit. Show wallet diff before/after the PTB to make atomicity visible. |
| README + architecture diagram + strategy whitepaper | Standard Web3 hackathon submission expectation. The whitepaper is what carries the "institutional-LP grade" claim outside the dashboard. | MEDIUM | README: quickstart + testnet+mainnet addresses + reproducible scripts. Whitepaper: strategy thesis, hedge math, backtest summary, risk disclosures. |
| Submission package complete by 2026-06-16 | Hard deadline (PROJECT.md Constraints). Hackathon closes 2026-06-20 as backstop. | LOW | Devpost-style submission: video + repo + writeup + addresses. |

### Differentiators (Foundation-Aligned, Institutional Story)

Features that turn "another DeFi vault" into "the flagship demo of what DeepBook composability means." These are where the submission competes against other DeepBook-track entries. PROJECT.md explicitly states quality > component count, so each differentiator below is chosen because it raises the credibility ceiling without expanding surface area.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Vault share usable as collateral in DeepBook Margin | The "third primitive" composability narrative made concrete: a Predict-backed share consumed by Margin in the same demo. This is exactly the "spreads and structured products become a question of UX, not infrastructure" story Mysten is selling. | HIGH | Requires share to be either a Coin or to register with Margin's collateral whitelist. Even a single demo path (not a generic collateral type) is enough for the narrative. |
| Documented LTV math bounded against worst-case Predict outcomes | The "is this safe under leverage?" question every institutional LP asks. Answers it on paper before judges have to. | MEDIUM | Liquidation path math: max loss on hedge book at any oracle settlement → derive safe LTV. Test cases at boundary. |
| What-if scenario simulator: PLP PnL under ±5σ BTC moves | Differentiator over read-only dashboards. A judge clicks a slider and sees vault NAV under stress. Carries the "we modeled this, here's the receipt" story. | MEDIUM | Closed-form: take current SVI surface + vault state, shift spot ±5σ, reprice PLP and hedge. No Monte Carlo needed for v1. |
| Per-oracle exposure panel | Shows the vault's exposure decomposed by oracle (BTC at v1, but the panel structure signals multi-asset readiness). Institutional-grade transparency. | LOW | Just a sum/group. Cheap to ship; reads as professional. |
| Vault utilization + withdrawal-limiter token-bucket state visualization | Makes the protocol-level safety primitive visible. Live gauge showing "you can withdraw X right now, queue length Y." Reads as "we engineered for failure modes." | LOW | Two gauges + queue length number. Pulls from on-chain state. |
| Exportable backtest report (PDF/HTML, institutional-LP grade) | The static deliverable the whitepaper references. Carries assumptions, methodology, results tables, drawdown chart, hedge contribution decomposition. The artifact a real LP would forward to their CIO. | MEDIUM | Generated from backtest harness. Templated. Includes the lookahead-bias audit log as an appendix. |
| Strategy whitepaper (Gatheral-style, not blog-style) | The piece that makes "institutional-grade" non-marketing. Cites the SVI paper, derives the hedge price formula, declares the sizing policy and its bounds, lists known limitations. | MEDIUM | 6-12 pages. Math notation. References. Risk disclosures section is non-optional. |
| Wallet diff visualization in demo video (before/after the single PTB) | Makes atomicity legible to a non-Sui-native judge. "These three protocol positions appeared from one click" is the moment. | LOW | Two side-by-side wallet screenshots in the video, with arrows. Production value, not engineering. |
| Mainnet deployment with one real LP deposit (even small) | Differentiator over the median submission that ships testnet only. PROJECT.md already mandates the redeploy; one real deposit on mainnet upgrades it from "deployed" to "live." | LOW | $50 self-deposit. Document the tx hash in README. |
| Event-driven architecture (Node or Rust subscriber → WebSocket → frontend) | Demonstrates Sui Move events as a load-bearing primitive (PROJECT.md Constraints). Real-time SVI updates would not work without it; doing this well shows mastery. | HIGH | Maps `OracleSVIUpdated` → in-memory surface state → WS broadcast. Reconnect logic, event replay on reconnect. |
| Reproducible run script from README (one command → testnet deposit → hedge → redeem) | Judges' time is finite. A `make demo` that walks the flow is the difference between "they reviewed it" and "they actually ran it." | LOW | Bash script + `.env.example`. Idempotent. |
| Public mainnet & testnet contract addresses + verified source | Standard institutional-DeFi expectation. Reads as professional; absence reads as amateur. | LOW | Pin in README. Verify on Sui Explorer / Suiscan. |

### Anti-Features (Deliberately Excluded for the 39-Day Window)

Features that look good on paper, get requested under pressure, and would each individually consume a week the project does not have. Each is excluded with a written reason that should not be relitigated. **Cross-checked against PROJECT.md "Out of Scope" — items below either map directly to that list or are clarifying additions in the same spirit.**

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Iron Bank integration / three-protocol PTB | "More protocols = more composability." | Highest-risk integration. Brief's Week 6 cut. Mysten verdict: "story still works without it." Two-protocol PTB is already a flagship moment. (PROJECT.md OOS) | Two-protocol PTB (Margin + Predict). Document Iron Bank as a future integration in the whitepaper. |
| Dynamic hedge sizing function | "Adaptive sizing reads as more sophisticated." | Brief's Week 8 cut. Buggy dynamic sizing destroys backtest credibility; correct fixed sizing does not. (PROJECT.md OOS) | Fixed-ratio sizing in v1, **parameterized** so a future dynamic policy is a config swap, not a rewrite. Whitepaper documents the sizing decision and its rationale. |
| Time-travel slider on the SVI surface | "Lets you see how the surface evolved." | Brief's Week 10 cut. Live plot is the high-leverage piece; replay is polish that adds frontend state machine complexity. (PROJECT.md OOS) | Live plot only. Static surface snapshots from key dates appear in the whitepaper. |
| Live drawdown replay as a dashboard widget | "Shows how the vault would have performed during 2022 LUNA." | Backtest output is a static institutional report, not a live widget. Live replay requires keeping the harness state in the frontend, doubling the surface. (PROJECT.md OOS) | Static PDF/HTML backtest report linked from the dashboard. |
| Live delta/gamma/vega/vanna panels for the binary book | "Real options dashboards have full Greeks." | Useful but not on the critical path. Backtest + arbitrage-free checker carry the "is this safe?" story already. (PROJECT.md OOS) | Mention as future dashboard panels in whitepaper. Compute Greeks once for the demo state and screenshot in the whitepaper. |
| Multi-asset support beyond BTC | "More markets = more TAM." | Brief targets BTC for SVI/backtest. Each new asset is a new oracle integration + backtest data pipeline + risk model. (PROJECT.md OOS) | BTC only at v1. Per-oracle exposure panel structure is multi-asset-ready, so adding ETH later is not a rewrite. |
| Permissionless vault factory / curator framework | "Lets anyone launch a vault." | DeepVault is one curated strategy at v1. A factory implies governance, parameter validation framework, isolation between vaults — easily a 3-week distraction. (PROJECT.md OOS) | Single vault, one strategy, one curator (the team). Document factory as v2. |
| Solver / keeper infrastructure for hedge rebalancing | "Real protocols have automated keepers." | Off-chain solver = new infrastructure surface (deployment, monitoring, key management) on the critical path. Manual rebalance + on-chain `vault::rebalance` callable is enough for the demo. (PROJECT.md OOS) | Document the rebalance trigger logic in the whitepaper. Show one manual rebalance in the demo video. |
| Governance token / DAO module | "DeFi protocols ship governance." | Adds a token contract, voting infrastructure, and ZERO product value for a hackathon submission. | None. Vault is curator-administered at v1. |
| Cross-chain bridge for the share token | "Bridged shares = bigger reach." | Bridge integration is a separate protocol surface and a security category in itself. | Sui-native only. |
| Real-time mobile app | "Mobile-first DeFi." | Frontend complexity doubles. Web responsive is the norm. | Responsive web dashboard. |
| Generic ERC-4626-equivalent vault standard adapter | "Cross-ecosystem composability." | Sui has no canonical share standard; building one for one vault is yak-shaving. | Move-native share type. Whitepaper notes the design follows ERC-4626 conventions in spirit. |
| Audit (third-party) before submission | "Real protocols are audited." | Time and cost. Out of scope for a hackathon timeline. | Risk disclosures section in whitepaper explicitly states "unaudited; do not deposit beyond the demo amount." |
| Insurance fund / safety module | "Safety net for LPs." | Adds a second pool to track, withdrawal logic, fee routing. Not on critical path for the structured-product story. | Disclosed in risk section: at v1, max loss is bounded by hedge book design, not by insurance. |
| AI / ML overlay on hedge sizing | Generic hackathon temptation. | Destroys backtest credibility. ML in DeFi is a red flag for the finance-leaning judge panel. | Math-first sizing policy. Cite Gatheral. |

## Feature Dependencies

```
[Move vault package]
    ├──requires──> [Tokenized vault share type]
    │                   └──enables──> [Share as Margin collateral (differentiator)]
    │
    ├──requires──> [predict::supply integration (PLP)]
    │                   └──enables──> [Vault holds PLP, share NAV reflects PLP value]
    │
    ├──requires──> [predict::mint integration (hedge)]
    │                   ├──requires──> [SVI-priced hedge math]
    │                   │                  └──requires──> [OracleSVI parameter read]
    │                   └──requires──> [Hedge sell-back / roll handling near expiry]
    │
    ├──requires──> [vault::rebalance entrypoint]
    │                   └──emits──> [Rebalance event consumed by dashboard]
    │
    └──requires──> [Withdrawal queue + token-bucket limiter]

[Two-protocol PTB opener]
    ├──requires──> [Move vault package fully working]
    ├──requires──> [DeepBook Margin borrow path tested]
    ├──requires──> [Predict supply + mint path tested]
    └──requires──> [BalanceManager + TradeCap pattern correctly wired]

[PLP Risk Studio dashboard]
    ├──requires──> [Event subscription service (Node/Rust → WebSocket)]
    │                   └──streams──> [OracleSVIUpdated → live SVI surface plot]
    ├──requires──> [Arbitrage-free checker (Gatheral butterfly + calendar)]
    ├──requires──> [Vault state read (utilization, queue, per-oracle exposure)]
    └──enables──> [What-if simulator (uses surface + vault state)]

[Python backtest harness]
    ├──requires──> [BTC historical price + oracle SVI param history]
    ├──requires──> [Strategy logic faithfully replicated (must match Move)]
    ├──requires──> [Lookahead-bias audit + assumption ledger]
    └──produces──> [Exportable backtest report → cited in whitepaper]

[Mainnet redeploy]
    ├──requires──> [Testnet flow verified end-to-end]
    ├──requires──> [Weekly Monday Predict version check (PROJECT.md)]
    └──requires──> [USDsui + Predict mainnet contract addresses pinned]

[Demo video]
    ├──requires──> [Two-protocol PTB working]
    ├──requires──> [Dashboard live]
    └──requires──> [Mainnet redeploy (or testnet if mainnet slips)]

[Submission package]
    ├──requires──> [Demo video]
    ├──requires──> [README + architecture diagram + whitepaper]
    ├──requires──> [Backtest report]
    └──requires──> [Mainnet + testnet addresses + verified source]
```

### Dependency Notes

- **Vault share type → Margin collateral path:** The share's Move type design constrains whether Margin can accept it. Settle this on Day 1 to avoid a late refactor.
- **predict::mint hedge path → SVI math:** Hedge price is computed from OracleSVI parameters off-chain (or in Move) before calling mint. Whichever is chosen is load-bearing for both vault and backtest, so they MUST share the same evaluator (or the backtest is fiction).
- **Backtest → Move strategy parity:** If the Python harness and Move vault disagree on strategy logic, the backtest is meaningless. A small fixture cross-check (run both on identical inputs, compare outputs to N decimals) is essential and lives in CI.
- **Event subscriber → live SVI surface:** No subscriber = no live plot = no signature dashboard moment. This is the dashboard's load-bearing dependency.
- **Arbitrage-free checker → SVI surface:** The check runs on the same surface the plot displays. Same evaluator, called twice. Do not duplicate.
- **Two-protocol PTB → BalanceManager + TradeCap:** DeepBook's account model. Wire it correctly once; reuse across all PTB demo paths.
- **Mainnet redeploy → Predict mainnet contracts existing:** Predict launched on testnet 2026-05-05. Mainnet timing is the unstated risk. **If Predict mainnet does not ship before 2026-06-16, mainnet redeploy degrades to "deploy what we can on mainnet (vault + Margin path) + testnet-only Predict path with a documented reason."** PROJECT.md should be updated if this risk materializes.
- **Conflict — solver/keeper vs. manual rebalance:** If a solver is added under pressure, the on-chain `vault::rebalance` callable becomes redundant infra. Stay on manual.
- **Conflict — dynamic hedge sizing vs. backtest credibility:** Dynamic sizing within the 39-day window almost certainly produces a buggy backtest. Stay on fixed-ratio.

## MVP Definition

### Launch With (v1 = the 2026-06-16 submission)

The minimum bundle that constitutes a competitive Sui Overflow 2026 DeepBook-track submission. Anything not on this list is either a differentiator (already listed above) or excluded.

- [ ] Move vault package (`supply` / `redeem` / `rebalance`) — core artifact
- [ ] Tokenized vault share — composability prerequisite
- [ ] PLP supply via `predict::supply` — table stakes
- [ ] SVI-priced hedge mint via `predict::mint`, fixed-ratio, parameterized — the strategy
- [ ] Hedge sell-back / roll handling — vault must survive expiries
- [ ] Withdrawal queue + token-bucket limiter — required for stress paths
- [ ] Two-protocol PTB opener (Margin + Predict) — flagship composability moment
- [ ] Python backtest harness with 30+ days of history + lookahead audit + drawdown report — handbook requirement
- [ ] Live SVI surface plot streamed from `OracleSVIUpdated` — dashboard signature
- [ ] Arbitrage-free checker (butterfly + calendar) — Gatheral-grade no-arb check
- [ ] What-if ±5σ simulator + utilization + per-oracle exposure + limiter gauge — risk panels
- [ ] Vault deposit / withdraw / position viewer — basic UX
- [ ] Testnet end-to-end flow + mainnet redeploy with one real deposit
- [ ] Demo video (~3 min, screencast + narration) showing the PTB and dashboard
- [ ] README + architecture diagram + strategy whitepaper + exported backtest report

### Add After Validation (v1.x post-submission)

Features to add once the submission has shipped and feedback has landed.

- [ ] Dynamic hedge sizing function (config swap into the parameterized sizing policy) — trigger: backtest shows fixed-ratio leaves obvious alpha on the table
- [ ] Time-travel slider on the SVI surface — trigger: post-submission polish window
- [ ] Live drawdown replay widget — trigger: institutional LP feedback requesting interactive backtest
- [ ] Live Greeks panels (delta/gamma/vega/vanna for the binary book) — trigger: dashboard usage shows demand
- [ ] Iron Bank / third-protocol PTB extension — trigger: post-submission integration window with proper testing budget

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] Multi-asset support (ETH, SOL, etc.) — defer until BTC vault has real TVL and oracle universe is mapped
- [ ] Permissionless vault factory / curator framework — defer until single vault has track record
- [ ] Solver / keeper infrastructure — defer until manual rebalance frequency justifies automation cost
- [ ] Third-party audit — defer until post-submission, before any TVL push
- [ ] Insurance fund / safety module — defer until TVL > capacity of curator-funded buffer
- [ ] Cross-chain share bridging — defer indefinitely; Sui-native is the thesis

## Feature Prioritization Matrix

P1 = must have for submission. P2 = differentiator on the table for the 39-day window. P3 = post-submission.

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Move vault package (supply/redeem/rebalance) | HIGH | MEDIUM | P1 |
| Tokenized vault share | HIGH | MEDIUM | P1 |
| PLP supply integration | HIGH | LOW | P1 |
| SVI-priced hedge mint (fixed-ratio, parameterized) | HIGH | HIGH | P1 |
| Hedge sell-back / roll handling | HIGH | MEDIUM | P1 |
| Withdrawal queue + token-bucket limiter | MEDIUM | MEDIUM | P1 |
| Two-protocol PTB opener (Margin + Predict) | HIGH | HIGH | P1 |
| Python backtest + lookahead audit + drawdown report | HIGH | HIGH | P1 |
| Live SVI surface plot | HIGH | HIGH | P1 |
| Arbitrage-free checker | HIGH | MEDIUM | P1 |
| What-if ±5σ simulator | HIGH | MEDIUM | P1 |
| Utilization + limiter + per-oracle panels | MEDIUM | LOW | P1 |
| Vault deposit/withdraw/position UI | HIGH | MEDIUM | P1 |
| Testnet flow + mainnet redeploy | HIGH | MEDIUM | P1 |
| Demo video | HIGH | LOW | P1 |
| README + architecture diagram + whitepaper + backtest report | HIGH | MEDIUM | P1 |
| Vault share as Margin collateral (live demo path) | HIGH | HIGH | P2 |
| LTV math documented + tested | MEDIUM | MEDIUM | P2 |
| Exportable backtest report (polished, institutional format) | HIGH | MEDIUM | P2 |
| Wallet-diff visualization in demo video | MEDIUM | LOW | P2 |
| Reproducible `make demo` script | MEDIUM | LOW | P2 |
| Mainnet deployment with one real LP deposit | MEDIUM | LOW | P2 |
| Verified source on Sui Explorer | MEDIUM | LOW | P2 |
| Dynamic hedge sizing | MEDIUM | HIGH | P3 |
| Time-travel slider | LOW | MEDIUM | P3 |
| Live drawdown replay widget | LOW | MEDIUM | P3 |
| Live Greeks panels | MEDIUM | HIGH | P3 |
| Iron Bank / third-protocol PTB | MEDIUM | HIGH | P3 |
| Multi-asset support | HIGH | HIGH | P3 |
| Vault factory | LOW | HIGH | P3 |
| Solver / keeper | LOW | HIGH | P3 |
| Third-party audit | HIGH | HIGH | P3 |

## Competitor / Reference Feature Analysis

DeepVault is genre-creating on Sui (no direct prior art on DeepBook Predict). Comparable reference points come from EVM/Solana DOVs and from how institutional LP dashboards are built. These are reference points for what the panel will benchmark against, not direct competitors.

| Feature | Ribbon Finance (EVM, DOV) | Friktion (Solana, DOV) | Gauntlet (institutional vault curator) | DeepVault (our approach) |
|---------|---------------------------|------------------------|----------------------------------------|--------------------------|
| Share token | yToken (ERC-20) | fcToken (Solana) | ERC-4626 share | Move object share, designed Margin-collateral-ready |
| Strategy transparency | V2 added on-chain algorithmic strike selection | Crab/IL strategies, off-chain timing | Backtest + benchmarking VaultBook | On-chain rebalance + whitepaper math + Python backtest, with Move ↔ Python parity check |
| Risk dashboard | Per-vault page, basic metrics | Vault metrics page | Backtest + benchmarking site | Live SVI surface + arb-free checker + ±5σ simulator + utilization gauge |
| Backtest published | Limited public backtests | Limited public backtests | VaultBook backtest reports | Institutional-grade exportable report with lookahead-audit appendix |
| Composability with leverage | None at protocol level | None at protocol level | Limited | Vault share as DeepBook Margin collateral via PTB (the differentiator) |
| Atomicity guarantee | Multi-tx flows | Multi-tx flows | Multi-tx flows | Single-PTB atomic open/close (Sui-native advantage) |
| Hedge transparency | Strike selection on-chain (V2) | Off-chain | N/A (curator) | SVI-priced from oracle params, sizing parameterized, math in whitepaper |

**Reference takeaway:** Ribbon and Friktion set the user-facing bar for DOVs (share tokens, strategy automation, transparent strikes). Gauntlet sets the bar for institutional-grade backtest documentation. DeepVault's edge is **composability via PTBs** (which neither EVM nor Solana DOVs can match natively) and **risk dashboard depth** (live SVI surface + no-arb check is more rigorous than the typical DOV product page). The two-protocol PTB plus the dashboard are the differentiating story; the rest is hygiene.

## Sources

Primary (HIGH confidence):
- [PROJECT.md (DeepVault scope, cut-lines, out-of-scope)](C:/Users/Ben/Desktop/B3NSAG3/Hackathons/DeepVault/.planning/PROJECT.md)
- [DeepBook Predict — Sui Documentation](https://docs.sui.io/onchain-finance/deepbook-predict/) — confirms `predict::supply`, PLP shares, OracleSVI, max payout coverage, withdrawal limiter
- [Introducing DeepBook Predict — Sui Blog](https://blog.sui.io/introducing-deepbook-predict/) — confirms "third primitive" framing, composability with Spot + Margin, structured-product use case
- [Programmable Transaction Blocks — Sui Documentation](https://docs.sui.io/concepts/transactions/prog-txn-blocks) — confirms atomicity, 1024 commands, multi-protocol composition
- [Composability Through Different Lenses: PTBs and EIP-7702 — Sui Blog](https://blog.sui.io/composability-ptb-eip7702/) — Sui's framing of PTB advantage
- [BalanceManager SDK — Sui Documentation](https://docs.sui.io/standards/deepbookv3-sdk/balance-manager) — confirms BalanceManager + TradeCap pattern
- [DeepBook Margin — DeepBook](https://www.deepbook.tech/margin) — modular components, yield-bearing receipts as composable collateral
- [DeepBook: Spot & Margin Primitives for Builders — Sui Blog](https://blog.sui.io/deepbook-spot-margin-primitives-for-builders/) — aTokens / vault share as composable collateral

Secondary (MEDIUM confidence):
- [Arbitrage-free SVI volatility surfaces — Gatheral & Jacquier 2014 (arXiv)](https://arxiv.org/pdf/1204.0646) — butterfly + calendar no-arb conditions; the canonical reference the whitepaper must cite
- [No arbitrage SVI — Martini & Mingone 2020 (arXiv)](https://arxiv.org/pdf/2005.03340) — extended no-arb framework
- [Volatility Surface API — FlashAlpha Research](https://flashalpha.com/articles/volatility-surface-api-how-to-build-visualize-trade-iv-surface) — institutional dashboard feature norms (50×50 grid, arbitrage flags, Greeks surfaces)
- [eSSVI Implied Volatility Surface (PDF)](https://assets.ctfassets.net/lmz2w5z92b9u/2dxRCEEtmhqW8eEOo3VX0C/08984ff2b1ce811e2ebeeea57266bec5/eSSVI_Implied_Volatility_WP_FY20.pdf) — institutional eSSVI conventions
- [Vaultification of Everything — STFX (Medium)](https://medium.com/coinmonks/vaultification-of-everything-fb0aef48763) — DOV / structured product feature norms
- [Ribbon Finance & DOV Strategies — verse2 (Medium)](https://medium.com/verse2/ribbon-finance-series-1-ribbon-finance-and-dov-defi-option-vault-strategies-a8f43853cc35) — Ribbon V2 algorithmic strike selection, share token design
- [Evolution of DeFi Option Vault — Anderson Chen](https://andersonchen.substack.com/p/technologies-of-defi-option-vault) — DOV evolution, transparency
- [Why ERC-4626 Changed DeFi Forever (Medium)](https://medium.com/@imamahmadn16/why-erc-4626-changed-defi-forever-the-foundation-of-the-vault-era-fe16fd97faf0) — share-token vault standard conventions
- [The Complete Guide to DeFi Vaults in 2026 — Defiprime](https://defiprime.com/defi-vaults-guide) — curated vault expectations, institutional adoption
- [Auditing Vault-Based Protocols in DeFi — Cantina](https://cantina.xyz/blog/auditing-vault-based-protocols-in-defi) — vault audit checklist, withdrawal/timelock norms
- [Look-Ahead Bias in Backtests — Medium](https://mikeharrisny.medium.com/look-ahead-bias-in-backtests-and-how-to-detect-it-ad5e42d97879) — lookahead-bias detection methodology
- [Backtest and Benchmarking — Gauntlet VaultBook](https://vaultbook.gauntlet.xyz/gauntlet-usd-alpha-vault/backtest-and-benchmarking) — institutional backtest report format reference
- [EIP-7265 Circuit Breaker — referenced via DeFi Vault auditing material](https://cantina.xyz/blog/auditing-vault-based-protocols-in-defi) — token-outflow rate limiter standard

Tertiary (LOW confidence — hackathon-norm inferences, not verified Overflow 2026 specifics):
- [Sui Overflow 2026 Hackathon (overflow.sui.io)](https://overflow.sui.io/) — confirms DeepBook track exists, points at participant handbook (handbook content was not retrievable in this research; PROJECT.md's stated handbook requirements were taken as authoritative for downstream planning)
- [6 Tips for making a winning hackathon demo video — Devpost](https://info.devpost.com/blog/6-tips-for-making-a-hackathon-demo-video) — under-3-min demo video conventions
- [Best Practices for Web3 Hackathon Submissions — HackQuest](https://www.hackquest.io/blog/Best-Practices-for-Successful-Web3-Hackathon-Project-Submissions) — README + architecture + video standards
- [Understanding Hackathon Submission and Judging Criteria — Devpost](https://info.devpost.com/blog/understanding-hackathon-submission-and-judging-criteria) — generic Innovation / Technical / UX / Impact framework

**Open verification gaps (flagged for downstream phases):**
- Overflow 2026 handbook content was not directly retrievable (Notion redirect returned no content). PROJECT.md's stated handbook requirements ("proper simulation result if you are building a vault strategy") are treated as authoritative; suggest re-fetching the handbook on the next browser session and reconciling any deltas. **Action: phase-1 deliverable should include a handbook re-fetch and a written reconciliation note.**
- Predict mainnet launch date is the load-bearing risk on the "mainnet redeploy" requirement. PROJECT.md acknowledges the weekly Monday version check; this research does not have a mainnet ETA. **Action: track in pitfall + risk register.**
- Vault share registration as a DeepBook Margin collateral type may require Mysten coordination (whitelist) rather than being permissionless. **Action: phase-1 spike to confirm whether the differentiator can ship without Mysten approval; if it cannot, demote to "documented future composability" and lean harder on the PTB story.**

---
*Feature research for: PLP+Hedge structured-product vault on Sui DeepBook Predict (Sui Overflow 2026 DeepBook track)*
*Researched: 2026-05-08*
