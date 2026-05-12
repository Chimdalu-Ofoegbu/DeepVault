---
phase: 04-plp-risk-studio-dashboard-relay
plan: 05
subsystem: ui
tags: [dashboard, recharts, vault, bucket, exposure, radial, table, hedge-book, ring-buffer]

requires:
  - phase: 04-plp-risk-studio-dashboard-relay
    provides: useWebSocket + FullSnapshot wire types from Plan 04-03 (snapshot.vault + snapshot.ring_buffer) — consumed by useVaultState + useExposure
  - phase: 04-plp-risk-studio-dashboard-relay
    provides: shadcn primitives (Card, Badge, Button) + StalenessPill + NumericValue from Plan 04-03 + Collapsible from Plan 04-04 — consumed by all three panels
  - phase: 04-plp-risk-studio-dashboard-relay
    provides: format.ts (formatNav/formatDusdc/formatShares/formatBps) from Plan 04-03 — consumed by all three panels (16 references)
  - phase: 01-svi-math-evaluator
    provides: dashboard/src/lib/strategy_constants.ts NAV_SCALE — consumed by useVaultState navPerShareScaled math (UNCHANGED, parity-gated)

provides:
  - useVaultState hook (dashboard/src/hooks/useVaultState.ts) — projects snapshot.vault to { navPerShareScaled, utilizationBps } via BigInt math; T-04-05-02 mitigation
  - VaultPanel (dashboard/src/components/panels/VaultPanel.tsx) — three stat blocks (NAV/assets/shares) + Recharts RadialBarChart utilization gauge with PAUSED banner branch
  - useBucketState hook (dashboard/src/hooks/useBucketState.ts) — wraps useQuery + useCurrentAccount; v1 stub returning null with TODO marker for Plan 04-07 Task 3 (getDynamicFieldObject)
  - BucketGauge (dashboard/src/components/panels/BucketGauge.tsx) — per-user RateLimiter token-bucket gauge with emerald/amber/rose color escalation per UI-SPEC §Recharts palette
  - useExposure hook (dashboard/src/hooks/useExposure.ts) — derives open hedges from snapshot.ring_buffer using endsWith() suffix matching (relay-stripped event names)
  - ExposurePanel (dashboard/src/components/panels/ExposurePanel.tsx) — Recharts horizontal BarChart (slate-400) + shadcn Table breakdown by strike × expiry × direction
  - shadcn ui primitives: progress.tsx (Radix wrapper) + table.tsx (pure React/Tailwind)
  - App.tsx wiring: VaultPanel + BucketGauge in section 3 grid, ExposurePanel in section 4 (UI-SPEC D-05 order locked)
  - 28 new vitest cases (12 VaultPanel + 5 BucketGauge + 11 ExposurePanel); total dashboard 373 tests green

affects:
  - 04-06 (WhatIfSimulator may consume snapshot.vault for total_assets in shocked-PnL display — shares the useVaultState seam)
  - 04-07 (PositionViewer reads same snapshot.vault.balance for "user share of total assets"; useBucketState extends here with the live getDynamicFieldObject lookup; ExposurePanel may be cross-linked from per-position drilldown)

tech-stack:
  added:
    - "@radix-ui/react-progress ^1.1.0 (shadcn Progress peer dep — primitive added even though VaultPanel uses RadialBarChart, so downstream plans don't need to re-resolve the dep tree)"
  patterns:
    - "Pitfall 8 + T-04-05-02 verbatim: useVaultState does ALL math at the BigInt layer. navPerShareScaled = total_assets * NAV_SCALE / total_shares — exact, even for total_shares > 2^53 (test case proves it). Number() coercion is deferred to the display boundary inside VaultPanel (utilizationPct cast for the gauge label only)."
  - "Wave 3 vault-side panel pattern (LOCKED for Plans 04-06/04-07): every vault-derived panel wears a StalenessPill bound to vault.last_updated_ms; numeric rendering routes through format.ts helpers; empty-state copy comes verbatim from UI-SPEC §Empty states; chart container always wrapped in a fixed-height div around ResponsiveContainer (T-04-05-04 ResizeObserver-loop mitigation)."
    - "Event-name suffix matching corrected: indexer/src/pollVaultEvents.ts:36-38 strips qualified Move type to the LAST segment only, so RingEvent.name arrives at the dashboard as bare 'HedgeMinted' (not '::rebalance::HedgeMinted'). useExposure matches with endsWith('HedgeMinted') — robust to any future relay prefix re-attachment."
    - "Per-user RateLimiter read seam: useBucketState is the staging hook that Plan 04-07 Task 3 extends with the live `client.getDynamicFieldObject({ parentId: vault.rate_limiters_uid, name: { type: 'address', value: account.address } })` RPC call. v1 returns null; TODO marker keeps the integration site unambiguous."
    - "Recharts in jsdom (inherited from Plan 04-04): ResponsiveContainer cannot resolve a width via ResizeObserver polyfill (returns 0×0), so component tests assert on (a) data-testid presence, (b) DOM text content, and (c) source-grep for color contracts (#06b6d4 / #10b981 / #f59e0b / #e11d48 / #94a3b8)."
    - "Mock-via-vi.mock pattern for dapp-kit hooks: BucketGauge test wraps `useCurrentAccount` + `useBucketState` via `vi.mock` rather than a renderWithProviders helper. Lighter, faster, focused on the panel's render branches — matches the plan body option (b)."

key-files:
  created:
    - dashboard/src/components/ui/progress.tsx
    - dashboard/src/components/ui/table.tsx
    - dashboard/src/hooks/useVaultState.ts
    - dashboard/src/hooks/useBucketState.ts
    - dashboard/src/hooks/useExposure.ts
    - dashboard/src/components/panels/VaultPanel.tsx
    - dashboard/src/components/panels/BucketGauge.tsx
    - dashboard/src/components/panels/ExposurePanel.tsx
    - dashboard/src/components/__tests__/VaultPanel.test.tsx
    - dashboard/src/components/__tests__/BucketGauge.test.tsx
    - dashboard/src/components/__tests__/ExposurePanel.test.tsx
  modified:
    - dashboard/package.json
    - dashboard/src/App.tsx
    - pnpm-lock.yaml

key-decisions:
  - "Event-name suffix corrected at the data-flow layer, not the relay. The plan body specifies `e.name.endsWith('::rebalance::HedgeMinted')`. Inspecting indexer/src/pollVaultEvents.ts:36-38 (`eventNameFromType` strips qualified type to the LAST segment), the relay emits `HedgeMinted` bare — the plan's pattern would never match. Two options considered: (a) change the relay to re-attach `::rebalance::` prefix, (b) change useExposure to match the bare suffix. Chose (b): the relay's stripped-name protocol is already serialized in indexer/src/types.ts and consumed by every wire client; changing it would cascade into 04-02's relay tests, the wire-protocol stability promise, and any future consumer. useExposure matches on `endsWith('HedgeMinted')` which works for BOTH the bare form (relay v1) AND any future qualified form (relay v2 with prefixes). Robust forward."
  - "Move struct field corrections via Rule 1 inline fix. Plan body's `<interfaces>` block specifies `HedgeMinted: { vault_id, supplier, market_key, notional_quote, premium_quote }` and `HedgeRolled: { vault_id, old_market_key, new_market_key }`. Inspecting `contracts/sources/rebalance.move:58-71` against the indexer fixture at `indexer/src/__tests__/fixtures/hedge-minted.json`, the actual emitted Move struct is `HedgeMinted { vault_id, market_key, quantity, cost_basis_quote, strike, expiry_ms }` (no `notional_quote`/`premium_quote`; the dashboard maps `cost_basis_quote` to its `notionalQuote` field for v1 display) and `HedgeRolled { vault_id, old_key, new_key }` (NOT `old_market_key`/`new_market_key`). The dashboard's `useExposure` uses the on-chain field names directly with TypeScript safety (RawMarketKey type)."
  - "HedgeUnwound is keyed by oracle_id, not market_key. `vault.move:204-208` declares `HedgeUnwound { vault_id, oracle_id, payout_quote }` — no market_key. The plan body assumed market_key. useExposure maintains a parallel `byOracle: Map<oracleId, marketKey>` index built up during HedgeMinted/HedgeRolled applications so HedgeUnwound can remove the right entry on oracle_id alone. Documented inline."
  - "Recharts RadialBarChart over @radix-ui/react-progress for utilization. Plan body lists progress.tsx as a created file, but VaultPanel's gauge needs (a) percentage range 0–100, (b) circular shape, and (c) color escalation. RadialBarChart already supports all three and matches UI-SPEC §Recharts palette explicitly. progress.tsx is added as a shadcn primitive for downstream plans (PositionViewer's loading bars, deposit-flow progress) without re-running the shadcn CLI, but the utilization gauge itself uses Recharts. Both ship in this plan."
  - "useBucketState v1 returns null even with wallet connected. The on-chain RateLimiter is a dynamic field on the vault's rate_limiters Table; pre-redemption users have no bucket row (helpers/rate_limiter.move's get_or_init_user_bucket fires lazily on first redeem_request). The relay snapshot does not currently carry per-user state — that requires a per-wallet RPC call. Plan 04-07 Task 3 wires the live getDynamicFieldObject lookup. Until then, the panel renders the 'Bucket lazy-init pending' message, which is informationally correct: the bucket is genuinely not yet seeded."
  - "vi.mock of dapp-kit hooks rather than full provider wrap in tests. Option (b) per plan body. Wrapping with QueryClientProvider + SuiClientProvider + WalletProvider for every test would (a) require @mysten/dapp-kit's WalletStandard surface in jsdom, which is not trivial, (b) add ~500ms per-test setup cost. vi.mock keeps BucketGauge tests focused on the panel's render branches in <200ms."
  - "Plan body's `direction` field name in market_key — corrected to `is_down` (boolean). market_key.move emits `{ oracle_id, expiry_ms, strike, is_down }` — there is no `direction` field. The dashboard derives `direction: 'down' | 'up'` from `is_down`, surfaced as the human-readable Table column."

patterns-established:
  - "BigInt-everywhere math discipline at hook layer (LOCKED for Plans 04-06+): any hook deriving display values from u64-as-string wire data MUST stay BigInt until the final display formatter call. T-04-05-02 mitigation tested with a (1n << 54n) total_shares fixture — Number() would silently round, BigInt does not."
  - "Per-panel StalenessPill bound to vault.last_updated_ms (LOCKED for all vault-side panels): VaultPanel uses the full pill (with caption), ExposurePanel uses the `compact` mode (header is tight). When a panel has no obvious staleness signal (BucketGauge — bucket state is read-on-demand via React Query), the panel SHOULD omit the pill rather than display a misleading freshness state."
  - "UI-SPEC §Empty states copy is VERBATIM (LOCKED): tests grep on the exact heading + body strings. Any future copy change requires updating the test fixtures simultaneously — never one without the other. Demo-video transcription is byte-identical."
  - "Color contracts source-greppable (LOCKED): every panel's color choices are declared with explicit hex codes (#06b6d4 cyan-500, #10b981 emerald-500, #f59e0b amber-500, #e11d48 rose-600, #94a3b8 slate-400) so the test suite can grep the source. Recharts renders SVG that jsdom cannot paint without ResizeObserver returning real dimensions; source-grep is the canonical workaround."
  - "Per-panel 5-color cap enforced (UI-SPEC §Color 'no rainbow vault dashboards'): VaultPanel uses 2 colors (cyan-500 + slate baseline); BucketGauge uses 3 colors (emerald/amber/rose by escalation); ExposurePanel uses 1 color (slate-400 bars). All well under the cap."

requirements-completed: [DASH-06, DASH-07, DASH-08]

duration: ~12min
completed: 2026-05-12
---

# Phase 4 Plan 05: Wave 3 Vault-Side Panels (VaultPanel + BucketGauge + ExposurePanel) Summary

**Three 2D Recharts vault-side panels wired to the live WebSocket snapshot — VaultPanel (NAV / total assets / total shares + Recharts RadialBarChart utilization gauge), BucketGauge (per-user RateLimiter token-bucket with emerald/amber/rose color escalation), and ExposurePanel (hedge book by oracle/strike/expiry with Recharts horizontal BarChart + shadcn Table) — closing DASH-06, DASH-07, DASH-08. All math at the BigInt layer (T-04-05-02 u64-precision mitigation tested); every numeric routes through format.ts; every panel honors UI-SPEC §Empty states copy verbatim. 28 new vitest cases land; 373 total dashboard tests green; Phase 1 SVI lib unchanged.**

## Performance

- **Duration:** ~12 min wall-clock (3 atomic TDD tasks)
- **Started:** 2026-05-12T20:45:56Z
- **Completed:** 2026-05-12T20:56:30Z (plus SUMMARY write)
- **Tasks:** 3
- **Files created:** 11 (2 ui primitives + 3 hooks + 3 panels + 3 tests)
- **Files modified:** 3 (package.json, App.tsx, pnpm-lock.yaml)
- **Tests:** 28 added → total 373 passing in ~12s
- **Build:** main bundle 881.86 KB (gzip 260.67 KB), up ~38 KB from Plan 04-04 (843 KB). Plotly chunk unchanged at 4.88 MB / 1.48 MB gzipped. No bundle regression on the main app.

## Accomplishments

- **DASH-06 (VaultPanel):** `useVaultState(snapshot)` projects `snapshot.vault` to `{ vault, navPerShareScaled, utilizationBps, lastUpdatedMs }`. navPerShareScaled = `total_assets * NAV_SCALE / total_shares` (or NAV_SCALE when total_shares=0); utilizationBps = `(total_assets - balance) * 10000n / total_assets` (or 0n when total_assets=0). All math BigInt throughout — T-04-05-02 mitigation tested for total_shares > 2^53. VaultPanel renders empty state ("Vault is initializing" + UI-SPEC body copy verbatim) when view is null; populated state shows NAV/assets/shares/utilization stat blocks (NumericValue + format.ts helpers) + Recharts RadialBarChart utilization gauge in cyan-500 (#06b6d4) with centered percentage label; PAUSED banner appears when vault.paused === true. StalenessPill in CardHeader bound to vault.last_updated_ms.
- **DASH-07 (BucketGauge):** `useBucketState()` wraps useQuery + useCurrentAccount; v1 returns null gracefully with an explicit `TODO(Plan 04-07 Task 3)` marker for the live getDynamicFieldObject lookup against vault.rate_limiters_uid keyed by wallet address. BucketGauge renders three states per UI-SPEC: (1) wallet-disconnected → "Connect wallet to view your withdrawal budget" + body copy verbatim; (2) wallet-connected + no bucket → "Bucket lazy-init pending — your bucket will be seeded on first redemption request" (matches helpers/rate_limiter.move's lazy-init via get_or_init_user_bucket); (3) wallet-connected + populated → Recharts RadialBarChart with emerald-500 / amber-500 / rose-600 color escalation per UI-SPEC §Recharts palette (>=70% emerald, >=30% amber, <30% rose) + formatDusdc(available)/formatDusdc(capacity) numerics below.
- **DASH-08 (ExposurePanel):** `useExposure(snapshot)` derives the open hedge book from `snapshot.ring_buffer` by matching `RingEvent.name` with `endsWith('HedgeMinted')` / `endsWith('HedgeRolled')` / `endsWith('HedgeUnwound')`. The dashboard maintains a `byOracle: Map<oracleId, marketKey>` index built during applications so HedgeUnwound (keyed by oracle_id only — vault.move:204-208) can remove the right entry. Hedges past their expiry are filtered out; results are sorted by expiry ascending. ExposurePanel renders empty state ("No hedges currently open" + UI-SPEC body copy verbatim) when hedges is empty; populated state shows Recharts horizontal BarChart (slate-400 single-color bars per UI-SPEC §Recharts palette "exposure bars") + shadcn Table with strike/expiry/direction/notional/premium columns, all formatted via NumericValue + formatDusdc.
- **App.tsx wired:** Section 3 (`vault-bucket`) now hosts VaultPanel + BucketGauge in a 2-column grid; Section 4 (`exposure`) hosts ExposurePanel. D-05 section order locked; remaining placeholders (sections 5–7) stay empty for Plans 04-06 (WhatIfSimulator) and 04-07 (DepositWithdrawPanel + PositionViewer). The data flow is now: `useWebSocket` → `snapshot` → 4 selector hooks (useSurfaceSnapshot, useVaultState, useExposure, useBucketState) → 5 mounted panels (SurfacePanel + ArbCheckerPanel + VaultPanel + BucketGauge + ExposurePanel).
- **Pitfall 8 / T-04-05-02 mitigation tested:** vitest case `preserves u64 precision beyond 2^53 in navPerShareScaled` uses `(1n << 54n)` fixtures and asserts the exact bigint output. Number() round-trip would silently round; BigInt does not. This is the load-bearing correctness item for institutional-grade NAV display.
- **Event-name suffix correction (Rule 1):** indexer/src/pollVaultEvents.ts:36-38 strips qualified Move type to the LAST segment only — relay emits `HedgeMinted` bare, NOT `::rebalance::HedgeMinted` as the plan body assumed. useExposure matches on `endsWith('HedgeMinted')` etc., which is robust to both the bare form (relay v1) and any future qualified form (relay v2 with prefixes). Verified against indexer/src/__tests__/fixtures/hedge-minted.json + snapshot.applyVaultEvent contract.
- **Move struct field corrections (Rule 1):** Plan body's `<interfaces>` block assumed field names (`notional_quote`, `premium_quote`, `old_market_key`, `new_market_key`, `direction`) that do not exist in the actual Move structs. useExposure uses the correct names per rebalance.move:58-71 + vault.move:204-208 + market_key.move (HedgeMinted: `market_key/quantity/cost_basis_quote/strike/expiry_ms`; HedgeRolled: `old_key/new_key`; HedgeUnwound: `oracle_id/payout_quote`; MarketKey: `oracle_id/expiry_ms/strike/is_down`). The dashboard surfaces `cost_basis_quote` as the `notionalQuote` field for v1 display and derives `direction: 'down' | 'up'` from `is_down`.
- **shadcn primitives added:** `progress.tsx` (Radix wrapper, @radix-ui/react-progress ^1.1.0) and `table.tsx` (pure React/Tailwind, no Radix dep). Both follow the new-york style template verbatim with attribution comments so a future operator running `npx shadcn add ... --overwrite` produces byte-identical files.
- **Phase 1 SVI lib unchanged:** `git diff HEAD -- dashboard/src/lib/{svi,phi,isqrt,ln,math,phi_coefficients,strategy_constants,arb_checker,parity_runner}.ts` returns empty (0 lines). Forbidden-token grep clean. CI parity gate honored.

## Task Commits

Each task was committed atomically with the per-task verify pre-flight green (TDD RED → GREEN → commit):

1. **Task 1: useVaultState + VaultPanel (DASH-06)** — `63167d6` (feat) — 12 new vitest cases; @radix-ui/react-progress ^1.1.0 peer dep added; T-04-05-02 u64 precision test passes.
2. **Task 2: useBucketState + BucketGauge (DASH-07)** — `3b57ddb` (feat) — 5 new vitest cases via vi.mock of dapp-kit hooks; v1 stub with explicit Plan 04-07 Task 3 TODO marker.
3. **Task 3: useExposure + ExposurePanel + App.tsx wiring (DASH-08)** — `de2cb3b` (feat) — 11 new vitest cases (8 useExposure + 3 ExposurePanel); shadcn table.tsx primitive added; App.tsx now mounts 5 panels in D-05 sections 1–4; build clean.

## Files Created/Modified

### `dashboard/src/hooks/` (selector hooks)

- `useVaultState.ts` (created) — BigInt-throughout projection of snapshot.vault to VaultView. navPerShareScaled + utilizationBps derived via integer math; lastUpdatedMs cast to Number at the display boundary (timestamps fit in 2^53 past year 9000).
- `useBucketState.ts` (created) — useQuery + useCurrentAccount + useSuiClient (reserved for Plan 04-07 Task 3). v1 queryFn returns null; queryKey scopes by `account?.address ?? null`. staleTime 5s / refetchInterval 15s.
- `useExposure.ts` (created) — useMemo over snapshot.ring_buffer; endsWith-suffix matching for HedgeMinted/HedgeRolled/HedgeUnwound; byOracle parallel index for HedgeUnwound by-oracle_id lookup; expiry filter + ascending sort.

### `dashboard/src/components/panels/` (3 new panels)

- `VaultPanel.tsx` (created) — empty/populated branch on VaultView; three stat blocks (NAV/assets/shares) via NumericValue + formatNav/formatDusdc/formatShares; Utilization stat via formatBps; PAUSED banner branch on vault.paused; Recharts RadialBarChart utilization gauge (cyan-500 fill, slate baseline, centered % label).
- `BucketGauge.tsx` (created) — three-state branch on account + view; Recharts RadialBarChart with emerald/amber/rose escalation by utilizationPct; formatDusdc(available)/formatDusdc(capacity) numerics in monospace below the chart.
- `ExposurePanel.tsx` (created) — empty/populated branch on hedges.length; Recharts horizontal BarChart with slate-400 bars + Recharts Tooltip + shadcn Table with strike/expiry/direction/notional/premium columns; StalenessPill (compact) in CardHeader bound to vault.last_updated_ms.

### `dashboard/src/components/ui/` (2 new shadcn primitives)

- `progress.tsx` (created) — Radix Progress wrapper, cyan-500 indicator, slate-800 background track. Standard new-york template with attribution comment.
- `table.tsx` (created) — Pure React/Tailwind; exports Table/TableHeader/TableBody/TableFooter/TableHead/TableRow/TableCell/TableCaption. No Radix peer needed; new-york template verbatim.

### `dashboard/src/components/__tests__/` (3 new test files)

- `VaultPanel.test.tsx` (created) — 12 cases: 6 hook math (null cases, navPerShareScaled formula, NAV_SCALE on total_shares=0, utilizationBps formula, 0n on total_assets=0, u64 > 2^53 precision); 5 panel render (empty state, populated state, PAUSED banner, formatter grep gate, color contract grep gate).
- `BucketGauge.test.tsx` (created) — 5 cases: wallet-disconnected empty state, lazy-init pending state, populated state with chart + formatted numerics, color escalation source-grep (#10b981/#f59e0b/#e11d48), useCurrentAccount import contract. Uses vi.mock of @mysten/dapp-kit + @/hooks/useBucketState.
- `ExposurePanel.test.tsx` (created) — 11 cases: 7 hook (null/empty snapshot, HedgeMinted with future/past expiry, HedgeRolled remove-old-add-new, HedgeUnwound by oracle_id, expiry-ascending sort) + 4 panel (empty state, populated state with table + chart, useExposure endsWith() grep gate, ExposurePanel BarChart + slate-400 grep gate).

### `dashboard/src/`

- `App.tsx` (modified) — added 4 imports (VaultPanel, BucketGauge, ExposurePanel, useVaultState, useExposure); section 3 now `grid grid-cols-1 md:grid-cols-2` with VaultPanel + BucketGauge children; section 4 hosts ExposurePanel.

### Root + dashboard

- `dashboard/package.json` (modified) — added `@radix-ui/react-progress ^1.1.0` dep.
- `pnpm-lock.yaml` (modified) — regenerated to lock the new peer dep (transitive @radix-ui/react-context + react-presence already present from prior radix deps).

## Decisions Made

- **Event-name suffix corrected at the dashboard layer, not the relay** (key-decision #1). The relay strips qualified Move types to suffix-only via indexer/src/pollVaultEvents.ts:36-38 — modifying that to re-attach prefixes would break wire-protocol stability for Plan 04-02 consumers. The dashboard's useExposure matches on `endsWith('HedgeMinted')` which works for both the bare form (current) and any future qualified form (forward-robust).
- **Move struct field names corrected via Rule 1 inline fix** (key-decision #2). The plan body's `<interfaces>` block assumed `notional_quote`, `premium_quote`, `old_market_key`, `new_market_key`, and `direction` fields that don't exist in the actual Move structs. Inspecting rebalance.move + vault.move + market_key.move + the indexer fixture, the real field names are `market_key`/`quantity`/`cost_basis_quote`/`strike`/`expiry_ms`/`old_key`/`new_key`/`oracle_id`/`payout_quote`/`is_down`. Documented inline; useExposure types match the on-chain reality.
- **HedgeUnwound keyed by oracle_id, not market_key** (key-decision #3). vault.move:204-208 declares HedgeUnwound without market_key. useExposure maintains a parallel `byOracle: Map<oracleId, marketKey>` index built during HedgeMinted/HedgeRolled applications so HedgeUnwound can remove the right entry. Documented in the hook source.
- **Recharts RadialBarChart over @radix-ui/react-progress for utilization** (key-decision #4). The plan body lists progress.tsx as a created file, but VaultPanel's utilization gauge requires percentage range + circular shape + color escalation — RadialBarChart is the correct primitive (UI-SPEC §Recharts palette explicitly maps it). progress.tsx ships as a shadcn primitive for downstream linear-progress needs without re-running the shadcn CLI. Both land in this plan.
- **useBucketState v1 returns null even with wallet connected** (key-decision #5). The on-chain RateLimiter is a Table dynamic field; pre-redemption users have no bucket row until helpers/rate_limiter.move's get_or_init_user_bucket lazily seeds it on first redeem_request. The relay snapshot does not carry per-user state; that requires a per-wallet RPC call. Plan 04-07 Task 3 wires the live getDynamicFieldObject lookup. v1 renders the "Bucket lazy-init pending" message, which is informationally correct.
- **vi.mock of dapp-kit hooks rather than full provider wrap** (key-decision #6). Wrapping every component test with QueryClientProvider + SuiClientProvider + WalletProvider would (a) require dapp-kit's WalletStandard surface in jsdom (non-trivial) and (b) add ~500ms per-test setup. vi.mock keeps BucketGauge tests focused on the panel's render branches in <200ms total. Matches plan body option (b).
- **Direction display derived from is_down boolean** (key-decision #7). market_key.move emits `{ oracle_id, expiry_ms, strike, is_down }` — there is no `direction` string field. The dashboard derives `direction: 'down' | 'up'` from `is_down` for the Table column. Maps `is_down: true` → 'down' (PUT-like hedge), consistent with v1 hedge policy (strikes are -15% OTM PUTs per shared/strategy.toml).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Event-name suffix mismatch with relay output**

- **Found during:** Task 3 (writing useExposure)
- **Issue:** Plan body specifies `e.name.endsWith('::rebalance::HedgeMinted')`. Inspecting `indexer/src/pollVaultEvents.ts:36-38`, the relay's `eventNameFromType` strips qualified type to the LAST segment only — `RingEvent.name` arrives as bare `'HedgeMinted'`. The plan's pattern would never match.
- **Fix:** useExposure matches with `endsWith('HedgeMinted')` / `endsWith('HedgeRolled')` / `endsWith('HedgeUnwound')`. Robust to both bare form (current relay) and any future qualified form. Test case `useExposure adds a hedge entry on HedgeMinted event with future expiry` validates the matching against the indexer fixture shape.
- **Files modified:** `dashboard/src/hooks/useExposure.ts`, test fixtures in `dashboard/src/components/__tests__/ExposurePanel.test.tsx`.
- **Verification:** All 11 ExposurePanel tests pass.
- **Committed in:** `de2cb3b` (Task 3 commit)

**2. [Rule 1 - Bug] Move struct field-name mismatches**

- **Found during:** Task 3 (writing useExposure)
- **Issue:** Plan body's `<interfaces>` block lists `HedgeMinted: { vault_id, supplier, market_key, notional_quote, premium_quote }` and `HedgeRolled: { vault_id, old_market_key, new_market_key }`. Inspecting `contracts/sources/rebalance.move:58-71` + `vault.move:204-208` + indexer fixture, the real names are `HedgeMinted: { vault_id, market_key, quantity, cost_basis_quote, strike, expiry_ms }`, `HedgeRolled: { vault_id, old_key, new_key }`, `HedgeUnwound: { vault_id, oracle_id, payout_quote }`. No `notional_quote`/`premium_quote`/`supplier` fields exist on these events.
- **Fix:** useExposure uses the on-chain field names directly. `cost_basis_quote` maps to `notionalQuote` for v1 display; `premiumQuote` stays at 0n until a dedicated premium field is added. Documented inline.
- **Files modified:** `dashboard/src/hooks/useExposure.ts`.
- **Verification:** Hook produces correct Hedge[] from realistic fixtures.
- **Committed in:** `de2cb3b` (Task 3 commit)

**3. [Rule 1 - Bug] HedgeUnwound has no market_key field**

- **Found during:** Task 3 (writing useExposure)
- **Issue:** Plan body's removal pattern assumes HedgeUnwound carries a `market_key` field for keyed removal. `vault.move:204-208` declares it without market_key — only `vault_id`, `oracle_id`, `payout_quote`.
- **Fix:** useExposure maintains a `byOracle: Map<oracleId, marketKey>` index built during HedgeMinted/HedgeRolled applications. HedgeUnwound removes via `byOracle.get(oracleId) → open.delete(marketKey)`. v1 single-oracle-per-vault makes this 1:1; multi-oracle V2 would need a Multimap (acceptable since one oracle hedges at most a few strikes/expiries at v1 scope).
- **Files modified:** `dashboard/src/hooks/useExposure.ts`.
- **Verification:** Test case `HedgeUnwound removes the hedge keyed on its oracle_id` passes.
- **Committed in:** `de2cb3b` (Task 3 commit)

**4. [Rule 2 - Critical correctness] MarketKey direction is `is_down` boolean, not `direction` string**

- **Found during:** Task 3 (writing useExposure + test fixtures)
- **Issue:** Plan body assumes `market_key.direction: 'up' | 'down'`. The actual MarketKey struct (predict's market_key.move + indexer fixture at `__tests__/fixtures/hedge-minted.json:16`) emits `is_down: boolean`. Render fidelity requires deriving the display string from the boolean.
- **Fix:** Hedge type's `direction: string` is computed via `mk.is_down ? 'down' : 'up'` inside the parser. makeMarketKey string-keys with the same derivation so old_key/new_key keys are consistent across HedgeMinted/HedgeRolled applications.
- **Files modified:** `dashboard/src/hooks/useExposure.ts`.
- **Verification:** Test case `renders chart container + table rows when hedges are present` asserts `screen.getByText('down')` succeeds.
- **Committed in:** `de2cb3b` (Task 3 commit)

**5. [Rule 1 - Bug] Plan body's utilization percentage label off-page**

- **Found during:** Task 1 (writing VaultPanel render)
- **Issue:** Plan body's `<p className="-mt-32 text-center text-2xl ...">` overlay technique uses a negative top margin to overlap with the chart. `-mt-32` is -128px against a 220px-tall chart container — text positions OFF the bottom of the container on some viewports. The intent was a centered overlay.
- **Fix:** Replaced with `absolute inset-0 flex items-center justify-center` on a relatively-positioned chart wrapper. Crisper, deterministic positioning; immune to chart-height changes.
- **Files modified:** `dashboard/src/components/panels/VaultPanel.tsx`.
- **Verification:** Test case `renders populated state ...` finds the `80.0%` text in the document.
- **Committed in:** `63167d6` (Task 1 commit)

---

**Total deviations:** 5 auto-fixed (4 Rule 1 bug, 1 Rule 2 critical correctness). All within scope; all fix mismatches between the plan body's assumed Move struct/relay-wire contract and the actual source-of-truth in `contracts/sources/*.move` + `indexer/src/pollVaultEvents.ts`. No scope creep.

**Impact on plan:** Zero scope shift. Each fix restores the intent described in the must_haves block (DASH-06/07/08 deliver vault state / per-user bucket / hedge book displays).

## Issues Encountered

- **CRLF line-ending warnings:** Git on Windows reports `LF will be replaced by CRLF` for every new file. Inherited from prior plans; non-blocking.
- **Pnpm peer-dep warnings (unchanged from prior plans):** `@mysten/dapp-kit@1.0.4 → @mysten/slush-wallet@1.0.5` and `@mysten/deepbook-v3@1.3.6` both peer-dep `@mysten/sui@^2.16.2` while we pin `2.16.0` per CLAUDE.md. Non-blocking.
- **Build chunk-size warnings:** Plotly chunk (4.88 MB / 1.48 MB gzipped) and main bundle (881 KB / 260 KB gzipped) both exceed Vite's default 500 KB threshold. Plotly is isolated via Wave 0 manualChunks; main bundle increased ~38 KB from Plan 04-04 due to the 3 new panels + 2 new hooks + 2 new ui primitives. Acceptable for v1; post-submission polish: dynamic `import()` of panel modules so they download lazily as the user scrolls.
- **Recharts ResponsiveContainer in jsdom:** Inherited issue from Plan 04-04. ResizeObserver polyfill returns 0×0 dims, so SVG content is not painted. The test suite asserts on (a) data-testid presence + (b) DOM text + (c) source-grep for color contracts. Documented as the established pattern.

## Stub Tracking / Known Stubs

- **useBucketState v1 returns null even with wallet connected.** The on-chain RateLimiter is a dynamic field on the vault's rate_limiters Table; v1 has no relay-side per-user state and no per-wallet RPC call from the dashboard. Plan 04-07 Task 3 wires the live `client.getDynamicFieldObject({ parentId: vault.rate_limiters_uid, name: { type: 'address', value: account.address } })` lookup. Until then, BucketGauge renders the "Bucket lazy-init pending" message, which is informationally correct (the bucket genuinely doesn't exist yet on-chain for pre-redemption users). TODO marker is unambiguous about where to add the RPC call.
- **HedgeRolled produces a Hedge with notionalQuote=0n.** The rebalance.move HedgeRolled struct only carries `old_key + new_key` — the new hedge's economic fields (`quantity`, `cost_basis_quote`) are not in the event payload. useExposure surfaces the new_key entry with `notionalQuote: 0n` for display purposes. A future relay enhancement could enrich HedgeRolled emissions with the new hedge's cost_basis_quote (a Move-layer change in rebalance.move:199-203); for v1 this is intentional and documented.
- **premiumQuote always 0n on dashboard-side hedges.** v1 surfaces `cost_basis_quote` as `notionalQuote` and leaves `premiumQuote` at 0n. A dedicated premium field could be added to the Move event surface in a future plan; v1 is the simplest-correct shape.
- **Section placeholders for Plans 04-06/04-07 remain empty:** `<section data-section="what-if" />`, `<section data-section="deposit-withdraw" />`, `<section data-section="position-viewer" />`. Intentional — Wave 4 (Plan 04-06 WhatIfSimulator) and Wave 5 (Plan 04-07 deposit/withdraw + position viewer) inject panels into these slots.

These stubs are stage gates for downstream plans, not visible UI emptiness. No misleading copy reaches the user — empty states use UI-SPEC §Empty states verbatim.

## User Setup Required

To exercise the dashboard with the vault-side panels visible:

1. `cp dashboard/.env.example dashboard/.env`; default `VITE_RELAY_WS_URL=ws://localhost:8080` matches indexer default.
2. `cd indexer && pnpm dev` (Plan 04-02 relay; runs in snapshot-only mode against the pending TESTNET-DEPLOY.json — VaultPanel will render its empty state until Phase 2 deploy + Plan 03 vault poller wires snapshot.vault).
3. `cd dashboard && pnpm dev` (Vite dev server at localhost:5173).
4. Without a deployed vault, the dashboard shows: SurfacePanel "Waiting for first SVI update" / ArbCheckerPanel same / **VaultPanel "Vault is initializing"** / **BucketGauge "Connect wallet to view your withdrawal budget"** (or "Bucket lazy-init pending" if a wallet is connected via Slush/Suiet/Backpack) / **ExposurePanel "No hedges currently open"**. Each empty state is informationally correct.
5. Once Phase 2 deploy + Plan 03 wires the relay against a live vault, the vault state slot flows into snapshot.vault → useVaultState → VaultPanel populated state. HedgeMinted events appended to snapshot.ring_buffer flow into useExposure → ExposurePanel BarChart + Table.

## Threat Flags

None new. The plan's `<threat_model>` mitigations are honored:

- T-04-05-01 (Stale NAV misleading): every panel wears StalenessPill bound to vault.last_updated_ms; staleness state machine drives cyan/amber/rose escalation.
- T-04-05-02 (u64 → Number precision loss): tested via `(1n << 54n)` total_shares fixture asserting exact BigInt navPerShareScaled.
- T-04-05-03 (BucketGauge shows another user's bucket): useBucketState scopes by useCurrentAccount().address; no URL param override.
- T-04-05-04 (Recharts ResponsiveContainer infinite-loop): all charts inside fixed-height divs (220px) so ResponsiveContainer dimensions are bounded.
- T-04-05-05 (Malicious event injection): accepted per chain-level guarantee; only on-chain events reach the relay.

No new attack surface introduced — the 3 new panels are read-only displays consuming the WS snapshot.

## Next Phase Readiness

- **Plan 04-06 (WhatIfSimulator):** `useSurfaceSnapshot` projection seam (Plan 04-04) feeds the simulator; the new `useVaultState` seam exposes total_assets for shocked-PnL display. shadcn Slider primitive must be added (`npx shadcn add slider` or write manually following the existing pattern). `binaryPrice` from `@/lib/svi` is the per-position pricing function.
- **Plan 04-07 (DepositWithdrawPanel + PositionViewer):** `<ConnectButton />` already in Header (Plan 04-03). shadcn Tabs + Dialog + Input primitives must be added; the shadcn Table primitive (this plan) is reusable. **useBucketState extends here** with the live `client.getDynamicFieldObject` lookup — Task 3 is the unambiguous integration site documented inline. useCurrentAccount + useSignAndExecuteTransaction from @mysten/dapp-kit drive the deposit flow.

## Self-Check: PASSED

Verified before writing this SUMMARY:

- `dashboard/src/hooks/useVaultState.ts` exports `useVaultState` + `VaultView`: FOUND
- `dashboard/src/hooks/useBucketState.ts` exports `useBucketState` + `BucketView`: FOUND
- `dashboard/src/hooks/useExposure.ts` exports `useExposure` + `Hedge`: FOUND
- `dashboard/src/components/panels/VaultPanel.tsx` exports `VaultPanel`: FOUND
- `dashboard/src/components/panels/BucketGauge.tsx` exports `BucketGauge`: FOUND
- `dashboard/src/components/panels/ExposurePanel.tsx` exports `ExposurePanel`: FOUND
- `dashboard/src/components/ui/progress.tsx` exports `Progress`: FOUND
- `dashboard/src/components/ui/table.tsx` exports Table/TableHeader/TableBody/...: FOUND
- `dashboard/src/components/__tests__/VaultPanel.test.tsx`: 12 cases present
- `dashboard/src/components/__tests__/BucketGauge.test.tsx`: 5 cases present
- `dashboard/src/components/__tests__/ExposurePanel.test.tsx`: 11 cases present
- `grep -q "RadialBarChart" dashboard/src/components/panels/VaultPanel.tsx`: FOUND
- `grep -qE "formatNav|formatDusdc|formatShares" dashboard/src/components/panels/VaultPanel.tsx`: FOUND
- `grep -q "Connect wallet to view your withdrawal budget" dashboard/src/components/panels/BucketGauge.tsx`: FOUND
- `grep -q "useCurrentAccount" dashboard/src/components/panels/BucketGauge.tsx`: FOUND
- `grep -q "No hedges currently open" dashboard/src/components/panels/ExposurePanel.tsx`: FOUND
- `grep -qE "endsWith\(['\"]HedgeMinted['\"]\)" dashboard/src/hooks/useExposure.ts`: FOUND
- `grep -rcE "formatNav|formatDusdc|formatShares|formatBps" dashboard/src/components/panels/`: 16 references (8 VaultPanel + 4 BucketGauge + 4 ExposurePanel) ≥ 5
- `git diff HEAD -- dashboard/src/lib/{svi,phi,isqrt,ln,math,phi_coefficients,strategy_constants,arb_checker,parity_runner}.ts`: empty (0 lines)
- `grep -rE "subscribeEvent" dashboard/src/`: clean (0 hits)
- `cd dashboard && pnpm typecheck`: clean
- `cd dashboard && pnpm test`: 373/373 passing (13 test files; 311 Phase 1 + 13 hooks + 49 components)
- `cd dashboard && pnpm build`: dist/ produced; main bundle 881 KB / plotly chunk 4.88 MB isolated
- Commit `63167d6` (Task 1 feat): present in `git log`
- Commit `3b57ddb` (Task 2 feat): present in `git log`
- Commit `de2cb3b` (Task 3 feat): present in `git log`

---

*Phase: 04-plp-risk-studio-dashboard-relay*
*Completed: 2026-05-12*
