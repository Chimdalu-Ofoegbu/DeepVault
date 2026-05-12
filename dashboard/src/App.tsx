// dashboard/src/App.tsx — Layout shell wired with the WebSocket relay client
// (Plan 04-03 Task 3), the Wave 3 hero panels (Plan 04-04), and the Wave 3
// vault-side panels (Plan 04-05). Section order is LOCKED per UI-SPEC D-05:
//
//   1. Hero (SurfacePanel)             — Plan 04-04
//   2. ArbCheckerPanel                  — Plan 04-04
//   3. VaultPanel + BucketGauge         — Plan 04-05 (this plan)
//   4. ExposurePanel                    — Plan 04-05 (this plan)
//   5. WhatIfSimulator                  — Plan 06
//   6. DepositWithdrawPanel             — Plan 07
//   7. PositionViewer                   — Plan 07
//
// The Header (sticky, contains ConnectButton + GlobalStalenessPill +
// RelayStatusPill) consumes the WS state machine. When the relay is down for
// >=60s, an inline alert appears above the section grid per UI-SPEC §WebSocket
// reconnect "RELAY DOWN body inline alert".
//
// Data flow:
//   useWebSocket(env.relayWsUrl) -> { state, snapshot }
//     useSurfaceSnapshot(snapshot) -> SurfaceView (SurfacePanel + ArbCheckerPanel)
//     useVaultState(snapshot)      -> VaultView (VaultPanel)
//     useExposure(snapshot)        -> Hedge[] (ExposurePanel)
//     useCurrentAccount() (inside) -> wallet state (BucketGauge)

import { Header } from './components/layout/Header';
import { ArbCheckerPanel } from './components/panels/ArbCheckerPanel';
import { BucketGauge } from './components/panels/BucketGauge';
import { ExposurePanel } from './components/panels/ExposurePanel';
import { SurfacePanel } from './components/panels/SurfacePanel';
import { VaultPanel } from './components/panels/VaultPanel';
import { WhatIfSimulator } from './components/panels/WhatIfSimulator';
import { env } from './env';
import { useExposure } from './hooks/useExposure';
import { useSigmaEstimates } from './hooks/useSigmaEstimates';
import { useSurfaceSnapshot } from './hooks/useSurfaceSnapshot';
import { useVaultState } from './hooks/useVaultState';
import { useWebSocket } from './hooks/useWebSocket';

export function App() {
  const { state, snapshot } = useWebSocket(env.relayWsUrl);
  const surface = useSurfaceSnapshot(snapshot);
  const vaultView = useVaultState(snapshot);
  const hedges = useExposure(snapshot);
  const sigma = useSigmaEstimates(snapshot);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <Header wsState={state} snapshot={snapshot} />
      <main
        className="mx-auto max-w-[1280px] px-6 py-12 space-y-8"
        data-testid="dashboard-main"
      >
        {state === 'down' && (
          <div
            className="rounded-md border border-rose-600/40 bg-rose-600/10 p-4 text-sm"
            role="alert"
          >
            <p className="font-semibold text-rose-300">Relay disconnected</p>
            <p className="mt-1 text-slate-300">
              Live updates paused. On-chain state still readable via direct RPC.
              Reconnecting automatically.
            </p>
          </div>
        )}
        <section data-section="hero">
          <SurfacePanel surface={surface} />
        </section>
        <section data-section="arb-checker">
          <ArbCheckerPanel surface={surface} />
        </section>
        <section
          data-section="vault-bucket"
          className="grid grid-cols-1 gap-6 md:grid-cols-2"
        >
          <VaultPanel view={vaultView} />
          <BucketGauge />
        </section>
        <section data-section="exposure">
          <ExposurePanel hedges={hedges} vault={snapshot?.vault ?? null} />
        </section>
        <section data-section="what-if">
          <WhatIfSimulator hedges={hedges} surface={surface} sigma={sigma} />
        </section>
        <section data-section="deposit-withdraw" />
        <section data-section="position-viewer" />
      </main>
    </div>
  );
}
