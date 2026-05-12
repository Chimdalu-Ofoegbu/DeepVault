// dashboard/src/hooks/__tests__/usePositions.test.tsx — Plan 04-07 Task 2.
//
// Validates the zero-vs-unknown PnL contract:
//   - Position[] derived from Supplied events filtered by depositor === wallet
//   - hedgeCost from HedgeMinted within 60s window
//   - hedgePayoff from HedgeUnwound matched by (oracle_id) — null when no
//     matching unwind yet (NEVER 0n for unavailable; 0n is a real OTM payout)
//   - plpYield from RedeemFulfilled NAV delta — null when no RedeemFulfilled
//     yet (NEVER 0n for unavailable)
//   - netQuote null when either leg null; only computed when both legs realized

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const mockUseCurrentAccount = vi.fn();
vi.mock('@mysten/dapp-kit', () => ({
  useCurrentAccount: () => mockUseCurrentAccount(),
}));

import { usePositions } from '@/hooks/usePositions';
import type { FullSnapshot, RingEvent } from '@/lib/types';

const USER = '0xUSER';
const OTHER = '0xOTHER';
const ORACLE = '0xORACLE_BTC';

function suppliedEvent(
  depositor: string,
  depositQuote: string,
  sharesMinted: string,
  tsMs: number,
): RingEvent {
  return {
    name: 'Supplied',
    ts_ms: String(tsMs),
    data: {
      vault_id: '0xVAULT',
      depositor,
      deposit_quote: depositQuote,
      shares_minted: sharesMinted,
      hedge_alloc_quote: '0',
    },
  };
}

function hedgeMintedEvent(
  oracleId: string,
  strike: string,
  expiryMs: number,
  costBasis: string,
  tsMs: number,
): RingEvent {
  return {
    name: 'HedgeMinted',
    ts_ms: String(tsMs),
    data: {
      vault_id: '0xVAULT',
      market_key: {
        oracle_id: oracleId,
        strike,
        expiry_ms: String(expiryMs),
        is_down: true,
      },
      quantity: '1000000000',
      cost_basis_quote: costBasis,
      strike,
      expiry_ms: String(expiryMs),
    },
  };
}

function hedgeUnwoundEvent(oracleId: string, payoutQuote: string, tsMs: number): RingEvent {
  return {
    name: 'HedgeUnwound',
    ts_ms: String(tsMs),
    data: {
      vault_id: '0xVAULT',
      oracle_id: oracleId,
      payout_quote: payoutQuote,
    },
  };
}

function redeemFulfilledEvent(
  user: string,
  quotePaid: string,
  sharesBurned: string,
  tsMs: number,
): RingEvent {
  return {
    name: 'RedeemFulfilled',
    ts_ms: String(tsMs),
    data: {
      vault_id: '0xVAULT',
      user,
      shares_burned: sharesBurned,
      quote_paid: quotePaid,
      remainder_shares: '0',
    },
  };
}

function makeSnapshot(ring: RingEvent[]): FullSnapshot {
  return {
    oracles: [],
    vault: null,
    ring_buffer: ring,
    served_at_ms: '0',
  };
}

describe('usePositions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseCurrentAccount.mockReturnValue({ address: USER });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns [] when snapshot is null', () => {
    const { result } = renderHook(() => usePositions(null));
    expect(result.current).toEqual([]);
  });

  it('returns [] when wallet is not connected', () => {
    mockUseCurrentAccount.mockReturnValue(null);
    const { result } = renderHook(() => usePositions(makeSnapshot([])));
    expect(result.current).toEqual([]);
  });

  it('filters Supplied events by depositor address (only USER positions)', () => {
    const snap = makeSnapshot([
      suppliedEvent(USER, '10000000', '5000000', 1000),
      suppliedEvent(OTHER, '20000000', '10000000', 2000),
    ]);
    const { result } = renderHook(() => usePositions(snap));
    expect(result.current).toHaveLength(1);
    expect(result.current[0].depositQuote).toBe(10_000_000n);
  });

  it('sets plpYield: null AND netQuote: null when no RedeemFulfilled for the position (zero-vs-unknown invariant)', () => {
    const snap = makeSnapshot([
      suppliedEvent(USER, '10000000', '5000000', 1000),
      hedgeMintedEvent(ORACLE, '85000000000000', 9_999_999_999_000, '1000000', 1010),
    ]);
    const { result } = renderHook(() => usePositions(snap));
    expect(result.current).toHaveLength(1);
    expect(result.current[0].plpYield).toBeNull();
    expect(result.current[0].netQuote).toBeNull();
    // hedgeCost was matched (HedgeMinted within 60s window)
    expect(result.current[0].hedgeCost).toBe(1_000_000n);
    // hedgePayoff remains null because no HedgeUnwound yet (NOT 0n!)
    expect(result.current[0].hedgePayoff).toBeNull();
  });

  it('matches HedgeUnwound to HedgeMinted by oracle_id and surfaces hedgePayoff', () => {
    const snap = makeSnapshot([
      suppliedEvent(USER, '10000000', '5000000', 1000),
      hedgeMintedEvent(ORACLE, '85000000000000', 9_999_999_999_000, '1000000', 1010),
      hedgeUnwoundEvent(ORACLE, '500000', 2000),
    ]);
    const { result } = renderHook(() => usePositions(snap));
    expect(result.current[0].hedgePayoff).toBe(500_000n);
  });

  it('distinguishes hedgePayoff=0n (OTM expiry) from hedgePayoff=null (unwound not yet observed)', () => {
    // Case A: unwound with 0 payout (OTM)
    const snapOtm = makeSnapshot([
      suppliedEvent(USER, '10000000', '5000000', 1000),
      hedgeMintedEvent(ORACLE, '85000000000000', 9_999_999_999_000, '1000000', 1010),
      hedgeUnwoundEvent(ORACLE, '0', 2000),
    ]);
    const otm = renderHook(() => usePositions(snapOtm));
    expect(otm.result.current[0].hedgePayoff).toBe(0n); // real value, not null
    // Case B: no unwind yet
    const snapPending = makeSnapshot([
      suppliedEvent(USER, '10000000', '5000000', 1000),
      hedgeMintedEvent(ORACLE, '85000000000000', 9_999_999_999_000, '1000000', 1010),
    ]);
    const pending = renderHook(() => usePositions(snapPending));
    expect(pending.result.current[0].hedgePayoff).toBeNull();
  });

  it('computes plpYield from RedeemFulfilled NAV delta (quote_paid - pro-rata depositQuote)', () => {
    const snap = makeSnapshot([
      suppliedEvent(USER, '10000000', '5000000', 1000),
      hedgeMintedEvent(ORACLE, '85000000000000', 9_999_999_999_000, '1000000', 1010),
      hedgeUnwoundEvent(ORACLE, '300000', 2000),
      // User redeems all 5_000_000 shares for 11_000_000 quote → yield = 1_000_000.
      redeemFulfilledEvent(USER, '11000000', '5000000', 3000),
    ]);
    const { result } = renderHook(() => usePositions(snap));
    expect(result.current[0].plpYield).toBe(1_000_000n);
    // net = plpYield + hedgePayoff - hedgeCost = 1_000_000 + 300_000 - 1_000_000
    expect(result.current[0].netQuote).toBe(300_000n);
  });

  it('netQuote remains null when only one leg is realized', () => {
    // hedge unwound but no redemption yet → netQuote null
    const snap = makeSnapshot([
      suppliedEvent(USER, '10000000', '5000000', 1000),
      hedgeMintedEvent(ORACLE, '85000000000000', 9_999_999_999_000, '1000000', 1010),
      hedgeUnwoundEvent(ORACLE, '300000', 2000),
    ]);
    const { result } = renderHook(() => usePositions(snap));
    expect(result.current[0].hedgePayoff).toBe(300_000n);
    expect(result.current[0].plpYield).toBeNull();
    expect(result.current[0].netQuote).toBeNull();
  });
});

describe('usePositions source contracts', () => {
  it('uses bigint | null for nullable fields (never 0n for unknown)', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const file = resolve(process.cwd(), 'src/hooks/usePositions.ts');
    const text = readFileSync(file, 'utf8');
    expect(text).toMatch(/bigint \| null/);
    expect(text).toMatch(/HedgeUnwound/);
    expect(text).toMatch(/findMatchingUnwind/);
    expect(text).toMatch(/findMatchingRedemption/);
    // Critical: no field defaults to 0n (the zero-vs-unknown invariant).
    expect(text).not.toMatch(/plpYield:\s*0n/);
    expect(text).not.toMatch(/hedgePayoff:\s*0n/);
  });
});
