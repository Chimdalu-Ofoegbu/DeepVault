---
phase: 04-plp-risk-studio-dashboard-relay
plan: 01
subsystem: ui
tags: [vite, react, dapp-kit, shadcn, tailwindcss, plotly, recharts, vitest, indexer]

requires:
  - phase: 01-svi-math-evaluator
    provides: dashboard/src/lib SVI evaluator triple (math/isqrt/phi/ln/svi.ts + arb_checker.ts) — preserved untouched by Phase 4 Wave 0
  - phase: 00-bootstrap
    provides: pnpm workspaces + repo-root @mysten/sui 2.16.0 + @mysten/deepbook-v3 1.3.6

provides:
  - Dashboard scaffold (Vite 7 + React 18.3 + TS 5.6) with @/ alias + plotly/vendor manual-chunk bundle isolation (Pitfall 9)
  - shadcn `new-york` style + `slate` base preset initialized manually (components.json + tailwind.config.ts + postcss.config.js + globals.css)
  - Provider stack in src/main.tsx with Pitfall 10 ordering locked (QueryClient -> SuiClientProvider -> WalletProvider -> ThemeProvider)
  - Vitest extended for components/hooks tests (jsdom + jest-dom matchers) with Phase 1 lib glob preserved (311 tests still green)
  - App.tsx layout shell with 7 placeholder sections in D-05 order (hero, arb-checker, vault-bucket, exposure, what-if, deposit-withdraw, position-viewer)
  - Strict env validation (dashboard/src/env.ts) for VITE_RELAY_WS_URL + VITE_SUI_NETWORK + VITE_PREDICT_SERVER_URL
  - Indexer workspace ready for Plan 04-02 (package.json + tsconfig.json + .env.example + src/index.ts scaffold)

affects:
  - 04-02 (indexer relay populates indexer/src/relay.ts)
  - 04-03 (shadcn component pulls via `pnpm dlx shadcn add ...` consume the components.json + globals.css scaffold)
  - 04-04 (SurfacePanel + ArbCheckerPanel mount into App.tsx section placeholders)
  - 04-05, 04-06, 04-07 (subsequent panels mount into remaining section placeholders)

tech-stack:
  added:
    - "@mysten/dapp-kit@1.0.4"
    - "@mysten/sui@2.16.0"
    - "@tanstack/react-query@^5"
    - "react@^18.3 + react-dom@^18.3"
    - "plotly.js@3.5.1 + react-plotly.js@2.6.0"
    - "recharts@^2.15"
    - "next-themes@^0.4 + sonner@^1.7 + lucide-react@^0.500"
    - "tailwindcss@^3.4 + postcss + autoprefixer"
    - "vite@^7 + @vitejs/plugin-react@^4.3"
    - "vitest@^4.1.5 + @testing-library/react@^16 + @testing-library/jest-dom@^6.6 + jsdom@^25"
    - "ws@^8.18 + pino@^9.5 + dotenv@^17 (indexer)"
  patterns:
    - "Provider stack ordering: QueryClient -> SuiClientProvider -> WalletProvider -> ThemeProvider (Pitfall 10 mitigation; JSX-tag offset asserted in plan verify)"
    - "Manual shadcn init (no `npx shadcn init` prompt) keeps Wave 0 deterministic across Windows/POSIX shells"
    - "Vite manualChunks: { plotly: ['plotly.js','react-plotly.js'], vendor: ['react','react-dom'] } for Pitfall 9 bundle isolation"
    - "Vitest config extends Phase 1 lib glob — never replaces — so the 311-test parity floor remains green forever"
    - "Section-placeholder layout shell (data-section attrs) lets Plans 04-04 through 04-07 mount panels without touching App.tsx scaffold"

key-files:
  created:
    - dashboard/vite.config.ts
    - dashboard/vitest.setup.ts
    - dashboard/index.html
    - dashboard/tailwind.config.ts
    - dashboard/postcss.config.js
    - dashboard/components.json
    - dashboard/.env.example
    - dashboard/src/styles/globals.css
    - dashboard/src/components/ui/.gitkeep
    - dashboard/src/main.tsx
    - dashboard/src/App.tsx
    - dashboard/src/env.ts
    - dashboard/src/vite-env.d.ts
    - indexer/tsconfig.json
    - indexer/.env.example
    - indexer/src/.gitkeep
    - indexer/src/index.ts
  modified:
    - dashboard/package.json
    - dashboard/tsconfig.json
    - dashboard/vitest.config.ts
    - indexer/package.json
    - pnpm-lock.yaml

key-decisions:
  - "Manual shadcn init: write components.json + tailwind.config.ts + globals.css directly instead of running `npx shadcn init` interactively. Wave 0 must be deterministic across Windows/POSIX; Plan 04-03 will add primitives via `pnpm dlx shadcn add ...` which is non-interactive."
  - "Provider order JSX-tag offset asserted in plan verify (SuiClientProvider @2126 < WalletProvider @2206) — Pitfall 10 mitigation made mechanical."
  - "Indexer test script uses `vitest run --passWithNoTests` so `pnpm -r run test` stays green between Wave 0 and Plan 04-02 (which lands the first relay tests)."
  - "Use @mysten/sui 2.16.0 `getJsonRpcFullnodeUrl` from `@mysten/sui/jsonRpc` instead of the legacy 1.x `getFullnodeUrl` from `@mysten/sui/client` (the plan body cited the deprecated path; 2.16 renamed + relocated)."

patterns-established:
  - "All Phase 4 deps pinned to CLAUDE.md versions; pnpm-lock.yaml committed; CI `--frozen-lockfile` enforces supply-chain integrity (T-04-01-01 mitigation)."
  - "VITE_* env vars are PUBLIC by contract (baked into client bundle at build time). .env in .gitignore; .env.example shipped as the only template."
  - "Layout shell uses `data-section=` attributes as mount points for downstream panels — Plans 04-04 through 04-07 inject without modifying App.tsx structure."

requirements-completed: [DASH-13]

duration: 35min
completed: 2026-05-12
---

# Phase 4 Plan 01: Wave 0 Dashboard + Indexer Scaffold Summary

**Vite 7 + React 18.3 + dApp Kit 1.0.4 dashboard scaffold with shadcn new-york/slate base, Pitfall 10-locked provider stack, plotly/vendor chunk isolation, and an empty indexer workspace ready for Plan 04-02 — all 311 Phase 1 SVI tests still green and the parity-gated lib files untouched.**

## Performance

- **Duration:** ~35 min wall-clock (dominated by pnpm install of 765 packages, 1m 33s; verify steps ~6s)
- **Started:** 2026-05-12T20:20:00Z (approx)
- **Completed:** 2026-05-12T20:55:00Z (approx)
- **Tasks:** 2
- **Files created:** 17
- **Files modified:** 5

## Accomplishments

- Pinned Phase 4 dependency stack: @mysten/dapp-kit 1.0.4, @mysten/sui 2.16.0, plotly.js 3.5.1, react-plotly.js 2.6.0, recharts ^2.15, react 18.3, vite ^7, vitest 4.1.5 — all per CLAUDE.md (T-04-01-01 mitigation: pnpm-lock.yaml committed, CI `--frozen-lockfile` will enforce).
- Initialized shadcn manually (components.json `style=new-york`, `baseColor=slate`, `cssVariables=true`) + tailwind.config.ts + postcss.config.js + src/styles/globals.css with the full slate CSS-variable preset (light + dark). `pnpm dlx shadcn add ...` calls in Plan 04-03 will land primitives into `src/components/ui/` without further config.
- main.tsx provider stack matches Pitfall 10's locked order: QueryClient -> SuiClientProvider -> WalletProvider -> ThemeProvider. JSX-tag offset check passes (SuiClientProvider opens at character 2126, WalletProvider at 2206).
- App.tsx renders 7 placeholder sections in D-05 order (hero, arb-checker, vault-bucket, exposure, what-if, deposit-withdraw, position-viewer) so Plans 04-04 through 04-07 can mount panels via `data-section=` selectors without touching the scaffold.
- Vitest config extended for component + hooks tests (jsdom + @testing-library/jest-dom matchers) while preserving the Phase 1 lib glob — `cd dashboard && pnpm test` still reports 4 test files / 311 tests green in ~6s.
- `cd dashboard && pnpm build` produces dist/ with vendor chunk (134 KB) and plotly chunk (6.68 KB) isolated per Pitfall 9.
- Indexer workspace scaffolded (package.json + tsconfig.json + .env.example + src/index.ts placeholder). Both workspaces pass `pnpm -r run lint` (tsc --noEmit) and `pnpm -r run test`.
- Phase 1 SVI evaluator files (svi.ts, phi.ts, isqrt.ts, ln.ts, math.ts, phi_coefficients.ts, strategy_constants.ts, arb_checker.ts, parity_runner.ts) UNCHANGED — `git diff HEAD -- ...` returns empty; forbidden-token grep stays clean.

## Task Commits

Each task was committed atomically:

1. **Task 1: Install dashboard deps + initialize shadcn + Vite scaffold** - `71a6e66` (chore)
2. **Task 2: Provider stack + App shell + env wiring + indexer scaffold** - `d2ea427` (feat)

## Files Created/Modified

### Dashboard

- `dashboard/package.json` (modified) — 17 dependencies + 15 devDependencies pinned to CLAUDE.md versions; scripts updated for dev/build/preview/test/typecheck/lint.
- `dashboard/tsconfig.json` (modified) — ES2022 + jsx=react-jsx + `@/* -> ./src/*` path alias + `types: ["vitest/globals", "@testing-library/jest-dom"]`.
- `dashboard/vite.config.ts` (created) — React plugin, alias, manualChunks for plotly + vendor (Pitfall 9 bundle isolation).
- `dashboard/vitest.config.ts` (modified) — extends Phase 1 glob with components + hooks globs, jsdom environment, jest-dom setup file, 30s timeout.
- `dashboard/vitest.setup.ts` (created) — single import: `'@testing-library/jest-dom/vitest'`.
- `dashboard/index.html` (created) — `<html lang="en" class="dark">` root + `/src/main.tsx` module script entry.
- `dashboard/tailwind.config.ts` (created) — shadcn new-york + slate preset; darkMode=class, content globs, colors map to CSS variables, fontFamily Inter Variable + JetBrains Mono.
- `dashboard/postcss.config.js` (created) — tailwindcss + autoprefixer.
- `dashboard/components.json` (created) — shadcn `style=new-york`, `baseColor=slate`, `cssVariables=true`, aliases for components/utils/ui/lib/hooks.
- `dashboard/.env.example` (created) — VITE_RELAY_WS_URL + VITE_SUI_NETWORK + VITE_PREDICT_SERVER_URL.
- `dashboard/src/styles/globals.css` (created) — `@tailwind base/components/utilities` + full slate CSS-variable block for `:root` + `.dark` + `border-border` reset + Inter font-feature-settings.
- `dashboard/src/components/ui/.gitkeep` (created) — placeholder so the `@/components/ui` alias resolves until Plan 04-03 lands shadcn primitives.
- `dashboard/src/main.tsx` (created) — provider stack entry point with Pitfall 10 ordering.
- `dashboard/src/App.tsx` (created) — sticky-header layout shell + 7 placeholder sections in D-05 order.
- `dashboard/src/env.ts` (created) — strict required-key validation wrapping `import.meta.env`.
- `dashboard/src/vite-env.d.ts` (created) — triple-slash `<reference types="vite/client">` + typed ImportMetaEnv shape.

### Indexer

- `indexer/package.json` (modified) — type=module, @mysten/sui 2.16.0 + ws ^8.18 + pino ^9.5 + dotenv ^17 + date-fns ^4 + tsx/typescript/vitest devDeps; dev/start scripts run `tsx src/relay.ts` (Plan 04-02 fills).
- `indexer/tsconfig.json` (created) — ES2022 strict bundler-resolved, ESNext modules, `types: ["node"]`, isolatedModules.
- `indexer/.env.example` (created) — SUI_RPC_URL + DEPLOY_JSON_PATH + PORT + LOG_LEVEL + ORACLE_SVI_ID slot.
- `indexer/src/.gitkeep` (created) — placeholder.
- `indexer/src/index.ts` (created) — scaffold export so `tsc --noEmit` has an input file; Plan 04-02 replaces with relay.ts.

### Root

- `pnpm-lock.yaml` (modified) — regenerated to include all Phase 4 deps for both workspaces.

## Decisions Made

- **Manual shadcn init over `npx shadcn init`**: The CLI is interactive and on Windows PowerShell adds detection-mode flakiness. Writing components.json + tailwind.config.ts + globals.css directly produces the same `new-york`/`slate`/cssVariables output and keeps Wave 0 deterministic. Plan 04-03 will use `pnpm dlx shadcn add <name>` (non-interactive) to land primitives.
- **`getJsonRpcFullnodeUrl` import path correction**: Plan body cited the legacy `@mysten/sui/client` `getFullnodeUrl` symbol from the 1.x SDK. In `@mysten/sui@2.16.0` (CLAUDE.md pin) the function renamed to `getJsonRpcFullnodeUrl` and moved to `@mysten/sui/jsonRpc`. NetworkConfig also requires a `network: 'testnet' | 'mainnet' | ...` discriminator field. Both adjustments are in main.tsx.
- **Indexer `vitest run --passWithNoTests`**: Without this flag `pnpm -r run test` would fail at the indexer workspace until Plan 04-02 lands the first test file. Pass-with-no-tests is standard for scaffold packages.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `getFullnodeUrl` import path for @mysten/sui 2.16.0**

- **Found during:** Task 2 (typecheck of main.tsx)
- **Issue:** Plan body specified `import { getFullnodeUrl } from '@mysten/sui/client'`, but `@mysten/sui@2.16.0` (the CLAUDE.md pin) does NOT export `getFullnodeUrl` from `@mysten/sui/client`. The symbol was renamed `getJsonRpcFullnodeUrl` and moved to `@mysten/sui/jsonRpc` in the 2.x rewrite (verified by inspecting `node_modules/.pnpm/@mysten+sui@2.16.0_typescript@5.6.3/.../jsonRpc/index.d.mts`).
- **Fix:** Switched the import to `import { getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc'` and adjusted call sites.
- **Files modified:** `dashboard/src/main.tsx`
- **Verification:** `cd dashboard && pnpm typecheck` clean.
- **Committed in:** `d2ea427` (Task 2 commit)

**2. [Rule 3 - Blocking] NetworkConfig requires `network` discriminator field**

- **Found during:** Task 2 (typecheck after switching to `getJsonRpcFullnodeUrl`)
- **Issue:** `@mysten/dapp-kit@1.0.4`'s `SuiClientProvider` accepts `NetworkConfigs<NetworkConfig | SuiJsonRpcClient>`. In `@mysten/sui@2.16.0` the `SuiJsonRpcClientOptions` type requires `{ url: string, network: 'mainnet' | 'testnet' | 'devnet' | 'localnet' }` — a `{ url }`-only entry fails strict type-checking ("Property 'transport' is missing in type ...").
- **Fix:** Each network entry now passes `{ url: getJsonRpcFullnodeUrl(name), network: name as const }`.
- **Files modified:** `dashboard/src/main.tsx`
- **Verification:** typecheck clean; provider semantics unchanged (Pitfall 10 ordering preserved).
- **Committed in:** `d2ea427` (Task 2 commit)

**3. [Rule 3 - Blocking] `import.meta.env` typing required `vite/client` reference**

- **Found during:** Task 2 (typecheck of env.ts)
- **Issue:** With `types: ["vitest/globals", "@testing-library/jest-dom"]` in tsconfig, vite's ambient `import.meta.env` types are NOT picked up. TS errors: `Property 'env' does not exist on type 'ImportMeta'`.
- **Fix:** Added `dashboard/src/vite-env.d.ts` with `/// <reference types="vite/client" />` and a typed `ImportMetaEnv` declaration for the VITE_* keys the dashboard consumes. This is the canonical Vite-templates pattern.
- **Files modified:** `dashboard/src/vite-env.d.ts` (created)
- **Verification:** typecheck clean.
- **Committed in:** `d2ea427` (Task 2 commit)

**4. [Rule 3 - Blocking] Indexer tsc "No inputs found"**

- **Found during:** Task 2 (`cd indexer && pnpm typecheck`)
- **Issue:** indexer/tsconfig.json `include: ["src", "vitest.config.ts"]` matched only `src/.gitkeep` (non-TS); tsc aborted with TS18003.
- **Fix:** Added `indexer/src/index.ts` exporting a placeholder constant. Plan 04-02 will replace with `relay.ts`.
- **Files modified:** `indexer/src/index.ts` (created)
- **Verification:** indexer typecheck clean.
- **Committed in:** `d2ea427` (Task 2 commit)

**5. [Rule 3 - Blocking] Indexer vitest exits 1 with no test files**

- **Found during:** Task 2 (`pnpm -r run test`)
- **Issue:** `vitest run` exits with code 1 when zero test files are present, failing `pnpm -r run test` at the indexer workspace.
- **Fix:** Changed indexer `scripts.test` to `vitest run --passWithNoTests`. Standard for scaffold packages awaiting first test.
- **Files modified:** `indexer/package.json`
- **Verification:** `pnpm -r run test` clean (dashboard 311 tests pass, indexer reports "No test files found, exiting with code 0").
- **Committed in:** `d2ea427` (Task 2 commit)

---

**Total deviations:** 5 auto-fixed (all Rule 3 - Blocking; entirely import-path/typing/scaffold-mechanics)
**Impact on plan:** No scope creep. All fixes restore the intended behavior described in plan's must_haves block. Plan body referenced legacy 1.x SDK shapes; corrections are mechanical given the CLAUDE.md 2.16.0 pin.

## Issues Encountered

- Two pnpm peer-dep warnings logged but non-blocking:
  - `@mysten/deepbook-v3@1.3.6` peer-deps `@mysten/sui@^2.16.2`; root pins `2.16.0` per CLAUDE.md.
  - `@mysten/dapp-kit@1.0.4 -> @mysten/slush-wallet@1.0.5` peer-deps `@mysten/sui@^2.16.2`; dashboard pins `2.16.0`.
  - Resolution: leave as-is. CLAUDE.md is the authoritative pin and 2.16.0 satisfies the API surfaces we consume. Bumping to 2.16.2 is a separate plan if Mysten asserts ABI breakage.

## Stub Tracking / Known Stubs

- `dashboard/src/App.tsx` renders 7 empty `<section data-section="...">` placeholders. **Intentional** — D-05 layout shell only. Plans 04-04 (SurfacePanel + ArbCheckerPanel into `hero` + `arb-checker`), 04-05 (VaultPanel + BucketGauge + ExposurePanel), 04-06 (WhatIfSimulator), 04-07 (DepositWithdrawPanel + PositionViewer) mount real panels into these slots.
- `dashboard/src/components/ui/.gitkeep` is a placeholder; Plan 04-03 lands shadcn primitives via `pnpm dlx shadcn add <name>`.
- `indexer/src/index.ts` exports a `RELAY_VERSION` constant only; Plan 04-02 replaces with `relay.ts` (RPC tail polling + WebSocket fan-out).

These stubs are stage gates for downstream plans, not visible UI emptiness. No "coming soon" text reaches the user.

## User Setup Required

None - no external service configuration required at Wave 0. `dashboard/.env.example` and `indexer/.env.example` document the env vars Plans 04-02 and beyond will consume.

## Next Phase Readiness

- Plan 04-02 (Relay): indexer/ workspace has pino, dotenv, ws, @mysten/sui 2.16.0 installed; src/index.ts ready to be replaced with relay.ts; .env.example documents SUI_RPC_URL + DEPLOY_JSON_PATH + PORT + LOG_LEVEL.
- Plan 04-03 (Style tokens + shadcn primitives): components.json + tailwind + globals.css scaffolded; `pnpm dlx shadcn add <name>` will work out of the box.
- Plan 04-04+ (Panels): App.tsx section placeholders + @/ alias + Vitest jsdom + jest-dom matchers all wired.

## Self-Check: PASSED

Verified before writing this SUMMARY:

- `dashboard/package.json` contains `"@mysten/dapp-kit": "1.0.4"` and `"plotly.js": "3.5.1"`: FOUND
- `dashboard/components.json` contains `new-york` and `slate`: FOUND
- `dashboard/src/main.tsx` `<SuiClientProvider` opens at offset 2126, `<WalletProvider` opens at offset 2206 (order_ok: true — Pitfall 10): FOUND
- `dashboard/vitest.config.ts` `include` includes `src/lib/__tests__/**/*.test.ts`: FOUND
- `cd dashboard && pnpm typecheck`: clean
- `cd dashboard && pnpm test`: 4 test files / 311 tests passed
- `cd dashboard && pnpm build`: dist/ produced, vendor (134 KB) + plotly (6.68 KB) chunks isolated
- `cd indexer && pnpm typecheck`: clean
- `pnpm -r run lint`: green
- `pnpm -r run test`: green (311 dashboard + 0 indexer w/ --passWithNoTests)
- Phase 1 lib `git diff HEAD -- dashboard/src/lib/{svi,phi,isqrt,ln,math,phi_coefficients,strategy_constants,arb_checker,parity_runner}.ts`: empty
- Forbidden-token grep on `dashboard/src/lib/{math,isqrt,phi,ln,svi}.ts`: clean
- Commit `71a6e66` (Task 1 chore): present in `git log`
- Commit `d2ea427` (Task 2 feat): present in `git log`

---

*Phase: 04-plp-risk-studio-dashboard-relay*
*Completed: 2026-05-12*
