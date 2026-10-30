import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClockSync } from '../lib/clock-sync';
import { Ticker, useNow } from './use-now';

describe('shared ticker (ADR-010)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-29T13:00:00.000Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('one interval serves every subscriber and stops when the last leaves', () => {
    const ticker = new Ticker(new ClockSync());
    const a = renderHook(() => useNow(ticker));
    const b = renderHook(() => useNow(ticker));
    expect(ticker.subscriberCount()).toBe(2);
    expect(vi.getTimerCount()).toBe(1);
    a.unmount();
    b.unmount();
    expect(ticker.subscriberCount()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('ticks on the boundary of the corrected second, so no second is skipped or repeated', () => {
    const clock = new ClockSync();
    clock.addHelloSample(new Date(Date.now() + 400.5).toISOString()); // fractional offset
    const ticker = new Ticker(clock);
    const { result, unmount } = renderHook(() => useNow(ticker));
    const seconds: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      act(() => {
        vi.advanceTimersToNextTimer();
      });
      seconds.push(Math.floor(result.current / 1000));
      expect(((result.current % 1000) + 1000) % 1000).toBeLessThan(50);
    }
    for (let i = 1; i < seconds.length; i += 1) expect(seconds[i]! - seconds[i - 1]!).toBe(1);
    unmount();
  });
});
