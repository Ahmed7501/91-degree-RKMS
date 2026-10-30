import { useEffect, useMemo, useState } from 'react';
import { useSession } from '../../auth/session-context';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { useIdleCursor } from '../../hooks/use-idle-cursor';
import { useNow } from '../../hooks/use-now';
import { clockSync } from '../../lib/clock-sync';
import { toggleFullscreen } from '../../lib/fullscreen';
import { OrderAlert } from '../../lib/sound';
import { readJson, STORAGE_KEYS, writeJson } from '../../lib/storage';
import { keepScreenAwake } from '../../lib/wake-lock';
import { pillState, useOrderSync } from '../../realtime/use-order-sync';
import { KitchenHeader, type Density } from './KitchenHeader';
import { OrderBoard } from './OrderBoard';
import { SoundSettings, type SoundStatus } from './SoundSettings';

/** Fluid kitchen root size (DESIGN_SYSTEM §2), ×1.2 at Large density (FR-KIT-12). */
const ROOT_SIZE = 'clamp(16px, 0.55vw + 8px, 32px)';

/** The read-only kitchen display (FR-KIT-*). No order controls exist here (ADR-021). */
export function KitchenPage() {
  const { markSignedOut } = useSession();
  const now = useNow();
  const alert = useMemo(() => new OrderAlert(), []);
  const [soundOn, setSoundOn] = useState(alert.enabled);
  const [soundLocked, setSoundLocked] = useState(true);
  const [volume, setVolume] = useState(alert.volume);
  const [soundSettings, setSoundSettings] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [density, setDensity] = useState<Density>(() =>
    readJson<Density>(STORAGE_KEYS.density, 'standard'),
  );
  const [announcement, setAnnouncement] = useState('');
  const sync = useOrderSync({
    onUnauthenticated: markSignedOut,
    // Live order:created only, never snapshot loads or reconnects; the alert ignores repeats.
    onNewOrder: (order) => {
      alert.notify(order.id);
      setAnnouncement(`New order ${order.displayNumber}`);
    },
  });
  const pill = pillState(sync.connection, sync.disconnectedAt, now, sync.online);

  useIdleCursor();
  useEffect(() => keepScreenAwake(), []);

  useEffect(() => {
    const html = document.documentElement;
    const previous = html.style.fontSize;
    html.style.fontSize = density === 'large' ? `calc(${ROOT_SIZE} * 1.2)` : ROOT_SIZE;
    writeJson(STORAGE_KEYS.density, density);
    return () => {
      html.style.fontSize = previous;
    };
  }, [density]);

  const enableSound = async () => {
    const ok = await alert.unlock();
    setSoundLocked(!ok);
    if (ok) {
      alert.setEnabled(true);
      setSoundOn(true);
    }
    return ok;
  };

  const toggleSound = async () => {
    setTestMessage(null);
    if (!alert.unlocked) {
      await enableSound();
      return;
    }
    alert.setEnabled(!soundOn);
    setSoundOn(!soundOn);
  };

  const testSound = async () => {
    const unlocked = alert.unlocked || (await alert.unlock());
    setSoundLocked(!unlocked);
    const result = unlocked ? alert.test() : 'locked';
    setTestMessage(
      result === 'played'
        ? null
        : result === 'failed'
          ? 'The sound could not be played on this device.'
          : 'The browser blocked the sound. Tap again, or check the site sound permission.',
    );
  };

  const soundStatus: SoundStatus = !alert.supported
    ? 'unsupported'
    : !soundOn
      ? 'off'
      : soundLocked
        ? 'blocked'
        : 'on';

  const live = pill === 'live';
  return (
    <div className="min-h-dvh">
      <KitchenHeader
        activeCount={sync.orders.length}
        pill={pill}
        now={now}
        soundOn={soundStatus === 'on'}
        onToggleSound={() => setSoundSettings(true)}
        onFullscreen={() => void toggleFullscreen()}
        density={density}
        onToggleDensity={() => setDensity((d) => (d === 'large' ? 'standard' : 'large'))}
      />
      {!live && sync.connection !== 'connecting' ? (
        <ErrorBanner tone={pill === 'offline' ? 'danger' : 'warning'}>
          Connection lost — showing last known orders. Timers keep running.
        </ErrorBanner>
      ) : null}
      {soundOn && soundLocked && alert.supported ? (
        <button
          type="button"
          onClick={() => void enableSound()}
          className="w-full border-b border-gold/40 bg-surface py-2 text-center font-semibold text-gold"
        >
          Tap to enable sound for new orders
        </button>
      ) : null}
      {clockSync.isSkewed() ? (
        <p className="px-4 py-1 text-center text-sm text-muted">
          Device clock is off by {Math.round(Math.abs(clockSync.offsetMs()) / 60_000)} min — timers
          corrected.
        </p>
      ) : null}
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      <SoundSettings
        open={soundSettings}
        onClose={() => setSoundSettings(false)}
        status={soundStatus}
        volume={volume}
        onToggle={() => void toggleSound()}
        onVolume={(next) => {
          alert.setVolume(next);
          setVolume(alert.volume);
        }}
        onTest={() => void testSound()}
        testMessage={testMessage}
      />
      <OrderBoard
        orders={sync.orders}
        store={sync.store}
        now={now}
        loading={sync.connection === 'connecting' || sync.connection === 'syncing'}
      />
    </div>
  );
}
