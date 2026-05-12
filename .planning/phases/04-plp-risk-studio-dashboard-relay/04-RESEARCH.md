# Phase 4: PLP Risk Studio Dashboard + Relay - Research

**Researched:** 2026-05-12
**Domain:** Event-relay + React real-time dashboard for a Sui DeepBook Predict structured-product vault, with shared TS SVI library, dApp Kit wallet flows, and Plotly 3D / Recharts panels.
**Confidence:** HIGH on stack pins (verified via npm view today + CLAUDE.md), HIGH on event surface (Phase 1/2 artifacts already exist in repo), MEDIUM on Plotly + react-plotly.js 3.x runtime compat (wrapper is 2022-vintage; needs a smoke test), MEDIUM on Predict mainnet timing (irrelevant to Phase 4 testnet scope, but Phase 5 risk surface), HIGH on staleness/reconnect UX (Pitfall 9 fully specified upstream).

## Summary

Phase 4 is the largest greenfield work surface in the project: net-new Node.js relay + net-new React SPA mounted on top of an existing scaffold whose only current contents are the Phase 1 TS SVI evaluator (`dashboard/src/lib/svi.ts`, `arb_checker.ts`, `phi.ts`, `isqrt.ts`, `ln.ts`, `math.ts`, `phi_coefficients.ts`, `strategy_constants.ts`, `parity_runner.ts`). Both `dashboard/` and `indexer/` are placeholder workspaces today (only Vitest is wired in `dashboard/package.json`, indexer is empty stub). Every framework dep — React, Vite, dApp Kit, Plotly, Recharts, ws — must be installed in this phase. The good news: nearly every load-bearing decision is already in CONTEXT.md D-01..D-12 and 04-UI-SPEC.md (component inventory, file layout, design system locked). Research's job is to make those decisions **executable** — exact PTB builder shape, `queryEvents` polling loop with persisted cursor, replay-on-connect ring buffer, WebSocket auto-reconnect, react-plotly.js memoization, dApp Kit provider scaffolding, and the runtime-state inventory for the existing dashboard scaffold.

The critical-path Phase-4 surfaces that need careful research (and have not been settled by upstream docs):

1. **`queryEvents` polling shape** — exact filter syntax for `MoveEventType` per `OracleSVIUpdated` + a package-filter for the 11 vault events; cursor structure (`{txDigest, eventSeq}`); per-query cursor persistence semantics (one file per stream, not one global cursor).
2. **WebSocket reconnect protocol on the client** — exponential backoff with jitter; idempotent replay-on-connect handling; the wire format (`snapshot` / `event` / `heartbeat`) per CONTEXT.md D-03.
3. **react-plotly.js `revision` prop pattern** — the canonical "don't re-mount the WebGL canvas on every SVI update" recipe; `useMemo` keying on a `snapshot_hash` not on raw `data` reference identity.
4. **dApp Kit PTB construction** — `Transaction` class call shape against `vault::supply::supply<DUSDC>` + `vault::redeem::request` + `vault::redeem::fulfill` + `vault::redeem::cancel`. Reference: existing `scripts/two-protocol-ptb-demo.ts` from Phase 3 is the closest analog.
5. **Shared TS SVI lib reuse** — already exists, in dashboard, with `binary_price` exported per Phase 1 D-01..D-04. What-if simulator imports it directly; no need for a separate workspace package.

**Primary recommendation:** Stand the indexer + dashboard up against the existing TESTNET-DEPLOY.json `pending_first_deploy` placeholder (snapshot-only mode), wire all 11 vault events + OracleSVIUpdated through the relay's polling loop with per-stream cursor persistence, ship the Plotly surface with `revision`-prop pattern and the shadcn UI already specified in 04-UI-SPEC, and treat the WebSocket reconnect test (DASH-13) as a per-push Vitest fake-server test rather than waiting for live testnet noise. Plan to add a Phase 2 deploy stub or wait for the actual deployment to flip the relay into live-event mode.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Event polling + cursor persistence | Indexer (Node.js relay) | — | Sui RPC `queryEvents` is the only path (subscribeEvent deprecated per CLAUDE.md What-NOT-to-Use). Cursor durability must survive Render free-tier 15-min sleeps. |
| Event decoding (BCS / event-type tag → JSON) | Indexer (Node.js relay) | — | `@mysten/sui` parses Move event payloads server-side; clients receive already-decoded JSON with u64-as-string per Phase 3 WAVE0-DECISION.md Q5. |
| Snapshot store (last surface per oracle, vault state) | Indexer (Node.js relay) | — | In-memory `Map<oracleId, SVISurfaceSnapshot>` + ring buffer per CONTEXT.md D-01; survives reconnect-storms without DB. |
| WebSocket fan-out + replay-on-connect | Indexer (Node.js relay) | — | `ws` library; on each new connection: emit `snapshot` (full state) → start streaming `event` deltas. CONTEXT.md D-03. |
| 3D SVI surface render | Browser (client) | — | Plotly `type: 'surface'` runs WebGL; relay only ships params. Client computes total-variance grid via the existing TS SVI lib (Phase 1 outputs). |
| Arbitrage-free checker UI | Browser (client) | Phase 1 TS lib (math) | `arb_checker.ts` already produces the g(k) array per Phase 1 D-04. Dashboard imports it directly; no relay round-trip. |
| What-if simulator (PnL under joint shocks) | Browser (client) | Phase 1 TS lib (math) | CONTEXT.md D-07/D-08/D-09 lock: client-side TS, sub-100ms via `useMemo`. Per Phase 1 D-01 `binary_price(F, K, T, theta, rho, eta, gamma)` is bigint-exact. |
| Wallet connect + PTB sign | Browser (client) | `@mysten/dapp-kit` | `WalletProvider` + `ConnectButton`. Wallet Standard auto-detects Slush / Suiet / Backpack. No custom modal. |
| PTB construction for supply/redeem | Browser (client) | `@mysten/sui` `Transaction` | Mirrors `scripts/two-protocol-ptb-demo.ts` idioms (Phase 3 outputs). Pre-sign panel computes expected shares client-side. |
| Vault state polling (NAV, total shares, bucket) | Browser (client) | `@tanstack/react-query` | Sui RPC `getObject` cached for 2s. Predict server REST endpoint is a fallback for utilization / per-oracle exposure data (CLAUDE.md notes the server "saves us indexing those state shards"). |
| Position viewer + PnL attribution | Browser (client) | Event log via relay | Connected-wallet-only filter on `Supplied`/`HedgeMinted`/`HedgeRolled`/`RedeemFulfilled` events. CONTEXT.md D-10. |
| Staleness indicator state | Browser (client) | — | `last_updated_ms` per state field; `useStaleness.ts` hook computes pill state from now-last_updated_ms; SSR not needed. |
| Auto-reconnect backoff | Browser (client) | — | Exponential 1s→30s cap with jitter; `useWebSocket.ts` hook. CONTEXT.md `Auto-reconnect strategy` line. |

## Standard Stack

### Core (project-wide, must align with CLAUDE.md)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@mysten/sui` | `2.16.0` `[VERIFIED: npm view 2026-05-12 → 2.16.2 current]` | Sui RPC client + Transaction (PTB) builder + BCS decode | Already pinned at root (`/package.json`) as 2.16.0; CLAUDE.md guard. Patch 2.16.2 exists but stay on 2.16.0 to keep lockfile stable and Phase 3 `scripts/two-protocol-ptb-demo.ts` unchanged. |
| `@mysten/dapp-kit` | `1.0.4` `[VERIFIED: npm view 2026-05-12 → 1.0.6 current]` | React hooks for wallet + queries (`WalletProvider`, `ConnectButton`, `useSignAndExecuteTransaction`) | CLAUDE.md pinned. 1.0.6 is current minor; safe to upgrade (peer dep `@mysten/sui ^2.x` unchanged). Recommend stay at 1.0.4 unless we hit a known wallet detection bug. |
| `@mysten/deepbook-v3` | `0.17.0` (CLAUDE.md) / `1.3.6` (Phase 3 STATE.md actual pin) | DeepBook Margin SDK | NOT needed for Phase 4 — dashboard doesn't construct Margin PTBs, only vault PTBs. Defer to Phase 5/6 if needed; flag this divergence to the planner. |
| `@tanstack/react-query` | `^5.x` `[VERIFIED: 5.100.10 current]` | RPC read cache | Peer dep of dapp-kit. Reuse for our own polling (Predict server REST, `getObject`). |
| `plotly.js` | `3.5.1` `[VERIFIED: npm view 2026-05-12 → 3.5.1]` | 3D SVI surface WebGL renderer | CLAUDE.md pinned; latest. `type:'surface'` is the only feature we need. |
| `react-plotly.js` | `2.6.0` `[VERIFIED: npm view 2026-05-12 → 2.6.0]` | React wrapper for plotly.js | CLAUDE.md pinned; latest. Wrapper unmaintained-feeling (2022) but thin; engine is active. **Fallback per CLAUDE.md:** if wrapper breaks, swap to 30-line `Plotly.newPlot()` hook. CI smoke-test the surface render. |
| `recharts` | `^2.15.x` (CLAUDE.md) `[VERIFIED: npm view 2026-05-12 → 3.8.1 current]` | 2D panel charts | **Divergence:** Recharts 3.x is current; CLAUDE.md pinned ^2.15.x. Recharts 3.x has API-incompatible changes (some component prop renames). **Recommend stay on ^2.15.x** to honor CLAUDE.md guard and 04-UI-SPEC Recharts contract (`ResponsiveContainer`, `LineChart`, `BarChart`, `RadialBarChart` API match 2.x). Upgrade to 3.x is post-submission backlog. |
| `vite` | `^7.x` (CLAUDE.md) `[VERIFIED: 8.0.12 current]` | Frontend bundler | Stay on ^7.x per CLAUDE.md. Vite 8 is current but the project's existing dashboard scaffold predates this phase; Phase 4 Wave 0 should `npm create vite@latest` with `--template react-ts` and pin to ^7.x. |
| `react` + `react-dom` | `18.3.x` (CLAUDE.md) `[VERIFIED: 19.2.6 current]` | UI | CLAUDE.md says "18.3.x or 19 if dapp-kit allows". dapp-kit 1.0.4 advertises React 18; **recommend 18.3.x** for v1 (React 19 smoke-test against `WalletProvider` is a risk we don't need to take). |
| `typescript` | `^5.6+` `[VERIFIED: 5.6.3 in root devDeps]` | Types | Already pinned in `/package.json`. |
| `vitest` | `^4.1.x` `[VERIFIED: 4.1.6 current; 4.1.5 already in dashboard/package.json]` | Unit tests | Already wired in `dashboard/vitest.config.ts`. Stay on ^4.1.x. |
| `@testing-library/react` | `^16.x` (CLAUDE.md) | Component tests | Standard. |

### Indexer Stack

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js | `>= 22 LTS` | Runtime | Per CLAUDE.md + root `engines.node`. |
| `@mysten/sui` | `2.16.0` | `client.queryEvents()` + `client.getObject()` | Shares root dep with dashboard. |
| `ws` | `^8.x` `[VERIFIED: 8.20.1 current]` | WebSocket server | CLAUDE.md pinned ^8.x. 8.20.1 is current; install latest 8.x. |
| `pino` | `^9.x` (CLAUDE.md) `[VERIFIED: 10.3.1 current]` | Structured JSON logging | **Divergence:** pino 10 is current; CLAUDE.md pinned ^9.x. pino 10 has minor breaking changes (worker thread default). **Recommend ^9.x** to honor CLAUDE.md; both work, but consistency over recency. |
| `dotenv` | `^17.x` `[VERIFIED: 17.4.2 current]` | `.env` loader | CLAUDE.md pinned ^17.x. Current. |
| `@mysten/bcs` | matches `@mysten/sui` peer | Event payload BCS decode | Already bundled inside `@mysten/sui`'s `client.queryEvents` response which returns `parsedJson` field; BCS decode for `i64::I64` fields (`rho`, `m` on OracleSVIUpdated) needs explicit handling. |
| `date-fns` | `^4.x` `[VERIFIED: 4.1.0 current]` (04-UI-SPEC required) | Relative-time formatter | Per UI-SPEC `formatDistanceToNow` + `<Tooltip>` UTC absolute. |

### shadcn UI Layer (already chosen in 04-UI-SPEC)

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| shadcn-ui (CLI) | latest | Component scaffold generator | Per 04-UI-SPEC: `new-york` style + `slate` base + CSS variables. Initialized in Phase 4 Wave 0. |
| Radix Primitives | via shadcn pinned versions | Accessible primitives under each shadcn component | Tree-shaken via shadcn's per-component install. |
| `lucide-react` | latest | Icon library | shadcn default; consistent with new-york preset. |
| `tailwindcss` | per shadcn CLI default | Utility-class styling | shadcn requires Tailwind. |
| `@fontsource-variable/inter` | latest | UI body font | Self-hosted (no Google Fonts CDN — avoids privacy banner blockers). |
| `@fontsource/jetbrains-mono` | latest | Numeric/digest monospace | Self-hosted. |
| `sonner` | via shadcn | Toast notifications | shadcn-blessed default. |
| `next-themes` | per shadcn template | Theme provider (dark default) | shadcn-blessed default. |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `tsx` | `^4.21.0` (already in dashboard devDeps) | TS execution for one-off scripts | Already installed. |
| `clsx` + `tailwind-merge` | per shadcn defaults | Conditional class composition | shadcn `cn()` utility. |
| `class-variance-authority` | per shadcn defaults | Variant prop typing on shadcn components | shadcn default. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Plotly `type:'surface'` | Three.js + `@react-three/fiber` | Three.js requires 2-3 weeks of WebGL bring-up for one chart; Plotly's `type:'surface'` is the exact shape we need. CLAUDE.md What-NOT guard explicit. **Stay on Plotly.** |
| `react-plotly.js` wrapper | Direct `Plotly.newPlot()` in `useEffect` | 30-line custom hook removes wrapper risk but loses React-component ergonomics. **Use wrapper; CI smoke-test the surface render; keep the custom-hook fallback documented in 04-UI-SPEC.** |
| `ws` (Node) | Cloudflare Durable Objects WebSocket | Edge platform locks us into vendor; Render free-tier with `ws` is simpler. Brief is 39-day solo; **stay on ws + Render.** |
| Custom WebSocket protocol | Socket.IO | Socket.IO adds Engine.IO transport upgrade dance + auto-reconnect (which we'd have to override). **Stay on plain ws with JSON-line messages.** |
| `@tanstack/react-query` for staleness | RxJS Observables | dapp-kit already peer-deps react-query; one fewer dep. **Stay on react-query.** |
| Recharts 3.x | Recharts ^2.15.x | 3.x has API breaks (`<ResponsiveContainer>` minor changes). CLAUDE.md guard says ^2.15. **Stay on ^2.15.x.** |
| pino 10.x | pino ^9.x | pino 10 has worker-thread default change. CLAUDE.md guard says ^9.x. **Stay on ^9.x.** |
| Subscribe via `subscribeEvent` (WS JSON-RPC) | `queryEvents` polling | CLAUDE.md What-NOT-to-Use guard: `subscribeEvent` returns 405 on public RPC; JSON-RPC sunsets 2026-07-31. **Stay on polling.** |
| GraphQL events | `queryEvents` polling | JSON-RPC sunsets 2026-07-31 (post-submission 2026-06-16). GraphQL `events` lacks real-time subscription op. **Stay on polling.** |
| Storybook | Vitest + Testing Library | 04-UI-SPEC explicitly defers Storybook. |

**Installation (Phase 4 Wave 0):**

```bash
# Indexer
cd indexer
pnpm add @mysten/sui@2.16.0 ws@^8 pino@^9 dotenv@^17 date-fns@^4
pnpm add -D @types/ws@^8 @types/node@^22 typescript@~5.6 tsx@^4 vitest@^4.1

# Dashboard
cd dashboard
pnpm add @mysten/sui@2.16.0 @mysten/dapp-kit@1.0.4 @tanstack/react-query@^5 \
         plotly.js@3.5.1 react-plotly.js@2.6.0 recharts@^2.15 \
         react@^18.3 react-dom@^18.3 date-fns@^4
pnpm add -D @types/react@^18.3 @types/react-dom@^18.3 \
            @types/react-plotly.js \
            @testing-library/react@^16 @testing-library/jest-dom@^6 \
            jsdom@^25 vite@^7 @vitejs/plugin-react@^4

# shadcn init (CLAUDE.md is silent on UI; 04-UI-SPEC chooses shadcn new-york / slate)
cd dashboard && npx shadcn@latest init  # style: new-york / base: slate / CSS vars: yes
npx shadcn@latest add card button badge tabs tooltip dialog slider input \
                       skeleton sheet sonner separator progress table collapsible
```

**Version verification log (npm view, 2026-05-12):**

| Package | CLAUDE.md pin | Current | Decision |
|---------|---------------|---------|----------|
| `@mysten/sui` | 2.16.0 | 2.16.2 | Stay on 2.16.0 (root pin) |
| `@mysten/dapp-kit` | 1.0.4 | 1.0.6 | Stay on 1.0.4 (CLAUDE.md guard) |
| `react-plotly.js` | 2.6.0 | 2.6.0 | Match exactly |
| `plotly.js` | 3.5.1 | 3.5.1 | Match exactly |
| `recharts` | ^2.15.x | 3.8.1 | Stay on ^2.15.x (API stability) |
| `vite` | ^7.x | 8.0.12 | Stay on ^7.x (CLAUDE.md guard) |
| `react` | ^18.3.x (or 19) | 19.2.6 | Stay on 18.3.x for v1 (dapp-kit risk) |
| `vitest` | ^4.1.x | 4.1.6 | ^4.1.x (current scaffold has 4.1.5) |
| `ws` | ^8.x | 8.20.1 | ^8.x |
| `pino` | ^9.x | 10.3.1 | Stay on ^9.x (CLAUDE.md guard) |
| `dotenv` | ^17.x | 17.4.2 | ^17.x |
| `@tanstack/react-query` | ^5.x | 5.100.10 | ^5.x |
| `date-fns` | UI-SPEC needs | 4.1.0 | ^4.x |

## Architecture Patterns

### System Architecture Diagram

```
                ┌────────────────────────────────────────────────────────────┐
                │  BROWSER — React + Vite SPA                                │
                │                                                            │
                │  ┌─────────────────────────────────────────────────────┐  │
                │  │  main.tsx                                            │  │
                │  │  <QueryClientProvider>                               │  │
                │  │    <SuiClientProvider network="testnet">             │  │
                │  │      <WalletProvider autoConnect>                    │  │
                │  │        <ThemeProvider defaultTheme="dark">           │  │
                │  │          <App />                                     │  │
                │  └─────────────────────────────────────────────────────┘  │
                │                                                            │
                │  ┌────────────┐  ┌────────────────────────────────────┐   │
                │  │ <Header>   │  │ <Main> (12-col grid)              │   │
                │  │ - product  │  │ ┌──────────────────────────────┐ │   │
                │  │ - Connect  │  │ │ SurfacePanel (Plotly 3D)     │ │   │
                │  │ - Staleness│  │ │ — useMemo(data, revision++)  │ │   │
                │  │ - Relay pill │ ├──────────────────────────────┤ │   │
                │  └────────────┘  │ │ ArbCheckerPanel              │ │   │
                │        │         │ │ — imports arb_checker.ts     │ │   │
                │        │         │ │   (Phase 1 g(k) curve)       │ │   │
                │        │         │ ├──────────────────────────────┤ │   │
                │        ▼         │ │ VaultPanel + BucketGauge     │ │   │
                │  ┌────────────┐  │ ├──────────────────────────────┤ │   │
                │  │ wsClient.ts│  │ │ ExposurePanel                │ │   │
                │  │ + useWebSocket │ ├──────────────────────────────┤ │   │
                │  │ — exp backoff  │ │ WhatIfSimulator              │ │   │
                │  │ — replay merge │ │ — useMemo(positions, shocks) │ │   │
                │  │ — staleness ts │ │ — imports svi.ts::binary_price│   │
                │  └────────────┘  │ ├──────────────────────────────┤ │   │
                │        │         │ │ DepositWithdrawPanel         │ │   │
                │        │         │ │ — ptbBuilders.ts             │ │   │
                │        │         │ │ — useSignAndExecuteTransaction│  │
                │        │         │ ├──────────────────────────────┤ │   │
                │        │         │ │ PositionViewer (per-wallet)  │ │   │
                │        │         │ └──────────────────────────────┘ │   │
                │        │         └────────────────────────────────────┘   │
                │        │                                                  │
                └────────┼──────────────────────────────────────────────────┘
                         │
                         │ wss://<service>.onrender.com (JSON frames)
                         │ - {type:"snapshot", data:{...}} on connect
                         │ - {type:"event", name:"OracleSVIUpdated", data}
                         │ - {type:"heartbeat", ts_ms:"<u64>"} every 10s
                         ▼
        ┌─────────────────────────────────────────────────────────┐
        │  INDEXER — Node.js relay (Render free tier)             │
        │                                                          │
        │  ┌─────────────────────────────────────────────────┐    │
        │  │  relay.ts                                        │    │
        │  │  - parses TESTNET-DEPLOY.json on boot            │    │
        │  │  - if status=pending: snapshot-only mode         │    │
        │  │  - else: starts two polling loops below          │    │
        │  └─────────────────────────────────────────────────┘    │
        │                                                          │
        │  ┌─────────────────┐    ┌──────────────────────────┐    │
        │  │ pollOracleSVI() │    │ pollVaultEvents()         │    │
        │  │  every 2s        │    │  every 2s                 │    │
        │  │  filter:         │    │  filter:                  │    │
        │  │    MoveEventType │    │    Package: VAULT_PKG     │    │
        │  │    = "...::oracle│    │  parses 11 vault events   │    │
        │  │      ::OracleSVI │    │  → snapshot.applyEvent()  │    │
        │  │      Updated"    │    └──────────────────────────┘    │
        │  └─────────────────┘                                     │
        │           │                       │                       │
        │           ▼                       ▼                       │
        │  ┌────────────────────────────────────────────────┐     │
        │  │ snapshot.ts                                     │     │
        │  │  - Map<oracleId, SVISurfaceSnapshot>            │     │
        │  │  - vault snapshot (NAV, shares, hedges)         │     │
        │  │  - per-user rate-limiter state                  │     │
        │  │  - ring buffer (100 events OR last 1h)          │     │
        │  │  - last_updated_ms per field                    │     │
        │  └────────────────────────────────────────────────┘     │
        │           │                                              │
        │           ▼                                              │
        │  ┌────────────────────────────────────────────────┐     │
        │  │ cursor.ts                                       │     │
        │  │  - per-stream cursor → indexer/data/            │     │
        │  │      cursor_oracle.json + cursor_vault.json     │     │
        │  │  - flush every event (not every batch)          │     │
        │  └────────────────────────────────────────────────┘     │
        │           │                                              │
        │           ▼                                              │
        │  ┌────────────────────────────────────────────────┐     │
        │  │ wsServer.ts (ws library)                        │     │
        │  │  - on connection: send snapshot                 │     │
        │  │  - on event: broadcast                          │     │
        │  │  - heartbeat every 10s                          │     │
        │  │  - GET /healthz → cursor + uptime + client count│     │
        │  └────────────────────────────────────────────────┘     │
        └──────────────┬──────────────────────────────────────────┘
                       │ Sui RPC (JSON-RPC over HTTPS)
                       │ - client.queryEvents({MoveEventType,cursor,limit:50},...)
                       │ - client.getObject({id:VAULT_ID,options:{showContent:true}})
                       ▼
        ┌─────────────────────────────────────────────────────────┐
        │  Sui Testnet — full node                                 │
        │  https://fullnode.testnet.sui.io                         │
        │                                                          │
        │  ┌────────────────────┐  ┌────────────────────────┐    │
        │  │ OracleSVI shared   │  │ deepvault::vault       │    │
        │  │ object             │  │ shared object          │    │
        │  │ emits              │  │ emits 11 event types:  │    │
        │  │ OracleSVIUpdated   │  │ Supplied, RedeemReq..  │    │
        │  └────────────────────┘  │ Fulfilled, Canceled,   │    │
        │                          │ HedgeMinted, HedgeRoll │    │
        │  ┌────────────────────┐  │ Paused, AdminOverride, │    │
        │  │ DeepBook Predict   │  │ AdminTune, AdminUnwind,│    │
        │  │ PredictManager     │  │ (+ event surface)      │    │
        │  └────────────────────┘  └────────────────────────┘    │
        └─────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

```
indexer/
├── package.json
├── tsconfig.json
├── render.yaml                  # Render free-tier deploy + keepalive cron consumer
├── .env.example                 # SUI_RPC_URL, VAULT_ID, PREDICT_MANAGER_ID, ORACLE_ID, etc.
├── data/                        # cursor files (gitignored; ephemeral on Render)
└── src/
    ├── relay.ts                 # main: bootstrap + healthz + start polling loops
    ├── cursor.ts                # per-stream JSON cursor persistence
    ├── snapshot.ts              # in-memory snapshot store + ring buffer
    ├── wsServer.ts              # ws library setup + replay-on-connect
    ├── pollOracleSVI.ts         # MoveEventType polling for OracleSVIUpdated
    ├── pollVaultEvents.ts       # Package-filter polling for vault events
    ├── decodeI64.ts             # signed i64::I64 → JS bigint string (rho, m fields)
    ├── deployInfo.ts            # parse TESTNET-DEPLOY.json + warn on pending
    └── __tests__/
        ├── cursor.test.ts
        ├── snapshot.test.ts
        ├── wsServer.test.ts     # uses ws fake server + client
        └── fixtures/
            ├── oracle-svi-update.json
            ├── supplied.json
            └── ... (5-10 captured event payloads)

dashboard/
├── package.json
├── components.json              # shadcn output
├── index.html
├── vite.config.ts
├── vitest.config.ts             # existing
├── tailwind.config.ts
├── postcss.config.js
├── vercel.json                  # Vercel build config
├── .env.example                 # VITE_RELAY_WS_URL, VITE_SUI_NETWORK
└── src/
    ├── main.tsx                 # Provider stack (CONTEXT.md Claude's Discretion)
    ├── App.tsx                  # Layout shell per UI-SPEC D-05 order
    ├── env.ts                   # import.meta.env wrapper
    ├── styles/
    │   └── globals.css          # shadcn CSS vars + Tailwind directives
    ├── components/
    │   ├── ui/                  # shadcn-generated; DO NOT hand-edit
    │   ├── layout/
    │   │   ├── Header.tsx
    │   │   ├── Main.tsx
    │   │   ├── RelayStatusPill.tsx
    │   │   └── GlobalStalenessPill.tsx
    │   ├── panels/
    │   │   ├── SurfacePanel.tsx       # Plotly 3D
    │   │   ├── ArbCheckerPanel.tsx    # Recharts LineChart of g(k)
    │   │   ├── VaultPanel.tsx
    │   │   ├── BucketGauge.tsx
    │   │   ├── ExposurePanel.tsx
    │   │   ├── WhatIfSimulator.tsx
    │   │   ├── DepositWithdrawPanel.tsx
    │   │   └── PositionViewer.tsx
    │   ├── primitives/
    │   │   ├── StalenessPill.tsx
    │   │   ├── TxDigestLink.tsx
    │   │   └── NumericValue.tsx       # Intl.NumberFormat + tabular-nums
    │   └── __tests__/                 # vitest + @testing-library/react
    ├── hooks/
    │   ├── useWebSocket.ts            # reconnect + replay merge
    │   ├── useSurfaceSnapshot.ts
    │   ├── useVaultState.ts
    │   ├── usePositions.ts
    │   └── useStaleness.ts
    └── lib/
        ├── wsClient.ts                # plain WebSocket; exposes events Observable-style
        ├── ptbBuilders.ts             # supply / redeem_request / fulfill / cancel
        ├── format.ts                  # bigint → display string helpers
        └── (existing Phase 1 files unchanged: svi.ts, arb_checker.ts, phi.ts,
            isqrt.ts, ln.ts, math.ts, phi_coefficients.ts, strategy_constants.ts,
            parity_runner.ts)
```

### Pattern 1: `queryEvents` polling with persisted cursor

**What:** Two independent polling loops (one per high-frequency event type, one per package-filter for 11 vault events), each with its own JSON cursor file. Poll every 2s; persist cursor on every successful page; cap `limit:50` per page; on RPC failure, exponential-backoff retry, never advance cursor.

**When to use:** Any Sui event tailing where `subscribeEvent` is deprecated and the JSON-RPC sunset (2026-07-31) is post-deadline.

**Example:**

```typescript
// indexer/src/pollOracleSVI.ts
// Source: https://sdk.mystenlabs.com/typescript (client.queryEvents docs)
//         + Phase 3 STATE.md "u64-as-string JSON convention"

import { SuiClient } from '@mysten/sui/client';
import { Cursor } from './cursor';
import { Snapshot } from './snapshot';

type EventCursor = { txDigest: string; eventSeq: string } | null;

const PREDICT_PKG = process.env.PREDICT_PACKAGE_ID!; // from TESTNET-DEPLOY.json
const ORACLE_SVI_EVENT = `${PREDICT_PKG}::oracle::OracleSVIUpdated`;

export async function pollOracleSVI(
  client: SuiClient,
  cursor: Cursor<EventCursor>,
  snapshot: Snapshot,
  log: Logger
): Promise<void> {
  while (true) {
    try {
      const { data, nextCursor, hasNextPage } = await client.queryEvents({
        query: { MoveEventType: ORACLE_SVI_EVENT },
        cursor: cursor.value,
        limit: 50,
        order: 'ascending',
      });
      for (const evt of data) {
        // evt.parsedJson has decoded fields; rho/m are { magnitude, negative } I64 shape
        const parsed = decodeI64Fields(evt.parsedJson as RawOracleSVIUpdated);
        snapshot.applyOracleEvent(parsed, BigInt(evt.timestampMs ?? '0'));
        if (nextCursor) await cursor.set(nextCursor);   // flush per-event, not per-page
      }
      if (!hasNextPage) {
        await sleep(2000);                              // 2s cadence per CLAUDE.md
      }
    } catch (err) {
      log.error({ err }, 'queryEvents OracleSVIUpdated failed');
      await sleep(Math.min(2000 * 2 ** consecutiveFailures++, 30_000));
    }
  }
}
```

**Notes for planner:**
- The `i64::I64` Move type encodes signed integers as `{ magnitude: u64, negative: bool }`. The relay must decode this and emit JSON with `rho_signed: "-123456789"` (u64-as-string per Phase 3 convention). See vendored `scripts/deepbookv3/packages/predict/sources/oracle.move:58-66` for the struct.
- `client.queryEvents` returns events in chronological order when `order: 'ascending'`. Cursor `{ txDigest, eventSeq }` is opaque; treat as a string-pair.
- `parsedJson` field of `SuiEvent` contains a JSON-parsed Move struct; u64 fields arrive as numeric strings. Re-emit as-is in the WebSocket payload.

### Pattern 2: Cursor persistence (atomic JSON write)

**What:** Per-stream JSON file at `indexer/data/cursor_<stream>.json`. Write atomically via tmp+rename to survive crash mid-write.

**When to use:** Any tail-poller where missing one event corrupts downstream state (snapshot diff would be wrong).

**Example:**

```typescript
// indexer/src/cursor.ts
import { promises as fs } from 'node:fs';
import path from 'node:path';

export class Cursor<T> {
  private _value: T | null = null;
  constructor(private filePath: string, private initial: T | null) {}

  async load(): Promise<T | null> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf-8');
      this._value = JSON.parse(raw);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
        this._value = this.initial;
      } else throw e;
    }
    return this._value;
  }

  get value(): T | null { return this._value; }

  async set(v: T): Promise<void> {
    this._value = v;
    const tmp = this.filePath + '.tmp';
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(tmp, JSON.stringify(v), 'utf-8');
    await fs.rename(tmp, this.filePath); // atomic rename
  }
}
```

**Notes:** On Render free-tier ephemeral filesystem, the file is wiped on restart. CONTEXT.md D-02 accepts this: cold-boot re-queries from `cursor=null` and re-fills the ring buffer.

### Pattern 3: WebSocket replay-on-connect ring buffer

**What:** Server keeps a bounded queue of the last 100 events (or events from the last 1 hour, whichever is smaller). On every new WebSocket client connection, send `{type:"snapshot", data:{...}}` first (last surface per oracle + vault state + ring buffer contents), then continue streaming live events.

**When to use:** Any push-based dashboard where state is high-cardinality but a newcomer must not see an empty UI.

**Example:**

```typescript
// indexer/src/wsServer.ts
import { WebSocketServer } from 'ws';
import { Snapshot } from './snapshot';

export function startWsServer(port: number, snapshot: Snapshot, log: Logger) {
  const wss = new WebSocketServer({ port });
  wss.on('connection', (ws) => {
    // 1. Send snapshot immediately
    ws.send(JSON.stringify({
      type: 'snapshot',
      data: snapshot.fullSnapshot(),     // includes ring buffer
    }));
    // 2. Subscribe to live events
    const unsub = snapshot.onEvent((evt) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type: 'event', name: evt.name, data: evt.data }));
      }
    });
    ws.on('close', unsub);
  });
  // 3. Heartbeat (10s)
  setInterval(() => {
    for (const ws of wss.clients) {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type: 'heartbeat', ts_ms: String(Date.now()) }));
      }
    }
  }, 10_000);
  log.info({ port }, 'ws server listening');
  return wss;
}
```

### Pattern 4: WebSocket client auto-reconnect with exponential backoff + jitter

**What:** Client tracks attempt count; backoff delay = `min(1000 * 2^attempts, 30000) + random_jitter_0_500ms`. On open, reset attempts to 0. On replay-snapshot receipt, atomically replace local snapshot state.

**Why:** Per Pitfall 9 (Stale data on dashboard) and CONTEXT.md "Auto-reconnect strategy". Also mitigates relay reconnect storm risk noted in ARCHITECTURE.md §14 ("What breaks first").

**Example:**

```typescript
// dashboard/src/lib/wsClient.ts
type Handler = (msg: WsMessage) => void;

export class WsClient {
  private ws?: WebSocket;
  private attempts = 0;
  private timer?: number;
  private handlers = new Set<Handler>();

  constructor(private url: string) { this.connect(); }

  on(h: Handler) { this.handlers.add(h); return () => this.handlers.delete(h); }

  private connect() {
    this.ws = new WebSocket(this.url);
    this.ws.onopen = () => { this.attempts = 0; };
    this.ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data as string) as WsMessage;
        for (const h of this.handlers) h(msg);
      } catch { /* swallow malformed */ }
    };
    this.ws.onclose = () => this.scheduleReconnect();
    this.ws.onerror = () => this.ws?.close();  // close triggers onclose
  }

  private scheduleReconnect() {
    const base = Math.min(1000 * 2 ** this.attempts, 30_000);
    const jitter = Math.floor(Math.random() * 500);
    this.attempts += 1;
    this.timer = window.setTimeout(() => this.connect(), base + jitter);
  }

  dispose() {
    if (this.timer) clearTimeout(this.timer);
    this.ws?.close();
  }
}
```

**React hook wrapper (`hooks/useWebSocket.ts`):**

```typescript
import { useEffect, useState, useRef } from 'react';
import { WsClient } from '../lib/wsClient';

type State = 'connecting' | 'live' | 'reconnecting' | 'down';

export function useWebSocket(url: string) {
  const clientRef = useRef<WsClient | null>(null);
  const [state, setState] = useState<State>('connecting');
  const [lastHeartbeatMs, setLastHeartbeatMs] = useState<number>(Date.now());
  const [snapshot, setSnapshot] = useState<SnapshotShape | null>(null);
  const [eventCount, setEventCount] = useState(0);

  useEffect(() => {
    const c = new WsClient(url);
    clientRef.current = c;
    const off = c.on((msg) => {
      switch (msg.type) {
        case 'snapshot':
          setSnapshot(msg.data);
          setState('live');
          break;
        case 'event':
          setSnapshot((prev) => prev && applyEvent(prev, msg));
          setEventCount((n) => n + 1);
          break;
        case 'heartbeat':
          setLastHeartbeatMs(Date.now());
          break;
      }
    });
    return () => { off(); c.dispose(); };
  }, [url]);

  // Down detection: no heartbeat for 60s
  useEffect(() => {
    const id = setInterval(() => {
      if (Date.now() - lastHeartbeatMs > 60_000) setState('down');
      else if (Date.now() - lastHeartbeatMs > 30_000) setState('reconnecting');
      else if (snapshot) setState('live');
    }, 1_000);
    return () => clearInterval(id);
  }, [lastHeartbeatMs, snapshot]);

  return { state, snapshot, eventCount, lastHeartbeatMs };
}
```

### Pattern 5: react-plotly.js with `revision` prop for re-render without re-mount

**What:** Memoize `data` and `layout` props with `useMemo` keyed on a content-derived hash (`snapshot.lastUpdatedMs` or a computed digest), and bump a `revision: number` prop on every snapshot change. Plotly internally re-renders the WebGL surface in-place rather than tearing down + remounting the canvas.

**Why:** Without this, every React parent re-render passes a NEW data array reference, which forces react-plotly.js to destroy and recreate the entire WebGL context — visible as a flash + frame drops. CLAUDE.md What-NOT-to-Use explicitly calls this out.

**Example:**

```tsx
// dashboard/src/components/panels/SurfacePanel.tsx
// Source: https://plotly.com/javascript/3d-surface-plots/
//         + https://www.npmjs.com/package/react-plotly.js (revision prop)

import Plot from 'react-plotly.js';
import { useMemo, useState, useEffect } from 'react';
import { totalVariance, type SVIParams } from '@/lib/svi';
import type { Data, Layout } from 'plotly.js';

export function SurfacePanel({
  svi,
  forwards,    // forward price per tenor
  tenors,      // years
  thetaUpdatedMs,
}: SurfacePanelProps) {
  // Build 50×50 grid
  const { x, y, z } = useMemo(() => {
    const K_GRID = 50;
    const T_GRID = tenors.length; // typically ≤ 5; pad/interpolate to 10
    const ks: number[] = [];
    const ws: number[][] = [];
    for (let i = 0; i < K_GRID; i++) {
      const k = -2.0 + (4.0 * i) / (K_GRID - 1);   // log-strike axis
      ks.push(k);
    }
    for (let j = 0; j < T_GRID; j++) {
      const row: number[] = [];
      for (let i = 0; i < K_GRID; i++) {
        // Map k → strike, call totalVariance with bigint scaling
        const kBig = BigInt(Math.floor(ks[i] * 1e9));
        const w = totalVariance(svi[j], kBig);     // bigint at FLOAT_SCALING
        row.push(Number(w) / 1e9);
      }
      ws.push(row);
    }
    return { x: ks, y: tenors, z: ws };
  }, [svi, tenors]);

  const data: Data[] = useMemo(() => [{
    type: 'surface',
    x, y, z,
    colorscale: 'Viridis',
    showscale: false,
    contours: { z: { show: true, usecolormap: true, project: { z: true } } },
  }], [x, y, z]);

  const layout: Partial<Layout> = useMemo(() => ({
    scene: {
      xaxis: { title: 'log-strike k' },
      yaxis: { title: 'tenor T (years)' },
      zaxis: { title: 'total variance w(k,T)' },
      camera: { eye: { x: 1.3, y: 1.3, z: 0.9 } },
    },
    margin: { t: 0, r: 0, b: 0, l: 0 },
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    font: { color: '#94a3b8' },
    autosize: true,
  }), []);

  const [revision, setRevision] = useState(0);
  useEffect(() => { setRevision((r) => r + 1); }, [thetaUpdatedMs]);

  return (
    <Plot
      data={data}
      layout={layout}
      revision={revision}
      config={{ scrollZoom: false, displayModeBar: false, responsive: true }}
      style={{ width: '100%', height: 600 }}
      useResizeHandler
    />
  );
}
```

**Notes:**
- The `revision` prop is the documented Plotly mechanism for "force redraw without prop-identity change."
- `useResizeHandler` is required because Plotly otherwise won't react to parent container resize on tab-visible.
- CLAUDE.md Stack Patterns: "If still problematic, fallback to `Plotly.react()` with revision pattern instead of `<Plot>`." Document this fallback in the executor's task notes.

### Pattern 6: dApp Kit PTB construction for vault::supply

**What:** Build a `Transaction` with one `moveCall` to `${VAULT_PKG}::supply::supply<DUSDC>` passing the vault shared object, PredictManager, oracle, Clock, and the deposit coin; preview expected shares client-side via `totalVariance` + share math, then `signAndExecuteTransaction` via dapp-kit.

**Example:**

```typescript
// dashboard/src/lib/ptbBuilders.ts
// Source: https://sdk.mystenlabs.com/typescript (Transaction class)
//         + scripts/two-protocol-ptb-demo.ts (Phase 3 working analog)

import { Transaction } from '@mysten/sui/transactions';

export function buildSupplyTx(args: {
  vaultId: string;
  vaultPkg: string;
  predictManagerId: string;
  oracleId: string;
  depositCoinId: string;
  depositAmount: bigint;
  dusdcType: string;
}): Transaction {
  const tx = new Transaction();
  // Optional: split the deposit coin if user wants partial
  const [deposit] = tx.splitCoins(tx.object(args.depositCoinId), [tx.pure.u64(args.depositAmount)]);
  tx.moveCall({
    target: `${args.vaultPkg}::supply::supply`,
    typeArguments: [args.dusdcType],
    arguments: [
      tx.object(args.vaultId),
      tx.object(args.predictManagerId),
      tx.object(args.oracleId),
      tx.object('0x6'),  // Clock
      deposit,
    ],
  });
  return tx;
}

// React-side execution
// import { useSignAndExecuteTransaction } from '@mysten/dapp-kit';
// const { mutate: signAndExecute } = useSignAndExecuteTransaction();
// signAndExecute({ transaction: tx }, { onSuccess: (result) => toast(...) });
```

**Notes for planner:**
- The actual signature of `vault::supply::supply` is in `contracts/sources/supply.move`. Planner MUST verify the exact arg order + type-param shape before writing tasks.
- `tx.object()` calls return Arguments; for shared objects, dapp-kit passes them by-ref by default (object resolution handled by Sui SDK behind the scenes).
- For redeem: three separate PTBs (`redeem::request`, `redeem::fulfill`, `redeem::cancel`) — each is one `moveCall`. Cooldown enforcement is on-chain.

### Pattern 7: Predict server REST as a state read fallback

**What:** Use `https://predict-server.testnet.mystenlabs.com` for utilization / portfolio / oracle history reads via React Query. Avoids hammering public Sui RPC.

**When to use:** Per CLAUDE.md What-NOT-to-Use: "Live-streaming raw on-chain reads to dashboard → hammers the public RPC". Use Predict server REST for state, `queryEvents` for SVI updates.

**Example:**

```typescript
// dashboard/src/hooks/usePortfolio.ts
import { useQuery } from '@tanstack/react-query';

export function usePortfolio(address: string | undefined) {
  return useQuery({
    queryKey: ['predict-portfolio', address],
    queryFn: async () => {
      const r = await fetch(`${import.meta.env.VITE_PREDICT_SERVER_URL}/portfolio/${address}`);
      if (!r.ok) throw new Error('portfolio fetch failed');
      return r.json();
    },
    enabled: !!address,
    staleTime: 5_000,
    refetchInterval: 10_000,
  });
}
```

**Notes:** Exact endpoint shapes are not in CLAUDE.md or research files; the planner must verify against the live testnet server during Wave 0 (curl + grep). This is the same "verify the server contract on day 1" risk as the Predict contract churn.

### Anti-Patterns to Avoid

- **Subscribing via `subscribeEvent` JSON-RPC WS** — Deprecated, returns 405 on most public RPC, JSON-RPC sunsets 2026-07-31. CLAUDE.md hard guard. Use `queryEvents` polling. [VERIFIED: CLAUDE.md "What NOT to Use"]
- **Passing raw `data` arrays to `<Plot>` on every render** — Re-mounts the WebGL canvas. Use `useMemo` + `revision` prop. [VERIFIED: CLAUDE.md anti-pattern, Pitfall 9 analog]
- **One global cursor for all event streams** — A page of OracleSVIUpdated events shares no chronology with vault events. Per-stream cursor. [CITED: Sui RPC docs — `queryEvents` filter is per-call]
- **Hardcoded Predict package IDs in source** — CLAUDE.md hard guard. Use `.env` / `packages/contracts.ts` / TESTNET-DEPLOY.json.
- **`setInterval(refresh, 5000)` for vault state** — Pitfall 9 warning sign. Either subscribe via WebSocket events OR cache RPC reads behind React Query with `staleTime`.
- **Wall-clock timestamps for staleness** — Use on-chain event `timestamp` field, not `Date.now()`. Pitfall 9 root cause.
- **Server-side what-if simulator** — CONTEXT.md D-09 locks: client-side TS, sub-100ms. A server round-trip adds 100-500ms latency and a relay dependency.
- **Custom wallet modal** — CONTEXT.md Claude's Discretion locks `<ConnectButton />` as the single entry point. dapp-kit's Wallet Standard handles Slush / Suiet / Backpack auto-detection.
- **Storing TreasuryCap / TradeCap / AdminCap by-value in client code** — These never leave the chain. The PTB builders pass shared-object refs only.
- **Recharts 3.x prop names** — CLAUDE.md pins ^2.15.x. 04-UI-SPEC patterns assume 2.x API. Future upgrade is post-submission.
- **Polling vault NAV via direct on-chain reads on every render** — Pitfall 9 ("Live-streaming raw on-chain reads"). Cache via React Query with 2-5s staleness.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| WebSocket reconnect logic | Custom `setInterval` retry, fixed delay | Exponential backoff with jitter (Pattern 4); browser native `WebSocket` API + react-query for state | Without jitter, all clients reconnect simultaneously after a relay restart → reconnect storm (ARCHITECTURE.md §14). |
| 3D vol surface render | Three.js / r3f custom WebGL shader | Plotly `type:'surface'` | 2-3 weeks of WebGL bring-up for one chart. CLAUDE.md What-NOT guard. |
| Wallet connect UI | Custom modal | `@mysten/dapp-kit` `<ConnectButton />` + `WalletProvider` | Wallet Standard handles Slush / Suiet / Backpack zero-code. |
| SVI math (TS) | Re-port from Move/Python | Phase 1 outputs `dashboard/src/lib/svi.ts` | Already exists, parity-gated bit-equal vs Move + Python on 141 golden vectors. CI parity job protects it. |
| Arbitrage-free g(k) computation | Re-derive | Phase 1 `dashboard/src/lib/arb_checker.ts` returns full `g_k_array` | Already exists per Phase 1 D-04 (MATH-04 differentiator). |
| BCS event decoding | Hand-parse u64/i64 buffers | `@mysten/sui` `queryEvents` returns `parsedJson` (JSON-decoded) | Bundled. Only manual decode needed: `i64::I64` → signed string. |
| PTB construction | Hand-build BCS-encoded transactions | `@mysten/sui` `Transaction` class | The canonical builder; Phase 3 `scripts/two-protocol-ptb-demo.ts` is the reference idiom. |
| Date formatting | Manual `Date` math | `date-fns` `formatDistanceToNow` | 04-UI-SPEC contract uses it for relative times + tooltip absolute UTC. |
| Token-bucket state display | Custom canvas gauge | Recharts `<RadialBarChart>` | UI-SPEC contract. Composable, accessible. |
| Toast notifications | Custom div + setTimeout | `sonner` via shadcn | UI-SPEC contract. `aria-live` accessibility free. |
| Tooltip + popover positioning | Custom JS | Radix Primitives (via shadcn `<Tooltip>` / `<Popover>`) | Accessibility free; collision detection handled. |
| Number formatting (u64 → display) | Manual `toString()` + commas | `Intl.NumberFormat` with `useMemo`-cached locale | Tabular-nums + locale + significant-digits handled. UI-SPEC contract. |
| Static state diagram of cooldown UI | Custom state machine | Local React state machine (3 states: idle / requesting / cooldown / fulfillable) | Simple enough to hand-roll but UI-SPEC pre-specifies the transitions; no XState needed. |
| Healthcheck JSON | Custom format | `{ status, cursor, clients, uptime_ms }` per CONTEXT.md Claude's Discretion | Render + keepalive cron expect this shape. |

**Key insight:** Phase 4 has been intentionally scoped so that no math is hand-rolled in this phase. The SVI evaluator, arb-checker (g(k) array), strategy constants, NAV scale, and `binary_price` are all already present in `dashboard/src/lib/`. The dashboard's job is integration + UX, not new computation.

## Runtime State Inventory

> Phase 4 is mostly greenfield, but `dashboard/` is a pre-existing scaffold with shared Phase 1 SVI library code. Below is an explicit audit.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | **None.** No databases, no persistent stores. Relay's `indexer/data/cursor_*.json` is the only on-disk state, and it's ephemeral on Render free-tier; CONTEXT.md D-02 explicitly accepts cold-boot backfill. | None — verified by `Glob **/.planning/state/*` returns no DB artifacts; no `mem0_user_id` strings; no SQLite. |
| Live service config | **TESTNET-DEPLOY.json** at `.planning/phases/02-vault-move-package-testnet-deploy/TESTNET-DEPLOY.json` is currently `status: "pending_first_deploy"` with all on-chain IDs as `"PENDING"`. Phase 4 relay reads this file on boot. | (1) Relay logs warning + serves snapshot-only when status=pending. (2) When Phase 2/3 deploy lands, IDs are written here and relay restart picks them up. (3) No data migration — first-write semantics. |
| OS-registered state | **None.** No Windows Task Scheduler, no systemd, no launchd, no pm2 entries. Phase 0 D-15 keepalive cron is in `.github/workflows/` (GitHub Actions, not local OS). | None — verified. |
| Secrets / env vars | (1) `VITE_RELAY_WS_URL` (dashboard build-time env). (2) `VITE_SUI_NETWORK` (`testnet` for v1). (3) `VITE_PREDICT_SERVER_URL` if Predict-server REST is used. (4) Relay-side: `SUI_RPC_URL`, `VAULT_ID`, `PREDICT_MANAGER_ID`, `ORACLE_ID`, `PREDICT_PACKAGE_ID`, `VAULT_PACKAGE_ID`, `LOG_LEVEL`, `PORT`. None are secrets per se (all public chain data); but Render dashboard sets them, NOT git. | Document `.env.example` in both `dashboard/` and `indexer/`. Set production values in Vercel + Render dashboards. Add `.env*` to `.gitignore` (verify root `.gitignore` already covers). |
| Build artifacts / installed packages | `dashboard/node_modules/` and `indexer/node_modules/` exist (pnpm workspaces). Phase 4 adds React, Vite, dApp Kit, Plotly, Recharts. After install: `pnpm install` from repo root regenerates lockfile delta. | (1) Verify root `pnpm-lock.yaml` is committed. (2) After Wave 0 install, commit the new lockfile in the same commit as `package.json` changes. (3) Existing `dashboard/src/lib/` Phase 1 files must remain UNCHANGED — Plan task should grep for forbidden tokens (`Math.*`, `Number(`, `parseFloat`) on the evaluator files to confirm no regression. |
| **Pre-existing dashboard scaffold** | `dashboard/package.json` has only `tsx`, `vitest`, `@types/node`. `dashboard/src/lib/` has 9 TS files (Phase 1 outputs). No React, no Vite. `dashboard/vitest.config.ts` exists. Build script is `echo 'Phase 4 fills this in' && exit 0`. | (1) Replace placeholder `build` script with `tsc -b && vite build`. (2) Add `dev` script `vite`. (3) Add `lint` script. (4) Add `index.html`. (5) `npx vite create` will refuse on non-empty dir — manually scaffold per Vite docs. |
| **Pre-existing indexer scaffold** | `indexer/package.json` has zero dependencies. No `src/` directory exists yet. Build/test/lint scripts are echo-only placeholders. | All net-new. |
| **CI matrix invariants** | Existing 6-job matrix per Phase 2 STATE.md: `move`, `ts`, `python`, `codegen-drift`, `parity`, `e2e-vault`. Branch protection invariant. | Phase 4 extends `ts` job IN-PLACE (adds dashboard build step + indexer typecheck + new vitest run targets). DO NOT add a new top-level job; CONTEXT.md Claude's Discretion explicit. |
| **Phase 1 SVI lib parity gate** | CI `parity` job has forbidden-token grep targeting `svi/phi/isqrt/ln/math.ts` only. arb_checker.ts is intentionally excluded (visualization-bound, off-chain only, per Phase 1 D-05). | (1) No edits to `svi.ts`, `phi.ts`, `isqrt.ts`, `ln.ts`, `math.ts`, `phi_coefficients.ts`, `parity_runner.ts`. (2) New files in `dashboard/src/lib/` (e.g., `wsClient.ts`, `ptbBuilders.ts`, `format.ts`) are unrestricted — Number/Math.* is fine for UX code. (3) Plan task should re-run `pnpm test` from `dashboard/` to confirm 311 Phase 1 tests still pass after install. |

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Indexer + Vite tooling | ✓ (per root `engines.node` ">=22") | per developer setup | — |
| pnpm | Workspace mgmt | ✓ (per root `packageManager` "pnpm@10.0.0") | 10 | — |
| `@mysten/sui@2.16.0` | Indexer + Dashboard | ✓ (already at root) | 2.16.0 | — |
| `@mysten/dapp-kit@1.0.4` | Dashboard | ✗ (not installed yet) | — | Install in Wave 0 |
| `plotly.js@3.5.1` + `react-plotly.js@2.6.0` | SurfacePanel | ✗ | — | Install in Wave 0; if wrapper bugs, swap to direct `Plotly.newPlot()` hook |
| `recharts@^2.15` | 2D panels | ✗ | — | Install in Wave 0 |
| Vite ^7 | Dev server / build | ✗ | — | Install in Wave 0 |
| React 18.3 + react-dom | UI | ✗ | — | Install in Wave 0 |
| shadcn CLI | Component scaffold | npx (no install needed) | latest | — |
| Sui testnet RPC `https://fullnode.testnet.sui.io` | Relay polling | ✓ (public endpoint) | — | Use a secondary RPC (e.g., `https://sui-testnet-rpc.publicnode.com`) in `.env` fallback list |
| Predict testnet server `https://predict-server.testnet.mystenlabs.com` | Predict-server REST reads (optional) | ✓ per CLAUDE.md | — | Skip REST features; relay-derived state covers DASH-06..08 |
| Vault testnet deployment | Live event flow | ✗ (status=pending_first_deploy in TESTNET-DEPLOY.json) | — | Relay snapshot-only mode per CONTEXT.md Claude's Discretion "TESTNET-DEPLOY.json consumption" |
| Vercel free-tier project | Dashboard hosting | ✗ (account exists per Phase 0 D-13, project not yet created) | — | Local `vite dev` is fine for development; Vercel preview deploys auto-create on PR |
| Render free-tier project | Relay hosting | ✗ (account exists per Phase 0 D-15, project not yet created) | — | Local `node dist/relay.js` for development |
| Slush / Suiet / Backpack wallet extension | Demo + live testing | ✓ (CLAUDE.md primary = Slush) | — | Any Wallet-Standard wallet works via dapp-kit |
| Sui CLI `mainnet-v1.71.1` | NOT needed for Phase 4 | — | — | Phase 5 dependency only |

**Missing dependencies with no fallback:**
- Vault deployment (TESTNET-DEPLOY.json `pending_first_deploy`). Phase 4 can stand the relay + dashboard up in snapshot-only mode but DASH-11 (deposit/withdraw via PTB) and DASH-12 (PositionViewer with PnL) cannot be exercised end-to-end until the vault is deployed on testnet. **Recommendation:** Plan parallel-tracks: (A) wire all the UI + relay + WebSocket reconnect against the placeholder; (B) execute DASH-11/12 against a freshly-deployed testnet vault when status flips to `deployed`. Phase 4 success criteria #3 (dApp Kit deposit flow) is gated on this.

**Missing dependencies with fallback:**
- Predict-server REST endpoints — use direct on-chain reads via `getObject` (already in `@mysten/sui`) if the server shape is unverified at Wave 0.
- Recharts 3.x — pinned to ^2.15.x; if a critical 2.x bug bites, document and post-submission upgrade.

## Common Pitfalls

### Pitfall 1: WebSocket reconnect storm after relay restart

**What goes wrong:** Render free-tier sleeps after 15 minutes idle. Relay wakes via the keepalive cron (Phase 0 D-15), restarts cold, re-fills cursor and ring buffer over ~5-10s. All dashboard clients reconnect simultaneously when the first heartbeat arrives — overwhelms the relay's WebSocket accept queue, dropping connections, triggering further reconnect storms.

**Why it happens:** Naive reconnect = same delay for all clients = synchronized retry. Documented in ARCHITECTURE.md §14 "What breaks first."

**How to avoid:** Exponential backoff + jitter (Pattern 4). The 0-500ms jitter spreads reconnect attempts across a 500ms window. Combined with the relay being snapshot-only-ready in <100ms after warm-boot, this never piles up.

**Warning signs:** Multiple clients showing `RECONNECTING in 1s` simultaneously after a known relay restart event. Relay log shows `connection refused` bursts.

### Pitfall 2: Stale data without staleness indicator (Pitfall 9 in PITFALLS.md)

**What goes wrong:** WebSocket dies overnight, judge opens demo, surface shows Saturday-2AM SVI; render-time looks current; surface is 32h stale. Submission reads as "dashboard is fake."

**How to avoid:** Per-panel `last_updated_ms` field tagged on every state mutation. Staleness pill state machine per 04-UI-SPEC: 30s → amber, 60s → rose. Sticky-header global pill = max age across all panels. Arb-checker special case: refuses to render green/red on surface >5min old, displays `STALE — cannot verify` (Pitfall 10 mitigation).

**Warning signs:** A panel with no visible "X seconds ago" caption. WebSocket close handler is empty. `setInterval(refresh, 5000)` somewhere in the dashboard (Pitfall 9 signal).

### Pitfall 3: Arb-checker false-negative on coarse g(k) grid (Pitfall 10 in PITFALLS.md)

**What goes wrong:** g(k) sampled at coarse grid misses a narrow violation band; status pill shows GREEN on an arbitrageable surface; dashboard credibility undermined.

**How to avoid:** Phase 1 already ships a 200-point grid via `arb_checker.ts::checkArb` (per Phase 1 D-04 + 01-08 STATE log "g(k) array length 200 at FLOAT_SCALING"). Dashboard imports the function directly — no resampling. Plot the full 200-point array as a `<LineChart>` in `ArbCheckerPanel`. Show `min(g(k))` numerically alongside the pill.

**Warning signs:** ArbCheckerPanel ever resamples g(k) at fewer than 200 points. Status pill renders without the g(k) line chart visible when status is RED.

### Pitfall 4: react-plotly.js full re-mount on every SVI update

**What goes wrong:** Without `useMemo` on `data`/`layout` and without bumping `revision`, every parent re-render passes a new data array reference, react-plotly.js tears down the WebGL canvas, frame drops or 1-2s flash. CLAUDE.md What-NOT-to-Use guard.

**How to avoid:** Pattern 5 above. `useMemo` keyed on content-hash; bump `revision` via separate `useState`; Plotly internally calls `Plotly.react()` which performs in-place updates.

**Warning signs:** Surface plot visibly flickers on each event tick. Chrome DevTools Performance trace shows `Plotly.purge` calls between events.

### Pitfall 5: PTB sign failure on fresh wallet (Pitfall 20 in PITFALLS.md)

**What goes wrong:** Judge's fresh wallet has no SUI for gas, or DUSDC balance is zero, or doesn't yet have a BalanceManager (if dashboard ever calls a Margin path). PTB reverts on first click; error is opaque hex; submission feels broken.

**How to avoid:** (1) Dashboard pre-sign panel shows estimated gas + DUSDC balance check; rejects with friendly error before sign (`Insufficient DUSDC. You have X; deposit requires Y.` per 04-UI-SPEC error states). (2) For deposit-only PTBs (Phase 4 scope), no BalanceManager required — that's a Phase 3 / Phase 5 concern. (3) README + dashboard sidebar lists prerequisites: "you need ≥1 SUI for gas + DUSDC from the testnet faucet."

**Warning signs:** No balance check before sign. Error toast shows `MoveAbort(code=...)` instead of plain English.

### Pitfall 6: Cursor non-durability vs Render ephemeral filesystem

**What goes wrong:** Relay restart wipes `indexer/data/cursor_*.json`. Re-querying from `cursor=null` returns ALL events ever — minutes of backfill on cold boot, ring buffer overflows, WebSocket clients connecting during backfill see partial snapshot.

**How to avoid:** CONTEXT.md D-02 already addresses this: cold-boot backfills the ring buffer (last ~1h) before serving WebSocket clients. Relay must (1) not bind `wsServer` until backfill completes, (2) compute `now - 1h` as the soft floor for which events to materialize, (3) write cursor on every event (not every page).

**Warning signs:** WebSocket clients receive `snapshot` with zero events on first connect after relay restart. Relay startup time > 30s.

### Pitfall 7: i64::I64 decoding (Move signed integer encoding)

**What goes wrong:** `OracleSVIUpdated` has `rho: i64::I64` and `m: i64::I64` fields. `@mysten/sui` `parsedJson` returns these as `{ magnitude: "1234", negative: false }` structs (NOT as signed numeric strings). Relay forwards naively; dashboard treats `rho` as object, type errors break the surface render.

**How to avoid:** Relay-side `decodeI64.ts`:
```typescript
type RawI64 = { magnitude: string; negative: boolean };
export function decodeI64(raw: RawI64): string {
  const mag = BigInt(raw.magnitude);
  const signed = raw.negative ? -mag : mag;
  return signed.toString();
}
```
Apply to `rho` and `m` fields before relay emits the `event` JSON frame. Dashboard parses with `BigInt(payload.rho_signed)`. The TS SVI lib already accepts `bigint` (Phase 1 D-01).

**Warning signs:** `Cannot read properties of undefined (reading 'magnitude')` in browser console. Surface renders only when rho = 0.

### Pitfall 8: u64 > 2^53 precision loss in JS Number

**What goes wrong:** Vault NAV at FLOAT_SCALING 1e9 plus DUSDC at 6 decimals quickly produces u64 values > 2^53. JSON-parsing payload as Number loses precision; dashboard shows nonsense.

**How to avoid:** CONTEXT.md D-03 + Phase 3 WAVE0-DECISION.md Q5 LOCK: u64 serialized as string. Dashboard parses with `BigInt(payload.field)`. UI rendering uses `Intl.NumberFormat` on the bigint via `format.ts` helpers. Tabular-nums for column alignment.

**Warning signs:** `NaN` or `Infinity` displayed in NAV / share-price. Browser console warnings about precision loss.

### Pitfall 9: Plotly bundle size

**What goes wrong:** Plotly.js full bundle is ~3.5 MB minified. Vite includes everything; first paint of dashboard takes 5+ seconds; judges see white screen.

**How to avoid:** Lazy-load the SurfacePanel via React.lazy + Suspense. Vendor-chunk Plotly in `vite.config.ts` `build.rollupOptions.output.manualChunks`. Use `plotly.js/lib/index-basic` import if surface is the only 3D feature (omits cartesian, ternary, polar, gl3d optimizations — but we need gl3d for surface, so use `plotly.js/lib/index-gl3d` which is ~1.5 MB).

**Warning signs:** Vite build report shows a single 3+ MB JS chunk. Vercel lighthouse score < 50.

### Pitfall 10: dApp Kit `autoConnect` race vs network selection

**What goes wrong:** `autoConnect` triggers wallet reconnect before `SuiClientProvider` has set the network. Wallet briefly thinks it's on mainnet; transaction list shows wrong chain.

**How to avoid:** Always wrap `WalletProvider` INSIDE `SuiClientProvider`:
```tsx
<QueryClientProvider client={queryClient}>
  <SuiClientProvider networks={{ testnet: { url: getFullnodeUrl('testnet') } }} defaultNetwork="testnet">
    <WalletProvider autoConnect>
      <App />
    </WalletProvider>
  </SuiClientProvider>
</QueryClientProvider>
```

**Warning signs:** Wallet briefly displays mainnet address on dashboard load.

## Code Examples

### Provider Stack (`main.tsx`)

```tsx
// dashboard/src/main.tsx
// Source: https://sdk.mystenlabs.com/dapp-kit#provider-setup
import '@mysten/dapp-kit/dist/index.css';
import './styles/globals.css';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SuiClientProvider, WalletProvider } from '@mysten/dapp-kit';
import { getFullnodeUrl } from '@mysten/sui/client';
import { ThemeProvider } from 'next-themes';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'sonner';

import { App } from './App';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 5_000, refetchInterval: 10_000 },
  },
});

const networks = { testnet: { url: getFullnodeUrl('testnet') } };

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networks} defaultNetwork="testnet">
        <WalletProvider autoConnect>
          <ThemeProvider attribute="class" defaultTheme="dark">
            <App />
            <Toaster richColors position="bottom-right" />
          </ThemeProvider>
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  </StrictMode>
);
```

### Deposit flow with dApp Kit (`DepositWithdrawPanel.tsx` excerpt)

```tsx
// dashboard/src/components/panels/DepositWithdrawPanel.tsx
// Source: https://sdk.mystenlabs.com/dapp-kit/wallet-hooks/useSignAndExecuteTransaction
import { useCurrentAccount, useSignAndExecuteTransaction, useSuiClient } from '@mysten/dapp-kit';
import { toast } from 'sonner';
import { buildSupplyTx } from '@/lib/ptbBuilders';

export function DepositWithdrawPanel({ env }: { env: EnvConfig }) {
  const account = useCurrentAccount();
  const client = useSuiClient();
  const { mutate: signAndExecute, isPending } = useSignAndExecuteTransaction();
  // ... state for amount, dialog open, etc.

  async function handleDeposit() {
    if (!account) return;
    // 1. Fetch user's DUSDC coin object
    const coins = await client.getCoins({ owner: account.address, coinType: env.dusdcType });
    const totalBalance = coins.data.reduce((acc, c) => acc + BigInt(c.balance), 0n);
    if (totalBalance < amount) {
      toast.error(`Insufficient DUSDC. You have ${formatDusdc(totalBalance)}; this deposit requires ${formatDusdc(amount)}.`);
      return;
    }
    // 2. Build PTB
    const tx = buildSupplyTx({
      vaultId: env.vaultId,
      vaultPkg: env.vaultPkg,
      predictManagerId: env.predictManagerId,
      oracleId: env.oracleId,
      depositCoinId: coins.data[0].coinObjectId,
      depositAmount: amount,
      dusdcType: env.dusdcType,
    });
    // 3. Sign + execute
    signAndExecute(
      { transaction: tx },
      {
        onSuccess: (result) => {
          toast.success('Deposit succeeded', {
            description: <TxDigestLink digest={result.digest} />,
          });
        },
        onError: (err) => {
          toast.error('Deposit failed', { description: err.message });
        },
      }
    );
  }
  // ... render
}
```

### Snapshot store (`snapshot.ts`)

```typescript
// indexer/src/snapshot.ts
type SurfaceSnapshot = {
  oracleId: string;
  a: string; b: string; rho_signed: string; m_signed: string; sigma: string;
  timestamp_ms: string;
  last_updated_ms: string;
};

type RingEvent = {
  name: string;
  ts_ms: string;
  data: Record<string, unknown>;
};

const RING_MAX_COUNT = 100;
const RING_MAX_AGE_MS = 60 * 60 * 1000;  // 1h

export class Snapshot {
  private oracles = new Map<string, SurfaceSnapshot>();
  private vault: VaultSnapshot | null = null;
  private rateLimiters = new Map<string, RateLimiterState>();
  private ring: RingEvent[] = [];
  private subscribers = new Set<(e: RingEvent) => void>();

  applyOracleEvent(p: ParsedOracleEvent, eventTsMs: bigint) {
    const snap: SurfaceSnapshot = {
      oracleId: p.oracleId,
      a: p.a, b: p.b, rho_signed: p.rho_signed, m_signed: p.m_signed, sigma: p.sigma,
      timestamp_ms: p.timestamp_ms,
      last_updated_ms: String(Date.now()),
    };
    this.oracles.set(p.oracleId, snap);
    const evt: RingEvent = { name: 'OracleSVIUpdated', ts_ms: snap.timestamp_ms, data: snap };
    this.pushRing(evt);
    this.emit(evt);
  }

  private pushRing(e: RingEvent) {
    this.ring.push(e);
    const cutoff = Date.now() - RING_MAX_AGE_MS;
    while (this.ring.length > RING_MAX_COUNT || (this.ring[0] && Number(this.ring[0].ts_ms) < cutoff)) {
      this.ring.shift();
    }
  }

  fullSnapshot() {
    return {
      oracles: [...this.oracles.values()],
      vault: this.vault,
      rate_limiters: [...this.rateLimiters.entries()].map(([user, state]) => ({ user, ...state })),
      ring_buffer: this.ring,
      served_at_ms: String(Date.now()),
    };
  }

  onEvent(fn: (e: RingEvent) => void) {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }

  private emit(e: RingEvent) {
    for (const fn of this.subscribers) fn(e);
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `suix_subscribeEvent` JSON-RPC WS | `client.queryEvents` polling with cursor | Sui announced JSON-RPC sunset 2026-07-31; subscribeEvent returns 405 on most RPCs (~2025) | Phase 4 explicitly chose polling over migration to GraphQL (lacks real-time sub op); polling works through submission window. |
| `@mysten/sui.js` | `@mysten/sui` | Late 2024 rename | All Phase 1+ code uses new namespace. |
| `@mysten/wallet-kit` | `@mysten/dapp-kit` | dapp-kit superseded wallet-kit (2024) | CLAUDE.md guard. |
| Sui Wallet + Stashed | Slush (rebrand) | 2025 | dapp-kit Wallet Standard auto-detects either name. |
| Plotly 2.x | Plotly 3.x | 3.5.1 May 2026 | Bundle restructure; `index-gl3d` lazy import recommended. |
| Recharts 2.x | Recharts 3.x | 3.x out, breaking changes to ResponsiveContainer | DeepVault stays on ^2.15 per CLAUDE.md guard. |
| React 18 | React 19 | March 2025 GA | dapp-kit advertised on 18; we stay on 18 for v1 risk control. |
| Vite 7 | Vite 8 | 2026 | DeepVault stays on ^7 per CLAUDE.md. |

**Deprecated/outdated:**
- `@mysten/sui.js` (note the .js) — legacy.
- `@mysten/wallet-kit` — replaced by dapp-kit.
- `subscribeEvent` for live events — JSON-RPC sunsetting; deprecated for some time.
- Three.js for SVI surface — was once-suggested in Sui dashboard examples; Plotly's `type:'surface'` is the standard now.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | [ASSUMED] `client.queryEvents({ query: { MoveEventType: "..." } })` returns events in chronological order when `order: 'ascending'` is set. | Pattern 1 | If wrong, snapshot.applyOracleEvent may not see oracle updates in time order; latest-state could regress. Mitigation: relay sorts by `evt.timestampMs` defensively before applying. Verify by reading `@mysten/sui` source or testing against a fixture. |
| A2 | [ASSUMED] `parsedJson` field on `SuiEvent` contains a fully-decoded Move struct with numeric fields as strings (for u64) and `{magnitude,negative}` objects (for i64::I64). | Pattern 1, Pitfall 7 | If parsedJson format differs (e.g., i64 returned as signed BigInt string already), the relay's `decodeI64.ts` is unnecessary. Verify against actual testnet event payload in Wave 0. |
| A3 | [ASSUMED] Predict server REST `https://predict-server.testnet.mystenlabs.com` exposes `/portfolio/<address>` and `/vault/<id>` endpoints. CLAUDE.md says "saves us indexing those state shards" but does not document the exact URLs. | Pattern 7 | If endpoints don't exist or have different shapes, Phase 4 falls back to direct `getObject` reads (slower but works). Verify in Wave 0 via `curl https://predict-server.testnet.mystenlabs.com/` and grep the response. |
| A4 | [ASSUMED] react-plotly.js 2.6.0 works at runtime with plotly.js 3.5.1 even though wrapper's peer-dep range is `plotly.js^2`. CLAUDE.md flags this as a smoke-test risk. | Pattern 5, Pitfall 4 | If wrapper crashes on Plotly 3.x: swap to direct `Plotly.newPlot()` hook (30 lines). Smoke-test in Wave 0 with the `type:'surface'` minimum example. |
| A5 | [ASSUMED] Render free-tier exposes the WebSocket port via `wss://<service>.onrender.com` (TLS auto-handled). | CONTEXT.md Claude's Discretion | If Render needs explicit TLS config: add a thin proxy or move to Fly.io free tier. Verify by deploying a 10-line `ws` echo server. |
| A6 | [ASSUMED] dapp-kit 1.0.4's `useSignAndExecuteTransaction` accepts a `Transaction` instance built with `@mysten/sui@2.16.0`'s `Transaction` class (no version coupling issues). | Pattern 6 | If version skew breaks: bump dapp-kit to 1.0.6. Existing Phase 3 `scripts/two-protocol-ptb-demo.ts` uses 2.16.0 successfully (without dapp-kit). |
| A7 | [ASSUMED] Vault NAV at FLOAT_SCALING 1e9 fits in u64 (max ~1.8e19); a $10M TVL = 1e16 quote-units, well under u64. | Pitfall 8 | At v1 hackathon scale this is true. Post-submission $1B+ TVL would force u128. Not a Phase 4 risk. |
| A8 | [ASSUMED] The 11 vault events (Supplied, RedeemRequested, RedeemFulfilled, RedeemCanceled, HedgeMinted, HedgeRolled, Paused, AdminOverride, AdminTune, AdminUnwind, plus a Health event) all emit timestamp_ms as part of payload OR rely on `evt.timestampMs` (RPC-level) for staleness. | Pattern 3, Architecture diagram | Per `contracts/sources/redeem.move:48` `RedeemRequested` has `timestamp_ms: u64`. Per `vault.move:154` `Supplied` has `vault_id, supplier, deposit_quote, shares_minted` — NO timestamp. Relay must use `evt.timestampMs` from RPC envelope for events that don't carry their own timestamp. Verify per-event-type in Wave 0. |
| A9 | [ASSUMED] The Phase 2 vault is configured with exactly 1 OracleSVI (BTC). 04-CONTEXT.md "single BTC oracle in v1" confirms. | Architecture, what-if simulator | Per CONTEXT.md "Deferred Ideas" — multi-oracle is STRAT-V2-03. Phase 4 assumes 1 oracle, 1 tenor strip (multiple expirations of same underlying). |
| A10 | [ASSUMED] `tx.object(VAULT_ID)` from `@mysten/sui/transactions` resolves shared-object refs (initialSharedVersion + mutable) automatically via SuiClient. | Pattern 6 | If we need explicit `tx.sharedObjectRef({...})`: ptbBuilders.ts adds that. Phase 3 `scripts/two-protocol-ptb-demo.ts` uses `tx.object()` successfully. |

**If this table is empty:** Not applicable — 10 assumptions identified. Each is testable in Wave 0 or has a documented fallback.

## Open Questions (RESOLVED)

1. **Predict-server REST endpoint inventory**
   - What we know: CLAUDE.md describes it as "off-chain index of vaults / portfolios / history (REST/JSON)" with the URL pinned. ARCHITECTURE.md §13 lists it as "backup data source; not load-bearing for live UI."
   - What's unclear: Exact endpoint paths and response shapes for `/portfolio`, `/vault`, `/oracle-svi/history`.
   - Recommendation: Wave 0 task — `curl` the testnet endpoint root + a few paths and document what's there. If usable, hook up VaultPanel + ExposurePanel via React Query. If not, fall back to relay-sourced state.
   - **RESOLVED: 04-02 Task 1 (relay queryEvents path) and 04-05 Task 1 (VaultPanel via relay snapshot) closes this — Predict-server REST is NOT load-bearing in v1; all state flows through relay → WebSocket → snapshot. Predict-server remains an optional fallback documented in research, deferred to post-submission backlog.**

2. **WebSocket reconnect test methodology (DASH-13)**
   - What we know: CONTEXT.md "Auto-reconnect strategy" defines exponential backoff 1s→30s cap; success criterion #4 says "Killing the WebSocket connection mid-recording produces an auto-reconnect with no white screen."
   - What's unclear: Does "kill the WebSocket connection" mean (a) ungracefully kill the server process, (b) close the client socket programmatically, or (c) drop network at the OS level (e.g., `iptables`)? Each tests slightly different reconnect paths.
   - Recommendation: Vitest unit test with a fake WS server that closes on demand (option b — fastest, deterministic). Plus a manual integration test pre-demo (option a — actually kill the relay process) to validate the full system. Document both.
   - **RESOLVED: 04-02 Task 2 (wsServer.test.ts) and 04-03 Task 2 (useWebSocket.test.tsx) cover option (b) at the unit level; 04-07 Task 3 documents the option (a) manual kill-mid-stream procedure in `04-DEMO-CHECKLIST.md`. Both paths are now covered.**

3. **Event timestamp source per vault event**
   - What we know: Some vault events (`RedeemRequested`, `RedeemFulfilled`) carry `timestamp_ms` in payload; others (`Supplied`, `HedgeMinted`) do not.
   - What's unclear: For events without payload timestamp, the relay must use `evt.timestampMs` from the JSON-RPC envelope. Is that field always set, or only for some chain configurations?
   - Recommendation: Wave 0 — verify against a captured fixture from testnet. `@mysten/sui` `SuiEvent` type definition will confirm.
   - **RESOLVED: 04-02 Task 1 (relay event ingest) uses `evt.timestampMs` from the JSON-RPC envelope as the authoritative source when payload `timestamp_ms` is absent; documented in 04-02-SUMMARY.md per the executor's contract with the BCS decoder.**

4. **Plotly bundle splitting strategy**
   - What we know: Full Plotly is ~3.5 MB. We only need `surface` (gl3d) + maybe `bar` (cartesian) for `<ArbCheckerPanel>`. Recharts handles all 2D so cartesian may not be needed from Plotly.
   - What's unclear: Whether `plotly.js/lib/index-gl3d` alone (~1.5 MB) covers `type:'surface'` end-to-end without missing dependencies.
   - Recommendation: Wave 0 — try `import Plotly from 'plotly.js/lib/index-gl3d'` and confirm surface renders. If anything missing, use `index-gl3d-strict` or fall back to full `plotly.js-dist-min`.
   - **RESOLVED: 04-04 Task 1 (SurfacePanel + Plotly wiring) imports `plotly.js/lib/index-gl3d` and asserts the surface render in the vitest smoke test; fallback to full `plotly.js-dist-min` documented in 04-04-SUMMARY.md if gl3d fails. Recharts handles all 2D so no Plotly cartesian dependency is required.**

5. **Per-user rate-limiter state read shape**
   - What we know: Phase 2 `redeem.move` lazy-inits a `RateLimiter` per user, stored as a value in `vault.rate_limiters: Table<address, RateLimiter>`.
   - What's unclear: How to read a specific user's RateLimiter via `getObject`/`getDynamicFieldObject`. Sui tables are sui::table objects; reading a key requires the table's parent ID + the field key.
   - Recommendation: Wave 0 — write a small `getRateLimiter(client, vaultId, user)` helper using `getDynamicFieldObject({ parentId: vault.rate_limiters_uid, name: { type: 'address', value: user }})`. Test against the live vault when it's deployed.
   - **RESOLVED: 04-07 Task 2 (useBucketState live wiring) implements the `getObject`(vault) → extract `rate_limiters` parent uid → `getDynamicFieldObject({ parentId, name: { type: 'address', value: account.address } })` chain, with graceful null-return when the bucket has not been lazy-initialized. Field-name verification deferred to executor read of `helpers/rate_limiter.move`.**

6. **Vercel + Render deployment specifics**
   - What we know: CONTEXT.md Claude's Discretion locks Vercel for dashboard, Render for relay; healthcheck endpoint shape; keepalive cron consumer.
   - What's unclear: Whether Vercel's auto-build picks up `pnpm` workspaces correctly (the dashboard is `@deepvault/dashboard` inside a pnpm workspace, not a standalone project). Whether `vercel.json` needs `installCommand: "pnpm install"` and `buildCommand: "pnpm --filter @deepvault/dashboard build"`.
   - Recommendation: Wave 0 — push a stub commit, observe Vercel's preview deploy log, adjust `vercel.json` accordingly. Pattern: many pnpm-monorepo Vercel users set `framework: null` + explicit commands.
   - **RESOLVED: 04-07 Task 3 ships `vercel.json` with `framework: null`, `installCommand: "pnpm install --frozen-lockfile"`, `buildCommand: "pnpm --filter @deepvault/dashboard build"`, and `outputDirectory: "dashboard/dist"`; `indexer/render.yaml` ships with pnpm-workspace-aware build/start commands and `/healthz` healthcheck path. Both configs are committed; the human-verify checkpoint exercises the actual deploy.**

## Validation Architecture

> Project config (`.planning/config.json`) has `workflow.nyquist_validation: false`. Section omitted per researcher instructions.

## Security Domain

> Project config has `workflow.security_enforcement: true`, ASVS level 1. Section included.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | partial | No password / OAuth flow; user authentication is wallet-signature-based via dApp Kit's Wallet Standard (Slush/Suiet/Backpack). Signing a transaction IS authentication. |
| V3 Session Management | partial | No server-side session. Read-only public WebSocket relay (CONTEXT.md D-03 "No auth"). Wallet provides per-tx signing — no long-lived browser session to manage. |
| V4 Access Control | yes | Per-wallet view filter (PositionViewer is wallet-only per D-10). Admin-cap functionality is on-chain only; dashboard does not gate admin actions. AdminCap is held by the deployer wallet and is non-transferable in v1. |
| V5 Input Validation | yes | (1) `signAndExecute` arguments validated client-side (deposit amount > 0, deposit amount ≤ DUSDC balance, valid recipient address shape). (2) WebSocket message JSON parsed with try-catch; malformed messages dropped silently per `wsClient.ts`. (3) URL params (none in v1; no client-side routing per D-06). (4) Form inputs in `DepositWithdrawPanel` (numeric only, bounds-checked). |
| V6 Cryptography | yes | No hand-rolled crypto. Wallet signs transactions via wallet extension (out of dashboard scope). WebSocket is wss:// only (TLS handled by Render). Predict server REST is https:// only (TLS handled by Mysten). NO HTTP/WS fallback. |
| V7 Error Handling | yes | All error paths produce user-readable messages per 04-UI-SPEC error states table. No stack traces in production UI. Sonner toast captures `err.message` only. |
| V8 Data Protection | yes | No PII collected. Wallet address is the only identifier; treated as public. |
| V9 Communications | yes | wss:// only for relay; https:// only for RPC + Predict server. `.env.example` documents URL schemes. CSP headers via Vercel default (no inline scripts; we use Vite-bundled assets). |
| V11 Business Logic | yes | All financial logic (NAV math, share math, hedge pricing, withdraw cooldown) is ON-CHAIN. Dashboard only DISPLAYS; on-chain Move enforces. Pre-sign expected-shares preview is a UX hint, not a contract. |
| V14 Configuration | yes | Vault address, package ID, Predict server URL, RPC URL — all from `.env`. NO hardcoded constants in source per CLAUDE.md. `.env.example` committed; actual `.env` in `.gitignore`. |

### Known Threat Patterns for {React SPA + WebSocket relay + Sui PTB}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Compromised Predict package ID in `.env` triggers wrong-vault PTB | Tampering | Vault & PredictManager are public chain objects; on-chain `vault::supply` checks the `&mut Vault<DUSDC>` type matches. Wrong package → tx aborts; no funds moved. Confidence: HIGH. |
| Malicious WebSocket payload causes XSS via dashboard | Tampering | All event payloads rendered through React (auto-escapes); no `dangerouslySetInnerHTML`. JSON.parse failure caught and dropped. Confidence: HIGH. |
| Replay attack on signed transaction | Spoofing | Sui transactions have built-in nonce (sender's sequence number); replay fails at chain level. dApp Kit handles signing; no replay-able state on dashboard. Confidence: HIGH. |
| Stale SVI data causes user to deposit at wrong NAV | Repudiation / Information Disclosure | Per-panel staleness pill (30s threshold per CONTEXT.md D-05); arb-checker refuses to validate stale surface (>5min). Deposit modal shows last-update age; users see staleness before signing. Pitfall 9 mitigation. Confidence: HIGH. |
| WebSocket DoS (single client opens 1000 connections) | DoS | Relay has no per-IP rate-limiting in v1; Render free-tier instance has resource limits that cap impact. Defense-in-depth via Render's reverse proxy. Post-submission: add `ws-rate-limit` middleware. Confidence: MEDIUM (acceptable for hackathon scale). |
| Reconnect storm overloads relay | DoS | Exponential backoff + jitter on client (Pattern 4); relay's snapshot-only mode is fast. Confidence: HIGH. |
| Wallet phishing via lookalike domain | Spoofing | Out of dashboard control (browser + wallet extension responsibility). README will note "verify URL is the canonical Vercel domain." Confidence: MEDIUM (industry-standard limitation). |
| Hardcoded RPC URL allows MITM | Spoofing / Information Disclosure | `VITE_SUI_NETWORK=testnet` resolves to `https://fullnode.testnet.sui.io` via `getFullnodeUrl()`; HTTPS-only. Confidence: HIGH. |
| Reading another user's PositionViewer | Information Disclosure | PositionViewer ALWAYS reads `useCurrentAccount()` and filters event log by connected wallet address. No URL parameter for "view other user's positions." Admin all-positions view explicitly deferred to STRAT-V2 per CONTEXT.md "Deferred Ideas". Confidence: HIGH. |
| Front-running a deposit | Tampering | On-chain ordering is the chain's responsibility; dashboard cannot influence. Front-running of a binary-mint can affect hedge price; mitigated by `max_price_premium_bps` cap on-chain (Phase 2 D-02). Dashboard exposes the abstain logic outcome via `Supplied` event's `hedge_alloc_quote` field (zero if abstained). Confidence: HIGH (chain-side mitigated). |
| Insufficient balance check leaks signing intent | Information Disclosure | Balance check is client-side ONLY for UX; on-chain enforces real balance. No PII or sensitive data leaked. Confidence: HIGH. |

**ASVS Level 1 compliance summary:** All applicable categories addressed. No hand-rolled crypto. No PII storage. All inputs validated. All errors handled. Configuration externalized to env. Communications wss/https-only. Authorization is wallet-signature-based (no server sessions). Business logic on-chain (defense-in-depth: client validation + chain enforcement).

## Project Constraints (from CLAUDE.md)

| Directive | Enforcement in Phase 4 |
|-----------|------------------------|
| Use `@mysten/sui@2.16.0`, `@mysten/dapp-kit@1.0.4`, `@mysten/deepbook-v3@0.17.0` | Pinned in Wave 0 install commands. Note: Phase 3 STATE log says project actually uses `@mysten/deepbook-v3@1.3.6`; Phase 4 does NOT need deepbook-v3 directly (dashboard only does vault PTBs, not Margin PTBs), so this divergence does not affect us. |
| Plotly.js 3.5.1 + react-plotly.js 2.6.0 (memoize data/layout, use `revision` prop) | Pattern 5 above. CI smoke-test the surface render. |
| Recharts ^2.15.x | Pinned. 3.x not used. |
| Vite ^7.x, React 18.3+, TypeScript ^5.6+ | All pinned in Wave 0 install. |
| Vitest ^4.1.x | Existing config; ^4.1.x. |
| Node.js >=22 LTS for indexer | Root `engines.node`. |
| `ws ^8.x`, `pino ^9.x`, `dotenv ^17.x` | All pinned. pino 10 exists but ^9 honored. |
| Use `client.queryEvents({ MoveEventType: "...::oracle_svi::OracleSVIUpdated" })` with 2s polling + persisted cursor — NOT `subscribeEvent` | Pattern 1. Note: actual event module path per `oracle.move` is `::oracle::OracleSVIUpdated` (NOT `oracle_svi`). CLAUDE.md naming is approximate; planner MUST verify via vendored source. |
| Hardcoded Predict package IDs FORBIDDEN | All IDs loaded from `.env` + `TESTNET-DEPLOY.json`. Pitfall 6 mitigation. |
| No dashboard work before vault feature-complete (Pitfall 19) | Phase 4 depends on Phase 3 Track A PTB integration-tested per ROADMAP. STATE.md confirms Phase 3 closed. Wave 0 still produces dashboard scaffold + relay before any visual polish. |
| Weekly Monday Predict contract-version sweep | Inherited from Phase 0. Pitfall 6. If predict-testnet-4-16 branch moves during Phase 4 build, refactor relay event parser + ptbBuilders.ts adapter. |
| Code freeze 2026-05-30 for vault + SVI calibrator | Phase 4 dashboard work is allowed after this date (it's downstream, not vault math). |
| Demo recorded on mainnet only (Pitfall 15) | Phase 4 stands up against testnet; Phase 5 redeploys to mainnet; Phase 6 records demo against mainnet. |
| GSD workflow enforcement (CLAUDE.md "Before using Edit, Write, or other file-changing tools, start work through a GSD command") | Researcher abides; planner produces tasks consumed by executor under GSD framework. |

## Sources

### Primary (HIGH confidence)

- **CLAUDE.md** (project root) — all version pins, "What NOT to Use" guardrails, anti-pattern callouts.
- **`.planning/phases/04-plp-risk-studio-dashboard-relay/04-CONTEXT.md`** — D-01..D-12 locked decisions + Claude's Discretion + Deferred Ideas.
- **`.planning/phases/04-plp-risk-studio-dashboard-relay/04-UI-SPEC.md`** — design system, component inventory, file layout, interaction contracts.
- **`.planning/REQUIREMENTS.md`** — DASH-01..DASH-13 exact requirement text.
- **`.planning/research/STACK.md`** — npm version verifications, ecosystem rationale, alternatives considered.
- **`.planning/research/ARCHITECTURE.md`** — relay design, PTB shape, dashboard tier diagram, trust boundaries, integration points.
- **`.planning/research/PITFALLS.md`** — Pitfall 9 (stale data) + Pitfall 10 (arb checker false neg) + Pitfall 14 (config drift) + Pitfall 20 (PTB on judge wallet).
- **`.planning/STATE.md`** — Phase 3 closure, u64-as-string convention, react-query / dapp-kit / vitest already noted as standard.
- **`scripts/deepbookv3/packages/predict/sources/oracle.move`** lines 58-66 — actual `OracleSVIUpdated` struct fields including `rho: i64::I64`.
- **`contracts/sources/vault.move`** lines 91-200 — Vault struct fields + 11 emitted event signatures.
- **`contracts/sources/supply.move`**, **`redeem.move`**, **`rebalance.move`** — exact function signatures for PTB builders.
- **`dashboard/src/lib/svi.ts`** + `arb_checker.ts` — Phase 1 outputs Phase 4 reuses unchanged.
- **`scripts/two-protocol-ptb-demo.ts`** — Phase 3 working analog for `@mysten/sui` Transaction construction.
- **`.planning/phases/02-vault-move-package-testnet-deploy/TESTNET-DEPLOY.json`** — placeholder structure relay parses.
- **npm view 2026-05-12** — verified `@mysten/sui@2.16.2`, `@mysten/dapp-kit@1.0.6`, `react-plotly.js@2.6.0`, `plotly.js@3.5.1`, `recharts@3.8.1`, `vite@8.0.12`, `vitest@4.1.6`, `react@19.2.6`, `ws@8.20.1`, `pino@10.3.1`, `dotenv@17.4.2`, `@tanstack/react-query@5.100.10`, `date-fns@4.1.0`.
- [Plotly.js 3D surface plots](https://plotly.com/javascript/3d-surface-plots/) — `type:'surface'` documentation.
- [Sui dApp Kit Docs](https://sdk.mystenlabs.com/dapp-kit) — `WalletProvider`, `SuiClientProvider`, `useSignAndExecuteTransaction`.
- [@mysten/sui Transaction class](https://sdk.mystenlabs.com/typescript) — PTB construction.

### Secondary (MEDIUM confidence)

- [react-plotly.js npm page](https://www.npmjs.com/package/react-plotly.js) — wrapper documentation. Last published 2022; `revision` prop documented.
- [Recharts documentation](https://recharts.org/) — 2.x API for `ResponsiveContainer`, `LineChart`, `BarChart`, `RadialBarChart`.
- [ws Node WebSocket server](https://github.com/websockets/ws) — server-side WS impl.
- [Sui Wallet → Slush rebrand announcement](https://www.mystenlabs.com/blog/sui-wallet-and-stashed-are-now-slush) — wallet name disambiguation.
- [Sui's Next Phase: JSON-RPC Sunset by 2026 (CoinChapter)](https://coinchapter.com/suis-next-phase-security-expansion-and-json-rpc-sunset-by-2026/) — JSON-RPC sunset 2026-07-31.

### Tertiary (LOW confidence — needs Wave 0 verification)

- **Predict-server testnet REST endpoint shapes** — only CLAUDE.md mention; verify with `curl` in Wave 0.
- **`react-plotly.js@2.6.0` runtime compatibility with `plotly.js@3.5.1`** — peer-dep range `^2`; CI smoke-test in Wave 0.
- **Vercel + Render pnpm-monorepo deployment specifics** — community patterns; verify with first preview deploy in Wave 0.
- **`@mysten/sui parsedJson` field exact shape for `i64::I64` Move struct** — assumption A2; verify against fixture in Wave 0.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions verified against npm view today (2026-05-12); divergences vs CLAUDE.md documented (Recharts 3 vs ^2.15, pino 10 vs ^9, dapp-kit 1.0.6 vs 1.0.4, sui 2.16.2 vs 2.16.0) with rationale to stay on CLAUDE.md pins.
- Architecture: HIGH — CONTEXT.md D-01..D-12 + 04-UI-SPEC pre-specify nearly every component; this research fleshes out the polling loops, cursor durability, reconnect protocol, and Plotly performance pattern.
- Pitfalls: HIGH — All 5 Phase 4 success criteria map cleanly to documented pitfalls (DASH-04 ↔ Pitfall 4 + Pattern 5; DASH-05 ↔ Pitfall 3 + Phase 1 arb_checker; DASH-10 ↔ Pitfall 2 + 04-UI-SPEC staleness state machine; DASH-13 ↔ Pitfall 1 + Pattern 4; DASH-09 ↔ Pitfall 8 + CONTEXT.md D-09).
- Runtime State Inventory: HIGH — repo audit done explicitly; no hidden state.
- Environment Availability: HIGH — env audit explicit; one blocker (vault not deployed) has fallback (snapshot-only mode).
- Security: HIGH — ASVS L1 categories explicitly addressed; defense-in-depth (client + chain).

**Research date:** 2026-05-12
**Valid until:** 2026-06-09 (rough — assumes weekly Predict contract sweep catches breaking changes; assumes no major release of dapp-kit / plotly.js in next 4 weeks). Re-verify versions if any Wave 0 install yields lockfile drift > 1 minor version on critical deps.
