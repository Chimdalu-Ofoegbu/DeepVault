// dashboard/src/components/panels/BucketGauge.tsx — Plan 04-05 Task 2 (DASH-07).
//
// UI-SPEC §Component Inventory BucketGauge:
//   - Per-user RateLimiter token-bucket gauge — radial arc showing
//     `available / capacity` with center numeric label.
//   - Three states:
//       1. wallet-disconnected → empty state w/ "Connect wallet to view your
//          withdrawal budget" + UI-SPEC body copy (verbatim).
//       2. wallet-connected, no bucket data yet → "Bucket lazy-init pending —
//          your bucket will be seeded on first redemption request." (matches
//          on-chain helpers/rate_limiter.move lazy-init via
//          get_or_init_user_bucket; pre-redemption users have no bucket row.)
//       3. wallet-connected, populated bucket → radial gauge + numeric label.
//
// Color contract (UI-SPEC §Recharts palette — token-bucket gauge):
//   utilizationPct >= 70 → emerald-500 #10b981 (full)
//   30 <= utilizationPct < 70 → amber-500 #f59e0b (warning)
//   utilizationPct < 30 → rose-600 #e11d48 (empty)
//
// utilizationPct is `available / capacity * 100` — i.e. "how full" the bucket
// is. A nearly full bucket means the user has lots of withdrawal headroom; an
// empty bucket means they've hit their per-user rate limit.
//
// All numeric rendering routes through `formatDusdc` from format.ts (Pitfall 8).
// v1: `useBucketState` is stubbed (Plan 04-07 Task 3 wires the RPC fallback).

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
import { useCurrentAccount } from '@mysten/dapp-kit';
import { useBucketState } from '@/hooks/useBucketState';
import { formatDusdc } from '@/lib/format';

export function BucketGauge() {
  const account = useCurrentAccount();
  const { view } = useBucketState();

  // Color escalation per UI-SPEC §Recharts palette (token-bucket gauge):
  //   >= 70 emerald-500 (full)
  //   >= 30 amber-500 (warning)
  //   < 30  rose-600 (empty)
  const utilizationPct = view ? view.utilizationPct : 0;
  const fillColor =
    utilizationPct >= 70 ? '#10b981' : utilizationPct >= 30 ? '#f59e0b' : '#e11d48';

  const chartData = useMemo(
    () => [{ name: 'available', value: utilizationPct, fill: fillColor }],
    [utilizationPct, fillColor],
  );

  // State 1: wallet disconnected.
  if (!account) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Withdrawal budget</CardTitle>
          <CardDescription>
            Per-user token bucket; refills at 1.2 DUSDC per ms.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="font-semibold text-slate-200">
            Connect wallet to view your withdrawal budget
          </p>
          <p className="mt-1 text-sm text-slate-400">
            Each user has an independent token bucket that refills at 1.2 DUSDC
            per ms.
          </p>
        </CardContent>
      </Card>
    );
  }

  // State 2: wallet connected, bucket data not yet seeded (no redeem_request yet).
  if (!view) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Withdrawal budget</CardTitle>
          <CardDescription>
            Per-user token bucket; refills at 1.2 DUSDC per ms.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-400">
            Bucket lazy-init pending — your bucket will be seeded on first
            redemption request.
          </p>
        </CardContent>
      </Card>
    );
  }

  // State 3: wallet connected, bucket populated.
  return (
    <Card>
      <CardHeader>
        <CardTitle>Withdrawal budget</CardTitle>
        <CardDescription>
          Available / capacity, refilling at 1.2 DUSDC per ms.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div
          data-testid="bucket-chart"
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
              <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
              <RadialBar background dataKey="value" cornerRadius={6} />
            </RadialBarChart>
          </ResponsiveContainer>
          <p
            className="pointer-events-none absolute inset-0 flex items-center justify-center text-2xl font-semibold"
            style={{ color: fillColor }}
            aria-live="polite"
          >
            {utilizationPct.toFixed(1)}%
          </p>
        </div>
        <p className="mt-2 text-center">
          <NumericValue className="text-lg">
            {formatDusdc(view.availableMicro)}
          </NumericValue>
          <span className="text-slate-500"> / </span>
          <NumericValue className="text-slate-400">
            {formatDusdc(view.capacityMicro)}
          </NumericValue>
          <span className="ml-2 text-xs text-slate-500">DUSDC</span>
        </p>
      </CardContent>
    </Card>
  );
}
