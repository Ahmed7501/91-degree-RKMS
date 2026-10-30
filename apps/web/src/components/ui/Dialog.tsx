import { useEffect, useRef, type ReactNode } from 'react';

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Buttons. The first focusable element gets focus, so the safe choice goes first. */
  actions: ReactNode;
}

/** Native modal <dialog>: focus trap, Esc to close and a backdrop for free. */
export function Dialog({ open, title, onClose, children, actions }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal?.();
    if (!open && dialog.open) dialog.close?.();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className="m-auto w-[min(92vw,26rem)] rounded-xl border border-border bg-surface p-0 text-white shadow-2 backdrop:bg-black/70"
    >
      {open ? (
        <div className="flex flex-col gap-4 p-6">
          <h2 id="dialog-title" className="font-display text-2xl font-bold">
            {title}
          </h2>
          <div className="text-muted">{children}</div>
          <div className="flex flex-wrap justify-end gap-2">{actions}</div>
        </div>
      ) : null}
    </dialog>
  );
}
