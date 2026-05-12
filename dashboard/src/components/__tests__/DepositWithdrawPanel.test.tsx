// dashboard/src/components/__tests__/DepositWithdrawPanel.test.tsx — Plan 04-07 Task 2.
//
// Validates UI-SPEC §Deposit/Redeem flow (DASH-11):
//   - 3 empty states (wallet disconnected / vault not deployed / connected+deployed)
//   - Pre-sign balance check (Pitfall 5) rejects with UI-SPEC verbatim copy
//   - Confirmation Dialog shows "Confirm deposit of X DUSDC" copy
//   - Destructive Dialog wraps "Cancel request" only (NOT fulfill)
//   - useSignAndExecuteTransaction is wired (link contract grep)

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// Polyfills for Radix UI in jsdom (Dialog + Tabs rely on these).
if (typeof Element !== 'undefined') {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
}
class ResizeObserverPolyfill {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: typeof ResizeObserverPolyfill }).ResizeObserver =
  (globalThis as unknown as { ResizeObserver: typeof ResizeObserverPolyfill }).ResizeObserver ??
  ResizeObserverPolyfill;

const mockUseCurrentAccount = vi.fn();
const mockSignAndExecute = vi.fn();
const mockGetCoins = vi.fn();
vi.mock('@mysten/dapp-kit', () => ({
  useCurrentAccount: () => mockUseCurrentAccount(),
  useSuiClient: () => ({ getCoins: mockGetCoins }),
  useSignAndExecuteTransaction: () => ({ mutate: mockSignAndExecute, isPending: false }),
}));

const mockIsDeployed = vi.fn();
vi.mock('@/lib/ptbDeploy', async () => {
  const mod = await vi.importActual<typeof import('@/lib/ptbDeploy')>(
    '@/lib/ptbDeploy',
  );
  return {
    ...mod,
    isDeployed: () => mockIsDeployed(),
  };
});

const mockToastError = vi.fn();
const mockToastSuccess = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: (...args: unknown[]) => mockToastSuccess(...args),
  },
}));

import { DepositWithdrawPanel } from '@/components/panels/DepositWithdrawPanel';
import type { VaultView } from '@/hooks/useVaultState';

const vaultView: VaultView = {
  vault: {
    vault_id: '0xVAULT',
    balance: '500000000',
    total_assets: '1000000000',
    total_shares: '500000000',
    paused: false,
    last_updated_ms: String(Date.now()),
  },
  navPerShareScaled: 2_000_000_000n,
  utilizationBps: 5_000n,
  lastUpdatedMs: Date.now(),
};

describe('<DepositWithdrawPanel>', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsDeployed.mockReturnValue(true);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders wallet-disconnected empty state', () => {
    mockUseCurrentAccount.mockReturnValue(null);
    render(<DepositWithdrawPanel vaultView={vaultView} />);
    expect(
      screen.getByText('Connect wallet to deposit or redeem'),
    ).toBeInTheDocument();
  });

  it('renders vault-not-deployed empty state (UI-SPEC verbatim copy)', () => {
    mockUseCurrentAccount.mockReturnValue({ address: '0xUSER' });
    mockIsDeployed.mockReturnValue(false);
    render(<DepositWithdrawPanel vaultView={vaultView} />);
    expect(
      screen.getByText(/Vault not yet deployed to testnet/),
    ).toBeInTheDocument();
  });

  it('renders the Deposit/Redeem tabs when connected + deployed', () => {
    mockUseCurrentAccount.mockReturnValue({ address: '0xUSER' });
    mockGetCoins.mockResolvedValue({ data: [] });
    render(<DepositWithdrawPanel vaultView={vaultView} />);
    expect(screen.getByText('Deposit')).toBeInTheDocument();
    expect(screen.getByText('Redeem')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('0.00')).toBeInTheDocument();
  });

  it('pre-sign balance check rejects insufficient DUSDC with UI-SPEC verbatim copy', async () => {
    mockUseCurrentAccount.mockReturnValue({ address: '0xUSER' });
    // Wallet has only 50 DUSDC (50_000_000 micro-units).
    mockGetCoins.mockResolvedValue({
      data: [{ coinObjectId: '0xCOIN', balance: '50000000' }],
    });
    render(<DepositWithdrawPanel vaultView={vaultView} />);
    const input = screen.getByPlaceholderText('0.00') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: 'Deposit DUSDC' }));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalled();
    });
    const msg = mockToastError.mock.calls[0][0] as string;
    expect(msg).toMatch(/Insufficient DUSDC\. You have .+; this deposit requires .+\./);
  });

  it('opens confirmation Dialog with "Confirm deposit of {amount} DUSDC" on valid balance', async () => {
    mockUseCurrentAccount.mockReturnValue({ address: '0xUSER' });
    mockGetCoins.mockResolvedValue({
      data: [{ coinObjectId: '0xCOIN', balance: '1000000000' }], // 1000 DUSDC
    });
    render(<DepositWithdrawPanel vaultView={vaultView} />);
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '100' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Deposit DUSDC' }));
    });

    await waitFor(() => {
      // Dialog title contains the verbatim copy.
      const titles = screen.queryAllByText(/Confirm deposit of/);
      expect(titles.length).toBeGreaterThan(0);
      // 100 DUSDC in micro-units = 100_000_000 → formatDusdc → "100.00"
      const hits = screen.queryAllByText(/100\.00/);
      expect(hits.length).toBeGreaterThan(0);
    });
  });

  it('source declares useSignAndExecuteTransaction + Insufficient DUSDC copy + destructive Cancel + Confirm deposit', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const file = resolve(
      process.cwd(),
      'src/components/panels/DepositWithdrawPanel.tsx',
    );
    const text = readFileSync(file, 'utf8');
    expect(text).toMatch(/useSignAndExecuteTransaction/);
    expect(text).toMatch(/Insufficient DUSDC/);
    expect(text).toMatch(/Cancel redemption request/);
    expect(text).toMatch(/Confirm deposit of/);
    expect(text).toMatch(/variant=['"]destructive['"]/); // destructive button for cancel
  });
});
