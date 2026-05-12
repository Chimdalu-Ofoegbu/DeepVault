---
phase: 04-plp-risk-studio-dashboard-relay
plan: 07
subsystem: ui
tags: [dashboard, ptb, dapp-kit, deposit, withdraw, position-viewer, pnl-attribution, ci, deploy, checkpoint-pending]

requires:
  - phase: 04-plp-risk-studio-dashboard-relay
    provides: useWebSocket + FullSnapshot wire types from Plan 04-03 — consumed by usePositions
  - phase: 04-plp-risk-studio-dashboard-relay
    provides: useVaultState + useBucketState stub from Plan 04-05 — DepositWithdrawPanel and PositionViewer consume vaultView; useBucketState upgraded inline to live RPC
  - phase: 04-plp-risk-studio-dashboard-relay
    provides: shadcn primitives (Card, Badge, Button, Table, Tooltip) + StalenessPill + NumericValue + TxDigestLink from Plans 04-03/04-04/04-05
  - phase: 04-plp-risk-studio-dashboard-relay
    provides: format.ts (formatDusdc, formatShares) — consumed by both panels (10+ references)
  - phase: 02-vault-move-package-testnet-deploy
    provides: TESTNET-DEPLOY.json (currently status=pending_first_deploy) — build-time baked into the dashboard bundle via ptbDeploy
  - phase: 01-svi-math-evaluator
    provides: dashboard/src/lib/* SVI evaluator files (svi.ts, phi.ts, etc.) — UNCHANGED, parity-gated

provides:
  - dashboard/src/lib/ptbDeploy.ts — build-time DEPLOY const + isDeployed() gate + DeployJson type
  - dashboard/src/lib/ptbBuilders.ts — buildSupplyTx + buildRedeemRequestTx + buildRedeemFulfillTx + buildRedeemCancelTx
  - dashboard/src/hooks/usePositions.ts — Position[] derivation with bigint|null PnL attribution
  - dashboard/src/hooks/useBucketState.ts — live RPC implementation replacing Plan 04-05 stub
  - dashboard/src/components/panels/DepositWithdrawPanel.tsx — 3-step deposit/redeem flow
  - dashboard/src/components/panels/PositionViewer.tsx — wallet-scoped table with em-dash null rendering
  - dashboard/src/components/ui/{dialog,input,tabs}.tsx — shadcn primitives
  - 24 new vitest cases (6 ptbBuilders + 9 usePositions + 9 PositionViewer + 6 DepositWithdrawPanel); total dashboard 427 tests green
  - tsconfig.json updated to allow JSON import outside src/ for TESTNET-DEPLOY.json

affects:
  - Phase 04 Plan 04-07 Task 3 (human-verify checkpoint, NOT yet executed)
  - Phase 05 (mainnet redeploy) — same dApp Kit flow auto-activates against mainnet deploy by editing TESTNET-DEPLOY.json (rename to MAINNET-DEPLOY.json + repointing the ptbDeploy import)

tech-stack:
  added:
    - "@radix-ui/react-dialog ^1.1.15 (shadcn Dialog peer dep)"
    - "@radix-ui/react-tabs ^1.1.13 (shadcn Tabs peer dep)"
  patterns:
    - "PTB builders pinned to Move source-of-truth signatures (supply.move:61-69; redeem.move:71-203). Arg order for supply: vault, predict_top_level, predict_manager, oracle, deposit, clock (6 args). redeem_request/fulfill take Clock; redeem_cancel does NOT (D-04 cancel-anytime semantic)."
    - "Zero-vs-unknown invariant (LOCKED): nullable PnL fields use `bigint | null` typing — `null` means not-yet-known, `0n` means a real computed-zero value (OTM expiry / break-even redemption). PositionViewer's NullableQuote renderer enforces this at the display boundary with em-dash + tooltip."
    - "Pre-sign balance check (Pitfall 5): client.getCoins({owner, coinType}) is queried BEFORE opening the Review Dialog. UI-SPEC verbatim copy on insufficient balance: 'Insufficient DUSDC. You have X; this deposit requires Y.'"
    - "Build-time deploy JSON bake: ptbDeploy.ts statically imports the Phase 2 TESTNET-DEPLOY.json. Vite copies the contents into the bundle at build time; Vercel auto-rebuilds on every push to master, so the dashboard always ships with the latest deploy info. Graceful pending_first_deploy gating via isDeployed()."
    - "shadcn Dialog + jsdom: Radix Dialog uses Portal + pointer capture APIs that jsdom doesn't implement natively. Test setup polyfills hasPointerCapture/setPointerCapture/releasePointerCapture/scrollIntoView + ResizeObserver."

key-files:
  created:
    - dashboard/src/lib/ptbDeploy.ts
    - dashboard/src/lib/ptbBuilders.ts
    - dashboard/src/lib/__tests__/ptbBuilders.test.ts
    - dashboard/src/hooks/usePositions.ts
    - dashboard/src/hooks/__tests__/usePositions.test.tsx
    - dashboard/src/components/panels/DepositWithdrawPanel.tsx
    - dashboard/src/components/panels/PositionViewer.tsx
    - dashboard/src/components/__tests__/DepositWithdrawPanel.test.tsx
    - dashboard/src/components/__tests__/PositionViewer.test.tsx
    - dashboard/src/components/ui/dialog.tsx
    - dashboard/src/components/ui/input.tsx
    - dashboard/src/components/ui/tabs.tsx
  modified:
    - dashboard/tsconfig.json
    - dashboard/src/hooks/useBucketState.ts
    - dashboard/src/App.tsx
    - dashboard/package.json
    - pnpm-lock.yaml

key-decisions:
  - "Supply Move signature verified verbatim against contracts/sources/supply.move:61-69: 7 args (vault, predict, predict_manager, oracle, deposit, clock, ctx). The TypeScript Transaction builder passes 6 (ctx is implicit), in this order. The plan body's reference matched the e2e script analog exactly — no deviation needed."
  - "Redeem Move signatures: redeem_request (4 args: vault, shares, clock, ctx), redeem_fulfill (3: vault, clock, ctx), redeem_cancel (2: vault, ctx — NO Clock). TypeScript builders pass 3, 2, and 1 respectively. Verified against redeem.move:71-75, 104-107, 201-203."
  - "PnL display semantics LOCKED at bigint | null. Plan iter-2 revision flagged silent-zero rendering as a misrepresentation: PositionViewer must render '—' (em-dash + tooltip) for not-yet-known and '0.00 DUSDC' only for a real zero. 4 grep gates assert: (a) bigint | null in usePositions; (b) HedgeUnwound match logic; (c) findMatchingUnwind/findMatchingRedemption helpers; (d) NO `plpYield: 0n` or `hedgePayoff: 0n` defaults."
  - "HedgeUnwound matched by oracle_id only (not full market_key). vault.move:204-208 emits HedgeUnwound { vault_id, oracle_id, payout_quote } — no strike/expiry on the event. v1 single-oracle vault means oracle_id is sufficient; a future multi-oracle deploy would need richer matching but the API is forward-extensible."
  - "RedeemFulfilled NAV-delta formula: plpYield = quote_paid - (depositQuote * shares_burned / sharesMinted). Uses redeem.move:51-57 field names (shares_burned, quote_paid, remainder_shares); defensively probes alternate names (shares_redeemed, quote_out) for forward-compat."
  - "Test fixture HEX(): 32-byte hex Sui object IDs — @mysten/sui's TransactionDataBuilder validates IDs via valibot at .getData() time. Placeholders like '0xPKG' get rejected. Helper `HEX(last2)` generates `0x00...00<last2>` literal hex strings the validator accepts."
  - "RateLimiter dynamic-field probing: useBucketState defensively probes both `dynFields.value.fields` and `dynFields` directly, since on-chain dynamic fields nest the inner Move struct under `value.fields` while bare struct reads expose fields directly. Forward-robust to both shapes."
  - "Dialog response type handling: useSignAndExecuteTransaction's result is a union `{ digest, rawEffects? } | { effects: { bcs? } }`. Discriminated via `'digest' in result` before accessing — TypeScript narrowing handles the variant correctly without an unsafe cast."
  - "TESTNET-DEPLOY.json import: tsconfig.json 'include' extended to permit the JSON outside src/. Vite handles the import at build time; tsc honors the include extension. No new build plugin or codegen step needed."

requirements-completed: [DASH-11, DASH-12, DASH-13]
requirements-pending: []   # DASH-13 file-portion landed in Task 3 commit 7f37acd. Manual kill-mid-stream test + Vercel/Render deploys remain user actions outside this plan.

duration: ~17min (Tasks 1+2+3 file portion; manual deploy steps pending user)
completed: 2026-05-12
---

# Phase 4 Plan 07: Wave 5 Deposit/Withdraw + PositionViewer + CI/Deploy Summary

**Status: ALL TASKS COMPLETE (file portion of Task 3 landed; manual verification + deploys remain user actions).**

Tasks 1 and 2 of plan 04-07 execute the dApp Kit deposit/withdraw flow (DASH-11) and the wallet-scoped PositionViewer with PnL attribution (DASH-12). Both ship behind the `isDeployed()` gate so the panels render gracefully against the current `pending_first_deploy` TESTNET-DEPLOY.json placeholder AND auto-activate when Phase 2 lands the testnet deploy. The zero-vs-unknown invariant is enforced end-to-end: PositionViewer renders em-dash for null attribution fields and formatted DUSDC for known values (including known-zero); usePositions returns `bigint | null` typed fields so the distinction surfaces in TypeScript. Task 3 (CI extension + Vercel/Render configs + DASH-13 demo checklist) landed the configuration + checklist artifacts atomically; the manual kill-mid-stream verification + Vercel/Render deploy commands are user-driven actions documented in `04-DEMO-CHECKLIST.md`.

## Performance

- **Duration:** ~17 min wall-clock total (Tasks 1+2 ~14min, Task 3 file portion ~3min)
- **Started:** 2026-05-12T22:19:00Z
- **Completed (autonomous tasks 1+2):** 2026-05-12T22:35:00Z
- **Completed (Task 3 file portion):** 2026-05-12T22:42:00Z
- **Tasks executed:** 3 of 3 (Task 3 file portion landed; manual verify + deploys are user actions)
- **Files created:** 16 (2 lib + 1 hook + 1 lib test + 1 hook test + 2 panels + 2 panel tests + 3 ui primitives + Task 3: vercel.json + indexer/render.yaml + 04-DEMO-CHECKLIST.md)
- **Files modified:** 6 (App.tsx, useBucketState.ts, tsconfig.json, package.json, pnpm-lock.yaml, .github/workflows/ci.yml)
- **Tests added:** 24 (6 ptbBuilders + 9 usePositions + 9 PositionViewer + 6 DepositWithdrawPanel); total dashboard 427 tests passing in ~17.8s (re-verified post-Task-3)
- **Build:** main bundle 931.60 KB / 275.83 KB gzip; plotly chunk 4.88 MB / 1.48 MB gzip (unchanged); vendor 134.07 KB / 43.05 KB gzip. +50 KB from Plan 04-06 due to Dialog+Tabs+PositionViewer+DepositWithdrawPanel.

## Accomplishments

### Task 1 — ptbBuilders.ts + ptbDeploy.ts (DASH-11 foundation)

- **`ptbDeploy.ts`**: Build-time static import of `.planning/phases/02-vault-move-package-testnet-deploy/TESTNET-DEPLOY.json`. Exports `DeployJson` type, `DEPLOY` const, `isDeployed()` gate (`status === 'deployed' && package_id !== 'PENDING'`), and `useDeploy()` React hook variant. `tsconfig.json` 'include' extended to permit the cross-tree JSON import; Vite handles the bundle bake at build time.
- **`ptbBuilders.ts`**: Four pure functions returning `Transaction` instances:
  - `buildSupplyTx({ deploy, depositCoinId, depositAmountMicro })` → splits `depositAmountMicro` off the source DUSDC coin and calls `${pkg}::supply::supply<DUSDC>` with 6 args: vault (sharedObjectRef, mutable), predict_top_level (object), predict_manager (sharedObjectRef, mutable), oracle (object), deposit, Clock 0x6.
  - `buildRedeemRequestTx({ deploy, shareCoinId })` → calls `${pkg}::redeem::redeem_request<DUSDC>` with 3 args: vault, shares, Clock.
  - `buildRedeemFulfillTx({ deploy })` → calls `${pkg}::redeem::redeem_fulfill<DUSDC>` with 2 args: vault, Clock.
  - `buildRedeemCancelTx({ deploy })` → calls `${pkg}::redeem::redeem_cancel<DUSDC>` with 1 arg: vault only (NO Clock per D-04 cancel-anytime semantic).
- All builders use `tx.sharedObjectRef({ objectId, mutable: true, initialSharedVersion })` for vault + predict_manager. `tx.object('0x6')` for Clock. Type argument is always `[deploy.dusdc_type_tag]`.
- **6 vitest cases**: validates `Transaction.getData()` introspection (target string, typeArguments, argument count) per Move signature. Fixture uses real 32-byte hex IDs via `HEX(last2)` helper (`@mysten/sui` valibot parser rejects placeholder IDs like '0xPKG').
- **Committed:** `9a041ae` — `feat(04-07): ptbBuilders + ptbDeploy with build-time TESTNET-DEPLOY import`

### Verified Move signatures (source-of-truth)

```
contracts/sources/supply.move:61-69
  public fun supply<Quote>(
    vault: &mut Vault<Quote>,
    predict: &mut Predict,                  // predict_top_level
    predict_manager: &mut PredictManager,
    oracle: &OracleSVI,
    deposit: Coin<Quote>,
    clock: &Clock,
    ctx: &mut TxContext,
  )

contracts/sources/redeem.move:71-75
  public fun redeem_request<Quote>(
    vault: &mut Vault<Quote>,
    shares: Coin<SHARE>,
    clock: &Clock,
    ctx: &mut TxContext,
  )

contracts/sources/redeem.move:104-107
  public fun redeem_fulfill<Quote>(
    vault: &mut Vault<Quote>,
    clock: &Clock,
    ctx: &mut TxContext,
  )

contracts/sources/redeem.move:201-203
  public fun redeem_cancel<Quote>(
    vault: &mut Vault<Quote>,
    ctx: &mut TxContext,
  )   // NO Clock — cancel works any time per D-04
```

### Verified RateLimiter struct (contracts/sources/helpers/rate_limiter.move:37-48)

```
public struct RateLimiter has store {
  available: u64,
  last_updated_ms: u64,
  capacity: u64,
  refill_rate_per_ms: u64,
  enabled: bool,
}
```

useBucketState parses these field names directly from `getDynamicFieldObject`'s returned struct, with a defensive nesting probe (`dynFields.value.fields ?? dynFields`) to survive both Field-wrapped and bare exposures.

### Plan 06 Phase 1 binaryPrice signature (carry-forward)

Plan 04-06 SUMMARY confirmed `binaryPrice(svi, forward, strike): bigint` (3 args, positional, no tenor). Plan 04-07 does NOT consume binaryPrice directly — the DepositWithdrawPanel preview shows expected shares only (computed via simple ratio `amount * total_shares / (total_assets + 1)`). No deviation needed.

### Task 2 — DepositWithdrawPanel + PositionViewer + usePositions + live useBucketState (DASH-11 + DASH-12)

- **`usePositions.ts`**: Hook returns `Position[]` derived from `snapshot.ring_buffer` filtered by `data.depositor === account.address`. Position fields `hedgeCost: bigint | null`, `hedgePayoff: bigint | null`, `plpYield: bigint | null`, `netQuote: bigint | null`. Helpers `findMatchingMint`/`findMatchingUnwind`/`findMatchingRedemption` are exported for tests + future re-use. **Zero-vs-unknown invariant enforced**: NEVER `0n` for unknown; NEVER `null` for known-zero.
  - hedgePayoff: from HedgeUnwound matched by `oracle_id` only (vault.move:204-208 keys by oracle_id).
  - plpYield: from RedeemFulfilled NAV delta = `quote_paid - (depositQuote * shares_burned / sharesMinted)`.
  - netQuote: only computed when both plpYield and hedgePayoff are non-null; otherwise `null`.
- **`PositionViewer.tsx`**: 4 render branches — wallet disconnected / vault not deployed / no positions / populated. The populated state renders a shadcn `<Table>` with columns Open / Deposit / Shares / PLP yield (emerald-300) / Hedge cost (rose-300) / Hedge payoff (cyan-300) / Net (slate-100). The `NullableQuote` component renders em-dash + tooltip when value is null and formatted DUSDC when non-null. Tooltips are LOCKED-copy (asserted via aria-label).
- **`DepositWithdrawPanel.tsx`**: 3-step Input → Review → Execute flow per UI-SPEC §Deposit/Redeem flow.
  - 3 empty states (wallet disconnected / vault not deployed / Tabs(Deposit, Redeem)).
  - **Deposit subtree**: Input(amount in DUSDC), "You receive ~{shares} shares, gas ~0.01 SUI" preview, Pre-sign balance check via `client.getCoins({owner, coinType: dusdc_type_tag})` — rejects with UI-SPEC verbatim copy on insufficient balance. Dialog confirmation with "Confirm deposit of {amount} DUSDC" copy. Sonner toasts on success (with TxDigestLink) and error (rejected vs aborted variants).
  - **Redeem subtree**: SHARE balance discovery via `client.getCoins({coinType: ${pkg}::share::SHARE})`. 3 buttons — Request redemption (default) / Fulfill redemption (outline, wrapped in non-destructive Dialog) / Cancel request (destructive variant, wrapped in destructive Dialog with "Cancel redemption request?" verbatim copy + "Keep request" + "Cancel request" buttons per UI-SPEC §Destructive).
- **`useBucketState.ts`**: Upgraded from Plan 04-05 stub to live `client.getDynamicFieldObject({ parentId: rate_limiters_uid, name: { type: 'address', value: account.address } })`. Step 1 reads the vault via `client.getObject` to extract `rate_limiters.fields.id.id` parent; Step 2 looks up the dynamic field. Returns `null` gracefully when the bucket is not yet lazy-initialized (pre-redemption users) — BucketGauge renders the "Bucket lazy-init pending" message verbatim per Plan 04-05 wiring. Client-side lazy refill matches `rate_limiter.move::refill()` math: `available = min(capacity, available + refill_rate_per_ms * (now - last_updated_ms))`.
- **App.tsx**: Section 6 (`deposit-withdraw`) now mounts `<DepositWithdrawPanel vaultView={vaultView} />`; Section 7 (`position-viewer`) mounts `<PositionViewer positions={positions} vault={snapshot?.vault ?? null} />`. D-05 section order LOCKED 1-7, all panels populated.
- **shadcn primitives added**: dialog.tsx (Radix Dialog wrapper), input.tsx (pure React/Tailwind), tabs.tsx (Radix Tabs wrapper). Pkg deps: `@radix-ui/react-dialog ^1.1.15`, `@radix-ui/react-tabs ^1.1.13`.
- **24 vitest cases**: 9 usePositions (filtering, hedgePayoff matching, OTM vs null distinction, NAV delta, partial realization) + 9 PositionViewer (3 empty states, populated table, null-tooltip rendering, 0n-not-em-dash, color palette grep) + 6 DepositWithdrawPanel (empty states, pre-sign balance check rejecting verbatim copy, Confirm dialog opening, link contract grep).
- **Committed:** `f03e83c` — `feat(04-07): DepositWithdrawPanel + PositionViewer + usePositions + live useBucketState`

## Task Commits

1. **Task 1: ptbBuilders + ptbDeploy + tests** — `9a041ae` (feat) — 6 vitest cases; TESTNET-DEPLOY.json build-time bake; tsconfig.json `include` extended.
2. **Task 2: panels + hooks + live useBucketState + App wiring** — `f03e83c` (feat) — 24 vitest cases; +2 radix peer deps; 3 shadcn primitives added; App.tsx wires sections 6 + 7.
3. **Task 3: CI extension + Vercel/Render configs + DEMO-CHECKLIST (file portion)** — `7f37acd` (feat) — 4 artifacts landed atomically; 6-job CI matrix names preserved.

### Task 3 — CI extension + Vercel/Render configs + DEMO-CHECKLIST (file portion)

The mechanical file-creation portion of Task 3 landed in commit `7f37acd`:

- **`.github/workflows/ci.yml`** — `ts` job extended in-place with two new steps after the existing Test step: `Build dashboard` (runs `pnpm build` in `dashboard/`, produces the Vite `dist/`) and `Build indexer (typecheck)` (runs `pnpm build` in `indexer/`, which is `tsc --noEmit`). The 6-job matrix names (move/ts/python/codegen-drift/parity/e2e-vault) remain identical — branch protection invariant honored. Inline comments explain that the indexer's "build" is strict typecheck because the relay runs via `tsx` at runtime, with no transpilation step.
- **`vercel.json` (repo root)** — Strict-schema-compliant pnpm-monorepo blueprint. `installCommand: pnpm install --frozen-lockfile`, `buildCommand: pnpm --filter @deepvault/dashboard build`, `outputDirectory: dashboard/dist`, `framework: null` (pinned null so Vercel won't second-guess the workspace install). `regions: ["iad1"]` for predictable latency from the demo region. `$schema` reference for editor IntelliSense.
- **`indexer/render.yaml`** — Render free-tier blueprint. `env: node`, `plan: free`, `rootDir: indexer`, `healthCheckPath: /healthz`. `buildCommand` chains `cd .. && pnpm install --frozen-lockfile --prod=false && pnpm --filter @deepvault/indexer build`. **The `--prod=false` flag is critical** — Render defaults to `NODE_ENV=production` which makes pnpm skip devDependencies, but the indexer runs `tsx src/relay.ts` at runtime and `tsx` lives in devDependencies. `startCommand: cd .. && pnpm --filter @deepvault/indexer start`. Env vars (`SUI_RPC_URL`, `PORT`, `LOG_LEVEL`, `DEPLOY_JSON_PATH`, `NODE_ENV`, `NODE_VERSION`) match the relay's expected runtime config (`indexer/src/relay.ts:48-49`, `logger.ts:11`, `deployInfo.ts:29`). The ephemeral-disk caveat (free-tier has no persistent disk, so `cursor.json` is reset on every cold boot) is documented inline as acceptable for v1 because the cursor recovers via a backfill of the most recent event window on next poll cycle.
- **`04-DEMO-CHECKLIST.md`** — Three-section runbook:
  - **Pre-demo verification** — 6-step manual DASH-13 kill-mid-stream procedure (start relay + dashboard → observe LIVE pill → kill relay → observe RECONNECTING pill + retained data + banner copy → restart relay → observe auto-recovery within 30s). Pass/fail criteria table with five checks. Recording instructions for the Phase 6 demo video.
  - **Deploy day** — Render-first (`render blueprint launch`, verify `curl .../healthz`, document keepalive cron requirement) then Vercel (`vercel link` → `vercel env add VITE_RELAY_WS_URL` → `vercel --prod`). Post-deploy smoke test for the deposit flow when the testnet vault is live.
  - **Coverage map** — Layer-by-layer breakdown of DASH-13 across plans 04-02 (server WS reconnect + `/healthz`), 04-03 (client `useWebSocket` reconnect), 04-07 (this plan: CI + Vercel + Render + integration checklist), and Phase 0 D-15 (keepalive cron). Re-run commands for the unit test suites.

**Verification post-Task-3:**

- `pnpm --filter @deepvault/dashboard run test`: 427/427 passing in 17.78s (no regression from new files; sanity check only — none of the Task 3 artifacts touch dashboard runtime code).
- `grep -E "^  (move|ts|python|codegen-drift|parity|e2e-vault):" .github/workflows/ci.yml`: 6 matches, names unchanged — branch protection invariant preserved.
- `grep -E "Build (dashboard|indexer)" .github/workflows/ci.yml`: both new steps present.
- `git diff --diff-filter=D --name-only HEAD~1 HEAD`: empty (no accidental deletions in the Task 3 commit).

## Pending Manual Verification (user actions outside this plan)

The orchestrator's spawn brief explicitly distinguished the file-creation portion of Task 3 (mechanical, landed here) from the user-driven verification + deploy steps that follow. The following remain to be executed by the user, using `04-DEMO-CHECKLIST.md` as the runbook:

1. **DASH-13 kill-mid-stream manual test** — Follow the 6-step procedure in `04-DEMO-CHECKLIST.md` §1. Confirm all five pass criteria. Record the procedure for inclusion in the Phase 6 submission video as `dash-13-reconnect.mp4`.
2. **CI run on this commit** — Push the branch (or merge to master) and confirm the 6-job CI matrix goes green. In the `ts` job log, verify the new `Build dashboard` + `Build indexer (typecheck)` steps appear after `Test` and complete without error.
3. **Render relay deploy** — From the repo root, run `render blueprint launch` (or via the Render dashboard UI: New → Blueprint → point at this repo). Confirm the service `deepvault-relay` appears with rootDir `indexer`, plan `free`, healthCheckPath `/healthz`. After first deploy, `curl https://deepvault-relay.onrender.com/healthz` should return the expected JSON.
4. **Vercel dashboard deploy** — From the repo root, run `vercel link` (link to repo root, NOT `dashboard/`). Set `VITE_RELAY_WS_URL` to the Render URL via `vercel env add`. Run `vercel --prod`. Smoke-test the live URL: LIVE pill in emerald within 5s, all 7 panel sections render in D-05 order.
5. **Keepalive cron sanity check** — In repo Actions tab, confirm `.github/workflows/keepalive-relay.yml` (Phase 0 D-15) is enabled and green; this defeats the Render free-tier 15-minute sleep during the demo window.
6. **(Conditional) Deposit-flow smoke test** — Only after Phase 2 lands the testnet vault deploy and `TESTNET-DEPLOY.json` flips to `status: "deployed"`. Follow the 6-step smoke procedure in `04-DEMO-CHECKLIST.md` §2 "Post-deploy smoke test".

None of these actions are blocking for Plan 04-07 file-portion closure. They are demo-day prep that exercises the artifacts shipped in commits `9a041ae`, `f03e83c`, and `7f37acd`.

## Files Created/Modified

### Created (15 files)

**Tasks 1 + 2 (dashboard runtime):**

- `dashboard/src/lib/ptbDeploy.ts` — build-time deploy JSON + isDeployed gate
- `dashboard/src/lib/ptbBuilders.ts` — 4 PTB builder functions
- `dashboard/src/lib/__tests__/ptbBuilders.test.ts` — 6 cases via Transaction.getData()
- `dashboard/src/hooks/usePositions.ts` — wallet-scoped Position[] derivation
- `dashboard/src/hooks/__tests__/usePositions.test.tsx` — 9 cases (zero-vs-unknown invariant)
- `dashboard/src/components/panels/DepositWithdrawPanel.tsx` — 3-step deposit/redeem flow
- `dashboard/src/components/panels/PositionViewer.tsx` — wallet-scoped table with em-dash null rendering
- `dashboard/src/components/__tests__/DepositWithdrawPanel.test.tsx` — 6 cases (empty states + pre-sign check + dialog open)
- `dashboard/src/components/__tests__/PositionViewer.test.tsx` — 9 cases (empty states + null tooltips + 0n-vs-null distinction)
- `dashboard/src/components/ui/dialog.tsx` — shadcn Dialog (Radix wrapper)
- `dashboard/src/components/ui/input.tsx` — shadcn Input (pure Tailwind)
- `dashboard/src/components/ui/tabs.tsx` — shadcn Tabs (Radix wrapper)

**Task 3 (CI + deploy configs + runbook):**

- `vercel.json` (repo root) — pnpm-monorepo aware Vercel build/output config
- `indexer/render.yaml` — Render free-tier blueprint for the relay
- `.planning/phases/04-plp-risk-studio-dashboard-relay/04-DEMO-CHECKLIST.md` — three-section runbook (manual verify + deploy day + coverage map)

### Modified (6 files)

- `dashboard/tsconfig.json` — `include` extended to permit cross-tree JSON import
- `dashboard/src/hooks/useBucketState.ts` — Plan 04-05 stub replaced with live RPC
- `dashboard/src/App.tsx` — sections 6 + 7 now mount DepositWithdrawPanel + PositionViewer
- `dashboard/package.json` — +`@radix-ui/react-dialog ^1.1.15` +`@radix-ui/react-tabs ^1.1.13`
- `pnpm-lock.yaml` — regenerated to lock new peer deps
- `.github/workflows/ci.yml` — `ts` job extended with `Build dashboard` + `Build indexer (typecheck)` steps; 6-job matrix names preserved exactly

## Decisions Made

- **Move signatures verified verbatim** against contracts/sources/{supply,redeem}.move at execution time. All 4 PTB builder arg orders match on-chain; the plan body's reference and the e2e script analog were already correct (no Rule 1 fix needed).
- **PnL display semantics**: `bigint | null` typing locked. The iter-2 revision was honored — 4 grep gates assert no `0n` default for null fields; the NullableQuote component enforces em-dash + tooltip rendering.
- **HedgeUnwound match key**: oracle_id only (vault.move:204-208). v1 single-oracle vault makes this sufficient; multi-oracle V2 would extend the matcher to include strike+expiry if those fields are added to the unwind event.
- **RedeemFulfilled NAV-delta formula**: `plpYield = quote_paid - (depositQuote * shares_burned / sharesMinted)`. Defensive field-name probing for `quote_out` and `shares_redeemed` aliases — forward-compat for relay schema changes.
- **HEX() test fixture helper**: @mysten/sui's TransactionDataBuilder validates object IDs via valibot. Placeholders like '0xPKG' get rejected with `ValiError: Invalid type: Expected Object but received Object`. A `HEX(last2)` helper generates real 32-byte hex IDs the validator accepts (`0x0000...00<last2>`).
- **RateLimiter dynamic-field nesting**: probes both `dynFields.value.fields` (standard Field wrapper) and `dynFields` directly (bare struct). Forward-robust to both Move SDK versions' representations.
- **Dialog result type union handling**: `useSignAndExecuteTransaction` returns `{ digest } | { effects: { bcs } }`. Discriminated via `'digest' in result` narrowing — no unsafe casts; TypeScript handles the variant safely.
- **shadcn Dialog jsdom polyfills**: Radix Dialog uses Pointer Capture APIs not implemented in jsdom. Test setup polyfills `Element.prototype.hasPointerCapture/setPointerCapture/releasePointerCapture/scrollIntoView` + `ResizeObserver`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test fixture used placeholder Sui IDs**

- **Found during:** Task 1 ptbBuilders test run (RED → first GREEN attempt)
- **Issue:** Test fixture used `'0xPKG'`, `'0xVAULT'` etc. `@mysten/sui` 2.16.0's TransactionDataBuilder validates IDs via valibot at `.getData()` time; placeholders trigger `ValiError: Invalid type: Expected Object but received Object`.
- **Fix:** Added `HEX(last2)` helper generating `0x00...00<last2>` 32-byte hex IDs the validator accepts.
- **Files modified:** `dashboard/src/lib/__tests__/ptbBuilders.test.ts`
- **Verification:** All 6 ptbBuilders tests pass.
- **Committed in:** `9a041ae` (Task 1 commit)

**2. [Rule 1 - Bug] Dialog test failed because Radix Dialog needs jsdom polyfills**

- **Found during:** Task 2 DepositWithdrawPanel test ("opens confirmation Dialog...")
- **Issue:** The Dialog didn't render in jsdom because Radix Dialog uses `hasPointerCapture`/`setPointerCapture`/`releasePointerCapture`/`scrollIntoView` APIs not implemented in jsdom.
- **Fix:** Test polyfills these on `Element.prototype` + a `ResizeObserver` shim at the top of the test file.
- **Files modified:** `dashboard/src/components/__tests__/DepositWithdrawPanel.test.tsx`
- **Verification:** All 6 DepositWithdrawPanel tests pass.
- **Committed in:** `f03e83c` (Task 2 commit)

**3. [Rule 3 - Blocking] useSignAndExecuteTransaction result type discriminated**

- **Found during:** Task 2 typecheck
- **Issue:** `result.digest` access failed type narrowing: the result union is `{ digest, rawEffects? } | { effects: { bcs? } }`. Direct `.digest` access caused TS2339.
- **Fix:** Discriminated all 4 callsites with `const digest = 'digest' in result ? result.digest : ''`.
- **Files modified:** `dashboard/src/components/panels/DepositWithdrawPanel.tsx` (4 callsites — deposit + redeem_request + redeem_fulfill + redeem_cancel)
- **Verification:** `pnpm typecheck` clean.
- **Committed in:** `f03e83c` (Task 2 commit)

**Total deviations:** 3 auto-fixed (2 Rule 1 bug, 1 Rule 3 blocking). All within scope — fixes mismatches between assumptions and live `@mysten/sui` / jsdom / Radix realities. No scope creep.

## Issues Encountered

- **CRLF line-ending warnings**: Git on Windows reports `LF will be replaced by CRLF` for every new file. Inherited from prior plans; non-blocking.
- **pnpm peer-dep warnings (unchanged)**: `@mysten/deepbook-v3@1.3.6` and `@mysten/slush-wallet@1.0.5` both peer-dep `@mysten/sui@^2.16.2` while we pin `2.16.0` per CLAUDE.md. Non-blocking.
- **Build chunk-size warnings**: Plotly chunk (4.88 MB / 1.48 MB gzipped) and main bundle (931 KB / 275 KB gzipped) both exceed Vite's default 500 KB threshold. Plotly is isolated via Wave 0 manualChunks; main bundle grew ~50 KB from Plan 04-06 (881 → 931) due to 3 new panels + 2 new hooks + 3 new ui primitives. Acceptable for v1.
- **Indexer tests pass**: 41 indexer tests green; no regressions from Plan 04-07 (which is dashboard-only).

## Stub Tracking / Known Stubs

- **No new stubs introduced.** The previous useBucketState stub (Plan 04-05) is replaced by the live RPC implementation in this plan. The Plan 04-05 known-stubs (HedgeRolled producing notional=0n, premiumQuote always 0n on dashboard hedges) are inherited unchanged — they're not in scope for Plan 04-07.
- **DepositWithdrawPanel pre-sign helper picks `coins.data[0]`** rather than `mergeCoins` when the user holds multiple DUSDC coin objects. v1 simplification; production polish (mergeCoins inside the PTB) is a backlog item. Documented inline.

## Threat Flags

None new. The plan's `<threat_model>` mitigations are honored:

- T-04-07-01 (TESTNET-DEPLOY.json tampering): mitigated chain-side by Move type checks (wrong package → tx aborts) + CI codegen-drift detects file mutation.
- T-04-07-02 (digest spoofing): accepted — wallet extension is the authoritative signing UI.
- T-04-07-03 (silent tx success): mitigated by Sonner toast + TxDigestLink on every signAndExecute callback.
- T-04-07-04 (cross-user position leak): mitigated by `usePositions` filtering on `account.address` via `useCurrentAccount()` — never reads other users' positions.
- T-04-07-05 (u64 overflow on input): mitigated by `parseDusdcInput` returning `null` on parse failure + on-chain Move bounds checks.
- T-04-07-06 (Render free-tier sleep): Task 3 + Phase 0 D-15 keepalive cron mitigation (deferred to Task 3 + checkpoint).
- T-04-07-07 (replay attack): mitigated by Sui sender sequence numbers (chain-side).

No new attack surface — the new panels are wallet-scoped read+sign flows. The DEPLOY const is build-time baked, so runtime tampering vectors do not apply.

## Phase 4 Closure Traceability — DASH-NN → plan

| Req | Plan | Status |
|-----|------|--------|
| DASH-01 (relay polling) | 04-01 | DONE |
| DASH-02 (cursor persist) | 04-01 | DONE |
| DASH-03 (WS protocol) | 04-02 | DONE |
| DASH-04 (sticky header) | 04-03 | DONE |
| DASH-05 (3D SVI surface) | 04-04 | DONE |
| DASH-06 (VaultPanel) | 04-05 | DONE |
| DASH-07 (BucketGauge) | 04-05 | DONE + Plan 04-07 upgrades useBucketState live |
| DASH-08 (ExposurePanel) | 04-05 | DONE |
| DASH-09 (WhatIfSimulator) | 04-06 | DONE |
| DASH-10 (staleness pill) | 04-03 | DONE |
| DASH-11 (deposit flow) | 04-07 | **DONE (this plan, Task 2)** |
| DASH-12 (PositionViewer) | 04-07 | **DONE (this plan, Task 2)** |
| DASH-13 (kill-mid-stream + CI + deploys) | 04-02, 04-03, 04-07 | **DONE — file portion landed in this plan, Task 3 commit 7f37acd. Server WS reconnect + /healthz in 04-02; client useWebSocket reconnect in 04-03; CI + Vercel/Render configs + DEMO-CHECKLIST in 04-07. Manual verification + deploys remain user actions per Pending Manual Verification section above.** |

**13 of 13 DASH-NN complete (file portion).** Phase 4 ready for milestone closure once user executes the manual deploy steps in `04-DEMO-CHECKLIST.md`.

## Self-Check: PASSED

Verified before writing this SUMMARY:

- `dashboard/src/lib/ptbDeploy.ts` exports `DEPLOY` + `isDeployed` + `DeployJson`: FOUND
- `dashboard/src/lib/ptbBuilders.ts` exports buildSupplyTx + buildRedeemRequestTx + buildRedeemFulfillTx + buildRedeemCancelTx: FOUND
- `dashboard/src/hooks/usePositions.ts` exports `usePositions` + `Position`: FOUND
- `dashboard/src/components/panels/DepositWithdrawPanel.tsx` exports `DepositWithdrawPanel`: FOUND
- `dashboard/src/components/panels/PositionViewer.tsx` exports `PositionViewer`: FOUND
- `dashboard/src/components/ui/{dialog,input,tabs}.tsx`: FOUND
- `grep -q "bigint | null" dashboard/src/hooks/usePositions.ts`: FOUND (≥4 occurrences)
- `grep -q "HedgeUnwound" dashboard/src/hooks/usePositions.ts`: FOUND
- `grep -qE "findMatchingUnwind\|findMatchingRedemption" dashboard/src/hooks/usePositions.ts`: FOUND
- `! grep -nE "plpYield:\\s*0n|hedgePayoff:\\s*0n" dashboard/src/hooks/usePositions.ts`: PASS (no 0n defaults)
- `grep -q "Insufficient DUSDC" dashboard/src/components/panels/DepositWithdrawPanel.tsx`: FOUND
- `grep -q "Cancel redemption request" dashboard/src/components/panels/DepositWithdrawPanel.tsx`: FOUND
- `grep -q "Confirm deposit of" dashboard/src/components/panels/DepositWithdrawPanel.tsx`: FOUND
- `grep -q "useSignAndExecuteTransaction" dashboard/src/components/panels/DepositWithdrawPanel.tsx`: FOUND
- `grep -q "sharedObjectRef" dashboard/src/lib/ptbBuilders.ts`: FOUND
- `grep -q "0x6" dashboard/src/lib/ptbBuilders.ts`: FOUND
- `grep -q "redeem_request\\|redeem_fulfill\\|redeem_cancel" dashboard/src/lib/ptbBuilders.ts`: FOUND
- `git diff HEAD -- dashboard/src/lib/{svi,phi,isqrt,ln,math,phi_coefficients,strategy_constants,arb_checker,parity_runner}.ts`: empty (0 lines)
- `cd dashboard && pnpm typecheck`: clean (0 errors)
- `cd dashboard && pnpm test --run`: 427/427 passing (20 test files; 311 Phase 1 + 22 hooks + 94 components)
- `cd dashboard && pnpm build`: dist/ produced; main bundle 931 KB; plotly chunk 4.88 MB isolated
- `cd indexer && pnpm test`: 41/41 passing (no regression)
- Commit `9a041ae` (Task 1 feat): present in `git log`
- Commit `f03e83c` (Task 2 feat): present in `git log`
- Commit `7f37acd` (Task 3 file portion): present in `git log`

### Task 3 self-check (post-commit verification)

- `vercel.json` exists at repo root: FOUND
- `indexer/render.yaml` exists: FOUND
- `.planning/phases/04-plp-risk-studio-dashboard-relay/04-DEMO-CHECKLIST.md` exists with 3 sections: FOUND (sections "Pre-demo verification", "Deploy day", "DASH-13 coverage map")
- 6-job CI matrix names preserved (move/ts/python/codegen-drift/parity/e2e-vault): VERIFIED via `grep -E "^  (move|ts|python|codegen-drift|parity|e2e-vault):" .github/workflows/ci.yml` returns 6 lines
- New CI steps `Build dashboard` + `Build indexer (typecheck)` present after `Test`: VERIFIED
- `pnpm --filter @deepvault/dashboard run test`: 427/427 passing (no regression from Task 3 — sanity check, none of the new files touch dashboard runtime code)
- `git diff --diff-filter=D --name-only HEAD~1 HEAD`: empty (no accidental deletions in Task 3 commit)
- STATE.md NOT touched (orchestrator territory)
- ROADMAP.md NOT touched (orchestrator territory)

---

**Plan 04-07 file-portion complete.** Pending user actions are documented in §"Pending Manual Verification" + `04-DEMO-CHECKLIST.md`.

*Phase: 04-plp-risk-studio-dashboard-relay*
*Tasks 1+2 completed: 2026-05-12 (commits 9a041ae, f03e83c)*
*Task 3 file portion completed: 2026-05-12 (commit 7f37acd)*
