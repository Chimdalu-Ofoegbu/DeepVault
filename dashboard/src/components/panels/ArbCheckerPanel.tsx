// dashboard/src/components/panels/ArbCheckerPanel.tsx — Plan 04-04 Task 1;
// reskinned to the handoff `db-card` chrome in Plan 04.1-03 Task 2.
//
// UI-SPEC §Component Inventory + Pitfall 3 (NEVER resample g(k)):
//
//   - Imports Phase 1 `checkArb` from `@/lib/arb_checker` — the dashboard does
//     NOT re-implement the g(k) closed-form (Gatheral & Jacquier 2014 §3.2).
//   - Renders the FULL 200-point gK array via Recharts `<LineChart>` — never
//     downsampled, never decimated. The "we ship the array, not the boolean"
//     differentiator (Phase 1 D-04, MATH-04 lever).
//   - Status pill:
//        GREEN (mint)  when paramsValid && minGk >= 0n && calendarPass
//        RED   (coral) when any of the above fail; AUTO-EXPANDS the curve so
//                      the violation is visible without a click
//        STALE (muted) when surface.lastUpdatedMs is older than 5 minutes
//                      (UI-SPEC §Staleness arb-checker special case —
//                      Pitfall 9 mitigation: never render GREEN/RED on stale math).
//   - `<ReferenceLine y={0}>` marks the violation threshold.
//   - StalenessPill in the header binds to oracle.last_updated_ms.
//
// Boundary cast: gK is bigint[] at FLOAT_SCALING 1e9. Conversion to Number for
// Recharts happens at the boundary (acceptable per `arb_checker.ts:14-16` —
// arb_checker is visualization-bound, NOT parity-bound). The forbidden-token
// grep targets svi/phi/isqrt/ln/math.ts only.
//
// Plan 04.1-03 reskin (UI-SPEC R-2 — LOAD-BEARING KEEP): the dedicated g(k)
// 200-point plot is RETAINED (DASH-05 / MATH-04 differentiator) even though
// the handoff folds arb status into the svi-params strip. Chrome reskinned to
// `db-card`; status badge + g(k) line + ReferenceLine recolored to mint/coral
// via CHART_COLORS — no hardcoded hex. The `checkArb` useMemo + the
// auto-expand-on-RED Collapsible logic are Phase 4 verified behavior, unchanged.

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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { StalenessPill } from '@/components/primitives/StalenessPill';
import { checkArb } from '@/lib/arb_checker';
import { CHART_COLORS } from '@/lib/dashboard_constants';
import type { SurfaceView } from '@/hooks/useSurfaceSnapshot';

// UI-SPEC §Staleness special case: arb-checker has its own 5-minute gate ON TOP
// of the generic 30/60s staleness state machine (Plan 04-03 useStaleness). Once
// the SVI source is >5min old, the math cannot be trusted to reflect current
// market conditions, so the pill flips to muted STALE regardless of g(k).
const STALE_THRESHOLD_MS = 5 * 60 * 1000;

type Props = { surface: SurfaceView };

type Status = 'green' | 'red' | 'stale';

// Status badge — recolored to the handoff mint/coral tokens (Plan 04.1-03).
function StatusBadge({ status }: { status: Status }) {
  const label =
    status === 'green'
      ? 'GREEN'
      : status === 'red'
        ? 'RED'
        : 'STALE — CANNOT VERIFY';
  const tone =
    status === 'green'
      ? CHART_COLORS.accent
      : status === 'red'
        ? CHART_COLORS.hedge
        : CHART_COLORS.muted;
  return (
    <span
      style={{
        fontFamily: 'var(--f-mono)',
        fontSize: '11px',
        fontWeight: 600,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: tone,
        border: `1px solid ${tone}`,
        borderRadius: 'var(--r-1)',
        padding: '3px 8px',
        background: `color-mix(in oklab, ${tone} 14%, transparent)`,
      }}
    >
      {label}
    </span>
  );
}

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
      <div className="db-card pad" style={{ marginTop: '20px' }}>
        <header className="db-h">
          <div>
            <span className="db-mark">§ Arb-free</span>
            <h3>Arbitrage check</h3>
          </div>
        </header>
        <p style={{ color: 'var(--muted)', fontSize: '13px' }}>
          Waiting for first SVI update — the relay is connected and listening.
        </p>
      </div>
    );
  }

  return (
    <div className="db-card pad" style={{ marginTop: '20px' }}>
      <header className="db-h">
        <div>
          <span className="db-mark">§ Arb-free</span>
          <h3>Arbitrage check</h3>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <StatusBadge status={status} />
          <StalenessPill lastUpdatedMs={surface.lastUpdatedMs} compact />
        </div>
      </header>
      <p
        style={{
          color: 'var(--muted)',
          fontSize: '12.5px',
          marginBottom: '12px',
        }}
      >
        g(k) curve (200-point grid). Status flips RED when min g(k) &lt; 0 or
        calendar arbitrage is detected.
      </p>
      {status === 'stale' ? (
        <p style={{ color: 'var(--muted)', fontSize: '13px' }}>
          Arbitrage check requires SVI fresher than 5 minutes. Displayed status
          paused until the next OracleSVIUpdated event arrives.
        </p>
      ) : !arb ? (
        <p style={{ color: 'var(--muted)', fontSize: '13px' }}>
          Waiting for first SVI update.
        </p>
      ) : (
        <Collapsible open={expanded} onOpenChange={setOpen}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '13px',
              color: 'var(--text-2)',
            }}
          >
            <span>
              min g(k) ={' '}
              <span
                className="mono"
                style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}
              >
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
                    tick={{ fill: CHART_COLORS.text2, fontSize: 11 }}
                    label={{
                      value: 'log-strike k',
                      position: 'insideBottom',
                      offset: -2,
                      fill: CHART_COLORS.text2,
                    }}
                  />
                  <YAxis
                    tick={{ fill: CHART_COLORS.text2, fontSize: 11 }}
                    label={{
                      value: 'g(k)',
                      angle: -90,
                      position: 'insideLeft',
                      fill: CHART_COLORS.text2,
                    }}
                  />
                  <RcTooltip
                    contentStyle={{
                      background: CHART_COLORS.cardBg,
                      border: `1px solid ${CHART_COLORS.gridLine}`,
                      borderRadius: 6,
                    }}
                  />
                  <ReferenceLine
                    y={0}
                    stroke={CHART_COLORS.hedge}
                    strokeDasharray="3 3"
                  />
                  <Line
                    type="monotone"
                    dataKey="g"
                    stroke={CHART_COLORS.accent}
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p data-testid="gk-point-count" className="sr-only">
              Points: {chartData.length}
            </p>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
