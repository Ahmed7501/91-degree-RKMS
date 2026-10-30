import { useSyncExternalStore } from 'react';
import { clockSync, type ClockSync } from '../lib/clock-sync';

/**
 * One shared 1 Hz ticker for every timer on screen (ADR-010). Each tick is scheduled for the next
 * boundary of the **corrected** second (Date.now() + offset), so displayed seconds never skip or
 * repeat when the offset has a fractional part.
 */
export class Ticker {
  private readonly listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private current: number;

  constructor(private readonly clock: ClockSync = clockSync) {
    this.current = clock.now();
  }

  private schedule(): void {
    const now = this.clock.now();
    const delay = 1000 - (((now % 1000) + 1000) % 1000) + 5;
    this.timer = setTimeout(() => {
      this.current = this.clock.now();
      for (const listener of this.listeners) listener();
      this.schedule();
    }, delay);
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    if (this.listeners.size === 1) {
      this.current = this.clock.now();
      this.schedule();
    }
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0 && this.timer !== undefined) {
        clearTimeout(this.timer);
        this.timer = undefined;
      }
    };
  };

  getSnapshot = (): number => this.current;

  subscriberCount(): number {
    return this.listeners.size;
  }
}

export const ticker = new Ticker();

/** Corrected server time in ms, updated once per second. */
export function useNow(source: Ticker = ticker): number {
  return useSyncExternalStore(source.subscribe, source.getSnapshot, source.getSnapshot);
}
