// dashboard/src/components/__tests__/RelayStatusPill.test.tsx — Plan 04.1-04 Task 4.
//
// Phase 04.1 reskin (UI-SPEC §Color): the tone moves from the Phase-4
// cyan/amber/rose Tailwind ramp to the handoff mint/coral OKLCH tokens,
// surfaced via a `data-tone` attribute. The state→pill copy contract is
// unchanged:
//   live        → 'LIVE'                 (mint + live-dot)
//   connecting  → 'CONNECTING'           (mint; reuses healthy tone)
//   reconnecting → 'RECONNECTING IN {N}S' (coral; countdown)
//   down        → 'RELAY DOWN'           (coral)

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { RelayStatusPill } from '@/components/layout/RelayStatusPill';

describe('<RelayStatusPill>', () => {
  it("renders 'LIVE' with mint tone for state=live", () => {
    render(<RelayStatusPill state="live" />);
    const badge = screen.getByText(/LIVE/);
    expect(badge).toBeInTheDocument();
    expect(badge.getAttribute('data-tone')).toBe('mint');
  });

  it("renders 'CONNECTING' with mint tone for state=connecting", () => {
    render(<RelayStatusPill state="connecting" />);
    const badge = screen.getByText('CONNECTING');
    expect(badge).toBeInTheDocument();
    expect(badge.getAttribute('data-tone')).toBe('mint');
  });

  it("renders 'RECONNECTING' (no countdown) with coral tone when secondsUntilReconnect missing", () => {
    render(<RelayStatusPill state="reconnecting" />);
    const badge = screen.getByText('RECONNECTING');
    expect(badge).toBeInTheDocument();
    expect(badge.getAttribute('data-tone')).toBe('coral');
  });

  it("renders 'RECONNECTING IN 4S' with countdown when secondsUntilReconnect=4", () => {
    render(<RelayStatusPill state="reconnecting" secondsUntilReconnect={4} />);
    const badge = screen.getByText('RECONNECTING IN 4S');
    expect(badge).toBeInTheDocument();
    expect(badge.getAttribute('data-tone')).toBe('coral');
  });

  it("renders 'RELAY DOWN' with coral tone for state=down", () => {
    render(<RelayStatusPill state="down" />);
    const badge = screen.getByText('RELAY DOWN');
    expect(badge).toBeInTheDocument();
    expect(badge.getAttribute('data-tone')).toBe('coral');
  });

  it('uses uppercase 11px tracking-wider per UI-SPEC §Typography', () => {
    render(<RelayStatusPill state="live" />);
    const badge = screen.getByText('LIVE');
    expect(badge.className).toMatch(/tracking-wider/);
    expect(badge.className).toMatch(/uppercase/);
  });
});
