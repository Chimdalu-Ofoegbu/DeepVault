// dashboard/src/components/panels/VaultPanel.tsx — Plan 04-05 Task 1 (DASH-06);
// converted to a PURE DATA FEEDER in Plan 04.1-03 Task 3.
//
// RESOLVED FATE (UI-SPEC #7 + Plan 04.1-02): the handoff reframes the vault's
// state into the headline `dh-stats` strip, which Plan 04.1-02 built directly
// inside `App.tsx` from `useVaultState(snapshot)` (the `vaultView` spine value).
// `App.tsx` does NOT mount a standalone VaultPanel card. Therefore this
// module no longer renders a dashboard card — the shadcn card chrome, the
// local Stat helper, and the Recharts radial utilization gauge are all
// removed. No hardcoded chart hex literals survive.
//
// What remains is a pure data feeder:
//   - `useVaultState` / `VaultView` are re-exported so the headline strip and
//     `DepositWithdrawPanel` keep a single, typed import surface for the vault
//     data path (UI-SPEC Data Binding table — NAV / Net APY / hedge ratio /
//     utilization / shares all resolve from `VaultView`).
//   - `vaultStats(view)` is a pure selector that projects a `VaultView` into
//     the display-ready figures the `dh-stats` strip consumes. `Number()`
//     coercion happens here at the display boundary only — the BigInt math
//     stays in `useVaultState` (Pitfall 8). No Phase-4 data regression: the
//     selector is additive and the underlying hook is untouched.
//
// This file intentionally renders no UI. The demo-open empty values
// (`—` / `0.0%` / real low % / `~$10`) are produced by the headline strip in
// `App.tsx`; VaultPanel just supplies the typed numbers.

import { useVaultState, type VaultView } from '@/hooks/useVaultState';

// Re-export the vault data path so consumers (the headline strip,
// DepositWithdrawPanel) have one canonical import for vault state.
export { useVaultState };
export type { VaultView };

/** Display-ready vault figures derived from a `VaultView`. The headline
 *  `dh-stats` strip (App.tsx) consumes this. `Number()` coercion is confined
 *  to this boundary; the BigInt math lives in `useVaultState`. */
export type VaultStats = {
  /** Total NAV in DUSDC (6-decimal micro-units coerced to whole DUSDC). */
  navDusdc: number;
  /** Utilization as a percentage (0..100). */
  utilizationPct: number;
  /** NAV per share at NAV_SCALE 1e9, coerced to a float. */
  navPerShare: number;
  /** Whether vault supply is paused by AdminCap (D-10). */
  paused: boolean;
};

const DUSDC_MICRO = 1_000_000;
const NAV_SCALE_NUM = 1_000_000_000;

/** Pure selector: `VaultView` -> display-ready `VaultStats`. Returns `null`
 *  for a null view so callers render their own empty state. */
export function vaultStats(view: VaultView): VaultStats | null {
  if (!view) return null;
  return {
    navDusdc: Number(view.vault.total_assets) / DUSDC_MICRO,
    utilizationPct: Number(view.utilizationBps) / 100,
    navPerShare: Number(view.navPerShareScaled) / NAV_SCALE_NUM,
    paused: view.vault.paused,
  };
}
