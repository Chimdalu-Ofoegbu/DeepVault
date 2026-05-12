// dashboard/src/components/panels/WhatIfSimulator.tsx — Plan 04-06 Task 2.
//
// DASH-09: Joint spot+vol slider panel that recomputes shocked PnL client-
// side via Phase 1 binaryPrice. Two sliders, useMemo cache on shock-params +
// hedge set, Recharts BarChart per hedge + Total — D-09 sub-100ms budget.
//
// UI-SPEC contracts (LOCKED):
//   - Slider ranges: spot ±5σ → ±50000 bps, vol ±2σ → ±4000 bps
//   - Reset button + Esc key both clear sliders to 0
//   - Empty state copy verbatim per UI-SPEC §Empty states
//   - Bootstrap fallback caption under each slider when isBootstrap=true
//   - Amber "Bootstrap σ" Badge in CardDescription when sigma.isBootstrap=true,
//     with tooltip distinguishing theta vs spot bootstrap reasons (STRIDE
//     T-04-06-04 mitigation)
//   - Amber "Using synthetic forward — connect oracle for live pricing"
//     Badge in CardDescription when forwardPrice prop is omitted (STRIDE
//     T-04-06-05 mitigation)
//   - Forward fallback uses FALLBACK_FORWARD_PRICE_DUSDC from
//     dashboard_constants.ts — NO magic numbers inline
//
// Recharts palette (UI-SPEC §Recharts palette): positive bars cyan #06b6d4
// (hedge payoff), negative bars rose #e11d48 (hedge cost). Total row uses
// the same coloring; the "Total" name is used as the X-axis tick.

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip as RcTooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { NumericValue } from '@/components/primitives/NumericValue';
import type { Hedge } from '@/hooks/useExposure';
import type { SigmaEstimates } from '@/hooks/useSigmaEstimates';
import type { SurfaceView } from '@/hooks/useSurfaceSnapshot';
import { FALLBACK_FORWARD_PRICE_DUSDC } from '@/lib/dashboard_constants';
import { formatDusdc } from '@/lib/format';
import { shockedPnL } from '@/lib/whatIf';

type Props = {
  hedges: Hedge[];
  surface: SurfaceView;
  sigma: SigmaEstimates;
  /** v1 single-oracle: optional forward price. When undefined,
   *  FALLBACK_FORWARD_PRICE_DUSDC is used AND an amber "synthetic forward"
   *  Badge is rendered (STRIDE T-04-06-05 mitigation). */
  forwardPrice?: bigint;
};

// Slider ranges per UI-SPEC §What-if simulator.
const SPOT_MAX_BPS = 50_000; // ±5σ at bootstrap fallback 20% σ
const THETA_MAX_BPS = 4_000; // ±2σ at bootstrap fallback 20% σ_θ

export function WhatIfSimulator({ hedges, surface, sigma, forwardPrice }: Props) {
  const [thetaShockBps, setThetaShockBps] = useState(0);
  const [spotShockBps, setSpotShockBps] = useState(0);
  const cardRef = useRef<HTMLDivElement>(null);

  const isSyntheticForward = forwardPrice === undefined;
  const fwd = forwardPrice ?? FALLBACK_FORWARD_PRICE_DUSDC;

  // useMemo keyed on shock params + hedges identity + surface identity (D-09
  // sub-100ms contract). hedges/surface ref-stability comes from useExposure /
  // useSurfaceSnapshot upstream memoization.
  const quotes = useMemo(() => {
    if (!surface || hedges.length === 0) return [];
    return hedges.map((h) =>
      shockedPnL({
        hedgeKey: h.marketKey,
        svi: surface.svi,
        forward: fwd,
        strike: h.strike,
        notionalQuote: h.notionalQuote,
        thetaShockBps,
        spotShockBps,
      }),
    );
  }, [hedges, surface, fwd, thetaShockBps, spotShockBps]);

  const totalPnl = useMemo(
    () => quotes.reduce((acc, q) => acc + q.pnlQuote, 0n),
    [quotes],
  );

  const chartData = useMemo(() => {
    const rows = quotes.map((q) => ({
      name:
        hedges.find((h) => h.marketKey === q.hedgeKey)?.strikeDisplay ??
        q.hedgeKey,
      pnl: Number(q.pnlQuote) / 1e6, // DUSDC display (6 decimals)
    }));
    rows.push({ name: 'Total', pnl: Number(totalPnl) / 1e6 });
    return rows;
  }, [quotes, hedges, totalPnl]);

  const onReset = useCallback(() => {
    setThetaShockBps(0);
    setSpotShockBps(0);
  }, []);

  const onKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Escape') onReset();
    },
    [onReset],
  );

  if (hedges.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>What-if simulator</CardTitle>
          <CardDescription>
            Joint spot + vol shocks on your open hedges.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="font-semibold text-slate-200">
            Connect wallet to simulate
          </p>
          <p className="mt-1 text-sm text-slate-400">
            Sliders shock your open hedges by spot ±5σ and vol ±2σ. PnL is
            recomputed in your browser.
          </p>
        </CardContent>
      </Card>
    );
  }

  const thetaBootstrapTooltip = sigma.isThetaBootstrap
    ? `Bootstrap σ: spot-leg σ uses fallback (OracleSVIUpdated does not carry forward price) AND theta-leg σ uses fallback (${sigma.observationCount} observations < 7 required).`
    : `Bootstrap σ: spot-leg σ uses fallback (OracleSVIUpdated does not carry forward price). Theta-leg σ is live (${sigma.observationCount} observations).`;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <CardTitle>What-if simulator</CardTitle>
          <CardDescription>
            Joint spot + vol shocks on your open hedges. Client-side compute;
            sub-100ms response per slider tick.
            {(sigma.isBootstrap || isSyntheticForward) && (
              <span className="mt-2 flex flex-wrap gap-2">
                {sigma.isBootstrap && (
                  <Badge variant="amber" title={thetaBootstrapTooltip}>
                    Bootstrap σ
                  </Badge>
                )}
                {isSyntheticForward && (
                  <Badge variant="amber">
                    Using synthetic forward — connect oracle for live pricing
                  </Badge>
                )}
              </span>
            )}
          </CardDescription>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onReset}
          aria-label="Reset sliders"
        >
          Reset to current
        </Button>
      </CardHeader>
      <CardContent>
        <div
          ref={cardRef}
          onKeyDown={onKeyDown}
          tabIndex={-1}
          className="space-y-6"
        >
          <div>
            <label className="flex justify-between text-sm text-slate-400">
              <span>Spot shock (forward price)</span>
              <span className="font-mono tabular-nums text-slate-200">
                {(spotShockBps / 100).toFixed(2)}%
              </span>
            </label>
            <Slider
              min={-SPOT_MAX_BPS}
              max={SPOT_MAX_BPS}
              step={100}
              value={[spotShockBps]}
              onValueChange={(v) => setSpotShockBps(v[0] ?? 0)}
              className="mt-2"
              aria-label="Spot shock in basis points"
            />
            <p className="mt-1 text-xs text-slate-500">
              ±5σ ≈ ±{(sigma.sigmaSpotPct * 5).toFixed(1)}%
              {sigma.isBootstrap &&
                ' (bootstrap fallback: <7d history; using 20% σ)'}
            </p>
          </div>
          <div>
            <label className="flex justify-between text-sm text-slate-400">
              <span>Vol shock (parallel θ shift)</span>
              <span className="font-mono tabular-nums text-slate-200">
                {(thetaShockBps / 100).toFixed(2)}%
              </span>
            </label>
            <Slider
              min={-THETA_MAX_BPS}
              max={THETA_MAX_BPS}
              step={50}
              value={[thetaShockBps]}
              onValueChange={(v) => setThetaShockBps(v[0] ?? 0)}
              className="mt-2"
              aria-label="Vol shock in basis points"
            />
            <p className="mt-1 text-xs text-slate-500">
              ±2σ ≈ ±{(sigma.sigmaThetaPct * 2).toFixed(1)}%
              {sigma.isThetaBootstrap &&
                ' (bootstrap fallback: <7d θ history; using 20% σ_θ)'}
            </p>
          </div>
          <div
            data-testid="pnl-chart"
            style={{ width: '100%', height: 220 }}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <XAxis
                  dataKey="name"
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <RcTooltip
                  contentStyle={{
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: 6,
                  }}
                  formatter={(value: number) => [
                    `${value.toFixed(2)} DUSDC`,
                    'PnL',
                  ]}
                />
                <Bar dataKey="pnl" isAnimationActive={false}>
                  {chartData.map((row, i) => (
                    <Cell
                      key={i}
                      fill={row.pnl >= 0 ? '#06b6d4' : '#e11d48'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-right text-sm text-slate-400">
            Total PnL:{' '}
            <NumericValue
              className={totalPnl >= 0n ? 'text-cyan-300' : 'text-rose-300'}
            >
              {formatDusdc(totalPnl)} DUSDC
            </NumericValue>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
