// dashboard/src/components/__tests__/BucketGauge.test.tsx — Plan 04-05 Task 2.
//
// Validates UI-SPEC §Component Inventory BucketGauge + DASH-07:
//   - wallet-disconnected empty state (UI-SPEC verbatim copy)
//   - wallet-connected + no bucket data: "Bucket lazy-init pending" body
//   - wallet-connected + populated bucket: radial chart + formatted DUSDC numerics
//   - Color escalation source-grep: emerald >=70% / amber 30-70% / rose <30%
//
// We mock `@mysten/dapp-kit` `useCurrentAccount` and `@/hooks/useBucketState`
// rather than wrap with the full provider stack — option (b) per the plan body.
// This keeps the test focused on the panel's render branches without dragging
// in QueryClientProvider / SuiClientProvider / WalletProvider boilerplate.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// ResizeObserver shim (Recharts ResponsiveContainer reaches for it in jsdom).
class ResizeObserverPolyfill {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: typeof ResizeObserverPolyfill }).ResizeObserver =
  (globalThis as unknown as { ResizeObserver: typeof ResizeObserverPolyfill }).ResizeObserver ??
  ResizeObserverPolyfill;

// Mock the dapp-kit hook so we can control wallet state per test.
const mockUseCurrentAccount = vi.fn();
vi.mock('@mysten/dapp-kit', () => ({
  useCurrentAccount: () => mockUseCurrentAccount(),
  useSuiClient: () => ({}),
}));

// Mock the bucket hook so we can drive the panel through its three states.
const mockUseBucketState = vi.fn();
vi.mock('@/hooks/useBucketState', () => ({
  useBucketState: () => mockUseBucketState(),
}));

import { BucketGauge } from '@/components/panels/BucketGauge';

describe('<BucketGauge>', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders wallet-disconnected empty state (UI-SPEC verbatim copy)', () => {
    mockUseCurrentAccount.mockReturnValue(null);
    mockUseBucketState.mockReturnValue({ view: null, loading: false, error: null });
    render(<BucketGauge />);
    expect(
      screen.getByText('Connect wallet to view your withdrawal budget'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Each user has an independent token bucket that refills at 1\.2 DUSDC per ms\./,
      ),
    ).toBeInTheDocument();
    // The chart container must NOT render when wallet is disconnected.
    expect(screen.queryByTestId('bucket-chart')).not.toBeInTheDocument();
  });

  it('renders lazy-init pending state when wallet connected but no bucket data yet', () => {
    mockUseCurrentAccount.mockReturnValue({ address: '0xUSER' });
    mockUseBucketState.mockReturnValue({ view: null, loading: false, error: null });
    render(<BucketGauge />);
    expect(
      screen.getByText(/Bucket lazy-init pending/i),
    ).toBeInTheDocument();
    // The chart container must NOT render — wait until first redemption seeds the bucket.
    expect(screen.queryByTestId('bucket-chart')).not.toBeInTheDocument();
  });

  it('renders populated state with bucket-chart testid + formatted DUSDC numerics', () => {
    mockUseCurrentAccount.mockReturnValue({ address: '0xUSER' });
    mockUseBucketState.mockReturnValue({
      view: {
        availableMicro: 70_000_000n,
        capacityMicro: 100_000_000n,
        refillRatePerMs: 1200n,
        utilizationPct: 70,
      },
      loading: false,
      error: null,
    });
    render(<BucketGauge />);
    // Chart container is mounted.
    expect(screen.getByTestId('bucket-chart')).toBeInTheDocument();
    // available is 70.000000 DUSDC formatted via formatDusdc.
    expect(screen.getByText(/70\.00/)).toBeInTheDocument();
    // capacity is 100.000000 DUSDC.
    expect(screen.getByText(/100\.00/)).toBeInTheDocument();
  });

  it('source declares emerald/amber/rose color escalation (UI-SPEC §Recharts palette)', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const file = resolve(process.cwd(), 'src/components/panels/BucketGauge.tsx');
    const text = readFileSync(file, 'utf8');
    expect(text).toMatch(/#10b981/); // emerald-500 (full)
    expect(text).toMatch(/#f59e0b/); // amber-500 (<30%)
    expect(text).toMatch(/#e11d48/); // rose-600 (empty)
  });

  it('imports useCurrentAccount from @mysten/dapp-kit (link contract)', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const file = resolve(process.cwd(), 'src/components/panels/BucketGauge.tsx');
    const text = readFileSync(file, 'utf8');
    expect(text).toMatch(/useCurrentAccount/);
    expect(text).toMatch(/from\s+['"]@mysten\/dapp-kit['"]/);
  });
});
