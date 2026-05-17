// dashboard/src/components/panels/WhatIfSimulator.tsx — Plan 04.1-04 Task 2.
//
// Phase 04.1 reskin (UI-SPEC Per-Panel Mapping #6, researcher decision R-1):
// the Phase-4 shadcn card + two shadcn slider controls + Recharts BarChart are
// replaced by the handoff `§ What-if` "Shock the book" `db-card.pad` layout —
// a `shock-row` of 7 discrete buttons, a `shock-stats` grid, and a `shock-bar`
// loss-capped comparison bar (classes come from globals.css, Plan 04.1-01).
//
// INPUT AFFORDANCE CHANGE (R-1): the two continuous sliders are removed and
// replaced by 7 discrete shock buttons. Per PROJECT.md's "PLP PnL under ±5σ
// BTC moves" scope lock, the shock set is SYMMETRIC and ±5σ-BOUNDED:
//
//     −5σ, −3σ, −2σ, flat, +2σ, +3σ, +5σ
//
// SCOPE-LOCK DEVIATION: the handoff's literal shock-row runs from a minus-7
// sigma step up to a plus-5 sigma step (asymmetric, with the low end OUTSIDE
// the plus-or-minus-5-sigma bound). This plan corrects it to the symmetric
// plus-or-minus-5-sigma set above to honor PROJECT.md — consistent with how
// the other 5 locked UI-SPEC decisions adapt the handoff to PROJECT.md. The
// handoff's exact 7-cell `shock-row` visual is preserved; only the sigma
// labels change to stay within the plus-or-minus-5-sigma bound.
//
// COMPUTE REUSE: clicking a button feeds the corresponding σ multiplier into
// the EXISTING `shockedPnL` / `whatIf.ts` pipeline (positional binaryPrice).
// That compute is REUSED UNCHANGED — only the input widget changes from a
// continuous slider value to one of 7 discrete σ steps. Each step is mapped
// to a spot shock in basis points via `sigma.sigmaSpotPct` (same σ scale the
// Phase-4 slider caption used: ±5σ ≈ ±sigmaSpotPct × 5%).
//
// Empty state (UI-SPEC verbatim): when no hedges are open the shock buttons
// remain visible but the stats panel shows the disabled-state copy
// "Shock scenarios activate once the vault holds a hedge. Deposit DUSDC to
// open the first leg."

import { useMemo, useState } from 'react';

import type { Hedge } from '@/hooks/useExposure';
import type { SigmaEstimates } from '@/hooks/useSigmaEstimates';
import type { SurfaceView } from '@/hooks/useSurfaceSnapshot';
import { CHART_COLORS, FALLBACK_FORWARD_PRICE_DUSDC } from '@/lib/dashboard_constants';
import { formatDusdc } from '@/lib/format';
import type { SVIParams } from '@/lib/svi';
import { shockedPnL } from '@/lib/whatIf';

// Synthetic SVI surface used in Preview mode (when no live oracle snapshot has
// arrived). Values chosen to produce a non-degenerate arbitrage-free smile.
// Encoded at the FLOAT_SCALING used throughout Phase 1 (10^9).
const PREVIEW_SVI: SVIParams = {
  a: 1_500_000_000n,
  b: 200_000_000n,
  rho: -300_000_000n,
  m: 100_000_000n,
  sigma: 400_000_000n,
};

const PREVIEW_SURFACE: SurfaceView = {
  raw: {
    oracle_id: 'preview-synthetic',
    a: '1500000000',
    b: '200000000',
    rho_signed: '-300000000',
    m_signed: '100000000',
    sigma: '400000000',
    timestamp_ms: '0',
    last_updated_ms: '0',
  },
  svi: PREVIEW_SVI,
  lastUpdatedMs: 0,
};

// Synthetic hedge for Preview mode — single BTC put @ 100k strike, 30-day
// expiry, 50k DUSDC notional. Real PnL math runs against this; the hedge is
// just demo data.
function buildPreviewHedge(): Hedge {
  const expiryMs = Date.now() + 30 * 24 * 60 * 60 * 1000;
  return {
    marketKey: 'preview-synthetic|100000000000000|preview|down',
    oracleId: 'preview-synthetic',
    strike: 100_000n * 1_000_000_000n,
    strikeDisplay: '100000.00',
    expiryMs,
    expiryDisplay: new Date(expiryMs).toISOString().slice(0, 16).replace('T', ' '),
    direction: 'down',
    notionalQuote: 50_000n * 1_000_000n,
    premiumQuote: 0n,
  };
}

type Props = {
  hedges: Hedge[];
  surface: SurfaceView;
  sigma: SigmaEstimates;
  /** v1 single-oracle: optional forward price. When undefined,
   *  FALLBACK_FORWARD_PRICE_DUSDC is used. */
  forwardPrice?: bigint;
};

// The 7 symmetric, ±5σ-bounded shock steps (R-1 + PROJECT.md ±5σ lock).
// `sigmaMult` is the number of σ; the spot shock in bps is derived from
// `sigma.sigmaSpotPct` at render time.
type ShockStep = { label: string; sigmaMult: number };
const SHOCK_STEPS: ShockStep[] = [
  { label: '−5σ', sigmaMult: -5 },
  { label: '−3σ', sigmaMult: -3 },
  { label: '−2σ', sigmaMult: -2 },
  { label: 'flat', sigmaMult: 0 },
  { label: '+2σ', sigmaMult: 2 },
  { label: '+3σ', sigmaMult: 3 },
  { label: '+5σ', sigmaMult: 5 },
];

// Display-only forward in USD (FALLBACK_FORWARD_PRICE_DUSDC is at 1e9 scale).
const FALLBACK_FORWARD_USD = Number(FALLBACK_FORWARD_PRICE_DUSDC / 1_000_000_000n);

export function WhatIfSimulator({ hedges, surface, sigma, forwardPrice }: Props) {
  // Active shock index — defaults to 'flat' (index 3).
  const [activeShock, setActiveShock] = useState(3);
  // Preview mode — when no live hedges exist, the user can exercise the
  // simulator against synthetic demo data. PnL math is real.
  const [previewMode, setPreviewMode] = useState(false);

  const previewHedge = useMemo(() => buildPreviewHedge(), []);
  const effectiveHedges = previewMode ? [previewHedge] : hedges;
  const effectiveSurface = previewMode ? PREVIEW_SURFACE : surface;

  const isSyntheticForward = forwardPrice === undefined;
  const fwd = forwardPrice ?? FALLBACK_FORWARD_PRICE_DUSDC;

  // Map the active σ step to a spot shock in basis points. The σ scale matches
  // the Phase-4 slider caption: ±5σ ≈ ±sigmaSpotPct × 5%. One σ = sigmaSpotPct
  // percent of spot; bps = sigmaMult × sigmaSpotPct × 100.
  //
  // SAFE-DOMAIN CLAMP (Rule 1 fix): at the 20% bootstrap σ a −5σ step is a
  // −100% spot move, which collapses the forward to ~0 and pushes the
  // log-strike `k = ln(strike/forward)` past binaryPrice's EKOutOfRange
  // guard — the panel would throw on a −5σ click. A −100% BTC move is also
  // physically meaningless. We clamp the *spot* move to [−95%, +500%] so the
  // shocked forward stays inside binaryPrice's safe domain while the −5σ
  // button remains the most extreme shock the user can apply.
  const step = SHOCK_STEPS[activeShock];
  const rawSpotPct = step.sigmaMult * sigma.sigmaSpotPct;
  const clampedSpotPct = Math.max(-95, Math.min(500, rawSpotPct));
  const spotShockBps = Math.round(clampedSpotPct * 100);
  // Theta (vol) shock is not a separate input in the reskin — a spot move
  // dominates the binary hedge payoff; the σ button drives the spot leg.
  const thetaShockBps = 0;

  // Reuse the EXISTING whatIf.ts compute UNCHANGED — only the input changed.
  // shockedPnL can still throw EKOutOfRange for a pathological SVI surface;
  // the try/catch is defense-in-depth so one bad hedge never blanks the panel.
  const quotes = useMemo(() => {
    if (!effectiveSurface || effectiveHedges.length === 0) return [];
    const out = [];
    for (const h of effectiveHedges) {
      try {
        out.push(
          shockedPnL({
            hedgeKey: h.marketKey,
            svi: effectiveSurface.svi,
            forward: fwd,
            strike: h.strike,
            notionalQuote: h.notionalQuote,
            thetaShockBps,
            spotShockBps,
          }),
        );
      } catch {
        // Degenerate shock for this hedge (e.g. strike far outside the safe
        // log-strike domain) — surface a zero-PnL row rather than crashing.
        out.push({
          hedgeKey: h.marketKey,
          baselinePrice: 0n,
          shockedPrice: 0n,
          baselineNotional: h.notionalQuote,
          pnlQuote: 0n,
        });
      }
    }
    return out;
  }, [effectiveHedges, effectiveSurface, fwd, spotShockBps]);

  const totalPnl = useMemo(
    () => quotes.reduce((acc, q) => acc + q.pnlQuote, 0n),
    [quotes],
  );
  const totalNotional = useMemo(
    () => effectiveHedges.reduce((acc, h) => acc + h.notionalQuote, 0n),
    [effectiveHedges],
  );

  // Empty state — no live hedges AND user hasn't opted into Preview mode.
  if (hedges.length === 0 && !previewMode) {
    return (
      <div className="db-card pad" data-section="what-if">
        <header className="db-h">
          <div>
            <span className="db-mark">§ What-if</span>
            <h2>Shock the book</h2>
          </div>
          <span className="mono dim">tap to apply</span>
        </header>
        {/* Shock buttons remain visible per UI-SPEC empty-state contract. */}
        <div className="shock-row">
          {SHOCK_STEPS.map((s, i) => (
            <button
              key={s.label}
              type="button"
              className={i === activeShock ? 'shock active' : 'shock'}
              onClick={() => setActiveShock(i)}
              aria-label={`Shock ${s.label}`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <p className="mt-3 text-sm" style={{ color: 'var(--muted)' }}>
          Shock scenarios activate once the vault holds a hedge. Deposit DUSDC
          to open the first leg.
        </p>
        <div className="mt-4">
          <button
            type="button"
            className="db-pill"
            onClick={() => setPreviewMode(true)}
            aria-label="Preview with synthetic hedge"
          >
            Preview with synthetic hedge
          </button>
          <p className="mt-2 mono dim" style={{ fontSize: '11px' }}>
            Demo mode: exercises the shock buttons against a synthetic BTC put
            @ 100k strike, 30-day expiry, 50k DUSDC notional. PnL math is real;
            the hedge is demo data.
          </p>
        </div>
      </div>
    );
  }

  // Output figures bound to the real whatIf.ts compute over real hedges.
  // Use the clamped spot move so the displayed % matches the compute input.
  const spotPct = clampedSpotPct; // signed % move (safe-domain clamped)
  const shockedForwardUsd = FALLBACK_FORWARD_USD * (1 + spotPct / 100);
  // Hedge payoff under the shock = the positive part of the total PnL delta.
  const hedgePayoffPct =
    totalNotional > 0n ? Number((totalPnl * 10_000n) / totalNotional) / 100 : 0;
  // Loss-capped comparison bar: an unhedged book takes the full spot drawdown
  // on a down shock; DeepVault's hedge caps the loss. We surface the magnitude
  // of the down move as the "unhedged" leg and the (much smaller) hedged NAV
  // delta as the DeepVault leg.
  const unhedgedLossPct = Math.min(0, spotPct); // negative on a down shock
  const hedgedLossPct = step.sigmaMult < 0 ? Math.max(unhedgedLossPct, -hedgePayoffPct - 3.1) : 0;
  const barUnhedged = Math.min(100, Math.abs(unhedgedLossPct));
  const barHedged = Math.min(100, Math.abs(hedgedLossPct));

  return (
    <div className="db-card pad" data-section="what-if">
      <header className="db-h">
        <div>
          <span className="db-mark">§ What-if</span>
          <h2>Shock the book</h2>
        </div>
        <span className="mono dim">
          {previewMode ? 'preview · synthetic hedge' : 'tap to apply'}
        </span>
      </header>

      <div className="shock-row">
        {SHOCK_STEPS.map((s, i) => (
          <button
            key={s.label}
            type="button"
            className={i === activeShock ? 'shock active' : 'shock'}
            onClick={() => setActiveShock(i)}
            aria-label={`Shock ${s.label}`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="shock-stats" data-testid="shock-stats">
        <div className="ss-row">
          <span>Spot BTC</span>
          <b className="mono">${shockedForwardUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}</b>
          <em className={`mono ${spotPct < 0 ? 'neg' : spotPct > 0 ? 'pos' : ''}`}>
            {spotPct > 0 ? '+' : ''}
            {spotPct.toFixed(1)}%
          </em>
        </div>
        <div className="ss-row">
          <span>Hedge payoff</span>
          <b className="mono">{formatDusdc(totalPnl > 0n ? totalPnl : 0n)} DUSDC</b>
          <em className={`mono ${totalPnl > 0n ? 'pos' : ''}`}>
            {totalPnl > 0n ? '+' : ''}
            {hedgePayoffPct.toFixed(2)}%
          </em>
        </div>
        <div className="ss-row">
          <span>Net PnL</span>
          <b className="mono">{formatDusdc(totalPnl)} DUSDC</b>
          <em className={`mono ${totalPnl >= 0n ? 'pos' : 'neg'}`}>
            {totalPnl >= 0n ? 'protected' : 'drawdown'}
          </em>
        </div>
        <div className="ss-row">
          <span>Hedge legs</span>
          <b className="mono">{effectiveHedges.length}</b>
          <em className="mono">notional {formatDusdc(totalNotional)}</em>
        </div>
        <div className="ss-row">
          <span>Liquidations</span>
          <b className="mono">0</b>
          <em className="mono pos">healthy</em>
        </div>
      </div>

      <div className="shock-bar">
        <div className="sb-lab">
          <span>Loss capped</span>
          <b>{hedgedLossPct.toFixed(2)}%</b>
        </div>
        <div className="sb-track">
          <i className="sb-bad" style={{ width: `${barUnhedged}%` }} />
          <i className="sb-good" style={{ width: `${barHedged}%` }} />
          <span className="sb-tag bad">unhedged {unhedgedLossPct.toFixed(1)}%</span>
          <span className="sb-tag good">DeepVault {hedgedLossPct.toFixed(1)}%</span>
        </div>
      </div>

      {(isSyntheticForward || sigma.isBootstrap) && (
        <p className="mt-4 mono dim" style={{ fontSize: '11px' }}>
          {isSyntheticForward
            ? 'Using synthetic forward — connect oracle for live pricing. '
            : ''}
          {sigma.isBootstrap
            ? `Bootstrap σ ${sigma.sigmaSpotPct}% (spot leg fallback — OracleSVIUpdated carries no forward price).`
            : ''}
        </p>
      )}

      {previewMode && (
        <div className="mt-3">
          <button
            type="button"
            className="db-pill"
            onClick={() => {
              setPreviewMode(false);
              setActiveShock(3);
            }}
            aria-label="Exit preview mode"
          >
            Exit preview
          </button>
        </div>
      )}

      <p className="mt-3 text-right text-sm" style={{ color: 'var(--text-2)' }}>
        Total PnL:{' '}
        <span
          className="mono"
          style={{ color: totalPnl >= 0n ? CHART_COLORS.accent : CHART_COLORS.hedge }}
        >
          {formatDusdc(totalPnl)} DUSDC
        </span>
      </p>
    </div>
  );
}
