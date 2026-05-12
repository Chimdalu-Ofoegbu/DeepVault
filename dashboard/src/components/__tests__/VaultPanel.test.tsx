// dashboard/src/components/__tests__/VaultPanel.test.tsx — Plan 04-05 Task 1.
//
// Validates UI-SPEC §Component Inventory VaultPanel + DASH-06:
//   - useVaultState computes navPerShareScaled and utilizationBps via BigInt math
//     (no Number coercion at the math layer; Pitfall 8 mitigation)
//   - VaultPanel renders empty state ("Vault is initializing") when view is null
//   - VaultPanel renders three stat blocks (NAV / total assets / total shares)
//     using formatNav/formatDusdc/formatShares via NumericValue
//   - utilization radial chart container is mounted; chart fill is cyan-500
//   - paused banner appears when vault.paused === true
//
// Recharts in jsdom: ResponsiveContainer cannot resolve a width, so we test on
// (a) data-testid presence, (b) source-level grep for the locked colors, and
// (c) DOM text assertions for the labels + formatted numerics.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, renderHook } from '@testing-library/react';

import { VaultPanel } from '@/components/panels/VaultPanel';
import { useVaultState } from '@/hooks/useVaultState';
import type { FullSnapshot } from '@/lib/types';

// ResizeObserver shim (Recharts ResponsiveContainer reaches for it in jsdom).
class ResizeObserverPolyfill {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: typeof ResizeObserverPolyfill }).ResizeObserver =
  (globalThis as unknown as { ResizeObserver: typeof ResizeObserverPolyfill }).ResizeObserver ??
  ResizeObserverPolyfill;

const NAV_SCALE = 1_000_000_000n;

function makeSnapshot(vault: NonNullable<FullSnapshot['vault']> | null): FullSnapshot {
  return {
    oracles: [],
    vault,
    ring_buffer: [],
    served_at_ms: '0',
  };
}

describe('useVaultState (BigInt math)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse('2026-05-12T12:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null when snapshot has no vault', () => {
    const { result } = renderHook(() => useVaultState(makeSnapshot(null)));
    expect(result.current).toBeNull();
  });

  it('returns null when snapshot itself is null', () => {
    const { result } = renderHook(() => useVaultState(null));
    expect(result.current).toBeNull();
  });

  it('computes navPerShareScaled = total_assets * NAV_SCALE / total_shares', () => {
    // total_assets=2_000_000_000n, total_shares=1_000_000_000n
    // expected: navPerShareScaled = (2e9 * 1e9) / 1e9 = 2 * NAV_SCALE
    const { result } = renderHook(() =>
      useVaultState(
        makeSnapshot({
          vault_id: '0xVAULT',
          balance: '500000000',
          total_assets: '2000000000',
          total_shares: '1000000000',
          paused: false,
          last_updated_ms: String(Date.now()),
        }),
      ),
    );
    expect(result.current).not.toBeNull();
    expect(result.current!.navPerShareScaled).toBe(2n * NAV_SCALE);
  });

  it('returns NAV_SCALE (1.0 convention) when total_shares === 0n', () => {
    const { result } = renderHook(() =>
      useVaultState(
        makeSnapshot({
          vault_id: '0xVAULT',
          balance: '0',
          total_assets: '0',
          total_shares: '0',
          paused: false,
          last_updated_ms: String(Date.now()),
        }),
      ),
    );
    expect(result.current).not.toBeNull();
    expect(result.current!.navPerShareScaled).toBe(NAV_SCALE);
  });

  it('computes utilizationBps = (total_assets - balance) * 10000 / total_assets', () => {
    // balance=200_000_000n, total_assets=1_000_000_000n
    // deployed = total_assets - balance = 800_000_000n
    // utilization = deployed * 10000 / total_assets = 8000n bps
    const { result } = renderHook(() =>
      useVaultState(
        makeSnapshot({
          vault_id: '0xVAULT',
          balance: '200000000',
          total_assets: '1000000000',
          total_shares: '500000000',
          paused: false,
          last_updated_ms: String(Date.now()),
        }),
      ),
    );
    expect(result.current).not.toBeNull();
    expect(result.current!.utilizationBps).toBe(8000n);
  });

  it('utilizationBps is 0n when total_assets === 0n', () => {
    const { result } = renderHook(() =>
      useVaultState(
        makeSnapshot({
          vault_id: '0xVAULT',
          balance: '0',
          total_assets: '0',
          total_shares: '0',
          paused: false,
          last_updated_ms: String(Date.now()),
        }),
      ),
    );
    expect(result.current).not.toBeNull();
    expect(result.current!.utilizationBps).toBe(0n);
  });

  it('preserves u64 precision beyond 2^53 in navPerShareScaled (T-04-05-02 mitigation)', () => {
    // total_shares ~ 2^54; total_assets = 2 * total_shares.
    // Expected: navPerShareScaled = 2 * NAV_SCALE exactly (no float drift).
    const big = (1n << 54n);
    const { result } = renderHook(() =>
      useVaultState(
        makeSnapshot({
          vault_id: '0xVAULT',
          balance: '0',
          total_assets: (2n * big).toString(),
          total_shares: big.toString(),
          paused: false,
          last_updated_ms: String(Date.now()),
        }),
      ),
    );
    expect(result.current).not.toBeNull();
    expect(result.current!.navPerShareScaled).toBe(2n * NAV_SCALE);
  });
});

describe('<VaultPanel>', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse('2026-05-12T12:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders empty state when view is null', () => {
    render(<VaultPanel view={null} />);
    expect(screen.getByText('Vault is initializing')).toBeInTheDocument();
    expect(
      screen.getByText(/Once the deployer seeds 10 DUSDC into the vault/i),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('utilization-chart')).not.toBeInTheDocument();
  });

  it('renders populated state with NAV / total assets / total shares / utilization', () => {
    const now = Date.now();
    const view = {
      vault: {
        vault_id: '0xVAULT',
        balance: '200000000',
        total_assets: '1000000000',
        total_shares: '500000000',
        paused: false,
        last_updated_ms: String(now - 5_000),
      },
      navPerShareScaled: 2n * NAV_SCALE, // 2.00
      utilizationBps: 8000n, // 80.00%
      lastUpdatedMs: now - 5_000,
    };
    render(<VaultPanel view={view} />);
    expect(screen.getByText('NAV per share')).toBeInTheDocument();
    expect(screen.getByText('Total assets (DUSDC)')).toBeInTheDocument();
    expect(screen.getByText('Total shares')).toBeInTheDocument();
    expect(screen.getByText('Utilization')).toBeInTheDocument();
    expect(screen.getByTestId('utilization-chart')).toBeInTheDocument();
    // utilization 80.0% percentage label
    expect(screen.getByText(/80\.0%/)).toBeInTheDocument();
    // 8000 bps numeric
    expect(screen.getByText(/8000 bps/i)).toBeInTheDocument();
    // paused banner is NOT in the document when paused=false
    expect(screen.queryByTestId('paused-banner')).not.toBeInTheDocument();
  });

  it('renders PAUSED banner when vault.paused === true', () => {
    const now = Date.now();
    const view = {
      vault: {
        vault_id: '0xVAULT',
        balance: '200000000',
        total_assets: '1000000000',
        total_shares: '500000000',
        paused: true,
        last_updated_ms: String(now - 5_000),
      },
      navPerShareScaled: 2n * NAV_SCALE,
      utilizationBps: 8000n,
      lastUpdatedMs: now - 5_000,
    };
    render(<VaultPanel view={view} />);
    expect(screen.getByTestId('paused-banner')).toBeInTheDocument();
    expect(screen.getByTestId('paused-banner').textContent).toMatch(/PAUSED/);
  });

  it('routes all numeric rendering through format.ts helpers (grep gate)', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const file = resolve(process.cwd(), 'src/components/panels/VaultPanel.tsx');
    const text = readFileSync(file, 'utf8');
    expect(text).toMatch(/formatNav/);
    expect(text).toMatch(/formatDusdc/);
    expect(text).toMatch(/formatShares/);
    expect(text).toMatch(/formatBps/);
  });

  it('mounts a Recharts RadialBarChart with cyan-500 active fill (UI-SPEC color contract)', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const file = resolve(process.cwd(), 'src/components/panels/VaultPanel.tsx');
    const text = readFileSync(file, 'utf8');
    expect(text).toMatch(/RadialBarChart/);
    expect(text).toMatch(/#06b6d4/); // cyan-500 (UI-SPEC §Recharts palette utilization active band)
  });
});
