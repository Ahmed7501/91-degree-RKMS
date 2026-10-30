import { beforeEach, describe, expect, it } from 'vitest';
import {
  ALERT_DURATION_MS,
  clampVolume,
  DEFAULT_ALERT_VOLUME,
  OrderAlert,
  type AlertResult,
} from './sound';
import { STORAGE_KEYS } from './storage';

interface Fake {
  Ctor: typeof AudioContext;
  oscillators: { frequency: number; type: string; start: number }[];
  masterGains: number[];
}

/** A fake AudioContext recording what the alert schedules. */
function fakeAudio(options: { resumeFails?: boolean; throwOnPlay?: boolean } = {}): Fake {
  const oscillators: Fake['oscillators'] = [];
  const masterGains: number[] = [];
  let gains = 0;
  class FakeContext {
    state = 'suspended';
    currentTime = 0;
    destination = {};
    resume() {
      if (options.resumeFails) return Promise.reject(new Error('NotAllowedError'));
      this.state = 'running';
      return Promise.resolve();
    }
    createOscillator() {
      if (options.throwOnPlay) throw new Error('audio device lost');
      const osc = { frequency: 0, type: '', start: 0 };
      oscillators.push(osc);
      return {
        set type(t: string) {
          osc.type = t;
        },
        frequency: {
          setValueAtTime(v: number) {
            osc.frequency = v;
          },
        },
        connect: (g: unknown) => g,
        start(t: number) {
          osc.start = t;
        },
        stop() {},
      };
    }
    createGain() {
      const first = gains === 0;
      gains += 1;
      return {
        gain: {
          setValueAtTime(v: number) {
            if (first) masterGains.push(v);
          },
          exponentialRampToValueAtTime() {},
        },
        connect: (d: unknown) => d,
      };
    }
  }
  return { Ctor: FakeContext as unknown as typeof AudioContext, oscillators, masterGains };
}

function setup(fake = fakeAudio()) {
  let now = 0;
  const timers: { run: () => void; at: number }[] = [];
  const alert = new OrderAlert(
    fake.Ctor,
    () => now,
    (run, ms) => timers.push({ run, at: now + ms }),
  );
  const advance = (ms: number) => {
    now += ms;
    for (const timer of timers.splice(0)) {
      if (timer.at <= now) timer.run();
      else timers.push(timer);
    }
  };
  return { alert, advance, timers, fake };
}

beforeEach(() => localStorage.clear());

describe('OrderAlert (REALTIME_FLOW §6, ADR-028)', () => {
  it('stays silent and reports "locked" until a user gesture unlocks audio', async () => {
    const { alert, fake } = setup();
    expect(alert.unlocked).toBe(false);
    expect(alert.notify('o1')).toBe('locked');
    expect(fake.oscillators).toHaveLength(0);
    expect(await alert.unlock()).toBe(true);
    expect(alert.unlocked).toBe(true);
  });

  it('a blocked unlock is reported, never claimed as enabled', async () => {
    const { alert } = setup(fakeAudio({ resumeFails: true }));
    expect(await alert.unlock()).toBe(false);
    expect(alert.unlocked).toBe(false);
    expect(alert.test()).toBe('locked');
  });

  it('plays one ~3.5 s alert per new order: seven bell notes over ~2.9 s plus their decay', async () => {
    const { alert, fake } = setup();
    await alert.unlock();
    expect(alert.notify('o1')).toBe('played');
    const fundamentals = fake.oscillators.filter((o) => o.type === 'sine');
    expect(fundamentals).toHaveLength(7);
    expect(Math.max(...fundamentals.map((o) => o.start))).toBeCloseTo(2.88, 2);
    expect(ALERT_DURATION_MS).toBeGreaterThanOrEqual(3_000);
    expect(ALERT_DURATION_MS).toBeLessThanOrEqual(4_000);
  });

  it('ignores duplicate events for the same order, even much later', async () => {
    const { alert, advance, fake } = setup();
    await alert.unlock();
    expect(alert.notify('o1')).toBe('played');
    advance(60_000);
    expect(alert.notify('o1')).toBe('duplicate');
    expect(fake.oscillators.filter((o) => o.type === 'sine')).toHaveLength(7);
  });

  it('orders arriving during an alert produce exactly one follow-up alert', async () => {
    const { alert, advance, fake } = setup();
    await alert.unlock();
    const results: AlertResult[] = ['o1', 'o2', 'o3', 'o4'].map((id) => alert.notify(id));
    expect(results).toEqual(['played', 'queued', 'queued', 'queued']);
    advance(ALERT_DURATION_MS);
    expect(fake.oscillators.filter((o) => o.type === 'sine')).toHaveLength(14);
    advance(ALERT_DURATION_MS * 3);
    expect(fake.oscillators.filter((o) => o.type === 'sine')).toHaveLength(14);
  });

  it('when disabled, new orders are remembered but silent; the setting is kept on the device', async () => {
    const { alert, fake } = setup();
    await alert.unlock();
    alert.setEnabled(false);
    expect(alert.notify('o1')).toBe('disabled');
    expect(fake.oscillators).toHaveLength(0);
    expect(localStorage.getItem(STORAGE_KEYS.soundEnabled)).toBe('false');
    expect(new OrderAlert(fake.Ctor).enabled).toBe(false);
    alert.setEnabled(true);
    expect(alert.notify('o1')).toBe('duplicate'); // re-enabling never replays an old order
  });

  it('volume is clamped to 10–100 %, remembered, and sets the master gain', async () => {
    const { alert, fake } = setup();
    await alert.unlock();
    alert.setVolume(5);
    expect(alert.volume).toBe(1);
    alert.setVolume(0);
    expect(alert.volume).toBe(0.1);
    alert.setVolume(0.5);
    expect(new OrderAlert(fake.Ctor).volume).toBe(0.5);
    alert.test();
    expect(fake.masterGains.at(-1)).toBeCloseTo(0.45);
  });

  it('clampVolume falls back to the default for garbage', () => {
    expect(clampVolume('loud')).toBe(DEFAULT_ALERT_VOLUME);
    expect(clampVolume(Number.NaN)).toBe(DEFAULT_ALERT_VOLUME);
    expect(clampVolume(0.333)).toBe(0.33);
  });

  it('Test sound plays even for a muted alert and ignores the duplicate memory', async () => {
    const { alert, fake } = setup();
    await alert.unlock();
    alert.setEnabled(false);
    expect(alert.test()).toBe('played');
    expect(fake.oscillators.length).toBeGreaterThan(0);
  });

  it('a playback failure is reported as "failed" and never throws', async () => {
    const { alert } = setup(fakeAudio({ throwOnPlay: true }));
    await alert.unlock();
    expect(() => alert.notify('o1')).not.toThrow();
    expect(alert.notify('o2')).toBe('failed');
  });

  it('without Web Audio: unsupported, no crash', async () => {
    const alert = new OrderAlert(undefined);
    expect(alert.supported).toBe(false);
    expect(await alert.unlock()).toBe(false);
    expect(alert.notify('o1')).toBe('unsupported');
  });
});
