// dashboard/src/components/__tests__/StalenessPill.test.tsx — Plan 04.1-04 Task 4.
//
// Phase 04.1 reskin (UI-SPEC §Color): the tone moves from the Phase-4
// cyan/amber/rose Tailwind ramp to the handoff mint/coral OKLCH tokens. The
// tone is now surfaced via a `data-tone` attribute (mint | coral) since the
// color is applied via inline style, not a class.
//   fresh   → mint  + 'LIVE'  text
//   warning → coral + 'STALE' text
//   stale   → coral + 'STALE' text
//
// The pill consumes the useStaleness hook (unchanged), so the component test
// asserts the rendered text + the data-tone mapping per status.

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

import { StalenessPill } from '@/components/primitives/StalenessPill';

describe('<StalenessPill>', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders 'LIVE' badge with mint tone when fresh", () => {
    const now = Date.parse('2026-05-12T12:00:00Z');
    vi.setSystemTime(now);
    render(<StalenessPill lastUpdatedMs={now - 5_000} />);
    const badge = screen.getByText('LIVE');
    expect(badge).toBeInTheDocument();
    expect(badge.getAttribute('data-tone')).toBe('mint');
  });

  it("renders 'STALE' badge with coral tone when warning", () => {
    const now = Date.parse('2026-05-12T12:00:00Z');
    vi.setSystemTime(now);
    render(<StalenessPill lastUpdatedMs={now - 35_000} />);
    const badge = screen.getByText('STALE');
    expect(badge).toBeInTheDocument();
    expect(badge.getAttribute('data-tone')).toBe('coral');
  });

  it("renders 'STALE' badge with coral tone when stale", () => {
    const now = Date.parse('2026-05-12T12:00:00Z');
    vi.setSystemTime(now);
    render(<StalenessPill lastUpdatedMs={now - 70_000} />);
    const badge = screen.getByText('STALE');
    expect(badge).toBeInTheDocument();
    expect(badge.getAttribute('data-tone')).toBe('coral');
  });

  it("renders 'STALE' with coral tone + 'no data yet' caption when null", () => {
    render(<StalenessPill lastUpdatedMs={null} />);
    const badge = screen.getByText('STALE');
    expect(badge).toBeInTheDocument();
    expect(badge.getAttribute('data-tone')).toBe('coral');
    expect(screen.getByText(/no data yet/i)).toBeInTheDocument();
  });

  it('uses uppercase 11px tracking-wider per UI-SPEC §Typography', () => {
    const now = Date.parse('2026-05-12T12:00:00Z');
    vi.setSystemTime(now);
    render(<StalenessPill lastUpdatedMs={now} />);
    const badge = screen.getByText('LIVE');
    expect(badge.className).toMatch(/tracking-wider/);
    expect(badge.className).toMatch(/uppercase/);
  });

  it('omits caption text when compact=true', () => {
    const now = Date.parse('2026-05-12T12:00:00Z');
    vi.setSystemTime(now);
    render(<StalenessPill lastUpdatedMs={now} compact />);
    // The 'LIVE' badge is still present; the relative-time caption is hidden.
    expect(screen.getByText('LIVE')).toBeInTheDocument();
    // No "ago" text should appear in compact mode.
    expect(screen.queryByText(/ago/i)).not.toBeInTheDocument();
  });
});
