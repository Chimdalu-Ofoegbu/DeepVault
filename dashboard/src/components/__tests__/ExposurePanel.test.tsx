// dashboard/src/components/__tests__/ExposurePanel.test.tsx — Plan 04-05 Task 3.
//
// Validates UI-SPEC §Component Inventory ExposurePanel + DASH-08:
//   - useExposure derives open hedges from snapshot.ring_buffer events
//   - HedgeMinted adds an entry; HedgeRolled removes old_key + adds new_key;
//     HedgeUnwound removes by oracle_id (vault.move event surface — NOT
//     market_key; the Move struct emits `{ vault_id, oracle_id, payout_quote }`)
//   - Expired hedges filtered out (expiry < now)
//   - Empty state: "No hedges currently open" verbatim per UI-SPEC
//   - Populated: BarChart + Table rendered with formatted DUSDC numerics
//
// Wire-format / event-name correctness (Rule 1 fix vs plan body):
//   indexer/src/pollVaultEvents.ts:36-38 strips qualified type to the LAST
//   segment only — `e.name` arrives at the dashboard as `HedgeMinted`,
//   `HedgeRolled`, `HedgeUnwound`, NOT `::rebalance::HedgeMinted` etc.
//   useExposure matches on the bare suffix.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, renderHook } from '@testing-library/react';

import { ExposurePanel } from '@/components/panels/ExposurePanel';
import { useExposure } from '@/hooks/useExposure';
import type { FullSnapshot, RingEvent } from '@/lib/types';

// ResizeObserver shim (Recharts ResponsiveContainer reaches for it in jsdom).
class ResizeObserverPolyfill {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: typeof ResizeObserverPolyfill }).ResizeObserver =
  (globalThis as unknown as { ResizeObserver: typeof ResizeObserverPolyfill }).ResizeObserver ??
  ResizeObserverPolyfill;

function makeSnapshot(ringEvents: RingEvent[]): FullSnapshot {
  return {
    oracles: [],
    vault: {
      vault_id: '0xVAULT',
      balance: '500000000',
      total_assets: '1000000000',
      total_shares: '500000000',
      paused: false,
      last_updated_ms: String(Date.now()),
    },
    ring_buffer: ringEvents,
    served_at_ms: '0',
  };
}

// Helper to make a fake HedgeMinted event matching the indexer's emit shape.
// Indexer strips qualified type to suffix-only; data matches rebalance.move:58-65.
function hedgeMinted(
  strike: string,
  expiry_ms: number,
  oracle_id = '0xORACLE_BTC',
  is_down = true,
  cost_basis_quote = '10000000',
  quantity = '1000000000',
): RingEvent {
  return {
    name: 'HedgeMinted',
    ts_ms: String(Date.now()),
    data: {
      vault_id: '0xVAULT',
      market_key: {
        oracle_id,
        strike,
        expiry_ms: String(expiry_ms),
        is_down,
      },
      quantity,
      cost_basis_quote,
      strike,
      expiry_ms: String(expiry_ms),
    },
  };
}

function hedgeRolled(
  oldKey: { oracle_id: string; strike: string; expiry_ms: number; is_down: boolean },
  newKey: { oracle_id: string; strike: string; expiry_ms: number; is_down: boolean },
): RingEvent {
  return {
    name: 'HedgeRolled',
    ts_ms: String(Date.now()),
    data: {
      vault_id: '0xVAULT',
      old_key: {
        oracle_id: oldKey.oracle_id,
        strike: oldKey.strike,
        expiry_ms: String(oldKey.expiry_ms),
        is_down: oldKey.is_down,
      },
      new_key: {
        oracle_id: newKey.oracle_id,
        strike: newKey.strike,
        expiry_ms: String(newKey.expiry_ms),
        is_down: newKey.is_down,
      },
    },
  };
}

function hedgeUnwound(oracle_id: string): RingEvent {
  return {
    name: 'HedgeUnwound',
    ts_ms: String(Date.now()),
    data: {
      vault_id: '0xVAULT',
      oracle_id,
      payout_quote: '5000000',
    },
  };
}

describe('useExposure', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse('2026-05-12T12:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns empty array when snapshot is null', () => {
    const { result } = renderHook(() => useExposure(null));
    expect(result.current).toEqual([]);
  });

  it('returns empty array when ring_buffer is empty', () => {
    const { result } = renderHook(() => useExposure(makeSnapshot([])));
    expect(result.current).toEqual([]);
  });

  it('adds a hedge entry on HedgeMinted event with future expiry', () => {
    const future = Date.now() + 14 * 24 * 60 * 60 * 1000; // 14 days from now
    const { result } = renderHook(() =>
      useExposure(makeSnapshot([hedgeMinted('85000000000000', future)])),
    );
    expect(result.current).toHaveLength(1);
    expect(result.current[0].oracleId).toBe('0xORACLE_BTC');
    expect(result.current[0].expiryMs).toBe(future);
    expect(result.current[0].notionalQuote).toBe(10_000_000n);
  });

  it('filters out hedges whose expiry has already passed', () => {
    const past = Date.now() - 1000;
    const { result } = renderHook(() =>
      useExposure(makeSnapshot([hedgeMinted('85000000000000', past)])),
    );
    expect(result.current).toEqual([]);
  });

  it('HedgeRolled removes the old key and adds the new key', () => {
    const future1 = Date.now() + 14 * 24 * 60 * 60 * 1000;
    const future2 = Date.now() + 28 * 24 * 60 * 60 * 1000;
    const events = [
      hedgeMinted('85000000000000', future1, '0xORACLE_BTC', true),
      hedgeRolled(
        { oracle_id: '0xORACLE_BTC', strike: '85000000000000', expiry_ms: future1, is_down: true },
        { oracle_id: '0xORACLE_BTC', strike: '90000000000000', expiry_ms: future2, is_down: true },
      ),
    ];
    const { result } = renderHook(() => useExposure(makeSnapshot(events)));
    // HedgeRolled has only old_key/new_key; it doesn't carry full mint data
    // (no quantity/cost_basis_quote). useExposure preserves the new_key entry
    // but the notional defaults to 0 because the data isn't in the event.
    expect(result.current).toHaveLength(1);
    expect(result.current[0].strike).toBe(90_000_000_000_000n);
    expect(result.current[0].expiryMs).toBe(future2);
  });

  it('HedgeUnwound removes the hedge keyed on its oracle_id', () => {
    const future = Date.now() + 14 * 24 * 60 * 60 * 1000;
    const events = [
      hedgeMinted('85000000000000', future, '0xORACLE_BTC'),
      hedgeUnwound('0xORACLE_BTC'),
    ];
    const { result } = renderHook(() => useExposure(makeSnapshot(events)));
    expect(result.current).toEqual([]);
  });

  it('sorts open hedges by expiry ascending', () => {
    const e1 = Date.now() + 14 * 24 * 60 * 60 * 1000;
    const e2 = Date.now() + 7 * 24 * 60 * 60 * 1000;
    const events = [
      hedgeMinted('85000000000000', e1, '0xORACLE_A'),
      hedgeMinted('90000000000000', e2, '0xORACLE_B'),
    ];
    const { result } = renderHook(() => useExposure(makeSnapshot(events)));
    expect(result.current).toHaveLength(2);
    expect(result.current[0].expiryMs).toBeLessThan(result.current[1].expiryMs);
  });
});

describe('<ExposurePanel>', () => {
  // Phase 04.1 reskin (UI-SPEC #3, LD-2): the Phase-4 Recharts BarChart +
  // shadcn Table is replaced by the handoff `§ Per-oracle` `oracles` CSS
  // bar-list. BTC-only — no ETH/SOL/SUI rows. Test contract updated (Rule 1):
  // the old assertions checked the removed `exposure-chart` Recharts container
  // and the `#94a3b8` slate bar hex that the reskin drops.
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse('2026-05-12T12:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the BTC-only empty-state copy verbatim when hedges is empty', () => {
    render(<ExposurePanel hedges={[]} vault={null} />);
    // UI-SPEC Copywriting verbatim empty-state row for Per-oracle exposure.
    expect(
      screen.getByText(
        'BTC oracle · 0% exposure — no hedge legs open yet.',
      ),
    ).toBeInTheDocument();
    // The §Per-oracle header still renders.
    expect(screen.getByText('§ Per-oracle')).toBeInTheDocument();
  });

  it('renders a single BTC oracles bar-list row when hedges are present', () => {
    const future = Date.now() + 14 * 24 * 60 * 60 * 1000;
    const hedges = [
      {
        marketKey: '0xORACLE_BTC|85000000000000|' + future + '|true',
        oracleId: '0xORACLE_BTC',
        strike: 85_000_000_000_000n,
        strikeDisplay: '85000.00',
        expiryMs: future,
        expiryDisplay: '2026-05-26 12:00',
        direction: 'down',
        notionalQuote: 10_000_000n,
        premiumQuote: 0n,
      },
    ];
    render(<ExposurePanel hedges={hedges} vault={null} />);
    expect(screen.getByTestId('exposure-list')).toBeInTheDocument();
    expect(screen.getByText('BTC oracle')).toBeInTheDocument();
    // BTC holds 100% of exposure (it is the only oracle — LD-2).
    expect(screen.getByText('100.0%')).toBeInTheDocument();
  });

  it('renders only a BTC row — no ETH/SOL/SUI rows (LD-2)', () => {
    const future = Date.now() + 14 * 24 * 60 * 60 * 1000;
    const hedges = [
      {
        marketKey: '0xORACLE_BTC|85000000000000|' + future + '|true',
        oracleId: '0xORACLE_BTC',
        strike: 85_000_000_000_000n,
        strikeDisplay: '85000.00',
        expiryMs: future,
        expiryDisplay: '2026-05-26 12:00',
        direction: 'down',
        notionalQuote: 10_000_000n,
        premiumQuote: 0n,
      },
    ];
    render(<ExposurePanel hedges={hedges} vault={null} />);
    expect(screen.queryByText(/ETH/)).not.toBeInTheDocument();
    expect(screen.queryByText(/SOL/)).not.toBeInTheDocument();
    expect(screen.queryByText(/SUI/)).not.toBeInTheDocument();
  });

  it('source-grep: useExposure matches HedgeMinted via suffix endsWith (relay strips qualified type)', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const file = resolve(process.cwd(), 'src/hooks/useExposure.ts');
    const text = readFileSync(file, 'utf8');
    // The relay strips qualified type to suffix-only; useExposure matches on
    // the bare suffix (rebalance is implied) — endsWith('HedgeMinted') etc.
    expect(text).toMatch(/endsWith\(['"]HedgeMinted['"]\)/);
    expect(text).toMatch(/endsWith\(['"]HedgeRolled['"]\)/);
    expect(text).toMatch(/endsWith\(['"]HedgeUnwound['"]\)/);
  });

  it('source-grep: ExposurePanel uses the oracles bar-list and keeps useExposure (no hardcoded hex, BTC-only)', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const file = resolve(process.cwd(), 'src/components/panels/ExposurePanel.tsx');
    const text = readFileSync(file, 'utf8');
    // Reskinned to the handoff `oracles` bar-list — no Recharts hex.
    expect(text).toMatch(/oracles/);
    expect(text).not.toMatch(/#94a3b8/);
    expect(text).not.toMatch(/#10b981/);
    expect(text).not.toMatch(/#e11d48/);
    // BTC-only (LD-2) — no ETH/SOL/SUI literals.
    expect(text).not.toMatch(/ETH|SOL|SUI/);
  });
});
