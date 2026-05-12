# Phase 4 Demo Checklist (Plan 04-07 Task 3 — DASH-13 closure)

This checklist closes the integration-level loop for DASH-13. The unit-level
coverage already shipped in plans 04-02 (`indexer/src/__tests__/wsServer.test.ts`)
and 04-03 (`dashboard/src/hooks/__tests__/useWebSocket.test.tsx`). What remains
is the manual end-to-end procedure plus the deploy-day runbook.

Three sections:

1. [Pre-demo verification](#1-pre-demo-verification-dash-13-manual-kill-mid-stream) — manual kill-mid-stream test
2. [Deploy day](#2-deploy-day-vercel--render) — Vercel + Render commands
3. [Coverage map](#3-dash-13-coverage-map) — where each piece of DASH-13 lives

---

## 1. Pre-demo verification (DASH-13 manual kill-mid-stream)

**Objective:** Confirm the dashboard handles a mid-demo relay crash without
showing a white screen, without requiring a manual page refresh, and without
losing previously-rendered state.

**Why manual:** The vitest suite covers the wire-protocol reconnect logic in
isolation. This procedure exercises the full browser + WebSocket + UI render
loop that the demo video must showcase.

### Prerequisites

- Repo cloned, `pnpm install` completed at the repo root
- Two terminal windows available
- Modern browser (Chrome / Firefox / Safari) with the `dashboard/` `.env.local`
  pointing `VITE_RELAY_WS_URL=ws://localhost:8080`

### Procedure

```text
Terminal A (relay):
  cd indexer
  pnpm dev

Terminal B (dashboard):
  cd dashboard
  pnpm dev
```

1. Open the dashboard URL (Vite prints it, typically `http://localhost:5173`).
2. **Observe baseline:** the sticky header pill reads **LIVE** in emerald.
   Surface plot renders within 5 seconds (snapshot replay on connect). Vault
   panel, bucket gauge, exposure, and what-if panels are populated.
3. **Kill the relay:** in Terminal A, press `Ctrl+C`.
4. **Observe degraded state — within 3 seconds:**
   - Header pill flips to **RECONNECTING in {N}s** with a countdown.
   - No white screen. No exception in browser devtools console (beyond the
     expected `WebSocket connection closed` log).
   - Previously-rendered panels retain their last-known data.
   - The "Relay disconnected" banner at the bottom of the page reads:
     "Live updates paused. On-chain state still readable via direct RPC.
      Reconnecting automatically."
5. **Restart the relay:** in Terminal A, run `pnpm dev` again.
6. **Observe recovery — within 30 seconds:**
   - Header pill returns to **LIVE** (emerald).
   - "Relay disconnected" banner disappears.
   - No manual page refresh required.
   - Snapshot replays automatically; any stale-border treatment on panels
     clears as fresh events arrive.

### Pass / Fail criteria

| # | Check | Pass condition |
|---|-------|----------------|
| 1 | Baseline LIVE pill | Visible within 5s of dashboard load |
| 2 | Mid-kill degradation | Pill flips to RECONNECTING, no white screen, panels retain data |
| 3 | Banner copy | Exact UI-SPEC verbatim wording rendered |
| 4 | Auto-reconnect | LIVE pill returns within 30s of relay restart, no refresh needed |
| 5 | Console hygiene | No uncaught exceptions, only the expected WebSocket close log |

If any check fails, file a bug against this plan number and halt deploy until
the regression is fixed.

### Recording for Phase 6 demo

After all five checks pass, run the same procedure once with screen recording
on (OBS / QuickTime / loom). Save the clip to `.planning/phases/06-demo-and-submission/`
as `dash-13-reconnect.mp4` for inclusion in the submission video.

---

## 2. Deploy day (Vercel + Render)

Execute this section only **after** Phase 2 lands the testnet vault deploy and
the placeholder `TESTNET-DEPLOY.json` flips from `status: "pending_first_deploy"`
to `status: "deployed"`. Until then the dashboard renders the "Vault not yet
deployed" empty state on the deposit/withdraw and position panels (graceful by
design per Plan 04-07 Task 1).

### Render relay (deploy first — Vercel reads the relay URL)

```text
# From the repo root, with the Render CLI installed (https://render.com/docs/cli):
render blueprint launch
# OR via the dashboard UI: New → Blueprint → point at this repo.

# Render auto-detects indexer/render.yaml. Confirm settings:
#   - Service name: deepvault-relay
#   - Root dir: indexer
#   - Plan: Free
#   - Health check path: /healthz
#   - Env vars: SUI_RPC_URL, PORT, LOG_LEVEL, DEPLOY_JSON_PATH, NODE_ENV,
#     NODE_VERSION (all sourced from indexer/render.yaml)

# Wait for the first deploy to go green. Then verify:
curl https://deepvault-relay.onrender.com/healthz
# Expect JSON: { "status": "ok" | "snapshot-only", "cursor": ..., "clients": 0, "uptime_ms": ... }
```

**Free-tier gotcha (D-15):** Render free instances sleep after 15 minutes
idle. The keepalive cron in `.github/workflows/keepalive-relay.yml` pings
`/healthz` every 14 minutes. Confirm that workflow is enabled and green in
the repo's Actions tab before the demo window.

**Free-tier ephemeral disk gotcha:** `cursor.json` is reset on every cold
boot. This is expected (see comments in `indexer/render.yaml`); the cursor
recovers via a full backfill of the most recent event window on next
poll cycle.

### Vercel dashboard (deploy second — needs relay URL)

```text
# From the repo root:
vercel link
# Choose: Link to existing project? No
# Project name: deepvault-dashboard
# Directory: ./  (REPO ROOT — vercel.json lives here, not in dashboard/)
# Override settings? No (vercel.json drives everything)

# Set the relay URL as a project env var:
vercel env add VITE_RELAY_WS_URL production
# Paste: wss://deepvault-relay.onrender.com
# (Also add for preview environment if you want preview deploys to hit
#  the live relay — typically yes for demo iteration.)

# Trigger the first production deploy:
vercel --prod
```

**Verify the live URL:**

1. Open the deployed Vercel URL (printed at end of `vercel --prod`).
2. Sticky header LIVE pill should turn emerald within 5s (relay handshake).
3. All 7 panel sections render in D-05 order: hero surface → arb checker →
   vault+bucket → exposure → what-if → deposit/withdraw → position viewer.
4. Connect a Slush wallet on testnet. If `TESTNET-DEPLOY.json` is still
   `pending_first_deploy`, the deposit/withdraw and position panels show the
   "Vault not yet deployed" empty state. Otherwise the deposit flow is live.

### Post-deploy smoke test (when vault is deployed)

```text
# In the Vercel-deployed dashboard, with a funded testnet wallet:
1. Tab to Deposit. Enter 10 DUSDC. Confirm balance check passes.
2. Click Deposit DUSDC → Review dialog opens with "Confirm deposit of 10 DUSDC".
3. Click Confirm → Slush prompts for signature → approve.
4. Sonner toast: "Deposit succeeded" with a TxDigestLink to Sui Explorer.
5. PositionViewer table shows a new row with the deposit, hedge cost, and
   em-dashes in PLP yield / hedge payoff / net (not-yet-realized).
6. Submit a redeem request, observe cooldown countdown, then cancel — confirm
   the destructive dialog renders "Cancel redemption request?" verbatim.
```

---

## 3. DASH-13 coverage map

DASH-13 ("relay reconnect + CI + deploy plumbing") is split across three
implementation layers. This checklist closes the integration layer; the unit
and CI layers landed in earlier plans.

| Layer | Implementation | Plan | Location |
|-------|----------------|------|----------|
| **Server reconnect** | wsServer broadcast + heartbeat + replay-on-connect + /healthz | 04-02 | `indexer/src/wsServer.ts`, `indexer/src/__tests__/wsServer.test.ts` (220–241 cover `/healthz`; full file covers fan-out + reconnect) |
| **Client reconnect** | useWebSocket hook with exponential backoff + RECONNECTING pill | 04-03 | `dashboard/src/hooks/useWebSocket.ts`, `dashboard/src/hooks/__tests__/useWebSocket.test.tsx` |
| **CI extension** | ts job builds dashboard + indexer per push; 6-job matrix preserved | 04-07 | `.github/workflows/ci.yml` ts job (Build dashboard, Build indexer steps after Test) |
| **Vercel deploy** | pnpm-monorepo aware install / build / output config | 04-07 | `vercel.json` (repo root) |
| **Render deploy** | Free-tier blueprint with healthCheckPath, env vars, NODE_VERSION pin | 04-07 | `indexer/render.yaml` |
| **Keepalive cron** | Pings /healthz every 14 min to defeat free-tier 15-min sleep | 00 (D-15) | `.github/workflows/keepalive-relay.yml` (Phase 0) |
| **Integration loop** | This checklist — manual kill-mid-stream + deploy-day procedure | 04-07 | this file |

### Commands to re-run the unit coverage at any time

```text
# Indexer server-side WebSocket tests (Plan 04-02):
pnpm --filter @deepvault/indexer test src/__tests__/wsServer.test.ts

# Dashboard client-side WebSocket tests (Plan 04-03):
pnpm --filter @deepvault/dashboard test src/hooks/__tests__/useWebSocket.test.tsx
```

Both must remain green for DASH-13 to be considered satisfied. The manual
checklist above complements them by exercising the layers in browser context.

---

*Plan 04-07 Task 3 closure artifact. Updated 2026-05-12.*
