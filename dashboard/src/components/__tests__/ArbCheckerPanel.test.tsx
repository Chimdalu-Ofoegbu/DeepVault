// dashboard/src/components/__tests__/ArbCheckerPanel.test.tsx — Plan 04-04 Task 1.
//
// Validates UI-SPEC §Component Inventory + Pitfall 3 (NEVER resample g(k)):
//   - GREEN status for known-valid SVI params (paramsValid && minGk >= 0 && calendarPass)
//   - RED status for known-invalid params (a=0,b=0 -> paramsValid=false); auto-expands
//     the g(k) curve; the chartData array passed to Recharts contains the full 200-point
//     gK array (Pitfall 3 — never resample, never decimate)
//   - STALE status when surface.lastUpdatedMs is older than 5 minutes (UI-SPEC special
//     case — Pitfall 9 mitigation: never render GREEN/RED on stale math)
//   - Imports `ReferenceLine` from recharts inside the panel source (UI-SPEC color
//     contract — rose-600 #e11d48 at y=0)
//
// Tests consume the real Phase 1 `checkArb` evaluator — no mocking of math.
// The dashboard's job in this plan is integration + UX, NOT to reimplement SVI.
//
// Recharts in jsdom: ResponsiveContainer requires a width to render SVG content.
// We assert on (a) the chart container's data-testid + (b) the sr-only point-count
// caption (which IS rendered regardless of SVG dims), and (c) source-grep the
// component source for ReferenceLine y={0} stroke #e11d48 (UI-SPEC color lock).

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

import { ArbCheckerPanel } from '@/components/panels/ArbCheckerPanel';
import type { SurfaceView } from '@/hooks/useSurfaceSnapshot';

// ResizeObserver shim: Recharts ResponsiveContainer reaches for it during render
// in jsdom (which doesn't ship one). The polyfill returns sensible no-ops.
class ResizeObserverPolyfill {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: typeof ResizeObserverPolyfill }).ResizeObserver =
  (globalThis as unknown as { ResizeObserver: typeof ResizeObserverPolyfill }).ResizeObserver ??
  ResizeObserverPolyfill;

// Known-valid SVI params (probed against Phase 1 `checkArb`):
//   a=1.5, b=0.2, rho=-0.3, m=0.1, sigma=0.4 -> paramsValid:true, minGk=0.583
const VALID_SVI = {
  a: 1_500_000_000n,
  b: 200_000_000n,
  rho: -300_000_000n,
  m: 100_000_000n,
  sigma: 400_000_000n,
};

// Known-invalid SVI (a=0, b=0) -> checkArb returns paramsValid:false, minGk=-1e9
const INVALID_SVI = {
  a: 0n,
  b: 0n,
  rho: 0n,
  m: 0n,
  sigma: 1n,
};

const surfaceView = (svi: typeof VALID_SVI, lastUpdatedMs: number): SurfaceView => ({
  raw: {
    oracle_id: '0xORACLE',
    a: svi.a.toString(),
    b: svi.b.toString(),
    rho_signed: svi.rho.toString(),
    m_signed: svi.m.toString(),
    sigma: svi.sigma.toString(),
    timestamp_ms: String(lastUpdatedMs),
    last_updated_ms: String(lastUpdatedMs),
  },
  svi,
  lastUpdatedMs,
});

describe('<ArbCheckerPanel>', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders GREEN badge for known-valid SVI params (does NOT auto-expand)', () => {
    const now = Date.parse('2026-05-12T12:00:00Z');
    vi.setSystemTime(now);
    render(<ArbCheckerPanel surface={surfaceView(VALID_SVI, now - 5_000)} />);
    expect(screen.getByText('GREEN')).toBeInTheDocument();
    // Auto-expand only on RED — the chart node should NOT be in the document.
    expect(screen.queryByTestId('gk-chart')).not.toBeInTheDocument();
  });

  it('renders RED badge + auto-expanded 200-point g(k) curve for invalid SVI', () => {
    const now = Date.parse('2026-05-12T12:00:00Z');
    vi.setSystemTime(now);
    render(<ArbCheckerPanel surface={surfaceView(INVALID_SVI, now - 5_000)} />);
    expect(screen.getByText('RED')).toBeInTheDocument();
    // Auto-expand on RED — chart container is mounted.
    expect(screen.getByTestId('gk-chart')).toBeInTheDocument();
    // The sr-only point-count caption asserts the array length === 200 (Pitfall 3).
    expect(screen.getByTestId('gk-point-count').textContent).toMatch(/200/);
  });

  it('renders STALE — CANNOT VERIFY when surface > 5 minutes old (UI-SPEC special case)', () => {
    const now = Date.parse('2026-05-12T12:00:00Z');
    vi.setSystemTime(now);
    const sixMinutesAgo = now - 6 * 60 * 1000;
    render(<ArbCheckerPanel surface={surfaceView(VALID_SVI, sixMinutesAgo)} />);
    expect(screen.getByText(/STALE.*CANNOT VERIFY/i)).toBeInTheDocument();
    // Body collapses to the caption — no chart, no min-g(k) numeric.
    expect(screen.queryByTestId('gk-chart')).not.toBeInTheDocument();
  });

  it('renders the "Waiting for first SVI update" message when surface is null', () => {
    render(<ArbCheckerPanel surface={null} />);
    expect(screen.getByText(/Waiting for first SVI update/i)).toBeInTheDocument();
  });

  it('mounts ReferenceLine at y=0 with rose-600 stroke (UI-SPEC color contract)', async () => {
    // Recharts in jsdom does not paint a sized SVG (ResponsiveContainer needs a
    // ResizeObserver-reported width); we cannot rely on rendered <line> elements.
    // The UI-SPEC color contract is enforced at the SOURCE level — assert that
    // the panel source declares <ReferenceLine y={0} stroke="#e11d48" .../>.
    const src = await import('@/components/panels/ArbCheckerPanel?raw' as string).catch(
      () => null,
    );
    // Vite ?raw is dev-server only; fall back to fs read in vitest.
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const file = resolve(
      process.cwd(),
      'src/components/panels/ArbCheckerPanel.tsx',
    );
    const text = src ? (src as { default: string }).default : readFileSync(file, 'utf8');
    expect(text).toMatch(/<ReferenceLine[\s\S]*?y=\{0\}/);
    expect(text).toMatch(/stroke="#e11d48"/);
  });
});
