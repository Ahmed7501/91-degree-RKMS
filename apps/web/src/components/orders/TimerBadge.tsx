import { computeTimerState, type TimerState } from '@rkds/shared';
import { cx } from '../../lib/cx';

/** "12 minutes 41 seconds remaining" for screen readers, coarsened to 30 s steps. */
export function timerAriaLabel(state: TimerState): string {
  const coarse = state.phase === 'overdue' ? state.seconds : Math.ceil(state.seconds / 30) * 30;
  const minutes = Math.floor(coarse / 60);
  const seconds = coarse % 60;
  const parts = `${minutes} minute${minutes === 1 ? '' : 's'}${seconds ? ` ${seconds} seconds` : ''}`;
  return state.phase === 'overdue' ? `Overdue by ${parts}` : `${parts} remaining`;
}

interface Props {
  deadlineAt: string;
  now: number;
  variant: 'kitchen' | 'owner';
  className?: string;
}

/**
 * DESIGN_SYSTEM §5. Kitchen overdue: white on a red pill (large text); the card adds an
 * "OVERDUE" badge next to the source, so the timer itself never grows wider than the card.
 * Owner overdue chip: red text on the dark red tint with a bold "+" (small text).
 */
export function TimerBadge({ deadlineAt, now, variant, className }: Props) {
  const state = computeTimerState(Date.parse(deadlineAt), now);
  const kitchen = variant === 'kitchen';
  return (
    <span
      role="timer"
      aria-label={timerAriaLabel(state)}
      data-phase={state.phase}
      className={cx(
        'tabular inline-flex shrink-0 items-center rounded-md font-bold whitespace-nowrap',
        kitchen ? 'px-2.5 py-0.5 text-[2.25rem] leading-none' : 'px-2 py-1 text-sm',
        state.phase === 'normal' && 'text-white',
        state.phase === 'warning' && 'bg-warning-bg text-warning',
        state.phase === 'overdue' &&
          (kitchen ? 'bg-danger text-white' : 'bg-danger-bg text-danger'),
        className,
      )}
    >
      {state.label}
    </span>
  );
}
