import { useEffect } from 'react';

/** Hides the mouse cursor after `idleMs` without movement (FR-KIT-11). */
export function useIdleCursor(idleMs = 3_000): void {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const hide = () => document.body.classList.add('cursor-none');
    const wake = () => {
      document.body.classList.remove('cursor-none');
      clearTimeout(timer);
      timer = setTimeout(hide, idleMs);
    };
    wake();
    window.addEventListener('pointermove', wake);
    window.addEventListener('pointerdown', wake);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('pointermove', wake);
      window.removeEventListener('pointerdown', wake);
      document.body.classList.remove('cursor-none');
    };
  }, [idleMs]);
}
