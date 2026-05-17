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

// ===========================================================================
// CHART_COLORS — Phase 04.1 reskin.
//
// Plotly and Recharts cannot read CSS custom properties (`var(--token)`) at
// runtime — they need literal color strings. This module is the SINGLE SOURCE
// OF TRUTH for chart colors so no panel re-derives a hex. The values are the
// sRGB-hex equivalents of the handoff OKLCH design tokens defined in
// `src/styles/globals.css` (dark theme). Converted OKLCH -> linear sRGB via
// the standard OKLab matrices, gamma-encoded, rounded to 8-bit.
//
// Semantic rule (UI-SPEC §Color): `accent` (mint) = positive / yield / healthy
// / SVI mesh; `hedge` (coral) = loss / hedge / destructive. The two never mix
// as decoration.
//
// Consumed by the panel-reskin plans (Waves 3+): SurfacePanel, VaultPanel,
// BucketGauge, ExposurePanel, WhatIfSimulator, ArbCheckerPanel.
// ===========================================================================

/** OKLCH-equivalent sRGB hex constants for chart libraries (Plotly/Recharts).
 *  Each value documents its source OKLCH token. */
export const CHART_COLORS = {
  /** mint — yield / positive / healthy / SVI mesh. var(--accent) oklch(0.88 0.18 155). */
  accent: '#5efaa2',
  /** mint hover / secondary mesh. var(--accent-2) oklch(0.78 0.16 155). */
  accentDim: '#4ed589',
  /** coral — loss / hedge / destructive. var(--hedge) oklch(0.70 0.18 28). */
  hedge: '#fa695c',
  /** coral darker. var(--hedge-2) oklch(0.60 0.17 28). */
  hedgeDim: '#d24d42',
  /** secondary text — axis labels, ticks. var(--text-2) oklch(0.78 0.008 80). */
  text2: '#bab7b2',
  /** muted — de-emphasized chart text. var(--muted) oklch(0.60 0.012 250). */
  muted: '#7b8187',
  /** grid / axis lines. var(--border) oklch(0.285 0.008 250). */
  gridLine: '#272a2e',
  /** surface — tooltip / inset background. var(--surface) oklch(0.205 0.008 250). */
  surface: '#14171b',
  /** card background — tooltip container. var(--bg-2) oklch(0.165 0.008 250). */
  cardBg: '#0c0f12',
  /** primary text — tooltip text. var(--text) oklch(0.965 0.005 80). */
  text: '#f5f3f0',
} as const;

/** Plotly `colorscale` for the SVI surface (`type:'surface'`) — a mint gradient
 *  running dark surface -> dim mint -> bright mint. Each stop is `[t, color]`
 *  with `t` in [0,1]. Source OKLCH tokens: surface -> accent-2 -> accent. */
export const MINT_COLORSCALE: ReadonlyArray<[number, string]> = [
  [0, CHART_COLORS.surface],
  [0.5, CHART_COLORS.accentDim],
  [1, CHART_COLORS.accent],
];

/** Geist font-family string for chart `font.family` props (Plotly `font`,
 *  Recharts `<text>` styling). Mirrors `--f-sans` in globals.css. */
export const CHART_FONT_FAMILY = 'Geist, ui-sans-serif, system-ui, sans-serif';

/** Geist Mono font-family string for numeric / tabular chart labels.
 *  Mirrors `--f-mono` in globals.css. */
export const CHART_FONT_FAMILY_MONO = 'Geist Mono, ui-monospace, monospace';
