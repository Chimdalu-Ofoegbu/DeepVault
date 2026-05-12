// dashboard/src/components/__tests__/StalenessPill.test.tsx — Plan 04-03 Task 3.
//
// UI-SPEC §4 staleness color contract:
//   fresh   → cyan border  + 'LIVE'  text
//   warning → amber border + 'STALE' text
//   stale   → rose border  + 'STALE' text
//
// The pill consumes the useStaleness hook (already TDD'd in Task 2), so the
// component-level test asserts only the rendered text + class names that map
// each status to its color tone.

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

  it("renders 'LIVE' badge with cyan tone when fresh", () => {
    const now = Date.parse('2026-05-12T12:00:00Z');
    vi.setSystemTime(now);
    render(<StalenessPill lastUpdatedMs={now - 5_000} />);
    const badge = screen.getByText('LIVE');
    expect(badge).toBeInTheDocument();
    expect(badge.className).toMatch(/cyan/);
  });

  it("renders 'STALE' badge with amber tone when warning", () => {
    const now = Date.parse('2026-05-12T12:00:00Z');
    vi.setSystemTime(now);
    render(<StalenessPill lastUpdatedMs={now - 35_000} />);
    const badge = screen.getByText('STALE');
    expect(badge).toBeInTheDocument();
    expect(badge.className).toMatch(/amber/);
  });

  it("renders 'STALE' badge with rose tone when stale", () => {
    const now = Date.parse('2026-05-12T12:00:00Z');
    vi.setSystemTime(now);
    render(<StalenessPill lastUpdatedMs={now - 70_000} />);
    const badge = screen.getByText('STALE');
    expect(badge).toBeInTheDocument();
    expect(badge.className).toMatch(/rose/);
  });

  it("renders 'STALE' with rose tone + 'no data yet' caption when null", () => {
    render(<StalenessPill lastUpdatedMs={null} />);
    const badge = screen.getByText('STALE');
    expect(badge).toBeInTheDocument();
    expect(badge.className).toMatch(/rose/);
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
