# Phase 0: Setup & Ground Rules - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-09
**Phase:** 0-Setup & Ground Rules
**Areas discussed:** Hedge-ratio policy specifics, Wallet & mainnet funding strategy, Repository visibility & licensing, Dashboard hosting for demo

---

## Hedge-Ratio Policy Specifics

### Allocation %

| Option | Description | Selected |
|--------|-------------|----------|
| 5% — yield-leaning | Minimal hedge cost; APY tracks raw PLP. Tail protection covers ~-3σ but not -5σ. | |
| 10% — balanced (Recommended) | Standard DOV tail-hedge allocation. Meaningful crash protection while preserving most APY. | ✓ |
| 15% — protection-leaning | Heavy hedging. Visibly lower APY but materially capped tail drawdown. | |
| 20%+ or other | Probably overkill — starts looking like "mostly insurance." | |

**User's choice:** 10% (Recommended)

### OTM Strike

| Option | Description | Selected |
|--------|-------------|----------|
| -10% OTM — protective | More frequent payouts; higher premium. Better risk-adjusted but eats more APY. | |
| -15% OTM — tail (Recommended) | Standard tail-risk strike. Pays only on -2σ to -3σ moves. Aligns with "crash insurance" framing. | ✓ |
| -20% OTM — deep tail | True crash insurance. Cheapest premium, fires only in real disasters. | |
| -25% or other | Probably too deep unless backtest shows -25%+ moves were the actual stress events. | |

**User's choice:** -15% OTM (Recommended)

### Tenor

| Option | Description | Selected |
|--------|-------------|----------|
| 7 days, roll at <2 days | Frequent rolls; reactive but more gas + slippage. | |
| 14 days, roll at <2 days (Recommended) | Standard tail-hedge tenor. ~12-day cycle. Cleaner accounting. | ✓ |
| 30 days, roll at <5 days | Lowest roll cost but tenor mismatch with weekly BTC vol. | |
| Match Predict's deepest expiry | Pragmatic but defers backtest spec. | |

**User's choice:** 14 days, roll at <2 days (Recommended)

**Notes:** Numbers are locked at deploy time; last tunable ONLY in Phase 3 backtest on out-of-sample-aware walk-forward analysis; frozen permanently once Phase 3 closes. Documented in `docs/HEDGE-POLICY.md` and committed to repo before Phase 3 backtest opens (SETUP-06 fulfillment).

---

## Wallet & Mainnet Funding Strategy

### Wallets

| Option | Description | Selected |
|--------|-------------|----------|
| Two separate wallets (Recommended) | Testnet wallet for daily dev + mainnet wallet locked to deploy/smoke/demo only. | ✓ |
| Single wallet for both | Simpler keymanagement; not worth the marginal risk. | |
| Three: dev / testnet / mainnet | Adds fresh-wallet role for reproducibility tests. | |

**User's choice:** Two separate wallets (Recommended)

### Mainnet Budget

| Option | Description | Selected |
|--------|-------------|----------|
| ~$80 (50 smoke + 30 buffer) | Tight floor. $50 smoke + ~$15 SUI gas + ~$15 buffer. | ✓ |
| ~$150 (recommended buffer) | $50 smoke + ~$25 gas + $75 buffer for unexpected redeploys. | |
| ~$300 (generous) | Lots of slack for retries and visual-impact larger deposits. | |
| Specify exact amount | Custom figure. | |

**User's choice:** ~$80 (50 smoke + 30 buffer)

**Risk flag captured in CONTEXT.md:** $30 buffer is tight; if Phase 5 hits a redeploy due to Predict mainnet contract churn or a config bug, top up to $150 before Day 36 (2026-06-12 mainnet smoke deadline).

### USDsui Access

| Option | Description | Selected |
|--------|-------------|----------|
| Cetus / DEX swap from SUI (Recommended) | CEX → SUI → mainnet wallet → Cetus swap → USDsui. | ✓ |
| Bridge USDC → USDsui | Bridge from Eth/Sol; only worth it for >$1k. | |
| Already have USDsui | Send from existing wallet. | |
| Need help figuring this out | Research playbook in Phase 0. | |

**User's choice:** Cetus / DEX swap from SUI (Recommended)

**Notes:** Cetus swap playbook documented in `docs/MAINNET-FUNDING.md` during Phase 0 so Phase 5 execution is mechanical.

---

## Repository Visibility & Licensing

### Visibility

| Option | Description | Selected |
|--------|-------------|----------|
| Public from day 1 (Recommended) | Hackathon norm; build-in-public credibility; auditable by Mysten anytime. | ✓ |
| Private until submission | Adds a "flip visibility" task; small risk of forgetting. | |
| Private throughout | Hackathon policy must be verified; less standard. | |

**User's choice:** Public from day 1 (Recommended)

### License

| Option | Description | Selected |
|--------|-------------|----------|
| MIT (Recommended) | Permissive, hackathon standard, no friction for derivatives. | ✓ |
| Apache 2.0 | Permissive + explicit patent grant. Slightly more legal-formal. | |
| MPL 2.0 / GPL | Copyleft; less hackathon-friendly. | |
| All Rights Reserved | Source visible but legally not open-source; hostile to community award. | |

**User's choice:** MIT (Recommended)

### Build-Public

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — minimal (Recommended) | Weekly bullet updates in README + 1-2 X posts pinned. Low time cost. | ✓ |
| Yes — active | Active threading + GIFs. ~30-60 min/week. Pays off in Community Award voting. | |
| No — head-down build | All effort into the build; README + demo at submission. | |

**User's choice:** Yes — minimal (Recommended)

---

## Dashboard Hosting for Demo

### Demo Host

| Option | Description | Selected |
|--------|-------------|----------|
| Local Vite dev only | Localhost:5173 during recording; controllable; no network surprises. | |
| Public Vercel deploy + local backup (Recommended) | Public dashboard linked from README; falls back to local for recording. | ✓ |
| Public deploy as the demo host | Most credible but riskier (network hiccup forces retake). | |
| GitHub/Cloudflare Pages instead | More moving parts (relay still needs separate host). | |

**User's choice:** Public Vercel deploy + local backup (Recommended)

**Notes:** Recording target IS local Vite (controllable take); Vercel public deploy is the post-recording artifact judges interact with afterwards.

### Relay Host

| Option | Description | Selected |
|--------|-------------|----------|
| Render free tier (Recommended) | Auto-deploys from GitHub; sleeps after idle (add keepalive ping). | ✓ |
| Fly.io free tier | Similar; marginally faster cold starts. | |
| Local only | Cuts hosting; loses "judges can interact" moment. | |
| VPS / paid cloud | Overkill for hackathon. | |

**User's choice:** Render free tier (Recommended)

**Notes:** Keepalive ping via GitHub Actions cron hitting `/healthz` every 10min. Configure in Phase 0 even though relay is built in Phase 4.

### Domain

| Option | Description | Selected |
|--------|-------------|----------|
| Default vercel.app subdomain (Recommended) | Free, no DNS work, professional enough for hackathon. | ✓ |
| Custom domain | More polish; adds $10-50 + DNS work. | |

**User's choice:** Default vercel.app subdomain (Recommended)

---

## Claude's Discretion

The following implementation details were chosen by Claude as builder, recorded in CONTEXT.md `<decisions>/Implementation Defaults` for downstream agents:

- **Monorepo orchestration:** Plain pnpm workspaces + top-level Makefile (no Turborepo/Nx).
- **strategy.toml codegen:** Single Python script (`scripts/codegen.py`) emits Move + Python + TS constants from one TOML file.
- **Predict-diff script:** Bash + git fetch/log over a vendored DeepBookV3 fork checkout; weekly Issue auto-created via Actions cron (no external calendar dep).
- **Editor / formatter / linter:** prettier + eslint (TS); ruff (Python); `sui move build` checks (Move).
- **Branch strategy:** main only, push directly. CI required-status-check on default branch.
- **Test framework:** Move stdlib `sui move test`; Vitest 4.x (TS); pytest 8.3 (Python).
- **CI runner:** GitHub Actions Ubuntu, single `ci.yml` with parallel move/ts/python jobs + a parity job depending on all three.
- **Repository structure:** `contracts/`, `indexer/`, `dashboard/`, `backtest/`, `shared/`, `scripts/`, `config/`, `docs/`, `.github/workflows/`.

---

## Deferred Ideas

Captured in CONTEXT.md `<deferred>` section:

- Turborepo / Nx caching (revisit only if `make build` exceeds 2 min)
- Custom domain (post-submission, only if project continues)
- Active social posting (X threads, GIFs of milestones) — solo-builder time-eating risk
- Three-wallet structure (overkill; ephemeral CI keypairs cover fresh-wallet case)
- Bridged USDC → USDsui (only relevant if budget grows beyond ~$200)
- GPL/MPL copyleft license (different project posture)
- Apache 2.0 (equivalent permissive; MIT preferred for ecosystem compatibility)
- GitHub Pages / Cloudflare Pages (Vercel's per-branch previews + Vite zero-config beat the marginal cost difference)
- Render paid plan or Fly.io (free tier + keepalive sufficient through submission)
