// dashboard/src/components/panels/ArbCheckerPanel.tsx — Plan 04-04 Task 1.
//
// UI-SPEC §Component Inventory + Pitfall 3 (NEVER resample g(k)):
//
//   - Imports Phase 1 `checkArb` from `@/lib/arb_checker` — the dashboard does
//     NOT re-implement the g(k) closed-form (Gatheral & Jacquier 2014 §3.2).
//   - Renders the FULL 200-point gK array via Recharts `<LineChart>` — never
//     downsampled, never decimated. The "we ship the array, not the boolean"
//     differentiator (Phase 1 D-04, MATH-04 lever).
//   - Status pill:
//        GREEN (emerald) when paramsValid && minGk >= 0n && calendarPass
//        RED   (rose)    when any of the above fail; AUTO-EXPANDS the curve so
//                        the violation is visible without a click
//        STALE (slate)   when surface.lastUpdatedMs is older than 5 minutes
//                        (UI-SPEC §Staleness arb-checker special case —
//                        Pitfall 9 mitigation: never render GREEN/RED on stale math).
//   - `<ReferenceLine y={0}>` in rose-600 (#e11d48) marks the violation threshold.
//   - StalenessPill in the CardHeader binds to oracle.last_updated_ms.
//
// Boundary cast: gK is bigint[] at FLOAT_SCALING 1e9. Conversion to Number for
// Recharts happens at the boundary (acceptable per `arb_checker.ts:14-16` —
// arb_checker is visualization-bound, NOT parity-bound). The forbidden-token
// grep targets svi/phi/isqrt/ln/math.ts only.

import { useMemo, useState } from 'react';
import {
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RcTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChevronDown, ChevronUp } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { StalenessPill } from '@/components/primitives/StalenessPill';
import { checkArb } from '@/lib/arb_checker';
import type { SurfaceView } from '@/hooks/useSurfaceSnapshot';

// UI-SPEC §Staleness special case: arb-checker has its own 5-minute gate ON TOP
// of the generic 30/60s staleness state machine (Plan 04-03 useStaleness). Once
// the SVI source is >5min old, the math cannot be trusted to reflect current
// market conditions, so the pill flips to gray STALE regardless of g(k).
const STALE_THRESHOLD_MS = 5 * 60 * 1000;

type Props = { surface: SurfaceView };

type Status = 'green' | 'red' | 'stale';

export function ArbCheckerPanel({ surface }: Props) {
  const surfaceAgeMs = surface ? Date.now() - surface.lastUpdatedMs : Infinity;
  const isStale = surface != null && surfaceAgeMs > STALE_THRESHOLD_MS;

  // Memoize the full ArbResult on surface reference. checkArb runs the 200-pt
  // grid evaluation; we never want to re-execute it on a parent re-render that
  // didn't actually change the surface.
  const arb = useMemo(() => (surface ? checkArb(surface.svi) : null), [surface]);

  const status: Status = isStale
    ? 'stale'
    : !arb || !arb.paramsValid || arb.minGk < 0n || !arb.calendarPass
      ? 'red'
      : 'green';

  // Convert gK (bigint at FLOAT_SCALING) -> Number for Recharts at the boundary.
  // x-axis is the array index minus 100 (centered around 0) as a stand-in for
  // k * sqrt(theta_T) coordinates — UI-SPEC just calls it "log-strike k".
  const chartData = useMemo(() => {
    if (!arb || arb.gK.length === 0) return [];
    return arb.gK.map((g, i) => ({ k: i - 100, g: Number(g) / 1e9 }));
  }, [arb]);

  const [open, setOpen] = useState(false);
  // UI-SPEC: auto-expand the curve on RED so judges see the violation immediately
  // without a click. GREEN keeps the curve collapsed to keep the dashboard tidy.
  const autoExpand = status === 'red';
  const expanded = autoExpand || open;

  // Empty state: no oracle event has arrived yet.
  if (!surface) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Arbitrage check</CardTitle>
          <CardDescription>
            g(k) curve (200-point grid). Status flips RED when min g(k) &lt; 0
            or calendar arbitrage is detected.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-400">
            Waiting for first SVI update — the relay is connected and listening.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <CardTitle>Arbitrage check</CardTitle>
          <CardDescription>
            g(k) curve (200-point grid). Status flips RED when min g(k) &lt; 0
            or calendar arbitrage is detected.
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          {status === 'green' && (
            <Badge
              className="border border-emerald-500/30 bg-emerald-500/15 text-[11px] font-semibold uppercase tracking-wider text-emerald-300"
            >
              GREEN
            </Badge>
          )}
          {status === 'red' && (
            <Badge
              className="border border-rose-600/30 bg-rose-600/15 text-[11px] font-semibold uppercase tracking-wider text-rose-300"
            >
              RED
            </Badge>
          )}
          {status === 'stale' && (
            <Badge
              className="border border-slate-600 bg-slate-700/30 text-[11px] font-semibold uppercase tracking-wider text-slate-300"
            >
              STALE — CANNOT VERIFY
            </Badge>
          )}
          <StalenessPill lastUpdatedMs={surface.lastUpdatedMs} compact />
        </div>
      </CardHeader>
      <CardContent>
        {status === 'stale' ? (
          <p className="text-sm text-slate-400">
            Arbitrage check requires SVI fresher than 5 minutes. Displayed status
            paused until the next OracleSVIUpdated event arrives.
          </p>
        ) : !arb ? (
          <p className="text-sm text-slate-400">Waiting for first SVI update.</p>
        ) : (
          <Collapsible open={expanded} onOpenChange={setOpen}>
            <div className="flex items-center justify-between text-sm text-slate-400">
              <span>
                min g(k) ={' '}
                <span className="font-mono tabular-nums text-slate-200">
                  {(Number(arb.minGk) / 1e9).toFixed(6)}
                </span>
              </span>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm">
                  {expanded ? (
                    <>
                      <ChevronUp className="mr-1 h-4 w-4" /> Hide g(k) curve
                    </>
                  ) : (
                    <>
                      <ChevronDown className="mr-1 h-4 w-4" /> View g(k) curve
                    </>
                  )}
                </Button>
              </CollapsibleTrigger>
            </div>
            <CollapsibleContent>
              <div
                data-testid="gk-chart"
                className="mt-4"
                style={{ width: '100%', height: 320 }}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={chartData}
                    margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
                  >
                    <XAxis
                      dataKey="k"
                      tick={{ fill: '#94a3b8', fontSize: 11 }}
                      label={{
                        value: 'log-strike k',
                        position: 'insideBottom',
                        offset: -2,
                        fill: '#94a3b8',
                      }}
                    />
                    <YAxis
                      tick={{ fill: '#94a3b8', fontSize: 11 }}
                      label={{
                        value: 'g(k)',
                        angle: -90,
                        position: 'insideLeft',
                        fill: '#94a3b8',
                      }}
                    />
                    <RcTooltip
                      contentStyle={{
                        background: '#0f172a',
                        border: '1px solid #334155',
                        borderRadius: 6,
                      }}
                    />
                    <ReferenceLine
                      y={0}
                      stroke="#e11d48"
                      strokeDasharray="3 3"
                    />
                    <Line
                      type="monotone"
                      dataKey="g"
                      stroke="#06b6d4"
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <p
                data-testid="gk-point-count"
                className="sr-only"
              >
                Points: {chartData.length}
              </p>
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
    </Card>
  );
}
