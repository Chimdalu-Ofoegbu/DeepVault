// dashboard/src/hooks/__tests__/useStaleness.test.tsx — Plan 04-03 Task 2 TDD.
//
// Validates the per-panel staleness state machine (UI-SPEC §4):
//   0-30s   → 'fresh'
//   30-60s  → 'warning'  (amber)
//   >=60s   → 'stale'    (rose)
//   null    → 'stale'    (no data yet)
//
// Uses vi.setSystemTime to advance the wall clock deterministically; the hook
// re-evaluates inside a 1s interval so we advance both the system clock AND
// timer queue together.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { useStaleness } from '@/hooks/useStaleness';

describe('useStaleness', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 'fresh' when delta < 30s", () => {
    const now = Date.parse('2026-05-12T12:00:00Z');
    vi.setSystemTime(now);
    const { result } = renderHook(() => useStaleness(now - 5_000));
    expect(result.current).toBe('fresh');
  });

  it("returns 'fresh' at delta=0 (just updated)", () => {
    const now = Date.parse('2026-05-12T12:00:00Z');
    vi.setSystemTime(now);
    const { result } = renderHook(() => useStaleness(now));
    expect(result.current).toBe('fresh');
  });

  it("returns 'warning' at delta=35s", () => {
    const now = Date.parse('2026-05-12T12:00:00Z');
    vi.setSystemTime(now);
    const { result } = renderHook(() => useStaleness(now - 35_000));
    expect(result.current).toBe('warning');
  });

  it("returns 'stale' at delta=70s", () => {
    const now = Date.parse('2026-05-12T12:00:00Z');
    vi.setSystemTime(now);
    const { result } = renderHook(() => useStaleness(now - 70_000));
    expect(result.current).toBe('stale');
  });

  it("returns 'stale' when lastUpdatedMs is null", () => {
    const { result } = renderHook(() => useStaleness(null));
    expect(result.current).toBe('stale');
  });

  it('transitions fresh -> warning -> stale as time advances', () => {
    const start = Date.parse('2026-05-12T12:00:00Z');
    vi.setSystemTime(start);
    const { result } = renderHook(() => useStaleness(start));

    expect(result.current).toBe('fresh');

    // Advance to 35s after start — warning territory.
    act(() => {
      vi.setSystemTime(start + 35_000);
      vi.advanceTimersByTime(1_000);
    });
    expect(result.current).toBe('warning');

    // Advance to 65s after start — stale territory.
    act(() => {
      vi.setSystemTime(start + 65_000);
      vi.advanceTimersByTime(1_000);
    });
    expect(result.current).toBe('stale');
  });

  it('uses boundary semantics: 30_000 is warning, 60_000 is stale', () => {
    const now = Date.parse('2026-05-12T12:00:00Z');
    vi.setSystemTime(now);

    // Exactly 30s -> warning (delta < 30_000 is fresh; >= 30_000 is warning).
    const { result: r30 } = renderHook(() => useStaleness(now - 30_000));
    expect(r30.current).toBe('warning');

    // Exactly 60s -> stale.
    const { result: r60 } = renderHook(() => useStaleness(now - 60_000));
    expect(r60.current).toBe('stale');
  });
});
