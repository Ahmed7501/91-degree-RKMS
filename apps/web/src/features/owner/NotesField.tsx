import { normalizeOrderText, ORDER_NOTES_MAX_CHARS } from '@rkds/shared';
import { StickyNote } from 'lucide-react';
import { Textarea } from '../../components/ui/Textarea';
import { cx } from '../../lib/cx';

interface Props {
  value: string;
  onChange: (notes: string) => void;
  readOnly?: boolean;
}

/**
 * Optional kitchen notes for either order mode (ADR-027). Multi-line, max 500 characters after
 * the ADR-020 normalization; over the limit the counter turns red and Send is blocked. The text
 * is never cut.
 */
export function NotesField({ value, onChange, readOnly }: Props) {
  const length = normalizeOrderText(value).length;
  const over = length > ORDER_NOTES_MAX_CHARS;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label
          htmlFor="order-notes"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-gold"
        >
          <StickyNote aria-hidden="true" className="size-4" />
          Kitchen Notes / Special Instructions
          <span className="font-normal text-muted">(optional)</span>
        </label>
        {length > 0 ? (
          <span
            id="order-notes-count"
            className={cx('tabular text-xs font-semibold', over ? 'text-danger' : 'text-muted')}
          >
            {length} / {ORDER_NOTES_MAX_CHARS}
          </span>
        ) : null}
      </div>
      <Textarea
        id="order-notes"
        value={value}
        rows={2}
        readOnly={readOnly}
        placeholder="e.g. No onions · Extra spicy · Sauce separate"
        className={cx('min-h-20 p-3', over && 'border-danger focus:border-danger')}
        aria-invalid={over || undefined}
        aria-describedby={length > 0 ? 'order-notes-count' : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      {over ? (
        <p role="alert" className="text-sm text-danger">
          Kitchen notes are too long (max {ORDER_NOTES_MAX_CHARS} characters). Shorten them to send.
        </p>
      ) : null}
    </div>
  );
}
