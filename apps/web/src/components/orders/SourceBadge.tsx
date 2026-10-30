import type { OrderSource } from '@rkds/shared';
import { Bike, MessageCircle, Phone, Tag, type LucideIcon } from 'lucide-react';
import { cx } from '../../lib/cx';

export const SOURCE_META: Record<OrderSource, { label: string; Icon: LucideIcon }> = {
  WHATSAPP: { label: 'WhatsApp', Icon: MessageCircle },
  FOODPANDA: { label: 'Foodpanda', Icon: Bike },
  PHONE: { label: 'Phone', Icon: Phone },
  OTHER: { label: 'Other', Icon: Tag },
};

/** Generic icons only, never third-party logos (DESIGN_SYSTEM §5). */
export function SourceBadge({ source, className }: { source: OrderSource; className?: string }) {
  const { label, Icon } = SOURCE_META[source];
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-sm border border-border px-2 py-0.5 text-xs font-semibold tracking-wide text-muted uppercase',
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-3.5" />
      {label}
    </span>
  );
}
