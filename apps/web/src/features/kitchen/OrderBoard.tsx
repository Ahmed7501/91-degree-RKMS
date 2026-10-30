import { formatClock, type OrderDto } from '@rkds/shared';
import { ChevronDown } from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { isNew, type OrderStoreState } from '../../realtime/order-store';
import { KitchenOrderCard } from './KitchenOrderCard';

interface Props {
  orders: OrderDto[];
  store: OrderStoreState;
  now: number;
  loading: boolean;
}

/** Oldest first, left→right, top→bottom; scrolls when full, with an "N more below" hint (FR-KIT-04). */
export function OrderBoard({ orders, store, now, loading }: Props) {
  const grid = useRef<HTMLDivElement>(null);
  const [below, setBelow] = useState(0);

  useEffect(() => {
    const count = () => {
      const cards = grid.current?.querySelectorAll('article') ?? [];
      let hidden = 0;
      for (const card of cards)
        if (card.getBoundingClientRect().top >= window.innerHeight - 40) hidden += 1;
      setBelow(hidden);
    };
    count();
    window.addEventListener('scroll', count, { passive: true });
    window.addEventListener('resize', count);
    const timer = setInterval(count, 2_000);
    return () => {
      window.removeEventListener('scroll', count);
      window.removeEventListener('resize', count);
      clearInterval(timer);
    };
  }, [orders.length]);

  if (orders.length === 0) {
    return (
      <div className="grid min-h-[70dvh] place-items-center text-center">
        <div className="flex flex-col items-center gap-3">
          <p className="font-display text-[3rem] font-bold">
            {loading ? 'Loading orders…' : 'No active orders'}
          </p>
          <p className="tabular font-display text-[2rem] text-muted">
            {formatClock(new Date(now))}
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        ref={grid}
        className="grid items-start gap-4 p-4"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(19rem, 1fr))' }}
      >
        <AnimatePresence initial={false}>
          {orders.map((order) => (
            <KitchenOrderCard
              key={order.id}
              order={order}
              now={now}
              isNew={isNew(store, order.id, now)}
            />
          ))}
        </AnimatePresence>
      </div>
      {below > 0 ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 flex justify-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-gold px-4 py-2 font-bold text-bg shadow-2">
            <ChevronDown aria-hidden="true" className="size-5" />
            {below} more below
          </span>
        </div>
      ) : null}
    </>
  );
}
