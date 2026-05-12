// dashboard/src/App.tsx — Layout shell wired with the WebSocket relay client
// (Plan 04-03 Task 3) and the Wave 3 hero panels (Plan 04-04). Section order
// is LOCKED per UI-SPEC D-05:
//
//   1. Hero (SurfacePanel)             — Plan 04-04 (this plan)
//   2. ArbCheckerPanel                  — Plan 04-04 (this plan)
//   3. VaultPanel + BucketGauge         — Plan 05
//   4. ExposurePanel                    — Plan 05
//   5. WhatIfSimulator                  — Plan 06
//   6. DepositWithdrawPanel             — Plan 07
//   7. PositionViewer                   — Plan 07
//
// The Header (sticky, contains ConnectButton + GlobalStalenessPill +
// RelayStatusPill) consumes the WS state machine. When the relay is down for
// >=60s, an inline alert appears above the section grid per UI-SPEC §WebSocket
// reconnect "RELAY DOWN body inline alert".
//
// Surface flows: useWebSocket -> snapshot -> useSurfaceSnapshot -> SurfacePanel
// + ArbCheckerPanel. The same SurfaceView projection feeds both hero panels so
// downstream Plans 04-05+ can compose additional consumers from the same hook.

import { Header } from './components/layout/Header';
import { ArbCheckerPanel } from './components/panels/ArbCheckerPanel';
import { SurfacePanel } from './components/panels/SurfacePanel';
import { env } from './env';
import { useSurfaceSnapshot } from './hooks/useSurfaceSnapshot';
import { useWebSocket } from './hooks/useWebSocket';

export function App() {
  const { state, snapshot } = useWebSocket(env.relayWsUrl);
  const surface = useSurfaceSnapshot(snapshot);

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
        <section data-section="vault-bucket" />
        <section data-section="exposure" />
        <section data-section="what-if" />
        <section data-section="deposit-withdraw" />
        <section data-section="position-viewer" />
      </main>
    </div>
  );
}
