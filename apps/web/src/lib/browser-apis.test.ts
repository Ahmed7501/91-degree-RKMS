import { afterEach, describe, expect, it, vi } from 'vitest';
import { readClipboardText } from './clipboard';
import { keepScreenAwake } from './wake-lock';

describe('clipboard (FR-OWN-06)', () => {
  it('returns the text on success', async () => {
    expect(await readClipboardText({ readText: () => Promise.resolve('2x Tikka') })).toEqual({
      ok: true,
      text: '2x Tikka',
    });
  });

  it('reports denied when the browser refuses', async () => {
    expect(
      await readClipboardText({ readText: () => Promise.reject(new Error('NotAllowed')) }),
    ).toEqual({
      ok: false,
      reason: 'denied',
    });
  });

  it('reports unsupported without the API', async () => {
    expect(await readClipboardText(undefined)).toEqual({ ok: false, reason: 'unsupported' });
  });
});

describe('wake lock (FR-KIT-09)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('acquires while visible and re-acquires after the page becomes visible again', async () => {
    const sentinel = { released: false, release: vi.fn(() => Promise.resolve()) };
    const request = vi.fn(() => Promise.resolve(sentinel));
    const stop = keepScreenAwake({ request }, document);
    await Promise.resolve();
    expect(request).toHaveBeenCalledTimes(1);
    sentinel.released = true; // the browser released it while hidden
    document.dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve();
    expect(request).toHaveBeenCalledTimes(2);
    stop();
    expect(sentinel.release).toHaveBeenCalled();
  });

  it('does nothing and never throws when unsupported or refused', async () => {
    expect(() => keepScreenAwake(undefined, document)()).not.toThrow();
    const stop = keepScreenAwake({ request: () => Promise.reject(new Error('denied')) }, document);
    await Promise.resolve();
    expect(() => stop()).not.toThrow();
  });
});
