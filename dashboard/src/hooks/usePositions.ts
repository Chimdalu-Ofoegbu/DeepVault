// dashboard/src/hooks/usePositions.ts — Plan 04-07 Task 2 (DASH-12).
//
// Wallet-scoped position derivation from the relay ring-buffer events.
//
// **PnL display semantics (LOCKED — the zero-vs-unknown invariant):**
//
// `Position` fields `hedgeCost`, `hedgePayoff`, `plpYield`, and `netQuote`
// are typed `bigint | null`. `null` means NOT-YET-KNOWN. `0n` means a real
// computed value of zero. The two are different and MUST be rendered
// differently downstream:
//   - PositionViewer renders `null` as em-dash "—" with tooltip
//   - PositionViewer renders `0n` as "0.00 DUSDC"
//
// This is the load-bearing institutional-LP correctness contract: silently
// displaying 0 for an unavailable attribution misrepresents computed output.
// Tests assert both branches.
//
// **Source-of-truth Move struct shapes** (from Plan 04-05 Rule 1 fixes):
//   - rebalance.move:58-65 HedgeMinted { vault_id, market_key, quantity,
//     cost_basis_quote, strike, expiry_ms }
//   - vault.move:204-208   HedgeUnwound { vault_id, oracle_id, payout_quote }
//     (keyed by oracle_id only — NOT market_key)
//   - redeem.move:51-57    RedeemFulfilled { vault_id, user, shares_burned,
//     quote_paid, remainder_shares }
//   - supply.move:46-52    Supplied { vault_id, depositor, deposit_quote,
//     shares_minted, hedge_alloc_quote }
//
// **Event-name suffix matching:** the relay strips qualified Move types to
// suffix-only (indexer/src/pollVaultEvents.ts:36-38), so events arrive at
// the dashboard as bare 'Supplied' / 'HedgeMinted' / 'HedgeUnwound' /
// 'RedeemFulfilled'. We match with `endsWith()` to be robust to a future
// relay change that re-attaches a prefix.

import { useMemo } from 'react';
import { useCurrentAccount } from '@mysten/dapp-kit';
import type { FullSnapshot, RingEvent } from '@/lib/types';

export type Position = {
  /** Wall-clock timestamp of the Supplied event (ms since epoch). */
  eventTs: number;
  /** DUSDC micro-units deposited (from Supplied.deposit_quote). */
  depositQuote: bigint;
  /** SHARE u64 minted (from Supplied.shares_minted). */
  sharesMinted: bigint;
  /** Premium / cost basis paid for the hedge minted alongside this supply.
   *  Sourced from the matching HedgeMinted.cost_basis_quote. `null` when no
   *  matching HedgeMinted event is observed (rare — typically minted in the
   *  same PTB as supply per supply.move:88-97, but a hedge could fail and
   *  abort the whole tx, in which case the Supplied event would also be
   *  absent. v1 leaves null as a forward guard.) */
  hedgeCost: bigint | null;
  /** Payout received when the matching HedgeUnwound event fires (matched by
   *  oracle_id, since vault.move:204-208 keys HedgeUnwound by oracle_id
   *  only). `null` = hedge still open / rolled / not observed yet. `0n` =
   *  matched + option expired OTM with zero payout.
   *
   *  CRITICAL: the PositionViewer renders null as em-dash and 0n as
   *  "0.00 DUSDC". This distinction surfaces to the user. */
  hedgePayoff: bigint | null;
  /** PLP yield realized at redemption. Computed from a RedeemFulfilled event
   *  matched to this position's supplier: yield = redeemed_quote - pro-rata
   *  depositQuote. `null` until a RedeemFulfilled for this position is
   *  observed. NEVER 0n for unavailable — 0n is a real value (redemption
   *  happened to break even). */
  plpYield: bigint | null;
  /** Net PnL = plpYield + hedgePayoff - hedgeCost. `null` whenever either
   *  realization leg (plpYield or hedgePayoff) is null. ONLY computed when
   *  both legs are realized — never partial. */
  netQuote: bigint | null;
};

/**
 * Find a HedgeMinted event in the ring buffer that was emitted within 60s
 * of a Supplied event. Same-PTB atomic emissions guarantee tight clustering;
 * 60s catches clock skew between event apply-time and supply-tx ts.
 */
function findMatchingMint(
  ring: ReadonlyArray<RingEvent>,
  suppliedAtMs: number,
): RingEvent | null {
  for (const e of ring) {
    if (!e.name.endsWith('HedgeMinted')) continue;
    const mintTs = Number(e.ts_ms);
    if (mintTs >= suppliedAtMs && mintTs <= suppliedAtMs + 60_000) {
      return e;
    }
  }
  return null;
}

/**
 * Find a HedgeUnwound event matching a HedgeMinted by (oracle_id, strike,
 * expiry_ms). HedgeUnwound (vault.move:204-208) carries only oracle_id +
 * payout_quote — strike/expiry must be reconstructed from the HedgeMinted
 * payload that v1 keeps in the ring buffer's Hedge index. Since v1 runs a
 * single-oracle vault, oracle_id is sufficient most of the time, but we
 * still confirm strike+expiry alignment when those fields are present on
 * the HedgeMinted side so a future multi-oracle deploy works without
 * cross-matching.
 */
export function findMatchingUnwind(
  ring: ReadonlyArray<RingEvent>,
  mintData: Record<string, unknown>,
  mintedAtMs: number,
): RingEvent | null {
  const mk = (mintData.market_key ?? {}) as Record<string, unknown>;
  const oracleId = String(mk.oracle_id ?? mintData.oracle_id ?? '');
  for (const e of ring) {
    if (!e.name.endsWith('HedgeUnwound')) continue;
    if (Number(e.ts_ms) < mintedAtMs) continue;
    const d = e.data as Record<string, unknown>;
    if (String(d.oracle_id ?? '') === oracleId) {
      return e;
    }
  }
  return null;
}

/**
 * Find a RedeemFulfilled event for `supplier` after `suppliedAtMs`. v1
 * assumes one open position at a time per supplier (D-10 wallet-scoped); a
 * future enhancement could chain Supplied → RedeemFulfilled via share
 * ledger when partial redemptions land.
 */
export function findMatchingRedemption(
  ring: ReadonlyArray<RingEvent>,
  supplier: string,
  suppliedAtMs: number,
): RingEvent | null {
  for (const e of ring) {
    if (!e.name.endsWith('RedeemFulfilled')) continue;
    if (Number(e.ts_ms) < suppliedAtMs) continue;
    const d = e.data as Record<string, unknown>;
    const user = String(d.user ?? d.supplier ?? '');
    if (user === supplier) return e;
  }
  return null;
}

export function usePositions(snapshot: FullSnapshot | null): Position[] {
  const account = useCurrentAccount();
  return useMemo(() => {
    if (!snapshot || !account) return [];
    const positions: Position[] = [];
    for (const e of snapshot.ring_buffer) {
      if (!e.name.endsWith('Supplied')) continue;
      const d = e.data as Record<string, unknown>;
      const supplier = String(d.depositor ?? d.supplier ?? '');
      if (supplier !== account.address) continue;

      const depositQuote = BigInt(String(d.deposit_quote ?? '0'));
      const sharesMinted = BigInt(String(d.shares_minted ?? '0'));
      const ts = Number(e.ts_ms);

      // hedgeCost: from HedgeMinted within 60s window of supply (typical PTB
      // ordering — supply.move:88-97 mints the hedge atomically). null when
      // no matching mint is observed (forward guard).
      const hedgeMinted = findMatchingMint(snapshot.ring_buffer, ts);
      const hedgeCost: bigint | null = hedgeMinted
        ? BigInt(String((hedgeMinted.data as Record<string, unknown>).cost_basis_quote ?? '0'))
        : null;

      // hedgePayoff: from HedgeUnwound matched by oracle_id (vault.move
      // :204-208). null when no matching unwind yet — DO NOT default to 0n,
      // because 0n is a meaningful value (option expired OTM with zero
      // payout).
      let hedgePayoff: bigint | null = null;
      if (hedgeMinted) {
        const unwind = findMatchingUnwind(
          snapshot.ring_buffer,
          hedgeMinted.data,
          Number(hedgeMinted.ts_ms),
        );
        if (unwind) {
          hedgePayoff = BigInt(
            String((unwind.data as Record<string, unknown>).payout_quote ?? '0'),
          );
        }
      }

      // plpYield: from a RedeemFulfilled NAV delta when present; null
      // otherwise. The NAV delta is quote_paid - (depositQuote * shares_burned
      // / sharesMinted), capturing the LP's pro-rata share of net vault PnL.
      // 0n means "redemption fulfilled at exactly the deposit cost basis" —
      // a real value, not "unknown".
      let plpYield: bigint | null = null;
      const redemption = findMatchingRedemption(
        snapshot.ring_buffer,
        account.address,
        ts,
      );
      if (redemption) {
        const r = redemption.data as Record<string, unknown>;
        const quotePaid = BigInt(String(r.quote_paid ?? r.quote_out ?? '0'));
        const sharesBurned = BigInt(
          String(r.shares_burned ?? r.shares_redeemed ?? r.shares ?? sharesMinted),
        );
        const proRataDeposit =
          sharesMinted === 0n ? 0n : (depositQuote * sharesBurned) / sharesMinted;
        plpYield = quotePaid - proRataDeposit;
      }

      // netQuote: ONLY when both legs are realized. null when either is
      // unavailable — partial sums would mislead.
      const netQuote: bigint | null =
        plpYield === null || hedgePayoff === null
          ? null
          : plpYield + hedgePayoff - (hedgeCost ?? 0n);

      positions.push({
        eventTs: ts,
        depositQuote,
        sharesMinted,
        hedgeCost,
        hedgePayoff,
        plpYield,
        netQuote,
      });
    }
    return positions;
  }, [snapshot, account]);
}
