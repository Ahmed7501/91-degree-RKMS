import { AlertTriangle } from 'lucide-react';
import type { ReactNode } from 'react';
import { cx } from '../../lib/cx';

/** Non-blocking banner (kitchen errors, offline). Never a modal. */
export function ErrorBanner({
  children,
  tone = 'danger',
}: {
  children: ReactNode;
  tone?: 'danger' | 'warning';
}) {
  return (
    <div
      role="alert"
      className={cx(
        'flex items-center gap-2 border-b px-4 py-2 text-sm',
        tone === 'danger'
          ? 'border-danger/40 bg-danger-bg text-danger'
          : 'border-warning/40 bg-warning-bg text-warning',
      )}
    >
      <AlertTriangle aria-hidden="true" className="size-4 shrink-0" />
      <span>{children}</span>
    </div>
  );
}
