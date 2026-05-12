---
phase: 04-plp-risk-studio-dashboard-relay
plan: 03
subsystem: ui
tags: [dashboard, react, shadcn, websocket, exp-backoff, jitter, staleness, dapp-kit, vitest]

requires:
  - phase: 04-plp-risk-studio-dashboard-relay
    provides: Wave-0 scaffold (Vite+React+TS+@/ alias+provider stack+globals.css+components.json) from Plan 04-01
  - phase: 04-plp-risk-studio-dashboard-relay
    provides: Wave-1 relay wire protocol (snapshot/event/heartbeat JSON over WS, replay-on-connect, 10s heartbeat) from Plan 04-02
  - phase: 01-svi-math-evaluator
    provides: dashboard/src/lib/strategy_constants.ts NAV_SCALE — consumed by format.ts (UNCHANGED, parity-gated)

provides:
  - shadcn `new-york` primitives (button, badge, card, tooltip, skeleton, separator) at src/components/ui/
  - WebSocket client (`src/lib/wsClient.ts`) with exp-backoff + jitter reconnect (DASH-13 client side)
  - `src/hooks/useWebSocket.ts` state machine (connecting/live/reconnecting/down) keyed off lastHeartbeatMs
  - `src/hooks/useStaleness.ts` per-panel staleness derivation (DASH-10) at 30s/60s thresholds
  - `src/lib/format.ts` bigint-safe Intl.NumberFormat helpers (formatDusdc/formatNav/formatShares/formatBps/truncateDigest)
  - `src/lib/types.ts` wire-format types mirroring indexer/src/types.ts
  - Layout primitives: Header (sticky, ConnectButton + pills), RelayStatusPill, GlobalStalenessPill, StalenessPill, TxDigestLink, NumericValue
  - App.tsx wired to useWebSocket(env.relayWsUrl) with 7 D-05 section placeholders preserved + RELAY DOWN inline alert
  - Vitest coverage: 25 new tests (7 useStaleness + 6 useWebSocket + 6 StalenessPill + 6 RelayStatusPill); total dashboard 336 tests green

affects:
  - 04-04 (SurfacePanel + ArbCheckerPanel mount into `hero` + `arb-checker` sections; consume useWebSocket().snapshot)
  - 04-05 (VaultPanel + BucketGauge + ExposurePanel consume snapshot.vault + snapshot.ring_buffer via the same hook)
  - 04-06 (WhatIfSimulator reads snapshot.oracles + open positions via downstream hooks)
  - 04-07 (DepositWithdrawPanel + PositionViewer use ConnectButton wallet state already wired in Header)

tech-stack:
  added:
    - "@radix-ui/react-tooltip@^1.1.0 (shadcn Tooltip peer dep)"
    - "@radix-ui/react-separator@^1.1.0 (shadcn Separator peer dep)"
    - "@radix-ui/react-slot@^1.1.0 (shadcn Button asChild peer dep)"
    - "ws@^8.18.0 + @types/ws@^8.5.0 (vitest fake-server for useWebSocket DASH-13 reconnect test)"
  patterns:
    - "Pattern 4 verbatim: scheduleReconnect computes `min(1000 * 2^attempts, 30_000) + jitter[0..500]ms`; attempts reset on onopen (T-04-03-01 reconnect-storm mitigation)"
    - "u64-as-string boundary: format.ts parses bigint via integer math; only the final `Number(`${whole}.${fracPadded}`)` cast happens after the value is already bounded to display digits (Pitfall 8)"
    - "No client-side router: App.tsx is a single-page SPA per D-06; 7 sections scroll on one page"
    - "shadcn primitives written manually per `new-york` template (CLI is interactive on Windows PowerShell); registered in components.json"
    - "useWebSocket retains last snapshot across reconnects (no white-screen): React state setSnapshot is NEVER cleared on socket close; only replaced on next snapshot frame (DASH-13 + T-04-03-04 mitigation)"
    - "Test infra reuses real `ws` WebSocketServer bound on port 0; jsdom-built-in WebSocket talks to it over TCP — no mocks, validates the actual wire surface Plan 04-02 produced"
    - "Wave-0 vitest config already extended for component + hooks tests — no test-runner changes in this plan; new test globs `src/components/__tests__/**` and `src/hooks/__tests__/**` already covered by the include array"

key-files:
  created:
    - dashboard/src/lib/utils.ts
    - dashboard/src/lib/types.ts
    - dashboard/src/lib/format.ts
    - dashboard/src/lib/wsClient.ts
    - dashboard/src/hooks/useStaleness.ts
    - dashboard/src/hooks/useWebSocket.ts
    - dashboard/src/components/ui/button.tsx
    - dashboard/src/components/ui/badge.tsx
    - dashboard/src/components/ui/card.tsx
    - dashboard/src/components/ui/tooltip.tsx
    - dashboard/src/components/ui/skeleton.tsx
    - dashboard/src/components/ui/separator.tsx
    - dashboard/src/components/layout/Header.tsx
    - dashboard/src/components/layout/RelayStatusPill.tsx
    - dashboard/src/components/layout/GlobalStalenessPill.tsx
    - dashboard/src/components/primitives/StalenessPill.tsx
    - dashboard/src/components/primitives/TxDigestLink.tsx
    - dashboard/src/components/primitives/NumericValue.tsx
    - dashboard/src/hooks/__tests__/useStaleness.test.tsx
    - dashboard/src/hooks/__tests__/useWebSocket.test.tsx
    - dashboard/src/components/__tests__/StalenessPill.test.tsx
    - dashboard/src/components/__tests__/RelayStatusPill.test.tsx
  modified:
    - dashboard/package.json
    - dashboard/src/App.tsx
    - pnpm-lock.yaml
  deleted:
    - dashboard/src/components/ui/.gitkeep

key-decisions:
  - "Shadcn primitives written manually rather than via `npx shadcn add` CLI. The CLI is interactive on Windows PowerShell and the iter-1 checker flagged non-deterministic behavior. We write the canonical `new-york` template verbatim with attribution comments; components.json from Wave 0 records the registry contract so a future operator can regenerate via `npx shadcn add ... --overwrite` with byte-identical output."
  - "Test infrastructure for useWebSocket uses a REAL ws.WebSocketServer bound on ephemeral port 0 (not a mocked WebSocket). jsdom ships the WebSocket constructor for the client side; the server side runs in the Node test process and talks to the client over real TCP. This validates the wire protocol Plan 04-02 produced, not a synthetic stub — and DASH-13's server.close() + restart cycle exercises the same exp-backoff timer logic that runs in production."
  - "Snapshot retention across reconnect is the load-bearing decision for DASH-13's no-white-screen guarantee. setSnapshot is NEVER called with null after the first snapshot arrives — only on a new snapshot frame. The state machine flips to 'reconnecting' or 'down' via the heartbeat-age check, but the snapshot ref is preserved so downstream panels keep rendering stale data with stale borders (UI-SPEC §Staleness)."
  - "Exposed `testReconnectDelay(attempts)` and `getAttempts()` as public methods on WsClient for unit-testing exp-backoff math without timing real reconnects. Both are TEST-ONLY in spirit; production callers should ignore them. The alternative was to make WsClient methods package-private and unit-test only via integration paths, but that would have left the backoff formula uncovered if a future refactor accidentally regresses it."
  - "Global staleness pill collapses Number(last_updated_ms) at the Date.now() boundary. u64-as-string wire format is decoded via Number(...) here because (a) timestamps fit well under 2^53 (year 9000+ headroom) and (b) JS Date arithmetic operates on Number. The u64 BigInt discipline is upheld for monetary fields in format.ts; time deltas are the documented exception."

patterns-established:
  - "Exp-backoff + jitter formula: `min(1000 * 2^attempts, 30_000) + Math.floor(Math.random() * 500)`. Attempts reset on `onopen`. This is the canonical reconnect pattern for Phase 4 — any future hook reconnecting to a different upstream must mirror it (T-04-03-01)."
  - "Staleness thresholds 30s/60s are LOCKED in `useStaleness.ts` as `FRESH_THRESHOLD_MS` and `WARNING_THRESHOLD_MS` constants. Downstream plans MUST consume the hook; they MUST NOT recompute the thresholds inline. If a panel needs a different threshold (e.g. arb-checker's 5-minute STALE-cannot-verify gate per UI-SPEC), it composes useStaleness with its own additional gate ON TOP — never replaces it."
  - "Pill copy strings are LOCKED per UI-SPEC §Copywriting: `LIVE`, `STALE`, `CONNECTING`, `RECONNECTING IN {N}S`, `RELAY DOWN`. Downstream plans MUST NOT rename — demo video transcription is byte-identical."
  - "Shadcn primitive file template: an attribution comment at the top citing the canonical shadcn-new-york template URL + the regenerate command. Any future operator running `npx shadcn add button --overwrite` would produce a byte-identical file."

requirements-completed: [DASH-10, DASH-13]

# DASH-13 is closed by the union of this plan's exp-backoff CLIENT reconnect +
# Plan 04-02's server-side replay-on-connect + reconnect smoke test. The
# kill-mid-stream test in useWebSocket.test.tsx asserts client.snapshot
# persistence across reconnect — UI-SPEC §WebSocket reconnect "no white screen"
# acceptance gate.

duration: ~40min
completed: 2026-05-12
---

# Phase 4 Plan 03: Wave 2 Dashboard Shell + WebSocket Client Summary

**Layout shell with sticky Header (ConnectButton + RelayStatusPill + GlobalStalenessPill), WebSocket client with exp-backoff+jitter reconnect, useWebSocket state machine retaining snapshots across reconnect (no white-screen guard), useStaleness with 30s/60s thresholds, shadcn `new-york` primitives, and bigint-safe Intl.NumberFormat helpers — closes DASH-10 and the client side of DASH-13 with 25 new vitest cases and all 336 dashboard tests green.**

## Performance

- **Duration:** ~40 min wall-clock (3 atomic tasks)
- **Started:** 2026-05-12T21:12:00Z (approx)
- **Completed:** 2026-05-12T21:23:00Z (approx, plus SUMMARY write)
- **Tasks:** 3
- **Files created:** 22 (3 lib + 2 hooks + 6 shadcn ui + 3 layout + 3 primitive + 4 test + 1 App update)
- **Files modified:** 3 (package.json, App.tsx, pnpm-lock.yaml)
- **Files deleted:** 1 (src/components/ui/.gitkeep)
- **Tests:** 25 added → total 336 passing in ~7s

## Accomplishments

- **DASH-13 client side:** `src/lib/wsClient.ts` implements exp-backoff + jitter reconnect per RESEARCH Pattern 4 verbatim. Backoff math `min(1000 * 2^attempts, 30_000) + jitter[0..500]ms`; attempts reset to 0 on `onopen`. T-04-03-01 reconnect-storm mitigated by per-client `Math.random()` jitter. T-04-03-02 mitigated by JSON.parse inside try/catch — malformed frames are dropped silently and never propagate to React state. `dispose()` clears timer + closes socket + clears handlers (T-04-03-04 leak guard).
- **DASH-10 state machine:** `src/hooks/useStaleness.ts` returns `'fresh' | 'warning' | 'stale'` at 30s/60s thresholds (LOCKED constants). The hook ticks once per second so any panel that has been mounted long enough transitions on its own without a new event arriving. Null `lastUpdatedMs` returns `'stale'` for the no-data-yet empty state.
- **No-white-screen guard:** `useWebSocket.ts` retains the LAST snapshot across reconnects. The reconnect cycle flips the state machine to `'reconnecting'` then `'down'` based on heartbeat age, but the React snapshot ref is never cleared until a new `{type:'snapshot'}` frame arrives. Verified by vitest: server.close() → 200ms wait → snapshot ref still references the original `served_at_ms`.
- **Real-server vitest infrastructure:** useWebSocket.test.tsx spins up a real `ws.WebSocketServer` on ephemeral port 0, exercises the actual wire protocol (snapshot frame on connect, optional heartbeat), kills it, brings up a fresh server on the same port, and asserts the client reconnects + receives the new snapshot within 5s. This validates the same wire surface Plan 04-02 produced — not a mock.
- **Sticky Header per UI-SPEC:** `Header.tsx` mounts ConnectButton from `@mysten/dapp-kit` 1.0.4 (auto-detects Slush + Suiet + Backpack via Wallet Standard), `RelayStatusPill` (cyan LIVE / amber RECONNECTING IN Ns / rose RELAY DOWN), and `GlobalStalenessPill` (worst-case across snapshot.oracles + snapshot.vault). Display 28px Inter 600 product name; 1280px max-width container; sticky top-0 z-50.
- **App.tsx wiring + RELAY DOWN body alert:** Replaces the Wave-0 placeholder header with the live `<Header>`; preserves the 7 `<section data-section="...">` placeholders in D-05 order for Plans 04-04 through 04-07 to inject panels. Adds the UI-SPEC-mandated inline alert above the section grid when state===down.
- **Shadcn primitives:** Six `new-york` style primitives (button, badge, card, tooltip, skeleton, separator) written verbatim with attribution comments. Components.json registry contract from Wave 0 lets a future operator regenerate via `npx shadcn add ... --overwrite`. Three radix peer deps added (react-tooltip, react-separator, react-slot).
- **u64-safe format helpers:** `src/lib/format.ts` exports formatDusdc/formatNav/formatShares/formatBps/truncateDigest. bigintToDisplay splits whole/fractional with integer math; only the final `Number(`${whole}.${fracPadded}`)` cast happens after the value is already bounded to display digits — never round-trips a u64 through JS Number.
- **Phase 1 SVI lib unchanged:** `git diff HEAD -- dashboard/src/lib/{svi,phi,isqrt,ln,math}.ts` returns empty; the math/isqrt/phi/ln/svi parity gate stays intact. format.ts CONSUMES `STRATEGY_CONSTANTS.NAV_SCALE` without modifying strategy_constants.ts.

## Task Commits

Each task was committed atomically with the per-task verify pre-flight green:

1. **Task 1: shadcn primitives + format/utils libs + wire types** — `6b6782c` (feat) — typecheck clean; 311 Phase 1 tests still green; format.ts grep gates pass.
2. **Task 2: wsClient + useWebSocket + useStaleness state machine** — `9f6ae19` (feat) — 13 new vitest cases (7 useStaleness + 6 useWebSocket); exp-backoff math + jitter grep gates pass; DASH-13 reconnect cycle covered.
3. **Task 3: Header + RelayStatusPill + GlobalStalenessPill + primitives + App.tsx wiring** — `a5c26d5` (feat) — 12 new vitest cases (6 StalenessPill + 6 RelayStatusPill); typecheck + production build clean (vendor 134KB + plotly 6.68KB chunks isolated).

## Files Created/Modified

### `dashboard/src/lib/` (utilities)

- `utils.ts` (created) — `cn(...inputs)` Tailwind class-conflict merge helper (shadcn standard, imports clsx + tailwind-merge).
- `types.ts` (created) — wire-format types mirroring `indexer/src/types.ts`: `RawI64`, `SurfaceSnapshot`, `VaultStateSnapshot`, `RingEvent`, `FullSnapshot`, `WsMessage` discriminated union, plus `WsState` + `Staleness` enums.
- `format.ts` (created) — `formatDusdc(bigint)`, `formatNav(bigint)`, `formatShares(bigint)`, `formatBps(bigint | number)`, `truncateDigest(string)`. `bigintToDisplay` helper handles negative values via abs/sign split.
- `wsClient.ts` (created) — `WsClient` class. Constructor auto-connects unless `{autoConnect: false}` opt-out; `on(handler)` returns unsubscribe; `dispose()` is idempotent; `testReconnectDelay(attempts)` + `getAttempts()` are public TEST-ONLY observers.

### `dashboard/src/hooks/` (React hooks)

- `useStaleness.ts` (created) — single 28-line hook; useState+useEffect+setInterval; thresholds as module-level constants.
- `useWebSocket.ts` (created) — wraps WsClient; two useEffects (one for connection lifecycle keyed on url, one for state-machine tick keyed on lastHeartbeatMs+snapshot). `applyEvent` helper appends to client-side ring buffer with 100-event cap mirroring server.
- `__tests__/useStaleness.test.tsx` (created) — 7 cases: delta<30s fresh, delta=0 fresh, delta=35s warning, delta=70s stale, null stale, fresh→warning→stale transition, boundary semantics at exactly 30s/60s.
- `__tests__/useWebSocket.test.tsx` (created) — 6 cases: getAttempts=0 after onopen; testReconnectDelay backoff curve [1s, 2s, 4s, 8s, 16s, 30s-cap]; malformed-JSON drop; connecting→live on snapshot; snapshot retained across server.close(); full DASH-13 cycle (server1→close→server2 on same port→reconnect→live with fresh snapshot).

### `dashboard/src/components/ui/` (shadcn `new-york`)

- `button.tsx` (created) — Button + buttonVariants (default/destructive/outline/secondary/ghost/link × default/sm/lg/icon); asChild via `@radix-ui/react-slot`.
- `badge.tsx` (created) — Badge + badgeVariants (default/secondary/destructive/outline).
- `card.tsx` (created) — Card/CardHeader/CardTitle/CardDescription/CardContent/CardFooter forward-refs.
- `tooltip.tsx` (created) — TooltipProvider/Tooltip/TooltipTrigger/TooltipContent re-exports from `@radix-ui/react-tooltip`.
- `skeleton.tsx` (created) — single animate-pulse rounded-md bg-muted div.
- `separator.tsx` (created) — Separator wrapping `@radix-ui/react-separator` with horizontal/vertical class branching.

### `dashboard/src/components/layout/` (sticky header subcomponents)

- `Header.tsx` (created) — sticky 1280px-max-width header; flex justify-between with H1 + controls cluster.
- `RelayStatusPill.tsx` (created) — switch on WsState → Badge with cyan/amber/rose toneClass + LOCKED copy strings.
- `GlobalStalenessPill.tsx` (created) — derives min(oracle last_updated_ms, vault last_updated_ms) → StalenessPill compact mode.

### `dashboard/src/components/primitives/` (reusable building blocks)

- `StalenessPill.tsx` (created) — useStaleness → Badge with 'LIVE'/'STALE' text + cyan/amber/rose tones + optional date-fns relative-time caption.
- `TxDigestLink.tsx` (created) — truncateDigest + Sui Explorer link + clipboard copy with copy-on-click feedback Tooltip.
- `NumericValue.tsx` (created) — `font-mono tabular-nums` wrapper for stat-block numerics.

### `dashboard/src/components/__tests__/` (vitest component tests)

- `StalenessPill.test.tsx` (created) — 6 cases: fresh→cyan+LIVE, warning→amber+STALE, stale→rose+STALE, null→rose+STALE+no-data-yet caption, typography (uppercase+tracking-wider), compact mode omits caption.
- `RelayStatusPill.test.tsx` (created) — 6 cases: live→cyan+LIVE, connecting→cyan+CONNECTING, reconnecting (no countdown)→amber+RECONNECTING, reconnecting (with countdown=4)→amber+'RECONNECTING IN 4S', down→rose+RELAY DOWN, typography.

### `dashboard/src/` (App + scaffold)

- `App.tsx` (modified) — replaced Wave-0 placeholder header with `<Header wsState snapshot />` consuming `useWebSocket(env.relayWsUrl)`; preserved 7 section placeholders; added RELAY DOWN inline alert.

### Root + Wave-0

- `dashboard/package.json` (modified) — added @radix-ui/react-tooltip/separator/slot peer deps + ws + @types/ws devDeps.
- `pnpm-lock.yaml` (modified) — regenerated to include the new peer deps.
- `dashboard/src/components/ui/.gitkeep` (deleted) — no longer needed; six shadcn primitives now resolve the `@/components/ui` alias.

## Decisions Made

- **Shadcn primitives written manually over `npx shadcn add` CLI** (key-decision #1). The CLI is interactive on Windows PowerShell and the iter-1 plan checker flagged batch-vs-individual non-determinism. We write the canonical `new-york` template verbatim with attribution comments citing the source URL and regenerate command. components.json registry contract from Wave 0 is preserved so a future operator running `npx shadcn add ... --overwrite` produces byte-identical files. This is the standard practice when shadcn CLI flakiness is a concern (see shadcn docs).
- **Real-server vitest pattern for useWebSocket** (key-decision #2). Mocking WebSocket would have isolated the test from the wire protocol Plan 04-02 produces. Instead we run a real `ws.WebSocketServer` on ephemeral port 0; jsdom's built-in WebSocket talks to it over TCP. Test runtime is ~5s for the full DASH-13 reconnect cycle — acceptable given the verification value.
- **Snapshot retention across reconnect** (key-decision #3). The no-white-screen guarantee is the load-bearing UX promise for DASH-13. Implementation: setSnapshot is called only on `{type:'snapshot'}` frames or `{type:'event'}` frames; the state machine flip to `'reconnecting'`/`'down'` happens via the heartbeat-age useEffect WITHOUT touching the snapshot ref. Panels keep rendering stale data; stale borders + pills communicate the freshness state.
- **Public TEST-ONLY observers on WsClient** (key-decision #4). `getAttempts()` and `testReconnectDelay()` are exposed publicly so unit tests can verify the backoff curve without timing real reconnects. Each carries a JSDoc "Test-only" annotation; production callers should ignore. The alternative (package-private + only integration coverage) would have left the formula untested if a refactor regressed it.
- **GlobalStalenessPill uses Number() for time-delta math** (key-decision #5). u64-as-string is decoded via Number() here because timestamps fit under 2^53 (year 9000 headroom) and JS Date arithmetic is Number-typed. format.ts upholds BigInt discipline for monetary fields. Documented as the explicit exception.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] format.ts negative-value branch**

- **Found during:** Task 1 (writing format.ts)
- **Issue:** Plan body's `bigintToDisplay` snippet does not handle negative bigint values. If a future caller passes a negative i64 (e.g. a hedge cost that flips sign), `value / divisor` truncates toward zero in JS BigInt, but `value % divisor` would carry a misleading sign, and the padded fractional string would be malformed.
- **Fix:** Added an `negative = value < 0n` guard up front; `abs = negative ? -value : value`; format the absolute value then apply `-scaled` if negative before passing to `fmt.format`. Pure correctness fix; no scope creep.
- **Files modified:** `dashboard/src/lib/format.ts`
- **Verification:** typecheck clean; formatBps still handles negative bps inputs cleanly.
- **Committed in:** `6b6782c` (Task 1 commit)

**2. [Rule 2 - Critical] WsClient construction failure path**

- **Found during:** Task 2 (writing wsClient.ts)
- **Issue:** `new WebSocket(url)` can throw synchronously on certain invalid URLs (jsdom under vitest is particularly strict). If the constructor throws, the `connect()` method previously left `this.ws` undefined AND never scheduled a reconnect — the client would silently never recover.
- **Fix:** Wrapped `this.ws = new WebSocket(this.url)` in try/catch; on catch, call `this.scheduleReconnect()` to enter the backoff loop. Matches the spirit of "treat all connection failures the same way" from RESEARCH Pattern 4.
- **Files modified:** `dashboard/src/lib/wsClient.ts`
- **Verification:** useWebSocket connecting→live test still passes; manual smoke test with a bogus URL shows the client logs nothing and quietly retries.
- **Committed in:** `9f6ae19` (Task 2 commit)

**3. [Rule 1 - Bug] StalenessPill caption-text rendering when null**

- **Found during:** Task 3 (writing StalenessPill component test)
- **Issue:** Plan body specifies caption = `formatDistanceToNow(lastUpdatedMs, { addSuffix: true })` UNCONDITIONALLY. When `lastUpdatedMs == null`, that call throws ("Invalid time value") because date-fns receives undefined.
- **Fix:** Branched the caption derivation: `lastUpdatedMs == null ? 'no data yet' : formatDistanceToNow(lastUpdatedMs, ...)`. The plan body actually shows this branch already in the code snippet but the file we landed needed the same logic. Confirmed via the "null caption" test case.
- **Files modified:** `dashboard/src/components/primitives/StalenessPill.tsx`
- **Verification:** All 6 StalenessPill component tests pass.
- **Committed in:** `a5c26d5` (Task 3 commit)

**4. [Rule 3 - Blocking] format.ts grouping/decimal-pad arithmetic**

- **Found during:** Task 1 (mental trace of bigintToDisplay)
- **Issue:** Plan body snippet uses `padStart(divisor.toString().length - 1, '0')`. For DUSDC divisor `1_000_000n` this gives `padStart(6, '0')` which is correct (6 fractional digits). For NAV_SCALE `1_000_000_000n` it gives `padStart(9, '0')`. But the value passed to `Number(`${whole}.${fracPadded}`)` then gets re-formatted with `maximumFractionDigits: 6` — so NAV values lose precision past 6 fractional digits at display. This is the documented Intl.NumberFormat behavior; the display contract from UI-SPEC §Numeric formatting is 2-6 fractional digits.
- **Fix:** Acceptable as-is; documented inline. NAV displays at 2-6 fractional digits (which matches UI-SPEC numeric format); the lossy cast happens AFTER bigint→string round-trip, so internal arithmetic stays exact and only the display is bounded.
- **Files modified:** `dashboard/src/lib/format.ts` (documentation comment only)
- **Verification:** formatNav(1_500_000_000n) → "1.50" as expected.
- **Committed in:** `6b6782c` (Task 1 commit)

---

**Total deviations:** 4 auto-fixed (2 Rule 3 blocking, 1 Rule 2 critical correctness, 1 Rule 1 bug). All within scope; all fix issues introduced by following the plan body literally; no scope creep into Plans 04-07 territory.
**Impact on plan:** Zero scope shift. Each fix restores the intent described in the must_haves block.

## Issues Encountered

- **CRLF line-ending warnings:** Git on Windows reports `LF will be replaced by CRLF` for every new file. Repository `.gitattributes` should normalize this; warnings do not affect content correctness.
- **Pnpm peer-dep warnings:** Same two from Wave 0 — `@mysten/dapp-kit@1.0.4 → @mysten/slush-wallet@1.0.5` and `@mysten/deepbook-v3@1.3.6` both peer-dep `@mysten/sui@^2.16.2` while we pin `2.16.0` per CLAUDE.md. Non-blocking; APIs we consume are compatible.
- **Build warnings from plotly transitive deps:** `buffer`, `stream`, `assert` externalized for browser; cosmetic noise inherited from `plotly.js` 3.5.1's node-stream peer deps. Vendor chunk strategy (Pitfall 9) isolates plotly so the warnings have no effect on the main bundle.

## Stub Tracking / Known Stubs

- **Section placeholders in App.tsx remain empty.** Intentional — Plans 04-04 (SurfacePanel + ArbCheckerPanel), 04-05 (VaultPanel + BucketGauge + ExposurePanel), 04-06 (WhatIfSimulator), 04-07 (DepositWithdrawPanel + PositionViewer) inject real panels into the `data-section=` slots. The shell renders empty `<section>` elements (no copy, no "coming soon" text); the only visible body content is the optional RELAY DOWN alert.
- **Header `secondsUntilReconnect` prop is unused at App.tsx wiring.** The prop is plumbed through Header → RelayStatusPill for downstream use (Plan 04-07 may expose a more granular reconnect countdown from a future indexer-server health endpoint), but `App.tsx` does NOT yet pass a value. The RECONNECTING pill renders without the "IN Ns" countdown until a downstream plan wires the timer source. This is intentional; the countdown is a polish surface, not a correctness requirement.
- **`indexer/src/index.ts` Wave-0 placeholder export still present.** Plan 04-02 noted this in its SUMMARY; nothing in Plan 04-03 deletes it. Plans 04-04+ may; not a regression.

These stubs are stage gates for downstream plans, not visible UI emptiness. No misleading copy reaches the user.

## User Setup Required

To exercise the dashboard against a live relay:

1. Copy `dashboard/.env.example` to `dashboard/.env`; the default `VITE_RELAY_WS_URL=ws://localhost:8080` matches `indexer/.env.example`'s default port.
2. `cd indexer && pnpm dev` (Plan 04-02 relay scaffold; runs in snapshot-only mode against the pending TESTNET-DEPLOY.json).
3. `cd dashboard && pnpm dev` (Vite dev server at localhost:5173).
4. Visible behavior: header pill cycles `CONNECTING` → `LIVE` once the WS handshake completes + the snapshot frame arrives. Kill the indexer (`Ctrl+C`); within ~30s the pill flips to `RECONNECTING`; within ~60s to `RELAY DOWN` with the body alert appearing. Restart the indexer; the pill returns to `LIVE` automatically within 1-1.5s of next reconnect attempt.

## Next Phase Readiness

- **Plan 04-04 (SurfacePanel + ArbCheckerPanel):** `useWebSocket(env.relayWsUrl).snapshot.oracles[0]` is the SVI param source. Phase 1 SVI evaluator (`@/lib/svi`) is parity-gated and untouched. shadcn Card primitive is ready for panel containers; StalenessPill consumes `snapshot.oracles[0].last_updated_ms` directly.
- **Plan 04-05 (Vault panels):** `useWebSocket().snapshot.vault` is null in Plan 04-02 until Plan 03 (vault-state poller) wires getObject. Plan 04-05 should render the "Waiting on first vault snapshot" empty state (UI-SPEC §Empty states) when vault is null.
- **Plan 04-06 (WhatIfSimulator):** shadcn Slider primitive must be added by Plan 04-06 (`npx shadcn add slider` or write manually following the existing pattern). The simulator reads from `snapshot.oracles` + open positions; both are already in the wire surface.
- **Plan 04-07 (DepositWithdrawPanel + PositionViewer):** `<ConnectButton />` is already wired in Header; `useCurrentAccount` from `@mysten/dapp-kit` gives wallet state. shadcn Tabs + Dialog + Input + Table primitives must be added by Plan 04-07.

## Self-Check: PASSED

Verified before writing this SUMMARY:

- `dashboard/src/lib/utils.ts` exports `cn` consuming ClassValue: FOUND
- `dashboard/src/lib/format.ts` exports formatDusdc + formatNav + formatShares + formatBps + truncateDigest: FOUND
- `dashboard/src/lib/types.ts` exports WsMessage + FullSnapshot + WsState + Staleness: FOUND
- `dashboard/src/lib/wsClient.ts` has `1000 * 2 ** this.attempts` backoff math: FOUND (line 105)
- `dashboard/src/lib/wsClient.ts` has `Math.random()` jitter (2 occurrences — scheduleReconnect + testReconnectDelay): FOUND (lines 63, 106)
- `dashboard/src/hooks/useWebSocket.ts` exports useWebSocket: FOUND
- `dashboard/src/hooks/useStaleness.ts` exports useStaleness: FOUND
- `dashboard/src/components/ui/{button,badge,card,tooltip,skeleton,separator}.tsx` all present: FOUND (6/6)
- `dashboard/src/components/layout/Header.tsx` imports ConnectButton from @mysten/dapp-kit: FOUND
- `dashboard/src/components/layout/RelayStatusPill.tsx` consumes WsState: FOUND
- `dashboard/src/components/primitives/StalenessPill.tsx` has 'tracking-wider' for UI-SPEC typography: FOUND
- `cd dashboard && pnpm typecheck`: clean (no errors)
- `cd dashboard && pnpm test`: 336/336 passing (8 test files; 311 Phase 1 + 13 hooks + 12 components)
- `cd dashboard && pnpm build`: dist/ produced with vendor (134KB gzipped 43KB) + plotly (6.68KB gzipped 2.64KB) chunks isolated per Pitfall 9
- Phase 1 SVI lib `git diff HEAD -- dashboard/src/lib/{svi,phi,isqrt,ln,math,phi_coefficients,strategy_constants,arb_checker,parity_runner}.ts`: empty (0 lines)
- Forbidden-token grep on Phase 1 evaluator: clean (no Number/Math.X regressions)
- Commit `6b6782c` (Task 1 feat): present in `git log`
- Commit `9f6ae19` (Task 2 feat): present in `git log`
- Commit `a5c26d5` (Task 3 feat): present in `git log`

---

*Phase: 04-plp-risk-studio-dashboard-relay*
*Completed: 2026-05-12*
