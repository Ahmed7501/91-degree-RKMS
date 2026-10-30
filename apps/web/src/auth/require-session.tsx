import type { SessionRole } from '@rkds/shared';
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { BrandMark } from '../components/ui/BrandMark';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { useSession } from './session-context';

interface Props {
  roles: SessionRole[];
  /** Where a device without a matching session goes (owner login or kitchen pairing). */
  redirectTo: string;
  children: ReactNode;
}

/** Route guard. Server-side checks are the real protection; this only routes the UI. */
export function RequireSession({ roles, redirectTo, children }: Props) {
  const { status, hasRole, refresh } = useSession();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <div className="grid min-h-dvh place-items-center" role="status" aria-live="polite">
        <div className="flex flex-col items-center gap-4">
          <BrandMark size="lg" />
          <Spinner label="Loading…" />
        </div>
      </div>
    );
  }
  if (status === 'error') {
    return (
      <div className="grid min-h-dvh place-items-center p-6 text-center">
        <div className="flex max-w-sm flex-col items-center gap-4">
          <BrandMark size="lg" />
          <p className="text-muted">Can&apos;t reach the kitchen system. Check the connection.</p>
          <Button onClick={() => void refresh()}>Try again</Button>
        </div>
      </div>
    );
  }
  if (!hasRole(...roles)) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`${redirectTo}?next=${next}`} replace />;
  }
  return children;
}
