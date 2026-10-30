import { StickyNote } from 'lucide-react';
import { cx } from '../../lib/cx';
import { OrderText } from './OrderText';

/**
 * The owner's special instructions (ADR-027), kept visually apart from the food: gold frame,
 * "KITCHEN NOTES" heading, white pre-wrap text. Callers render nothing when there are no notes.
 */
export function KitchenNotes({
  notes,
  variant = 'kitchen',
}: {
  notes: string;
  variant?: 'kitchen' | 'compact';
}) {
  const kitchen = variant === 'kitchen';
  return (
    <section
      aria-label="Kitchen notes"
      className={cx(
        'rounded-md border-l-4 border-gold bg-gold/10',
        kitchen ? 'px-3 py-2.5' : 'mt-2 px-2.5 py-1.5',
      )}
    >
      <p
        className={cx(
          'flex items-center gap-1.5 font-extrabold tracking-wider text-gold',
          kitchen ? 'text-[0.8rem]' : 'text-[0.7rem]',
        )}
      >
        <StickyNote aria-hidden="true" className={kitchen ? 'size-4' : 'size-3.5'} />
        KITCHEN NOTES
      </p>
      <OrderText
        text={notes}
        className={cx(
          'font-semibold text-white',
          kitchen ? 'mt-1 text-[1.2rem] leading-[1.4]' : 'text-sm',
        )}
      />
    </section>
  );
}
