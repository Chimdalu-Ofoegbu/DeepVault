// dashboard/src/App.tsx — Layout shell per CONTEXT.md D-05.
//
// Section order (sticky header + single-scrolling page; UI-SPEC D-05):
//   1. Hero (SurfacePanel — Plan 04)
//   2. ArbCheckerPanel (Plan 04)
//   3. VaultPanel + BucketGauge (Plan 05)
//   4. ExposurePanel (Plan 05)
//   5. WhatIfSimulator (Plan 06)
//   6. DepositWithdrawPanel (Plan 07)
//   7. PositionViewer (Plan 07)
//
// Sections ship as empty `<section data-section="...">` placeholders so
// downstream plans can `replaceWith`-style inject real panels without
// touching this shell. Plan 03 (header) will fill the header-controls
// slot with RelayStatusPill + GlobalStalenessPill + ConnectButton.

export function App() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-50 border-b border-slate-800 bg-slate-900/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1280px] items-center justify-between px-6 py-4">
          <h1 className="text-[28px] font-semibold leading-[1.2]">PLP Risk Studio</h1>
          {/* Plan 03 fills: <RelayStatusPill /> <GlobalStalenessPill /> <ConnectButton /> */}
          <div data-testid="header-controls" />
        </div>
      </header>
      <main
        className="mx-auto max-w-[1280px] px-6 py-12 space-y-8"
        data-testid="dashboard-main"
      >
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
