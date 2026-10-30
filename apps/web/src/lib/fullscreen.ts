export function isFullscreen(doc: Document = document): boolean {
  return doc.fullscreenElement !== null && doc.fullscreenElement !== undefined;
}

/** Toggles full-screen on the whole page (FR-KIT-01). Failures (no gesture, unsupported) are ignored. */
export async function toggleFullscreen(doc: Document = document): Promise<void> {
  try {
    if (isFullscreen(doc)) await doc.exitFullscreen();
    else await doc.documentElement.requestFullscreen({ navigationUI: 'hide' });
  } catch {
    // Not allowed here; the button simply does nothing.
  }
}
