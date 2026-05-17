// dashboard/src/components/panels/BucketGauge.tsx — Plan 04.1-04 Task 1.
//
// Phase 04.1 reskin (UI-SPEC Per-Panel Mapping #2): the Phase-4 shadcn
// <Card> + Recharts RadialBarChart is replaced by the handoff `§ Withdrawals`
// `db-card.pad` `bucket` layout (bucket-num / bucket-l / bucket-bar /
// bucket-foot — all defined in globals.css by Plan 04.1-01 Task 2). Styling
// and markup change only; `useBucketState` + `useCurrentAccount` and the
// 3-state wallet logic are preserved.
//
// Color contract (UI-SPEC §Color): the bucket fill bar is electric mint
// (`CHART_COLORS.accent`) when the bucket is healthy and coral
// (`CHART_COLORS.hedge`) when the available budget is low — mint = healthy,
// coral = loss/destructive.
//
// utilizationPct is `available / capacity * 100` — i.e. "how full" the bucket
// is. A nearly full bucket means lots of withdrawal headroom; an empty bucket
// means the user has hit their per-user rate limit. The big `bucket-num`
// shows the real available % of NAV; the footer carries queue + next-refill
// (UI-SPEC Copywriting empty-state row "queue · 0").
//
// All numeric rendering routes through `formatDusdc` from format.ts (Pitfall 8).
// v1: `useBucketState` is stubbed (Plan 04-07 wired the RPC fallback).

import { useCurrentAccount } from '@mysten/dapp-kit';

import { useBucketState } from '@/hooks/useBucketState';
import { CHART_COLORS } from '@/lib/dashboard_constants';
import { formatDusdc } from '@/lib/format';

// Healthy/low escalation: mint when the bucket has headroom, coral when the
// available withdrawal budget runs low. Replaces the Phase-4 emerald/amber/
// rose hex ternary with the handoff mint/coral tokens (UI-SPEC §Color).
function fillFor(utilizationPct: number): string {
  return utilizationPct >= 30 ? CHART_COLORS.accent : CHART_COLORS.hedge;
}

export function BucketGauge() {
  const account = useCurrentAccount();
  const { view } = useBucketState();

  // State 1: wallet disconnected.
  if (!account) {
    return (
      <div className="db-card pad" data-section="bucket">
        <header className="db-h">
          <div>
            <span className="db-mark">§ Withdrawals</span>
            <h3>Token bucket</h3>
          </div>
          <span className="mono dim">refills 1.2 / ms</span>
        </header>
        <p className="text-sm" style={{ color: 'var(--text-2)' }}>
          Connect a wallet to view your withdrawal budget. Each user has an
          independent token bucket that refills at 1.2 DUSDC per ms.
        </p>
      </div>
    );
  }

  // State 2: wallet connected, bucket data not yet seeded (no redeem_request yet).
  if (!view) {
    return (
      <div className="db-card pad" data-section="bucket">
        <header className="db-h">
          <div>
            <span className="db-mark">§ Withdrawals</span>
            <h3>Token bucket</h3>
          </div>
          <span className="mono dim">refills 1.2 / ms</span>
        </header>
        <p className="text-sm" style={{ color: 'var(--muted)' }}>
          Bucket lazy-init pending — your bucket will be seeded on first
          redemption request.
        </p>
      </div>
    );
  }

  // State 3: wallet connected, bucket populated.
  const utilizationPct = view.utilizationPct;
  const fill = fillFor(utilizationPct);
  // Clamp the bar width to [0, 100] so a malformed readout cannot overflow.
  const barWidth = Math.max(0, Math.min(100, utilizationPct));

  return (
    <div className="db-card pad" data-section="bucket">
      <header className="db-h">
        <div>
          <span className="db-mark">§ Withdrawals</span>
          <h3>Token bucket</h3>
        </div>
        <span className="mono dim">refills 1.2 / ms</span>
      </header>
      <div className="bucket" data-testid="bucket-chart">
        <div className="bucket-num" aria-live="polite">
          {utilizationPct.toFixed(1)}
          <i>%</i>
        </div>
        <div className="bucket-l">of NAV available now</div>
        <div className="bucket-bar">
          <i style={{ width: `${barWidth}%`, background: fill }} />
        </div>
        <div className="bucket-foot">
          <span>queue · 0</span>
          <span>
            {formatDusdc(view.availableMicro)} / {formatDusdc(view.capacityMicro)}{' '}
            DUSDC
          </span>
        </div>
      </div>
    </div>
  );
}
