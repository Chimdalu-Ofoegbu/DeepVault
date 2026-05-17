// dashboard/src/components/layout/Rail.tsx — 232px left navigation rail.
//
// Plan 04.1-02 Task 1 (UI-SPEC #11, LD-4). The handoff's `aside.rail` reskinned
// as a SINGLE-PAGE scroll-anchor nav (not a router). All chrome classes
// (.rail, .rail-brand, .rail-nav, .rail-k, .rail-foot, .ri-dot, .net-dot) are
// defined in globals.css by Plan 04.1-01 — applied here by className.
//
// Navigation Contract (UI-SPEC §Navigation Contract):
//   - 9 scroll-anchor items resolve to a [data-section] target (or 'top').
//   - 4 disabled items (Drawdown replay, Single PTB, vUSDC share, Integrations)
//     render with --dim text + a Radix tooltip explaining where the content is.
//   - The active item is tracked via an IntersectionObserver over the
//     [data-section] elements; default active = Overview.

import { useEffect, useState } from 'react';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { DEPLOY, isDeployed } from '@/lib/ptbDeploy';

/** A scroll-anchor nav item. `section` is a [data-section] value, or 'top'. */
type AnchorItem = {
  kind: 'anchor';
  label: string;
  /** [data-section] attribute value the rail scrolls to, or 'top' for the page top. */
  section: string;
};

/** A disabled nav item — rendered dim with an explanatory tooltip. */
type DisabledItem = {
  kind: 'disabled';
  label: string;
  tooltip: string;
};

type NavItem = AnchorItem | DisabledItem;

type NavGroup = {
  label: string;
  items: NavItem[];
};

// Tooltip copy — verbatim from UI-SPEC §Navigation Contract.
const TIP_BACKTEST = 'Drawdown replay ships as the static backtest report';
const TIP_COMPOSABILITY =
  'Composability detail lives in the project README and demo video';

// Rail item -> anchor map, transcribed exactly from the UI-SPEC Navigation Contract.
const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Vault',
    items: [
      { kind: 'anchor', label: 'Overview', section: 'top' },
      { kind: 'anchor', label: 'Positions', section: 'position-viewer' },
      { kind: 'anchor', label: 'Hedge ladder', section: 'position-viewer' },
      { kind: 'anchor', label: 'History', section: 'exposure' },
    ],
  },
  {
    label: 'Risk Studio',
    items: [
      { kind: 'anchor', label: 'SVI surface', section: 'hero' },
      { kind: 'anchor', label: 'What-if', section: 'what-if' },
      { kind: 'anchor', label: 'Backtest', section: 'backtest' },
      { kind: 'disabled', label: 'Drawdown replay', tooltip: TIP_BACKTEST },
    ],
  },
  {
    label: 'Composability',
    items: [
      { kind: 'disabled', label: 'Single PTB', tooltip: TIP_COMPOSABILITY },
      { kind: 'disabled', label: 'vUSDC share', tooltip: TIP_COMPOSABILITY },
      { kind: 'disabled', label: 'Integrations', tooltip: TIP_COMPOSABILITY },
    ],
  },
  {
    label: 'Account',
    items: [
      { kind: 'anchor', label: 'Wallet', section: 'deposit-withdraw' },
      { kind: 'anchor', label: 'Reports', section: 'backtest' },
    ],
  },
];

// The set of [data-section] values the IntersectionObserver watches.
const OBSERVED_SECTIONS = [
  'hero',
  'exposure',
  'position-viewer',
  'what-if',
  'backtest',
  'deposit-withdraw',
];

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

export function Rail() {
  // The currently-active [data-section] (or 'top'). Default = Overview/top.
  const [activeSection, setActiveSection] = useState<string>('top');

  // Track which sections are on-screen; the topmost visible one is "active".
  useEffect(() => {
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
        const next = OBSERVED_SECTIONS.find((s) => visible.has(s));
        // If nothing is visible, the user is at the very top -> Overview.
        setActiveSection(next ?? 'top');
      },
      { rootMargin: '-96px 0px -55% 0px', threshold: 0 },
    );

    for (const section of OBSERVED_SECTIONS) {
      const el = document.querySelector(`[data-section="${section}"]`);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <TooltipProvider delayDuration={200}>
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
    </TooltipProvider>
  );
}

function RailGroup({
  group,
  activeSection,
}: {
  group: NavGroup;
  activeSection: string;
}) {
  return (
    <>
      <span className="rail-k">{group.label}</span>
      {group.items.map((item) => {
        if (item.kind === 'disabled') {
          return (
            <Tooltip key={item.label}>
              <TooltipTrigger asChild>
                <span
                  className="rail-disabled"
                  aria-disabled="true"
                  style={{ color: 'var(--dim)', cursor: 'default' }}
                >
                  <i className="ri-dot" />
                  {item.label}
                </span>
              </TooltipTrigger>
              <TooltipContent side="right">{item.tooltip}</TooltipContent>
            </Tooltip>
          );
        }
        const isActive =
          activeSection === item.section ||
          // Overview owns the page-top state.
          (item.section === 'top' && activeSection === 'top');
        return (
          <a
            key={item.label}
            href="#"
            className={isActive ? 'active' : undefined}
            onClick={(e) => {
              e.preventDefault();
              scrollToSection(item.section);
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
