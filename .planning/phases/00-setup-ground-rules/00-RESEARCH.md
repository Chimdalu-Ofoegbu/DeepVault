# Phase 0: Setup & Ground Rules - Research

**Researched:** 2026-05-08
**Domain:** Cross-cutting infrastructure for a TypeScript+Python+Move monorepo (Sui DeFi structured product)
**Confidence:** HIGH on toolchain versions and CI patterns; MEDIUM on DeepBookV3 fork churn (LOW-CITED by upstream); HIGH on policy-doc patterns
**Phase budget:** 2 days (per ROADMAP.md `Phase 0: Setup & Ground Rules`); ~6-8 plans

---

## Summary

Phase 0 is purely scaffolding: pin toolchains, scaffold the monorepo, write the codegen + predict-diff scripts, wire CI, and commit the policy-lock docs (CONTRIBUTING, HEDGE-POLICY, MAINNET-FUNDING) **before** any feature code so later phases inherit a stable foundation. Every Phase 0 deliverable maps to a SETUP-01..08 requirement, and most map to a documented pitfall (6, 14, 18, 19) whose mitigation IS the deliverable.

The CONTEXT.md locks 16 implementation decisions plus the full repository structure. Research confirms: every locked decision is the standard, current 2026-05 best practice. No alternatives need re-evaluation. This research focuses on **exact paste-ready patterns** the planner will turn into tasks.

**Primary recommendation:** Plan ~7 sequenced waves: (1) repo bootstrap + git, (2) toolchain pins + Move.toml, (3) strategy.toml + codegen.py, (4) config/{testnet,mainnet}.toml, (5) predict-diff.sh + Monday workflow, (6) docs (CONTRIBUTING + HEDGE-POLICY + MAINNET-FUNDING), (7) CI ci.yml + parity gate stub. Repo bootstrap MUST come before everything; codegen depends on Move/uv/pnpm being initialized; CI ties everything together. Two open questions remain — DeepBookV3 fork SHA and choice between submodule vs sparse-checkout — both can be resolved as a 30-minute Phase 0 spike on day 1.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Hedge-Ratio Policy (SETUP-06 fulfillment):**
- **D-01:** Allocation = 10% of each new vault deposit routed into the hedge book.
- **D-02:** Strike = -15% OTM (binary put strike sits 15% below current BTC spot at hedge-mint time).
- **D-03:** Tenor = 14-day expiry; roll trigger = expiry < 2 days. One roll per ~12-day cycle.
- **D-04:** Sizing function parameterized in `shared/strategy.toml` under `[hedge_policy]`. v1 ships fixed.
- **D-05:** Re-tuning permitted ONLY in Phase 3 backtest, on out-of-sample-aware walk-forward analysis. Frozen after Phase 3.

**Wallet & Mainnet Funding:**
- **D-06:** Two separate wallets — testnet dev wallet (faucet-fed) and mainnet deploy wallet (locked down).
- **D-07:** Mainnet budget ~$80 — $50 USDsui smoke deposit + ~$15 SUI gas + ~$15 buffer. **Risk flag:** $30 buffer is tight; if Phase 5 hits a redeploy, top up to $150 before Day 36.
- **D-08:** USDsui acquired via Cetus DEX swap from SUI. Document in `docs/MAINNET-FUNDING.md`.
- **D-09:** No third "fresh wallet" — fresh-wallet PTB tests use ephemeral CI keypairs + fresh manual keypair on demo day.

**Repository Visibility & Build-in-Public:**
- **D-10:** GitHub repo public from day 1.
- **D-11:** License = MIT.
- **D-12:** Minimal build log in README. Weekly bullet updates, append-only. 1-2 X/Twitter posts pinned.

**Dashboard & Relay Hosting:**
- **D-13:** Public dashboard on Vercel free tier, default `*.vercel.app` subdomain.
- **D-14:** Local Vite dev server is recording target for demo video.
- **D-15:** Event relay on Render free tier. Auto-deploys from GitHub. Sleeps after 15min idle — keepalive ping `/healthz` every 10min from GitHub Actions cron.
- **D-16:** No custom domain.

### Claude's Discretion

- **Monorepo orchestration:** pnpm workspaces + top-level `Makefile`. No Turborepo/Nx.
- **strategy.toml codegen:** Single Python script `scripts/codegen.py` reads `shared/strategy.toml` → emits `contracts/sources/strategy_constants.move`, `backtest/src/deepvault/strategy_constants.py`, `dashboard/src/lib/strategy_constants.ts`. "DO NOT EDIT" header. CI fails if files out of sync.
- **Predict-diff script:** Bash `scripts/predict-diff.sh` — `git fetch` on a vendored DeepBookV3 fork checkout, `git log --oneline LAST_SHA..HEAD -- packages/predict packages/predict_manager packages/oracle_svi`. Stores `LAST_SHA` in `.predict-diff-state`. Calendar reminder = GitHub Issue auto-created Mondays via Actions cron.
- **Editor / formatter:** Move uses `sui move build` checks; TS uses `prettier` + `eslint`; Python uses `ruff format` + `ruff check`. All wired into `make lint` + CI.
- **Branch strategy:** `main` only, push directly. CI gates merges via required-status-check.
- **Test framework:** Move stdlib `sui move test`; TS Vitest 4.x; Python pytest 8.3.
- **CI runner:** GitHub Actions, Ubuntu latest. One workflow `.github/workflows/ci.yml` with three parallel jobs (move, ts, python) + a fourth "parity" job depending on all three.
- **Repository structure:**
  ```
  contracts/         # Sui Move package (deepvault::)
  indexer/           # Node.js event relay (Phase 4 placeholder)
  dashboard/         # React + Vite (Phase 4 placeholder)
  backtest/          # Python uv project (Phase 1+ math, Phase 3 harness)
  shared/            # strategy.toml + golden-vectors.json
  scripts/           # codegen.py, predict-diff.sh, mainnet-preflight.sh
  config/            # testnet.toml, mainnet.toml
  docs/              # CONTRIBUTING, MAINNET-FUNDING, HEDGE-POLICY, ARCHITECTURE
  .github/workflows/ # ci.yml + monday-predict-check.yml
  ```

### Deferred Ideas (OUT OF SCOPE)

- Turborepo / Nx caching (not needed at this scale)
- Custom domain (post-submission)
- Active social posting (X threads, GIFs of milestones)
- Three-wallet structure (overkill)
- Bridged USDC → USDsui (only if budget grows beyond ~$200)
- GPL/MPL copyleft license; Apache 2.0
- GitHub Pages / Cloudflare Pages instead of Vercel
- Render paid plan or Fly.io
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SETUP-01 | Repository scaffolded as TypeScript monorepo (`contracts/`, `indexer/`, `dashboard/`, `backtest/`, `shared/`) with `uv` for Python and `pnpm` for TS workspaces | §"Recommended Project Structure", §"pnpm workspace + uv setup" |
| SETUP-02 | `Move.toml` pins DeepBookV3 `predict-testnet-4-16` branch by exact rev; Sui CLI pinned to `mainnet-v1.71.1` via `suiup` | §"Toolchain Pins", §"Move.toml dependency pin pattern" |
| SETUP-03 | `shared/strategy.toml` (single source of truth) with codegen to Move + Python + TypeScript constants | §"strategy.toml codegen pattern", §"Code Examples" |
| SETUP-04 | `config/{testnet,mainnet}.toml` scaffold with all contract addresses, RPC URLs, type tags | §"Config schema (testnet.toml / mainnet.toml)" |
| SETUP-05 | Weekly Monday Predict contract-version diff script (`scripts/predict-diff.sh`) plus calendar reminder; halts feature work on breaking change | §"DeepBookV3 fork vendoring strategy", §"Monday-cron Issue workflow", §"Pitfall 6 mitigation" |
| SETUP-06 | Hedge-ratio policy committed in writing (default: fixed-ratio v1, parameterized for future dynamic) before backtest opens — locks against hindsight tuning | §"HEDGE-POLICY.md skeleton" |
| SETUP-07 | Code-freeze date (2026-05-30) and no-refactor-after-vault-ships rule documented in `CONTRIBUTING.md` | §"CONTRIBUTING.md skeleton", §"Pitfall 18, 19 wording" |
| SETUP-08 | GitHub Actions CI running Move test suite + TypeScript Vitest + Python pytest + golden-vector parity check on every push | §"GitHub Actions ci.yml (4-job matrix)" |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Repository scaffold (folders, package.json, pyproject.toml, Move.toml) | Build / Dev infra | — | Pure repo state; no runtime tier owns this |
| Toolchain version pins (suiup, Node, Python, pnpm, uv) | Local Dev / CI | — | Both developer machine and Ubuntu CI runner consume the same pins |
| `shared/strategy.toml` (parameter source of truth) | Build / Codegen | Move + Python + TS | One file, three runtimes; codegen bridges build-time → runtime |
| `scripts/codegen.py` (multi-runtime emitter) | Build / Codegen | — | Pre-build step; runs in `make codegen` and CI drift check |
| `config/{testnet,mainnet}.toml` (env-specific addresses) | Runtime config | — | Read at deploy time / app boot; never compiled in |
| `scripts/predict-diff.sh` (weekly contract-churn sweep) | Local Dev / CI cron | — | Detects upstream drift; CI creates Issue, never auto-fails |
| `.github/workflows/ci.yml` (Move + TS + Python + parity) | CI | — | Required status check; gate for every commit |
| `.github/workflows/monday-predict-check.yml` (cron) | CI | — | Weekly schedule + Issue creation |
| `CONTRIBUTING.md` / `HEDGE-POLICY.md` / `MAINNET-FUNDING.md` | Docs / Policy | — | Locked decisions referenced by every later phase |
| Vercel deployment of dashboard | Frontend hosting | — | Static build artifact; serverless functions terminate at 120s, so no WS server lives here `[CITED: copyprogramming.com]` |
| Render relay deployment | Backend hosting | — | Long-running WS server (sleeps after 15 min idle on free tier) `[CITED: render.com/docs/free]` |
| Wallet provisioning (testnet + mainnet) | Local Dev / Deploy | — | `sui client new-address` outputs to `~/.sui/sui_config/sui.keystore` |

## Standard Stack

### Core (verified May 2026)

| Library / Tool | Version | Purpose | Provenance |
|----------------|---------|---------|------------|
| Sui CLI / `sui-node` | `mainnet-v1.71.1` | Move toolchain, publish, local validator | `[CITED: github.com/MystenLabs/sui/releases]` — protocol version 123, May 6 2026 |
| `suiup` | latest | Sui toolchain version manager | `[CITED: github.com/MystenLabs/suiup]` — recommended install method |
| Move Edition | `2024` | Smart contract language | `[CITED: docs.sui.io]` — only valid edition value |
| DeepBookV3 (Move) | `predict-testnet-4-16` branch | Predict + Margin source-of-truth | `[CITED: github.com/MystenLabs/deepbookv3/tree/predict-testnet-4-16]` — confirmed branch exists; last updated Apr 27 2026 per GitHub branches view |
| pnpm | `>= 10.x` | TS workspace package manager | `[VERIFIED: STACK.md + 2026 community consensus]` |
| Node.js | `>= 22 LTS` | TS runtime | `[CITED: STACK.md]` |
| `@mysten/sui` | `2.16.0` | Sui RPC + PTB + BCS | `[VERIFIED: npmjs.com/package/@mysten/sui]` — last published ~Apr 2026 |
| `@mysten/dapp-kit` | `1.0.4` | React hooks for wallet | `[VERIFIED: npmjs.com/package/@mysten/dapp-kit]` — last published ~Mar 2026 |
| `@mysten/deepbook-v3` | `0.17.0` | DeepBookV3 + Margin TS SDK | `[VERIFIED: npmjs.com/package/@mysten/deepbook-v3]` — published ~Apr 28 2026 |
| `@tanstack/react-query` | `^5.x` | Async cache (peer of dapp-kit) | `[CITED: STACK.md]` |
| Vite | `^7.x` | Frontend dev server + bundler | `[CITED: STACK.md]` |
| TypeScript | `^5.6+` | Types | `[CITED: STACK.md]` |
| `vitest` | `4.1.5` | TS unit + integration tests | `[VERIFIED: vitest releases]` — published Apr 21 2026; Vitest 4.1 line is current stable |
| `prettier` | `>= 3.x` | TS formatter | `[ASSUMED]` — community default |
| `eslint` | `>= 9.x` (flat config) | TS linter | `[ASSUMED]` — community default |
| Python | `3.12.x` | Backtest runtime | `[CITED: STACK.md]` — 3.12 is the floor for current numpy/pandas |
| `uv` | `>= 0.5.x` | Python project + lock manager | `[CITED: docs.astral.sh/uv]` |
| `astral-sh/setup-uv` (action) | `v8.1.0` | CI install of uv with caching | `[VERIFIED: github.com/astral-sh/setup-uv releases]` |
| `numpy` | `>= 2.4` (current `2.4.4`) | Vectorized math | `[VERIFIED: numpy.org/news]` — 2.4.0 released Dec 20 2025; 2.4.4 latest patch |
| `pandas` | `>= 2.2` | OHLC ingestion, replay loop | `[CITED: STACK.md]` |
| `scipy` | `>= 1.14` | SLSQP minimizer, Brent root-finder | `[CITED: STACK.md]` |
| `pyarrow` | `>= 18` | Parquet I/O | `[CITED: STACK.md]` |
| `pytest` | `>= 8.3` | Python test runner | `[CITED: STACK.md]` |
| `ruff` | `>= 0.x` (current) | Python format + lint | `[ASSUMED]` — community 2026 default |
| `tomli-w` (or stdlib `tomllib`) | `>= 1.x` (Python 3.11+ has `tomllib` read-only) | Codegen.py reads strategy.toml | `[CITED: docs.python.org]` — `tomllib` ships in stdlib since 3.11; for write use `tomli-w` |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `peter-evans/create-issue-from-file` | `@v6` | Auto-create GitHub Issue from a file | Monday cron workflow — pipe predict-diff.sh output into a Markdown file, then create issue `[VERIFIED: github.com/peter-evans/create-issue-from-file]` |
| `pnpm/action-setup` | `@v4` | Install pnpm in CI | CI matrix `[CITED: github.com/pnpm/action-setup]` |
| `actions/setup-node` | `@v6` | Install Node + cache `pnpm` | CI matrix `[CITED: github.com/actions/setup-node]` |
| `actions/setup-python` | `@v5` (or rely on setup-uv) | Install Python | Optional — `astral-sh/setup-uv` can manage Python |
| `actions/checkout` | `@v4` | Clone repo in CI | All workflows |

### Alternatives Considered (and rejected per CONTEXT.md)

| Recommended | Alternative | Why Rejected |
|-------------|-------------|--------------|
| pnpm workspaces + Makefile | Turborepo / Nx | Adds setup time, marginal benefit for solo 39-day build (CONTEXT.md `Deferred Ideas`) |
| `astral-sh/setup-uv@v8.1.0` | `pip install uv` in CI step | Loses caching; setup-uv has `enable-cache: true` keyed on `**/uv.lock` `[CITED: docs.astral.sh/uv]` |
| GitHub Actions for Monday cron | External calendar (Google Calendar, cron-job.org) | External dep; Issue creation directly in GH is the audit trail (CONTEXT.md `Implementation Defaults`) |
| Vendored fork via git subtree | git submodule | Subtree avoids `git submodule update --init` ritual, embeds source for offline diff `[CITED: atlassian.com/git/tutorials/git-subtree]`; see Decision below |
| `@mysten/sui` 2.x | `@mysten/sui.js` (legacy) | Deprecated, do not use `[CITED: STACK.md]` |
| `vitest` | Jest | Slower cold start, redundant config when Vite is in stack `[CITED: STACK.md]` |
| `uv` | Poetry / pip+requirements.txt | 10-100x faster, native lockfile, reproducibility floor for backtest credibility `[CITED: STACK.md]` |
| MIT license | Apache 2.0 / GPL | MIT preferred for ecosystem compatibility (CONTEXT.md D-11) |
| Default `*.vercel.app` subdomain | Custom domain | Post-submission concern (CONTEXT.md D-16) |

**Installation snapshot:**

```bash
# Toolchain
suiup install sui mainnet-v1.71.1
suiup default set sui mainnet-v1.71.1
# Verify
sui --version  # Expect: sui 1.71.1-...

# Node + pnpm (one-time on dev machine)
# Use Node 22 LTS via your version manager (volta, fnm, nvm)
npm install -g pnpm@latest

# uv (one-time)
curl -LsSf https://astral.sh/uv/install.sh | sh
# or: pip install uv

# Workspace bootstrap from repo root
pnpm install                      # installs all TS workspaces
cd backtest && uv sync && cd ..   # installs Python deps

# Verification commands
pnpm -r run test                  # all TS workspaces
cd backtest && uv run pytest      # Python
cd contracts && sui move test     # Move
```

**Version-pin discipline:**

For reproducibility, pin to `=` (exact) not `^` in `package.json`:

```json
{
  "dependencies": {
    "@mysten/sui": "2.16.0",
    "@mysten/dapp-kit": "1.0.4",
    "@mysten/deepbook-v3": "0.17.0"
  }
}
```

In `pyproject.toml` for backtest, use `>=` floors with `uv.lock` providing exact pins:

```toml
[project]
dependencies = [
  "numpy>=2.4",
  "pandas>=2.2",
  "scipy>=1.14",
  "pyarrow>=18",
]
```

`uv.lock` is committed to git — this is the actual reproducibility floor `[CITED: docs.astral.sh/uv]`.

## Architecture Patterns

### System Architecture Diagram

```
                     ┌──────────────────────────────────────────┐
                     │  shared/strategy.toml                    │
                     │  (single source of truth — locked nums)  │
                     └────────────┬─────────────────────────────┘
                                  │
                    ┌─────────────┴──────────────┐
                    │  scripts/codegen.py        │
                    │  (Python; reads TOML)      │
                    └────┬───────┬───────┬───────┘
                         │       │       │
                         ▼       ▼       ▼
        ┌───────────────────┐  ┌────────────────────┐  ┌──────────────────────┐
        │ contracts/sources/│  │ backtest/src/deep- │  │ dashboard/src/lib/   │
        │ strategy_         │  │ vault/strategy_    │  │ strategy_            │
        │ constants.move    │  │ constants.py       │  │ constants.ts         │
        │ (DO NOT EDIT)     │  │ (DO NOT EDIT)      │  │ (DO NOT EDIT)        │
        └───────────────────┘  └────────────────────┘  └──────────────────────┘
                │                       │                       │
                ▼                       ▼                       ▼
        ┌────────────────────────────────────────────────────────────────────┐
        │             Phase 1+ feature code consumes constants               │
        └────────────────────────────────────────────────────────────────────┘

         ┌────────────────────────────────────────────────────────────────┐
         │  CI: .github/workflows/ci.yml                                  │
         │  ┌─────────┐ ┌─────────┐ ┌─────────┐  →  ┌──────────────────┐ │
         │  │ move    │ │ ts      │ │ python  │     │ parity           │ │
         │  │ test    │ │ vitest  │ │ pytest  │     │ (golden vectors) │ │
         │  │ + lint  │ │ + tsc   │ │ + ruff  │     │ all 3 runtimes   │ │
         │  └─────────┘ └─────────┘ └─────────┘     └──────────────────┘ │
         │       └──── needs: [move, ts, python] ────────────┘            │
         │                                                                │
         │  Drift check: `python scripts/codegen.py && git diff --exit-code`
         └────────────────────────────────────────────────────────────────┘

         ┌────────────────────────────────────────────────────────────────┐
         │  Monday-cron: .github/workflows/monday-predict-check.yml       │
         │                                                                │
         │  cron: '0 14 * * 1'  (Monday 09:00 ET = 14:00 UTC)             │
         │     │                                                          │
         │     ▼                                                          │
         │  scripts/predict-diff.sh                                       │
         │     │                                                          │
         │     ▼                                                          │
         │  Output → /tmp/predict-diff.md                                 │
         │     │                                                          │
         │     ▼                                                          │
         │  peter-evans/create-issue-from-file@v6  (always create — green CI, human alert)
         └────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

```
deepvault/
├── .github/
│   └── workflows/
│       ├── ci.yml                          # Move + TS + Python + parity (4 jobs)
│       └── monday-predict-check.yml        # cron + Issue creator
├── .git/                                   # branch: main only
├── contracts/                              # Sui Move package
│   ├── Move.toml                           # pins predict-testnet-4-16
│   ├── sources/
│   │   └── strategy_constants.move         # GENERATED — DO NOT EDIT
│   └── tests/
├── indexer/                                # Phase 4 — placeholder package.json only
│   ├── package.json
│   └── README.md                           # "Phase 4 fills this in"
├── dashboard/                              # Phase 4 — placeholder package.json only
│   ├── package.json
│   ├── src/
│   │   └── lib/
│   │       └── strategy_constants.ts       # GENERATED — DO NOT EDIT
│   └── README.md
├── backtest/                               # Python uv project (Phase 1+)
│   ├── pyproject.toml
│   ├── uv.lock
│   ├── src/
│   │   └── deepvault/
│   │       └── strategy_constants.py       # GENERATED — DO NOT EDIT
│   └── tests/
├── shared/
│   ├── strategy.toml                       # SOURCE OF TRUTH
│   └── golden-vectors.json                 # Phase 1 fills (initially empty array)
├── scripts/
│   ├── codegen.py                          # TOML → Move/Python/TS
│   ├── predict-diff.sh                     # weekly upstream sweep
│   ├── mainnet-preflight.sh                # Phase 5 placeholder
│   └── deepbookv3/                         # vendored fork (subtree or sparse)
├── config/
│   ├── testnet.toml                        # addresses, RPC URLs, type tags
│   └── mainnet.toml                        # placeholders until Phase 5
├── docs/
│   ├── CONTRIBUTING.md                     # code-freeze, no-refactor, hedge-policy summary
│   ├── HEDGE-POLICY.md                     # full ADR (D-01..D-05)
│   ├── MAINNET-FUNDING.md                  # Cetus playbook (D-08)
│   └── ARCHITECTURE.md                     # link to .planning/research/ARCHITECTURE.md
├── .predict-diff-state                     # last-seen DeepBookV3 SHA
├── package.json                            # root: workspace manifest + dev deps
├── pnpm-workspace.yaml                     # lists indexer/, dashboard/
├── pnpm-lock.yaml                          # COMMIT THIS
├── Makefile                                # make build|test|codegen|lint|demo
├── README.md                               # laypitch, glossary, build log (append-only)
├── LICENSE                                 # MIT
└── .gitignore
```

### Pattern 1: pnpm workspace bootstrap

**What:** Root `package.json` declares workspace, `pnpm-workspace.yaml` lists members, each member has its own `package.json`.

**When to use:** TS monorepo with multiple deployable artifacts (indexer, dashboard) sharing a single lockfile.

**Example:**

```yaml
# pnpm-workspace.yaml
packages:
  - 'indexer'
  - 'dashboard'
```

```json
// Root package.json
{
  "name": "deepvault",
  "version": "0.1.0",
  "private": true,
  "engines": { "node": ">=22", "pnpm": ">=10" },
  "scripts": {
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "lint": "pnpm -r lint"
  },
  "devDependencies": {
    "prettier": "3.x",
    "eslint": "9.x",
    "typescript": "5.6.x"
  },
  "packageManager": "pnpm@10.x.x"
}
```

```json
// indexer/package.json (Phase 0 placeholder)
{
  "name": "@deepvault/indexer",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "lint": "eslint src"
  },
  "dependencies": {
    "@mysten/sui": "2.16.0"
  }
}
```

`[CITED: pnpm.io/workspaces]`

### Pattern 2: uv project setup with lock discipline

**What:** `pyproject.toml` declares dependencies, `uv lock` produces deterministic `uv.lock`, CI runs `uv sync --locked` to enforce.

**Example:**

```toml
# backtest/pyproject.toml
[project]
name = "deepvault-backtest"
version = "0.1.0"
description = "DeepVault Python backtest harness"
requires-python = ">=3.12"
dependencies = [
  "numpy>=2.4",
  "pandas>=2.2",
  "scipy>=1.14",
  "pyarrow>=18",
  "matplotlib>=3.9",
  "requests>=2.32",
]

[dependency-groups]
dev = [
  "pytest>=8.3",
  "pytest-cov",
  "ruff",
  "tomli-w>=1.0",  # for codegen.py if writing TOML; reading uses stdlib tomllib
]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.ruff]
line-length = 100
target-version = "py312"

[tool.pytest.ini_options]
testpaths = ["tests"]
```

```bash
# Bootstrap
cd backtest
uv sync               # creates .venv, installs all deps including dev
uv lock               # writes uv.lock (commit this)
uv run pytest         # runs tests in managed env
```

`[CITED: docs.astral.sh/uv]`

### Pattern 3: Move.toml pin to forked branch + rev

**What:** Move dependency points at a git URL with `rev = "<exact SHA>"`. Branch reference works but is unstable; **rev pin** is mandatory for SETUP-02.

**Example:**

```toml
# contracts/Move.toml
[package]
name = "deepvault"
version = "0.1.0"
edition = "2024.beta"

[dependencies]
Sui = { git = "https://github.com/MystenLabs/sui.git", subdir = "crates/sui-framework/packages/sui-framework", rev = "framework/mainnet" }

DeepBookV3 = {
  git = "https://github.com/MystenLabs/deepbookv3.git",
  subdir = "packages/deepbook",
  rev = "<EXACT_SHA_OF_predict-testnet-4-16_HEAD>"
}

# Predict, Margin, OracleSVI consumed via DeepBookV3 dependency tree
# OR pinned separately if Mysten splits packages — verify in Phase 1 spike

[addresses]
deepvault     = "0x0"
predict       = "0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138"  # testnet
deepbook      = "0x..."                                                                # testnet
sui           = "0x2"
std           = "0x1"
clock         = "0x6"
```

**Critical note:** Use `rev = "<sha>"`, not `rev = "predict-testnet-4-16"`. A branch reference will silently follow upstream HEAD, defeating Pitfall 6 mitigation. The Monday-diff workflow exists precisely to surface SHA changes for explicit bumping.

### Pattern 4: shared/strategy.toml schema

```toml
# shared/strategy.toml
# Single source of truth for cross-runtime constants.
# DO NOT edit generated files (strategy_constants.{move,py,ts}) directly.
# Run `make codegen` after editing this file.

schema_version = 1
last_updated = "2026-05-09"

[fixed_point]
# All on-chain math is fixed-point; document the scale here.
decimals = 18                      # standard for prices/values
variance_decimals = 27             # higher precision for SVI total variance
share_decimals = 9                 # vault share decimals (matches Sui Coin convention)

[hedge_policy]
# Locked per CONTEXT.md D-01..D-04. Re-tunable only in Phase 3 backtest.
allocation_bps = 1000              # 10% of new deposit (10000 bps = 100%)
strike_otm_bps = 1500              # -15% OTM
tenor_seconds = 1209600            # 14 days
roll_trigger_seconds = 172800      # 2 days
sizing_function = "fixed"          # v1; "dynamic" is v2 swap

[token_bucket]
# Withdrawal queue limiter (Phase 2 fills with backtest-validated values)
capacity_bps = 1000                # 10% of vault per period — placeholder
refill_rate_bps_per_sec = 1        # placeholder
period_seconds = 3600

[ltv]
# Worst-case haircut bounds (Phase 3 PTB-05 validates)
margin_ltv_cap_bps = 5000          # 50% (defensive; below Margin's 55% recommended)
worst_case_settlement_haircut_bps = 10000  # 100% — assume full Predict adverse outcome

[oracle]
max_staleness_seconds = 300        # 5 min; vault refuses supply/rebalance if exceeded

[svi]
# SSVI parameterization — Phase 1 fills full schema after Gatheral evaluator audit
parameterization = "ssvi"
grid_points_for_arb_check = 200
strike_range_sigma = 4

[meta]
# Anchor for sanity checks
btc_decimals = 8
quote_decimals = 6                 # USDsui mainnet, dUSDC testnet
```

### Pattern 5: codegen.py emitted file shapes

Emitted Move file:

```move
// contracts/sources/strategy_constants.move
// =============================================================================
// AUTO-GENERATED — DO NOT EDIT
// Source: shared/strategy.toml (schema_version 1)
// Regenerate via: make codegen
// =============================================================================

module deepvault::strategy_constants {
    // Fixed-point scales
    public fun decimals(): u8 { 18 }
    public fun variance_decimals(): u8 { 27 }
    public fun share_decimals(): u8 { 9 }

    // Hedge policy (locked in CONTRIBUTING.md)
    public fun allocation_bps(): u64 { 1000 }
    public fun strike_otm_bps(): u64 { 1500 }
    public fun tenor_seconds(): u64 { 1209600 }
    public fun roll_trigger_seconds(): u64 { 172800 }

    // Token bucket
    public fun bucket_capacity_bps(): u64 { 1000 }
    public fun bucket_refill_rate_bps_per_sec(): u64 { 1 }
    public fun bucket_period_seconds(): u64 { 3600 }

    // LTV
    public fun margin_ltv_cap_bps(): u64 { 5000 }
    public fun worst_case_settlement_haircut_bps(): u64 { 10000 }

    // Oracle
    public fun max_staleness_seconds(): u64 { 300 }
}
```

Emitted Python file:

```python
# backtest/src/deepvault/strategy_constants.py
# =============================================================================
# AUTO-GENERATED — DO NOT EDIT
# Source: shared/strategy.toml (schema_version 1)
# Regenerate via: make codegen
# =============================================================================
"""Strategy constants emitted from shared/strategy.toml."""
from typing import Final

# Fixed-point scales
DECIMALS: Final[int] = 18
VARIANCE_DECIMALS: Final[int] = 27
SHARE_DECIMALS: Final[int] = 9

# Hedge policy (locked in CONTRIBUTING.md)
ALLOCATION_BPS: Final[int] = 1000
STRIKE_OTM_BPS: Final[int] = 1500
TENOR_SECONDS: Final[int] = 1209600
ROLL_TRIGGER_SECONDS: Final[int] = 172800

# Token bucket
BUCKET_CAPACITY_BPS: Final[int] = 1000
BUCKET_REFILL_RATE_BPS_PER_SEC: Final[int] = 1
BUCKET_PERIOD_SECONDS: Final[int] = 3600

# LTV
MARGIN_LTV_CAP_BPS: Final[int] = 5000
WORST_CASE_SETTLEMENT_HAIRCUT_BPS: Final[int] = 10000

# Oracle
MAX_STALENESS_SECONDS: Final[int] = 300

# SVI
SVI_PARAMETERIZATION: Final[str] = "ssvi"
SVI_GRID_POINTS_FOR_ARB_CHECK: Final[int] = 200
SVI_STRIKE_RANGE_SIGMA: Final[int] = 4
```

Emitted TypeScript file:

```typescript
// dashboard/src/lib/strategy_constants.ts
// =============================================================================
// AUTO-GENERATED — DO NOT EDIT
// Source: shared/strategy.toml (schema_version 1)
// Regenerate via: make codegen
// =============================================================================

export const STRATEGY_CONSTANTS = {
  // Fixed-point scales
  DECIMALS: 18,
  VARIANCE_DECIMALS: 27,
  SHARE_DECIMALS: 9,

  // Hedge policy (locked in CONTRIBUTING.md)
  ALLOCATION_BPS: 1000,
  STRIKE_OTM_BPS: 1500,
  TENOR_SECONDS: 1209600n,           // bigint for u64 parity with Move
  ROLL_TRIGGER_SECONDS: 172800n,

  // Token bucket
  BUCKET_CAPACITY_BPS: 1000,
  BUCKET_REFILL_RATE_BPS_PER_SEC: 1,
  BUCKET_PERIOD_SECONDS: 3600,

  // LTV
  MARGIN_LTV_CAP_BPS: 5000,
  WORST_CASE_SETTLEMENT_HAIRCUT_BPS: 10000,

  // Oracle
  MAX_STALENESS_SECONDS: 300,

  // SVI
  SVI_PARAMETERIZATION: 'ssvi' as const,
  SVI_GRID_POINTS_FOR_ARB_CHECK: 200,
  SVI_STRIKE_RANGE_SIGMA: 4,
} as const;
```

### Pattern 6: codegen.py drift detection in CI

**What:** CI runs `python scripts/codegen.py` then `git diff --exit-code` on the three generated files. Non-zero exit means a developer changed `strategy.toml` without regenerating.

**Example CI step:**

```yaml
- name: Verify codegen is up to date
  run: |
    python scripts/codegen.py
    git diff --exit-code --stat \
      contracts/sources/strategy_constants.move \
      backtest/src/deepvault/strategy_constants.py \
      dashboard/src/lib/strategy_constants.ts
```

This is the standard pattern — see e.g. `actions/setup-python` README and Rust's `cargo expand` workflow patterns. Faster alternative is hash-comparison (`sha256sum strategy_constants.* > .codegen-hashes; codegen.py; sha256sum -c .codegen-hashes`) but `git diff` is simpler and gives a readable diff in CI logs.

### Pattern 7: predict-diff.sh

**What:** Bash script that fetches the vendored DeepBookV3 fork, computes commits since last sweep, writes a Markdown summary to a file path passed as `$1`.

```bash
#!/usr/bin/env bash
# scripts/predict-diff.sh
# Usage: scripts/predict-diff.sh [output-md-path]
# Reports new commits on predict-testnet-4-16 since last sweep.
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
VENDOR_DIR="${REPO_ROOT}/scripts/deepbookv3"
STATE_FILE="${REPO_ROOT}/.predict-diff-state"
OUTPUT="${1:-/dev/stdout}"
WATCH_PATHS=(
  "packages/deepbook"
  "packages/predict"
  "packages/predict_manager"
  "packages/oracle_svi"
)

cd "${VENDOR_DIR}"
git fetch origin predict-testnet-4-16 --quiet

LAST_SHA="$(cat "${STATE_FILE}" 2>/dev/null || git rev-parse origin/predict-testnet-4-16~10)"
HEAD_SHA="$(git rev-parse origin/predict-testnet-4-16)"

if [[ "${LAST_SHA}" == "${HEAD_SHA}" ]]; then
  cat > "${OUTPUT}" <<EOF
# Monday Predict Sweep — $(date -u +%F)

**Status:** No new commits on \`predict-testnet-4-16\` since last sweep.
**HEAD:** \`${HEAD_SHA}\`
**Action:** None.
EOF
  exit 0
fi

cat > "${OUTPUT}" <<EOF
# Monday Predict Sweep — $(date -u +%F)

**Status:** New commits detected on \`predict-testnet-4-16\`.
**Range:** \`${LAST_SHA}..${HEAD_SHA}\`

## Commits affecting watched paths

\`\`\`
$(git log --oneline "${LAST_SHA}..${HEAD_SHA}" -- "${WATCH_PATHS[@]}" || echo "(none in watched paths — non-Predict commits only)")
\`\`\`

## All commits in range

\`\`\`
$(git log --oneline "${LAST_SHA}..${HEAD_SHA}")
\`\`\`

## Triage checklist

- [ ] Review diffs in watched paths above
- [ ] If breaking change to \`predict::supply\` / \`predict::mint\` / \`OracleSVIUpdated\` event:
  - [ ] Halt feature work (label this issue \`blocking\`)
  - [ ] Update \`vault::predict_adapter\` to match new ABI
  - [ ] Re-run integration suite
- [ ] If non-breaking: bump \`Move.toml\` rev pin, update \`.predict-diff-state\`, close this issue

**Last sweep state:** \`${LAST_SHA}\`
**Update state file once triaged:** \`echo "${HEAD_SHA}" > .predict-diff-state\`
EOF
```

**Design note (Pitfall 6 mitigation):** Script does NOT auto-update `.predict-diff-state`. The state file advances only when a human triages. This forces explicit acknowledgement of every breaking change. CI workflow does NOT auto-fail on diff — it creates an Issue with label `blocking` so CI stays green but Slack/email notifications fire.

### Pattern 8: Monday cron workflow

```yaml
# .github/workflows/monday-predict-check.yml
name: Monday Predict Sweep

on:
  schedule:
    - cron: '0 14 * * 1'   # Mondays 14:00 UTC = 09:00 ET / 06:00 PT
  workflow_dispatch: {}    # allow manual trigger

permissions:
  issues: write
  contents: read

jobs:
  sweep:
    name: Diff predict-testnet-4-16 vs last sweep
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          submodules: recursive  # if using submodule for vendored fork
          # OR remove if using subtree (subtree is in tree)

      - name: Run predict-diff
        run: |
          mkdir -p /tmp/sweep
          bash scripts/predict-diff.sh /tmp/sweep/report.md
          cat /tmp/sweep/report.md

      - name: Create Issue from report
        uses: peter-evans/create-issue-from-file@v6
        with:
          title: "Monday Predict Sweep — ${{ github.event.repository.updated_at || 'manual' }}"
          content-filepath: /tmp/sweep/report.md
          labels: |
            predict-sweep
            triage
```

`[CITED: github.com/peter-evans/create-issue-from-file]` — `@v6` is the current major. Issue title pattern `"Monday Predict Sweep — YYYY-MM-DD"` is human-readable; labels `predict-sweep` + `triage` make filtering trivial. The label `blocking` is added manually by the triager if a breaking change is detected (per CONTEXT.md "halts feature work on breaking change" requirement).

**Cron caveat:** `[CITED: docs.github.com]` — scheduled workflows can be delayed during high GitHub Actions load (sometimes by hours). For a Monday-09:00 ritual, schedule for Monday-06:00 PT to provide headroom. Workflow files must be on the default branch.

### Pattern 9: GitHub Actions ci.yml (4-job matrix)

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

permissions:
  contents: read

jobs:
  move:
    name: Move tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install Sui CLI (mainnet-v1.71.1)
        run: |
          # Pin via direct release asset (suiup not available as a GitHub Action as of May 2026)
          SUI_VERSION="mainnet-v1.71.1"
          curl -fsSL "https://github.com/MystenLabs/sui/releases/download/${SUI_VERSION}/sui-${SUI_VERSION}-ubuntu-x86_64.tgz" -o /tmp/sui.tgz
          mkdir -p "$HOME/.sui/bin"
          tar -xzf /tmp/sui.tgz -C "$HOME/.sui/bin"
          echo "$HOME/.sui/bin" >> "$GITHUB_PATH"

      - name: Verify Sui version
        run: sui --version

      - name: Move build
        working-directory: contracts
        run: sui move build

      - name: Move test
        working-directory: contracts
        run: sui move test

  ts:
    name: TypeScript tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 10
          run_install: false

      - uses: actions/setup-node@v6
        with:
          node-version: '22'
          cache: 'pnpm'

      - name: Install
        run: pnpm install --frozen-lockfile

      - name: Lint + typecheck
        run: pnpm -r run lint && pnpm -r exec tsc --noEmit

      - name: Test
        run: pnpm -r run test

  python:
    name: Python tests
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: backtest
    steps:
      - uses: actions/checkout@v4

      - uses: astral-sh/setup-uv@v8
        with:
          version: 'latest'
          enable-cache: true
          cache-dependency-glob: 'backtest/uv.lock'

      - name: Install (locked)
        run: uv sync --locked --all-extras --dev

      - name: Lint
        run: uv run ruff check .

      - name: Format check
        run: uv run ruff format --check .

      - name: Test
        run: uv run pytest

  codegen-drift:
    name: Codegen drift check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v8
        with:
          enable-cache: true
      - name: Regenerate constants
        run: |
          uv run --no-project python scripts/codegen.py
      - name: Verify no drift
        run: |
          git diff --exit-code --stat \
            contracts/sources/strategy_constants.move \
            backtest/src/deepvault/strategy_constants.py \
            dashboard/src/lib/strategy_constants.ts || \
            (echo "::error::strategy_constants files out of sync — run 'make codegen' locally"; exit 1)

  parity:
    name: Three-way golden-vector parity
    runs-on: ubuntu-latest
    needs: [move, ts, python, codegen-drift]
    steps:
      - uses: actions/checkout@v4

      # Phase 0 SCAFFOLD: vectors file is empty []. Job exists but is a no-op.
      # Phase 1 wires the actual cross-runtime parity check here.
      - name: Phase 0 stub — assert vectors file exists
        run: |
          test -f shared/golden-vectors.json
          # Phase 1 will add: invoke Move test runner, Python test, TS test;
          # all three load shared/golden-vectors.json and assert identical output.
          echo "Phase 0 parity stub OK (empty vectors)"
```

**Branch-protection wiring (set once via GitHub UI or `gh api`):**
- Required status checks on `main`: `move`, `ts`, `python`, `codegen-drift`, `parity`
- Up-to-date branches required before merge
- No PR review requirement (CONTEXT.md Implementation Defaults: solo build, no second reviewer)

`[CITED: docs.github.com/actions]`, `[CITED: github.com/pnpm/action-setup]`, `[CITED: github.com/astral-sh/setup-uv]`

### Pattern 10: CONTRIBUTING.md skeleton

```markdown
# Contributing to DeepVault

DeepVault is a solo Sui Overflow 2026 hackathon submission with a hard 2026-06-16 ship date.
This document records the policy locks every contribution honors. **Read before opening a PR or pushing to main.**

## Hard policy locks

These are not guidelines — they are the rails.

### 1. Code freeze: 2026-05-30

After **2026-05-30 (Day 22 of 39)**, the only commits permitted are:

- Bug fixes (with a linked Issue or test demonstrating the bug)
- Integration glue between already-shipped modules
- Documentation, README, demo-script edits
- Mainnet deploy + smoke-test code (Phase 5)

**Forbidden after code freeze:**
- Internal architecture changes to `vault::` core (`supply`, `redeem`, `rebalance`)
- New features outside the active Phase 0-6 scope
- Renaming public APIs
- Refactors of working code "for cleanliness"

If a change feels like it crosses this line, the answer is: open a v2 issue, write a TODO comment, move on.

### 2. No refactor after vault ships

Once the vault Move package passes its Phase 2 testnet end-to-end test (estimated ~Day 17), the
internal architecture is **frozen** until submission. Refactor temptation is the #1 documented
schedule killer for this project class (see `.planning/research/PITFALLS.md` Pitfall 18).

**Test:** "Does this refactor unblock a specific feature on the active list?"
- Yes → write the change, link the unblocked feature in the commit message
- No → don't write it; open a v2 issue if it's worth remembering

Branches named `refactor/*` longer than 2 days are a smell — close them.

### 3. No dashboard work before vault feature-complete

Phase 4 (dashboard + relay) cannot start until Phase 2 (vault Move package) is closed and
Phase 3 Track A (two-protocol PTB) is at least integration-tested. CSS commits in Week 2 are
a regression of this rule. (See `.planning/research/PITFALLS.md` Pitfall 19.)

**Order is not a suggestion:** vault → backtest → SVI → composition → dashboard → submission.

### 4. Hedge-ratio policy is locked

The hedge-ratio policy below is committed in writing **before backtest opens** to lock against
hindsight tuning (see `docs/HEDGE-POLICY.md` for the full ADR). Numbers come from
`shared/strategy.toml` `[hedge_policy]` and may be re-tuned **only** during Phase 3 backtest,
on out-of-sample-aware walk-forward analysis. Once Phase 3 closes, the policy is **frozen
permanently** — no re-tuning after testnet stress test or after seeing mainnet behavior.

**Locked numbers (v1):**

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Allocation | 10% of new deposit | Standard DOV-class tail-hedge sizing; preserves most PLP APY |
| Strike | -15% OTM | Crash insurance framing; pays on -2σ to -3σ weekly moves |
| Tenor | 14 days | Cleaner accounting than 7-day rolling |
| Roll trigger | Expiry < 2 days | One roll per ~12-day cycle |
| Sizing function | Fixed (parameterized for v2 dynamic) | Correct fixed > buggy dynamic under time pressure |

### 5. Weekly Monday Predict sweep is non-negotiable

Every Monday 09:00 ET, GitHub Actions runs `scripts/predict-diff.sh` and creates a triage
Issue. If the issue reports a **breaking change** to `predict::supply`, `predict::mint`, or
`OracleSVIUpdated`:

1. Add label `blocking` to the issue
2. Halt feature work on the active phase
3. Update `vault::predict_adapter` to match the new ABI
4. Re-run integration suite
5. Resume feature work only when CI is green

Pitfall 6 (`.planning/research/PITFALLS.md`) documents the cost of skipping this ritual.

## Branch strategy

`main` only. Push directly. CI is the gate (required status checks: `move`, `ts`, `python`,
`codegen-drift`, `parity`). No feature branches, no PR reviews — solo build, no second
reviewer adds value.

## Editing generated code

Files marked `// AUTO-GENERATED — DO NOT EDIT` are emitted by `scripts/codegen.py` from
`shared/strategy.toml`. Editing them directly is reverted on next codegen run.

To change a constant:

1. Edit `shared/strategy.toml`
2. Run `make codegen` (or `python scripts/codegen.py`)
3. Commit the TOML change AND the regenerated files together
4. CI's `codegen-drift` job verifies you didn't forget step 2

## Commit log conventions

- Subject: imperative mood, ≤72 chars (e.g., "feat(vault): add token-bucket refill cap")
- Reference REQ-IDs where relevant (e.g., "closes SETUP-08")
- For policy changes: include "POLICY: ..." prefix and link the relevant ADR

## Build log discipline

The `## Build log` section in README is **append-only**. Never edit history; never delete
entries. Weekly bullet update on Sunday evenings:

```
### Week N (YYYY-MM-DD to YYYY-MM-DD)
- Phase X completed: ...
- Pitfall hit / mitigated: ...
- Slack remaining: M days
```

Hackathon hygiene; judges will skim it.
```

### Pattern 11: HEDGE-POLICY.md skeleton (full ADR)

```markdown
# DeepVault Hedge-Ratio Policy (v1)

**Status:** Locked
**Locked:** 2026-05-09 (Phase 0)
**Next review:** Phase 3 backtest (re-tunable on walk-forward only)
**Permanent freeze:** Phase 3 close (~2026-05-29)
**Owner:** DeepVault solo builder

## Context

DeepVault is a structured-product vault on DeepBook Predict that fuses PLP yield with
SVI-priced binary tail-risk hedges. The hedge-ratio policy determines how much of each
deposit is routed to the hedge book and the geometry of the hedge purchases. This policy
is committed before backtest opens to prevent hindsight tuning (see PITFALLS Pitfall 2).

## Decision

| Parameter | Value | Source-of-truth field |
|-----------|-------|------------------------|
| Allocation | 10% of new deposit | `strategy.toml [hedge_policy] allocation_bps = 1000` |
| Strike | -15% OTM (binary put 15% below current BTC spot) | `strategy.toml [hedge_policy] strike_otm_bps = 1500` |
| Tenor | 14 days | `strategy.toml [hedge_policy] tenor_seconds = 1209600` |
| Roll trigger | Expiry < 2 days | `strategy.toml [hedge_policy] roll_trigger_seconds = 172800` |
| Sizing function | Fixed (v1) | `strategy.toml [hedge_policy] sizing_function = "fixed"` |

## Rationale (per parameter)

### Allocation: 10%
Standard DOV-class tail-hedge allocation. Preserves >85% of the PLP APY in normal regimes
while providing meaningful crash protection. Values in [5%, 15%] are defensible; 10% is the
center of the institutional norm.

### Strike: -15% OTM
Aligns with "crash insurance" framing. Pays on -2σ to -3σ weekly BTC moves. Tighter strikes
(-5%, -10%) increase hedge cost without proportionally improving tail protection; wider
(-25%, -30%) leave too large an unhedged drawdown band.

### Tenor: 14 days, roll trigger < 2 days
14-day tenor produces ~12-day cycles between rolls, balancing:
- Cost of vol decay on a held option (favor short tenor)
- Transaction cost of frequent rolls (favor long tenor)
- Complexity of overlapping positions (avoided with 14-day non-overlap)

7-day rolling is operationally noisier; 30-day tenor leaves too much unhedged dwell time
between adverse SVI updates.

### Sizing function: Fixed (v1)
Brief Week-8 cut adopted up front: correct fixed-ratio sizing > buggy dynamic sizing under
39-day time pressure. The `sizing_function` parameter exists in `strategy.toml` so a v2
phase can swap to a dynamic policy (vol-target, drawdown-target, signal-driven) without
touching vault internals.

## Re-tuning policy

Re-tuning the four numbers above is permitted **only** during Phase 3 backtest (~Days 18-24)
on out-of-sample-aware walk-forward analysis:

1. Calibrate parameters on a rolling 60-day in-sample window
2. Test on the next 14-day out-of-sample window only
3. Walk forward to the next window
4. Reserve final 30% of history as a held-out validation set never touched during calibration

Once Phase 3 closes, this policy is **frozen permanently**. Specifically forbidden:

- Re-tuning after seeing testnet stress test results
- Re-tuning after seeing mainnet behavior in the smoke test
- "Polishing" a parameter for the demo video

If the locked policy underperforms in backtest, document the underperformance and ship with
the principled choice. PITFALLS Pitfall 2 documents why this rule exists.

## Alternatives considered

- **Allocation = 5% or 20%** — bracketing checked; 10% is the published institutional norm
- **Strike = -10% / -20%** — tighter is more expensive, wider leaves drawdown gap; -15% is center
- **Tenor = 7 days / 30 days** — operational noise / dwell-time argument above
- **Dynamic sizing in v1** — Brief Week-8 cut; correctness wins under deadline

## Cross-references

- `shared/strategy.toml` — runtime source of truth
- `.planning/research/PITFALLS.md` Pitfall 2 — lookahead-bias prevention
- `.planning/research/SUMMARY.md` Hard Policy Locks #10 — committed before backtest opens
- `CONTRIBUTING.md` §"Hedge-ratio policy is locked" — short-form summary for contributors

---
*Locked 2026-05-09 (Phase 0). Permanent freeze: Phase 3 close.*
```

### Pattern 12: MAINNET-FUNDING.md skeleton

```markdown
# DeepVault Mainnet Funding Playbook

**Purpose:** Mechanical Phase 5 execution — the mainnet redeploy is high-pressure;
this playbook eliminates decisions during deploy.
**Budget:** ~$80 USD total (with risk flag at $30 buffer — see below)

## Wallets (per CONTEXT.md D-06)

Two separate Sui keypairs:

| Wallet | Purpose | Storage |
|--------|---------|---------|
| Testnet dev | High-churn faucet-fed; runs scripts, integration tests, exploratory PTBs | `~/.sui/sui_config/sui.keystore` (default) |
| Mainnet deploy | Locked down; only Phase 5 deploy + smoke test + demo recording | Separate `~/.sui/sui_config_mainnet/sui.keystore` (set `SUI_CONFIG_DIR` env var when invoking) |

**Generation (Phase 0 task):**

```bash
# Testnet wallet
sui client new-address ed25519
# Note address; fund via https://faucet.testnet.sui.io

# Mainnet wallet (separate keystore dir)
mkdir -p ~/.sui/sui_config_mainnet
SUI_CONFIG_DIR=~/.sui/sui_config_mainnet sui client new-address ed25519
# Note address. DO NOT FUND YET (Phase 5 only).
```

**Key safety:** Both keystores must be in `~/` not in repo. Backup mainnet keystore to
encrypted external storage before any mainnet activity.

## Funding flow (Phase 5, ~Day 33)

Total funding target: $80 USD (with $30 buffer flag — see Risk Flag below).

### Step 1: Fund SUI to mainnet wallet (~$30)

CEX (Coinbase, Binance, Kraken) → SUI mainnet → mainnet deploy wallet address.

- Buy ~$30 of SUI on CEX
- Withdraw to mainnet deploy address
- Confirm with `SUI_CONFIG_DIR=~/.sui/sui_config_mainnet sui client gas`
- Expected: 1 gas object, ~30 SUI worth (depends on SUI price; aim for ≥10 SUI raw)

### Step 2: Acquire USDsui via Cetus DEX (~$50 → USDsui)

[Cetus](https://app.cetus.zone/swap?from=SUI&to=USDsui) — verify URL matches official Cetus
deployment in Phase 5 (URL pattern may evolve).

- Connect mainnet deploy wallet (Slush extension)
- Swap ~$50 worth of SUI → USDsui
- Confirm receipt: `sui client objects | grep USDsui`

**Type tag check:** USDsui mainnet type tag (Phase 5 verifies before deploy):

```
0x{USDSUI_PACKAGE}::usdsui::USDSUI
```

`config/mainnet.toml [assets]` has the verified tag — never hard-code in source.

### Step 3: Deploy DeepVault Move package (~$15 gas)

```bash
SUI_CONFIG_DIR=~/.sui/sui_config_mainnet \
  sui client publish --gas-budget 1000000000 contracts/
```

Expected gas: 0.5-2 SUI (~$5-15). If publish fails (e.g., compile error, address conflict):
fix, redeploy. Each retry burns gas — buffer covers up to 2 retries.

### Step 4: Smoke test ($50 USDsui round-trip)

Per DEPLOY-04 — script `scripts/mainnet-smoke-test.sh` (Phase 5 fills):

1. `vault::supply` 50 USDsui → mints VAULT_SHARE
2. `vault::rebalance::buy_hedge_for_deposit` → mints binary hedge
3. `vault::redeem_request` 50% of shares → ticket
4. Wait for token-bucket window
5. `vault::redeem_fulfill` ticket → returns USDsui (less hedge cost)

If any step fails: see Risk Flag below.

## Risk Flag: $30 buffer is tight

If Phase 5 hits a redeploy due to:

- Predict mainnet contract churn between Phase 0 and Phase 5
- Config bug discovered in smoke test (wrong type tag, wrong oracle ID)
- USDsui slippage ate buffer

Top up to $150 total **before Day 36 (2026-06-12)**. Better $70 of unused budget than a
submission missed because mainnet wasn't funded.

## Demo recording (Day 35-36)

- Demo PTB uses mainnet vault, mainnet wallet
- Demo recording wallet may be a third *fresh* keypair (CONTEXT.md D-09: ephemeral
  generated at recording time, funded with ~$10 SUI for gas + ~$10 USDsui from the deploy
  wallet via a single transfer)
- Tx digest visible in recording, pasteable into [Sui Explorer](https://suiscan.xyz/mainnet/home)

## Post-submission

- Mainnet deploy wallet: keep funded with residual SUI
- AdminCap: held by deployer; document holder address in submission package per
  PITFALLS Pitfall 14 (Move package upgrade left enabled)
- Upgrade cap: see DEPLOY-09 contingency
```

### Anti-Patterns to Avoid

- **Branch reference (not rev) in `Move.toml`:** `rev = "predict-testnet-4-16"` silently follows upstream HEAD. Always pin exact SHA. Re-derive SHA on Monday sweep; explicit bump only.
- **Auto-update `.predict-diff-state` in CI:** Defeats Pitfall 6 mitigation. State must advance only after human triage.
- **Auto-fail CI on Predict diff:** Brief reads "halts feature work on breaking change" but the right CI shape is "create labelled Issue, never block green." Auto-fail blocks unrelated commits.
- **Hardcoded addresses in Move source:** Use `Move.toml [addresses]` block; consume `config/{testnet,mainnet}.toml` for off-chain.
- **Editing generated `strategy_constants.*` files:** Reverted on next codegen. CI catches drift.
- **Storing keystores in repo:** Both testnet and mainnet keystore live in `~/.sui/`. `.gitignore` should explicitly exclude `**/.sui` if it ever appears.
- **`pnpm install` without `--frozen-lockfile` in CI:** Allows lockfile drift. CI must use `--frozen-lockfile`.
- **`uv sync` without `--locked` in CI:** Same drift risk; use `--locked` for reproducibility.
- **Building dashboard before vault ships:** PITFALLS Pitfall 19 — explicit CONTRIBUTING.md rule.
- **Refactoring after Day 22 code freeze:** PITFALLS Pitfall 18 — explicit CONTRIBUTING.md rule.
- **Recording demo on testnet:** PITFALLS Pitfall 15 — `demo recorded on mainnet only after smoke test`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Workspace orchestration | Custom shell loops over folders | pnpm `-r` flag + Makefile | pnpm handles topo order, parallelism, lockfile |
| Python dep resolution | pip + requirements.txt | uv + uv.lock | Reproducibility floor for backtest credibility |
| Multi-runtime constants generator | Hand-edit three files in lockstep | `scripts/codegen.py` from `shared/strategy.toml` | Drift is a class of bugs eliminated, not managed |
| GitHub Issue creation in CI | `curl gh api` from bash | `peter-evans/create-issue-from-file@v6` | Battle-tested action; less to debug |
| Cron scheduling | External cron service | GitHub Actions `on: schedule` | No external dep; runs on default branch only (good) |
| Sui CLI install in CI | Build from source | Direct release binary download (`sui-mainnet-v1.71.1-ubuntu-x86_64.tgz`) | suiup not available as Action as of May 2026; binary download is fastest |
| Sui CLI version management on dev | Manual cargo install per version | `suiup install sui mainnet-v1.71.1` | Version manager handles switching across testnet/mainnet pins |
| Wallet generation | Custom keygen script | `sui client new-address ed25519` | Standard tooling; integrates with sui keystore |
| TS lockfile reproducibility | "Always run install fresh" | `pnpm install --frozen-lockfile` | Single flag enforces lockfile discipline |
| Drift detection on generated files | Hash-comparison custom script | `git diff --exit-code` after regen | Same outcome, readable diff in CI logs |
| Build orchestration across languages | Bash mega-script | `Makefile` with phony targets | `make codegen|test|lint|demo` is the muscle memory |

**Key insight:** Phase 0 has zero novel engineering — every problem has a battle-tested off-the-shelf solution. Spending Phase 0 effort on custom infrastructure is itself the trap (it's a refactor before there's anything to refactor). Pin versions, copy paste-ready patterns, move to Phase 1.

## Common Pitfalls

### Pitfall 0-A: Branch ref instead of SHA pin in Move.toml

**What goes wrong:** `rev = "predict-testnet-4-16"` in Move.toml. Mysten lands a breaking commit on Tuesday; Wednesday's `sui move build` silently picks it up; Thursday's vault tests fail with no local change.
**Why it happens:** Branch refs feel "stable enough"; SHAs feel cumbersome.
**How to avoid:** Always pin SHA. Update via the Monday-sweep ritual, never silently.
**Warning signs:** Move.toml has `rev = "<branch-name>"` not a 40-char SHA. Inconsistent build behavior across machines.

### Pitfall 0-B: pnpm-lock.yaml not committed

**What goes wrong:** `pnpm install` on dev machine produces deps subtly different from CI.
**How to avoid:** Commit `pnpm-lock.yaml`. CI uses `--frozen-lockfile`. `.gitignore` does NOT exclude lockfiles.
**Warning signs:** `.gitignore` contains `*-lock.yaml`. New contributors see different `node_modules` than CI.

### Pitfall 0-C: uv.lock not committed

**Same shape, Python flavor.** `uv.lock` is the backtest's reproducibility floor. Commit it. CI uses `uv sync --locked`. (PITFALLS Pitfall 1 — lookahead bias mitigation depends on backtest being byte-identical across runs.)

### Pitfall 0-D: GitHub Actions schedule on a non-default branch

**What goes wrong:** Builder writes `monday-predict-check.yml` on a feature branch; workflow never triggers because schedule events only fire on default branch.
**How to avoid:** Push the workflow file to `main` first thing. Use `workflow_dispatch:` for manual triggering during development.
**Warning signs:** Cron scheduled but no runs appearing in Actions tab after Mondays.

### Pitfall 0-E: Codegen runs on `git push` but not on `git checkout`

**What goes wrong:** Branch switch leaves stale generated files; tests pass locally because constants haven't actually changed; PR fails codegen-drift.
**How to avoid:** Document `make codegen` as a pre-commit ritual; consider a git hook (`.git/hooks/post-checkout`) that runs codegen — but keep it advisory not mandatory.
**Warning signs:** "Why is CI failing on codegen-drift when I didn't touch strategy.toml?" — answer: branch switch didn't regen.

### Pitfall 0-F: Required status checks not enforced via branch protection

**What goes wrong:** CI is green but main can be pushed past failing CI because branch protection isn't configured.
**How to avoid:** Use GitHub UI (Settings → Branches → Add rule → main → require status checks) OR `gh api` script. Phase 0 task: include this configuration step explicitly.
**Warning signs:** Red commits on main. CI failure with no follow-up commit.

### Pitfall 0-G: Vendored fork drifting from `predict-testnet-4-16` HEAD silently

**What goes wrong:** Subtree pulled in Phase 0 with the SHA at that time; Monday script `git fetch`es a stale local branch; reports "no diff" even though upstream advanced.
**How to avoid:** `predict-diff.sh` runs `git fetch origin predict-testnet-4-16` (explicit `origin/<branch>`), not `git fetch origin` then comparing local HEAD.
**Warning signs:** Issue body always reports "No new commits" even months in.

### Pitfall 0-H: Ruff config in wrong file

**What goes wrong:** `[tool.ruff]` in repo root `pyproject.toml` (no Python project at root) is silently ignored. Ruff in `backtest/` follows backtest's own config.
**How to avoid:** Ruff config lives in `backtest/pyproject.toml` (only Python project in tree). Run ruff with `cd backtest && uv run ruff check .`.

## Code Examples

### Repository bootstrap order (sequenced)

```bash
# 1. Initialize repo, license, .gitignore
mkdir deepvault && cd deepvault
git init
echo "node_modules/\n.venv/\n.sui/\nbuild/\n*.tgz\n.predict-diff-state.local\n" > .gitignore
curl -fsSL https://choosealicense.com/licenses/mit/ -o LICENSE
# (Or write MIT text manually with current year + author name)

# 2. Top-level pnpm workspace
echo 'packages:\n  - "indexer"\n  - "dashboard"' > pnpm-workspace.yaml
# Write root package.json (see Pattern 1)

# 3. TS workspaces (placeholder)
mkdir -p indexer/src dashboard/src/lib
# Write indexer/package.json + dashboard/package.json (placeholders)

# 4. Move package
mkdir -p contracts/sources contracts/tests
sui move new contracts --name deepvault
# Edit contracts/Move.toml — pin DeepBookV3 by SHA (see Pattern 3)

# 5. Python uv project
mkdir -p backtest/src/deepvault backtest/tests
cd backtest && uv init --no-readme && cd ..
# Edit backtest/pyproject.toml (see Pattern 2)

# 6. shared/, scripts/, config/, docs/
mkdir -p shared scripts/deepbookv3 config docs

# 7. Vendor DeepBookV3 fork (subtree — recommended; see Decision §"Vendoring strategy")
git subtree add --prefix=scripts/deepbookv3 \
  https://github.com/MystenLabs/deepbookv3.git predict-testnet-4-16 --squash

# 8. shared/strategy.toml + scripts/codegen.py + run codegen
# (see Pattern 4 + Pattern 5)
python scripts/codegen.py

# 9. CI workflows
mkdir -p .github/workflows
# Write ci.yml + monday-predict-check.yml (see Patterns 8, 9)

# 10. Docs
# Write CONTRIBUTING.md, HEDGE-POLICY.md, MAINNET-FUNDING.md (see Patterns 10, 11, 12)

# 11. README.md with laypitch + glossary + build log section

# 12. First commit
git add .
git commit -m "phase 0: scaffold monorepo, codegen, CI, policy docs"

# 13. Push to GitHub (public, MIT)
gh repo create deepvault --public --source=. --push
gh api -X PUT repos/{owner}/deepvault/branches/main/protection \
  --input branch-protection.json
```

### Wallet generation (mainnet/testnet split)

```bash
# Testnet (default keystore)
sui client new-address ed25519
# Note: Output address. Save mnemonic to password manager.
# Set as active env: sui client switch --env testnet
# Fund: https://faucet.testnet.sui.io (web faucet) or
#       sui client faucet --address <addr>

# Mainnet (separate keystore — required for D-06 isolation)
mkdir -p ~/.sui/sui_config_mainnet
SUI_CONFIG_DIR=~/.sui/sui_config_mainnet sui client new-address ed25519
# Add mainnet RPC env if not present:
SUI_CONFIG_DIR=~/.sui/sui_config_mainnet \
  sui client new-env --alias mainnet --rpc https://fullnode.mainnet.sui.io:443
SUI_CONFIG_DIR=~/.sui/sui_config_mainnet sui client switch --env mainnet
# Backup keystore to encrypted external storage. Do NOT commit.
```

`[CITED: docs.sui.io/references/cli/client]`

### Make targets

```makefile
# Makefile
.PHONY: install codegen build test lint clean demo

install:
	pnpm install --frozen-lockfile
	cd backtest && uv sync --locked

codegen:
	python scripts/codegen.py
	@echo "Generated constants files. Don't edit them directly."

build: codegen
	pnpm -r run build
	cd contracts && sui move build
	cd backtest && uv run python -m build || true  # backtest is not packaged

test:
	cd contracts && sui move test
	pnpm -r run test
	cd backtest && uv run pytest

lint:
	pnpm -r run lint
	cd backtest && uv run ruff check . && uv run ruff format --check .

clean:
	rm -rf node_modules **/node_modules contracts/build backtest/.venv

demo:
	@echo "TODO: Phase 6 fills this in — should reproduce demo end-to-end from fresh clone"
```

## Decision: DeepBookV3 fork vendoring strategy

Three options surveyed. **Recommendation: git subtree.**

| Option | Pro | Con | Verdict |
|--------|-----|-----|---------|
| **git submodule** | Clean separation, doesn't bloat history, `git submodule update --remote` for fast pulls | Requires `--recursive` clone, contributors hit "submodule not initialized" footgun, CI must `--recurse-submodules` `[CITED: blog.timhutt.co.uk/against-submodules]` | Acceptable for solo build; documented friction |
| **git subtree** | Code is in tree from clone-1; `predict-diff.sh` works without extra setup; `git subtree pull --prefix=scripts/deepbookv3 ... predict-testnet-4-16 --squash` is the weekly bump command | Bloats history, large initial commit `[CITED: atlassian.com/git/tutorials/git-subtree]` | **RECOMMENDED** — solo build, clone simplicity > history size |
| **sparse-checkout via setup script** | Smallest checkout (only watched packages); no submodule/subtree friction | Custom script complexity, harder to reason about | Reject for Phase 0; revisit if subtree history bloat exceeds 100 MB |

**Phase 0 implementation:**

```bash
# One-time vendor add
git subtree add --prefix=scripts/deepbookv3 \
  https://github.com/MystenLabs/deepbookv3.git \
  predict-testnet-4-16 --squash

# Weekly bump (after Monday triage marks an Issue resolved)
git subtree pull --prefix=scripts/deepbookv3 \
  https://github.com/MystenLabs/deepbookv3.git \
  predict-testnet-4-16 --squash
```

The `--squash` flag prevents history bloat from being catastrophic — only one merge commit per pull instead of replaying the entire upstream log.

`[CITED: github.com/MystenLabs/deepbookv3]` — verified `predict-testnet-4-16` branch exists; last GitHub-displayed update Apr 27 2026.

**[ASSUMED]** The exact watched paths inside the fork (`packages/predict`, `packages/predict_manager`, `packages/oracle_svi`) match STACK.md research from 2026-05-08. Phase 1 spike (per ARCHITECTURE.md `Phase 1` Day 1) verifies these paths exist and contain `OracleSVIUpdated` event definition.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@mysten/sui.js` (legacy) | `@mysten/sui` 2.x | Late 2024 | Old tutorials reference `.js`; do not use |
| `@mysten/wallet-kit` | `@mysten/dapp-kit` 1.x | 2024 | Wallet-kit deprecated |
| `pip` + `requirements.txt` | `uv` + `uv.lock` | 2024-2025 | Reproducibility floor; 10-100x faster |
| Poetry | uv | 2025 | Same outcome, much faster |
| Jest | Vitest 4.x | 2024 (Vite ecosystem) | Faster cold start, native ESM |
| `pip install uv` in CI | `astral-sh/setup-uv@v8` | 2025 | Built-in cache keyed on `uv.lock` hash |
| WebSocket subscribeEvent | `client.queryEvents` polling | 2025-2026 | Sui JSON-RPC sunsets 2026-07-31 |
| Git submodule for vendored forks (default) | Git subtree --squash | 2020+ industry shift | Cleaner clone UX `[CITED: adam-p.ca/blog/2022/02/git-submodule-subtree]` |

**Deprecated/outdated:**
- `@mysten/sui.js` — replaced by `@mysten/sui`
- `@mysten/wallet-kit` — replaced by `@mysten/dapp-kit`
- `subscribeEvent` JSON-RPC — JSON-RPC sunsets 2026-07-31; for 39-day window, `queryEvents` polling is correct (Phase 4 concern, not Phase 0)
- `dapp-kit` → `dapp-kit-core` + `dapp-kit-react` migration **[FLAG]**: search results indicate npm has begun positioning `@mysten/dapp-kit` as legacy in favor of `@mysten/dapp-kit-core` + `@mysten/dapp-kit-react`. `[ASSUMED]` — STACK.md (2026-05-08) recommends `@mysten/dapp-kit@1.0.4`. Phase 4 should re-verify before locking dashboard scaffolding.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Exact SHA on `predict-testnet-4-16` HEAD as of Phase 0 start is unknown — must be captured by `git rev-parse origin/predict-testnet-4-16` after subtree add | §"Pattern 3", §"Decision: vendoring" | Can't pin Move.toml `rev`; resolved by 30-second command in Phase 0 task |
| A2 | DeepBookV3 fork contains paths `packages/predict`, `packages/predict_manager`, `packages/oracle_svi` | §"predict-diff.sh" | Wrong watch paths report "no changes" forever; Phase 1 Day-1 spike verifies via `ls scripts/deepbookv3/packages/` |
| A3 | `prettier` 3.x and `eslint` 9.x flat-config are the 2026-05 community defaults | §"Standard Stack" | Could substitute `biome` if user prefers; no functional difference for Phase 0 scaffold |
| A4 | `ruff` (combined formatter + linter) is the 2026-05 Python community default | §"Standard Stack" | Could substitute `black + ruff` or `isort + black + flake8`; ruff is faster/simpler |
| A5 | `@mysten/dapp-kit@1.0.4` is correct for May 2026 build; the new `dapp-kit-core` + `dapp-kit-react` packages may be the path forward | §"State of the Art" | Phase 4 (dashboard) re-verifies; doesn't affect Phase 0 since dashboard is a placeholder |
| A6 | Sui CLI release tarball naming pattern `sui-mainnet-v1.71.1-ubuntu-x86_64.tgz` is correct for CI install | §"GitHub Actions ci.yml" | Pattern verified against historical Sui releases; Phase 0 task includes `curl -fsSL` retry probe |
| A7 | `peter-evans/create-issue-from-file@v6` is current major as of May 2026 | §"Pattern 8" | Verified via search; `@v6` is published; `@v5` and earlier work but lack labels-multiline support |
| A8 | `astral-sh/setup-uv@v8` is current major | §"GitHub Actions ci.yml" | Verified via search (action exists, latest minor is `v8.1.0`) |
| A9 | Render free tier 750 hours/month vs 4320 minutes (10-min ping × 144 days) — keepalive math | §"Architectural Responsibility Map" | Render docs confirm free 750 hr/month; 10-min cron consumes ~144 hr/month = 19% of budget — well within `[CITED: render.com/docs/free]` |
| A10 | Vercel default `*.vercel.app` subdomain works for dashboard with cross-origin WebSocket to Render relay (CORS configured on relay side) | §"Architectural Responsibility Map" | If wildcard subdomain has CORS quirks, fallback is to set `Access-Control-Allow-Origin: https://<exact>.vercel.app` on relay; Phase 4 concern |
| A11 | `tomllib` (Python stdlib 3.11+) suffices for `codegen.py` reading `strategy.toml`; no `tomli-w` write dependency needed if codegen only writes Move/Python/TS files (not TOML output) | §"Pattern 5" | Phase 0 codegen only emits non-TOML; verified |
| A12 | Default GitHub Actions Ubuntu runner has `bash`, `git`, `curl`, `tar` installed for Sui binary download | §"Pattern 9" | Verified — `ubuntu-latest` ships these |
| A13 | Branch protection rules (required status checks) can be configured via `gh api` after first push | §"Code Examples" | GitHub REST API supports it; one-time setup task in Phase 0 |
| A14 | `sui move new <name>` scaffolds a Move package with sources/tests dirs and Move.toml | §"Code Examples" | Verified pattern; standard Sui CLI |
| A15 | Two-keystore approach (`SUI_CONFIG_DIR=~/.sui/sui_config_mainnet`) is the cleanest D-06 isolation | §"MAINNET-FUNDING.md" | Sui CLI supports this env var; verified |
| A16 | `[ASSUMED]` 09:00 ET = 14:00 UTC as standard Monday cron time (CONTEXT.md says "Monday" but no time) | §"Pattern 8" | Builder can adjust; no functional risk |

## Open Questions

1. **Exact SHA for `predict-testnet-4-16` at Phase 0 start**
   - What we know: branch exists, last GitHub-display update Apr 27 2026
   - What's unclear: 40-char SHA value (web fetch did not return it)
   - Recommendation: 30-second Phase 0 task — `git ls-remote https://github.com/MystenLabs/deepbookv3.git predict-testnet-4-16` (or after subtree add: `git -C scripts/deepbookv3 rev-parse HEAD`); paste into `Move.toml [dependencies.DeepBookV3] rev = "..."`

2. **Vendored fork path structure**
   - What we know: STACK.md (2026-05-08 research) cites `packages/predict`, `packages/oracle_svi`
   - What's unclear: Exact filenames inside (`predict.move`, `oracle_svi.move`), whether `packages/predict_manager` is its own package or a module of `packages/predict`
   - Recommendation: Phase 0 final task — `ls scripts/deepbookv3/packages/` after subtree add; update `predict-diff.sh` `WATCH_PATHS` array if needed. This also primes the Phase 1 Day-1 spike on `OracleSVIUpdated` event signature.

3. **`@mysten/dapp-kit` vs `dapp-kit-core` + `dapp-kit-react` migration timing**
   - What we know: Search results indicate the legacy `@mysten/dapp-kit` package is being deprecated in favor of split packages
   - What's unclear: Exact deprecation timeline; whether 1.0.4 still receives security patches; whether dashboard built in Phase 4 should target `dapp-kit-core` directly
   - Recommendation: Phase 4 (not Phase 0) re-verifies via `npm view @mysten/dapp-kit deprecated` and `npm view @mysten/dapp-kit-react`. Phase 0 dashboard is a placeholder package.json with no dapp-kit dependency yet.

4. **Render free tier WebSocket support specifics**
   - What we know: Free tier sleeps after 15 min idle; keepalive ping pattern works `[CITED: render.com/docs/free]`
   - What's unclear: Connection limits on free tier; behavior when relay process crashes mid-WS-frame
   - Recommendation: Phase 4 spike. Phase 0 only commits the deploy-target decision — no Render account setup needed in Phase 0 unless the user requests, since relay code lands Phase 4.

5. **Vercel CORS for cross-origin WebSocket to Render**
   - What we know: Vercel cannot host WS servers (functions terminate at 120s) `[CITED: copyprogramming.com]`; CORS not enabled by default `[CITED: vercel.com/kb]`
   - What's unclear: Whether dashboard's WS client needs `wss://` (yes) and whether browser blocks mixed-content if Render serves `ws://` (yes — must use Render's TLS-terminated `wss://` URL, which Render provides automatically)
   - Recommendation: Phase 4 verifies. Phase 0 docs note in CONTRIBUTING or ARCHITECTURE that relay must be `wss://` from Render's auto-TLS endpoint.

6. **Sui CLI binary tarball asset name pattern**
   - What we know: Sui releases publish per-OS tarballs `[CITED: docs.sui.io]`
   - What's unclear: Exact 2026 asset name convention (`sui-mainnet-v1.71.1-ubuntu-x86_64.tgz` is the inferred pattern)
   - Recommendation: Phase 0 task — verify via `curl -fsI https://github.com/MystenLabs/sui/releases/download/mainnet-v1.71.1/sui-mainnet-v1.71.1-ubuntu-x86_64.tgz` returns 200; if 404, navigate releases page and note actual asset name. Update CI workflow accordingly.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | TS workspaces, ci.yml | (verify on dev machine) | ≥22 LTS | Install via volta/fnm/nvm |
| pnpm | TS workspaces | (verify) | ≥10 | `npm i -g pnpm` |
| Python | backtest, codegen.py | (verify) | 3.12.x | uv installs Python automatically (`uv python install 3.12`) |
| uv | Python project mgmt, codegen.py invocation | (verify) | ≥0.5 | `curl -LsSf https://astral.sh/uv/install.sh \| sh` |
| Sui CLI | contracts/ Move work | (verify) | mainnet-v1.71.1 | `suiup install sui mainnet-v1.71.1` |
| suiup | CLI version mgmt | (verify) | latest | Install per `[CITED: github.com/MystenLabs/suiup]` |
| git | Repo, subtree, predict-diff | Standard | ≥2.30 (for sparse-checkout v2 API; not used in Phase 0) | Standard install |
| GitHub CLI (`gh`) | Repo creation, branch protection | Optional | — | Configure via web UI |
| bash | predict-diff.sh, Makefile | Standard on Ubuntu CI; on Windows dev: Git Bash or WSL | ≥4 | Use WSL if running on bare Windows |

**Missing dependencies with no fallback:** None for Phase 0.
**Missing dependencies with fallback:** All Phase 0 tools have install paths above.

> **Windows dev note:** Builder is on Windows 11 (per env header). Bash scripts (`predict-diff.sh`, Makefile) require Git Bash (ships with Git for Windows) or WSL. Phase 0 task: include "verify `bash --version`" as part of dev-machine bootstrap. CI runs on `ubuntu-latest` so CI is unaffected.

## Project Constraints (from CLAUDE.md)

CLAUDE.md was loaded. Directives:

- **Project: DeepVault** — same scope/constraints as `.planning/PROJECT.md`; CLAUDE.md is the synced summary.
- **Stack pins** — `@mysten/sui@2.16.0`, `@mysten/dapp-kit@1.0.4`, `@mysten/deepbook-v3@0.17.0`, Sui CLI `mainnet-v1.71.1`, Move 2024 edition; matches STACK.md.
- **Conventions:** "not yet established" — Phase 0 is the right place to set them via `CONTRIBUTING.md` and `Makefile` patterns.
- **Architecture:** "not yet mapped" — `.planning/research/ARCHITECTURE.md` exists; CLAUDE.md will hydrate from there in a later phase.
- **Skills:** none configured.
- **GSD Workflow Enforcement:** "Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync." Phase 0 plans must be created via `/gsd-plan-phase` (current flow); execution via `/gsd-execute-phase`.

No CLAUDE.md directive contradicts any locked decision in CONTEXT.md.

## Sources

### Primary (HIGH confidence)
- [Sui GitHub Releases](https://github.com/MystenLabs/sui/releases) — `mainnet-v1.71.1` published May 6 2026, protocol version 123
- [@mysten/sui on npm](https://www.npmjs.com/package/@mysten/sui) — 2.16.0 latest, published ~Apr 18 2026
- [@mysten/dapp-kit on npm](https://www.npmjs.com/package/@mysten/dapp-kit) — 1.0.4
- [@mysten/deepbook-v3 on npm](https://www.npmjs.com/package/@mysten/deepbook-v3) — 0.17.0, published ~Apr 28 2026
- [Vitest releases](https://github.com/vitest-dev/vitest/releases) — 4.1.5 published Apr 21 2026
- [Numpy 2.4.0 release notes](https://numpy.org/doc/stable/release.html) — 2.4.0 Dec 20 2025; 2.4.4 latest
- [astral-sh/setup-uv](https://github.com/astral-sh/setup-uv) — `@v8.1.0`, cache-dependency-glob `**/uv.lock`
- [docs.astral.sh/uv](https://docs.astral.sh/uv/guides/integration/github/) — `uv sync --locked --all-extras --dev` canonical CI invocation
- [pnpm.io/workspaces](https://pnpm.io/workspaces) — workspace conventions, `--frozen-lockfile`, `-r` flag
- [github.com/pnpm/action-setup](https://github.com/pnpm/action-setup) — `@v4` is canonical
- [github.com/peter-evans/create-issue-from-file](https://github.com/peter-evans/create-issue-from-file) — `@v6` current major
- [docs.sui.io/references/cli](https://docs.sui.io/references/cli) — `sui client new-address`, `sui move test --coverage`, keystore conventions
- [github.com/MystenLabs/suiup](https://github.com/MystenLabs/suiup) — `suiup install sui mainnet-v1.71.1` syntax
- [github.com/MystenLabs/deepbookv3/tree/predict-testnet-4-16](https://github.com/MystenLabs/deepbookv3/tree/predict-testnet-4-16) — branch verified to exist
- [docs.github.com — schedule events](https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows) — cron syntax, default-branch-only constraint, schedule delays
- [render.com/docs/free](https://render.com/docs/free) — 750 hr/month free tier, 15 min idle sleep
- [.planning/research/STACK.md, ARCHITECTURE.md, PITFALLS.md, SUMMARY.md] — upstream research artifacts for this project

### Secondary (MEDIUM confidence)
- [atlassian.com/git/tutorials/git-subtree](https://www.atlassian.com/git/tutorials/git-subtree) — subtree-vs-submodule trade-offs
- [adam-p.ca/blog/2022/02/git-submodule-subtree](https://adam-p.ca/blog/2022/02/git-submodule-subtree/) — vendoring decision matrix
- [Vitest 4.0 announcement](https://vitest.dev/blog/vitest-4) — current major release
- [Vitest 4.1 announcement](https://main.vitest.dev/blog/vitest-4-1) — March 12 2026
- [copyprogramming.com — Vercel WebSocket](https://copyprogramming.com/howto/can-t-connect-to-websocket-server-after-pushing-to-vercel) — Vercel functions 120s timeout makes WS infeasible
- [vercel.com/kb/guide/how-to-enable-cors](https://vercel.com/kb/guide/how-to-enable-cors) — CORS not default on Vercel

### Tertiary (LOW confidence — flagged in Open Questions)
- Exact `predict-testnet-4-16` HEAD SHA — Phase 0 task to capture
- Sui CLI tarball asset naming for May 2026 — Phase 0 task to verify
- `@mysten/dapp-kit-core/react` migration urgency — Phase 4 concern

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all package versions verified via npm/PyPI/GitHub Releases on May 8 2026
- Toolchain pins: HIGH — Sui CLI release confirmed; suiup syntax confirmed
- DeepBookV3 vendoring strategy: MEDIUM-HIGH — subtree pattern is industry standard; rationale is clear; SHA capture is a Phase 0 task not a research gap
- Codegen pattern: HIGH — multi-language constants emission from a single source is a textbook pattern; emitted file shapes shown explicitly
- Predict-diff workflow: HIGH — `peter-evans/create-issue-from-file@v6` is canonical; cron syntax is standard; non-blocking issue creation aligns with PITFALLS Pitfall 6 design
- CI matrix: HIGH — 4-job matrix with `needs:` is standard GitHub Actions; setup-uv + pnpm/action-setup are canonical
- Policy doc skeletons (CONTRIBUTING/HEDGE-POLICY/MAINNET-FUNDING): HIGH — every line traceable to CONTEXT.md decision or PITFALLS pitfall
- Pitfalls: HIGH — all Phase 0 pitfalls inherit from upstream research (Pitfall 6, 14, 18, 19) plus Phase 0-specific (0-A through 0-H)
- Open questions: HIGH on the questions themselves (correctly bounded), LOW on the answers (deliberately deferred to Phase 0 spike tasks or later phases)

**Research date:** 2026-05-08
**Valid until:** 2026-05-22 — re-verify before Phase 0 closes if Predict has shipped a breaking change (Monday sweep on 2026-05-12 is the trigger)
