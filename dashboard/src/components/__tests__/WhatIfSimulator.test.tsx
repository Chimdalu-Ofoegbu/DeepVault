// dashboard/src/components/__tests__/WhatIfSimulator.test.tsx — Plan 04.1-04 Task 2.
//
// Validates the Phase 04.1 reskin (UI-SPEC #6, researcher decision R-1):
//   - the 2 sliders are REPLACED by a symmetric ±5σ 7-button shock-row
//     (−5σ/−3σ/−2σ/flat/+2σ/+3σ/+5σ — no −7σ, PROJECT.md ±5σ scope lock)
//   - clicking a button sets it active, clears the others, and feeds the σ
//     step into the EXISTING whatIf.ts compute (reused unchanged)
//   - the shock-stats grid + shock-bar render bound to the real compute
//   - empty state (zero hedges) keeps the buttons visible + shows the
//     disabled-state copy verbatim
//   - Preview mode still works (synthetic hedge demo)
//
// Test contract updated for the reskin (Rule 1): the Phase-4 assertions
// checked the removed <Slider>s, Reset/Esc behavior, slider bootstrap
// captions, and the amber badges — all replaced by the shock-row. The
// behavioral coverage (empty state, preview mode, compute reuse) is preserved.

import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { WhatIfSimulator } from '@/components/panels/WhatIfSimulator';
import type { Hedge } from '@/hooks/useExposure';
import type { SigmaEstimates } from '@/hooks/useSigmaEstimates';
import type { SurfaceView } from '@/hooks/useSurfaceSnapshot';
import type { SVIParams } from '@/lib/svi';

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
];

const BOOTSTRAP_SIGMA: SigmaEstimates = {
  sigmaThetaPct: 20,
  sigmaSpotPct: 20,
  isBootstrap: true,
  isThetaBootstrap: true,
  observationCount: 0,
};

describe('WhatIfSimulator', () => {
  it('empty state: keeps the shock-row visible + shows the disabled-state copy verbatim', () => {
    render(
      <WhatIfSimulator hedges={[]} surface={SURFACE_FIXTURE} sigma={BOOTSTRAP_SIGMA} />,
    );
    // Disabled-state copy (UI-SPEC verbatim).
    expect(
      screen.getByText(
        'Shock scenarios activate once the vault holds a hedge. Deposit DUSDC to open the first leg.',
      ),
    ).toBeInTheDocument();
    // Shock buttons remain visible.
    expect(screen.getByRole('button', { name: 'Shock flat' })).toBeInTheDocument();
  });

  it('renders exactly 7 symmetric ±5σ shock buttons, no −7σ', () => {
    render(
      <WhatIfSimulator hedges={HEDGE_FIXTURE} surface={SURFACE_FIXTURE} sigma={BOOTSTRAP_SIGMA} />,
    );
    for (const label of ['−5σ', '−3σ', '−2σ', 'flat', '+2σ', '+3σ', '+5σ']) {
      expect(screen.getByRole('button', { name: `Shock ${label}` })).toBeInTheDocument();
    }
    // The handoff's −7σ is NOT present (PROJECT.md ±5σ scope lock).
    expect(screen.queryByText('−7σ')).not.toBeInTheDocument();
  });

  it('clicking a shock button sets it active and clears the others', () => {
    render(
      <WhatIfSimulator hedges={HEDGE_FIXTURE} surface={SURFACE_FIXTURE} sigma={BOOTSTRAP_SIGMA} />,
    );
    const minus5 = screen.getByRole('button', { name: 'Shock −5σ' });
    fireEvent.click(minus5);
    expect(minus5.className).toMatch(/active/);
    // 'flat' (the default) is no longer active.
    expect(
      screen.getByRole('button', { name: 'Shock flat' }).className,
    ).not.toMatch(/active/);
  });

  it('populated: renders the shock-stats grid + shock-bar + Total PnL row', () => {
    render(
      <WhatIfSimulator hedges={HEDGE_FIXTURE} surface={SURFACE_FIXTURE} sigma={BOOTSTRAP_SIGMA} />,
    );
    expect(screen.getByTestId('shock-stats')).toBeInTheDocument();
    expect(screen.getByText('Loss capped')).toBeInTheDocument();
    expect(screen.getByText(/Total PnL:/)).toBeInTheDocument();
    expect(screen.getByText('Hedge payoff')).toBeInTheDocument();
  });

  it('preview mode: clicking the CTA swaps in a synthetic hedge; shock-stats render', () => {
    render(
      <WhatIfSimulator hedges={[]} surface={null} sigma={BOOTSTRAP_SIGMA} />,
    );
    fireEvent.click(
      screen.getByRole('button', { name: /Preview with synthetic hedge/i }),
    );
    // Shock-stats grid now renders against the synthetic hedge.
    expect(screen.getByTestId('shock-stats')).toBeInTheDocument();
    // Exit-preview button is rendered.
    expect(
      screen.getByRole('button', { name: /Exit preview mode/i }),
    ).toBeInTheDocument();
  });

  it('preview mode: Exit preview returns to the empty state', () => {
    render(
      <WhatIfSimulator hedges={[]} surface={null} sigma={BOOTSTRAP_SIGMA} />,
    );
    fireEvent.click(
      screen.getByRole('button', { name: /Preview with synthetic hedge/i }),
    );
    expect(screen.getByTestId('shock-stats')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Exit preview mode/i }));
    // Back to empty state — the disabled-state copy is visible again.
    expect(
      screen.getByText(
        'Shock scenarios activate once the vault holds a hedge. Deposit DUSDC to open the first leg.',
      ),
    ).toBeInTheDocument();
  });

  it('source declares the symmetric ±5σ shock-row, no slider, no −7σ', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const file = resolve(process.cwd(), 'src/components/panels/WhatIfSimulator.tsx');
    const text = readFileSync(file, 'utf8');
    // whatIf.ts compute reused.
    expect(text).toMatch(/shockedPnL/);
    // No Slider import / element.
    expect(text).not.toMatch(/ui\/slider/);
    expect(text).not.toMatch(/<Slider/);
    // Symmetric ±5σ shock-row, no −7σ.
    expect(text).toMatch(/shock-row/);
    expect(text).toMatch(/[−-]5σ/);
    expect(text).toMatch(/\+3σ/);
    expect(text).not.toMatch(/[−-]7σ/);
    // Empty-state copy present.
    expect(text).toMatch(/Shock scenarios activate/);
  });
});
