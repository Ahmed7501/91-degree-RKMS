import { describe, expect, it } from 'vitest';
import { formatClock, formatDay, formatDisplayNumber } from './format';

describe('formatDisplayNumber', () => {
  it.each([
    [1, '001'],
    [12, '012'],
    [999, '999'],
    [1000, '1000'],
  ])('%i → %s', (n, expected) => {
    expect(formatDisplayNumber(n)).toBe(expected);
  });
});

describe('Karachi clock formatting', () => {
  const instant = new Date('2026-10-29T13:43:00Z');

  it('shows 24-hour Karachi time independent of the host time zone', () => {
    expect(formatClock(instant)).toBe('18:43');
    expect(formatClock(new Date('2026-10-29T19:05:00Z'))).toBe('00:05');
  });

  it('formats in another zone when asked', () => {
    expect(formatClock(instant, 'UTC')).toBe('13:43');
  });

  it('formats the day as "Thu 29 Oct"', () => {
    expect(formatDay(instant)).toBe('Thu 29 Oct');
    expect(formatDay(new Date('2026-10-29T19:30:00Z'))).toBe('Fri 30 Oct');
  });
});
