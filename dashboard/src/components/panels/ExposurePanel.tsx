// dashboard/src/components/panels/ExposurePanel.tsx — Plan 04.1-04 Task 1.
//
// Phase 04.1 reskin (UI-SPEC Per-Panel Mapping #3, LD-2): the Phase-4 shadcn
// <Card> + Recharts horizontal BarChart + <Table> is replaced by the handoff
// `§ Per-oracle` `db-card.pad` `oracles` bar-list (the `.db-card`/`.oracles`
// classes come from the globals.css component layer added by Plan 04.1-01
// Task 2). Recharts is removed from this file — the CSS bar-list is the
// contract.
//
// BTC-ONLY (LD-2): the dashboard is locked to BTC at v1. The handoff's
// other-asset rows are NOT rendered — exposure shows a single BTC oracle row.
// The bar width is the BTC oracle's share of total hedge notional (100% when
// any hedges are open, since BTC is the only oracle).
//
// Empty state (UI-SPEC Copywriting verbatim): when no hedge legs are open the
// panel still renders a single BTC row at 0% with the body copy
// "BTC oracle · 0% exposure — no hedge legs open yet."
//
// `useExposure` is unchanged — this panel is a pure consumer of `Hedge[]`.

import { useMemo } from 'react';

import type { Hedge } from '@/hooks/useExposure';
import { formatDusdc } from '@/lib/format';
import type { VaultStateSnapshot } from '@/lib/types';

type Props = { hedges: Hedge[]; vault: VaultStateSnapshot };

export function ExposurePanel({ hedges }: Props) {
  // BTC-only (LD-2): aggregate all open-hedge notional into one BTC row.
  // Total notional is the sum across hedges; the BTC oracle holds 100% of it.
  const totalNotional = useMemo(
    () => hedges.reduce((acc, h) => acc + h.notionalQuote, 0n),
    [hedges],
  );

  const hasHedges = hedges.length > 0 && totalNotional > 0n;
  const pct = hasHedges ? 100 : 0;

  return (
    <div className="db-card pad" data-section="exposure">
      <header className="db-h">
        <div>
          <span className="db-mark">§ Per-oracle</span>
          <h3>Exposure</h3>
        </div>
      </header>
      {hasHedges ? (
        <ul className="oracles" data-testid="exposure-list">
          <li>
            <span>BTC oracle</span>
            <b>{pct.toFixed(1)}%</b>
            <em className="bar" style={{ ['--w' as string]: `${pct}%` }} />
          </li>
        </ul>
      ) : (
        <>
          <ul className="oracles" data-testid="exposure-list">
            <li>
              <span>BTC oracle</span>
              <b>0%</b>
              <em className="bar" style={{ ['--w' as string]: '0%' }} />
            </li>
          </ul>
          <p className="mt-3 text-sm" style={{ color: 'var(--muted)' }}>
            BTC oracle · 0% exposure — no live hedge legs. Testnet Predict
            offers only intraday BTC markets; the vault's 14-day hedge has no
            matching market today (full mechanics shown in the audited backtest).
          </p>
        </>
      )}
      {hasHedges && (
        <p className="mt-3 mono dim" style={{ fontSize: '11px' }}>
          notional · {formatDusdc(totalNotional)} DUSDC across {hedges.length}{' '}
          leg{hedges.length === 1 ? '' : 's'}
        </p>
      )}
    </div>
  );
}
