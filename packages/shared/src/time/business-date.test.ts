import { describe, expect, it } from 'vitest';
import { addDays, businessDateFor, retentionCutoffDate } from './business-date';

/** Build an instant from Asia/Karachi wall-clock time (UTC+5, no DST). */
const pkt = (iso: string) => new Date(`${iso}+05:00`);

describe('businessDateFor (cutoff 6, the owner decision Q-01)', () => {
  it.each([
    ['03:00 after closing belongs to the previous evening', '2026-10-29T03:00:00', '2026-10-28'],
    ['05:59:59 is still the previous business day', '2026-10-29T05:59:59', '2026-10-28'],
    ['06:00 starts the new business day', '2026-10-29T06:00:00', '2026-10-29'],
    ['17:00 opening', '2026-10-29T17:00:00', '2026-10-29'],
    ['23:59 same evening', '2026-10-29T23:59:00', '2026-10-29'],
    ['02:59 next night is the same shift as 17:00', '2026-10-30T02:59:00', '2026-10-29'],
    ['year boundary before cutoff', '2027-01-01T05:00:00', '2026-12-31'],
    ['year boundary at cutoff', '2027-01-01T06:00:00', '2027-01-01'],
    ['month boundary before cutoff', '2026-11-01T01:30:00', '2026-10-31'],
    ['leap day', '2028-02-29T12:00:00', '2028-02-29'],
    ['night after leap day', '2028-03-01T05:00:00', '2028-02-29'],
  ])('%s', (_name, local, expected) => {
    expect(businessDateFor(pkt(local), 6)).toBe(expected);
  });

  it('uses Karachi time regardless of the host time zone (19:00 UTC = 00:00 PKT)', () => {
    expect(businessDateFor(new Date('2026-10-28T18:59:59Z'), 0)).toBe('2026-10-28');
    expect(businessDateFor(new Date('2026-10-28T19:00:00Z'), 0)).toBe('2026-10-29');
  });

  it('cutoff 0 means a midnight reset', () => {
    expect(businessDateFor(pkt('2026-10-29T00:00:00'), 0)).toBe('2026-10-29');
    expect(businessDateFor(pkt('2026-10-28T23:59:59'), 0)).toBe('2026-10-28');
  });

  it('accepts another time zone explicitly', () => {
    expect(businessDateFor(new Date('2026-10-29T05:00:00Z'), 6, 'UTC')).toBe('2026-10-28');
  });

  it.each([-1, 24, 1.5, Number.NaN])('rejects invalid cutoff %s', (cutoff) => {
    expect(() => businessDateFor(new Date(), cutoff)).toThrow(RangeError);
  });
});

describe('addDays / retentionCutoffDate', () => {
  it.each([
    ['2026-11-03', -7, '2026-10-27'],
    ['2027-01-03', -7, '2026-12-27'],
    ['2028-03-01', -1, '2028-02-29'],
    ['2026-02-28', 1, '2026-03-01'],
    ['2026-10-29', 0, '2026-10-29'],
  ])('addDays(%s, %i) = %s', (date, days, expected) => {
    expect(addDays(date, days)).toBe(expected);
  });

  it('retention keeps today plus the previous 7 business dates', () => {
    expect(retentionCutoffDate('2026-10-29', 7)).toBe('2026-10-22');
  });

  it.each(['2026-1-1', '29-10-2026', 'not a date'])('rejects malformed date %s', (date) => {
    expect(() => addDays(date, 1)).toThrow(RangeError);
  });
});
