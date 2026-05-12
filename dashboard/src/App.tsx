// dashboard/src/App.tsx — Layout shell wired with the WebSocket relay client
// (Plan 04-03 Task 3). Section order is LOCKED per UI-SPEC D-05:
//
//   1. Hero (SurfacePanel — Plan 04)
//   2. ArbCheckerPanel (Plan 04)
//   3. VaultPanel + BucketGauge (Plan 05)
//   4. ExposurePanel (Plan 05)
//   5. WhatIfSimulator (Plan 06)
//   6. DepositWithdrawPanel (Plan 07)
//   7. PositionViewer (Plan 07)
//
// Sections are empty `<section data-section="...">` placeholders so downstream
// plans can inject panels without touching this shell.
//
// The Header (sticky, contains ConnectButton + GlobalStalenessPill +
// RelayStatusPill) consumes the WS state machine. When the relay is down for
// >=60s, an inline alert appears above the section grid per UI-SPEC §WebSocket
// reconnect "RELAY DOWN body inline alert".

import { Header } from './components/layout/Header';
import { useWebSocket } from './hooks/useWebSocket';
import { env } from './env';

export function App() {
  const { state, snapshot } = useWebSocket(env.relayWsUrl);

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
        <section data-section="hero" />
        <section data-section="arb-checker" />
        <section data-section="vault-bucket" />
        <section data-section="exposure" />
        <section data-section="what-if" />
        <section data-section="deposit-withdraw" />
        <section data-section="position-viewer" />
      </main>
    </div>
  );
}
