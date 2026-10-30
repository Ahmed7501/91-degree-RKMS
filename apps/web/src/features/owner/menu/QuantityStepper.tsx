import { MENU_LINE_MAX_QUANTITY } from '@rkds/shared';
import { Minus, Plus } from 'lucide-react';
import { cx } from '../../../lib/cx';

interface Props {
  /** Read by screen readers: "Zinger Burger" or "Masala Fries, Large". */
  label: string;
  quantity: number;
  onChange: (delta: 1 | -1) => void;
  disabled?: boolean;
  size?: 'md' | 'sm';
}

const button =
  'inline-flex items-center justify-center rounded-md border transition select-none disabled:cursor-not-allowed disabled:opacity-40';

/** − quantity + (ADR-027). − is disabled at 0 and + at 99, so a quantity can never go wrong. */
export function QuantityStepper({ label, quantity, onChange, disabled, size = 'md' }: Props) {
  const box = size === 'md' ? 'size-11' : 'size-10';
  return (
    <div role="group" aria-label={`Quantity of ${label}`} className="flex items-center gap-1.5">
      <button
        type="button"
        className={cx(
          button,
          box,
          'border-border bg-surface-2 text-white hover:border-border-strong',
        )}
        aria-label={`Remove one ${label}`}
        disabled={disabled || quantity === 0}
        onClick={() => onChange(-1)}
      >
        <Minus aria-hidden="true" className="size-5" />
      </button>
      <output
        aria-live="polite"
        aria-label={`${quantity} × ${label}`}
        className={cx(
          'tabular w-8 text-center font-display text-xl font-bold',
          quantity > 0 ? 'text-gold' : 'text-muted',
        )}
      >
        {quantity}
      </output>
      <button
        type="button"
        className={cx(button, box, 'border-red bg-red text-white hover:bg-red-deep')}
        aria-label={`Add one ${label}`}
        disabled={disabled || quantity >= MENU_LINE_MAX_QUANTITY}
        onClick={() => onChange(1)}
      >
        <Plus aria-hidden="true" className="size-5" />
      </button>
    </div>
  );
}
