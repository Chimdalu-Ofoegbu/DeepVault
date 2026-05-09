# DeepVault

> A composable structured-product vault on Sui DeepBook Predict that fuses PLP yield with automated tail-risk hedging, paired with an institutional-grade SVI volatility-surface dashboard. Built for Sui Overflow 2026.

[![CI](https://github.com/<owner>/deepvault/actions/workflows/ci.yml/badge.svg)](https://github.com/<owner>/deepvault/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## Status

**Phase 0 (Setup & Ground Rules): COMPLETE.** Monorepo scaffolded, codegen wired (single-source `shared/strategy.toml` to Move/Python/TS), CI 5-job matrix in place, policy docs locked (CONTRIBUTING, HEDGE-POLICY, MAINNET-FUNDING, DEV-BOOTSTRAP, CI-BRANCH-PROTECTION), DeepBookV3 fork vendored at SHA `1159d79a`, weekly Monday Predict-diff sweep scheduled, hedge-ratio policy frozen (10% / -15% OTM / 14-day tenor / fixed sizing).

**Phase 1 (Math Foundation — SVI Parity Gate) is next-up:** three-runtime SSVI evaluator (Move + Python + TypeScript) with bit-for-bit golden-vector parity gating every later phase.

**Ship target:** 2026-06-16 (Sui Overflow 2026 submission). Hard ship: 39 days from 2026-05-09. Code freeze: 2026-05-30.

## Laypitch

DeepVault sells "PLP yield minus crash insurance" as a single deposit.

You put USDsui in. The vault routes ~90% to DeepBook Predict's PLP for yield, and ~10% buys binary tail hedges priced from a live SVI volatility surface (Gatheral & Jacquier 2014). When BTC tanks more than ~15%, the hedges pay; otherwise you collect the PLP fees minus a small hedge cost.

The flagship demo is a single Programmable Transaction Block (PTB) that opens three positions atomically — Margin borrow + vault deposit + Predict hedge mint — showcasing what "Sui composability" actually means at the protocol layer.

## Glossary

- **PLP** — Predict Liquidity Provider; the LP role inside DeepBook Predict's binary-options venue.
- **SVI** — Stochastic Volatility Inspired; a 5-parameter volatility-surface parameterization (Gatheral & Jacquier 2014).
- **Vault share** — `Coin<VAULT_SHARE>` representing pro-rata claim on vault NAV.
- **PTB** — Programmable Transaction Block; Sui's atomic multi-call primitive.
- **Hedge ratio** — Fraction of each new deposit routed to the hedge book (locked at 10% per `docs/HEDGE-POLICY.md`).
- **NAV** — Net Asset Value per share, anchored to the vault's PLP balance + hedge book mark-to-market.

## Architecture at a Glance

| Doc | Purpose |
|-----|---------|
| [`.planning/PROJECT.md`](.planning/PROJECT.md) | Scope, core value, cut-lines, key decisions |
| [`.planning/ROADMAP.md`](.planning/ROADMAP.md) | 7-phase plan (Setup → Math → Vault → Backtest+PTB → Dashboard → Mainnet → Submission), success criteria, hard policy locks |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Five hard policy locks: code freeze, no-refactor, no-dashboard-before-vault, hedge ratio, weekly Monday sweep |
| [`docs/HEDGE-POLICY.md`](docs/HEDGE-POLICY.md) | Locked hedge-ratio ADR (10% / -15% OTM / 14-day / fixed) — strategy frozen against hindsight tuning |
| [`docs/MAINNET-FUNDING.md`](docs/MAINNET-FUNDING.md) | Phase 5 mechanical playbook: $80 budget, two-wallet split, Cetus DEX swap path, AdminCap discipline |
| [`docs/CI-BRANCH-PROTECTION.md`](docs/CI-BRANCH-PROTECTION.md) | One-time GitHub setup: 5 required status checks, UI + gh CLI paths |
| [`docs/DEV-BOOTSTRAP.md`](docs/DEV-BOOTSTRAP.md) | One-shot dev-machine setup (Sui CLI, pnpm, uv, wallets) |

```
shared/strategy.toml ──> codegen.py ──┬──> contracts/sources/strategy_constants.move
                                      ├──> backtest/src/deepvault/strategy_constants.py
                                      └──> dashboard/src/lib/strategy_constants.ts

vault::supply / redeem / rebalance ──> predict::supply / mint
                                  └──> oracle_svi::OracleSVIUpdated event ──> indexer ──ws──> dashboard
```

Full architecture diagram: `.planning/research/ARCHITECTURE.md` (Phase 6 produces a polished PNG/SVG version per DEPLOY-07).

## Quick Start

After Phase 0 closes (this commit), the repo is fully reproducible from a fresh clone. Once it lives on GitHub (`gh repo create` is a Phase 0 outstanding human-action checkpoint, see SUMMARY) and CI has run once on `main`, this sequence works end-to-end:

```bash
git clone https://github.com/<owner>/deepvault.git
cd deepvault

# Install all toolchains (Move, TS, Python) — see docs/DEV-BOOTSTRAP.md if first time
make install

# Regenerate strategy_constants from shared/strategy.toml
make codegen

# Run all tests (Move + TS Vitest + Python pytest)
make test

# Run lints + format checks
make lint
```

If `make` is not on PATH (Windows), use the underlying commands directly:

```bash
pnpm install --frozen-lockfile
(cd backtest && uv sync --locked)
(cd backtest && uv run --no-project python ../scripts/codegen.py)
pnpm -r run test && (cd backtest && uv run pytest)
pnpm -r run lint && (cd backtest && uv run ruff check .)
```

If any step fails, see `docs/DEV-BOOTSTRAP.md` for one-shot machine setup (Sui CLI, pnpm, uv, wallets).

## Stack

Pinned toolchain (every version is exact, no `^`/`~` drift):

- **Sui CLI** `mainnet-v1.71.1` (Move 2024.beta edition)
- **DeepBookV3** `predict-testnet-4-16` @ `1159d79af33c70e09e406310e1d8f067832ede9d` (vendored via git subtree at `scripts/deepbookv3/`)
- **Node.js** `>=22 LTS` + **pnpm** `10.0.0` (workspaces; placeholders for indexer/dashboard land in Phase 4)
- **Python** `>=3.12` via **uv** (numpy 2.4 / pandas 3.0 / scipy 1.17 / pyarrow 24 / matplotlib 3.10)
- **CI:** GitHub Actions, Ubuntu latest, 5-job matrix (move, ts, python, codegen-drift, parity)

Full stack rationale, alternatives rejected, and version-compatibility flags: see [`.planning/research/STACK.md`](.planning/research/STACK.md) and [`CLAUDE.md`](CLAUDE.md).

## Demo

```bash
make demo   # Phase 6 fills this in — reproduces demo end-to-end from fresh clone
```

The demo target prints a placeholder until Phase 6. After submission, it will produce the same artifact judges see in the demo video.

## Repository layout

| Path | Purpose | Phase |
|------|---------|-------|
| `contracts/` | Sui Move package (`deepvault::`) | Phase 0 + 2 |
| `indexer/` | Node.js event relay | Phase 4 (placeholder) |
| `dashboard/` | React + Vite SVI Risk Studio | Phase 4 (placeholder) |
| `backtest/` | Python uv project, lookahead audit | Phase 0 + 1 + 3 |
| `shared/` | `strategy.toml` (source of truth), `golden-vectors.json` | Phase 0 + 1 |
| `scripts/` | `codegen.py`, `predict-diff.sh`, vendored DeepBookV3 fork | Phase 0 |
| `config/` | `testnet.toml`, `mainnet.toml` (TBD slots filled in Phases 2/5) | Phase 0 |
| `docs/` | CONTRIBUTING, HEDGE-POLICY, MAINNET-FUNDING, DEV-BOOTSTRAP, CI-BRANCH-PROTECTION | Phase 0 |
| `.github/workflows/` | CI (5-job matrix) + Monday Predict sweep cron | Phase 0 |

## Hosting

| Component | Tier | URL |
|-----------|------|-----|
| Dashboard (React + Vite) | Vercel free tier | `[TBD-vercel-subdomain].vercel.app` (filled in Phase 4) |
| Event relay (Node.js + WS) | Render free tier | `[TBD-render-subdomain].onrender.com` (filled in Phase 4) |
| Sui RPC (testnet) | Public Mysten | `https://fullnode.testnet.sui.io:443` |
| Sui RPC (mainnet, Phase 5) | Public Mysten | `https://fullnode.mainnet.sui.io:443` |

Per CONTEXT.md D-13/D-15/D-16: default Vercel/Render subdomains, no custom domain. Hosting URLs are filled in `config/{testnet,mainnet}.toml` `[hosting]` section as each component deploys.

## Key policies (locked in writing)

- **Hedge-ratio policy** (10% allocation, -15% OTM, 14-day tenor, fixed sizing): `docs/HEDGE-POLICY.md`
- **Code freeze** (2026-05-30): `CONTRIBUTING.md §"Code freeze: 2026-05-30"`
- **No refactor after vault ships** (Pitfall 18 mitigation): `CONTRIBUTING.md §"No refactor after vault ships"`
- **No dashboard before vault** (Pitfall 19 mitigation): `CONTRIBUTING.md §"No dashboard work before vault feature-complete"`
- **Weekly Monday Predict sweep** (Pitfall 6 mitigation): `CONTRIBUTING.md §"Weekly Monday Predict sweep"`
- **Mainnet redeploy mechanical playbook**: `docs/MAINNET-FUNDING.md`

## Build log

Append-only weekly bullets per `CONTRIBUTING.md` build-log discipline. Never edit history; never delete entries.

### Week 1 (2026-05-09 to 2026-05-15)

- **Phase 0 (Setup & Ground Rules) completed** — 8 plans (00-01 through 00-08), 27 atomic task commits, 3 documented human-action checkpoints, all 8 SETUP-01..08 requirements closed (see `.planning/phases/00-setup-ground-rules/00-08-SUMMARY.md` for the closure traceability matrix).
- Toolchains pinned: Sui CLI `mainnet-v1.71.1`, Move 2024.beta, Node 22 LTS, pnpm 10, Python 3.12, uv 0.5+.
- DeepBookV3 vendored at `scripts/deepbookv3/` via `git subtree --squash` (HEAD `1159d79af33c70e09e406310e1d8f067832ede9d`); Move.toml SHA-pinned to the same commit.
- Hedge-ratio policy committed: 10% allocation, -15% OTM, 14-day tenor, fixed sizing — frozen until Phase 3 backtest re-tune (then permanent).
- Three-way constant parity wired: `shared/strategy.toml` codegen emits Move/Python/TS constants with CI drift detection.
- 5-job CI matrix landed: move + ts + python + codegen-drift + parity. Branch-protection guide ready for one-time GitHub setup.
- Two-wallet split documented: testnet dev + mainnet deploy (UNFUNDED until Phase 5).
- Slack remaining: 37 days (Day 2 of 39).

## References

- **For developers:** `docs/DEV-BOOTSTRAP.md` (one-shot setup), `CONTRIBUTING.md` (rules)
- **For judges:** Laypitch above, `docs/HEDGE-POLICY.md` (strategy lock), demo video (Phase 6)
- **For deploy:** `docs/MAINNET-FUNDING.md` (Phase 5 playbook), `docs/CI-BRANCH-PROTECTION.md` (one-time CI setup)
- **For research:** `.planning/research/SUMMARY.md`, `.planning/research/STACK.md`, `.planning/research/PITFALLS.md`
- **For roadmap:** `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md`

## License

MIT — see [LICENSE](LICENSE).

---

*MIT licensed · Sui Overflow 2026 DeepBook track · Built solo · Hard ship: 2026-06-16 · Code freeze: 2026-05-30.*
