import { RESTAURANT_TZ } from '../constants';

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const formatters = new Map<string, Intl.DateTimeFormat>();

function dateFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    // en-CA formats dates as YYYY-MM-DD.
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

export function assertCutoffHour(cutoffHour: number): void {
  if (!Number.isInteger(cutoffHour) || cutoffHour < 0 || cutoffHour > 23) {
    throw new RangeError(`cutoffHour must be an integer 0–23, got ${cutoffHour}`);
  }
}

/**
 * ADR-005: the business day is the local date of `instant − cutoffHour`.
 * With cutoff 6, an order at 02:59 PKT belongs to the previous evening's business day.
 * Pakistan has no DST; the shift is applied to the instant, so the result stays correct either way.
 */
export function businessDateFor(
  instant: Date,
  cutoffHour: number,
  timeZone: string = RESTAURANT_TZ,
): string {
  assertCutoffHour(cutoffHour);
  return dateFormatter(timeZone).format(new Date(instant.getTime() - cutoffHour * HOUR_MS));
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Calendar arithmetic on a `YYYY-MM-DD` date (no time zone involved). */
export function addDays(date: string, days: number): string {
  const match = ISO_DATE.exec(date);
  if (!match) throw new RangeError(`Invalid date: ${date}`);
  const utc = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return new Date(utc + days * DAY_MS).toISOString().slice(0, 10);
}

/**
 * ADR-024: closed orders whose business date is earlier than the returned date are purged.
 * The current business date plus the previous `retentionDays` dates stay visible.
 */
export function retentionCutoffDate(currentBusinessDate: string, retentionDays: number): string {
  return addDays(currentBusinessDate, -retentionDays);
}
