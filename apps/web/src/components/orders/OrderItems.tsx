import type { OrderItemDto } from '@rkds/shared';
import { cx } from '../../lib/cx';

/**
 * A menu order's lines (ADR-027): a big quantity, the item name and its size. Names are React
 * text nodes, never HTML. The list is never truncated (FR-KIT-03).
 */
export function OrderItems({ items, className }: { items: OrderItemDto[]; className?: string }) {
  return (
    <ul aria-label="Items" className={cx('flex flex-col gap-1.5', className)}>
      {items.map((item) => (
        <li key={`${item.itemId}/${item.variantId}`} className="flex items-baseline gap-3">
          <span className="tabular min-w-[2.6ch] shrink-0 text-right font-display font-extrabold text-gold">
            {item.quantity}×
          </span>
          <span className="font-semibold">
            {item.name}
            {item.variant ? (
              <span className="ml-2 inline-block rounded-sm border border-border-strong bg-surface-2 px-1.5 text-[0.85em] font-bold whitespace-nowrap">
                {item.variant}
              </span>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  );
}
