// dashboard/src/components/__tests__/PositionViewer.test.tsx — Plan 04-07 Task 2.
//
// Validates the zero-vs-unknown rendering contract:
//   - plpYield === null → em-dash with tooltip "PLP yield realized at redemption..."
//   - hedgePayoff === null → em-dash with tooltip "Hedge has not been unwound yet..."
//   - hedgePayoff === 0n → "0.00 DUSDC" (real OTM payout, NOT em-dash)
//   - netQuote === null → em-dash with tooltip "Net PnL awaits both..."
//   - 3 empty states (wallet disconnected / vault not deployed / no positions)

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const mockUseCurrentAccount = vi.fn();
vi.mock('@mysten/dapp-kit', () => ({
  useCurrentAccount: () => mockUseCurrentAccount(),
}));

const mockIsDeployed = vi.fn();
vi.mock('@/lib/ptbDeploy', () => ({
  isDeployed: () => mockIsDeployed(),
  DEPLOY: { vault_id: '0xVAULT' },
}));

import { PositionViewer } from '@/components/panels/PositionViewer';
import type { Position } from '@/hooks/usePositions';
import type { VaultStateSnapshot } from '@/lib/types';

const vault: NonNullable<VaultStateSnapshot> = {
  vault_id: '0xVAULT',
  balance: '500000000',
  total_assets: '1000000000',
  total_shares: '500000000',
  paused: false,
  last_updated_ms: String(Date.now()),
};

function pos(overrides: Partial<Position>): Position {
  return {
    eventTs: 1_700_000_000_000,
    depositQuote: 10_000_000n,
    sharesMinted: 5_000_000n,
    hedgeCost: 1_000_000n,
    hedgePayoff: null,
    plpYield: null,
    netQuote: null,
    ...overrides,
  };
}

describe('<PositionViewer>', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsDeployed.mockReturnValue(true);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders wallet-disconnected empty state', () => {
    mockUseCurrentAccount.mockReturnValue(null);
    render(<PositionViewer positions={[]} vault={vault} />);
    expect(screen.getByText('Connect wallet to view your positions')).toBeInTheDocument();
    expect(screen.queryByTestId('positions-table')).not.toBeInTheDocument();
  });

  it('renders vault-not-deployed empty state (UI-SPEC error copy verbatim)', () => {
    mockUseCurrentAccount.mockReturnValue({ address: '0xUSER' });
    mockIsDeployed.mockReturnValue(false);
    render(<PositionViewer positions={[]} vault={vault} />);
    expect(
      screen.getByText(/Vault not yet deployed to testnet/),
    ).toBeInTheDocument();
  });

  it('renders no-positions empty state when wallet connected + deployed + positions empty', () => {
    mockUseCurrentAccount.mockReturnValue({ address: '0xUSER' });
    render(<PositionViewer positions={[]} vault={vault} />);
    expect(screen.getByText('No positions yet')).toBeInTheDocument();
    expect(
      screen.getByText(/Deposit DUSDC to mint vault shares/),
    ).toBeInTheDocument();
  });

  it('renders the positions table with header + PnL attribution columns', () => {
    mockUseCurrentAccount.mockReturnValue({ address: '0xUSER' });
    render(
      <PositionViewer
        positions={[pos({ plpYield: 500_000n, hedgePayoff: 300_000n, netQuote: -200_000n })]}
        vault={vault}
      />,
    );
    expect(screen.getByTestId('positions-table')).toBeInTheDocument();
    expect(screen.getByText('PLP yield')).toBeInTheDocument();
    expect(screen.getByText('Hedge cost')).toBeInTheDocument();
    expect(screen.getByText('Hedge payoff')).toBeInTheDocument();
    expect(screen.getByText('Net')).toBeInTheDocument();
  });

  it('renders em-dash for null plpYield (NOT "0" or "0.00") with locked tooltip copy', () => {
    mockUseCurrentAccount.mockReturnValue({ address: '0xUSER' });
    render(<PositionViewer positions={[pos({ plpYield: null })]} vault={vault} />);
    // At least one em-dash is rendered for null plpYield/hedgePayoff/netQuote.
    const dashes = screen.getAllByTestId('nullable-em-dash');
    expect(dashes.length).toBeGreaterThan(0);
    // Tooltip copy is asserted via aria-label which is rendered eagerly.
    expect(
      screen.getAllByLabelText(
        'PLP yield realized at redemption. Awaiting your first Redeemed event.',
      ).length,
    ).toBeGreaterThan(0);
  });

  it('renders "0.00" for hedgePayoff === 0n (zero IS a value, em-dash is not-yet-known)', () => {
    mockUseCurrentAccount.mockReturnValue({ address: '0xUSER' });
    render(
      <PositionViewer
        positions={[pos({ hedgePayoff: 0n, plpYield: 100_000n, netQuote: -900_000n })]}
        vault={vault}
      />,
    );
    // hedgePayoff=0n renders formatted DUSDC ("0.00"), not em-dash.
    // formatDusdc(0n) outputs "0.00" (minimum 2 fraction digits per Intl).
    // We assert the cyan-300 hedgePayoff cell contains a numeric (not em-dash).
    const cyanCells = document.querySelectorAll('.text-cyan-300');
    const hedgePayoffCell = Array.from(cyanCells).find((el) =>
      /^[-\d.,]+$/.test(el.textContent?.trim() ?? ''),
    );
    expect(hedgePayoffCell?.textContent?.trim()).toMatch(/^0\.0+$/);
    // The em-dash should NOT appear for the hedgePayoff column when value is 0n.
    // (em-dash MAY still appear for plpYield/netQuote depending on overrides.)
  });

  it('renders em-dash for null hedgePayoff with the locked tooltip', () => {
    mockUseCurrentAccount.mockReturnValue({ address: '0xUSER' });
    render(<PositionViewer positions={[pos({ hedgePayoff: null })]} vault={vault} />);
    expect(
      screen.getAllByLabelText(
        'Hedge has not been unwound yet (still open or rolled).',
      ).length,
    ).toBeGreaterThan(0);
  });

  it('renders em-dash for null netQuote with the locked tooltip', () => {
    mockUseCurrentAccount.mockReturnValue({ address: '0xUSER' });
    render(<PositionViewer positions={[pos({ netQuote: null })]} vault={vault} />);
    expect(
      screen.getAllByLabelText(
        'Net PnL awaits both PLP yield realization and at least one hedge unwind.',
      ).length,
    ).toBeGreaterThan(0);
  });

  it('source declares the PnL attribution color palette (emerald/rose/cyan/slate)', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const file = resolve(process.cwd(), 'src/components/panels/PositionViewer.tsx');
    const text = readFileSync(file, 'utf8');
    expect(text).toMatch(/text-emerald-300/); // PLP yield
    expect(text).toMatch(/text-rose-300/); // hedge cost
    expect(text).toMatch(/text-cyan-300/); // hedge payoff
    expect(text).toMatch(/text-slate-100/); // net
  });
});
