# Phase 04.2 Context — Dashboard Onboarding Declutter + Vault/Risk-Studio Mode Split

**Provenance:** Decisions captured 2026-06-15 during a live-preview review of the running
dashboard (in lieu of a formal `/gsd-discuss-phase`). The user reviewed the running app at
`localhost:5174`, agreed the product is too cluttered for a first-time LP to onboard, and
chose the front-door approach via an AskUserQuestion. Treat every **LOCKED DECISION** below
as user-confirmed — do NOT re-ask.

## Phase Goal

Reorganize the existing Phase 4 / 04.1 dashboard so a first-time liquidity provider can
understand and operate their deposit without wading through the quant. A simple, deposit-first
**Vault** view becomes the default landing; the existing risk-studio panels move behind a
**Vault | Risk Studio** toggle. Declutter the navigation rail and dead header chrome.

This is a **REORGANIZATION + DECLUTTER, not a rewire.** No data-spine, hook, panel-internal, or
backend changes.

## Locked Decisions

- **LD-1 — Two view-modes, Vault default.** The dashboard has two modes selected by a segmented
  **Vault | Risk Studio** control. Default = Vault. (User explicitly chose a *mix* of
  "deposit-first vault view" + "two modes".)
- **LD-2 — Client-side toggle, single-page, NO router.** Mode is React state only. Preserves the
  Phase 04.1 **LD-4 single-page** decision. No URL routes, no react-router, no deep-linking.
- **LD-3 — Reorganization, not rewire.** The `useWebSocket` data spine in `App.tsx` and every
  panel's internals/props stay byte-identical. Phase 04.2 only: (a) splits existing panels across
  the two modes, (b) reorders within the Vault view, (c) cuts dead nav/chrome. No relay, hook, or
  panel-logic changes. Must NOT regress any Phase 4 verified behavior or the Phase 04.1 visual
  system (OKLCH tokens, Geist type, `db-card` chrome).
- **LD-4 — Vault view contents** (the onboarding front door), in priority/visual order:
  1. **Plain-language value-prop headline.** Draft copy (refine tone, keep substance):
     *"Earn PLP yield with built-in crash protection — deposit DUSDC, the vault provides DeepBook
     liquidity and automatically buys downside insurance."*
  2. **Deposit / Redeem** (`DepositWithdrawPanel`) — promoted to the TOP (today it renders last).
  3. **Your position** (`PositionViewer`) — beside or directly below deposit.
  4. **The 4 KPI stats** (Vault NAV · Net APY · Hedge ratio · Utilization) — the existing
     `dh-stats` strip.
  5. **One-line hedge-status summary** (e.g. "Hedge engages on first deposit" / "Hedge in
     position") — reuse the existing `hasHedges` headline logic in `App.tsx`.
- **LD-5 — Risk Studio view contents** (the credibility layer), existing panels unchanged:
  `SurfacePanel` + `ArbCheckerPanel`, `WhatIfSimulator`, `ExposurePanel`, `BucketGauge`, the static
  Backtest link card, `EventStreamPanel`.
- **LD-6 — Rail declutter (13 → ~6).** REMOVE the 4 disabled stubs (Drawdown replay, Single PTB,
  vUSDC share, Integrations) and the 3 duplicate anchors (Hedge ladder = dup of Positions;
  History = mislabeled, points at exposure; Reports = dup of Backtest). Regroup survivors under the
  two modes; a rail item should switch mode and/or scroll to the relevant section.
- **LD-7 — Header declutter.** REMOVE the dead `⌘K · Search` pill (`tabIndex={-1}`, no handler,
  purely decorative). KEEP: `RelayStatusPill`, `GlobalStalenessPill`, the UTC clock, `ThemeToggle`,
  the `Deposit DUSDC` CTA, and the wallet `ConnectButton`.

## Current-State Evidence (verified by reading source 2026-06-15)

- **Rail** (`dashboard/src/components/layout/Rail.tsx`): 13 items in 4 groups
  (Vault / Risk Studio / Composability / Account). 4 are `kind: 'disabled'` (tooltip-only):
  Drawdown replay, Single PTB, vUSDC share, Integrations. Duplicate anchors: "Hedge ladder" →
  section `position-viewer` (same as Positions); "History" → `exposure`; "Reports" → `backtest`
  (same as Backtest). Real unique `[data-section]` targets today: `top`, `position-viewer`,
  `exposure`, `hero`, `what-if`, `backtest`, `deposit-withdraw`. Active item tracked via
  `IntersectionObserver` over `OBSERVED_SECTIONS`.
- **Header** (`dashboard/src/components/layout/Header.tsx`): the `⌘K · Search` `db-pill` has
  `tabIndex={-1}` and no `onClick` — dead. The `Deposit DUSDC` button calls `onDepositClick` which
  smooth-scrolls to `[data-section="deposit-withdraw"]`.
- **App layout** (`dashboard/src/App.tsx`): order today is `db-headline` + `dh-stats` → row `r1`
  (Surface + Arb | BucketGauge + Exposure) → row `r2` (Positions | What-if) → row `r3` (Backtest |
  EventStream) → `deposit-withdraw` LAST. Headline copy already switches on `hasHedges`.
- **Data spine (MUST preserve):** `useWebSocket(env.relayWsUrl)` → `{ state, snapshot }`; then
  `useSurfaceSnapshot`, `useVaultState`, `useExposure`, `useSigmaEstimates`, `usePositions`. Every
  panel consumes a prop-slice of `snapshot`. The relay (`ws://localhost:8080`) and on-chain reads
  are out of scope.

## Constraints

- **Submission June 19** — keep scope tight; this is polish/reorg, not new features.
- Keep the **Phase 04.1 design system** intact (OKLCH tokens in `globals.css`, Geist type,
  `db-card` chrome, motion pass). Reference `.planning/phases/04.1-dashboard-visual-polish/04.1-UI-SPEC.md`.
- **Single-page (LD-2).** Mode toggle = React state.
- **Accessibility:** the mode toggle must be keyboard-operable and announce state (tablist /
  segmented-control semantics, `aria-selected`, roving focus).
- Preserve the `[data-section]` anchors the rail/header scroll to (or update BOTH sides
  consistently if any are renamed/removed).
- Preserve existing panel empty/zero states (PositionViewer / ExposurePanel testnet-limitation
  copy must survive the move).

## Out of Scope

- The deferred **Account view** (post-submission).
- Any change to relay/indexer, hooks, panel math, or the backtest report.
- A mobile-specific redesign (don't regress existing responsive behavior; don't build new).

## Open Questions for the UI Researcher (resolve with a recommendation; do not block)

- **Toggle placement:** header pill row vs. top of main content vs. rail. Recommendation: top of
  main content, adjacent to the headline, as a `tablist`.
- **KPI stats scope:** Vault-only vs. shown in both modes. Recommendation: keep the `dh-stats`
  strip visible in both modes — it's compact and orients the user.
- **Rail ↔ mode coupling:** whether clicking a Risk-Studio rail item auto-switches mode then
  scrolls. Recommendation: yes — selecting a section in the other mode switches mode first, then
  scrolls to its `[data-section]`.
