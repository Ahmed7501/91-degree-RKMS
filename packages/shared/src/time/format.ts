import { RESTAURANT_TZ } from '../constants';

/** Daily order number as shown to people: at least 3 digits (FR-ORD-12). */
export function formatDisplayNumber(orderNumber: number): string {
  return String(orderNumber).padStart(3, '0');
}

const clockFormatters = new Map<string, Intl.DateTimeFormat>();
const dayFormatters = new Map<string, Intl.DateTimeFormat>();

function cached(
  cache: Map<string, Intl.DateTimeFormat>,
  timeZone: string,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  let formatter = cache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-GB', { timeZone, ...options });
    cache.set(timeZone, formatter);
  }
  return formatter;
}

/** 24-hour `HH:mm` in the restaurant time zone, independent of the device's time zone. */
export function formatClock(instant: Date, timeZone: string = RESTAURANT_TZ): string {
  return cached(clockFormatters, timeZone, {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(instant);
}

/** `Thu 29 Oct` in the restaurant time zone. */
export function formatDay(instant: Date, timeZone: string = RESTAURANT_TZ): string {
  return cached(dayFormatters, timeZone, { weekday: 'short', day: 'numeric', month: 'short' })
    .format(instant)
    .replace(',', '');
}
