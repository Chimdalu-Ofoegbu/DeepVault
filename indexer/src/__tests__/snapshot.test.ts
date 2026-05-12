// snapshot.test.ts — ring buffer invariants + pub-sub semantics.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  Snapshot,
  RING_MAX_COUNT,
  RING_MAX_AGE_MS,
  type ParsedOracleSvi,
} from '../snapshot';

function mkOracleEvent(
  oracle_id: string,
  ts_ms: string,
  overrides: Partial<ParsedOracleSvi> = {},
): ParsedOracleSvi {
  return {
    oracle_id,
    a: '1500000000',
    b: '200000000',
    rho_signed: '-300000000',
    m_signed: '100000000',
    sigma: '400000000',
    timestamp_ms: ts_ms,
    ...overrides,
  };
}

/**
 * Recent (within RING_MAX_AGE_MS) timestamp string anchored to wall-clock.
 * Snapshot's ring buffer evicts entries older than `Date.now() - 1h`, so
 * test fixtures must use realistic timestamps unless the test is specifically
 * exercising age-based eviction (with vi.setSystemTime).
 */
function recentTs(offsetMs = 0): string {
  return String(Date.now() + offsetMs);
}

beforeEach(() => {
  vi.useRealTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Snapshot.applyOracleEvent', () => {
  it('stores per-oracle latest event (newest wins for the same oracle_id)', () => {
    const s = new Snapshot();
    s.applyOracleEvent(mkOracleEvent('0xBTC', '1000'), 1000n);
    s.applyOracleEvent(mkOracleEvent('0xBTC', '2000', { a: '99' }), 2000n);
    const snap = s.fullSnapshot();
    expect(snap.oracles).toHaveLength(1);
    expect(snap.oracles[0]!.a).toBe('99');
    expect(snap.oracles[0]!.timestamp_ms).toBe('2000');
  });

  it('tracks multiple oracles independently', () => {
    const s = new Snapshot();
    s.applyOracleEvent(mkOracleEvent('0xBTC', '1000'), 1000n);
    s.applyOracleEvent(mkOracleEvent('0xETH', '2000', { a: '7' }), 2000n);
    const snap = s.fullSnapshot();
    expect(snap.oracles).toHaveLength(2);
    const btc = snap.oracles.find((o) => o.oracle_id === '0xBTC')!;
    const eth = snap.oracles.find((o) => o.oracle_id === '0xETH')!;
    expect(btc.a).toBe('1500000000');
    expect(eth.a).toBe('7');
  });

  it('emits the signed-string i64 fields verbatim (no re-decode)', () => {
    const s = new Snapshot();
    s.applyOracleEvent(
      mkOracleEvent('0xBTC', '1000', { rho_signed: '-987654321' }),
      1000n,
    );
    const snap = s.fullSnapshot();
    expect(snap.oracles[0]!.rho_signed).toBe('-987654321');
  });
});

describe('Snapshot ring buffer', () => {
  it('caps at RING_MAX_COUNT (100) when ages stay within the 1h window', () => {
    const s = new Snapshot();
    const baseTs = Date.now();
    // 105 events with strictly-recent timestamps so age-based eviction does
    // NOT fire; only count-based eviction matters here.
    for (let i = 0; i < 105; i++) {
      s.applyOracleEvent(
        mkOracleEvent('oracle-' + i, String(baseTs - i)),
        BigInt(baseTs - i),
      );
    }
    const snap = s.fullSnapshot();
    expect(snap.ring_buffer).toHaveLength(RING_MAX_COUNT);
  });

  it('drops entries older than RING_MAX_AGE_MS even if count is under cap', () => {
    vi.useFakeTimers();
    const t0 = 5_000_000_000_000;
    vi.setSystemTime(t0);
    const s = new Snapshot();

    // First push at t0: fresh enough that cutoff (t0 - 1h) does NOT evict it.
    // ts_ms equals t0 — current wall-clock minus zero.
    s.applyOracleEvent(mkOracleEvent('first', String(t0)), BigInt(t0));
    expect(s.ringLength()).toBe(1);

    // Advance wall-clock to t0 + 1h + 1ms: the first event is now exactly
    // one ms older than the (now - 1h) cutoff. Any subsequent push triggers
    // pushRing's age-eviction loop and the first event must drop.
    const tFuture = t0 + RING_MAX_AGE_MS + 1;
    vi.setSystemTime(tFuture);
    s.applyOracleEvent(mkOracleEvent('fresh', String(tFuture)), BigInt(tFuture));

    const snap = s.fullSnapshot();
    expect(snap.ring_buffer).toHaveLength(1);
    expect(snap.ring_buffer[0]!.name).toBe('OracleSVIUpdated');
    expect(snap.ring_buffer[0]!.ts_ms).toBe(String(tFuture));
  });
});

describe('Snapshot.onEvent', () => {
  it('delivers emissions to all subscribers and returns an unsubscribe fn', () => {
    const s = new Snapshot();
    const seenA: string[] = [];
    const seenB: string[] = [];
    const offA = s.onEvent((e) => seenA.push(e.ts_ms));
    const offB = s.onEvent((e) => seenB.push(e.ts_ms));

    s.applyOracleEvent(mkOracleEvent('o', '1'), 1n);
    expect(seenA).toEqual(['1']);
    expect(seenB).toEqual(['1']);

    offA();
    s.applyOracleEvent(mkOracleEvent('o', '2'), 2n);
    expect(seenA).toEqual(['1']); // unchanged after unsubscribe
    expect(seenB).toEqual(['1', '2']);

    offB();
    expect(s.subscriberCount()).toBe(0);
  });

  it('isolates one bad subscriber from another (no thrown error poisons the loop)', () => {
    const s = new Snapshot();
    const seen: string[] = [];
    s.onEvent(() => {
      throw new Error('subscriber blew up');
    });
    s.onEvent((e) => seen.push(e.ts_ms));
    s.applyOracleEvent(mkOracleEvent('o', '1'), 1n);
    expect(seen).toEqual(['1']);
  });
});

describe('Snapshot.applyVaultEvent', () => {
  it('pushes to ring + emits to subscribers without polluting the oracle map', () => {
    const s = new Snapshot();
    const got: string[] = [];
    s.onEvent((e) => got.push(e.name));
    const ts = BigInt(recentTs());
    s.applyVaultEvent(
      'Supplied',
      {
        vault_id: '0xVAULT',
        depositor: '0xc0ffee',
        deposit_quote: '100000000',
        shares_minted: '99990001',
        hedge_alloc_quote: '10000000',
      },
      ts,
    );
    expect(got).toEqual(['Supplied']);
    const snap = s.fullSnapshot();
    expect(snap.oracles).toHaveLength(0);
    expect(snap.ring_buffer).toHaveLength(1);
    expect(snap.ring_buffer[0]!.name).toBe('Supplied');
    expect(snap.ring_buffer[0]!.data).toMatchObject({
      shares_minted: '99990001',
    });
  });
});

describe('Snapshot.setVaultState + fullSnapshot()', () => {
  it('returns the FullSnapshot with oracles + vault + ring + served_at_ms (u64 strings)', () => {
    const s = new Snapshot();
    s.setVaultState({
      vault_id: '0xVAULT',
      balance: '12345678',
      total_assets: '23456789',
      total_shares: '34567890',
      paused: false,
      last_updated_ms: recentTs(),
    });
    const ts = recentTs();
    s.applyOracleEvent(mkOracleEvent('0xBTC', ts), BigInt(ts));
    const snap = s.fullSnapshot();
    expect(snap.vault?.total_shares).toBe('34567890');
    expect(snap.oracles).toHaveLength(1);
    expect(snap.ring_buffer).toHaveLength(1);
    expect(typeof snap.served_at_ms).toBe('string');
    // u64-as-string regex assertion on the wire payload (Pitfall 8 guard).
    const wire = JSON.stringify(snap);
    expect(wire).toMatch(/"total_shares":"\d+"/);
    expect(wire).toMatch(/"balance":"\d+"/);
    expect(wire).toMatch(/"served_at_ms":"\d+"/);
  });

  it('returns vault=null until setVaultState is called', () => {
    const s = new Snapshot();
    expect(s.fullSnapshot().vault).toBeNull();
  });

  it('fullSnapshot.ring_buffer is a copy (mutating it does not corrupt the store)', () => {
    const s = new Snapshot();
    const ts = recentTs();
    s.applyOracleEvent(mkOracleEvent('o', ts), BigInt(ts));
    const snap = s.fullSnapshot();
    snap.ring_buffer.pop();
    expect(s.ringLength()).toBe(1);
  });
});
