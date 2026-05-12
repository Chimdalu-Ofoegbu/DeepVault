// dashboard/src/components/panels/PositionViewer.tsx — Plan 04-07 Task 2 (DASH-12).
//
// Wallet-scoped position list with PnL attribution per UI-SPEC §Recharts palette
// + Plan 04-07 §"the zero-vs-unknown invariant":
//
//   PLP yield   → emerald-300 (#10b981-tinted)
//   Hedge cost  → rose-300    (#e11d48-tinted)
//   Hedge payoff → cyan-300   (#06b6d4-tinted)
//   Net         → slate-100
//
// Nullable column rendering rule (the zero-vs-unknown invariant):
//   value === null → em-dash "—" with explanatory tooltip
//   value === 0n   → "0.00 DUSDC" (real value)
//   value > 0n     → formatted DUSDC
//
// Tooltips (LOCKED copy):
//   plpYield null:    "PLP yield realized at redemption. Awaiting your first Redeemed event."
//   hedgePayoff null: "Hedge has not been unwound yet (still open or rolled)."
//   netQuote null:    "Net PnL awaits both PLP yield realization and at least one hedge unwind."
//
// Three empty states:
//   wallet disconnected → UI-SPEC §Empty states "Connect wallet to view your positions"
//   vault not deployed → UI-SPEC §Error states "Vault not yet deployed to testnet..."
//   wallet connected, no positions → UI-SPEC "No positions yet" + body

import { useCurrentAccount } from '@mysten/dapp-kit';

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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { NumericValue } from '@/components/primitives/NumericValue';
import { StalenessPill } from '@/components/primitives/StalenessPill';
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

function NullableQuote({
  value,
  tooltip,
  className,
}: {
  value: bigint | null;
  tooltip: string;
  className?: string;
}) {
  if (value === null) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className="cursor-help text-slate-500"
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
  return <NumericValue className={className}>{formatDusdc(value)}</NumericValue>;
}

function fmtOpenDate(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  return new Date(ms).toISOString().slice(0, 16).replace('T', ' ');
}

export function PositionViewer({ positions, vault }: Props) {
  const account = useCurrentAccount();
  const deployed = isDeployed();
  const lastUpdatedMs = vault ? Number(vault.last_updated_ms) : null;

  // State 1: wallet disconnected.
  if (!account) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Positions</CardTitle>
          <CardDescription>Open positions for the connected wallet.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="font-semibold text-slate-200">
            Connect wallet to view your positions
          </p>
        </CardContent>
      </Card>
    );
  }

  // State 2: vault not yet deployed (TESTNET-DEPLOY.json status pending).
  if (!deployed) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Positions</CardTitle>
          <CardDescription>Open positions for the connected wallet.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-400">
            Vault not yet deployed to testnet. The dashboard is in snapshot-only
            mode — live events resume after deploy.
          </p>
        </CardContent>
      </Card>
    );
  }

  // State 3: wallet connected + deployed but no positions yet.
  if (positions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Positions</CardTitle>
          <CardDescription>Open positions for the connected wallet.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="font-semibold text-slate-200">No positions yet</p>
          <p className="mt-1 text-sm text-slate-400">
            Deposit DUSDC to mint vault shares and open your first hedged position.
          </p>
        </CardContent>
      </Card>
    );
  }

  // State 4: wallet connected + deployed + populated.
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <CardTitle>Positions</CardTitle>
          <CardDescription>
            PnL attribution split: PLP yield, hedge cost, hedge payoff, net.
          </CardDescription>
        </div>
        {lastUpdatedMs != null && <StalenessPill lastUpdatedMs={lastUpdatedMs} compact />}
      </CardHeader>
      <CardContent>
        <Table data-testid="positions-table">
          <TableHeader>
            <TableRow>
              <TableHead>Open</TableHead>
              <TableHead>Deposit</TableHead>
              <TableHead>Shares</TableHead>
              <TableHead className="text-emerald-300">PLP yield</TableHead>
              <TableHead className="text-rose-300">Hedge cost</TableHead>
              <TableHead className="text-cyan-300">Hedge payoff</TableHead>
              <TableHead className="text-slate-100">Net</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {positions.map((p, i) => (
              <TableRow key={`${p.eventTs}-${i}`}>
                <TableCell>
                  <NumericValue className="text-xs text-slate-400">
                    {fmtOpenDate(p.eventTs)}
                  </NumericValue>
                </TableCell>
                <TableCell>
                  <NumericValue>{formatDusdc(p.depositQuote)}</NumericValue>
                </TableCell>
                <TableCell>
                  <NumericValue>{formatShares(p.sharesMinted)}</NumericValue>
                </TableCell>
                <TableCell>
                  <NullableQuote
                    value={p.plpYield}
                    tooltip={TOOLTIP_PLP_YIELD}
                    className="text-emerald-300"
                  />
                </TableCell>
                <TableCell>
                  {p.hedgeCost === null ? (
                    <span className="text-slate-500">—</span>
                  ) : (
                    <NumericValue className="text-rose-300">
                      {formatDusdc(p.hedgeCost)}
                    </NumericValue>
                  )}
                </TableCell>
                <TableCell>
                  <NullableQuote
                    value={p.hedgePayoff}
                    tooltip={TOOLTIP_HEDGE_PAYOFF}
                    className="text-cyan-300"
                  />
                </TableCell>
                <TableCell>
                  <NullableQuote
                    value={p.netQuote}
                    tooltip={TOOLTIP_NET}
                    className="text-slate-100"
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
