// dashboard/src/lib/format.ts — Intl.NumberFormat helpers for u64 bigint display.
//
// Pitfall 8 (u64 overflow): wire-format integers cross the WebSocket as
// strings. Dashboards parse them via `BigInt()` and only cast to `Number`
// at the DISPLAY boundary, divided by the appropriate fixed-point divisor.
// Never round-trip a u64 through a JS `Number` — silently corrupts past 2^53.
//
// Divisors:
//   DUSDC      → 10^6  (6 decimals; matches dusdc::DUSDC on Sui testnet)
//   NAV        → 10^9  (Phase 2 D-15 NAV_SCALE — share-accounting fixed-point)
//   Shares     → raw u64 (SHARE coin has its own decimals; v1 v-precision
//                untouched per Phase 1 D-14)

import { STRATEGY_CONSTANTS } from './strategy_constants';

const NAV_FMT = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 6,
  useGrouping: true,
});

const DUSDC_DIVISOR = 1_000_000n; // 10^6 (DUSDC has 6 decimals)
const NAV_SCALE = STRATEGY_CONSTANTS.NAV_SCALE; // 1_000_000_000n per D-15

/**
 * Convert a bigint integer (in some fixed-point representation) to a display
 * string. Splits whole/fractional with integer math so we stay precise up
 * to the divisor's decimal places; only the final `Number(...)` cast occurs
 * after the value has been bounded to `whole.frac` text.
 *
 * Example: bigintToDisplay(1_500_000n, 1_000_000n, NAV_FMT) → "1.50"
 */
function bigintToDisplay(
  value: bigint,
  divisor: bigint,
  fmt: Intl.NumberFormat,
): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const whole = abs / divisor;
  const frac = abs % divisor;
  // Right-pad fractional digits to the divisor's decimal count.
  const fracDigits = divisor.toString().length - 1;
  const fracPadded = frac.toString().padStart(fracDigits, '0');
  const scaled = Number(`${whole}.${fracPadded}`);
  return fmt.format(negative ? -scaled : scaled);
}

/**
 * DUSDC at 6 decimals. Input is a bigint u64 (micro-units) parsed from
 * a wire-format string. Display format: "1,234.500000" with grouping.
 */
export function formatDusdc(quoteMicro: bigint): string {
  return bigintToDisplay(quoteMicro, DUSDC_DIVISOR, NAV_FMT);
}

/**
 * NAV at NAV_SCALE 10^9. Input is a bigint at fixed-point.
 */
export function formatNav(navScaled: bigint): string {
  return bigintToDisplay(navScaled, NAV_SCALE, NAV_FMT);
}

/**
 * Share count — raw u64 with no fixed-point. SHARE coin defines its own
 * decimals on-chain; v1 dashboard renders raw u64 since the supply path
 * already converts via integer math (Phase 2 D-14).
 *
 * Note: `Number(shares)` is safe at u64 magnitudes ≤2^53 (≈9.0e15). At v1
 * grid scale (10 DUSDC seed, virtual shares 1e6) we are far under that
 * ceiling. If a SHARE total ever crosses 2^53 in production, swap to
 * bigintToDisplay with a SHARE divisor.
 */
export function formatShares(shares: bigint): string {
  return NAV_FMT.format(Number(shares));
}

/**
 * Basis points → display string with both bps and percent forms.
 * UI-SPEC tone callout: "1500 bps (15.00%)" not "15%" alone — bps is the
 * canonical wire format, parenthetical aids non-specialists.
 */
export function formatBps(bps: bigint | number): string {
  const n = typeof bps === 'bigint' ? Number(bps) : bps;
  return `${n} bps (${(n / 100).toFixed(2)}%)`;
}

/**
 * Truncate a Sui tx digest as `0x1234…abcd` per UI-SPEC copywriting contract.
 * Hex prefix preserved; first 4 hex chars + ellipsis + last 4 hex chars.
 *
 * Falls through unchanged for digests too short to truncate meaningfully.
 */
export function truncateDigest(digest: string): string {
  if (digest.length <= 14) return digest;
  const prefix = digest.startsWith('0x') ? digest.slice(0, 6) : `0x${digest.slice(0, 4)}`;
  const suffix = digest.slice(-4);
  return `${prefix}…${suffix}`;
}
