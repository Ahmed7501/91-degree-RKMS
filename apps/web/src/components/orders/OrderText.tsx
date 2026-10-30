import { cx } from '../../lib/cx';

/**
 * The order exactly as pasted: a React text node with pre-wrap (ADR-020). Never HTML, never
 * markdown, never auto-linked. `dir="auto"` handles Urdu and mixed lines.
 */
export function OrderText({ text, className }: { text: string; className?: string }) {
  return (
    <p dir="auto" className={cx('order-text', className)}>
      {text}
    </p>
  );
}
