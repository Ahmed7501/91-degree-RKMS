import { Bell, BellOff, Volume2 } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { MAX_ALERT_VOLUME, MIN_ALERT_VOLUME } from '../../lib/sound';

export type SoundStatus = 'on' | 'off' | 'blocked' | 'unsupported';

interface Props {
  open: boolean;
  onClose: () => void;
  status: SoundStatus;
  volume: number;
  onToggle: () => void;
  onVolume: (volume: number) => void;
  onTest: () => void;
  /** Result of the last test, e.g. "Blocked by the browser". */
  testMessage: string | null;
}

const STATUS_TEXT: Record<SoundStatus, string> = {
  on: 'Sound is on: each new order plays a 3–4 second alert.',
  off: 'Sound is off for this screen.',
  blocked: 'The browser is blocking sound. Tap “Turn sound on” or “Test sound” to allow it.',
  unsupported: 'This browser cannot play sound. New orders still appear and highlight.',
};

/**
 * Per-screen alert settings (ADR-028): on/off, volume and a test. Device preferences only; the
 * kitchen still has no order controls (FR-KIT-07).
 */
export function SoundSettings(props: Props) {
  const percent = Math.round(props.volume * 100);
  const unsupported = props.status === 'unsupported';
  return (
    <Dialog
      open={props.open}
      title="Sound for new orders"
      onClose={props.onClose}
      actions={
        <Button variant="secondary" onClick={props.onClose}>
          Close
        </Button>
      }
    >
      <div className="flex flex-col gap-4 text-white">
        <p role="status" className="text-sm text-muted">
          {STATUS_TEXT[props.status]}
        </p>
        <Button
          variant={props.status === 'on' ? 'secondary' : 'primary'}
          size="lg"
          disabled={unsupported}
          icon={
            props.status === 'on' ? (
              <BellOff aria-hidden="true" className="size-5" />
            ) : (
              <Bell aria-hidden="true" className="size-5" />
            )
          }
          onClick={props.onToggle}
        >
          {props.status === 'on' ? 'Turn sound off' : 'Turn sound on'}
        </Button>
        <label className="flex flex-col gap-2 text-sm font-semibold">
          <span className="flex justify-between">
            Alert volume <span className="tabular text-gold">{percent}%</span>
          </span>
          <input
            type="range"
            min={MIN_ALERT_VOLUME * 100}
            max={MAX_ALERT_VOLUME * 100}
            step={10}
            value={percent}
            disabled={unsupported}
            onChange={(e) => props.onVolume(Number(e.target.value) / 100)}
            className="h-11 accent-[var(--c-gold)]"
          />
        </label>
        <p className="text-xs text-muted">
          The device&apos;s own volume also applies: turn it up if the alert is too quiet.
        </p>
        <Button
          variant="secondary"
          disabled={unsupported}
          icon={<Volume2 aria-hidden="true" className="size-5" />}
          onClick={props.onTest}
        >
          Test sound
        </Button>
        {props.testMessage ? (
          <p role="alert" className="text-sm text-warning">
            {props.testMessage}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
