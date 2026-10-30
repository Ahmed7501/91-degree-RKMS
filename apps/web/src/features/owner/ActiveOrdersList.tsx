import { TransitionResponse, type OrderDto } from '@rkds/shared';
import { Check, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { KitchenNotes } from '../../components/orders/KitchenNotes';
import { OrderText } from '../../components/orders/OrderText';
import { SourceBadge } from '../../components/orders/SourceBadge';
import { TimerBadge } from '../../components/orders/TimerBadge';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { useToast } from '../../components/ui/Toast';
import { useNow } from '../../hooks/use-now';
import { apiFetch } from '../../lib/api-client';
import { isApiError } from '../../lib/api-error';
import { cx } from '../../lib/cx';

export const CONFIRM_WINDOW_MS = 3_000;

export type CloseAction = 'complete' | 'cancel';

const defaultClose = (id: string, action: CloseAction) =>
  apiFetch(`/api/orders/${id}/${action}`, { method: 'POST', body: {}, schema: TransitionResponse });

interface Props {
  orders: OrderDto[];
  loading: boolean;
  /** Applies the server's answer through the order store (same version check as sockets). */
  onClosed: (order: OrderDto) => void;
  close?: typeof defaultClose;
}

/** FR-OWN-10/14: two-step Complete (3 s window) and a Cancel dialog; removal only after the server confirms. */
export function ActiveOrdersList({ orders, loading, onClosed, close = defaultClose }: Props) {
  const toast = useToast();
  const now = useNow();
  const [armed, setArmed] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<OrderDto | null>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(null), CONFIRM_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [armed]);

  const run = async (order: OrderDto, action: CloseAction) => {
    setPending(order.id);
    try {
      const res = await close(order.id, action);
      onClosed(res.order);
      if (!res.alreadyApplied) {
        toast.show(
          `#${order.displayNumber} ${action === 'complete' ? 'completed' : 'cancelled'}`,
          'success',
        );
      }
    } catch (e) {
      toast.show(isApiError(e) ? e.message : 'Could not update the order.', 'error');
    } finally {
      setPending(null);
      setArmed(null);
    }
  };

  if (loading && orders.length === 0) {
    return (
      <ul aria-busy="true" aria-label="Loading orders" className="flex flex-col gap-2">
        {[0, 1, 2].map((i) => (
          <li
            key={i}
            className="h-20 animate-pulse rounded-lg bg-surface motion-reduce:animate-none"
          />
        ))}
      </ul>
    );
  }
  if (orders.length === 0) {
    return <EmptyState title="No active orders">New orders will appear here.</EmptyState>;
  }

  return (
    <>
      <ul className="flex flex-col gap-2" aria-label="Active orders">
        {orders.map((order) => {
          const isOpen = expanded.has(order.id);
          const isArmed = armed === order.id;
          const busy = pending === order.id;
          return (
            <li key={order.id} className="rounded-lg border border-border bg-surface p-3 shadow-1">
              <div className="flex items-center gap-3">
                <span className="font-display text-2xl font-bold">
                  <span className="text-muted">#</span>
                  {order.displayNumber}
                </span>
                <SourceBadge source={order.source} />
                <TimerBadge
                  deadlineAt={order.deadlineAt}
                  now={now}
                  variant="owner"
                  className="ml-auto"
                />
                <Button
                  variant="success"
                  size={isArmed ? 'md' : 'icon'}
                  aria-label={
                    isArmed
                      ? `Confirm complete order ${order.displayNumber}`
                      : `Complete order ${order.displayNumber}`
                  }
                  loading={busy}
                  onClick={() => (isArmed ? void run(order, 'complete') : setArmed(order.id))}
                  icon={busy ? undefined : <Check aria-hidden="true" className="size-5" />}
                >
                  {isArmed ? 'Tap again' : null}
                </Button>
                <Button
                  variant="danger-ghost"
                  size="icon"
                  aria-label={`Cancel order ${order.displayNumber}`}
                  disabled={busy}
                  onClick={() => setCancelling(order)}
                  icon={<X aria-hidden="true" className="size-5" />}
                />
              </div>
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() =>
                  setExpanded((current) => {
                    const next = new Set(current);
                    if (next.has(order.id)) next.delete(order.id);
                    else next.add(order.id);
                    return next;
                  })
                }
                className="mt-2 w-full text-left text-sm text-muted hover:text-white"
              >
                <OrderText text={order.text} className={cx(!isOpen && 'line-clamp-2')} />
              </button>
              {order.notes ? <KitchenNotes notes={order.notes} variant="compact" /> : null}
            </li>
          );
        })}
      </ul>
      <Dialog
        open={cancelling !== null}
        title={`Cancel order #${cancelling?.displayNumber ?? ''}?`}
        onClose={() => setCancelling(null)}
        actions={
          <>
            <Button variant="secondary" autoFocus onClick={() => setCancelling(null)}>
              Keep order
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                const order = cancelling;
                setCancelling(null);
                if (order) void run(order, 'cancel');
              }}
            >
              Cancel order
            </Button>
          </>
        }
      >
        The kitchen screen will remove it. It stays in history as cancelled.
      </Dialog>
    </>
  );
}
