# Phase 4: PLP Risk Studio Dashboard + Relay - Context

**Gathered:** 2026-05-12
**Status:** Ready for planning

<domain>
## Phase Boundary

A live React + Vite single-page dashboard streaming SVI surface updates and vault state via WebSocket from a Node.js event relay (polling Sui RPC `queryEvents` at 2s cadence with persisted cursor). Plotly 3D for the live SVI surface; Recharts for vault/exposure/PnL panels; client-side what-if simulator using the existing Phase 1 TS SVI lib (`dashboard/src/lib/svi.ts`); dApp Kit for wallet connect + deposit/withdraw PTBs against the testnet vault deployed in Phase 2. **End-to-end against testnet** with auto-reconnect, staleness indicators, and replay-on-connect for newcomers.

In scope: Node.js event relay service (Sui RPC polling + cursor persistence + WebSocket server + replay-on-connect ring buffer + in-memory snapshot store), React + Vite SPA (sticky header with ConnectButton + global staleness pill, single scrolling page layout), live 3D SVI surface plot (Plotly type='surface'), arbitrage-free checker UI panel (green/red status + visible g(k) plot when red), VaultPanel (utilization + total assets + share price), BucketGauge (per-user RateLimiter token-bucket state), ExposurePanel (hedge book by oracle/strike/expiry), what-if simulator (θ_T parallel ±2σ + spot ±5σ, client-side TS), staleness indicator per panel (red at >30s), wallet flow (dApp Kit ConnectButton → PTB sign → tx confirmation), position viewer (connected wallet only, PnL attribution PLP yield/hedge cost/hedge payoff/net), WebSocket auto-reconnect tested by kill-mid-recording.

Out of scope: mainnet deploy (Phase 5), admin all-positions view (STRAT-V2; v1 ships connected-wallet-only per D-04 below), drag-rearrangeable cards (out of scope), tabbed routing (single scrolling page), live Greeks panels (STRAT-V2-02), Delphi/oracle picker UI (single BTC oracle in v1), multi-vault dashboard (single Vault<DUSDC> in v1), GraphQL migration (JSON-RPC sunsets 2026-07-31, post-submission), full-screen 3D surface mode (just inline), the keepalive ping itself (Phase 0 D-15 said configure in Phase 0 — already done via GitHub Actions cron).

</domain>

<decisions>
## Implementation Decisions

### Event Relay Service (DASH-01, DASH-02, DASH-03)

- **D-01: WebSocket replay window = last 100 events OR last 1 hour, whichever is smaller.** Ring buffer in memory; bounded to ~10 KB per oracle. Survives Render free-tier 15-min sleep restart by re-querying recent events on cold boot (one-time RPC backfill on relay startup, then live polling resumes). 100 events covers hours of testnet activity since `OracleSVIUpdated` isn't high-frequency; the dual cap (count + time) prevents pathologically long replay payloads if an oracle suddenly bursts.
- **D-02: Cursor persistence = JSON file on local disk** (`indexer/data/cursor.json`). On startup the relay reads the cursor, queries `queryEvents` from that point, replays into the ring buffer, then enters the live-polling loop. On Render's ephemeral filesystem, the file is wiped on restart — that's OK: the relay just does the cold-boot backfill (~last hour of events via cursor=null) before serving WebSocket clients.
- **D-03: WebSocket message protocol** — JSON, three message kinds:
  - `{ "type": "snapshot", "data": { ... } }` — full state on connect (last surface per oracle, current vault snapshot, replay-buffer contents)
  - `{ "type": "event", "name": "OracleSVIUpdated"|"Supplied"|..., "data": { ... } }` — single event push
  - `{ "type": "heartbeat", "ts_ms": "<u64-as-string>" }` — every 10s; client uses to compute staleness
  - All u64 fields serialize as strings per Phase 3 WAVE0-DECISION.md Q5
  - No auth (read-only public relay)
- **D-04: Relay polling cadence = 2s** per CLAUDE.md (deprecated `subscribeEvent` is NOT used; `queryEvents` polling is the supported path until GraphQL migration post-2026-07-31).

### Dashboard Layout (DASH-04..10, 12)

- **D-05: Single scrolling page with sticky header.** Sticky header carries: dApp Kit `<ConnectButton />` (Slush/Suiet/Backpack auto-supported) + global staleness pill (turns red at >30s since last WebSocket message) + relay-status pill (connected/reconnecting/down). Body in order:
  1. **Hero**: 3D SVI surface (full-width Plotly type='surface', X=log-strike k, Y=tenor T, Z=total-variance w(k,T))
  2. **Arb checker panel**: green/red status + visible g(k) plot when red (uses the `g_k_array` from `svi.ts` per Phase 1 D-04)
  3. **VaultPanel** (left) + **BucketGauge** (right) side-by-side
  4. **ExposurePanel**: hedge book breakdown by oracle/strike/expiry
  5. **What-if simulator**: θ_T and spot sliders
  6. **Deposit/Withdraw flow**: wallet-gated; shows expected shares + hedge mint + estimated gas pre-sign
  7. **PositionViewer**: connected wallet's positions + PnL attribution
  Mobile: cards collapse via CSS (no client-side breakpoint logic; just `@media (max-width: 768px) { .panel { width: 100% } }`).
- **D-06: No client-side routing.** Single-file SPA mounted at `/`. Vercel's auto-prefix preview URLs work without route config.

### What-If Simulator (DASH-09)

- **D-07: Vol-shock mechanism = parallel θ_T shift ±2σ.** Single per-tenor scalar; matches how the OracleSVI emits updates. Implementation:
  - σ_θ estimated from rolling 30-day stdev of θ_T snapshots stored in the relay's ring buffer
  - Bootstrap-safe: when the ring buffer has <7 days of θ_T history, fall back to 20% relative shock (σ_θ = 0.2 × current_θ_T)
  - Slider in UI shows ±2σ as percentage labels (e.g., "-2σ = 35.2%, current = 47.8%, +2σ = 64.4%")
- **D-08: Spot-shock mechanism = ±5σ on forward price.** σ_F estimated from rolling 30-day stdev of forward-price snapshots; same 20% bootstrap fallback. Joint slider — user moves spot and vol independently; PnL recomputed client-side using `dashboard/src/lib/svi.ts::binary_price(F_shocked, K, T, θ_shocked, ρ, η, γ)` for every open hedge in the connected wallet.
- **D-09: Sub-100ms slider update latency.** Pure TS computation on the client; no relay round-trip. `useMemo` cache on `(hedge_positions, σ_θ, σ_F)` so only the slider state triggers re-render.

### Position Viewer & dApp Kit Flow (DASH-11, DASH-12)

- **D-10: PositionViewer = connected wallet only in v1.** Reads `vault.request_slots[user]` + `vault.rate_limiters[user]` via Sui RPC `getObject` (filtering Table children by user-address key). PnL attribution computed from event history filtered by sender: `Supplied` events (deposit cost), `HedgeMinted` events (hedge cost), `RedeemFulfilled` events (proceeds). Admin all-positions view deferred to STRAT-V2 (AdminCap is non-transferable v1; deployer can use Sui Explorer for admin queries).
- **D-11: Deposit flow** = single button → PTB construction via `@mysten/sui` 2.16.0 `Transaction` class → call `vault::supply::supply<DUSDC>(vault, predict_manager, oracle, clock, deposit, ctx)` → `signAndExecuteTransaction({ transaction, signer: wallet })` → show tx digest + expected shares + estimated gas BEFORE signing. Modal pre-sign step: "You'll deposit X DUSDC, receive Y shares, gas ~0.01 SUI."
- **D-12: Withdraw flow** = `vault::redeem::redeem_request` button → 1-hour cooldown timer → `redeem_fulfill` button enabled after timer; OR `redeem_cancel` button (D-04 from Phase 2 — works anytime). PositionViewer surfaces the current RequestSlot state if one exists.

### Claude's Discretion

The following are chosen by me (builder) — recorded so downstream agents don't re-ask.

- **Workspace layout:** `dashboard/` (React + Vite SPA, existing scaffold) + `indexer/` (NEW — Node.js relay; Phase 0 placeholder dir already exists). New files:
  - `dashboard/src/App.tsx`, `dashboard/src/main.tsx` (entry)
  - `dashboard/src/components/Header.tsx`, `SurfacePanel.tsx`, `ArbCheckerPanel.tsx`, `VaultPanel.tsx`, `BucketGauge.tsx`, `ExposurePanel.tsx`, `WhatIfSimulator.tsx`, `DepositWithdrawPanel.tsx`, `PositionViewer.tsx`, `StalenessPill.tsx`
  - `dashboard/src/hooks/useWebSocket.ts`, `useSurfaceSnapshot.ts`, `useVaultState.ts`, `usePositions.ts`
  - `dashboard/src/lib/wsClient.ts` (WebSocket client + auto-reconnect + replay-on-connect handler)
  - `dashboard/index.html`, `dashboard/vite.config.ts`
  - `indexer/src/relay.ts` (main entry; Sui RPC polling loop + WebSocket server)
  - `indexer/src/cursor.ts` (cursor persistence)
  - `indexer/src/snapshot.ts` (in-memory snapshot store + ring buffer)
  - `indexer/src/wsServer.ts` (`ws` library — Node WebSocket server)
  - `indexer/package.json`, `indexer/tsconfig.json`
- **Relay deps:** Node.js >=22 LTS, `@mysten/sui` 2.16.0 (`client.queryEvents`), `ws` ^8.x (WebSocket server), `pino` ^9.x (structured logging — Phase 0 D-15 keepalive diagnostic), `dotenv` ^17.x (.env for PREDICT_PACKAGE + VAULT_ID — will change weekly per Pitfall 6).
- **Dashboard deps to add on top of existing scaffold:** `@mysten/sui` 2.16.0, `@mysten/dapp-kit` 1.0.4, `@tanstack/react-query` ^5.x (dapp-kit peer dep — reuse for our own RPC polling cache), `plotly.js` 3.5.1, `react-plotly.js` 2.6.0 (memoize `data` prop + use `revision` for redraw per CLAUDE.md anti-pattern guard), `recharts` ^2.15.x, `@testing-library/react` ^16.x.
- **Auto-reconnect strategy:** exponential backoff (1s → 2s → 4s → 8s → 16s, cap at 30s). On reconnect, replay buffer fires before live events resume. Client tags every state field with `last_updated_ms`; staleness pill turns red when any field's `now - last_updated_ms > 30_000`.
- **dApp Kit `WalletProvider` + `SuiClientProvider`** wrapping `<App />` in `main.tsx`. Network = testnet (CLAUDE.md). Auto-detect via Wallet Standard. No custom wallet modal — `<ConnectButton />` is the one entry point.
- **Plotly memoization:** every `<Plot>` data + layout props go through `useMemo` keyed on `(snapshot_hash, what_if_params)` to avoid re-renders on every parent state change (CLAUDE.md anti-pattern guard).
- **Event filter for `queryEvents`:** subscribe by `MoveEventType` per event name. Two queries per poll: `OracleSVIUpdated` (high-frequency) and the 11 vault events (low-frequency, OR'd into a single query via package filter). Cursor persisted per query.
- **TESTNET-DEPLOY.json consumption:** relay reads `package_id` + `vault_id` + `predict_manager_id` + `oracle_id` from `.planning/phases/02-vault-move-package-testnet-deploy/TESTNET-DEPLOY.json`. If status="pending_first_deploy", relay logs warning + serves snapshot-only (no live events). This dovetails with Phase 3's deferred D-PUB-01 blocker.
- **CI:** existing `ts` job in `.github/workflows/ci.yml` covers `dashboard/` typecheck + vitest. Phase 4 adds:
  - `dashboard` build step: `cd dashboard && pnpm build` produces a static bundle (verified by Vercel on every push)
  - `indexer` typecheck + vitest steps: same pattern as dashboard, no new top-level CI job
  - 6-job matrix names PRESERVED (move, ts, python, codegen-drift, parity, e2e-vault)
- **Vercel deployment:** `vercel.json` in `dashboard/` sets build command = `pnpm build` + outputDirectory = `dist`. Preview deploys auto-created per PR. Production = default branch (master) only. Custom domain deferred to post-submission backlog.
- **Render relay deployment:** `indexer/render.yaml` with build/start commands + the existing keepalive ping (Phase 0 D-15) targeting `/healthz`. Env vars set in Render dashboard, not committed.
- **WebSocket port:** default 8080 internal, exposed by Render via their automatic reverse proxy on `wss://<service>.onrender.com`. Dashboard reads relay URL from `import.meta.env.VITE_RELAY_WS_URL` with fallback to `ws://localhost:8080` for local dev.
- **Healthcheck endpoint:** `GET /healthz` returns `{"status":"ok","cursor":"<latest>","clients":<count>,"uptime_ms":<num>}` — both Render uses and the keepalive cron consumes.
- **vitest coverage gate:** ≥85% on `indexer/src/relay.ts` + `wsClient.ts` (the load-bearing reconnect logic). Per-push CI; same `--cov-fail-under=85` pattern Phase 3 used for Python.
- **No SSR**: pure SPA. Vercel serves static `dist/` from CDN; no edge functions needed.
- **What-if simulator uses `useMemo`** keyed on `(hedge_positions_hash, theta_shock_bps, spot_shock_bps)` so sliders feel instant. PnL recompute is O(n_hedges × eval_cost) with n_hedges typically ≤10 in v1 — well under 100ms budget.
- **Test fixtures:** captured 5–10 real testnet event payloads as JSON fixtures in `indexer/tests/fixtures/` so the relay tests work without network (mirror of Phase 3 `cycle-full.json` approach).
- **Phase 5 mainnet swap-readiness:** all addresses, RPC URLs, and predict-server URLs come from env vars (no hardcoded constants in source — CLAUDE.md Stack Patterns "No hardcoded Predict package IDs in source").

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents (researcher, planner, executor) MUST read these before planning or implementing.**

### Project context
- `.planning/PROJECT.md` — core value statement: "PLP+Hedge vault on DeepBook Predict with a credible, auditable risk dashboard"
- `.planning/REQUIREMENTS.md` §"PLP Risk Studio Dashboard" — DASH-01..13
- `.planning/ROADMAP.md` §"Phase 4" — goal + 5 success criteria
- `.planning/STATE.md`
- `.planning/phases/00-setup-ground-rules/00-CONTEXT.md` — D-13 Vercel free tier for dashboard, D-15 Render free tier for relay + keepalive cron
- `.planning/phases/01-math-foundation-svi-parity-gate/01-CONTEXT.md` — TS evaluator interface (`dashboard/src/lib/svi.ts`); D-04 arb-checker returns `g_k_array` for plotting; D-03 surface reads `total_variance`
- `.planning/phases/02-vault-move-package-testnet-deploy/02-CONTEXT.md` — event surface (11 vault events + OracleSVIUpdated); D-09 NAV uses Phase 1 SVI binary_price; D-15 u64 NAV at 10⁹ fixed-point
- `.planning/phases/03-backtest-harness-two-protocol-ptb/03-CONTEXT.md` — D-15 JSON convention u64-as-string; D-09 6-column PnL attribution
- `.planning/phases/03-backtest-harness-two-protocol-ptb/WAVE0-DECISION.md` — Q2 @mysten/deepbook-v3 1.3.6 pin; testnet contract addresses; PTB shape

### Research outputs
- `.planning/research/ARCHITECTURE.md` §"OFF-CHAIN — DASHBOARD TIER" (Plotly 3D + Recharts 2D + dApp Kit + WebSocket push from relay); §"Trust boundary" — dashboard trusts relay for liveness only, all canonical state re-derivable from chain
- `.planning/research/PITFALLS.md` §"Pitfall 6: DeepBook Predict contract churn" — relay reads addresses from env, never hardcoded
- `.planning/research/STACK.md` — @mysten/sui 2.16.0, @mysten/dapp-kit 1.0.4, plotly.js 3.5.1, react-plotly.js 2.6.0, recharts ^2.15.x, vitest 4.1
- `.planning/research/FEATURES.md`

### Repository artifacts
- `dashboard/src/lib/svi.ts` + `arb_checker.ts` + `phi.ts` + `isqrt.ts` + `ln.ts` + `math.ts` + `phi_coefficients.ts` + `strategy_constants.ts` + `parity_runner.ts` — Phase 1 + 2 outputs the dashboard imports
- `dashboard/package.json` — existing scaffold; Phase 4 adds deps listed in Claude's Discretion
- `dashboard/vitest.config.ts` — existing test config
- `contracts/sources/vault.move` + `supply.move` + `redeem.move` + `rebalance.move` + `ltv.move` — Phase 2 outputs the dApp Kit PTBs call
- `scripts/deepbookv3/packages/predict/sources/oracle_svi.move` — `OracleSVIUpdated` event struct; field names the relay's BCS decoder consumes
- `.github/workflows/ci.yml` — existing 6-job matrix; Phase 4 extends `ts` job in-place
- `scripts/two-protocol-ptb-demo.ts` — Phase 3 Plan 03-05 PTB construction analog; copy idioms for `DepositWithdrawPanel.tsx`'s PTB builder
- `.planning/phases/02-vault-move-package-testnet-deploy/TESTNET-DEPLOY.json` — relay reads `package_id` + `vault_id` + `predict_manager_id` + `oracle_id`
- `shared/strategy.toml` + `dashboard/src/lib/strategy_constants.ts` — codegen'd constants the simulator + panels consume

### External docs
- [Plotly 3D surface plots](https://plotly.com/javascript/3d-surface-plots/)
- [Sui dApp Kit](https://sdk.mystenlabs.com/dapp-kit) — WalletProvider + ConnectButton
- [@mysten/sui 2.16.0 Transaction class](https://sdk.mystenlabs.com/typescript) — PTB construction
- [react-plotly.js](https://www.npmjs.com/package/react-plotly.js) — wrapper pattern + revision prop
- [Recharts](https://recharts.org/) — 2D panel library
- [ws Node WebSocket server](https://github.com/websockets/ws) — server-side WS impl

</canonical_refs>

<specifics>
## Specific Ideas

- **3D SVI surface** rendered with Plotly `type: 'surface'`, X=log-strike k, Y=tenor T, Z=total-variance w(k,T). 50×50 grid; WebGL renderer holds 60 fps. `revision` prop pattern for redraw on snapshot update.
- **Visible g(k) plot** when arb-checker fires red — shows the actual `g_k_array` from `dashboard/src/lib/svi.ts` per Phase 1 D-04 ("most teams ship a boolean; we ship the array").
- **Joint what-if slider** — single `<WhatIfSimulator />` component with two sliders (spot ±5σ, vol ±2σ) + a PnL output panel. Sub-100ms updates via `useMemo` on `(hedge_positions, σ_θ, σ_F, shock_params)`.
- **Auto-reconnect with exponential backoff** capped at 30s. Replay-on-connect fires before live events resume; client merges replay payload into snapshot store atomically.
- **Staleness indicator on every panel** — `last_updated_ms` tracked per state field. Pill turns red at >30s since last WebSocket message. Sticky-header global staleness shows the worst-case across all panels.
- **dApp Kit single ConnectButton** in sticky header. Slush, Suiet, Backpack auto-detected via Wallet Standard. No custom wallet modal.
- **Pre-sign expected outputs**: deposit flow shows "You'll deposit X DUSDC, receive Y shares, gas ~0.01 SUI" before the user signs. Same pattern for redeem_request.
- **Position viewer** scoped to connected wallet only. PnL attribution = sum of `Supplied` deposits − `HedgeMinted` costs + `HedgeRolled` deltas − `RedeemFulfilled` proceeds, filtered by sender.
- **Cold-boot backfill**: relay re-queries `queryEvents` with `cursor=null` on Render restart to repopulate the ring buffer. WebSocket clients connecting during backfill receive snapshot once it's ready.
- **u64-as-string JSON convention** propagated from Phase 3 WAVE0-DECISION.md Q5 into every WebSocket message.

</specifics>

<deferred>
## Deferred Ideas

- **Admin all-positions view** — STRAT-V2 nice-to-have; AdminCap is non-transferable v1 so only the deployer sees admin view; Sui Explorer already provides this.
- **Live Greeks panels (delta / gamma / vega)** — STRAT-V2-02; Phase 4 emits hedge-position events but doesn't compute Greeks.
- **Multi-oracle picker** — single BTC oracle in v1; multi-asset is STRAT-V2-03.
- **Multi-vault dashboard** — single `Vault<DUSDC>` in v1.
- **GraphQL migration for events** — JSON-RPC sunsets 2026-07-31, post-submission. `queryEvents` polling works for the 39-day window. Migration to GraphQL `events` query is a post-submission backlog item.
- **Tabbed routing / full-screen 3D mode** — out of scope; single scrolling page is the v1 layout.
- **Drag-rearrangeable cards** — out of scope; react-grid-layout + persistence is a polish trap.
- **Dashboard auth / private views** — public read-only dashboard; no login. Deferred to post-submission.
- **PDF export of dashboard snapshot** — Phase 3 HTML report is the institutional artifact; dashboard is the live demo. PDF deferred to backlog.
- **Wallet UX A/B testing** — single ConnectButton path in v1.
- **Slider for hedge ratio sensitivity (re-do Phase 3 sensitivity table live)** — STRAT-V2; v1 sensitivity table lives in the Phase 3 backtest HTML report.
- **Backtest viewer in dashboard** — Phase 3 HTML report is standalone; dashboard is live state. Linking from dashboard to the latest nightly backtest report URL is optional polish.

</deferred>

---

*Phase: 04-plp-risk-studio-dashboard-relay*
*Context gathered: 2026-05-12 via /gsd-discuss-phase*
