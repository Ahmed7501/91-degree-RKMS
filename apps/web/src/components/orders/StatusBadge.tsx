import type { OrderStatus } from '@rkds/shared';
import { cx } from '../../lib/cx';

const STYLES: Record<OrderStatus, string> = {
  ACTIVE: 'border-gold/60 text-gold',
  COMPLETED: 'border-success/40 text-success',
  CANCELLED: 'border-border text-muted',
};

const LABELS: Record<OrderStatus, string> = {
  ACTIVE: 'Active',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span className={cx('rounded-sm border px-2 py-0.5 text-xs font-semibold', STYLES[status])}>
      {LABELS[status]}
    </span>
  );
}
