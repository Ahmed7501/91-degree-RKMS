import { describe, expect, it, vi } from 'vitest';
import { ClockSync, SKEW_WARNING_MS } from './clock-sync';

const iso = (ms: number) => new Date(ms).toISOString();

describe('ClockSync (REALTIME_FLOW §5)', () => {
  it('offset = serverTime − (t0 + rtt/2)', () => {
    const clock = new ClockSync(() => 10_000);
    // Request sent at 1 000, answered at 1 200 (rtt 200); the server said 6 100.
    clock.addSample(iso(6_100), 1_000, 1_200);
    expect(clock.offsetMs()).toBe(5_000);
    expect(clock.now()).toBe(15_000);
  });

  it('uses the median of the last 5 samples, resisting outliers', () => {
    const clock = new ClockSync(() => 0);
    for (const offset of [1_000, 1_010, 990, 60_000, 1_005]) {
      clock.addSample(iso(offset), 0, 0);
    }
    expect(clock.offsetMs()).toBe(1_005);
    // Only the last five count.
    for (let i = 0; i < 5; i += 1) clock.addSample(iso(-2_000), 0, 0);
    expect(clock.offsetMs()).toBe(-2_000);
  });

  it('averages the two middle samples for an even count', () => {
    const clock = new ClockSync(() => 0);
    clock.addSample(iso(100), 0, 0);
    clock.addSample(iso(300), 0, 0);
    expect(clock.offsetMs()).toBe(200);
  });

  it('socket hello samples assume zero RTT', () => {
    const clock = new ClockSync(() => 50_000);
    clock.addHelloSample(iso(110_000));
    expect(clock.offsetMs()).toBe(60_000);
  });

  it('ignores invalid timestamps and impossible timings', () => {
    const clock = new ClockSync(() => 0);
    clock.addSample('not a date', 0, 10);
    clock.addSample(iso(500), 20, 10);
    clock.addHelloSample('nope');
    expect(clock.offsetMs()).toBe(0);
  });

  it('flags a device clock that is off by more than 2 minutes', () => {
    const clock = new ClockSync(() => 0);
    clock.addHelloSample(iso(SKEW_WARNING_MS));
    expect(clock.isSkewed()).toBe(false);
    clock.reset();
    clock.addHelloSample(iso(-(SKEW_WARNING_MS + 1)));
    expect(clock.isSkewed()).toBe(true);
  });

  it('notifies subscribers only when the rounded offset changes', () => {
    const clock = new ClockSync(() => 0);
    const listener = vi.fn();
    const unsubscribe = clock.subscribe(listener);
    clock.addHelloSample(iso(1_000));
    clock.addHelloSample(iso(1_000));
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    clock.addHelloSample(iso(9_000));
    clock.addHelloSample(iso(9_000));
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
