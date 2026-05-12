// dashboard/src/hooks/useExposure.ts — Plan 04-05 Task 3 (DASH-08).
//
// Derives the open-hedge book from `snapshot.ring_buffer` events. The relay
// strips qualified event types to suffix-only (see indexer/src/pollVaultEvents
// .ts:36-38), so `RingEvent.name` is e.g. `'HedgeMinted'`, NOT
// `'::rebalance::HedgeMinted'`. PATTERNS.md "Shared event find-by-suffix"
// describes the cross-deploy-robust matching style; for the relay's already-
// stripped names we match with `endsWith('HedgeMinted')` (which IS exact-equal
// here since the name is just the suffix — endsWith keeps the contract
// readable and robust to any future relay change that re-attaches a prefix).
//
// Source-of-truth Move struct shapes (Rule 1 fix vs plan body interface guesses):
//   rebalance.move:58-65 — HedgeMinted {
//     vault_id, market_key: MarketKey, quantity, cost_basis_quote,
//     strike, expiry_ms,
//   }
//   rebalance.move:67-71 — HedgeRolled { vault_id, old_key, new_key } (NOT
//     `old_market_key`/`new_market_key`; verified against indexer fixture).
//   vault.move:204-208   — HedgeUnwound { vault_id, oracle_id, payout_quote }
//     (NOT `market_key` — the vault-level emission keys by oracle_id only).
//
// MarketKey struct (predict/sources/market_key.move):
//   { oracle_id: ID, expiry_ms: u64, strike: u64, is_down: bool }
//
// Direction display: `is_down: true` → 'down' (PUT-like hedge); false → 'up'.
//
// Notional/premium semantics: HedgeMinted carries `cost_basis_quote` (the
// quote micro-units the vault paid to acquire the position) and `quantity`
// (Predict position-shares). We surface `cost_basis_quote` as `notionalQuote`
// (the v1 dashboard's notional proxy) and leave `premiumQuote` at 0n until a
// dedicated premium field is added. This is consistent with how Plan 02's
// vault.move:185-192 `HedgeMinted` mirror only carries `notional_quote +
// cost_basis_quote` — `cost_basis_quote` is the canonical economic input.

import { useMemo } from 'react';

import type { FullSnapshot, RingEvent } from '@/lib/types';

export type Hedge = {
  marketKey: string;
  oracleId: string;
  strike: bigint;
  strikeDisplay: string;
  expiryMs: number;
  expiryDisplay: string;
  direction: string;
  notionalQuote: bigint;
  premiumQuote: bigint;
};

type RawMarketKey = {
  oracle_id?: string;
  strike?: string;
  expiry_ms?: string;
  is_down?: boolean;
};

function makeMarketKey(mk: RawMarketKey | undefined): string {
  if (!mk) return '';
  return `${mk.oracle_id ?? ''}|${mk.strike ?? '0'}|${mk.expiry_ms ?? '0'}|${
    mk.is_down ? 'down' : 'up'
  }`;
}

function fmtExpiry(ms: number): string {
  // YYYY-MM-DD HH:MM in UTC (institutional convention; LP-side dashboards
  // are UTC-first per UI-SPEC §Numeric formatting).
  if (!Number.isFinite(ms) || ms <= 0) return '';
  return new Date(ms).toISOString().slice(0, 16).replace('T', ' ');
}

function fmtStrike(strikeBig: bigint): string {
  // Strikes in market_key are u64 at the oracle's price scale. The Predict
  // package uses 10^9 scaling for oracle prices (RESEARCH §SVI scale). For
  // BTC ~ $85k that means strike = 85_000 * 10^9 = 85_000_000_000_000.
  // Render as `${strike / 1e9}` with 2 decimals.
  return (Number(strikeBig) / 1e9).toFixed(2);
}

function hedgeFromMint(e: RingEvent): Hedge | null {
  const d = e.data as {
    market_key?: RawMarketKey;
    quantity?: string;
    cost_basis_quote?: string;
    strike?: string;
    expiry_ms?: string;
  };
  const mk = d.market_key;
  if (!mk) return null;
  const strike = BigInt(mk.strike ?? d.strike ?? '0');
  const expiryMs = Number(mk.expiry_ms ?? d.expiry_ms ?? '0');
  return {
    marketKey: makeMarketKey(mk),
    oracleId: String(mk.oracle_id ?? ''),
    strike,
    strikeDisplay: fmtStrike(strike),
    expiryMs,
    expiryDisplay: fmtExpiry(expiryMs),
    direction: mk.is_down ? 'down' : 'up',
    notionalQuote: BigInt(d.cost_basis_quote ?? '0'),
    premiumQuote: 0n,
  };
}

function hedgeFromRolledNew(e: RingEvent): Hedge | null {
  // HedgeRolled only carries old_key + new_key (rebalance.move:67-71).
  // The new hedge's economic fields (quantity, cost_basis) are not in the
  // event payload — we surface the key + display fields and leave
  // notional/premium at 0n. The next applyVaultEvent for the same key may
  // refine them; v1 keeps the row visible so judges can see "rolled into".
  const d = e.data as { new_key?: RawMarketKey };
  const mk = d.new_key;
  if (!mk) return null;
  const strike = BigInt(mk.strike ?? '0');
  const expiryMs = Number(mk.expiry_ms ?? '0');
  return {
    marketKey: makeMarketKey(mk),
    oracleId: String(mk.oracle_id ?? ''),
    strike,
    strikeDisplay: fmtStrike(strike),
    expiryMs,
    expiryDisplay: fmtExpiry(expiryMs),
    direction: mk.is_down ? 'down' : 'up',
    notionalQuote: 0n,
    premiumQuote: 0n,
  };
}

export function useExposure(snapshot: FullSnapshot | null): Hedge[] {
  return useMemo(() => {
    if (!snapshot) return [];
    const open = new Map<string, Hedge>();
    // Index by oracle_id for HedgeUnwound (which doesn't carry market_key —
    // vault.move:204-208 keys by oracle_id + payout_quote only).
    const byOracle = new Map<string, string>(); // oracleId -> marketKey

    for (const e of snapshot.ring_buffer) {
      if (e.name.endsWith('HedgeMinted')) {
        const h = hedgeFromMint(e);
        if (h) {
          open.set(h.marketKey, h);
          byOracle.set(h.oracleId, h.marketKey);
        }
      } else if (e.name.endsWith('HedgeRolled')) {
        const d = e.data as { old_key?: RawMarketKey };
        const oldKey = makeMarketKey(d.old_key);
        if (oldKey) {
          open.delete(oldKey);
          if (d.old_key?.oracle_id) byOracle.delete(d.old_key.oracle_id);
        }
        const newHedge = hedgeFromRolledNew(e);
        if (newHedge) {
          open.set(newHedge.marketKey, newHedge);
          byOracle.set(newHedge.oracleId, newHedge.marketKey);
        }
      } else if (e.name.endsWith('HedgeUnwound')) {
        const d = e.data as { oracle_id?: string };
        const oracleId = String(d.oracle_id ?? '');
        const mkKey = byOracle.get(oracleId);
        if (mkKey) {
          open.delete(mkKey);
          byOracle.delete(oracleId);
        }
      }
    }

    const now = Date.now();
    return [...open.values()]
      .filter((h) => h.expiryMs >= now)
      .sort((a, b) => a.expiryMs - b.expiryMs);
  }, [snapshot]);
}
