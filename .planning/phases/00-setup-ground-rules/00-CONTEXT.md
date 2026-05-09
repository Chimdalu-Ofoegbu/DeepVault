# Phase 0: Setup & Ground Rules - Context

**Gathered:** 2026-05-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Lock the cross-cutting infrastructure and rituals that every later phase inherits: pinned toolchains (Sui CLI mainnet-v1.71.1, DeepBookV3 predict-testnet-4-16, pnpm, uv, Python 3.12), TypeScript+Python+Move monorepo scaffold, `shared/strategy.toml` codegen to all three runtimes, weekly Predict-diff script, GitHub Actions CI wired with Move/TS/Python tests + golden-vector parity gate, CONTRIBUTING.md documenting code-freeze + hedge-ratio policy.

In scope: monorepo scaffold, toolchain pins, codegen wiring (initially empty — gate exists, vectors come in Phase 1), CI scaffold, predict-diff script, CONTRIBUTING.md policy doc, deploy-target hosting accounts (Vercel + Render), wallet provisioning.

Out of scope: any actual Move/Python/TS feature code (those start in Phase 1+); SVI math (Phase 1); vault logic (Phase 2); strategy parameter tuning (Phase 3 backtest re-tunes within the locked policy).

</domain>

<decisions>
## Implementation Decisions

### Hedge-Ratio Policy (SETUP-06 fulfillment)

The policy below is committed in writing in `CONTRIBUTING.md` before backtest opens (Phase 3). Numbers are locked at deploy time, last tunable in Phase 3 backtest, then frozen permanently. This locks against hindsight tuning per PITFALLS Pitfall 2.

- **D-01: Allocation = 10% of each new vault deposit** routed into the hedge book. Standard DOV-class tail-hedge allocation; preserves most of PLP APY while giving meaningful crash protection.
- **D-02: Strike = -15% OTM** (binary put strike sits 15% below current BTC spot at hedge-mint time). Aligns with the "crash insurance" framing — pays only on -2σ to -3σ weekly moves.
- **D-03: Tenor = 14-day expiry; roll trigger = expiry < 2 days.** One roll per ~12-day cycle. Cleaner accounting and fewer transactions than 7-day rolling.
- **D-04: Sizing function is parameterized in `shared/strategy.toml`** under `[hedge_policy]` so a future v2 phase can swap in a dynamic sizing function without touching vault internals. v1 ships fixed.
- **D-05: Re-tuning permitted ONLY in Phase 3 backtest, on out-of-sample-aware walk-forward analysis.** Once Phase 3 closes, the policy is frozen — no re-tuning after testnet stress test or after seeing mainnet behavior.

### Wallet & Mainnet Funding

- **D-06: Two separate wallets** — testnet dev wallet (high churn, faucet-fed, exposed to scripts) and mainnet deploy wallet (locked down, only used for Phase 5 deploy + smoke test + demo recording).
- **D-07: Mainnet budget ~$80** — $50 USDsui smoke deposit (DEPLOY-04) + ~$15 SUI gas for `sui client publish` and shared-object creation + ~$15 buffer for demo PTBs and one redeploy retry. **Risk flag:** $30 buffer is tight; if Phase 5 hits a redeploy due to Predict mainnet contract churn or a config bug, top up to $150 before Day 36.
- **D-08: USDsui acquired via Cetus DEX swap from SUI.** Path: CEX → SUI → mainnet wallet → Cetus swap → USDsui. Document the playbook in `docs/MAINNET-FUNDING.md` during Phase 0 so Phase 5 execution is mechanical.
- **D-09: No third "fresh wallet" provisioned** — fresh-wallet PTB tests (PTB-06) use ephemeral generated keypairs in CI and a fresh manual keypair on demo day.

### Repository Visibility & Build-in-Public

- **D-10: GitHub repo public from day 1** under MIT license. Sui Overflow + Mysten can audit anytime; aligns with build-in-public credibility for an institutional-track submission.
- **D-11: License = MIT.** Permissive, hackathon norm, no friction for derivatives or post-submission community contributions.
- **D-12: Minimal build log in README.** Weekly bullet updates (one section, append-only). 1–2 X/Twitter posts pinned in repo for Community Award voting EV. No daily threading — solo-builder time-eating risk.

### Dashboard & Relay Hosting

- **D-13: Public dashboard on Vercel free tier**, default `*.vercel.app` subdomain. Linked from README. Judges can connect a wallet and try the vault on mainnet post-Phase 5.
- **D-14: Local Vite dev server is the recording target** for the demo video — controllable, no network surprises mid-take. Public deploy is the post-recording artifact judges interact with afterwards.
- **D-15: Event relay on Render free tier.** Auto-deploys from GitHub. Sleeps after 15min idle — add a keepalive ping (`/healthz` curl every 10min) from a GitHub Actions cron, OR a tiny external uptime ping. Configure in Phase 0 even though relay is built in Phase 4.
- **D-16: No custom domain.** Default Vercel subdomain is sufficient for hackathon polish; custom domain is post-submission concern.

### Implementation Defaults (Claude's Discretion)

The following are chosen by me as builder, no user decision needed — recorded for downstream agents:

- **Monorepo orchestration:** Plain pnpm workspaces + a top-level `Makefile` for cross-language tasks (`make build`, `make test`, `make codegen`, `make demo`). No Turborepo/Nx — adds setup time, marginal benefit for a 39-day solo build with two TS workspaces.
- **strategy.toml codegen:** Single Python script `scripts/codegen.py` reads `shared/strategy.toml` and emits `contracts/sources/strategy_constants.move`, `backtest/src/deepvault/strategy_constants.py`, `dashboard/src/lib/strategy_constants.ts`. Generated files have a "DO NOT EDIT — regenerate via `make codegen`" header. CI fails if generated files are out of sync.
- **Predict-diff script:** Bash `scripts/predict-diff.sh` does `git fetch` on a vendored DeepBookV3 fork checkout, then `git log --oneline LAST_SHA..HEAD -- packages/predict packages/predict_manager packages/oracle_svi`. Stores `LAST_SHA` in `.predict-diff-state`. Calendar reminder = a GitHub Issue auto-created Mondays via Actions cron (no external calendar dep).
- **Editor / formatter:** Move uses `sui move build` checks; TS uses `prettier` + `eslint` defaults; Python uses `ruff format` + `ruff check`. All wired into `make lint` + CI.
- **Branch strategy:** `main` branch only, push directly. No PR overhead. Solo build, no second reviewer. CI gates merges to main via required-status-check on the default branch.
- **Test framework:** Move stdlib `sui move test`; TS uses Vitest 4.x (per STACK.md); Python uses pytest 8.3.
- **CI runner:** GitHub Actions, Ubuntu latest. One workflow file `.github/workflows/ci.yml` with three parallel jobs (move, ts, python) + a fourth "parity" job that depends on all three and runs the golden-vector cross-runtime parity check.
- **Repository structure:**
  ```
  contracts/         # Sui Move package (deepvault::)
  indexer/           # Node.js event relay (Phase 4 placeholder in Phase 0)
  dashboard/         # React + Vite (Phase 4 placeholder in Phase 0)
  backtest/          # Python uv project (Phase 1+ math, Phase 3 harness)
  shared/            # strategy.toml + golden-vectors.json (Phase 1 fills)
  scripts/           # codegen.py, predict-diff.sh, mainnet-preflight.sh
  config/            # testnet.toml, mainnet.toml (addresses, RPC URLs)
  docs/              # CONTRIBUTING, MAINNET-FUNDING playbook, ARCHITECTURE diagram
  .github/workflows/ # ci.yml + monday-predict-check.yml
  ```

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents (researcher, planner, executor) MUST read these before planning or implementing.**

### Project context
- `.planning/PROJECT.md` — scope, core value, cut-lines, key decisions, constraints
- `.planning/REQUIREMENTS.md` §"Setup & Ground Rules" — SETUP-01 through SETUP-08 (the 8 items this phase delivers)
- `.planning/ROADMAP.md` §"Phase 0" — goal, success criteria, hard policy locks, cut-latest order
- `.planning/STATE.md` — current project position
- `deepvault-project.md` — original brief (handbook context, scoring rubric, risk hedges)

### Research outputs (read before planning)
- `.planning/research/SUMMARY.md` — synthesized findings, phase-ordering rationale, hard policy locks, gaps to address
- `.planning/research/STACK.md` — pinned versions, install commands, alternatives rejected, version-compatibility flags
- `.planning/research/ARCHITECTURE.md` — repo structure, build order, three-tier trust boundary, three-way parity discipline
- `.planning/research/PITFALLS.md` §"Pitfall 6: DeepBook Predict contract churn" — Monday sweep mitigation pattern
- `.planning/research/PITFALLS.md` §"Pitfall 2: Lookahead bias" — why hedge-ratio policy must be committed before backtest
- `.planning/research/PITFALLS.md` §"Pitfall 14: Mainnet redeploy disasters" — why config drift is preventable

### External docs (referenced inline by research)
- DeepBookV3 GitHub repo, `predict-testnet-4-16` branch — the contract source of truth (vendored as a git submodule or pinned checkout for the diff script)
- Sui CLI release notes for `mainnet-v1.71.1` (May 2026 protocol version 123) — pin via `suiup`
- @mysten/sui 2.16.0 + @mysten/dapp-kit 1.0.4 + @mysten/deepbook-v3 0.17.0 npm pages — exact versions in `package.json` `^` to be replaced with `=`

### To-be-created in Phase 0 (planner allocates)
- `CONTRIBUTING.md` — code freeze + no-refactor rule + hedge-ratio policy locked text
- `docs/MAINNET-FUNDING.md` — Cetus swap playbook for Phase 5 execution
- `docs/HEDGE-POLICY.md` — full hedge-ratio policy with rationale, locked numbers, re-tuning policy
- `shared/strategy.toml` — single source of truth, fields specified in `decisions/Implementation Defaults` above
- `.github/workflows/ci.yml` — Move + TS + Python + parity jobs
- `.github/workflows/monday-predict-check.yml` — cron creates an Issue on Monday with diff output

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

Greenfield project — no existing source code in this repo. Only `deepvault-project.md` (the brief) and `deepvault-overview.pdf` exist alongside `.planning/`.

### Established Patterns

None internal. External patterns to mirror:

- **TypeScript monorepo via pnpm workspaces** — standard for Sui dApps; @mysten/sui itself is structured this way.
- **`shared/strategy.toml` → multi-runtime codegen** — pattern adopted from quant trading systems (e.g., QuantConnect's parameter files). Single source of truth for cross-language constants.
- **Move package layout** — `contracts/Move.toml` + `sources/` modules. Standard Sui pkg structure.
- **Python uv project** — `pyproject.toml` + `uv.lock` for reproducibility. Modern (>2024) Python toolchain.

### Integration Points

This phase has no internal integration points (nothing exists yet). It establishes the integration *surface* that later phases plug into:

- `shared/strategy.toml` is read by Move (via codegen), Python (via codegen), TypeScript (via codegen) — Phase 1 onwards.
- `scripts/predict-diff.sh` is invoked weekly + its output used by all phases to gate refactors.
- `.github/workflows/ci.yml` is the gate for every commit from Phase 1 onwards.

</code_context>

<specifics>
## Specific Ideas

- **The hedge-ratio policy doc (`docs/HEDGE-POLICY.md`) is the single most consequential Phase 0 artifact** — it's what locks the strategy against hindsight tuning. Treat it like an ADR: rationale, alternatives considered, locked numbers, re-tuning policy, signed/dated by the builder.
- **The `make demo` reproducibility script** is a stretch deliverable in Phase 0 — even an empty placeholder that prints "TODO: Phase 6 fills this in" is useful. By Phase 6 it should reproduce the demo end-to-end from a fresh clone.
- **CI's parity job is the gate the whole project hangs on.** It starts empty in Phase 0 (no vectors yet), wires up in Phase 1 (Python emits, all three load and assert equality), and stays green forever after. If it ever goes red mid-build, halt feature work until green.
- **The build log in README is append-only** — never edit history, never delete entries. This is hackathon hygiene; judges will skim it.

</specifics>

<deferred>
## Deferred Ideas

- **Turborepo / Nx caching** — not needed at this scale; revisit only if `make build` exceeds 2 minutes.
- **Custom domain (deepvault.xyz, etc.)** — post-submission, only if the project continues.
- **Active social posting (X threads, GIFs of milestones)** — solo-builder time-eating risk; minimal build log is the discipline.
- **Three-wallet structure (dev / testnet / mainnet)** — overkill at this scale; ephemeral CI keypairs cover the fresh-wallet case.
- **Bridged USDC → USDsui** — only if mainnet budget grows beyond ~$200; for $80 budget, single Cetus swap is simpler.
- **GPL/MPL copyleft license** — MIT is hackathon-correct; copyleft is a different project posture.
- **Apache 2.0** — equivalent permissive choice; MIT preferred for ecosystem compatibility.
- **GitHub Pages / Cloudflare Pages instead of Vercel** — Vercel's auto-preview-per-branch and zero-config Vite support are worth more than the marginal cost difference.
- **Render paid plan or Fly.io** — free tier with keepalive ping is sufficient through submission; revisit if Render free tier hits limits.

</deferred>

---

*Phase: 0-Setup & Ground Rules*
*Context gathered: 2026-05-09*
