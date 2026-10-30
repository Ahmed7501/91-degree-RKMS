import type { Clock } from '../../src/lib/clock';

/** A controllable clock for tests (DATABASE §4: business timestamps come from the Clock). */
export class FixedClock implements Clock {
  private current: number;

  constructor(start: Date | string = '2026-10-29T13:00:00.000Z') {
    this.current = new Date(start).getTime();
  }

  now(): Date {
    return new Date(this.current);
  }

  set(instant: Date | string): void {
    this.current = new Date(instant).getTime();
  }

  advance(ms: number): void {
    this.current += ms;
  }
}

/** Asia/Karachi wall-clock time (UTC+5, no DST) as an instant. */
export const pkt = (localIso: string): Date => new Date(`${localIso}+05:00`);
