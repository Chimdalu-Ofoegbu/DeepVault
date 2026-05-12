// dashboard/src/components/__tests__/WhatIfSimulator.test.tsx — Plan 04-06 Task 2.
//
// Validates DASH-09 contracts:
//   - Empty state (hedges.length === 0) renders the verbatim UI-SPEC copy
//   - Populated state renders sliders + Recharts BarChart + Total PnL row
//   - Reset button clears both sliders to 0
//   - Esc key (focused inside the panel body) also resets
//   - Amber "Bootstrap σ" Badge rendered in CardDescription when
//     sigma.isBootstrap=true, with tooltip distinguishing theta vs spot
//     bootstrap reasons (STRIDE T-04-06-04)
//   - Amber "Using synthetic forward — connect oracle for live pricing"
//     Badge rendered when forwardPrice prop is omitted (STRIDE T-04-06-05)
//   - When forwardPrice IS supplied AND sigma.isBootstrap=false → neither
//     amber badge renders
//
// Recharts in jsdom: ResponsiveContainer requires a width to render SVG
// content. We assert on the chart container's data-testid + the copy in
// CardDescription, not on SVG dimensions.

import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

import { WhatIfSimulator } from '@/components/panels/WhatIfSimulator';
import type { Hedge } from '@/hooks/useExposure';
import type { SigmaEstimates } from '@/hooks/useSigmaEstimates';
import type { SurfaceView } from '@/hooks/useSurfaceSnapshot';
import type { SVIParams } from '@/lib/svi';

// ResizeObserver shim — Recharts ResponsiveContainer reaches for it.
class ResizeObserverPolyfill {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(
  globalThis as unknown as { ResizeObserver: typeof ResizeObserverPolyfill }
).ResizeObserver =
  (
    globalThis as unknown as {
      ResizeObserver: typeof ResizeObserverPolyfill;
    }
  ).ResizeObserver ?? ResizeObserverPolyfill;

const VALID_SVI: SVIParams = {
  a: 1_500_000_000n,
  b: 200_000_000n,
  rho: -300_000_000n,
  m: 100_000_000n,
  sigma: 400_000_000n,
};

const SURFACE_FIXTURE: SurfaceView = {
  raw: {
    oracle_id: '0xORACLE_BTC',
    a: '1500000000',
    b: '200000000',
    rho_signed: '-300000000',
    m_signed: '100000000',
    sigma: '400000000',
    timestamp_ms: String(Date.now()),
    last_updated_ms: String(Date.now()),
  },
  svi: VALID_SVI,
  lastUpdatedMs: Date.now(),
};

const HEDGE_FIXTURE: Hedge[] = [
  {
    marketKey: '0xORACLE_BTC|85000000000000|9999999999999|down',
    oracleId: '0xORACLE_BTC',
    strike: 85_000n * 1_000_000_000n,
    strikeDisplay: '85000.00',
    expiryMs: Date.now() + 14 * 24 * 60 * 60 * 1000,
    expiryDisplay: '2026-05-26 12:00',
    direction: 'down',
    notionalQuote: 10_000_000n,
    premiumQuote: 0n,
  },
  {
    marketKey: '0xORACLE_BTC|80000000000000|9999999999999|down',
    oracleId: '0xORACLE_BTC',
    strike: 80_000n * 1_000_000_000n,
    strikeDisplay: '80000.00',
    expiryMs: Date.now() + 14 * 24 * 60 * 60 * 1000,
    expiryDisplay: '2026-05-26 12:00',
    direction: 'down',
    notionalQuote: 5_000_000n,
    premiumQuote: 0n,
  },
];

const BOOTSTRAP_SIGMA: SigmaEstimates = {
  sigmaThetaPct: 20,
  sigmaSpotPct: 20,
  isBootstrap: true,
  isThetaBootstrap: true,
  observationCount: 0,
};

const LIVE_SIGMA: SigmaEstimates = {
  sigmaThetaPct: 7.5,
  sigmaSpotPct: 20,
  // spot leg still forces isBootstrap=true under v1 — but to exercise the
  // "no badges" path we also need the case where the caller has supplied a
  // forwardPrice AND set isBootstrap=false (hypothetical post-D-08 world).
  isBootstrap: false,
  isThetaBootstrap: false,
  observationCount: 30,
};

describe('WhatIfSimulator', () => {
  it('empty state: renders "Connect wallet to simulate" copy verbatim', () => {
    render(
      <WhatIfSimulator
        hedges={[]}
        surface={SURFACE_FIXTURE}
        sigma={BOOTSTRAP_SIGMA}
      />,
    );
    expect(screen.getByText('Connect wallet to simulate')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Sliders shock your open hedges by spot ±5σ and vol ±2σ. PnL is recomputed in your browser.',
      ),
    ).toBeInTheDocument();
  });

  it('populated: renders sliders + PnL chart + Total PnL row', () => {
    render(
      <WhatIfSimulator
        hedges={HEDGE_FIXTURE}
        surface={SURFACE_FIXTURE}
        sigma={BOOTSTRAP_SIGMA}
      />,
    );
    // Sliders present (Radix renders role=slider on each Thumb).
    const sliders = screen.getAllByRole('slider');
    expect(sliders.length).toBeGreaterThanOrEqual(2);
    // PnL chart container present.
    expect(screen.getByTestId('pnl-chart')).toBeInTheDocument();
    // Total PnL row present.
    expect(screen.getByText(/Total PnL:/)).toBeInTheDocument();
    // Reset button present with UI-SPEC copy.
    expect(
      screen.getByRole('button', { name: /Reset sliders/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('Reset to current')).toBeInTheDocument();
  });

  it('Reset button clears sliders back to 0%', () => {
    const { container } = render(
      <WhatIfSimulator
        hedges={HEDGE_FIXTURE}
        surface={SURFACE_FIXTURE}
        sigma={BOOTSTRAP_SIGMA}
      />,
    );
    // Locate the percent readout for each slider (initial: "0.00%").
    const percentTexts = container.querySelectorAll('span.tabular-nums');
    expect(percentTexts.length).toBeGreaterThanOrEqual(2);
    // Initial state both at 0.00%.
    for (const el of Array.from(percentTexts).slice(0, 2)) {
      expect(el.textContent).toBe('0.00%');
    }
    // Simulate slider change via Radix: dispatch keyboard arrow keys on first
    // slider. Radix uses ArrowRight to step up by `step`.
    const sliders = screen.getAllByRole('slider');
    sliders[0].focus();
    fireEvent.keyDown(sliders[0], { key: 'ArrowRight' });
    fireEvent.keyDown(sliders[0], { key: 'ArrowRight' });
    // Click Reset.
    fireEvent.click(screen.getByRole('button', { name: /Reset sliders/i }));
    // Both readouts back to 0.00%.
    const after = container.querySelectorAll('span.tabular-nums');
    for (const el of Array.from(after).slice(0, 2)) {
      expect(el.textContent).toBe('0.00%');
    }
  });

  it('Esc key resets sliders when focused inside the panel body', () => {
    const { container } = render(
      <WhatIfSimulator
        hedges={HEDGE_FIXTURE}
        surface={SURFACE_FIXTURE}
        sigma={BOOTSTRAP_SIGMA}
      />,
    );
    const sliders = screen.getAllByRole('slider');
    sliders[0].focus();
    fireEvent.keyDown(sliders[0], { key: 'ArrowRight' });
    // Locate the focus-scope div by walking up to the element with tabIndex=-1.
    const scope = container.querySelector('[tabindex="-1"]');
    expect(scope).toBeTruthy();
    fireEvent.keyDown(scope!, { key: 'Escape' });
    const after = container.querySelectorAll('span.tabular-nums');
    for (const el of Array.from(after).slice(0, 2)) {
      expect(el.textContent).toBe('0.00%');
    }
  });

  it('bootstrap caption visible under sliders when isBootstrap=true', () => {
    render(
      <WhatIfSimulator
        hedges={HEDGE_FIXTURE}
        surface={SURFACE_FIXTURE}
        sigma={BOOTSTRAP_SIGMA}
      />,
    );
    expect(
      screen.getByText(/bootstrap fallback: <7d history; using 20% σ/),
    ).toBeInTheDocument();
  });

  it('renders amber "Bootstrap σ" Badge when sigma.isBootstrap=true', () => {
    render(
      <WhatIfSimulator
        hedges={HEDGE_FIXTURE}
        surface={SURFACE_FIXTURE}
        sigma={BOOTSTRAP_SIGMA}
      />,
    );
    expect(screen.getByText('Bootstrap σ')).toBeInTheDocument();
  });

  it('renders amber "Using synthetic forward — connect oracle for live pricing" Badge when forwardPrice prop is omitted', () => {
    render(
      <WhatIfSimulator
        hedges={HEDGE_FIXTURE}
        surface={SURFACE_FIXTURE}
        sigma={BOOTSTRAP_SIGMA}
      />,
    );
    expect(
      screen.getByText(
        'Using synthetic forward — connect oracle for live pricing',
      ),
    ).toBeInTheDocument();
  });

  it('does NOT render either amber Badge when forwardPrice IS supplied AND sigma.isBootstrap=false', () => {
    render(
      <WhatIfSimulator
        hedges={HEDGE_FIXTURE}
        surface={SURFACE_FIXTURE}
        sigma={LIVE_SIGMA}
        forwardPrice={100_000n * 1_000_000_000n}
      />,
    );
    expect(screen.queryByText('Bootstrap σ')).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        'Using synthetic forward — connect oracle for live pricing',
      ),
    ).not.toBeInTheDocument();
  });

  it('tooltip on Bootstrap σ Badge distinguishes theta vs spot reasons', () => {
    const { rerender } = render(
      <WhatIfSimulator
        hedges={HEDGE_FIXTURE}
        surface={SURFACE_FIXTURE}
        sigma={BOOTSTRAP_SIGMA}
      />,
    );
    const badge = screen.getByText('Bootstrap σ');
    // title attr lives on the badge div (or wrapping div); check the closest
    // ancestor whose `title` attribute is set.
    let el: HTMLElement | null = badge as HTMLElement;
    while (el && !el.getAttribute('title')) el = el.parentElement;
    expect(el?.getAttribute('title') ?? '').toContain(
      'AND theta-leg σ uses fallback',
    );

    // Re-render with theta live, spot bootstrap (sigma.isBootstrap=true,
    // isThetaBootstrap=false) — the tooltip wording should change.
    rerender(
      <WhatIfSimulator
        hedges={HEDGE_FIXTURE}
        surface={SURFACE_FIXTURE}
        sigma={{
          ...BOOTSTRAP_SIGMA,
          isThetaBootstrap: false,
          observationCount: 30,
        }}
      />,
    );
    const badge2 = screen.getByText('Bootstrap σ');
    let el2: HTMLElement | null = badge2 as HTMLElement;
    while (el2 && !el2.getAttribute('title')) el2 = el2.parentElement;
    expect(el2?.getAttribute('title') ?? '').toContain(
      'Theta-leg σ is live (30 observations)',
    );
  });
});
