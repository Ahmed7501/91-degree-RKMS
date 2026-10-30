import { cx } from '../../lib/cx';
import type { PillState } from '../../realtime/use-order-sync';

const LABELS: Record<PillState, string> = {
  live: 'Live',
  connecting: 'Connecting…',
  reconnecting: 'Reconnecting…',
  offline: 'Offline',
};

/** Dot + text: state is never colour alone (DESIGN_SYSTEM §1). */
export function ConnectionPill({ state, large = false }: { state: PillState; large?: boolean }) {
  return (
    <span
      role="status"
      aria-live="polite"
      className={cx(
        'inline-flex items-center gap-2 rounded-full border px-3 font-semibold whitespace-nowrap',
        large ? 'py-1.5 text-base' : 'py-1 text-sm',
        state === 'live' && 'border-success/40 text-success',
        (state === 'connecting' || state === 'reconnecting') && 'border-warning/40 text-warning',
        state === 'offline' && 'border-danger/40 text-danger',
      )}
    >
      <span
        aria-hidden="true"
        className={cx(
          'size-2.5 rounded-full bg-current',
          (state === 'connecting' || state === 'reconnecting') &&
            'animate-pulse motion-reduce:animate-none',
        )}
      />
      {LABELS[state]}
    </span>
  );
}
