// dashboard/src/components/panels/VaultPanel.tsx — Plan 04-05 Task 1 (DASH-06).
//
// UI-SPEC §Component Inventory: three stat blocks (NAV / total assets / total
// shares) using monospace numeric + one radial utilization gauge using Recharts
// `RadialBarChart`. All formatting routes through `dashboard/src/lib/format.ts`
// helpers — Pitfall 8: BigInt math at the source, `Number()` only at the
// display boundary.
//
// Color contract (UI-SPEC §Recharts palette):
//   - Utilization gauge fill: cyan-500 #06b6d4 (active band)
//   - Track baseline:         slate-700/30 (background prop)
//
// Empty state copy (UI-SPEC §Empty states verbatim):
//   Heading: "Vault is initializing"
//   Body:    "Once the deployer seeds 10 DUSDC into the vault, NAV and
//             share-price metrics will appear."
//
// Paused banner (D-10): when vault.paused === true, prepend a rose-toned
// banner above the stat blocks to communicate "supply halted by AdminCap".
// Redeems and rolls still flow per Plan 02 D-10; the banner only signals the
// supply gate.

import { useMemo } from 'react';
import {
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
} from 'recharts';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { NumericValue } from '@/components/primitives/NumericValue';
import { StalenessPill } from '@/components/primitives/StalenessPill';
import {
  formatBps,
  formatDusdc,
  formatNav,
  formatShares,
} from '@/lib/format';
import type { VaultView } from '@/hooks/useVaultState';

type Props = { view: VaultView };

export function VaultPanel({ view }: Props) {
  const utilizationPct = useMemo(
    () => (view ? Number(view.utilizationBps) / 100 : 0),
    [view],
  );
  // RadialBar data ref: identity-stable across renders that don't change utilization.
  // Pitfall 4 mitigation — Recharts re-mounts the SVG on data reference change
  // unless we memoize. The utilization gauge has only one bar so the cost is small,
  // but consistency with Plotly memoization protocol is the locked-in pattern.
  const chartData = useMemo(
    () => [{ name: 'utilization', value: utilizationPct, fill: '#06b6d4' }],
    [utilizationPct],
  );

  if (!view) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Vault state</CardTitle>
          <CardDescription>NAV, share price, utilization.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="font-semibold text-slate-200">Vault is initializing</p>
          <p className="mt-1 text-sm text-slate-400">
            Once the deployer seeds 10 DUSDC into the vault, NAV and share-price
            metrics will appear.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <CardTitle>Vault state</CardTitle>
          <CardDescription>
            Live NAV, total assets, share supply, and utilization
            ((deployed)/total).
          </CardDescription>
        </div>
        <StalenessPill lastUpdatedMs={view.lastUpdatedMs} />
      </CardHeader>
      <CardContent>
        {view.vault.paused && (
          <p
            className="mb-4 rounded-md border border-rose-600/40 bg-rose-600/10 p-3 text-sm font-semibold text-rose-300"
            data-testid="paused-banner"
            role="alert"
          >
            Vault PAUSED — supply halted by AdminCap. Redeems and rolls still
            flow per D-10.
          </p>
        )}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="space-y-4">
            <Stat label="NAV per share">
              <NumericValue>{formatNav(view.navPerShareScaled)}</NumericValue>
            </Stat>
            <Stat label="Total assets (DUSDC)">
              <NumericValue>
                {formatDusdc(BigInt(view.vault.total_assets))}
              </NumericValue>
            </Stat>
            <Stat label="Total shares">
              <NumericValue>
                {formatShares(BigInt(view.vault.total_shares))}
              </NumericValue>
            </Stat>
            <Stat label="Utilization">
              <NumericValue>{formatBps(view.utilizationBps)}</NumericValue>
            </Stat>
          </div>
          <div
            data-testid="utilization-chart"
            className="relative"
            style={{ width: '100%', height: 220 }}
          >
            <ResponsiveContainer width="100%" height="100%">
              <RadialBarChart
                cx="50%"
                cy="50%"
                innerRadius="60%"
                outerRadius="100%"
                data={chartData}
                startAngle={90}
                endAngle={-270}
              >
                <PolarAngleAxis
                  type="number"
                  domain={[0, 100]}
                  tick={false}
                />
                <RadialBar background dataKey="value" cornerRadius={6} />
              </RadialBarChart>
            </ResponsiveContainer>
            <p
              className="pointer-events-none absolute inset-0 flex items-center justify-center text-2xl font-semibold text-cyan-300"
              aria-live="polite"
            >
              {utilizationPct.toFixed(1)}%
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 text-lg">{children}</p>
    </div>
  );
}
