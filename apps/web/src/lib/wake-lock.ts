interface WakeLockSentinelLike {
  released: boolean;
  release(): Promise<void>;
}

interface WakeLockApi {
  request(type: 'screen'): Promise<WakeLockSentinelLike>;
}

/**
 * Keeps the kitchen screen awake (FR-KIT-09) and re-acquires the lock when the page becomes
 * visible again (browsers drop it when hidden). Unsupported or refused: does nothing, never throws.
 * Returns a cleanup function.
 */
export function keepScreenAwake(
  wakeLock: WakeLockApi | undefined = (navigator as Navigator & { wakeLock?: WakeLockApi })
    .wakeLock,
  doc: Document = document,
): () => void {
  if (!wakeLock) return () => undefined;
  let sentinel: WakeLockSentinelLike | null = null;
  let stopped = false;

  const acquire = async () => {
    if (stopped || doc.visibilityState !== 'visible') return;
    if (sentinel && !sentinel.released) return;
    try {
      sentinel = await wakeLock.request('screen');
    } catch {
      sentinel = null; // e.g. battery saver or a non-secure context
    }
  };
  const onVisibility = () => void acquire();

  void acquire();
  doc.addEventListener('visibilitychange', onVisibility);
  return () => {
    stopped = true;
    doc.removeEventListener('visibilitychange', onVisibility);
    void sentinel?.release().catch(() => undefined);
  };
}
