# Phase 4: PLP Risk Studio Dashboard + Relay - Discussion Log

**Date:** 2026-05-12
**Phase:** 04-plp-risk-studio-dashboard-relay
**Mode:** discuss (4 gray areas surfaced, all 4 user-selected, all 4 confirmed at the recommended option)

---

## Areas Discussed

User multi-selected all 4 surfaced gray areas:

1. Replay-on-connect window (DASH-02)
2. What-if simulator shock model (DASH-09)
3. Dashboard layout + panel arrangement (DASH-04..10, 12)
4. Position viewer scope (DASH-12)

---

## Round 1 — All four sub-decisions (batched)

### Q: Replay-on-connect window?

**Options presented:**
- Last 100 events OR last 1h, whichever smaller (Recommended)
- Last 1000 events / last 24h
- Configurable via env var

**User selected:** Last 100 events OR last 1h, whichever smaller (Recommended)

**Recorded as:** D-01 (ring buffer; cold-boot backfill via cursor=null on Render restart)

### Q: What-if simulator vol-shock mechanism?

**Options presented:**
- Shift θ_T parallel ±2σ (Recommended)
- Shift ATM IV by ±2σ (refit SVI)
- Parallel shift whole surface

**User selected:** Shift θ_T parallel ±2σ (Recommended)

**Recorded as:** D-07 (per-tenor scalar shift; σ_θ rolling 30-day stdev; 20% bootstrap fallback)

### Q: Dashboard layout?

**Options presented:**
- Single scrolling page with sticky header (Recommended)
- Tabbed dashboard
- Grid dashboard with drag-rearrangeable cards

**User selected:** Single scrolling page with sticky header (Recommended)

**Recorded as:** D-05 + D-06 (sticky header carries ConnectButton + staleness pill + relay status; body order locked: hero surface → arb-checker → vault+bucket side-by-side → exposure → what-if → deposit/withdraw → position viewer; no client-side routing)

### Q: Position viewer scope (DASH-12) confirm?

**Options presented:**
- Connected wallet only v1 (Recommended)
- Connected wallet + admin all-positions if AdminCap detected

**User selected:** Connected wallet only v1 (Recommended)

**Recorded as:** D-10 (admin all-positions deferred to STRAT-V2; deployer uses Sui Explorer for admin queries)

---

## Decisions Not Asked (Claude's Discretion)

Captured directly in CONTEXT.md `<decisions>` and `### Claude's Discretion` blocks without user prompts:

- D-02 cursor persistence (`indexer/data/cursor.json` on local disk; cold-boot backfill survives Render's ephemeral filesystem)
- D-03 WebSocket message protocol (snapshot/event/heartbeat; u64-as-string per Phase 3 WAVE0-DECISION.md Q5; no auth read-only)
- D-04 relay polling cadence (2s per CLAUDE.md)
- D-08 spot-shock mechanism (±5σ on forward price; σ_F rolling 30-day stdev; 20% bootstrap fallback)
- D-09 sub-100ms slider update latency (useMemo cache on hedge_positions + shock_params)
- D-11 deposit flow PTB construction via @mysten/sui 2.16.0 Transaction class
- D-12 withdraw flow with 1-hour cooldown timer + redeem_cancel anytime button
- Workspace layout (10 component files + 4 hooks + 1 ws client lib in dashboard/; 4 files in indexer/)
- Relay deps (@mysten/sui 2.16.0, ws ^8, pino ^9, dotenv ^17)
- Dashboard deps (@mysten/sui + @mysten/dapp-kit + @tanstack/react-query + plotly.js 3.5.1 + react-plotly.js 2.6.0 + recharts ^2.15)
- Auto-reconnect strategy (exp backoff 1→30s capped)
- Plotly memoization pattern (useMemo on data + revision prop)
- Event filter: 2 queries per poll (OracleSVIUpdated + package-OR for 11 vault events)
- TESTNET-DEPLOY.json consumption (graceful pending_first_deploy handling)
- Vercel deployment (vercel.json with pnpm build + preview-per-PR)
- Render deployment (render.yaml + Phase 0 D-15 keepalive cron)
- WebSocket port + URL env var (VITE_RELAY_WS_URL)
- Healthcheck /healthz endpoint
- vitest coverage gate ≥85% on relay.ts + wsClient.ts
- No SSR (pure SPA on Vercel CDN)
- Test fixtures (captured 5-10 real testnet payloads in indexer/tests/fixtures/)
- Phase 5 mainnet swap-readiness (all addresses + URLs from env)

---

## Deferred Ideas (captured for future phases)

- Admin all-positions view → STRAT-V2
- Live Greeks panels (delta/gamma/vega) → STRAT-V2-02
- Multi-oracle picker → STRAT-V2-03
- Multi-vault dashboard → v2
- GraphQL events migration → post-2026-07-31 backlog
- Tabbed routing / full-screen 3D mode → out of scope
- Drag-rearrangeable cards → out of scope
- Dashboard auth / private views → post-submission
- PDF export of dashboard snapshot → backlog
- Slider for hedge ratio sensitivity (live) → STRAT-V2
- Backtest viewer in dashboard → optional polish

---

## Scope Creep Redirected

None during this discussion — all user-selected options stayed within Phase 4 boundary.

---

## Canonical References Surfaced

User did not introduce new external docs. CONTEXT.md `<canonical_refs>` accumulates from prior phases + research outputs + repository artifacts the dashboard imports.

---

*Discussion completed: 2026-05-12*
*Next: /gsd-plan-phase 4*
