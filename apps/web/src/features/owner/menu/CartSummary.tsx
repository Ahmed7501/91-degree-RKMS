import { formatPrice } from '@rkds/shared';
import { Trash2 } from 'lucide-react';
import { cx } from '../../../lib/cx';
import { itemCount, referenceTotal, type SummaryLine } from './cart';
import { QuantityStepper } from './QuantityStepper';

interface Props {
  lines: readonly SummaryLine[];
  onChange: (itemId: string, variantId: string, delta: 1 | -1) => void;
  onRemove: (itemId: string, variantId: string) => void;
  disabled?: boolean;
}

const lineLabel = (line: SummaryLine) =>
  line.variant ? `${line.name}, ${line.variant}` : line.name;

/**
 * Review before sending (ADR-027): every selected line with + / − and remove, and a reference
 * total from menu prices. It is not a bill: no tax, discount or payment (EX-01).
 */
export function CartSummary({ lines, onChange, onRemove, disabled }: Props) {
  const count = itemCount(lines);
  return (
    <section
      aria-labelledby="cart-title"
      className="rounded-lg border border-border-strong bg-surface-2/60 p-3"
    >
      <h3
        id="cart-title"
        className="font-display text-lg font-bold tracking-wide text-white uppercase"
      >
        Order summary{' '}
        <span className="tabular text-gold">
          ({count} {count === 1 ? 'item' : 'items'})
        </span>
      </h3>
      {lines.length === 0 ? (
        <p className="mt-1 text-sm text-muted">Tap + on any item to add it to this order.</p>
      ) : (
        <ul className="mt-2 flex flex-col divide-y divide-border">
          {lines.map((line) => (
            <li
              key={`${line.itemId}/${line.variantId}`}
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className={cx('font-semibold', line.missing && 'text-danger')}>
                  {line.name}
                  {line.variant ? <span className="text-muted"> · {line.variant}</span> : null}
                </p>
                {line.missing ? (
                  <p className="text-xs text-danger">No longer on the menu: remove it.</p>
                ) : line.unitPrice !== null ? (
                  <p className="tabular text-xs text-muted">
                    {line.quantity} × {formatPrice(line.unitPrice)} ={' '}
                    {formatPrice(line.unitPrice * line.quantity)}
                  </p>
                ) : null}
              </div>
              <div className="flex items-center gap-1">
                <QuantityStepper
                  size="sm"
                  label={lineLabel(line)}
                  quantity={line.quantity}
                  onChange={(delta) => onChange(line.itemId, line.variantId, delta)}
                  disabled={disabled || line.missing}
                />
                <button
                  type="button"
                  aria-label={`Remove ${lineLabel(line)} from the order`}
                  disabled={disabled}
                  onClick={() => onRemove(line.itemId, line.variantId)}
                  className="inline-flex size-10 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-danger disabled:opacity-40"
                >
                  <Trash2 aria-hidden="true" className="size-5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {lines.length > 0 ? (
        <p className="mt-2 flex items-baseline justify-between border-t border-border pt-2 text-sm">
          <span className="text-muted">Reference total (menu prices, not a bill)</span>
          <span className="tabular font-display text-xl font-bold text-gold">
            {formatPrice(referenceTotal(lines))}
          </span>
        </p>
      ) : null}
    </section>
  );
}
