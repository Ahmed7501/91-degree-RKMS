import { describe, expect, it } from 'vitest';
import { computeTimerState } from './timer';

const DEADLINE = Date.UTC(2026, 9, 29, 13, 45, 0);
const at = (remainingMs: number) => computeTimerState(DEADLINE, DEADLINE - remainingMs);

describe('computeTimerState', () => {
  it.each([
    ['25:00 at creation of a 25-min order', 25 * 60_000, 'normal', '25:00'],
    ['20:00 at creation of a 20-min order', 20 * 60_000, 'normal', '20:00'],
    ['05:01 left', 301_000, 'normal', '05:01'],
    ['exactly 05:00 left', 300_000, 'warning', '05:00'],
    ['00:01 left', 1_000, 'warning', '00:01'],
    ['deadline instant', 0, 'overdue', '+00:00'],
    ['1 s overdue', -1_000, 'overdue', '+00:01'],
    ['59:59 overdue', -(59 * 60 + 59) * 1000, 'overdue', '+59:59'],
    ['1 h overdue', -3_600_000, 'overdue', '+1:00:00'],
    ['1 h 2 min 3 s overdue', -(3600 + 123) * 1000, 'overdue', '+1:02:03'],
  ] as const)('%s', (_name, remainingMs, phase, label) => {
    expect(at(remainingMs)).toMatchObject({ phase, label });
  });

  it.each([
    ['300.5 s left rounds up and stays normal', 300_500, 'normal', '05:01', 301],
    ['299.5 s left rounds up to 05:00 in warning', 299_500, 'warning', '05:00', 300],
    ['0.5 s left rounds up to 00:01', 500, 'warning', '00:01', 1],
    ['0.5 s overdue rounds down to +00:00', -500, 'overdue', '+00:00', 0],
    ['1.9 s overdue rounds down to +00:01', -1_900, 'overdue', '+00:01', 1],
  ] as const)('sub-second: %s', (_name, remainingMs, phase, label, seconds) => {
    expect(at(remainingMs)).toEqual({ phase, label, seconds });
  });

  it('handles a device clock far behind the server (deadline appears more than 1 h away)', () => {
    expect(at(3_600_500)).toEqual({ phase: 'normal', seconds: 3601, label: '1:00:01' });
  });

  it('never shows 00:00 as a countdown value', () => {
    for (let remaining = 3_000; remaining >= -3_000; remaining -= 50) {
      const state = at(remaining);
      if (state.phase !== 'overdue') expect(state.label).not.toBe('00:00');
    }
  });
});
