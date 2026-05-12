// dashboard/src/components/panels/SurfacePanel.tsx — Plan 04-04 Task 2.
//
// UI-SPEC §Plotly Performance Contract + RESEARCH Pattern 5 (revision-prop) +
// Pitfall 4 (full re-mount danger if no useMemo).
//
// Renders the live BTC volatility surface as a Plotly 3D `type:'surface'` plot:
//   - X axis: log-strike k, 50-point grid spanning [-2.0, 2.0] (UI-SPEC dim cap).
//   - Y axis: tenor T (years), default 3 rows = [7d, 14d, 30d] / 365.
//   - Z axis: total variance w(k, T), computed via Phase 1 `totalVariance`
//     (bigint at FLOAT_SCALING 1e9). The dashboard does NOT re-implement SVI.
//
// Memoization protocol (Pitfall 4 mitigation — the load-bearing correctness item):
//   - `grid`, `data`, `layout`, `config` are all useMemo'd. The data array
//     reference is identity-stable across React re-renders that don't change
//     the surface; without this, Plotly would tear down the WebGL canvas and
//     remount it on every parent render (visible flash + frame drops).
//   - The `revision` prop is bumped via useEffect keyed on
//     `surface?.raw.timestamp_ms`. Plotly redraws in-place when revision
//     increments — no remount, no flash.
//
// CONTEXT.md A9 locks v1 to a single BTC oracle, so all three tenor rows share
// the same SVI params (the OracleSVI module emits ONE surface per oracle;
// multi-tenor lifting is STRAT-V2-03). The Y axis is meaningful as a ribbon
// across tenors and the surface still visually communicates "the smile" as a
// 3D landscape.
//
// Forbidden-token caveat: Number(w) / Number(FLOAT_SCALING) is used to convert
// bigint output of totalVariance for Plotly's Number-typed Z. This conversion
// happens INSIDE SurfacePanel.tsx — Phase 1 SVI lib files (svi.ts, math.ts,
// isqrt.ts, phi.ts, ln.ts) remain bigint-pure and CI-grep-clean. This panel
// is visualization-bound, not parity-bound.

import Plot from 'react-plotly.js';
import { useEffect, useMemo, useState } from 'react';
import type { Config, Data, Layout } from 'plotly.js';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { StalenessPill } from '@/components/primitives/StalenessPill';
import { totalVariance, type SVIParams } from '@/lib/svi';
import type { SurfaceView } from '@/hooks/useSurfaceSnapshot';

const K_GRID = 50; // UI-SPEC dim cap
const K_MIN = -2.0;
const K_MAX = 2.0;
const FLOAT_SCALING = 1_000_000_000n;
const FLOAT_SCALING_NUM = 1_000_000_000;

// v1 single BTC oracle (CONTEXT.md A9) — render a 3-tenor ribbon at 7d, 14d, 30d
// to give the Y axis demo-meaningful range. When multi-tenor surfaces ship
// (STRAT-V2-03) the executor swaps `surface.svi` for a tenor-indexed lookup.
const DEFAULT_TENORS_YEARS = [7 / 365, 14 / 365, 30 / 365];

type Props = { surface: SurfaceView; tenors?: number[] };

export function SurfacePanel({ surface, tenors = DEFAULT_TENORS_YEARS }: Props) {
  // Pre-compute the k-axis once per K_GRID (constants are module-level, so this
  // is effectively static — but keeping it inside useMemo is the canonical
  // pattern from RESEARCH Pattern 5).
  const grid = useMemo(() => {
    if (!surface) return null;
    const svi: SVIParams = surface.svi;
    const ks: number[] = new Array(K_GRID);
    for (let i = 0; i < K_GRID; i++) {
      ks[i] = K_MIN + ((K_MAX - K_MIN) * i) / (K_GRID - 1);
    }
    const z: number[][] = new Array(tenors.length);
    for (let j = 0; j < tenors.length; j++) {
      const row: number[] = new Array(K_GRID);
      for (let i = 0; i < K_GRID; i++) {
        const kFloat = ks[i];
        // log-strike k -> bigint at FLOAT_SCALING for the Phase 1 evaluator.
        // Math.trunc keeps the sign correct for the kFloat < 0 left wing.
        const kBig = BigInt(Math.trunc(kFloat * FLOAT_SCALING_NUM));
        try {
          const w = totalVariance(svi, kBig);
          // Float coercion at the Plotly boundary only — Phase 1 lib stays bigint-pure.
          row[i] = Number(w) / FLOAT_SCALING_NUM;
        } catch {
          // SVI may reject extreme k (k outside max safe input domain).
          // Use NaN so Plotly renders a gap rather than a misleading value.
          row[i] = Number.NaN;
        }
      }
      z[j] = row;
    }
    return { x: ks, y: tenors, z };
  }, [surface, tenors]);

  const data: Data[] = useMemo(
    () =>
      grid
        ? // @types/plotly.js does not model the 3D surface `contours.z` shape
          // (which is documented at https://plotly.com/javascript/3d-surface-plots/
          // and supported at runtime by plotly.js 3.5.1). Cast via `unknown`
          // rather than weaken `Data` type for the whole panel.
          ([
            {
              type: 'surface',
              x: grid.x,
              y: grid.y,
              z: grid.z,
              colorscale: 'Viridis',
              showscale: false,
              contours: {
                z: { show: true, usecolormap: true, project: { z: true } },
              },
            },
          ] as unknown as Data[])
        : ([] as Data[]),
    [grid],
  );

  const layout: Partial<Layout> = useMemo(
    () => ({
      scene: {
        xaxis: { title: { text: 'log-strike k' }, color: '#94a3b8' },
        yaxis: { title: { text: 'tenor T (years)' }, color: '#94a3b8' },
        zaxis: { title: { text: 'total variance w(k,T)' }, color: '#94a3b8' },
        camera: { eye: { x: 1.3, y: 1.3, z: 0.9 } },
      },
      margin: { t: 0, r: 0, b: 0, l: 0 },
      paper_bgcolor: 'rgba(0,0,0,0)',
      plot_bgcolor: 'rgba(0,0,0,0)',
      font: { color: '#94a3b8', family: 'Inter' },
      autosize: true,
    }),
    [],
  );

  const config: Partial<Config> = useMemo(
    () => ({
      scrollZoom: false,
      displayModeBar: false,
      responsive: true,
    }),
    [],
  );

  // Pattern 5: bump revision when the underlying snapshot timestamp changes.
  // Plotly redraws in-place rather than remounting the WebGL canvas.
  const [revision, setRevision] = useState(0);
  const tsKey = surface?.raw.timestamp_ms ?? null;
  useEffect(() => {
    if (tsKey != null) setRevision((r) => r + 1);
  }, [tsKey]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <CardTitle>BTC volatility surface (live)</CardTitle>
          <CardDescription>
            50×50 grid: log-strike k × tenor T × total variance w(k,T).
            Re-renders on every OracleSVIUpdated event.
          </CardDescription>
        </div>
        {surface && <StalenessPill lastUpdatedMs={surface.lastUpdatedMs} />}
      </CardHeader>
      <CardContent>
        {!surface || !grid ? (
          <div className="space-y-4">
            <Skeleton className="h-[600px] w-full" />
            <p className="text-sm text-slate-400">
              Waiting for first SVI update — the relay is connected and listening.
            </p>
          </div>
        ) : (
          <div data-testid="surface-plot" style={{ width: '100%', height: 600 }}>
            <Plot
              data={data}
              layout={layout}
              config={config}
              revision={revision}
              style={{ width: '100%', height: '100%' }}
              useResizeHandler
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
