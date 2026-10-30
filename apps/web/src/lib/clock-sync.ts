/**
 * Server clock offset (REALTIME_FLOW §5, ADR-010). Timers use `now()` = Date.now() + offset, so a
 * wrong device clock never changes what the kitchen sees.
 */
export const MAX_SAMPLES = 5;
export const SKEW_WARNING_MS = 120_000;

type Listener = () => void;

export class ClockSync {
  private samples: number[] = [];
  private offset = 0;
  private readonly listeners = new Set<Listener>();

  constructor(private readonly deviceNow: () => number = () => Date.now()) {}

  /** `t0`/`t1`: device time just before sending and just after receiving the response. */
  addSample(serverTimeIso: string, t0: number, t1: number): void {
    const serverMs = Date.parse(serverTimeIso);
    if (Number.isNaN(serverMs) || t1 < t0) return;
    const rtt = t1 - t0;
    this.record(serverMs - (t0 + rtt / 2));
  }

  /** Socket `server:hello`: RTT is unknown and taken as 0. */
  addHelloSample(serverTimeIso: string): void {
    const serverMs = Date.parse(serverTimeIso);
    if (Number.isNaN(serverMs)) return;
    this.record(serverMs - this.deviceNow());
  }

  private record(sample: number): void {
    this.samples = [...this.samples, sample].slice(-MAX_SAMPLES);
    const sorted = [...this.samples].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    const median =
      sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
    const changed = Math.round(median) !== Math.round(this.offset);
    this.offset = median;
    if (changed) for (const listener of this.listeners) listener();
  }

  offsetMs(): number {
    return this.offset;
  }

  now(): number {
    return this.deviceNow() + this.offset;
  }

  /** True when the device clock is off by more than 2 minutes (a note is shown). */
  isSkewed(): boolean {
    return Math.abs(this.offset) > SKEW_WARNING_MS;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  reset(): void {
    this.samples = [];
    this.offset = 0;
  }
}

export const clockSync = new ClockSync();
