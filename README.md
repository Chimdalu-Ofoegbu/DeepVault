# DeepVault

> A composable structured-product vault on Sui DeepBook Predict that fuses PLP yield with automated tail-risk hedging, paired with an institutional-grade SVI volatility-surface dashboard. Built for Sui Overflow 2026.

[![CI](https://github.com/<owner>/deepvault/actions/workflows/ci.yml/badge.svg)](https://github.com/<owner>/deepvault/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## Status

**Submission-ready for Sui Overflow 2026 (DeepBook track).** Phases 0 through 5 are complete plus the PLP Risk Studio dashboard (Phase 04.1 reskin + Phase 04.2 `Vault | Risk Studio` mode split):

- **Phase 0 — Setup & Ground Rules:** monorepo scaffolded, single-source `shared/strategy.toml` codegen to Move/Python/TS, 5-job CI matrix, policy docs locked, DeepBookV3 fork vendored at SHA `1159d79a`, hedge-ratio policy frozen (10% / -15% OTM / 14-day tenor / fixed sizing).
- **Phase 1 — Math Foundation:** three-runtime raw 5-param SVI evaluator (Move + Python + TypeScript) gated by 141 bit-for-bit golden vectors (21 from Gatheral & Jacquier 2014).
- **Phase 2 — Vault Move package:** deposit / redeem / rebalance with atomic on-chain hedge mint, token-bucket withdrawal limiter, inflation defense, worst-case LTV. **Deployed to Sui testnet 2026-05-16** (addresses below).
- **Phase 3 — Backtest + two-protocol PTB:** 365-day walk-forward with OOS holdout + lookahead-bias audit; the 5-call Margin+Predict+vault single-PTB shape proven via the `mock_margin_pool` integration test.
- **Phase 4 — Dashboard:** React + Vite SVI Risk Studio (11 panels: live 3D SVI surface, arb-checker, exposure, what-if simulator, event stream) with a `Vault | Risk Studio` mode split.
- **Phase 5 — Testnet hardening + mainnet-readiness toolkit:** `make demo` smoke test green end-to-end with a dual ±10 bps NAV gate; the mainnet toolkit is committed and lint-clean for a post-submission deploy.

Mainnet deploy is **deferred to post-submission** (DeepBook Predict has not shipped on mainnet during the submission window — see [`docs/MAINNET-READINESS.md`](docs/MAINNET-READINESS.md)). The codebase is **not** audited.

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
| [`docs/MAINNET-READINESS.md`](docs/MAINNET-READINESS.md) | Why mainnet is deferred + the post-submission ≤30-min deploy procedure (preserves the original funding playbook: budget, two-wallet split, AdminCap discipline) |
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
# Reproduces the full testnet vault cycle end-to-end:
# deposit -> hedge mint -> redeem_request -> 1h cooldown -> redeem_fulfill
# with a dual ±10 bps NAV verification gate. Takes ~1h wall-clock.
#
# Requires SUI_PRIVATE_KEY (ephemeral testnet keypair) and ORACLE_SVI_ID
# (BTC-USD OracleSVI shared object id) env vars. See docs/DEV-BOOTSTRAP.md
# for setup. Phase 6 records the demo video against this same flow.
SUI_PRIVATE_KEY=<...> ORACLE_SVI_ID=<...> make demo
```

Or, equivalently:

```bash
bash scripts/testnet-smoke-test.sh
```

The 7 staged `[CHECKPOINT PASS]` markers + the final dual-gate verdict (`ratio_bps=...` Gate A + `nav_delta_bps=...` Gate B, both annotated `OK`) confirm a green run. Phase 6 records the demo video against this same `make demo` flow.

### Testnet contracts

Live on Sui testnet since **2026-05-16**, captured verbatim in [`.planning/phases/02-vault-move-package-testnet-deploy/TESTNET-DEPLOY.json`](.planning/phases/02-vault-move-package-testnet-deploy/TESTNET-DEPLOY.json):

| Object | Sui testnet explorer |
|--------|---------------------|
| `deepvault` package | [`0xbc9aaeaa…d6e862`](https://suiscan.xyz/testnet/object/0xbc9aaeaa237400179e4c55cf49209dcf6ed0492be6eeb0088677e754ebd6e862) |
| Vault shared object | [`0x2824d97e…f7a911`](https://suiscan.xyz/testnet/object/0x2824d97e221413660fd9f8e23155bd4d1d459c06a893b1d350eb279c3bf7a911) |
| AdminCap | [`0x9e40150e…aba3e7`](https://suiscan.xyz/testnet/object/0x9e40150e07ce223019afbaca425cb08b84c541ad402b428ee4a9942dfaaba3e7) |
| Deploy tx | [`ETYPnLemp…uBBCS`](https://suiscan.xyz/testnet/tx/ETYPnLemp761HsXeWigdh7h5hMvqEa2id4KDm8auBBCS) |

`make demo` consumes the same `TESTNET-DEPLOY.json`, so the deployed vault above is exactly what the smoke test exercises.

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
| `docs/` | CONTRIBUTING, HEDGE-POLICY, MAINNET-READINESS, DEV-BOOTSTRAP, CI-BRANCH-PROTECTION, WHITEPAPER, architecture.svg | Phase 0 + 6 |
| `.github/workflows/` | CI (5-job matrix) + Monday Predict sweep cron | Phase 0 |

## Hosting

| Component | Tier | URL |
|-----------|------|-----|
| Dashboard (React + Vite) | Vercel free tier | `[TBD-vercel-subdomain].vercel.app` (filled in Phase 4) |
| Event relay (Node.js + WS) | Render free tier | `[TBD-render-subdomain].onrender.com` (filled in Phase 4) |
| Sui RPC (testnet) | Public Mysten | `https://fullnode.testnet.sui.io:443` |
| Sui RPC (mainnet, Phase 5) | Public Mysten | `https://fullnode.mainnet.sui.io:443` |

Per CONTEXT.md D-13/D-15/D-16: default Vercel/Render subdomains, no custom domain. Hosting URLs are filled in `config/{testnet,mainnet}.toml` `[hosting]` section as each component deploys.

## Mainnet readiness

DeepBook Predict mainnet has not shipped during the submission window (per Mysten's "later in 2026" timeline; testnet launched 2026-05-05). DeepVault's mainnet deploy is **deferred to post-submission**.

The mainnet toolkit is committed and lint-clean — when Predict ships on mainnet, the post-submission operator runs a ≤30-minute deploy procedure:

```bash
bash scripts/predict-mainnet-check.sh   # Verify Predict shipped on mainnet
bash scripts/preflight.sh                # Verify config + tests
bash scripts/mainnet-deploy.sh           # Publish + create_vault
bash scripts/mainnet-smoke-test.sh       # ~$50 USDsui round-trip
```

Full procedure + rationale: [`docs/MAINNET-READINESS.md`](docs/MAINNET-READINESS.md).

The architecture is **mainnet-compatible via a single config flip** in [`config/mainnet.toml`](config/mainnet.toml) — no Move/TS/Python code changes required.

## Key policies (locked in writing)

- **Hedge-ratio policy** (10% allocation, -15% OTM, 14-day tenor, fixed sizing): `docs/HEDGE-POLICY.md`
- **Code freeze** (2026-05-30): `CONTRIBUTING.md §"Code freeze: 2026-05-30"`
- **No refactor after vault ships** (Pitfall 18 mitigation): `CONTRIBUTING.md §"No refactor after vault ships"`
- **No dashboard before vault** (Pitfall 19 mitigation): `CONTRIBUTING.md §"No dashboard work before vault feature-complete"`
- **Weekly Monday Predict sweep** (Pitfall 6 mitigation): `CONTRIBUTING.md §"Weekly Monday Predict sweep"`
- **Mainnet redeploy mechanical playbook**: `docs/MAINNET-READINESS.md`

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

### Week 5 (2026-06-09 to 2026-06-15)

- **Phase 5 (Testnet Demo Hardening + Mainnet-Readiness Toolkit) completed** — testnet smoke test green end-to-end with dual ±10 bps NAV verification; mainnet-readiness toolkit (preflight + predict-mainnet-check + mainnet-deploy + mainnet-smoke-test) committed and lint-clean, ready to invoke post-submission when DeepBook Predict ships on mainnet.
- `scripts/testnet-smoke-test.sh` (judge-facing): staged 7-checkpoint cycle, $50-equivalent DUSDC, per-depositor return ratio >= 99.9% AND vault NAV drift <= 10 bps. Reproducible via `make demo`.
- `shared/strategy.toml` extended with `[redemption].cooldown_ms = 3_600_000`; codegen propagates to Move/Python/TS; `redeem.move` no longer holds a local const.
- `docs/MAINNET-READINESS.md` rewritten: judges read "why deferred"; the post-submission operator reads "<=30-min deploy procedure"; original funding playbook preserved.
- DEPLOY-01 through DEPLOY-04 + DEPLOY-09 closed per the Phase 5 reshape.

## References

- **For developers:** `docs/DEV-BOOTSTRAP.md` (one-shot setup), `CONTRIBUTING.md` (rules)
- **For judges:** Laypitch above, `docs/HEDGE-POLICY.md` (strategy lock), demo video (Phase 6)
- **For deploy:** `docs/MAINNET-READINESS.md` (why-deferred + post-submission playbook), `docs/CI-BRANCH-PROTECTION.md` (one-time CI setup)
- **For research:** `.planning/research/SUMMARY.md`, `.planning/research/STACK.md`, `.planning/research/PITFALLS.md`
- **For roadmap:** `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md`

## License

MIT — see [LICENSE](LICENSE).

---

*MIT licensed · Sui Overflow 2026 DeepBook track · Built solo · Hard ship: 2026-06-16 · Code freeze: 2026-05-30.*
