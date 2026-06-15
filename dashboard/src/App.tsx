// dashboard/src/App.tsx — dashboard layout shell.
//
// Plan 04.1-02 Task 3 (UI-SPEC #7, #10, LD-1, LD-3, LD-4). Restructured from
// the Phase 4 flat single-column vertical stack into the handoff `dash-body`
// shell: a 232px rail + 1fr main two-column grid, a headline strip with a
// 4-cell `dh-stats` block, and a 3-row `1.6fr/1fr` card grid.
//
// This is a LAYOUT MOVE, not a rewire. The useWebSocket data spine and every
// panel prop are byte-identical to the Phase 4 wiring; the panels are simply
// re-placed into their final grid cells (their internal reskins are Waves 3-5).
//
// Data spine (unchanged from Phase 4):
//   useWebSocket(env.relayWsUrl) -> { state, snapshot }
//     useSurfaceSnapshot(snapshot) -> SurfacePanel + ArbCheckerPanel
//     useVaultState(snapshot)      -> dh-stats strip + DepositWithdrawPanel
//                                     (the vault-state figures render in the
//                                      headline strip; the standalone vault
//                                      card is NOT mounted — this resolves the
//                                      Plan 03 conditional, data path stays)
//     useExposure(snapshot)        -> ExposurePanel + WhatIfSimulator + dh-stats
//     useSigmaEstimates(snapshot)  -> WhatIfSimulator
//     usePositions(snapshot)       -> PositionViewer
//
// The 3-row grid (UI-SPEC §Main grid):
//   r1: SVI surface card  | side column { Token bucket, Per-oracle exposure }
//   r2: Positions card    | What-if "Shock the book" card
//   r3: Backtest link card (static, LD-3) | Event-stream card (EventStreamPanel)

import { useCallback, useState } from 'react';

import { DashboardLoader } from './components/layout/DashboardLoader';
import { Header } from './components/layout/Header';
import { Rail } from './components/layout/Rail';
import { Tabs, TabsList, TabsTrigger } from './components/ui/tabs';
import { ArbCheckerPanel } from './components/panels/ArbCheckerPanel';
import { BucketGauge } from './components/panels/BucketGauge';
import { DepositWithdrawPanel } from './components/panels/DepositWithdrawPanel';
import { EventStreamPanel } from './components/panels/EventStreamPanel';
import { ExposurePanel } from './components/panels/ExposurePanel';
import { PositionViewer } from './components/panels/PositionViewer';
import { SurfacePanel } from './components/panels/SurfacePanel';
import { WhatIfSimulator } from './components/panels/WhatIfSimulator';
import { env } from './env';
import { useExposure } from './hooks/useExposure';
import { usePositions } from './hooks/usePositions';
import { useSigmaEstimates } from './hooks/useSigmaEstimates';
import { useSurfaceSnapshot } from './hooks/useSurfaceSnapshot';
import { useVaultState } from './hooks/useVaultState';
import { useWebSocket } from './hooks/useWebSocket';
import { STRATEGY_CONSTANTS } from './lib/strategy_constants';

// DUSDC has 6 decimals — micro-unit divisor for NAV display.
const DUSDC_MICRO = 1_000_000;

// Hedge-ratio target band, derived from the codegen allocation constant.
// ALLOCATION_BPS is the target hedge allocation in basis points; the band is a
// ±0.4-point tolerance around it (mirrors the handoff's "target 7.6 – 8.4").
const HEDGE_TARGET_PCT = STRATEGY_CONSTANTS.ALLOCATION_BPS / 100;
const HEDGE_BAND_LO = (HEDGE_TARGET_PCT - 0.4).toFixed(1);
const HEDGE_BAND_HI = (HEDGE_TARGET_PCT + 0.4).toFixed(1);

export function App() {
  const { state, snapshot } = useWebSocket(env.relayWsUrl);
  const surface = useSurfaceSnapshot(snapshot);
  const vaultView = useVaultState(snapshot);
  const hedges = useExposure(snapshot);
  const sigma = useSigmaEstimates(snapshot);
  const positions = usePositions(snapshot);

  // View mode (Phase 04.2, LD-1 / LD-2). Default = Vault (deposit-first front
  // door). Client-side React state ONLY — no router, no persistence; a refresh
  // returns to Vault. Declared BELOW the useWebSocket spine + the 5 derived
  // hooks above, so toggling the mode (which unmounts one subtree) never tears
  // down the data spine (LD-3 spine-above-conditional invariant).
  const [mode, setMode] = useState<'vault' | 'risk'>('vault');

  // The top-bar `Deposit DUSDC` button scrolls to the deposit/withdraw section
  // so the user lands on the existing 3-step deposit flow. The deposit section
  // only mounts in vault mode, so switch to vault FIRST, then scroll after the
  // mode-switched render commits (Anchor Integrity rule 3). The panel owns its
  // own dialog open-state (Phase 4) — this is the non-regressive coordination.
  const handleDepositClick = useCallback(() => {
    setMode('vault');
    // The deposit section only mounts in vault mode; defer the scroll one frame
    // so the mode-switched render commits before we query the anchor.
    requestAnimationFrame(() => {
      const el = document.querySelector('[data-section="deposit-withdraw"]');
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, []);

  // ---- Headline `dh-stats` derived figures (UI-SPEC Data Binding table) ----
  // VaultPanel is a pure data feeder; these values render in the strip below.
  const hasHedges = hedges.length > 0;

  // Vault NAV — total_assets in DUSDC micro-units -> dollars.
  const navDollars = vaultView
    ? Number(vaultView.vault.total_assets) / DUSDC_MICRO
    : null;
  const navLabel =
    navDollars === null
      ? '—'
      : `~$${navDollars.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

  // Utilization — basis points -> percent.
  const utilPct = vaultView ? Number(vaultView.utilizationBps) / 100 : null;
  const utilLabel = utilPct === null ? '—' : utilPct.toFixed(1);

  // Hedge ratio — hedge notional / NAV. At demo-open (zero hedges) -> 0.0%.
  const hedgeNotional = hedges.reduce(
    (sum, h) => sum + Number(h.notionalQuote) / DUSDC_MICRO,
    0,
  );
  const hedgeRatioPct =
    navDollars && navDollars > 0 ? (hedgeNotional / navDollars) * 100 : 0;
  const hedgeRatioLabel = hedgeRatioPct.toFixed(1);

  return (
    <>
      {/* First-paint SVI-draw loading overlay (D-04). Purely presentational —
          rendered as a sibling overlay above the dash-body shell, it fades out
          on its own timer and never blocks the useWebSocket data spine, which
          is already running from the top of this component. */}
      <DashboardLoader />
      <div className="dash-body">
        <Rail />
      <main className="dash" data-testid="dashboard-main">
        <Header
          wsState={state}
          snapshot={snapshot}
          onDepositClick={handleDepositClick}
        />

        {/* Relay reconnect/down inline alert — copy preserved verbatim
            (UI-SPEC marks it as already-shipped; color reskin is a later wave). */}
        {(state === 'reconnecting' || state === 'down') && (
          <div
            className={
              state === 'down'
                ? 'mt-6 rounded-md border border-rose-600/40 bg-rose-600/10 p-4 text-sm'
                : 'mt-6 rounded-md border border-amber-500/40 bg-amber-500/10 p-4 text-sm'
            }
            role="alert"
          >
            <p
              className={
                state === 'down'
                  ? 'font-semibold text-rose-300'
                  : 'font-semibold text-amber-300'
              }
            >
              {state === 'down' ? 'Relay disconnected' : 'Reconnecting to relay'}
            </p>
            <p className="mt-1 text-slate-300">
              Live updates paused. On-chain state still readable via direct RPC.
              Reconnecting automatically.
            </p>
          </div>
        )}

        {/* HEADLINE — eyebrow + h1 + 4-cell dh-stats strip (UI-SPEC #7). */}
        <section className="db-headline">
          <div>
            <div className="dh-eye">
              {mode === 'vault' ? 'Vault' : 'PLP Risk Studio'}
            </div>
            <h1>
              {mode === 'vault' ? (
                <>
                  Earn PLP yield with built-in crash protection — deposit DUSDC,
                  the vault provides DeepBook liquidity and automatically buys
                  downside <span className="hl-serif">insurance</span>.
                </>
              ) : hasHedges ? (
                <>
                  Vault is healthy. <span className="hl-serif">Hedge</span> is in
                  position.
                </>
              ) : (
                <>
                  Vault is live. <span className="hl-serif">Hedge</span> engages
                  on first deposit.
                </>
              )}
            </h1>
          </div>
          <div className="dh-stats">
            <div className="dh-stat">
              <span className="dh-k">Net APY</span>
              {/* No completed cycle yet at demo-open -> em-dash. */}
              <span className="dh-v">—</span>
              <span className="dh-trend">awaiting first cycle</span>
            </div>
            <div className="dh-stat">
              <span className="dh-k">Hedge ratio</span>
              <span className="dh-v">
                {hedgeRatioLabel}
                <i>%</i>
              </span>
              <span className="dh-trend">
                target {HEDGE_BAND_LO} – {HEDGE_BAND_HI}
              </span>
            </div>
            <div className="dh-stat">
              <span className="dh-k">Utilization</span>
              <span className="dh-v">
                {utilLabel}
                <i>%</i>
              </span>
              <span className="dh-trend">escrow vs capacity</span>
            </div>
            <div className="dh-stat">
              <span className="dh-k">Vault NAV</span>
              <span className="dh-v">{navLabel}</span>
              <span className="dh-trend">testnet seed</span>
            </div>
          </div>
        </section>

        {/* MODE TOGGLE — segmented Vault | Risk Studio control (Phase 04.2,
            LD-1, OQ-1). Controlled Radix Tabs (value={mode}) for the control
            chrome + a11y (role=tablist, aria-selected, ←/→/Home/End roving
            focus). The two view subtrees are rendered as conditionally-mounted
            SIBLINGS below — NOT inside TabsContent — so the inactive mode is
            fully unmounted (avoids two Plotly trees) while the spine above
            stays live (LD-3). Wrapper margin comes from the .db-mode-row CSS
            class (Task 1), not an inline style. */}
        <Tabs
          value={mode}
          onValueChange={(v) => setMode(v as 'vault' | 'risk')}
          className="db-mode-row"
        >
          <TabsList className="db-mode" aria-label="Dashboard view mode">
            <TabsTrigger className="db-mode-trigger" value="vault">
              Vault
            </TabsTrigger>
            <TabsTrigger className="db-mode-trigger" value="risk">
              Risk Studio
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {mode === 'vault' ? (
          /* VAULT VIEW (default landing, LD-4) — single-column onboarding
             stack: Deposit/Redeem → Your position → hedge-status line. */
          <>
            {/* Deposit/Redeem promoted to the TOP (today it rendered last).
                data-section is the Header CTA + rail Deposit anchor target. */}
            <section data-section="deposit-withdraw" style={{ paddingTop: '0' }}>
              <DepositWithdrawPanel vaultView={vaultView} />
            </section>
            {/* Your position — the single live PositionViewer mount (D-1 /
                R-2 path a). NOT also mounted in Risk. Internals byte-identical
                (its longer runtime testnet copy is unchanged). */}
            <section
              data-section="position-viewer"
              style={{ paddingTop: '24px' }}
            >
              <PositionViewer
                positions={positions}
                vault={snapshot?.vault ?? null}
              />
            </section>
            {/* One-line hedge-status summary (LD-4 #5) — reuses hasHedges. */}
            <p
              className="mono"
              style={{
                color: 'var(--text-2)',
                fontSize: '12.5px',
                paddingTop: '16px',
              }}
            >
              {hasHedges
                ? 'Hedge in position — downside protection active.'
                : 'Hedge engages on first deposit.'}
            </p>
          </>
        ) : (
          /* RISK STUDIO VIEW (LD-5) — the existing quant grid, minus the
             trailing deposit section (moved to Vault) and minus PositionViewer
             (moved to Vault). EventStream pulled into r2's left cell so no
             empty cell is left (UI-SPEC R-2 path a). */
          <>
            {/* ROW 1 — SVI surface | side column (Token bucket + Exposure). */}
            <section className="db-row r1">
              <section data-section="hero">
                <SurfacePanel surface={surface} />
                <ArbCheckerPanel surface={surface} />
              </section>
              <div className="db-side">
                <BucketGauge />
                <section data-section="exposure">
                  <ExposurePanel hedges={hedges} vault={snapshot?.vault ?? null} />
                </section>
              </div>
            </section>
            {/* ROW 2 — Activity (event stream) | What-if. PositionViewer moved
                to Vault view (R-2 path a); EventStream pulled left to fill the
                cell. */}
            <section className="db-row r2">
              <section data-section="event-stream">
                <EventStreamPanel events={snapshot?.ring_buffer ?? []} />
              </section>
              <section data-section="what-if">
                <WhatIfSimulator hedges={hedges} surface={surface} sigma={sigma} />
              </section>
            </section>
            {/* ROW 3 — Backtest static-link card (LD-3). Lone card in r3 is
                acceptable for this phase (no fictional filler — 04.1 LD-5). */}
            <section className="db-row r3">
              <section data-section="backtest">
                <div className="db-card pad">
                  <header className="db-h">
                    <div>
                      <span className="db-mark">§ Backtest</span>
                      <h2>Backtest report</h2>
                    </div>
                  </header>
                  {/* Static link card — NO live data binding (LD-3, LD-5). */}
                  <p style={{ color: 'var(--text-2)', lineHeight: 1.55 }}>
                    12-cycle replay · lookahead-audited. Full institutional
                    report renders drawdown, NAV, and premium-drag tables.
                  </p>
                  <p
                    className="mono"
                    style={{
                      color: 'var(--dim)',
                      fontSize: '11.5px',
                      marginTop: '8px',
                    }}
                  >
                    Report renders from the nightly backtest run.
                  </p>
                  <a
                    href="/reports/full-365d-report.html"
                    style={{
                      display: 'inline-block',
                      marginTop: '14px',
                      color: 'var(--accent)',
                    }}
                  >
                    Open backtest report ↗
                  </a>
                </div>
              </section>
            </section>
          </>
        )}
      </main>
      </div>
    </>
  );
}
