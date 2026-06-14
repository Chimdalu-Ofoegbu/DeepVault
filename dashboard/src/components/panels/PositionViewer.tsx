// dashboard/src/components/panels/PositionViewer.tsx — Plan 04.1-04 Task 3.
//
// Phase 04.1 reskin (UI-SPEC Per-Panel Mapping #5, LD-2): the Phase-4 shadcn
// <Card> + <Table> is replaced by the handoff `§ Positions` full-width
// `db-card` (no pad) with the `pos-table` layout — Geist Mono 12.5px cells,
// uppercase 10.5px `th`, `leg-dot` row markers, status `chip`s (classes from
// globals.css via Plan 04.1-01 Task 2). Styling/markup change only.
//
// BTC-ONLY (LD-2): the dashboard is locked to BTC at v1. The handoff's
// multi-asset filter tabs are dropped entirely and replaced by a single
// disabled `BTC` indicator `chip`. Every position row's Underlying is BTC.
//
// Color contract (UI-SPEC §Color): hedge rows use a coral `leg-dot`; the
// PLP-supply row uses the mint `leg-dot.src`. PnL columns are mint for
// positive, coral for negative — via the `pos-table` `td.pos`/`td.neg`
// classes (which resolve to var(--accent)/var(--hedge)).
//
// The zero-vs-unknown nullable invariant is PRESERVED: `null` renders as an
// em-dash with a tooltip; `0n` renders as "0.00 DUSDC". `usePositions` and
// the tooltips are unchanged.
//
// Two empty states (UI-SPEC verbatim):
//   wallet-not-connected → "Connect a wallet to view your vault position and
//                           PnL attribution."
//   connected-no-position → "No position yet. Deposit DUSDC to receive vault
//                            shares."

import { useCurrentAccount } from '@mysten/dapp-kit';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { Position } from '@/hooks/usePositions';
import { isDeployed } from '@/lib/ptbDeploy';
import { formatDusdc, formatShares } from '@/lib/format';
import type { VaultStateSnapshot } from '@/lib/types';

type Props = {
  positions: Position[];
  vault: VaultStateSnapshot;
};

// Tooltip copy (LOCKED — tests assert verbatim).
const TOOLTIP_PLP_YIELD =
  'PLP yield realized at redemption. Awaiting your first Redeemed event.';
const TOOLTIP_HEDGE_PAYOFF =
  'Hedge has not been unwound yet (still open or rolled).';
const TOOLTIP_NET =
  'Net PnL awaits both PLP yield realization and at least one hedge unwind.';

/** Renders a `bigint | null` quote. null -> em-dash + tooltip; value ->
 *  formatted DUSDC. `tone` picks the pos/neg mint/coral class for non-null
 *  signed values. The zero-vs-unknown invariant is preserved. */
function NullableCell({
  value,
  tooltip,
  signed = false,
}: {
  value: bigint | null;
  tooltip: string;
  signed?: boolean;
}) {
  if (value === null) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className="dim"
              style={{ cursor: 'help' }}
              aria-label={tooltip}
              data-testid="nullable-em-dash"
            >
              —
            </span>
          </TooltipTrigger>
          <TooltipContent>{tooltip}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  const cls = signed ? (value >= 0n ? 'pos' : 'neg') : '';
  return <span className={cls}>{formatDusdc(value)}</span>;
}

function fmtOpenDate(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  return new Date(ms).toISOString().slice(0, 16).replace('T', ' ');
}

export function PositionViewer({ positions }: Props) {
  const account = useCurrentAccount();
  const deployed = isDeployed();

  // State 1: wallet disconnected.
  if (!account) {
    return (
      <div className="db-card positions" data-section="position-viewer">
        <header className="db-h">
          <div>
            <span className="db-mark">§ Positions</span>
            <h2>Hedge ladder</h2>
          </div>
          <span className="chip">BTC</span>
        </header>
        <p className="px-[22px] pb-5 text-sm" style={{ color: 'var(--text-2)' }}>
          Connect a wallet to view your vault position and PnL attribution.
        </p>
      </div>
    );
  }

  // State 2: vault not yet deployed (TESTNET-DEPLOY.json status pending).
  if (!deployed) {
    return (
      <div className="db-card positions" data-section="position-viewer">
        <header className="db-h">
          <div>
            <span className="db-mark">§ Positions</span>
            <h2>Hedge ladder</h2>
          </div>
          <span className="chip">BTC</span>
        </header>
        <p className="px-[22px] pb-5 text-sm" style={{ color: 'var(--muted)' }}>
          Vault not yet deployed to testnet. The dashboard is in snapshot-only
          mode — live events resume after deploy.
        </p>
      </div>
    );
  }

  // State 3: wallet connected + deployed but no positions yet.
  if (positions.length === 0) {
    return (
      <div className="db-card positions" data-section="position-viewer">
        <header className="db-h">
          <div>
            <span className="db-mark">§ Positions</span>
            <h2>Hedge ladder</h2>
          </div>
          <span className="chip">BTC</span>
        </header>
        <p className="px-[22px] pb-5 text-sm" style={{ color: 'var(--text-2)' }}>
          No live hedge legs yet. Testnet Predict lists only intraday BTC
          markets, while the vault's hedge targets a 14-day tenor — so the
          live mint has no matching market on testnet today. The full
          deposit → hedge → redeem mechanics are proven in the audited
          backtest; mainnet deploy is gated on multi-day Predict markets
          (see <code>docs/MAINNET-READINESS.md</code>).
        </p>
      </div>
    );
  }

  // State 4: wallet connected + deployed + populated.
  const legCount = positions.length;
  return (
    <div className="db-card positions" data-section="position-viewer">
      <header className="db-h">
        <div>
          <span className="db-mark">§ Positions</span>
          <h2>Hedge ladder · live</h2>
        </div>
        {/* BTC-only (LD-2): the asset-filter tabs are replaced by a single
            disabled BTC indicator chip. */}
        <span className="chip">BTC</span>
      </header>
      <table className="pos-table" data-testid="positions-table">
        <thead>
          <tr>
            <th>Leg</th>
            <th>Underlying</th>
            <th>Opened</th>
            <th className="r">Deposit</th>
            <th className="r">Shares</th>
            <th className="r">PLP yield</th>
            <th className="r">Hedge cost</th>
            <th className="r">Hedge payoff</th>
            <th className="r">Net PnL</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {positions.map((p, i) => (
            <tr key={`${p.eventTs}-${i}`}>
              <td>
                <i className="leg-dot src" />
                PLP supply
              </td>
              <td>BTC</td>
              <td className="dim">{fmtOpenDate(p.eventTs)}</td>
              <td className="num r">{formatDusdc(p.depositQuote)}</td>
              <td className="num r">{formatShares(p.sharesMinted)}</td>
              <td className="num r">
                <NullableCell
                  value={p.plpYield}
                  tooltip={TOOLTIP_PLP_YIELD}
                  signed
                />
              </td>
              <td className="num r">
                {p.hedgeCost === null ? (
                  <span className="dim">—</span>
                ) : (
                  <span className="neg">{formatDusdc(p.hedgeCost)}</span>
                )}
              </td>
              <td className="num r">
                <NullableCell
                  value={p.hedgePayoff}
                  tooltip={TOOLTIP_HEDGE_PAYOFF}
                  signed
                />
              </td>
              <td className="num r">
                <NullableCell
                  value={p.netQuote}
                  tooltip={TOOLTIP_NET}
                  signed
                />
              </td>
              <td className="r">
                <span className="chip ok">supplying</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <footer className="db-foot">
        <span className="mono dim">
          {legCount} position{legCount === 1 ? '' : 's'} · BTC-only · PnL
          attribution split
        </span>
        <span className="mono">PLP yield · hedge cost · hedge payoff · net</span>
      </footer>
    </div>
  );
}
