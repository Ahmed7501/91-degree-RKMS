import { AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { createContext, use, useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { cx } from '../../lib/cx';

type Tone = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  tone: Tone;
  message: string;
  action?: { label: string; onClick: () => void } | undefined;
}

export interface ToastApi {
  show: (message: string, tone?: Tone, action?: ToastItem['action'], durationMs?: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);
export const TOAST_DURATION_MS = 5_000;

/** Bottom-centre on phones, bottom-right on desktop; polite live region (DESIGN_SYSTEM §5). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((t) => t.id !== id));
  }, []);

  const show = useCallback<ToastApi['show']>(
    (message, tone = 'info', action, durationMs = TOAST_DURATION_MS) => {
      const id = nextId.current++;
      setItems((current) => [...current.slice(-2), { id, tone, message, action }]);
      setTimeout(() => dismiss(id), durationMs);
    },
    [dismiss],
  );

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext value={api}>
      {children}
      <div
        aria-live="polite"
        className="safe-bottom pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:items-end"
      >
        {items.map((item) => (
          <div
            key={item.id}
            role={item.tone === 'error' ? 'alert' : 'status'}
            className={cx(
              'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border p-3 text-sm shadow-2',
              item.tone === 'success' && 'border-success/40 bg-success-bg',
              item.tone === 'error' && 'border-danger/40 bg-danger-bg',
              item.tone === 'info' && 'border-border bg-surface',
            )}
          >
            {item.tone === 'success' ? (
              <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
            ) : null}
            {item.tone === 'error' ? (
              <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-danger" />
            ) : null}
            <span className="flex-1">{item.message}</span>
            {item.action ? (
              <button
                type="button"
                className="font-semibold text-gold underline-offset-2 hover:underline"
                onClick={() => {
                  item.action?.onClick();
                  dismiss(item.id);
                }}
              >
                {item.action.label}
              </button>
            ) : null}
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => dismiss(item.id)}
              className="text-muted hover:text-white"
            >
              <X aria-hidden="true" className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext>
  );
}

export function useToast(): ToastApi {
  const api = use(ToastContext);
  if (!api) throw new Error('useToast must be used inside <ToastProvider>');
  return api;
}
