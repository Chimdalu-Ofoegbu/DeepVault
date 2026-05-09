# DeepVault

> A composable structured-product vault on Sui DeepBook Predict that fuses PLP yield with automated tail-risk hedging, paired with an institutional-grade SVI volatility-surface dashboard. Built for Sui Overflow 2026.

**Status:** Phase 0 — Setup & Ground Rules (in progress)
**Ship target:** 2026-06-16 (Sui Overflow 2026 submission)
**License:** MIT

## Laypitch

DeepVault sells "PLP yield minus crash insurance" as a single deposit. You put USDsui in, the vault routes 90% to DeepBook Predict's PLP for yield, and 10% buys binary tail hedges priced from a live SVI volatility surface. When BTC tanks more than ~15%, the hedges pay; otherwise you collect the PLP fees minus a small hedge cost.

## Glossary

- **PLP** — Predict Liquidity Provider; the LP role inside DeepBook Predict's binary-options venue.
- **SVI** — Stochastic Volatility Inspired; a 5-parameter volatility-surface parameterization (Gatheral & Jacquier 2014).
- **Vault share** — `Coin<VAULT_SHARE>` representing pro-rata claim on vault NAV.
- **PTB** — Programmable Transaction Block; Sui's atomic multi-call primitive.
- **Hedge ratio** — Fraction of each new deposit routed to the hedge book (locked at 10% per `docs/HEDGE-POLICY.md`).

## Prerequisites

- Node.js >= 22 LTS
- pnpm >= 10
- Python 3.12 + `uv` >= 0.5
- Sui CLI `mainnet-v1.71.1` (install via `suiup install sui mainnet-v1.71.1`)
- Git Bash or WSL (for shell scripts on Windows dev machines)

## Build & test

```bash
pnpm install --frozen-lockfile
cd backtest && uv sync --locked && cd ..
make codegen
make test
make lint
```

## Demo

```bash
make demo   # placeholder until Phase 6
```

## Repository layout

| Path | Purpose |
|------|---------|
| `contracts/` | Sui Move package (`deepvault::`) |
| `indexer/` | Node.js event relay (Phase 4 placeholder) |
| `dashboard/` | React + Vite (Phase 4 placeholder) |
| `backtest/` | Python uv project |
| `shared/` | `strategy.toml` + golden vectors |
| `scripts/` | codegen, predict-diff, mainnet-preflight |
| `config/` | testnet.toml, mainnet.toml |
| `docs/` | CONTRIBUTING, HEDGE-POLICY, MAINNET-FUNDING |
| `.github/workflows/` | CI + Monday Predict sweep |

## Build log

Append-only weekly bullets per `CONTRIBUTING.md` build-log discipline. Never edit history; never delete entries.

### Week 1 (2026-05-09 to 2026-05-15)
- Phase 0 in progress: monorepo scaffold, codegen, CI, policy docs.

## Hosting

- **Dashboard:** [TBD-vercel-subdomain].vercel.app (Vercel free tier, default subdomain per D-13/D-16) — wired in Phase 4.
- **Event relay:** [TBD-render-subdomain].onrender.com (Render free tier per D-15) — wired in Phase 4.

## License

MIT — see `LICENSE`.
