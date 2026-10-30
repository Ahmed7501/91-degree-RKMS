import {
  businessDateFor,
  computeTimerState,
  DEFAULT_BUSINESS_DAY_CUTOFF_HOUR,
  formatClock,
  type OrderDto,
} from '@rkds/shared';
import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { KitchenNotes } from '../../components/orders/KitchenNotes';
import { OrderItems } from '../../components/orders/OrderItems';
import { OrderText } from '../../components/orders/OrderText';
import { SourceBadge } from '../../components/orders/SourceBadge';
import { TimerBadge } from '../../components/orders/TimerBadge';
import { cx } from '../../lib/cx';

const BAR: Record<string, string> = {
  normal: 'bg-border-strong',
  warning: 'bg-warning',
  overdue: 'bg-danger',
};

/** "Yesterday" / a date when the card belongs to an earlier business day (FR-KIT-10). */
export function dayBadge(order: OrderDto, now: number): string | null {
  const today = businessDateFor(new Date(now), DEFAULT_BUSINESS_DAY_CUTOFF_HOUR);
  if (order.businessDate === today) return null;
  const yesterday = businessDateFor(new Date(now - 86_400_000), DEFAULT_BUSINESS_DAY_CUTOFF_HOUR);
  return order.businessDate === yesterday ? 'Yesterday' : order.businessDate;
}

interface Props {
  order: OrderDto;
  now: number;
  isNew: boolean;
}

/**
 * DESIGN_SYSTEM §5 "Order card (kitchen)": number, timer, the full order (pasted text, or menu
 * lines for a menu order; never truncated), kitchen notes when present (ADR-027), source.
 */
export function KitchenOrderCard({ order, now, isNew }: Props) {
  const reduce = useReducedMotion();
  const phase = computeTimerState(Date.parse(order.deadlineAt), now).phase;
  const previous = useRef(phase);
  const [pulse, setPulse] = useState(false);

  // One attention pulse when the card *enters* overdue; then static red (no blinking).
  useEffect(() => {
    if (phase === 'overdue' && previous.current !== 'overdue' && !reduce) {
      setPulse(true);
      const timer = setTimeout(() => setPulse(false), 600);
      previous.current = phase;
      return () => clearTimeout(timer);
    }
    previous.current = phase;
    return undefined;
  }, [phase, reduce]);

  const badge = dayBadge(order, now);
  return (
    <motion.article
      layout={reduce ? false : 'position'}
      initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={
        reduce
          ? { opacity: 0, transition: { duration: 0.12 } }
          : { opacity: 0, scale: 0.96, transition: { duration: 0.2, ease: [0.4, 0, 1, 1] } }
      }
      transition={{ duration: reduce ? 0.12 : 0.32, ease: [0.22, 1, 0.36, 1] }}
      aria-label={`Order ${order.displayNumber}`}
      data-phase={phase}
      className={cx(
        'relative flex flex-col gap-3 overflow-hidden rounded-lg border border-border bg-surface p-4 pl-6 shadow-1 transition-shadow duration-[8000ms]',
        phase === 'warning' && 'bg-warning-bg/40',
        phase === 'overdue' && 'bg-danger-bg',
        isNew && 'shadow-glow-new duration-200',
      )}
    >
      <span
        aria-hidden="true"
        className={cx('absolute inset-y-0 left-0 w-1.5', BAR[phase], pulse && 'animate-pulse')}
      />
      <header className="flex items-start justify-between gap-3">
        <h2 className="font-display text-[2.75rem] leading-none font-extrabold">
          <span className="text-muted">#</span>
          {order.displayNumber}
        </h2>
        <TimerBadge deadlineAt={order.deadlineAt} now={now} variant="kitchen" />
      </header>
      <div className="flex flex-wrap items-center gap-2">
        <SourceBadge source={order.source} className="text-[0.8rem]" />
        {phase === 'overdue' ? (
          <span className="rounded-sm bg-danger px-2 py-0.5 text-[0.8rem] font-extrabold tracking-wider text-white">
            OVERDUE
          </span>
        ) : null}
        {badge ? (
          <span className="rounded-sm bg-gold px-2 py-0.5 text-[0.8rem] font-bold text-bg">
            {badge}
          </span>
        ) : null}
        {isNew ? (
          <span className="rounded-sm border border-gold px-2 py-0.5 text-[0.8rem] font-bold text-gold">
            NEW
          </span>
        ) : null}
      </div>
      {order.kind === 'MENU' && order.items ? (
        <OrderItems items={order.items} className="text-[1.3rem] leading-[1.35]" />
      ) : (
        <OrderText text={order.text} className="text-[1.3rem] leading-[1.45] font-medium" />
      )}
      {order.notes ? <KitchenNotes notes={order.notes} /> : null}
      <footer className="tabular text-[0.95rem] font-medium text-muted">
        Received {formatClock(new Date(order.createdAt))} · {order.prepMinutes} min
      </footer>
    </motion.article>
  );
}
