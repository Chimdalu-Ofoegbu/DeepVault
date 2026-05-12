---
phase: 04-plp-risk-studio-dashboard-relay
plan: 06
subsystem: ui
tags: [dashboard, what-if-simulator, recharts, slider, bigint, svi, bootstrap-fallback, dash-09]

requires:
  - phase: 01-svi-math-evaluator
    provides: dashboard/src/lib/svi.ts::binaryPrice(svi, forward, strike) + SVIParams + STRATEGY_CONSTANTS.NAV_SCALE — consumed by whatIf.ts (UNCHANGED, parity-gated)
  - phase: 04-plp-risk-studio-dashboard-relay
    provides: useExposure (Plan 04-05 Task 3) — Hedge[] consumed by WhatIfSimulator
  - phase: 04-plp-risk-studio-dashboard-relay
    provides: useSurfaceSnapshot (Plan 04-04 Task 1) — SurfaceView consumed by WhatIfSimulator
  - phase: 04-plp-risk-studio-dashboard-relay
    provides: useWebSocket + FullSnapshot (Plan 04-03) — ring_buffer consumed by useSigmaEstimates for rolling 30-day theta-leg σ
  - phase: 04-plp-risk-studio-dashboard-relay
    provides: shadcn primitives (Card, Badge, Button) + format.ts + NumericValue (Plan 04-03/04-05)

provides:
  - dashboard/src/lib/whatIf.ts — pure-compute layer (shockSviParallel, shockedForward, shockedPnL); wraps Phase 1 binaryPrice with positional signature
  - dashboard/src/lib/dashboard_constants.ts — companion to codegen'd strategy_constants.ts; hosts BOOTSTRAP_SIGMA_*, BOOTSTRAP_MIN_OBSERVATIONS, SIGMA_ROLLING_WINDOW_MS, SIGMA_THETA_PCT_CAP, FALLBACK_FORWARD_PRICE_DUSDC, FALLBACK_FORWARD_PRICE_BTC_DISPLAY_USD
  - dashboard/src/hooks/useSigmaEstimates.ts — rolling 30-day σ_θ + bootstrap-fallback σ_F with explicit { sigmaThetaPct, sigmaSpotPct, isBootstrap, isThetaBootstrap, observationCount } shape
  - dashboard/src/components/ui/slider.tsx — shadcn Slider wrapping @radix-ui/react-slider
  - dashboard/src/components/ui/badge.tsx — adds amber variant for bootstrap-fallback + synthetic-forward badges
  - dashboard/src/components/panels/WhatIfSimulator.tsx — joint spot+vol slider panel with Recharts BarChart, Reset+Esc reset, both amber badges, sub-100ms useMemo
  - App.tsx wiring: section 5 ("what-if") now renders WhatIfSimulator; 5 of 7 sections populated (sections 6+7 remain for Plan 04-07)
  - 24 new vitest cases (11 whatIf math + 4 useSigmaEstimates hook + 9 WhatIfSimulator component); total dashboard 397 tests green

affects:
  - 04-07 (PositionViewer + DepositWithdraw share the section-grid space; useSigmaEstimates is the σ seam that any future forward-price stream extends without touching consumers; dashboard_constants.ts is the named-constant home for any further dashboard fallbacks)
  - post-submission backlog (full D-08 compliance: replace BOOTSTRAP_SIGMA_SPOT_PCT with rolling stdev of forward price once an oracle stream carrying forward price lands)

tech-stack:
  added:
    - "@radix-ui/react-slider ^1.2.0 (shadcn Slider peer dep)"
  patterns:
    - "Phase 1 binaryPrice signature is POSITIONAL: binaryPrice(svi, forward, strike) — NOT a keyed-object with tenor_seconds as the plan body comment guessed. The OracleSVI emits a per-tenor surface; tenor is baked into the SVI params for the v1 single-tenor case. whatIf.ts drops tenor_seconds from its public surface and uses the positional invocation. Documented here so Plan 04-07 + future plans have the canonical signature without re-reading svi.ts."
    - "D-08 partial-delivery contract via typed return shape: useSigmaEstimates returns { isBootstrap, isThetaBootstrap, observationCount } so the WhatIfSimulator can render distinct UI badges and tooltips per leg. The spot leg is ALWAYS bootstrap in v1 because OracleSVIUpdated does not carry forward price; isBootstrap is forced true to surface the constraint to the user."
    - "Named-constant discipline: dashboard_constants.ts is the home for every dashboard-side fallback or display value that is NOT part of the on-chain strategy contract. strategy_constants.ts is codegen'd from shared/strategy.toml and must not be hand-edited. The negative grep gate in the plan verify block enforces no magic-number regression for FALLBACK_FORWARD_PRICE_DUSDC."
    - "Pure-bigint compute / Number-only-at-display: whatIf.ts operates entirely in bigint at FLOAT_SCALING 1e9. Number() coercion is deferred to the slider-state + Recharts payload (which require Number) inside WhatIfSimulator. Phase 1 SVI lib forbidden-token grep on math/isqrt/phi/ln/svi stays clean."
    - "Recharts in jsdom (continued from Plan 04-04/04-05): ResizeObserver shim + assert on data-testid + DOM text content. WhatIfSimulator tests do not depend on SVG dimensions; tests assert on the pnl-chart container, slider role, Reset button label, and the bootstrap caption + amber-badge copy."
    - "Radix Slider keyboard semantics: ArrowRight/ArrowLeft step by the `step` prop; ArrowUp/ArrowDown same. Tests drive the slider via fireEvent.keyDown to avoid needing to compute pixel coords. Esc-key reset is bound on the focus-scope div (tabIndex=-1) so any focus inside the panel triggers it."

key-files:
  created:
    - dashboard/src/lib/dashboard_constants.ts
    - dashboard/src/lib/whatIf.ts
    - dashboard/src/lib/__tests__/whatIf.test.ts
    - dashboard/src/hooks/useSigmaEstimates.ts
    - dashboard/src/hooks/__tests__/useSigmaEstimates.test.tsx
    - dashboard/src/components/ui/slider.tsx
    - dashboard/src/components/panels/WhatIfSimulator.tsx
    - dashboard/src/components/__tests__/WhatIfSimulator.test.tsx
  modified:
    - dashboard/package.json
    - pnpm-lock.yaml
    - dashboard/src/components/ui/badge.tsx
    - dashboard/src/App.tsx

decisions:
  - "binaryPrice signature recorded as positional (svi, forward, strike): bigint — this is the canonical Phase 1 surface; plan body comment with keyed-object + tenor_seconds was an interface guess. whatIf.ts adapts; Phase 1 lib untouched."
  - "D-08 marked PARTIALLY DELIVERED with the spot-leg bootstrap-fallback constraint surfaced via amber Badge + tooltip + observationCount in the SigmaEstimates return shape. Full D-08 deferred to post-submission backlog."
  - "Dashboard-only named constants live in dashboard_constants.ts (companion module). strategy_constants.ts stays untouched (codegen contract preserved)."
  - "Amber Badge variant added to shadcn badge.tsx — class string bg-amber-500/15 text-amber-300 border-amber-500/40 matches UI-SPEC §Color status semantics amber-500 #f59e0b."
  - "Slider ranges locked at spot ±50000 bps (±5σ at 100% σ_F bootstrap) and vol ±4000 bps (±2σ at 20% σ_θ bootstrap)."

metrics:
  duration: ~25 minutes
  tasks_completed: 2
  files_created: 8
  files_modified: 4
  tests_added: 24
  total_dashboard_tests: 397
  commits: 3
  completed_date: 2026-05-12

---

# Phase 04 Plan 06: WhatIfSimulator (DASH-09) Summary

**One-liner:** Joint spot+vol slider panel that recomputes shocked PnL client-side via Phase 1 binaryPrice with sub-100ms response, named-constant bootstrap-fallback discipline, and explicit amber-badge surfacing of the v1 D-08 partial-delivery (spot σ remains bootstrap until a forward-price stream lands).

## What Was Built

**Task 1 — pure-compute layer + σ hook (commit `11f0c28`, preceded by RED commit `745b57d`):**

- `dashboard/src/lib/whatIf.ts` exports `shockSviParallel`, `shockedForward`, `shockedPnL`. All three operate in bigint at FLOAT_SCALING 1e9. The `shockSviParallel` function shifts only the `a` (variance-level) term per CONTEXT.md D-07 v1 approximation, clamping at 0n to preserve SSVI non-negativity. `shockedForward` shifts the forward price, clamping at 1n to satisfy the binaryPrice `EZeroForward` invariant. `shockedPnL` composes both against Phase 1 `binaryPrice(svi, forward, strike)` and returns a typed `ShockedQuote { hedgeKey, baselinePrice, shockedPrice, baselineNotional, pnlQuote }`.
- `dashboard/src/lib/dashboard_constants.ts` is a NEW companion module to the codegen'd `strategy_constants.ts` (which must not be hand-edited). It exports seven named constants: `BOOTSTRAP_SIGMA_THETA_PCT`, `BOOTSTRAP_SIGMA_SPOT_PCT`, `BOOTSTRAP_MIN_OBSERVATIONS`, `SIGMA_ROLLING_WINDOW_MS`, `SIGMA_THETA_PCT_CAP`, `FALLBACK_FORWARD_PRICE_DUSDC`, `FALLBACK_FORWARD_PRICE_BTC_DISPLAY_USD`.
- `dashboard/src/hooks/useSigmaEstimates.ts` returns the typed shape `{ sigmaThetaPct, sigmaSpotPct, isBootstrap, isThetaBootstrap, observationCount }`. When the ring buffer has ≥ `BOOTSTRAP_MIN_OBSERVATIONS` in-window `OracleSVIUpdated` events, theta-leg σ is computed live as the relative stdev of `a/1e9`. The spot leg ALWAYS falls back to `BOOTSTRAP_SIGMA_SPOT_PCT` and forces `isBootstrap=true` — this is the D-08 partial-delivery surface.

**Task 2 — WhatIfSimulator + App wiring (commit `bf85b4b`):**

- `dashboard/src/components/ui/slider.tsx` ships a shadcn Slider primitive wrapping `@radix-ui/react-slider@^1.2.0` (newly added dependency).
- `dashboard/src/components/ui/badge.tsx` gains an `amber` variant (`bg-amber-500/15 text-amber-300 border-amber-500/40` per UI-SPEC §Color status semantics amber-500 `#f59e0b`).
- `dashboard/src/components/panels/WhatIfSimulator.tsx` renders two sliders, a Recharts BarChart per hedge + Total, a Reset button (+ Esc-key reset on the focus scope), the bootstrap caption under each slider, an amber "Bootstrap σ" Badge with a tooltip distinguishing theta-vs-spot bootstrap reasons, and an amber "Using synthetic forward — connect oracle for live pricing" Badge when no `forwardPrice` prop is supplied. The forward fallback comes from `FALLBACK_FORWARD_PRICE_DUSDC` exclusively — no magic number inline (negative grep gate enforced).
- `dashboard/src/App.tsx` adds `useSigmaEstimates(snapshot)` and renders `<WhatIfSimulator hedges surface sigma />` in section 5. 5 of 7 sections are now populated.

## Phase 1 binaryPrice signature (load-bearing record)

```typescript
// dashboard/src/lib/svi.ts (UNCHANGED, parity-gated)
export function binaryPrice(svi: SVIParams, forward: bigint, strike: bigint): bigint
```

This is the **positional** form. The plan body interface comment carried a keyed-object shape with `tenor_seconds`, but the real Phase 1 function has no tenor argument — tenor is baked into the per-tenor SVI surface emitted by `OracleSVI`. `whatIf.ts` adapts to this and the Phase 1 lib was not touched (forbidden-token grep on math/isqrt/phi/ln/svi remains clean). Plan 04-07 and any future plan that calls `binaryPrice` can use this signature without re-reading `svi.ts`.

## Verification

| Gate | Command | Result |
|------|---------|--------|
| Full dashboard test suite | `cd dashboard && pnpm test --run` | 397 tests passing across 16 files |
| Typecheck | `cd dashboard && pnpm typecheck` | clean |
| Build | `cd dashboard && pnpm build` | produces `dist/` |
| `shockedPnL` referenced | `grep -q "shockedPnL" src/components/panels/WhatIfSimulator.tsx` | OK |
| "Reset to current" copy | `grep -q "Reset to current" src/components/panels/WhatIfSimulator.tsx` | OK |
| Bootstrap fallback caption | `grep -q "bootstrap fallback" src/components/panels/WhatIfSimulator.tsx` | OK |
| FALLBACK_FORWARD_PRICE_DUSDC import | `grep -q "FALLBACK_FORWARD_PRICE_DUSDC" src/components/panels/WhatIfSimulator.tsx` | OK |
| Synthetic-forward copy | `grep -q "Using synthetic forward" src/components/panels/WhatIfSimulator.tsx` | OK |
| Bootstrap σ Badge copy | `grep -q "Bootstrap σ" src/components/panels/WhatIfSimulator.tsx` | OK |
| Negative magic-number gate | `! grep -E "100_000n \* 1_000_000_000n" src/components/panels/WhatIfSimulator.tsx` | OK (constant only in dashboard_constants.ts) |
| Phase 1 SVI lib parity grep | `! grep -nE "Number\(|parseFloat\(|Math\.(sqrt|exp|log|pow)\(" src/lib/{math,isqrt,phi,ln,svi}.ts` | OK |
| Phase 1 SVI lib diff | `git diff HEAD~3 dashboard/src/lib/svi.ts ...` | zero changes |

## D-08 PARTIAL DELIVERY

**Strict reading of D-08:** "σ_F estimated from rolling 30-day stdev of forward-price snapshots."

**v1 implementation:** `BOOTSTRAP_SIGMA_SPOT_PCT = 20`, always.

**Rationale:** `OracleSVIUpdated` events do not carry forward price. The relay's ring buffer (which is the dashboard's only event source) therefore cannot compute a rolling stdev of forward price from the event stream alone. Adding a separate forward-price oracle stream is out of scope for Plan 04-06 — it would touch the Move package (Phase 2), the indexer (Phase 4 Plan 03), and the wire format (Plan 04-03), and the brief's "hard floor" does not require it.

**Mitigation surface (multi-layered, STRIDE T-04-06-04 + T-04-06-05):**

1. **Typed return shape:** `useSigmaEstimates` returns `{ isBootstrap, isThetaBootstrap, observationCount }`. The caller cannot conflate the bootstrap value with a computed value.
2. **Amber "Bootstrap σ" Badge** in CardDescription when `sigma.isBootstrap=true`. The tooltip text distinguishes:
   - Both legs bootstrap: "spot-leg σ uses fallback (OracleSVIUpdated does not carry forward price) AND theta-leg σ uses fallback (N observations < 7 required)".
   - Only spot bootstrap: "spot-leg σ uses fallback (OracleSVIUpdated does not carry forward price). Theta-leg σ is live (N observations)".
3. **Per-slider caption** under each slider: `(bootstrap fallback: <7d history; using 20% σ)` / `(bootstrap fallback: <7d θ history; using 20% σ_θ)`.
4. **Amber "Using synthetic forward — connect oracle for live pricing" Badge** when no `forwardPrice` prop is supplied — covers the related "absolute PnL is anchored to a synthetic forward" surface.

**Deferred to post-submission backlog:** Replace `BOOTSTRAP_SIGMA_SPOT_PCT` with a rolling stdev over a new `forward_price_history` ring (either added to `OracleSVIUpdated` or emitted as a separate event). When that lands, `useSigmaEstimates` returns `isBootstrap=false` and the WhatIfSimulator silently drops the amber Badge — the consumer contract does not change.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] `binaryPrice` signature in plan body was wrong**

- **Found during:** Task 1, first `read_first` step before writing whatIf.ts.
- **Issue:** The plan body's `<interfaces>` block declared `binaryPrice({ svi, forward, strike, tenor_seconds })` as a keyed-object call. The actual Phase 1 export is positional: `binaryPrice(svi, forward, strike)` with no tenor argument.
- **Fix:** `whatIf.ts` drops `tenor_seconds` from its `shockedPnL` argument set and invokes `binaryPrice(baselineSvi, baselineFwd, args.strike)`. Phase 1 SVI lib untouched. Signature documented in this Summary so future plans don't re-read `svi.ts`.
- **Files modified:** `dashboard/src/lib/whatIf.ts`, `dashboard/src/lib/__tests__/whatIf.test.ts` (matched the real signature; no `tenor_seconds` test cases).
- **Commit:** `11f0c28`

### Architectural decisions

None — all in scope.

## Authentication gates

None.

## Known Stubs

None for this plan. The WhatIfSimulator's `forwardPrice` prop is intentionally optional and clearly surfaces the synthetic-forward fallback via the amber Badge. The future wiring of a real forward-price stream is documented under "D-08 PARTIAL DELIVERY" above.

## STRIDE — Final Disposition

| Threat ID | Category | Disposition | Notes |
|-----------|----------|-------------|-------|
| T-04-06-01 | Information Disclosure | mitigated | UI-SPEC copy "PnL is recomputed in your browser" — illustrative, no guaranteed-payout language anywhere. |
| T-04-06-02 | Tampering | mitigated | `shockSviParallel` clamps `a` at 0n; `shockedForward` clamps at 1n; binaryPrice's `EZeroVariance` + `EZeroForward` invariants are preserved. Test case `clamps a at 0n when shock would drive it negative` proves it. |
| T-04-06-03 | DoS | mitigated | `useMemo` keyed on `(hedges, surface, fwd, thetaShockBps, spotShockBps)`; n_hedges ≤ 10 typical; sub-100ms budget unbroken. |
| T-04-06-04 | Information Disclosure | **mitigated (upgraded from `accept` in iter 2)** | Caption + amber "Bootstrap σ" Badge + tooltip + typed `{ isBootstrap, isThetaBootstrap, observationCount }` shape — quadruple-layered surfacing. |
| T-04-06-05 | Information Disclosure | mitigated | `FALLBACK_FORWARD_PRICE_DUSDC` is a named exported constant (not a magic number); amber "Using synthetic forward — connect oracle for live pricing" Badge renders whenever `forwardPrice` prop is omitted. Negative grep gate enforces no inline magic-number regression. |

## TDD Gate Compliance

| Gate | Commit | Notes |
|------|--------|-------|
| RED | `745b57d` (`test(04-06)`) | whatIf tests written first; import resolution failure confirmed the implementation didn't exist. |
| GREEN | `11f0c28` (`feat(04-06)`) | All 11 whatIf tests + 4 useSigmaEstimates tests passing. |
| GREEN (Task 2) | `bf85b4b` (`feat(04-06)`) | All 9 WhatIfSimulator component tests passing alongside the prior 15. |

Plan-level `type: execute` (not `type: tdd`), but Task 1 was authored with explicit `tdd="true"`. RED→GREEN gate sequence observed for Task 1.

## Self-Check: PASSED

Verified file existence and commits:

- `[ -f dashboard/src/lib/dashboard_constants.ts ]` → FOUND
- `[ -f dashboard/src/lib/whatIf.ts ]` → FOUND
- `[ -f dashboard/src/lib/__tests__/whatIf.test.ts ]` → FOUND
- `[ -f dashboard/src/hooks/useSigmaEstimates.ts ]` → FOUND
- `[ -f dashboard/src/hooks/__tests__/useSigmaEstimates.test.tsx ]` → FOUND
- `[ -f dashboard/src/components/ui/slider.tsx ]` → FOUND
- `[ -f dashboard/src/components/panels/WhatIfSimulator.tsx ]` → FOUND
- `[ -f dashboard/src/components/__tests__/WhatIfSimulator.test.tsx ]` → FOUND
- `git log` includes `745b57d`, `11f0c28`, `bf85b4b` → FOUND
