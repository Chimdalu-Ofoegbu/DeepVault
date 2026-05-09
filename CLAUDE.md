<!-- GSD:project-start source:PROJECT.md -->
## Project

**DeepVault**

DeepVault is a composable structured product on Sui's DeepBook Predict that fuses PLP (Predict Liquidity Provision) yield with automated tail-risk hedging, paired with an institutional-grade PLP Risk Studio dashboard streaming live SVI volatility surfaces. Built for Sui Overflow 2026's DeepBook specialized track ($70k pool), it targets institutional LPs and the foundation-blessed "third primitive in the DeepBook stack" narrative — a flagship demo of what Sui DeFi composability means.

**Core Value:** **A working PLP+Hedge vault on DeepBook Predict with a credible, auditable risk dashboard, deployed on mainnet by submission.** If everything else is cut, this single artifact — vault that sells "PLP yield minus crash insurance" plus a live SVI surface and what-if simulator — is a competitive, foundation-aligned submission. Quality of the vault math, the backtest, and the dashboard polish takes priority over component count.

### Constraints

- **Timeline**: Hard ship date 2026-06-16, 39 days from start. Cuts are non-negotiable; the brief's "hard floor" (vault + dashboard with live SVI) is the primary path, not the fallback.
- **Team**: Solo builder. No parallelizable second pair of hands; sequencing matters more than it would on a team build.
- **Smart contracts**: Move on Sui. Mainnet redeploy must execute by submission, not just be planned.
- **Quant work bar**: Hedge pricing must be mathematically correct (SVI evaluator audited against Gatheral paper); sizing is fixed at v1 but parameterized for future dynamic policies.
- **Backtest integrity**: Lookahead-bias audit is required before any backtest number is published. Manual cross-checks on PnL distribution, drawdown, and hedge cost.
- **Tech stack**: Move (vault), Python numpy/pandas (backtest), Node.js or Rust event-subscription service, React + TypeScript + Plotly + Recharts (dashboard), DeepBookV3 SDK + DeepBook Predict package + deepbook_margin.
- **Data**: `predict-server.testnet.mystenlabs.com` indexer + Sui RPC `OracleSVIUpdated` event subscriptions; BTC historical data for backtest.
- **Composability primitives that must be load-bearing**: Programmable Transaction Blocks, Move object model, BalanceManager + TradeCap pattern, shared objects, Move events.
- **Submission**: Working end-to-end testnet flow + mainnet redeploy + handbook-grade backtest + demo video + documentation, all bundled by 2026-06-16.
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## Recommended Stack
### Core On-Chain (Move)
| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|-----------|
| Sui CLI / `sui-node` | `mainnet-v1.71.1` (testnet `testnet-v1.71.1`) | Move toolchain, publish, local validator | Latest stable mainnet release as of 2026-05-06; protocol version 123. Pin this exact version because protocol upgrades land weekly and a mismatched local CLI vs network protocol breaks `sui client publish` | HIGH |
| Move Edition | `2024` | Smart contract language | The only valid edition value; required for current sui-framework | HIGH |
| `suiup` | latest | Toolchain version manager | Recommended way to switch between sui CLI versions; matters because mainnet vs testnet drift weekly. Easier than re-building from source for each version pin | HIGH |
| sui-framework | matches network | stdlib (Coin, Balance, Clock, event) | Comes from network protocol version; do not vendor it | HIGH |
| DeepBookV3 (Move package) | `predict-testnet-4-16` branch | Predict + Margin source-of-truth | Mysten documents Predict from this exact branch; the Predict source lives at `github.com/MystenLabs/deepbookv3/tree/predict-testnet-4-16/packages/predict`. Pin this branch in `Move.toml`; rev tag changes signal contract churn | MEDIUM (branch will move) |
| Object | Address | Notes |
|--------|---------|-------|
| Predict package | `0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138` | Pin in `vault/Move.toml` `[addresses]` |
| Predict registry | `0x43af14fed5480c20ff77e2263d5f794c35b9fab7e2212903127062f4fe2a6e64` | Shared object |
| Predict (top-level) | `0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a` | Shared object passed to `predict::supply` / `predict::mint` |
| Quote asset (DUSDC) | `0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC` | 6 decimals; testnet only |
| PLP token type | `0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138::plp::PLP` | LP share returned by `predict::supply` |
| Public Predict server | `https://predict-server.testnet.mystenlabs.com` | Off-chain index of vaults / portfolios / history |
### TypeScript Off-Chain (event service + dashboard)
| Library | Version | Purpose | Why Recommended | Confidence |
|---------|---------|---------|-----------------|-----------|
| `@mysten/sui` | `2.16.0` | Sui RPC client + transaction builder + BCS | Last published ~2026-04-18; this is the canonical SDK (replaced legacy `@mysten/sui.js`). Required for PTB construction in the dashboard and indexer | HIGH |
| `@mysten/dapp-kit` | `1.0.4` | React hooks for wallet + queries | Official wallet provider with auto-detection of all installed Sui wallets (Slush, Suiet, Backpack); wraps `@tanstack/react-query` so it's free for our event panel polling too | HIGH |
| `@mysten/deepbook-v3` | `0.17.0` | DeepBookV3 + Margin Manager TS SDK | The Margin Manager wrapper lives here (no separate `@mysten/deepbook-margin` package exists); provides `MarginPoolContract` and PTB builders for borrow/repay we need for the two-protocol opener | MEDIUM |
| `@tanstack/react-query` | `^5.x` | Async cache for RPC reads + dashboard refresh | Peer dep of dapp-kit; reuse it for our own RPC polling so cache + suspense are unified | HIGH |
| `@mysten/bcs` | matches `@mysten/sui` peer | BCS encode/decode for event payloads | Decoding `OracleSVIUpdated` event contents requires BCS; bundled but worth pinning explicitly so off-chain `parseSVIEvent()` doesn't drift | HIGH |
| Vite | `^7.x` | Frontend dev server + bundler | Standard React+TS scaffold; `npm create vite@latest -- --template react-ts` | HIGH |
| React | `^18.3.x` (or 19 if dapp-kit allows) | UI | Required by dapp-kit | HIGH |
| TypeScript | `^5.6+` | Types | Required by SDK type defs | HIGH |
| `plotly.js` | `3.5.1` | 3D SVI surface, 2D PnL distribution | Built-in `type: 'surface'` with x/y/z grid → strikes × tenors × IV is exactly the SVI surface shape; Plotly handles arbitrage-violation overlays via marker traces. WebGL renderer holds 60 fps for ~50×50 grids. Last published ~2026-05-05 | HIGH |
| `react-plotly.js` | `2.6.0` | React wrapper for plotly.js | The official wrapper; v2.6 is stable but unmaintained-feeling (last release 2022). Acceptable because it's a thin component wrapper — the engine is `plotly.js` 3.5.1 which IS active. If wrapper bugs bite, fall back to a 30-line custom hook calling `Plotly.newPlot()` directly | MEDIUM |
| `recharts` | `^2.15.x` | 2D risk panels (utilization, token-bucket state, deposits, exposure) | Component-based, declarative, fits React mental model. Plotly is overkill for these panels. Use Recharts for everything except the 3D surface | HIGH |
| `vitest` | `^4.1.x` | Unit tests for indexer + frontend | 4.1.5 is current; ~10x faster cold start than Jest, native ESM, zero-config with Vite | HIGH |
| `@testing-library/react` | `^16.x` | Component tests | Standard React testing | HIGH |
### Off-Chain Event Service
| Library | Version | Purpose |
|---------|---------|---------|
| Node.js | `>= 22 LTS` | Runtime |
| `@mysten/sui` | `2.16.0` | `client.queryEvents({ MoveEventType: "...::oracle_svi::OracleSVIUpdated" }, cursor, limit)` — poll at 2s cadence, persist cursor to disk to survive restarts |
| `ws` | `^8.x` | Outbound WebSocket server pushing parsed events to dashboard |
| `pino` | `^9.x` | Structured logging — needed for "is the indexer alive?" diagnostics during demo |
| `dotenv` | `^17.x` | `.env` for package IDs (will change weekly) |
### Python Backtest Harness
| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| Python | `3.12+` | Runtime | 3.12 is the floor for current numpy/pandas; 3.13 fine but free-threaded support still maturing — stick with 3.12 |
| `numpy` | `>= 2.4.x` (current series) | Vectorized SVI eval, PnL math | numpy 2.x is universally adopted by 2026; explicitly pin `>=2.0` |
| `pandas` | `>= 2.2.x` | OHLC ingestion, replay loop, drawdown calc | First version with full numpy 2 compat is 2.2.0; 2.2+ ships in current ecosystem |
| `scipy` | `>= 1.14.x` | Brent root-finder for IV inversion (if needed); `scipy.optimize.minimize` for SVI calibration validation | Backtest needs to verify on-chain SVI params reprice correctly; SLSQP minimizer is the Gatheral-paper-standard calibration tool |
| `matplotlib` | `>= 3.9.x` | Static report charts (PnL distribution, drawdown waterfall) | Institutional-LP backtest report is a static PDF/HTML; matplotlib renders cleaner static figures than Plotly for that use case |
| `pyarrow` | `>= 18.x` | Parquet read/write for replayed BTC bars | Parquet is the only sane format for 30+ days of minute-bar BTC data; pandas reads parquet via pyarrow natively |
| `pytest` | `>= 8.3.x` | Test SVI evaluator, lookahead-bias guards | Standard; required for the "manual cross-check" testbed in the brief |
| `requests` | `>= 2.32.x` | BTC OHLC ingestion from Binance/CoinGecko | One-time download; requests is fine, no need for httpx |
| Source | Pro | Con | Verdict |
|--------|-----|-----|---------|
| CryptoDataDownload (Binance OHLCV CSV) | One-time download, no API key, no rate limit | CSV parsing | RECOMMENDED for backtest. Daily/hourly bars, full history |
| Binance public REST API | Free, generous limits, tick-level if needed | Pagination dance for >1000 bars | Use if you need minute bars beyond what CSV provides |
| CoinGecko API | Easy `/coins/bitcoin/ohlc` | Rate-limited free tier (~10/min) | Backup only |
| CoinAPI | Pro-grade | Paywalled beyond ~free tier | Skip for hackathon |
### Wallet & PTB Construction
| Item | Choice | Rationale |
|------|--------|-----------|
| Primary wallet | **Slush** (extension + mobile) | Official Mysten wallet (rebrand of Sui Wallet + Stashed, completed 2025); zkLogin built in, required for Mysten-judged demos |
| Secondary wallet | Suiet, Backpack | Auto-supported via `@mysten/dapp-kit` Wallet Standard — zero extra code |
| Wallet connect lib | `@mysten/dapp-kit` `WalletProvider` + `ConnectButton` | One component, zero custom modal code |
| PTB builder | `@mysten/sui` `Transaction` class | Compose Margin borrow → Predict supply + mint in a single PTB; pass shared objects via `tx.sharedObjectRef({ objectId, mutable, initialSharedVersion })`. The two-protocol PTB opener (Margin + Predict + vault share emit) is the flagship composability moment |
### Predict Indexer / Server
| Endpoint | URL | Use |
|----------|-----|-----|
| Testnet Predict server | `https://predict-server.testnet.mystenlabs.com` | Markets, vaults, portfolio, history (REST/JSON). Use as primary read path for the dashboard's "vault utilization" and "per-oracle exposure" panels — saves us indexing those state shards ourselves |
| Testnet Sui RPC | `https://fullnode.testnet.sui.io` | Direct on-chain reads + `queryEvents` for `OracleSVIUpdated` |
| Mainnet Predict server | **Not yet announced** | Mysten committed to a mainnet launch "later in 2026" (post-testnet-launch 2026-05-05). Keep `PREDICT_SERVER_URL` in `.env`; assume `predict-server.mainnet.mystenlabs.com` shape but VERIFY before submission redeploy |
### CI / Test
| Tool | Purpose | Notes |
|------|---------|-------|
| Sui Move test framework | Move unit tests | `sui move test`; native, no separate runner. Test SVI math, hedge sizing, vault accounting on-chain |
| Vitest | TS unit + integration tests | Indexer event parsing, dashboard component tests |
| pytest | Python backtest invariants | Lookahead-bias guards, PnL conservation laws, drawdown sign checks |
| GitHub Actions | CI | Three workflows: `move-test.yml` (sui move build + test), `ts-test.yml` (vitest run + tsc), `py-test.yml` (uv run pytest). Pin Sui CLI version explicitly via `MystenLabs/sui-setup-action@v1` or download release binary for `mainnet-v1.71.1` |
## Installation
### Move package
# Pin sui CLI explicitly to avoid protocol-version drift
# Inside vault/Move.toml — pin DeepBookV3 by branch+rev, not by tag
# [dependencies.DeepBookV3]
# git = "https://github.com/MystenLabs/deepbookv3.git"
# subdir = "packages/predict"
# rev = "predict-testnet-4-16"
### Frontend / Indexer (single TS monorepo)
# Scaffold
# Sui + DeepBook + dapp-kit
# Charts
# Indexer
# Dev
### Backtest
# uv-managed Python project (pyproject.toml + uv.lock)
## Alternatives Considered
| Recommended | Alternative | When Alternative Wins | Decision |
|-------------|-------------|----------------------|----------|
| Node.js indexer | Rust indexer (`sui-sdk` crate) | If the project needed Sui checkpoint tailing, gRPC streaming, or sub-100ms event latency | **Node.js wins** — single language across UI + indexer, no perf ceiling for `queryEvents` at our cadence |
| Plotly for 3D surface | Three.js / react-three-fiber custom WebGL | If we needed bespoke shaders (e.g., animated arbitrage-violation regions) | **Plotly wins** — `type: 'surface'` is exactly our shape, ships in days not weeks, judges have seen Plotly look professional. Three.js for a 3-week budget is a polish trap |
| Plotly for 3D + Recharts for 2D | Plotly for everything | If you want one dependency | **Split wins** — Recharts is ~10× lighter for 2D panels and the React-component API is faster to iterate on for the 6+ small panels |
| `@mysten/sui` 2.16 | `@mysten/sui.js` (legacy) | Never (legacy, do not use new code on it) | **2.x wins** unconditionally |
| GraphQL for events | JSON-RPC `queryEvents` | After July 31, 2026 (JSON-RPC sunset) | **`queryEvents` wins for this project** — submission is 2026-06-16, ~6 weeks before sunset. GraphQL events query exists but lacks a stable real-time `subscription` operation; polling is identical cost in both. Stay on JSON-RPC, plan a GraphQL migration in post-submission backlog |
| `uv` for Python deps | Poetry | If publishing to PyPI as a library | **`uv` wins for app projects** — 10-100x faster, simpler, native lockfile |
| Custom SVI in numpy | QuantLib `SviSmileSection` | If you need extensive vol-surface tooling and don't mind 30 MB binary | **Custom wins** — 10 lines of numpy, auditable, no packaging headaches |
| CryptoDataDownload Binance CSV | CoinAPI / Bloomberg / etc | If you have institutional data budget | **Free CSV wins** for hackathon |
## What NOT to Use
| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `@mysten/sui.js` (note `.js`) | Legacy package; renamed to `@mysten/sui` in late 2024. Old tutorials reference `.js` — they're stale | `@mysten/sui@2.16.0` |
| `@mysten/wallet-kit` | Predecessor to `@mysten/dapp-kit`; deprecated | `@mysten/dapp-kit@1.0.4` |
| `subscribeEvent` (TS SDK) / WebSocket JSON-RPC | Returns 405 on most public RPC; deprecated. JSON-RPC entirely sunsets 2026-07-31 | `client.queryEvents()` polling at 2s cadence with persisted cursor |
| Three.js for the SVI surface | 2-3 weeks of WebGL bring-up for one chart; not on the 39-day path | `plotly.js` `type: 'surface'` |
| QuantLib (Python wrapper) | 30 MB binary, fragile install, overkill for 5-param SVI | ~10 lines of numpy from Gatheral §2 |
| Jest | Slow cold start; redundant config when Vite is already in stack | Vitest |
| Poetry (for new app projects) | 10-100× slower than uv; lockfile resolution is also slower | uv |
| pip + requirements.txt | No lockfile = backtest is not reproducible by graders | uv (or Poetry as fallback) |
| Iron Bank / 3-protocol PTB | Brief Week-6 cut already made; touching this is scope creep | Stay two-protocol (Margin + Predict) |
| Hardcoded Predict package IDs in source | Mysten WARNS contracts may change before mainnet | `.env` + `import { PREDICT_PACKAGE } from './config'`; mass-find-replace by editing one file |
| WebSocket `subscribeEvent` from `@mysten/sui` | See above — deprecated | Polling |
| Older Sui CLI (e.g. 1.66) | Protocol version mismatch with mainnet 1.71 → publish failures | `mainnet-v1.71.1` exact pin |
| Hand-rolled wallet connect | Reinvents Wallet Standard; breaks in Slush/Suiet/Backpack | `@mysten/dapp-kit` `ConnectButton` |
| `react-plotly.js` for state-heavy plots without `useMemo` | Re-renders entire WebGL canvas on every parent state change | Memoize the `data` and `layout` props; use `revision` prop to trigger redraw explicitly |
| Live-streaming raw on-chain reads to dashboard | Hammers the public RPC and looks janky | Predict server REST for state, `queryEvents` for SVI updates only, both behind `@tanstack/react-query` cache |
## Stack Patterns by Variant
- Single source of truth: `packages/contracts.ts` + `vault/Move.toml [addresses]` block
- All package IDs, object IDs, type tags imported from there
- Weekly Monday check: `git fetch origin predict-testnet-4-16 && git log HEAD..origin/predict-testnet-4-16` on the deepbookv3 repo
- If the Predict server URL pattern changes (e.g. testnet → mainnet), the env var `PREDICT_SERVER_URL` should be the only edit
- Add a parallel `mainnet` config block alongside `testnet`; do not overwrite testnet config
- Run both deploys in parallel until mainnet is verified, then submission demo uses mainnet
- Mainnet redeploy is in scope per project decision; budget 2-3 days for the verification + redeploy + retesting cycle
- First: memoize `data` prop in `react-plotly.js`
- Second: switch to `Plotly.react()` with the `revision` prop pattern instead of `<Plot>`
- Last resort: custom Three.js + r3f. Out of scope unless first two fail visibly in the demo
- Reduce `queryEvents` `limit` to 50, increase poll cadence to 1s
- Persist last-seen cursor every event, not every batch
- If still behind: use the Predict server's `/oracle-svi/history` endpoint (assumed to exist; verify) for catch-up, then resume tail polling
## Version Compatibility
| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `@mysten/sui@2.16.0` | `@mysten/dapp-kit@1.0.4` | dapp-kit 1.0.x peer-deps `@mysten/sui` ^2.x |
| `@mysten/sui@2.16.0` | `@mysten/deepbook-v3@0.17.0` | deepbook-v3 peer-deps `@mysten/sui` ^2.x |
| `@mysten/dapp-kit@1.0.4` | `@tanstack/react-query@^5` | Required peer; do not install v4 |
| Sui CLI `mainnet-v1.71.1` | `testnet-v1.71.1` | Same protocol version (123); publishing works against either |
| Sui CLI `mainnet-v1.71.1` | older networks (1.66, 1.70) | DO NOT — protocol version mismatch will reject txs |
| `numpy>=2.4` | `pandas>=2.2.0` | First pandas with full numpy-2 compat |
| `numpy>=2.4` | `scipy>=1.14` | First scipy with numpy-2 compat |
| `plotly.js@3.5.1` | `react-plotly.js@2.6.0` | wrapper is loose-pinned to plotly.js^2 in package.json but works with 3.x at runtime; smoke-test 3D surface render in CI |
| Vite 7 | React 18.3 / 19 | dapp-kit currently advertised on React 18; if upgrading to React 19, run a smoke test against `WalletProvider` |
## Confidence Per Recommendation
| Recommendation | Confidence | Why |
|---------------|------------|-----|
| Sui CLI 1.71.1, Move 2024 edition | HIGH | Verified via GitHub Releases page |
| `@mysten/sui` 2.16.0 | HIGH | Verified via npm registry |
| `@mysten/dapp-kit` 1.0.4 | HIGH | Verified via npm registry |
| `@mysten/deepbook-v3` 0.17.0 (Margin Manager included) | MEDIUM | Verified via npm; specific Margin testnet package IDs not yet found in public docs — must read source on `MystenLabs/deepbookv3` main branch |
| Predict testnet contract IDs | LOW-MEDIUM | Verified via Sui docs Contract Information page TODAY; but Mysten explicitly warns these will change before mainnet. Plan for churn |
| `OracleSVIUpdated` event signature | LOW | Documented as existing; exact Move struct fields not in public docs — must inspect `oracle_svi.move` directly. Indexer parser is the first thing to break on contract churn |
| Node.js over Rust for indexer | HIGH | Reasoning is timeline + perf budget, not ecosystem availability |
| Plotly for 3D surface | HIGH | Industry standard for vol surfaces; live SVI surface plot is what the brief calls "high-leverage" |
| Recharts for 2D panels | HIGH | Standard React financial-dashboard idiom |
| Custom SVI in numpy (no QuantLib) | HIGH | Gatheral formula is published, cited >1500 times, multiple OSS reference implementations |
| `queryEvents` polling (no GraphQL/gRPC migration) | HIGH for the 39-day window | JSON-RPC sunsets 2026-07-31, ~6 weeks after submission. GraphQL events lacks a real-time subscription op |
| `uv` for Python deps | HIGH | 2026 community consensus; pyproject.toml + uv.lock is reproducible |
| BTC data from CryptoDataDownload/Binance | HIGH | Free, no rate limits, full history |
## Critical Risk Flags
## Sources
### Authoritative (HIGH confidence)
- [Sui GitHub Releases](https://github.com/MystenLabs/sui/releases) — mainnet-v1.71.1 (May 6 2026), testnet-v1.71.1 (May 5 2026), protocol version 123
- [@mysten/sui on npm](https://www.npmjs.com/package/@mysten/sui) — 2.16.0
- [@mysten/dapp-kit on npm](https://www.npmjs.com/package/@mysten/dapp-kit) — 1.0.4
- [@mysten/deepbook-v3 on npm](https://www.npmjs.com/package/@mysten/deepbook-v3) — 0.17.0
- [DeepBook Predict | Sui Documentation](https://docs.sui.io/onchain-finance/deepbook-predict/) — branch reference, contract addresses page
- [Introducing DeepBook Predict | Sui Blog](https://blog.sui.io/introducing-deepbook-predict/) — testnet-live confirmation, Block Scholes oracle, mainnet "later in 2026"
- [Sui dApp Kit Docs](https://sdk.mystenlabs.com/dapp-kit) — wallet provider patterns
- [DeepBookV3 SDK | Sui Documentation](https://docs.sui.io/standards/deepbookv3-sdk) — Margin Manager included
- [Plotly.js 3D surface plots](https://plotly.com/javascript/3d-surface-plots/)
- [Sui Wallet → Slush rebrand announcement](https://www.mystenlabs.com/blog/sui-wallet-and-stashed-are-now-slush)
- [Vitest](https://vitest.dev/) — 4.1.5 latest
### Mysten + ecosystem (MEDIUM confidence)
- [Sui's Next Phase: JSON-RPC Sunset by 2026 (CoinChapter)](https://coinchapter.com/suis-next-phase-security-expansion-and-json-rpc-sunset-by-2026/) — JSON-RPC sunset 2026-07-31
- [GraphQL and Archival Store Complete the Sui Data Stack](https://blog.sui.io/graphql-archival-store-sui-data-stack/)
- [GitHub issue: deprecated subscribeEvent in sui docs](https://github.com/MystenLabs/sui/issues/19493)
- [Move Edition 2024 features](https://github.com/MystenLabs/sui/issues/14062)
- [DeepBook Margin docs](https://docs.sui.io/onchain-finance/deepbook-margin/)
### Reference implementations & papers (HIGH confidence on math, source of truth for SVI)
- [Arbitrage-free SVI volatility surfaces (Gatheral & Jacquier 2014)](https://archive.org/details/arxiv-1204.0646) — canonical paper
- [SVI tutorial — Simon Ellersgaard](https://sellersgaard.github.io/blog/2023/svi/) — Python reference impl
- [wangys96/SVI-Volatility-Surface-Calibration](https://github.com/wangys96/SVI-Volatility-Surface-Calibration) — calibration reference
- [JackJacquier/SSVI](https://github.com/JackJacquier/SSVI) — surface SVI parameterization
### Data
- [CryptoDataDownload Binance](https://www.cryptodatadownload.com/data/binance/) — free OHLCV CSV
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
