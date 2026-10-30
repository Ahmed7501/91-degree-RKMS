import {
  DevicesResponse,
  OkResponse,
  PairingCodeResponse,
  formatClock,
  type KitchenDeviceDto,
} from '@rkds/shared';
import { MonitorX } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Button } from '../../components/ui/Button';
import { useToast } from '../../components/ui/Toast';
import { useNow } from '../../hooks/use-now';
import { apiFetch } from '../../lib/api-client';
import { isApiError } from '../../lib/api-error';

/** FR-OWN-15: issue a one-time pairing code, list paired screens, revoke one. */
export function KitchenDevicesPanel() {
  const toast = useToast();
  const now = useNow();
  const [label, setLabel] = useState('Kitchen screen');
  const [code, setCode] = useState<PairingCodeResponse | null>(null);
  const [devices, setDevices] = useState<KitchenDeviceDto[]>([]);
  const [busy, setBusy] = useState(false);

  const loadDevices = useCallback(async () => {
    try {
      setDevices((await apiFetch('/api/kitchen/devices', { schema: DevicesResponse })).devices);
    } catch (e) {
      toast.show(isApiError(e) ? e.message : 'Could not load kitchen screens.', 'error');
    }
  }, [toast]);

  useEffect(() => {
    let cancelled = false;
    apiFetch('/api/kitchen/devices', { schema: DevicesResponse }).then(
      (res) => {
        if (!cancelled) setDevices(res.devices);
      },
      () => undefined, // the list simply stays empty; actions report their own errors
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const issue = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      setCode(
        await apiFetch('/api/kitchen/pairing-codes', {
          method: 'POST',
          body: { deviceLabel: label },
          schema: PairingCodeResponse,
        }),
      );
    } catch (e) {
      toast.show(isApiError(e) ? e.message : 'Could not create a code.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (device: KitchenDeviceDto) => {
    try {
      await apiFetch(`/api/kitchen/devices/${device.id}`, { method: 'DELETE', schema: OkResponse });
      toast.show(`"${device.deviceLabel}" disconnected`, 'success');
      await loadDevices();
    } catch (e) {
      toast.show(isApiError(e) ? e.message : 'Could not disconnect the screen.', 'error');
    }
  };

  const secondsLeft = code ? Math.max(0, Math.ceil((Date.parse(code.expiresAt) - now) / 1000)) : 0;

  return (
    <section aria-labelledby="devices-title" className="flex flex-col gap-4">
      <h3 id="devices-title" className="font-display text-xl font-bold tracking-wide uppercase">
        Kitchen screens
      </h3>
      <form onSubmit={(e) => void issue(e)} className="flex flex-col gap-2">
        <label className="flex flex-col gap-1 text-sm font-medium text-muted">
          Screen name
          <input
            className="h-11 rounded-md border border-border bg-bg px-3 text-white focus:border-gold focus:outline-none"
            maxLength={40}
            required
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </label>
        <Button type="submit" loading={busy}>
          Get pairing code
        </Button>
      </form>
      {code && secondsLeft > 0 ? (
        <div className="rounded-lg border border-gold/50 bg-bg p-4 text-center">
          <p className="text-sm text-muted">
            On the kitchen screen open <strong className="text-white">/kitchen/pair</strong> and
            enter:
          </p>
          <p className="tabular my-2 font-display text-5xl font-extrabold tracking-[0.2em] text-gold">
            {code.code}
          </p>
          <p className="text-xs text-muted">
            For “{code.deviceLabel}” · expires in {Math.floor(secondsLeft / 60)}:
            {String(secondsLeft % 60).padStart(2, '0')} · works once
          </p>
        </div>
      ) : null}
      <ul className="flex flex-col gap-2" aria-label="Paired kitchen screens">
        {devices.length === 0 ? (
          <li className="text-sm text-muted">No screens paired yet.</li>
        ) : null}
        {devices.map((device) => (
          <li
            key={device.id}
            className="flex items-center gap-3 rounded-md border border-border bg-bg p-3"
          >
            <div className="flex-1">
              <p className="font-semibold">{device.deviceLabel}</p>
              <p className="text-xs text-muted">
                Last seen {formatClock(new Date(device.lastSeenAt))}
              </p>
            </div>
            <Button
              variant="danger-ghost"
              size="md"
              icon={<MonitorX aria-hidden="true" className="size-4" />}
              onClick={() => void revoke(device)}
            >
              Disconnect
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
