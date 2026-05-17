// dashboard/src/components/__tests__/BucketGauge.test.tsx — Plan 04.1-04 Task 1.
//
// Validates the Phase 04.1 reskin (UI-SPEC Per-Panel Mapping #2):
//   - wallet-disconnected empty state
//   - wallet-connected + no bucket data: "Bucket lazy-init pending" body
//   - wallet-connected + populated bucket: §Withdrawals db-card with the
//     bucket-num/bucket-bar layout + formatted DUSDC numerics
//   - source-grep: mint/coral CHART_COLORS escalation, no Phase-4 hex
//
// Test contract updated for the reskin (Rule 1): the Phase-4 assertions
// checked the replaced RadialBarChart + the #10b981/#f59e0b/#e11d48 hex
// escalation that the reskin removes (the bucket fill is now mint/coral via
// CHART_COLORS). The behavioral branches (3 wallet states + DUSDC numerics)
// are unchanged.
//
// We mock `@mysten/dapp-kit` `useCurrentAccount` and `@/hooks/useBucketState`
// rather than wrap with the full provider stack — keeps the test focused on
// the panel's render branches.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

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

  it('renders wallet-disconnected empty state', () => {
    mockUseCurrentAccount.mockReturnValue(null);
    mockUseBucketState.mockReturnValue({ view: null, loading: false, error: null });
    render(<BucketGauge />);
    expect(
      screen.getByText(/Connect a wallet to view your withdrawal budget/i),
    ).toBeInTheDocument();
    // The bucket layout must NOT render when wallet is disconnected.
    expect(screen.queryByTestId('bucket-chart')).not.toBeInTheDocument();
  });

  it('renders lazy-init pending state when wallet connected but no bucket data yet', () => {
    mockUseCurrentAccount.mockReturnValue({ address: '0xUSER' });
    mockUseBucketState.mockReturnValue({ view: null, loading: false, error: null });
    render(<BucketGauge />);
    expect(screen.getByText(/Bucket lazy-init pending/i)).toBeInTheDocument();
    // The bucket layout must NOT render — wait until first redemption seeds it.
    expect(screen.queryByTestId('bucket-chart')).not.toBeInTheDocument();
  });

  it('renders the §Withdrawals bucket layout with bucket-num + formatted DUSDC numerics', () => {
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
    // Bucket layout is mounted.
    expect(screen.getByTestId('bucket-chart')).toBeInTheDocument();
    // §Withdrawals db-card header.
    expect(screen.getByText('Token bucket')).toBeInTheDocument();
    expect(screen.getByText('§ Withdrawals')).toBeInTheDocument();
    // bucket-num shows the available % of NAV.
    expect(screen.getByText('70.0')).toBeInTheDocument();
    // footer carries queue · 0 (UI-SPEC empty-state copy).
    expect(screen.getByText('queue · 0')).toBeInTheDocument();
    // available 70.000000 / capacity 100.000000 DUSDC formatted via formatDusdc.
    expect(screen.getByText(/70\.00 \/ 100\.00 DUSDC/)).toBeInTheDocument();
  });

  it('source declares mint/coral CHART_COLORS escalation, no Phase-4 hex', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const file = resolve(process.cwd(), 'src/components/panels/BucketGauge.tsx');
    const text = readFileSync(file, 'utf8');
    // Mint/coral escalation via CHART_COLORS — no Phase-4 hardcoded hex.
    expect(text).toMatch(/CHART_COLORS/);
    expect(text).not.toMatch(/#10b981/);
    expect(text).not.toMatch(/#f59e0b/);
    expect(text).not.toMatch(/#e11d48/);
    // §Withdrawals db-card chrome + 44px bucket-num layout class.
    expect(text).toMatch(/bucket-num/);
  });

  it('imports useCurrentAccount from @mysten/dapp-kit (link contract)', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const file = resolve(process.cwd(), 'src/components/panels/BucketGauge.tsx');
    const text = readFileSync(file, 'utf8');
    expect(text).toMatch(/useCurrentAccount/);
    expect(text).toMatch(/from\s+['"]@mysten\/dapp-kit['"]/);
    // useBucketState data hook is preserved.
    expect(text).toMatch(/useBucketState/);
  });
});
