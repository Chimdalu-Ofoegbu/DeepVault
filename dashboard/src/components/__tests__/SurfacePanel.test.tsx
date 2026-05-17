// dashboard/src/components/__tests__/SurfacePanel.test.tsx — Plan 04-04 Task 2.
//
// Validates UI-SPEC §Plotly Performance Contract + Pitfall 4 (full re-mount danger):
//   - Empty state ("Waiting for first SVI update") when surface is null
//   - 50-column × N-row Plotly surface where N = tenors.length (default 3 from
//     7d/14d/30d defaults)
//   - revision prop bumps on every timestamp_ms change (forces internal redraw
//     without prop-identity churn — Pattern 5)
//   - data[0].type === 'surface' (the high-leverage 3D primitive)
//
// jsdom has no canvas/WebGL — we mock `react-plotly.js` to a thin <div> that
// captures props as data-* attributes for assertion. This validates the
// component contract, not Plotly's renderer.

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock BEFORE importing SurfacePanel.
vi.mock('react-plotly.js', () => ({
  default: (props: {
    data?: Array<{ type?: string; z?: number[][] }>;
    revision?: number;
  }) => (
    <div
      data-testid="plot-mock"
      data-revision={String(props.revision)}
      data-type={props.data?.[0]?.type}
      data-z-rows={String(props.data?.[0]?.z?.length ?? 0)}
      data-z-cols={String(props.data?.[0]?.z?.[0]?.length ?? 0)}
    />
  ),
}));

import { SurfacePanel } from '@/components/panels/SurfacePanel';
import type { SurfaceView } from '@/hooks/useSurfaceSnapshot';

const VALID_SVI = {
  a: 1_500_000_000n,
  b: 200_000_000n,
  rho: -300_000_000n,
  m: 100_000_000n,
  sigma: 400_000_000n,
};

const surfaceFixture = (ts: number): SurfaceView => ({
  raw: {
    oracle_id: '0xORACLE',
    a: VALID_SVI.a.toString(),
    b: VALID_SVI.b.toString(),
    rho_signed: VALID_SVI.rho.toString(),
    m_signed: VALID_SVI.m.toString(),
    sigma: VALID_SVI.sigma.toString(),
    timestamp_ms: String(ts),
    last_updated_ms: String(ts),
  },
  svi: VALID_SVI,
  lastUpdatedMs: ts,
});

describe('<SurfacePanel>', () => {
  it("renders empty state ('Waiting for surface data') when surface is null", () => {
    // Plan 04.1-03 reskin: the empty-state copy is the UI-SPEC verbatim
    // "Waiting for surface data" heading (replaced the Phase-4 placeholder).
    render(<SurfacePanel surface={null} />);
    expect(screen.getByText(/Waiting for surface data/i)).toBeInTheDocument();
    // The plot mock should NOT be in the document.
    expect(screen.queryByTestId('plot-mock')).not.toBeInTheDocument();
  });

  it("renders Plotly type='surface' with 50-column × N-row grid", () => {
    render(<SurfacePanel surface={surfaceFixture(Date.now())} tenors={[7 / 365, 14 / 365, 30 / 365]} />);
    const plot = screen.getByTestId('plot-mock');
    expect(plot.getAttribute('data-type')).toBe('surface');
    // 50 columns (log-strike grid) - UI-SPEC dimension cap.
    expect(plot.getAttribute('data-z-cols')).toBe('50');
    // 3 rows (tenors prop default).
    expect(plot.getAttribute('data-z-rows')).toBe('3');
  });

  it('bumps the revision prop when timestamp_ms changes (Pitfall 4 mitigation)', () => {
    const { rerender } = render(<SurfacePanel surface={surfaceFixture(1000)} />);
    const r1 = Number(screen.getByTestId('plot-mock').getAttribute('data-revision'));
    rerender(<SurfacePanel surface={surfaceFixture(2000)} />);
    const r2 = Number(screen.getByTestId('plot-mock').getAttribute('data-revision'));
    expect(r2).toBeGreaterThan(r1);
  });

  it('does NOT bump revision on a re-render with the same timestamp_ms', () => {
    const stable = surfaceFixture(1000);
    const { rerender } = render(<SurfacePanel surface={stable} />);
    const r1 = Number(screen.getByTestId('plot-mock').getAttribute('data-revision'));
    rerender(<SurfacePanel surface={stable} />);
    const r2 = Number(screen.getByTestId('plot-mock').getAttribute('data-revision'));
    expect(r2).toBe(r1);
  });
});
