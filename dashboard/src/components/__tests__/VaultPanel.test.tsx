// dashboard/src/components/__tests__/VaultPanel.test.tsx — Plan 04-05 Task 1;
// the `<VaultPanel>` card block rewritten in Plan 04.1-03 Task 3.
//
// Validates UI-SPEC §Component Inventory VaultPanel + DASH-06:
//   - useVaultState computes navPerShareScaled and utilizationBps via BigInt math
//     (no Number coercion at the math layer; Pitfall 8 mitigation)
//   - VaultPanel is a PURE DATA FEEDER (Plan 04.1-03 Task 3 / UI-SPEC #7):
//     it renders no card; it re-exports the `useVaultState`/`VaultView` data
//     path and exposes the `vaultStats` selector the headline `dh-stats` strip
//     consumes. The Phase-4 card UI (shadcn Card + Recharts RadialBarChart)
//     was removed because App.tsx mounts the headline strip, not a vault card.
//
// The `useVaultState` BigInt-math tests are unchanged — the hook itself is
// untouched by the reskin.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

import {
  useVaultState as useVaultStateReExport,
  vaultStats,
  type VaultView,
} from '@/components/panels/VaultPanel';
import { useVaultState } from '@/hooks/useVaultState';
import type { FullSnapshot } from '@/lib/types';

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

describe('VaultPanel (pure data feeder — Plan 04.1-03 Task 3)', () => {
  it('re-exports the useVaultState data path', () => {
    // The headline strip + DepositWithdrawPanel import the vault data path
    // through this module; the re-export must be the same hook.
    expect(useVaultStateReExport).toBe(useVaultState);
  });

  it('vaultStats returns null for a null view', () => {
    expect(vaultStats(null)).toBeNull();
  });

  it('vaultStats projects a VaultView into display-ready figures', () => {
    const now = Date.now();
    const view: VaultView = {
      vault: {
        vault_id: '0xVAULT',
        balance: '200000000',
        total_assets: '1000000000', // 1000 DUSDC at 6 decimals
        total_shares: '500000000',
        paused: false,
        last_updated_ms: String(now - 5_000),
      },
      navPerShareScaled: 2n * NAV_SCALE, // 2.00
      utilizationBps: 8000n, // 80.00%
      lastUpdatedMs: now - 5_000,
    };
    const stats = vaultStats(view);
    expect(stats).not.toBeNull();
    expect(stats!.navDusdc).toBe(1000); // 1_000_000_000 / 1e6
    expect(stats!.utilizationPct).toBe(80); // 8000 bps / 100
    expect(stats!.navPerShare).toBe(2); // 2 * NAV_SCALE / 1e9
    expect(stats!.paused).toBe(false);
  });

  it('vaultStats surfaces the paused flag (D-10)', () => {
    const now = Date.now();
    const view: VaultView = {
      vault: {
        vault_id: '0xVAULT',
        balance: '0',
        total_assets: '10000000',
        total_shares: '1000000',
        paused: true,
        last_updated_ms: String(now),
      },
      navPerShareScaled: NAV_SCALE,
      utilizationBps: 0n,
      lastUpdatedMs: now,
    };
    expect(vaultStats(view)!.paused).toBe(true);
  });

  it('renders no standalone card — no Card / RadialBarChart / chart hex (grep gate)', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const file = resolve(process.cwd(), 'src/components/panels/VaultPanel.tsx');
    const text = readFileSync(file, 'utf8');
    expect(text).not.toMatch(/RadialBarChart/);
    expect(text).not.toMatch(/<Card/);
    expect(text).not.toMatch(/#06b6d4|#10b981|#94a3b8/);
    // the data path is preserved + importable
    expect(text).toMatch(/useVaultState/);
    expect(text).toMatch(/VaultView/);
  });
});
