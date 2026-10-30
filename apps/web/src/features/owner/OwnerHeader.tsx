import { formatClock, formatDay } from '@rkds/shared';
import { LogOut, MonitorPlay, Settings } from 'lucide-react';
import { Link } from 'react-router';
import { BrandMark } from '../../components/ui/BrandMark';
import { Button } from '../../components/ui/Button';
import { ConnectionPill } from '../../components/ui/ConnectionPill';
import { useNow } from '../../hooks/use-now';
import type { PillState } from '../../realtime/use-order-sync';

interface Props {
  activeCount: number;
  pill: PillState;
  onSettings: () => void;
  onLogout: () => void;
}

/** FR-OWN-01/11: brand, Karachi date and clock, connection, active count, settings, logout. */
export function OwnerHeader({ activeCount, pill, onSettings, onLogout }: Props) {
  const now = new Date(useNow());
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-bg/95 backdrop-blur">
      <div className="h-0.5 bg-gradient-to-r from-red to-red-deep" aria-hidden="true" />
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 lg:px-6">
        <BrandMark size="sm" />
        <p className="tabular hidden text-sm text-muted sm:block" aria-label="Karachi time">
          {formatDay(now)} · <span className="text-white">{formatClock(now)}</span>
        </p>
        <span
          className="rounded-full bg-surface-2 px-3 py-1 text-sm font-semibold"
          aria-live="polite"
        >
          <span className="tabular text-gold">{activeCount}</span> active
        </span>
        <div className="ml-auto flex items-center gap-1">
          <ConnectionPill state={pill} />
          <Link
            to="/kitchen"
            target="_blank"
            rel="noopener"
            aria-label="Open the kitchen display in a new tab"
            className="inline-flex size-11 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-white"
          >
            <MonitorPlay aria-hidden="true" className="size-5" />
          </Link>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Settings"
            onClick={onSettings}
            icon={<Settings aria-hidden="true" className="size-5" />}
          />
          <Button
            variant="ghost"
            size="icon"
            aria-label="Sign out"
            onClick={onLogout}
            icon={<LogOut aria-hidden="true" className="size-5" />}
          />
        </div>
      </div>
    </header>
  );
}
