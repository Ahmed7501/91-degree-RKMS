export type ClipboardResult =
  { ok: true; text: string } | { ok: false; reason: 'unsupported' | 'denied' };

/**
 * Reads the clipboard only when called from a click handler (FR-OWN-06). Never in the
 * background. Plain-HTTP origins, Firefox defaults and some iOS cases report `unsupported`
 * or `denied`; the composer then asks for Ctrl+V / long-press → Paste.
 */
export async function readClipboardText(
  clipboard: Pick<Clipboard, 'readText'> | undefined = globalThis.navigator?.clipboard,
): Promise<ClipboardResult> {
  if (!clipboard || typeof clipboard.readText !== 'function') {
    return { ok: false, reason: 'unsupported' };
  }
  try {
    return { ok: true, text: await clipboard.readText() };
  } catch {
    return { ok: false, reason: 'denied' };
  }
}
