// dashboard/src/components/layout/Rail.tsx — 232px left navigation rail.
//
// Plan 04.1-02 Task 1 (UI-SPEC #11, LD-4) established the handoff `aside.rail`
// as a SINGLE-PAGE scroll-anchor nav. Plan 04.2-02 (LD-6, OQ-3, R-4, D-2)
// DECLUTTERED it from 13 items (4 groups) to 6 live items (2 groups) and
// COUPLED it to the App-level `mode` state. All chrome classes (.rail,
// .rail-brand, .rail-nav, .rail-k, .rail-foot, .ri-dot, .net-dot) are defined
// in globals.css — applied here by className, unchanged.
//
// Navigation Contract (04.2-UI-SPEC §Rail Declutter Contract):
//   - 6 scroll-anchor items in 2 groups (Vault / Risk Studio); every item is
//     LIVE (the disabled/tooltip idiom is RETIRED for this phase) and carries a
//     `mode` it belongs to.
//   - Cross-mode click (item.mode !== current mode): switch mode FIRST, then
//     scroll to its [data-section] on the next frame so the target — which only
//     mounts after the mode switch — is present (OQ-3, "scroll always lands,
//     never no-ops"). Same-mode click: scroll directly.
//   - The active item is tracked via an IntersectionObserver over a MODE-KEYED
//     set of [data-section] values (OBSERVED_BY_MODE) reconciled to the anchors
//     App.tsx actually mounts per mode — `event-stream` is observed (D-2 fix),
//     the stale `exposure` rail mapping is dropped. An inactive-mode item is
//     never rendered active (active gates on item.mode === mode). Default
//     active = Overview (page top).

import { useEffect, useState } from 'react';

import { DEPLOY, isDeployed } from '@/lib/ptbDeploy';

type Mode = 'vault' | 'risk';

/** A live scroll-anchor nav item. `section` is a [data-section] value, or
 *  'top'; `mode` is the view-mode the item belongs to (cross-mode clicks
 *  switch mode first, then scroll). */
type NavItem = {
  label: string;
  /** [data-section] attribute value the rail scrolls to, or 'top' for page top. */
  section: string;
  /** The view-mode this item lives in. */
  mode: Mode;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

// Rail item -> (mode, anchor) map, transcribed from the 04.2-UI-SPEC Rail
// Declutter Contract. 6 live items, 2 groups, mode-coupled (LD-6 / OQ-3).
// The 4 disabled tooltip stubs and the 3 duplicate-anchor items are REMOVED
// (LD-6); the former Composability + Account groups dissolve entirely.
const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Vault',
    items: [
      { label: 'Overview', section: 'top', mode: 'vault' },
      { label: 'Deposit', section: 'deposit-withdraw', mode: 'vault' },
      { label: 'Your position', section: 'position-viewer', mode: 'vault' },
    ],
  },
  {
    label: 'Risk Studio',
    items: [
      { label: 'SVI surface', section: 'hero', mode: 'risk' },
      { label: 'What-if', section: 'what-if', mode: 'risk' },
      { label: 'Backtest', section: 'backtest', mode: 'risk' },
    ],
  },
];

// The [data-section] values the IntersectionObserver watches, keyed by mode and
// reconciled to the anchors App.tsx mounts per mode (04.2-UI-SPEC R-4 / D-2):
//   vault -> deposit-withdraw, position-viewer  (+ `top` via the fallback)
//   risk  -> hero, what-if, backtest, event-stream
// `event-stream` IS observed (it is the real Risk r2 anchor App.tsx renders —
// the D-2 drift fix); the stale `exposure` mapping is DROPPED (the "History ->
// exposure" item is removed and no rail item points at `exposure` after the
// declutter). `top` need not be listed — the "nothing visible -> top" fallback
// covers it.
const OBSERVED_BY_MODE: Record<Mode, string[]> = {
  vault: ['deposit-withdraw', 'position-viewer'],
  risk: ['hero', 'what-if', 'backtest', 'event-stream'],
};

/** Smooth-scroll to a [data-section] target, or the page top for 'top'. */
function scrollToSection(section: string): void {
  if (section === 'top') {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  const el = document.querySelector(`[data-section="${section}"]`);
  el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/** Short, non-secret testnet vault address for the rail footer meta. */
function railNetworkLabel(): string {
  if (isDeployed(DEPLOY) && DEPLOY.vault_id) {
    const id = DEPLOY.vault_id;
    return `testnet · ${id.slice(0, 6)}…${id.slice(-4)}`;
  }
  return 'testnet';
}

export function Rail({ mode, setMode }: { mode: Mode; setMode: (m: Mode) => void }) {
  // The currently-active [data-section] (or 'top'). Default = Overview/top.
  const [activeSection, setActiveSection] = useState<string>('top');

  // Track which sections are on-screen; the topmost visible one is "active".
  // Mode-keyed: the observed set is the anchors mounted in the CURRENT mode, so
  // the effect re-binds when `mode` changes (the prior mode's anchors unmount).
  useEffect(() => {
    const sections = OBSERVED_BY_MODE[mode];
    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const section = entry.target.getAttribute('data-section');
          if (!section) continue;
          if (entry.isIntersecting) visible.add(section);
          else visible.delete(section);
        }
        // Pick the first observed section (document order) that is visible.
        const next = sections.find((s) => visible.has(s));
        // If nothing is visible, the user is at the very top -> Overview.
        setActiveSection(next ?? 'top');
      },
      { rootMargin: '-96px 0px -55% 0px', threshold: 0 },
    );

    for (const section of sections) {
      const el = document.querySelector(`[data-section="${section}"]`);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [mode]);

  return (
    <aside className="rail">
      <div className="rail-brand">
        <svg className="brand-mark" viewBox="0 0 24 24" aria-hidden="true">
          <rect
            x="2"
            y="2"
            width="20"
            height="20"
            rx="3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path
            d="M6 8 L12 17 L18 8"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <circle cx="12" cy="11" r="1.5" fill="currentColor" />
        </svg>
        <span>DeepVault</span>
      </div>

      <nav className="rail-nav" aria-label="Dashboard sections">
        {NAV_GROUPS.map((group) => (
          <RailGroup
            key={group.label}
            group={group}
            activeSection={activeSection}
            mode={mode}
            setMode={setMode}
          />
        ))}
      </nav>

      <div className="rail-foot">
        <a className="rail-back" href="/">
          ← Back to site
        </a>
        <div className="rail-meta">
          <span className="net-dot" />
          <span className="mono">{railNetworkLabel()}</span>
        </div>
      </div>
    </aside>
  );
}

function RailGroup({
  group,
  activeSection,
  mode,
  setMode,
}: {
  group: NavGroup;
  activeSection: string;
  mode: Mode;
  setMode: (m: Mode) => void;
}) {
  return (
    <>
      <span className="rail-k">{group.label}</span>
      {group.items.map((item) => {
        // An item of the inactive mode is never "active"; within the active
        // mode it is active when its section is the scrolled-to section (or it
        // is Overview and we are at the page top).
        const isActive =
          item.mode === mode &&
          (activeSection === item.section ||
            (item.section === 'top' && activeSection === 'top'));
        return (
          <a
            key={item.label}
            href="#"
            className={isActive ? 'active' : undefined}
            onClick={(e) => {
              e.preventDefault();
              if (item.mode !== mode) {
                setMode(item.mode);
                // Target section only mounts after the mode switch — defer one frame.
                requestAnimationFrame(() => scrollToSection(item.section));
              } else {
                scrollToSection(item.section);
              }
            }}
          >
            <i className="ri-dot" />
            {item.label}
          </a>
        );
      })}
    </>
  );
}
