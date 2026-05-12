// dashboard/src/components/panels/ExposurePanel.tsx — Plan 04-05 Task 3 (DASH-08).
//
// UI-SPEC §Component Inventory ExposurePanel:
//   - Horizontal Recharts BarChart of notional per open hedge, grouped by
//     (oracle, strike, expiry) — bar label = `${strikeDisplay} @ ${expiryDisplay}`.
//   - Color contract (UI-SPEC §Recharts palette "Exposure bars: single-color
//     slate-400 bars"): bars are uniform slate-400 (#94a3b8); the chart's
//     value is the SHAPE, not chroma diversity. Per-panel 5-color cap honored.
//   - Below the chart, a shadcn `<Table>` lists strike / expiry / direction /
//     notional / premium per row.
//   - StalenessPill in CardHeader bound to vault.last_updated_ms (proxy for
//     "events are flowing" — D-10 staleness model applies to all vault-side
//     panels because the same WS heartbeat drives them).
//
// Empty state copy (UI-SPEC §Empty states verbatim):
//   Heading: "No hedges currently open"
//   Body:    "Hedges are minted automatically on supply and rolled when
//             within 48 hours of expiry."
//
// All numeric rendering routes through `formatDusdc` (Pitfall 8 bigint).

import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip as RcTooltip,
  XAxis,
  YAxis,
} from 'recharts';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { NumericValue } from '@/components/primitives/NumericValue';
import { StalenessPill } from '@/components/primitives/StalenessPill';
import { formatDusdc } from '@/lib/format';
import type { Hedge } from '@/hooks/useExposure';
import type { VaultStateSnapshot } from '@/lib/types';

type Props = { hedges: Hedge[]; vault: VaultStateSnapshot };

export function ExposurePanel({ hedges, vault }: Props) {
  // BarChart data: bigint -> Number at the boundary only (Pitfall 8).
  // Display unit is DUSDC (6 decimals); divide by 1e6 so axis ticks are
  // in DUSDC, not micro-units.
  const chartData = useMemo(
    () =>
      hedges.map((h) => ({
        name: `${h.strikeDisplay} @ ${h.expiryDisplay}`,
        notional: Number(h.notionalQuote) / 1e6,
        key: h.marketKey,
      })),
    [hedges],
  );

  if (hedges.length === 0) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle>Hedge book exposure</CardTitle>
            <CardDescription>
              Open hedges grouped by oracle / strike / expiry.
            </CardDescription>
          </div>
          {vault && (
            <StalenessPill
              lastUpdatedMs={Number(vault.last_updated_ms)}
              compact
            />
          )}
        </CardHeader>
        <CardContent>
          <p className="font-semibold text-slate-200">No hedges currently open</p>
          <p className="mt-1 text-sm text-slate-400">
            Hedges are minted automatically on supply and rolled when within 48
            hours of expiry.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <CardTitle>Hedge book exposure</CardTitle>
          <CardDescription>
            Notional (DUSDC) per open hedge, grouped by strike × expiry.
          </CardDescription>
        </div>
        {vault && (
          <StalenessPill
            lastUpdatedMs={Number(vault.last_updated_ms)}
            compact
          />
        )}
      </CardHeader>
      <CardContent>
        <div
          data-testid="exposure-chart"
          style={{ width: '100%', height: 220 }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 8, right: 16, left: 80, bottom: 8 }}
            >
              <XAxis
                type="number"
                tick={{ fill: '#94a3b8', fontSize: 11 }}
              />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fill: '#94a3b8', fontSize: 11 }}
                width={150}
              />
              <RcTooltip
                contentStyle={{
                  background: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: 6,
                }}
              />
              {/* UI-SPEC §Recharts palette: single-color slate-400 bars
                  (#94a3b8) — the chart's value is the shape, not chroma
                  diversity. Per-panel 5-color cap honored. */}
              <Bar
                dataKey="notional"
                fill="#94a3b8"
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <Table className="mt-4">
          <TableHeader>
            <TableRow>
              <TableHead>Strike</TableHead>
              <TableHead>Expiry</TableHead>
              <TableHead>Direction</TableHead>
              <TableHead className="text-right">Notional</TableHead>
              <TableHead className="text-right">Premium</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {hedges.map((h) => (
              <TableRow key={h.marketKey}>
                <TableCell>
                  <NumericValue>{h.strikeDisplay}</NumericValue>
                </TableCell>
                <TableCell>
                  <NumericValue>{h.expiryDisplay}</NumericValue>
                </TableCell>
                <TableCell>{h.direction}</TableCell>
                <TableCell className="text-right">
                  <NumericValue>
                    {formatDusdc(h.notionalQuote)}
                  </NumericValue>
                </TableCell>
                <TableCell className="text-right">
                  <NumericValue>
                    {formatDusdc(h.premiumQuote)}
                  </NumericValue>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
