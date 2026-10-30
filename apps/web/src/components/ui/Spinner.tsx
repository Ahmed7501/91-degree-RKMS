import { cx } from '../../lib/cx';

export function Spinner({ label, className }: { label?: string; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-2', className)}>
      <span
        aria-hidden="true"
        className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none"
      />
      {label ? <span>{label}</span> : <span className="sr-only">Loading</span>}
    </span>
  );
}
