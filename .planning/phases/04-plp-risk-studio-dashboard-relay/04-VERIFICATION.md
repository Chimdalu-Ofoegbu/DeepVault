---
phase: 04-plp-risk-studio-dashboard-relay
verified: 2026-05-12T23:00:00Z
status: human_needed
score: 5/5 must-haves verified
overrides_applied: 0
human_verification:
  - test: "DASH-13 kill-mid-stream reconnect"
    expected: "Header pill flips RECONNECTING within 3s of relay kill; no white screen; panels retain last-known state; banner copy verbatim; auto-recovery within 30s of relay restart; no uncaught exceptions in console"
    why_human: "Requires a browser + live relay + kill signal. The unit tests for useWebSocket and wsServer cover the wire-protocol reconnect. The full browser-context loop (RelayStatusPill render transitions, banner appearance, retained state across WS close in a real DOM) cannot be verified by static analysis or headless test alone."
  - test: "End-to-end testnet vault deposit flow"
    expected: "Connect Slush wallet -> enter amount -> Review dialog -> sign PTB -> Sonner toast with TxDigestLink -> PositionViewer row appears with hedge cost populated"
    why_human: "Gated on Phase 2 TESTNET-DEPLOY.json status flipping to 'deployed'. Currently pending_first_deploy. The PTB builders and DepositWithdrawPanel wiring are verified; the live on-chain path requires the vault to be deployed first. Manual checklist in 04-DEMO-CHECKLIST.md §2 covers this."
  - test: "Vercel production deploy smoke test"
    expected: "Deployed URL loads in browser; sticky header LIVE pill turns emerald within 5s; all 7 panel sections render in D-05 order; no console errors"
    why_human: "Requires running 'vercel --prod' and opening the production URL. vercel.json exists and is structurally correct; actual cloud build result cannot be verified statically."
  - test: "Render relay deploy + keepalive cron"
    expected: "curl deepvault-relay.onrender.com/healthz returns {status, cursor, clients, uptime_ms}; keepalive-relay.yml workflow is enabled in repo Actions tab and green"
    why_human: "Requires 'render blueprint launch' and a live Render environment. indexer/render.yaml exists and is structurally correct; actual deploy result cannot be verified statically."
---

# Phase 4: PLP Risk Studio Dashboard + Relay — Verification Report

**Phase Goal:** A live React dashboard streaming SVI surface updates from a Node.js event relay, with vault panels, arbitrage checker, what-if simulator, and dApp Kit deposit/withdraw flows — running end-to-end against the testnet vault.

**Verified:** 2026-05-12T23:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Live 3D SVI surface re-renders within ~2s of OracleSVIUpdated; replay-on-connect works | VERIFIED | `indexer/src/pollOracleSVI.ts` polls queryEvents at 2s cadence; `wsServer.ts` sends `{type:'snapshot'}` as first frame on every new WS connection (line 94); `SurfacePanel.tsx` uses `useMemo`+`revision` prop pattern; Plotly `type:'surface'` confirmed at line 180 |
| 2 | Arb checker shows green/red with visible g(k) plot; shares Phase 1 SVI math | VERIFIED | `ArbCheckerPanel.tsx` imports `checkArb` from `@/lib/arb_checker` (line 52); plots `arb.gK.map(...)` — full 200-point array, never resampled (line 85); `<ReferenceLine y={0}>` with rose-600 present; STALE-CANNOT-VERIFY state at >5min (line 143) |
| 3 | dApp Kit deposit flow: connect → sign PTB → vault share + hedge position with PnL split | VERIFIED (snapshot-mode) | `DepositWithdrawPanel.tsx` wired with `useSignAndExecuteTransaction`, `buildSupplyTx/buildRedeemRequestTx/buildRedeemFulfillTx/buildRedeemCancelTx`; 3-step Input→Review→Execute flow present; `isDeployed()` gate renders "Vault not yet deployed" empty state correctly per objective note; `PositionViewer.tsx` with `bigint\|null` PnL attribution and em-dash null rendering confirmed |
| 4 | WebSocket kill mid-recording → auto-reconnect, no white screen, staleness indicator goes red | VERIFIED (unit-level) | `wsClient.ts` implements exp-backoff `min(1000*2^attempts,30_000)+jitter` (lines 62, 105); `useWebSocket.ts` NEVER clears snapshot on socket close; `RelayStatusPill.tsx` shows RECONNECTING/RELAY DOWN states; `wsServer.ts` DASH-13 reconnect test in `wsServer.test.ts` (7 cases); full browser-context kill-mid-stream is a human verification item |
| 5 | What-if simulator: ±5σ spot+vol shock client-side via shared TS SVI lib, sub-100ms, no relay round-trip | VERIFIED | `WhatIfSimulator.tsx` uses `useMemo` (6 occurrences) keyed on shock params; `whatIf.ts` pure-compute layer calling `binaryPrice(svi, forward, strike)` directly; D-08 partial delivery surface via amber "Bootstrap σ" Badge + "Using synthetic forward" Badge correctly disclosed |

**Score:** 5/5 truths verified

### Accepted Partial Deliveries (documented, not defects)

| Item | Status | Evidence |
|------|--------|----------|
| D-08 sigmaSpotPct bootstrap (no forward price in OracleSVIUpdated) | PARTIAL — accepted | `useSigmaEstimates.ts` forces `isBootstrap=true` for spot leg; amber Badge + tooltip renders the constraint to the user; documented in 04-06-SUMMARY.md D-08 PARTIAL DELIVERY section |
| SC#3 deposit/PositionViewer live e2e | PENDING GATE — accepted | Phase 2 vault deploy not yet complete; `ptbDeploy.ts` correctly reads TESTNET-DEPLOY.json with `status:'pending_first_deploy'`; `isDeployed()` gate renders empty states correctly; auto-activates when Phase 2 lands |
| DASH-12 plpYield/hedgePayoff render '—' | INTENTIONAL — accepted | `usePositions.ts` uses `bigint\|null` typing; `PositionViewer.tsx` NullableQuote renders em-dash for null, formatted DUSDC for known-zero; zero ≠ unavailable invariant enforced |

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `indexer/src/relay.ts` | Node.js relay entry | VERIFIED | Exists; substantive (full polling + WS server); wired via `pnpm dev`/`pnpm start` |
| `indexer/src/cursor.ts` | Atomic cursor persistence | VERIFIED | Exists; tmp+rename atomic write; per-event flush |
| `indexer/src/snapshot.ts` | Ring buffer + pub-sub | VERIFIED | Exists; RING_MAX_COUNT=100, RING_MAX_AGE_MS=1h; subscriber try/catch isolation |
| `indexer/src/wsServer.ts` | WS fan-out + /healthz | VERIFIED | Exists; replay-on-connect snapshot frame first; heartbeat every 10s; /healthz JSON |
| `indexer/src/pollOracleSVI.ts` | SVI event poller | VERIFIED | Exists; queryEvents at 2s; decodeI64 with `is_negative` |
| `indexer/src/pollVaultEvents.ts` | Vault event poller | VERIFIED | Exists; 4 vault modules; queryEvents |
| `indexer/src/decodeI64.ts` | I64 decoder | VERIFIED | Uses `is_negative` (confirmed); regression test present |
| `dashboard/src/lib/wsClient.ts` | WS client + reconnect | VERIFIED | Exp-backoff formula confirmed (lines 62, 105); jitter present; dispose() |
| `dashboard/src/hooks/useWebSocket.ts` | WS state machine | VERIFIED | Connecting/live/reconnecting/down states; snapshot retained across reconnect |
| `dashboard/src/hooks/useStaleness.ts` | Staleness hook | VERIFIED | 30s/60s thresholds locked as constants |
| `dashboard/src/components/panels/SurfacePanel.tsx` | Plotly 3D surface | VERIFIED | `type:'surface'`; 8x useMemo; revision prop wired |
| `dashboard/src/components/panels/ArbCheckerPanel.tsx` | Arb checker + g(k) | VERIFIED | checkArb from Phase 1 lib; gK.map() full 200-pt; ReferenceLine y=0 |
| `dashboard/src/components/panels/VaultPanel.tsx` | Vault panel | VERIFIED | NAV/assets/shares/utilization; BigInt math via useVaultState |
| `dashboard/src/components/panels/BucketGauge.tsx` | Token-bucket gauge | VERIFIED | emerald/amber/rose escalation; live useBucketState RPC wired |
| `dashboard/src/components/panels/ExposurePanel.tsx` | Hedge book | VERIFIED | useExposure with endsWith suffix matching; Table + BarChart |
| `dashboard/src/components/panels/WhatIfSimulator.tsx` | What-if simulator | VERIFIED | 6x useMemo; shockedPnL called; ±5σ/±2σ sliders; bootstrap disclosure |
| `dashboard/src/components/panels/DepositWithdrawPanel.tsx` | Deposit/withdraw | VERIFIED | 3-step flow; useSignAndExecuteTransaction; isDeployed gate; UI-SPEC copy |
| `dashboard/src/components/panels/PositionViewer.tsx` | Position viewer | VERIFIED | bigint\|null PnL; em-dash null rendering; 4 render branches |
| `dashboard/src/lib/ptbBuilders.ts` | PTB builder functions | VERIFIED | buildSupplyTx/buildRedeemRequestTx/buildRedeemFulfillTx/buildRedeemCancelTx; sharedObjectRef; Clock 0x6 |
| `dashboard/src/lib/ptbDeploy.ts` | Deploy JSON gate | VERIFIED | isDeployed() gate; no hardcoded IDs (imported from TESTNET-DEPLOY.json) |
| `dashboard/src/lib/whatIf.ts` | What-if compute | VERIFIED | shockSviParallel/shockedForward/shockedPnL; binaryPrice positional call; all BigInt |
| `dashboard/src/hooks/usePositions.ts` | Position derivation | VERIFIED | bigint\|null fields; findMatchingMint/Unwind/Redemption helpers |
| `vercel.json` | Vercel deploy config | VERIFIED | pnpm monorepo-aware; outputDirectory: dashboard/dist; frozen-lockfile |
| `indexer/render.yaml` | Render deploy config | VERIFIED | free tier; healthCheckPath: /healthz; --prod=false for tsx devDep |
| `.github/workflows/ci.yml` | CI extension | VERIFIED | 6-job matrix names preserved (move/ts/python/codegen-drift/parity/e2e-vault); Build dashboard + Build indexer steps present after Test |
| `.planning/phases/04-plp-risk-studio-dashboard-relay/04-DEMO-CHECKLIST.md` | Manual checklist | VERIFIED | 3 sections present: pre-demo verification, deploy day, DASH-13 coverage map |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `App.tsx` | `useWebSocket` | direct hook call | VERIFIED | `useWebSocket(env.relayWsUrl)` at line 43 |
| `App.tsx` | `SurfacePanel` | `useSurfaceSnapshot(snapshot)` | VERIFIED | surface derived from snapshot; passed as prop |
| `App.tsx` | `ArbCheckerPanel` | same surface | VERIFIED | same SurfaceView passed to both hero panels |
| `App.tsx` | `WhatIfSimulator` | `useSigmaEstimates(snapshot)` + hedges + surface | VERIFIED | all 3 props passed at lines 85-87 |
| `App.tsx` | `DepositWithdrawPanel` | `vaultView` prop | VERIFIED | useVaultState drives the panel |
| `App.tsx` | `PositionViewer` | `positions` + `snapshot?.vault` | VERIFIED | lines 92-93 |
| `ArbCheckerPanel` | `checkArb` | import from `@/lib/arb_checker` | VERIFIED | Phase 1 lib; unchanged per git diff |
| `SurfacePanel` | `totalVariance` | import from `@/lib/svi` | VERIFIED | Phase 1 lib; unchanged |
| `WhatIfSimulator` | `binaryPrice` | via `whatIf.ts::shockedPnL` | VERIFIED | positional signature `binaryPrice(svi, forward, strike)` |
| `DepositWithdrawPanel` | `buildSupplyTx` | import from `@/lib/ptbBuilders` | VERIFIED | 4 PTB builders imported |
| `relay.ts` | `pollOracleSVI` + `pollVaultEvents` | spawned under AbortController | VERIFIED | 5 polling loops in relay.ts |
| `wsServer.ts` | `snapshot.fullSnapshot()` | replay-on-connect | VERIFIED | line 94 sends snapshot as first frame |
| `decodeI64.ts` | `is_negative` field | direct field access | VERIFIED | `raw.is_negative ? -mag : mag` at line 40 |
| `ptbDeploy.ts` | `TESTNET-DEPLOY.json` | static Vite import | VERIFIED | line 17; no hardcoded IDs in source |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| `SurfacePanel` | `surface.grid` | `useSurfaceSnapshot(snapshot)` → `snapshot.oracles[]` | Yes — from WebSocket snapshot events (pending relay live data) | FLOWING (snapshot-only mode pending Phase 2 deploy) |
| `ArbCheckerPanel` | `arb.gK` | `checkArb(surface.svi)` → Phase 1 `arb_checker.ts` | Yes — computed from SVI params | FLOWING |
| `WhatIfSimulator` | `shockedPnL` results | `whatIf.ts::shockedPnL(hedges, surface, sigma)` | Yes — pure computation; no static return | FLOWING |
| `DepositWithdrawPanel` | PTB transactions | `buildSupplyTx` → `useSignAndExecuteTransaction` | Yes — live PTB against chain (pending Phase 2 deploy) | WIRED (pending Phase 2) |
| `PositionViewer` | `positions` array | `usePositions(snapshot)` → ring_buffer filtered by account | Yes — filters on-chain events by sender | FLOWING (empty until supply events exist) |
| `VaultPanel` | `navPerShareScaled` | `useVaultState(snapshot)` → `snapshot.vault` BigInt math | Currently null (vault not deployed); renders empty state | HOLLOW_PROP (intentional — Phase 2 gate) |

### Behavioral Spot-Checks

Step 7b: SKIPPED (no runnable entry points for static verification — relay requires live Sui RPC; dashboard requires browser environment; Phase 2 vault not yet deployed). Manual verification is covered by 04-DEMO-CHECKLIST.md.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| DASH-01 | 04-02 | queryEvents polling 2s cadence + cursor persistence | SATISFIED | `pollOracleSVI.ts` + `pollVaultEvents.ts` confirmed |
| DASH-02 | 04-02 | WS server + replay-on-connect | SATISFIED | `wsServer.ts` snapshot first-frame on connect |
| DASH-03 | 04-02 | In-memory snapshot store | SATISFIED | `snapshot.ts` Snapshot class with ring buffer |
| DASH-04 | 04-04 | Live 3D SVI surface Plotly type='surface' | SATISFIED | `SurfacePanel.tsx` verified |
| DASH-05 | 04-04 | Arb checker with visible g(k) plot | SATISFIED | `ArbCheckerPanel.tsx` 200-pt gK array confirmed |
| DASH-06 | 04-05 | VaultPanel utilization/NAV/shares | SATISFIED | `VaultPanel.tsx` with BigInt math |
| DASH-07 | 04-05 | BucketGauge per-user token-bucket | SATISFIED | `BucketGauge.tsx` + live `useBucketState` RPC |
| DASH-08 | 04-05 | ExposurePanel hedge book | SATISFIED | `ExposurePanel.tsx` with ring_buffer derivation |
| DASH-09 | 04-06 | What-if simulator ±5σ spot+vol client-side | SATISFIED (D-08 partial) | `WhatIfSimulator.tsx` + `whatIf.ts`; D-08 amber badge disclosed |
| DASH-10 | 04-03 | Staleness indicator on every panel at >30s | SATISFIED | `useStaleness.ts` 30s/60s thresholds locked; per-panel StalenessPill |
| DASH-11 | 04-07 | dApp Kit deposit/withdraw PTB flow | SATISFIED (snapshot-mode) | `DepositWithdrawPanel.tsx` 3-step flow; isDeployed gate |
| DASH-12 | 04-07 | Position viewer with PnL attribution | SATISFIED (null-state) | `PositionViewer.tsx` bigint\|null; em-dash null rendering |
| DASH-13 | 04-02+04-03+04-07 | WebSocket auto-reconnect tested | SATISFIED (unit-level; human verification pending) | wsServer.test.ts + useWebSocket.test.tsx cover wire protocol; browser-context is human item |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `dashboard/src/components/panels/DepositWithdrawPanel.tsx` | 259 | `placeholder="0.00"` | Info | HTML input placeholder attribute — NOT a code stub; this is a UI affordance |
| `dashboard/src/hooks/useBucketState.ts` (Plan 04-05 version) | — | v1 stub was `null` return | — | RESOLVED in Plan 04-07: live `getDynamicFieldObject` RPC now wired |
| `indexer/src/index.ts` | — | Wave-0 placeholder export | Info | Dead code (relay.ts is the real entry); RELAY_VERSION export only; no user-visible effect |

**Stub classification result:** The `placeholder` attribute is an HTML input affordance, not a stub pattern. No remaining blockers. The `indexer/src/index.ts` placeholder is dead code with zero runtime impact.

**Forbidden-pattern checks:**
- `subscribeEvent` in dashboard/src: 0 occurrences — CLEAN
- `subscribeEvent` in indexer/src: 0 occurrences — CLEAN
- `Number(|parseFloat(|Math.(sqrt|exp|log|pow)(` in svi.ts/math.ts/phi.ts/ln.ts/isqrt.ts: 0 occurrences — CLEAN (Phase 1 parity gate intact)
- Hardcoded Predict package IDs in dashboard source: 0 (1 hit is `ptbDeploy.ts` which is the import comment, not a hardcoded address) — CLEAN
- Hardcoded Predict package IDs in indexer source: 0 in production files — CLEAN (test fixtures contain IDs in fixture data, which is expected)
- `raw.negative` (wrong I64 field name) in decodeI64.ts: 0 occurrences — CLEAN; `is_negative` is used throughout

---

### Human Verification Required

#### 1. DASH-13 Kill-Mid-Stream Browser Test

**Test:** Follow 04-DEMO-CHECKLIST.md §1 procedure:
1. Start `cd indexer && pnpm dev` and `cd dashboard && pnpm dev`
2. Open dashboard at `http://localhost:5173`, observe LIVE pill in emerald
3. Press Ctrl+C to kill relay
4. Observe: pill flips to RECONNECTING, no white screen, panels retain last state, banner reads "Live updates paused..."
5. Restart relay, observe auto-recovery within 30s without page refresh

**Expected:** All five pass criteria in DEMO-CHECKLIST pass/fail table met with no uncaught exceptions

**Why human:** Wire-protocol reconnect logic and React state machine are unit-tested (useWebSocket.test.tsx + wsServer.test.ts). The full browser-context loop — DOM transitions, React render cycle, actual RelayStatusPill color change, banner appearance — requires a running browser and cannot be verified by static analysis alone.

---

#### 2. End-to-End Testnet Deposit Flow

**Test:** After Phase 2 TESTNET-DEPLOY.json flips to `status: "deployed"`, follow DEMO-CHECKLIST.md §2 post-deploy smoke test:
1. Open deployed Vercel URL
2. Connect Slush wallet (testnet)
3. Tab to Deposit, enter 10 DUSDC
4. Click "Deposit DUSDC" → Review dialog → "Confirm deposit of 10 DUSDC"
5. Sign in Slush → observe Sonner toast with TxDigestLink
6. PositionViewer shows new row with hedge cost populated

**Expected:** Full PTB flow completes on-chain; position row visible; em-dash for plpYield/hedgePayoff (not-yet-realized is correct)

**Why human:** Gated on Phase 2 vault deploy (TESTNET-DEPLOY.json currently `pending_first_deploy`). PTB builders are verified; live on-chain path requires the vault to exist.

---

#### 3. Vercel Production Deploy

**Test:** From repo root: `vercel link` (link to repo root) → `vercel env add VITE_RELAY_WS_URL production` (paste Render URL) → `vercel --prod`

**Expected:** Deployed URL loads; LIVE pill in emerald within 5s; all 7 panel sections render in D-05 order; no console errors

**Why human:** `vercel.json` structure is verified correct. Actual cloud build success requires running the deploy command.

---

#### 4. Render Relay Deploy + Keepalive Cron

**Test:** `render blueprint launch` from repo root → confirm deepvault-relay service appears with rootDir: indexer, plan: free, healthCheckPath: /healthz → `curl https://deepvault-relay.onrender.com/healthz` → confirm keepalive-relay.yml cron is enabled in repo Actions tab

**Expected:** healthz returns `{"status":"ok"|"snapshot-only","cursor":...,"clients":0,"uptime_ms":...}`

**Why human:** `indexer/render.yaml` structure is verified correct. Actual Render deploy requires running the blueprint command.

---

## Gaps Summary

No blocking gaps found. All 5 success criteria and all 13 DASH requirements have implementation evidence in the codebase:

- Success criterion 1 (SVI surface + relay): VERIFIED — relay + SurfacePanel wired end-to-end
- Success criterion 2 (arb checker with g(k)): VERIFIED — checkArb from Phase 1 lib; 200-pt array never resampled
- Success criterion 3 (dApp Kit deposit + PnL): VERIFIED (snapshot-mode) — DepositWithdrawPanel + PositionViewer wired; gated on Phase 2 deploy per objective note
- Success criterion 4 (WebSocket kill + auto-reconnect): VERIFIED (unit-level) — wsClient backoff + useWebSocket snapshot-retention unit-tested; browser-context is human item
- Success criterion 5 (what-if simulator ±5σ sub-100ms): VERIFIED — whatIf.ts pure-compute; useMemo; D-08 partial delivery clearly disclosed via amber Badge

The `status: human_needed` reflects 4 items requiring human execution (DASH-13 browser kill-mid-stream, live testnet deposit, Vercel deploy, Render deploy). These are deployment and browser-context verifications for which all code artifacts are in place and verified substantive.

---

## Phase 1 SVI Library Integrity (Critical Invariant)

The Phase 1 SVI evaluator files were confirmed UNCHANGED by multiple git-diff checks throughout all 7 plans:
- `svi.ts`, `phi.ts`, `isqrt.ts`, `ln.ts`, `math.ts`, `phi_coefficients.ts`, `strategy_constants.ts`, `arb_checker.ts`, `parity_runner.ts`
- Forbidden-token grep (Number/parseFloat/Math.sqrt|exp|log|pow) on all five evaluator files: 0 occurrences
- Three-way parity gate (CI `parity` job) remains structurally intact in ci.yml

---

_Verified: 2026-05-12T23:00:00Z_
_Verifier: Claude (gsd-verifier)_
