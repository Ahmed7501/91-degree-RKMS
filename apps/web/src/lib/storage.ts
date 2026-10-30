/**
 * localStorage that never throws (private mode, quota, disabled storage). Values are JSON.
 * Used for per-device preferences and the owner's unsent draft (FR-OWN-16).
 */
export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable: the app keeps working without persistence.
  }
}

export function removeKey(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore.
  }
}

export const STORAGE_KEYS = {
  draft: 'rkds.owner.draft',
  lastSource: 'rkds.owner.lastSource',
  composerMode: 'rkds.owner.composerMode',
  soundEnabled: 'rkds.kitchen.sound',
  soundVolume: 'rkds.kitchen.soundVolume',
  density: 'rkds.kitchen.density',
} as const;
