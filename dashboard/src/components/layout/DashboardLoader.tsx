// dashboard/src/components/layout/DashboardLoader.tsx — Plan 04.1-06 Task 2.
//
// First-paint loading overlay (CONTEXT D-04 — "full motion pass, including the
// loader animation"). A full-viewport overlay that plays the handoff's SVI
// line-draw animation, then fades out to reveal the dashboard underneath.
//
// Markup + chrome transcribed from DeepVault-handoff/project/styles.css:86-125
// (the `.loader` / `.loader-svi` block). The `.loader`, `.loader-wrap`,
// `.loader-mark`, `.loader-svi`, `.loader-meta` classes resolve in globals.css
// (Plan 04.1-06 Task 1's motion section). The three `<path>` children of
// `.loader-svi` carry the staggered `@keyframes dash` line-draw (the SVI curve
// "draws itself"); the nth-child delays are in the CSS.
//
// LIFECYCLE: rendered on mount; after the draw animation completes (~1.2s) the
// `.gone` class is added (opacity 0, pointer-events none — a 0.6s CSS fade),
// then the component unmounts ~0.6s later. State is two flags + two timers,
// no external lib.
//
// REDUCED MOTION: when the OS requests reduced motion, the loader skips the
// line-draw wait and dismisses near-immediately (the CSS reduced-motion guard
// also forces the SVI paths fully drawn). The overlay still appears briefly so
// there is no flash-of-unstyled-content, but it does not animate.
//
// NON-BLOCKING (threat T-04.1-16): this component is purely presentational. It
// is rendered as a sibling overlay above the dash-body shell and owns ONLY its
// own dismiss timers — it never touches the useWebSocket connection, any data
// hook, or any fetch. The data spine runs underneath it from first paint; the
// loader self-dismisses on a timer and cannot trap the UI.

import { useEffect, useState } from 'react';

// Draw-animation duration before the fade-out begins. The handoff `@keyframes
// dash` runs 1.8s but the staggered paths and the visual "settle" read well at
// ~1.2s; the remaining draw finishes during the 0.6s fade.
const DRAW_MS = 1200;

// CSS fade-out duration — must match the `.loader` `transition: opacity 0.6s`.
const FADE_MS = 600;

// Reduced-motion dismiss delay — long enough to avoid a jarring flash, short
// enough that the loader does not feel like a wait.
const REDUCED_MOTION_MS = 150;

/** True when the OS / browser requests reduced motion. */
function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function DashboardLoader() {
  // `gone` triggers the CSS opacity fade; `mounted` controls whether the
  // overlay is in the tree at all (unmounted after the fade completes).
  const [gone, setGone] = useState(false);
  const [mounted, setMounted] = useState(true);

  useEffect(() => {
    const reduced = prefersReducedMotion();
    // Under reduced motion, dismiss almost immediately; otherwise let the
    // SVI line-draw play before fading.
    const drawDelay = reduced ? REDUCED_MOTION_MS : DRAW_MS;

    const fadeTimer = window.setTimeout(() => setGone(true), drawDelay);
    const unmountTimer = window.setTimeout(
      () => setMounted(false),
      drawDelay + FADE_MS,
    );

    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(unmountTimer);
    };
  }, []);

  if (!mounted) return null;

  return (
    <div
      className={gone ? 'loader gone' : 'loader'}
      role="status"
      aria-live="polite"
      aria-label="Loading DeepVault Risk Studio"
    >
      <div className="loader-wrap">
        <div className="loader-mark">
          <span className="lm-bracket">[</span>
          <span className="lm-word">DeepVault</span>
          <span className="lm-bracket">]</span>
          <span>Risk Studio</span>
        </div>

        {/* Inline SVG SVI smile — three stacked curves whose stroke-dashoffset
            animates to 0 via @keyframes dash, with staggered nth-child delays
            (globals.css). The shape is a stylised volatility smile. */}
        <svg
          className="loader-svi"
          viewBox="0 0 440 100"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M8 78 C 90 78, 150 18, 220 18 C 290 18, 350 78, 432 78"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            opacity="0.4"
          />
          <path
            d="M8 64 C 90 64, 150 30, 220 30 C 290 30, 350 64, 432 64"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            opacity="0.7"
          />
          <path
            d="M8 50 C 90 50, 150 40, 220 40 C 290 40, 350 50, 432 50"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>

        <div className="loader-meta">
          <span>SVI surface · calibrating</span>
          <span>testnet</span>
        </div>
      </div>
    </div>
  );
}
