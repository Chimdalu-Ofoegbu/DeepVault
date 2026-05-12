// dashboard/src/components/__tests__/RelayStatusPill.test.tsx — Plan 04-03 Task 3.
//
// UI-SPEC §WebSocket reconnect locks the state→pill copy contract:
//   live        → 'LIVE'            (cyan)
//   connecting  → 'CONNECTING'      (cyan; reuses live tone — see UI-SPEC)
//   reconnecting → 'RECONNECTING IN {N}S'  (amber; countdown)
//   down        → 'RELAY DOWN'      (rose)

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { RelayStatusPill } from '@/components/layout/RelayStatusPill';

describe('<RelayStatusPill>', () => {
  it("renders 'LIVE' with cyan tone for state=live", () => {
    render(<RelayStatusPill state="live" />);
    const badge = screen.getByText('LIVE');
    expect(badge).toBeInTheDocument();
    expect(badge.className).toMatch(/cyan/);
  });

  it("renders 'CONNECTING' with cyan tone for state=connecting", () => {
    render(<RelayStatusPill state="connecting" />);
    const badge = screen.getByText('CONNECTING');
    expect(badge).toBeInTheDocument();
    expect(badge.className).toMatch(/cyan/);
  });

  it("renders 'RECONNECTING' (no countdown) with amber tone when secondsUntilReconnect missing", () => {
    render(<RelayStatusPill state="reconnecting" />);
    const badge = screen.getByText('RECONNECTING');
    expect(badge).toBeInTheDocument();
    expect(badge.className).toMatch(/amber/);
  });

  it("renders 'RECONNECTING IN 4S' with countdown when secondsUntilReconnect=4", () => {
    render(<RelayStatusPill state="reconnecting" secondsUntilReconnect={4} />);
    const badge = screen.getByText('RECONNECTING IN 4S');
    expect(badge).toBeInTheDocument();
    expect(badge.className).toMatch(/amber/);
  });

  it("renders 'RELAY DOWN' with rose tone for state=down", () => {
    render(<RelayStatusPill state="down" />);
    const badge = screen.getByText('RELAY DOWN');
    expect(badge).toBeInTheDocument();
    expect(badge.className).toMatch(/rose/);
  });

  it('uses uppercase 11px tracking-wider per UI-SPEC §Typography', () => {
    render(<RelayStatusPill state="live" />);
    const badge = screen.getByText('LIVE');
    expect(badge.className).toMatch(/tracking-wider/);
    expect(badge.className).toMatch(/uppercase/);
  });
});
