// dashboard/src/components/__tests__/PositionViewer.test.tsx — Plan 04.1-04 Task 3.
//
// Validates the Phase 04.1 reskin (UI-SPEC #5, LD-2) + the preserved
// zero-vs-unknown rendering contract:
//   - plpYield/hedgePayoff/netQuote === null → em-dash with locked tooltip
//   - hedgePayoff === 0n → "0.00 DUSDC" (real OTM payout, NOT em-dash)
//   - two empty states (wallet disconnected / connected-no-position) with the
//     UI-SPEC verbatim copy
//   - pos-table chrome with a single disabled BTC chip — no asset-filter tabs
//
// Test contract updated for the reskin (Rule 1): the Phase-4 assertions
// checked the replaced shadcn Table copy ("Connect wallet to view your
// positions", "No positions yet") and the emerald/rose/cyan/slate Tailwind
// PnL classes — the reskin moves to the handoff pos-table `td.pos`/`td.neg`
// mint/coral classes. The zero-vs-unknown behavioral coverage is preserved.

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

  it('renders wallet-disconnected empty state (UI-SPEC verbatim copy)', () => {
    mockUseCurrentAccount.mockReturnValue(null);
    render(<PositionViewer positions={[]} vault={vault} />);
    expect(
      screen.getByText(
        'Connect a wallet to view your vault position and PnL attribution.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('positions-table')).not.toBeInTheDocument();
  });

  it('renders vault-not-deployed empty state', () => {
    mockUseCurrentAccount.mockReturnValue({ address: '0xUSER' });
    mockIsDeployed.mockReturnValue(false);
    render(<PositionViewer positions={[]} vault={vault} />);
    expect(
      screen.getByText(/Vault not yet deployed to testnet/),
    ).toBeInTheDocument();
  });

  it('renders connected-no-position empty state with the testnet-oracle note', () => {
    mockUseCurrentAccount.mockReturnValue({ address: '0xUSER' });
    render(<PositionViewer positions={[]} vault={vault} />);
    // Empty-state annotated with the testnet-oracle limitation (the live hedge
    // mint has no matching multi-day Predict market on testnet today). The copy
    // includes an inline <code> ref, so match the distinctive leading text.
    expect(screen.getByText(/No live hedge legs yet/i)).toBeInTheDocument();
  });

  it('renders the pos-table with PnL attribution columns + a disabled BTC chip', () => {
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
    expect(screen.getByText('Net PnL')).toBeInTheDocument();
    // BTC indicator chip + BTC underlying cells (LD-2 — no asset-filter tabs).
    expect(screen.getAllByText('BTC').length).toBeGreaterThan(0);
  });

  it('renders em-dash for null plpYield with locked tooltip copy', () => {
    mockUseCurrentAccount.mockReturnValue({ address: '0xUSER' });
    render(<PositionViewer positions={[pos({ plpYield: null })]} vault={vault} />);
    const dashes = screen.getAllByTestId('nullable-em-dash');
    expect(dashes.length).toBeGreaterThan(0);
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
    // hedgePayoff=0n renders formatted DUSDC ("0.00"), not em-dash. The 0n
    // value is non-negative so it carries the mint `pos` class.
    const posCells = document.querySelectorAll('.pos');
    const zeroCell = Array.from(posCells).find(
      (el) => /^0\.0+$/.test(el.textContent?.trim() ?? ''),
    );
    expect(zeroCell?.textContent?.trim()).toMatch(/^0\.0+$/);
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

  it('source: BTC-only pos-table, no asset-filter tabs, no Phase-4 PnL hex/tailwind colors', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const file = resolve(process.cwd(), 'src/components/panels/PositionViewer.tsx');
    const text = readFileSync(file, 'utf8');
    // Reskinned to the handoff pos-table; usePositions data path preserved.
    expect(text).toMatch(/pos-table/);
    expect(text).toMatch(/usePositions/);
    // No Phase-4 emerald/rose/cyan Tailwind PnL classes; no hardcoded hex.
    expect(text).not.toMatch(/text-emerald-300/);
    expect(text).not.toMatch(/text-rose-300/);
    expect(text).not.toMatch(/text-cyan-300/);
    expect(text).not.toMatch(/#06b6d4|#10b981|#e11d48/);
  });
});
