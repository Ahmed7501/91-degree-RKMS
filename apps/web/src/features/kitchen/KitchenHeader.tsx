import { formatClock } from '@rkds/shared';
import { Bell, BellOff, Expand, Type } from 'lucide-react';
import { BrandMark } from '../../components/ui/BrandMark';
import { ConnectionPill } from '../../components/ui/ConnectionPill';
import type { PillState } from '../../realtime/use-order-sync';

export type Density = 'standard' | 'large';

interface Props {
  activeCount: number;
  pill: PillState;
  now: number;
  soundOn: boolean;
  onToggleSound: () => void;
  onFullscreen: () => void;
  density: Density;
  onToggleDensity: () => void;
}

const iconButton =
  'inline-flex size-12 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-white';

/**
 * FR-KIT-01: brand, active count, connection, clock, sound, density and full-screen controls.
 * The bell shows whether alerts are audible and opens the sound settings (ADR-028).
 */
export function KitchenHeader(props: Props) {
  return (
    <header className="sticky top-0 z-30 flex items-center gap-6 border-b border-border-strong bg-bg/95 px-4 py-2 backdrop-blur">
      <BrandMark size="md" />
      <p className="font-display text-[1.75rem] font-bold" aria-live="polite">
        <span className="tabular text-gold">{props.activeCount}</span> ACTIVE
      </p>
      <div className="ml-auto flex items-center gap-3">
        <ConnectionPill state={props.pill} large />
        <span className="tabular font-display text-[1.75rem] font-bold" aria-label="Karachi time">
          {formatClock(new Date(props.now))}
        </span>
        <button
          type="button"
          className={iconButton}
          aria-haspopup="dialog"
          aria-label={
            props.soundOn ? 'Sound on: open sound settings' : 'Sound off: open sound settings'
          }
          onClick={props.onToggleSound}
        >
          {props.soundOn ? (
            <Bell aria-hidden="true" className="size-6" />
          ) : (
            <BellOff aria-hidden="true" className="size-6" />
          )}
        </button>
        <button
          type="button"
          className={iconButton}
          aria-pressed={props.density === 'large'}
          aria-label={props.density === 'large' ? 'Large text on' : 'Large text off'}
          onClick={props.onToggleDensity}
        >
          <Type aria-hidden="true" className="size-6" />
        </button>
        <button
          type="button"
          className={iconButton}
          aria-label="Full screen"
          onClick={props.onFullscreen}
        >
          <Expand aria-hidden="true" className="size-6" />
        </button>
      </div>
    </header>
  );
}
