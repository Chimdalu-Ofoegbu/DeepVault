// dashboard/src/lib/dashboard_constants.ts — Plan 04-06.
//
// Dashboard-only named constants. `strategy_constants.ts` is codegen'd from
// `shared/strategy.toml` and MUST NOT be hand-edited; this companion module
// hosts dashboard-side fallbacks and display-only values that are NOT part of
// the on-chain strategy contract.
//
// All constants here are documented at the bps/percent/USD level the UI layer
// consumes. The WhatIfSimulator (Plan 04-06) and useSigmaEstimates hook
// reference these exclusively — NEVER inline a magic number for any of these
// quantities (Rule 2 mitigation per STRIDE T-04-06-04 + T-04-06-05).

/** Bootstrap fallback for theta-leg sigma (percent) when the ring buffer has
 *  fewer than `BOOTSTRAP_MIN_OBSERVATIONS` OracleSVIUpdated events in the
 *  rolling 30-day window. Per CONTEXT.md D-07. Surfaced to the UI via
 *  `SigmaEstimates.isBootstrap` + amber "Bootstrap σ" Badge. */
export const BOOTSTRAP_SIGMA_THETA_PCT = 20;

/** Bootstrap fallback for spot-leg sigma (percent). Per CONTEXT.md D-08, BUT
 *  with a documented partial-delivery constraint: OracleSVIUpdated events do
 *  not carry forward price, so the rolling 30-day stdev of forward price
 *  required by strict D-08 is unavailable from the event stream alone. As a
 *  result the v1 dashboard ALWAYS returns this bootstrap value for the spot
 *  leg, and the WhatIfSimulator surfaces an amber badge so the user knows
 *  the σ_F input is bootstrap, not computed from history. Full D-08
 *  compliance is deferred until a forward-price stream lands. */
export const BOOTSTRAP_SIGMA_SPOT_PCT = 20;

/** Minimum number of in-window OracleSVIUpdated observations required to exit
 *  theta-leg bootstrap and compute the live rolling stdev of `a`. */
export const BOOTSTRAP_MIN_OBSERVATIONS = 7;

/** Rolling-window length (ms) used by `useSigmaEstimates`. 30 days per
 *  CONTEXT.md D-08 ("rolling 30-day stdev"). */
export const SIGMA_ROLLING_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/** Cap on computed `sigmaThetaPct` (percent) to prevent slider-range
 *  pathologies when the ring buffer captures a structural break in `a`. */
export const SIGMA_THETA_PCT_CAP = 50;

/** Fallback forward price (DUSDC at NAV_SCALE 1e9) used by WhatIfSimulator
 *  when no `forwardPrice` prop is supplied. Mathematically valid for shock
 *  arithmetic but NOT meaningful as a risk estimate; the simulator renders
 *  an amber Badge "Using synthetic forward — connect oracle for live pricing"
 *  whenever this fallback is active. 100_000 DUSDC × 1e9 = a notional BTC
 *  spot suitable for the bigint binaryPrice pipeline. */
export const FALLBACK_FORWARD_PRICE_DUSDC = 100_000n * 1_000_000_000n;

/** Display-only USD value matching `FALLBACK_FORWARD_PRICE_DUSDC`. Used for
 *  empty-state copy and any tooltip surface that needs a human-readable
 *  number for the synthetic forward. */
export const FALLBACK_FORWARD_PRICE_BTC_DISPLAY_USD = 100_000;
