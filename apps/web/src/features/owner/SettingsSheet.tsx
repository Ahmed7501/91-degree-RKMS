import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Button } from '../../components/ui/Button';
import { KitchenDevicesPanel } from './KitchenDevicesPanel';

/** Right-side sheet (DESIGN_SYSTEM §4) built on a modal <dialog>: Esc closes, focus is trapped. */
export function SettingsSheet({
  open,
  onClose,
  username,
}: {
  open: boolean;
  onClose: () => void;
  username: string;
}) {
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
      aria-label="Settings"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className="ml-auto mr-0 h-dvh max-h-dvh w-[min(100vw,26rem)] max-w-none border-l border-border bg-surface p-0 text-white backdrop:bg-black/60"
    >
      {open ? (
        <div className="flex h-full flex-col gap-6 overflow-y-auto p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-2xl font-bold">Settings</h2>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Close settings"
              onClick={onClose}
              icon={<X aria-hidden="true" className="size-5" />}
            />
          </div>
          <p className="text-sm text-muted">
            Signed in as <strong className="text-white">{username}</strong>. Passwords are changed
            on the server with the owner CLI.
          </p>
          <KitchenDevicesPanel />
        </div>
      ) : null}
    </dialog>
  );
}
