import { WARNING_THRESHOLD_MS } from '../constants';

export type TimerPhase = 'normal' | 'warning' | 'overdue';

export interface TimerState {
  phase: TimerPhase;
  /** Whole seconds shown: remaining (rounded up) or overdue (rounded down). */
  seconds: number;
  /** `MM:SS`, `+MM:SS` or `+H:MM:SS` (H:MM:SS before the deadline if ever over an hour). */
  label: string;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

function clock(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${hours}:${pad2(minutes)}:${pad2(seconds)}`
    : `${pad2(minutes)}:${pad2(seconds)}`;
}

/**
 * ARCHITECTURE §7. `nowMs` must already include the server clock offset.
 * The deadline instant itself is overdue (`+00:00`), so `00:00` never shows as a countdown value.
 */
export function computeTimerState(deadlineMs: number, nowMs: number): TimerState {
  const remainingMs = deadlineMs - nowMs;
  if (remainingMs > 0) {
    const seconds = Math.ceil(remainingMs / 1000);
    return {
      phase: remainingMs > WARNING_THRESHOLD_MS ? 'normal' : 'warning',
      seconds,
      label: clock(seconds),
    };
  }
  const seconds = Math.floor(-remainingMs / 1000);
  return { phase: 'overdue', seconds, label: `+${clock(seconds)}` };
}
