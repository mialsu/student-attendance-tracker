import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { SPINNER_DELAY_MS, useDelayedFlag } from '../useDelayedFlag';

/**
 * DESIGN.md §3: "Nothing shows a spinner before 300ms." Most calls to the Hetzner VM return well
 * inside that, and a spinner that appears and vanishes reads as a flicker rather than progress.
 */
describe('useDelayedFlag', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('is the 300 ms DESIGN.md §3 names', () => {
    expect(SPINNER_DELAY_MS).toBe(300);
  });

  it('stays down while the flag has been up for less than the delay', () => {
    const { result } = renderHook(() => useDelayedFlag(true));
    act(() => vi.advanceTimersByTime(SPINNER_DELAY_MS - 1));
    expect(result.current).toBe(false);
  });

  it('comes up once the flag has held for the whole delay', () => {
    const { result } = renderHook(() => useDelayedFlag(true));
    act(() => vi.advanceTimersByTime(SPINNER_DELAY_MS));
    expect(result.current).toBe(true);
  });

  it('drops at once when the flag clears', () => {
    const { result, rerender } = renderHook(({ on }) => useDelayedFlag(on), {
      initialProps: { on: true },
    });
    act(() => vi.advanceTimersByTime(SPINNER_DELAY_MS));
    expect(result.current).toBe(true);

    rerender({ on: false });
    expect(result.current).toBe(false);
  });

  it('starts the wait again when the flag flickers', () => {
    const { result, rerender } = renderHook(({ on }) => useDelayedFlag(on), {
      initialProps: { on: true },
    });
    act(() => vi.advanceTimersByTime(SPINNER_DELAY_MS - 50));
    rerender({ on: false });
    rerender({ on: true });
    act(() => vi.advanceTimersByTime(SPINNER_DELAY_MS - 50));
    expect(result.current).toBe(false);

    act(() => vi.advanceTimersByTime(50));
    expect(result.current).toBe(true);
  });
});
