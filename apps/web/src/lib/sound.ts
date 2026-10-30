import { readJson, STORAGE_KEYS, writeJson } from './storage';

/** One alert lasts about 3.5 s (ADR-028): three rising "ding-dong" pairs and a short tail. */
export const ALERT_DURATION_MS = 3_600;
export const DEFAULT_ALERT_VOLUME = 0.8;
export const MIN_ALERT_VOLUME = 0.1;
export const MAX_ALERT_VOLUME = 1;
/** How many order ids are remembered to suppress duplicate alerts. */
const REMEMBERED_ORDERS = 300;

/** [start offset s, frequency Hz]: B5 → E6 pairs, then a G6 lift on the last pair. */
const NOTES: readonly (readonly [number, number])[] = [
  [0, 988],
  [0.28, 1319],
  [1.15, 988],
  [1.43, 1319],
  [2.3, 988],
  [2.58, 1319],
  [2.86, 1568],
];
const NOTE_DECAY_S = 0.62;

export type AlertResult =
  'played' | 'queued' | 'duplicate' | 'disabled' | 'locked' | 'unsupported' | 'failed';

export function clampVolume(value: unknown): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : DEFAULT_ALERT_VOLUME;
  return Math.min(MAX_ALERT_VOLUME, Math.max(MIN_ALERT_VOLUME, Math.round(n * 100) / 100));
}

type AudioContextCtor = typeof AudioContext;
type Schedule = (run: () => void, ms: number) => unknown;

/**
 * The kitchen's new-order alert (REALTIME_FLOW §6, ADR-028). Web Audio synthesis: no audio files,
 * nothing to license. Browsers allow sound only after a user gesture, so the kitchen shows
 * "Tap to enable sound" until `unlock()` succeeds; this class never claims to be audible before.
 *
 * - One alert per order id: duplicate socket events and re-deliveries are ignored.
 * - Orders that arrive while an alert is playing produce exactly one follow-up alert.
 * - Volume and on/off are remembered on the device. Audio errors never throw to the caller.
 */
export class OrderAlert {
  private context: AudioContext | null = null;
  private readonly seen = new Set<string>();
  private readonly seenOrder: string[] = [];
  private playingUntil = -Infinity;
  private followUpQueued = false;
  enabled: boolean;
  volume: number;

  constructor(
    private readonly Ctor: AudioContextCtor | undefined = globalThis.AudioContext,
    private readonly now: () => number = () => Date.now(),
    private readonly schedule: Schedule = (run, ms) => setTimeout(run, ms),
  ) {
    this.enabled = readJson<boolean>(STORAGE_KEYS.soundEnabled, true) !== false;
    this.volume = clampVolume(readJson<unknown>(STORAGE_KEYS.soundVolume, DEFAULT_ALERT_VOLUME));
  }

  get supported(): boolean {
    return this.Ctor !== undefined;
  }

  /** True once the audio context runs (after a user gesture). */
  get unlocked(): boolean {
    return this.context?.state === 'running';
  }

  async unlock(): Promise<boolean> {
    if (!this.Ctor) return false;
    try {
      this.context ??= new this.Ctor();
      if (this.context.state !== 'running') await this.context.resume();
    } catch {
      return false;
    }
    return this.context.state === 'running';
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    writeJson(STORAGE_KEYS.soundEnabled, enabled);
  }

  setVolume(volume: number): void {
    this.volume = clampVolume(volume);
    writeJson(STORAGE_KEYS.soundVolume, this.volume);
  }

  /** A genuinely new order arrived live. Call it for every `order:created`; repeats are ignored. */
  notify(orderId: string): AlertResult {
    if (this.seen.has(orderId)) return 'duplicate';
    this.remember(orderId);
    if (!this.supported) return 'unsupported';
    if (!this.enabled) return 'disabled';
    if (!this.unlocked) return 'locked';
    const remaining = this.playingUntil - this.now();
    if (remaining > 0) {
      if (!this.followUpQueued) {
        this.followUpQueued = true;
        this.schedule(() => {
          this.followUpQueued = false;
          if (this.enabled && this.unlocked) this.play();
        }, remaining);
      }
      return 'queued';
    }
    return this.play();
  }

  /** "Test sound" in the settings: plays the alert once at the current volume. */
  test(): AlertResult {
    if (!this.supported) return 'unsupported';
    if (!this.unlocked) return 'locked';
    return this.play();
  }

  private remember(orderId: string): void {
    this.seen.add(orderId);
    this.seenOrder.push(orderId);
    if (this.seenOrder.length > REMEMBERED_ORDERS) this.seen.delete(this.seenOrder.shift()!);
  }

  private play(): AlertResult {
    const ctx = this.context;
    if (!ctx) return 'locked';
    try {
      const start = ctx.currentTime + 0.02;
      const master = ctx.createGain();
      master.gain.setValueAtTime(this.volume * 0.9, start);
      // A compressor (where available) keeps overlapping notes loud but free of clipping.
      const compressor = ctx.createDynamicsCompressor?.();
      if (compressor) {
        compressor.threshold.setValueAtTime(-14, start);
        compressor.ratio.setValueAtTime(4, start);
        master.connect(compressor).connect(ctx.destination);
      } else {
        master.connect(ctx.destination);
      }
      for (const [offset, frequency] of NOTES) {
        const t = start + offset;
        // A sine fundamental plus a quieter octave gives a bright bell, never a harsh buzz.
        for (const [multiple, peak, type] of [
          [1, 0.5, 'sine'],
          [2, 0.14, 'triangle'],
        ] as const) {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = type;
          osc.frequency.setValueAtTime(frequency * multiple, t);
          gain.gain.setValueAtTime(0.0001, t);
          gain.gain.exponentialRampToValueAtTime(peak, t + 0.012);
          gain.gain.exponentialRampToValueAtTime(0.0001, t + NOTE_DECAY_S);
          osc.connect(gain).connect(master);
          osc.start(t);
          osc.stop(t + NOTE_DECAY_S + 0.05);
        }
      }
    } catch {
      return 'failed';
    }
    this.playingUntil = this.now() + ALERT_DURATION_MS;
    return 'played';
  }
}
