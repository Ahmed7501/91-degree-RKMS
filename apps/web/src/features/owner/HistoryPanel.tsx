import {
  addDays,
  businessDateFor,
  DEFAULT_BUSINESS_DAY_CUTOFF_HOUR,
  DEFAULT_ORDER_RETENTION_DAYS,
  formatClock,
  HistoryResponse,
  type HistoryStatusFilter,
  type OrderDto,
} from '@rkds/shared';
import { useCallback, useEffect, useState } from 'react';
import { KitchenNotes } from '../../components/orders/KitchenNotes';
import { OrderText } from '../../components/orders/OrderText';
import { SourceBadge } from '../../components/orders/SourceBadge';
import { StatusBadge } from '../../components/orders/StatusBadge';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { apiFetch } from '../../lib/api-client';
import { isApiError } from '../../lib/api-error';
import { clockSync } from '../../lib/clock-sync';
import { cx } from '../../lib/cx';

const STATUSES: HistoryStatusFilter[] = ['ALL', 'ACTIVE', 'COMPLETED', 'CANCELLED'];

/** Today's business date back to the 7-day retention limit (FR-OWN-12/13, ADR-024). */
export function historyDates(now: number): string[] {
  const today = businessDateFor(new Date(now), DEFAULT_BUSINESS_DAY_CUTOFF_HOUR);
  return Array.from({ length: DEFAULT_ORDER_RETENTION_DAYS + 1 }, (_, i) => addDays(today, -i));
}

function dateLabel(date: string, index: number): string {
  if (index === 0) return `Today (${date})`;
  if (index === 1) return `Yesterday (${date})`;
  return date;
}

export function HistoryPanel({ refreshKey }: { refreshKey: number }) {
  const [dates] = useState(() => historyDates(clockSync.now()));
  const [date, setDate] = useState(dates[0]!);
  const [status, setStatus] = useState<HistoryStatusFilter>('ALL');
  const [number, setNumber] = useState('');
  const queryKey = `${date}|${status}|${number.trim()}|${refreshKey}`;
  // One page set per query; `loading` is derived (no setState inside the effect body).
  const [page, setPage] = useState<{
    key: string;
    orders: OrderDto[];
    cursor: string | null;
    error: string | null;
  } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchPage = useCallback(
    (after: string | null) => {
      const query = new URLSearchParams({ date, status, limit: '30' });
      if (/^\d+$/.test(number.trim())) query.set('number', String(Number(number.trim())));
      if (after) query.set('cursor', after);
      return apiFetch(`/api/orders?${query.toString()}`, { schema: HistoryResponse });
    },
    [date, status, number],
  );

  useEffect(() => {
    let cancelled = false;
    fetchPage(null).then(
      (res) => {
        if (!cancelled)
          setPage({ key: queryKey, orders: res.orders, cursor: res.nextCursor, error: null });
      },
      (e: unknown) => {
        if (!cancelled) {
          const error = isApiError(e) ? e.message : 'Could not load history.';
          setPage({ key: queryKey, orders: [], cursor: null, error });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [fetchPage, queryKey]);

  const loadMore = async (after: string) => {
    setLoadingMore(true);
    try {
      const res = await fetchPage(after);
      setPage((p) => p && { ...p, orders: [...p.orders, ...res.orders], cursor: res.nextCursor });
    } catch (e) {
      setPage((p) => p && { ...p, error: isApiError(e) ? e.message : 'Could not load history.' });
    } finally {
      setLoadingMore(false);
    }
  };

  const loading = page?.key !== queryKey;
  const orders = page?.orders ?? [];
  const cursor = page?.cursor ?? null;
  const error = page?.error ?? null;

  const fieldClass =
    'h-11 rounded-md border border-border bg-surface px-3 text-sm text-white focus:border-gold focus:outline-none';

  return (
    <section aria-label="Order history" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          Business day
          <select className={fieldClass} value={date} onChange={(e) => setDate(e.target.value)}>
            {dates.map((d, i) => (
              <option key={d} value={d}>
                {dateLabel(d, i)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          Status
          <select
            className={fieldClass}
            value={status}
            onChange={(e) => setStatus(e.target.value as HistoryStatusFilter)}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s === 'ALL' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          Order #
          <input
            className={cx(fieldClass, 'w-24')}
            inputMode="numeric"
            placeholder="e.g. 12"
            value={number}
            onChange={(e) => setNumber(e.target.value.replace(/[^\d]/g, ''))}
          />
        </label>
      </div>
      <p className="text-xs text-muted">Orders are kept for 7 days, then deleted automatically.</p>
      {error ? (
        <p role="alert" className="rounded-md bg-danger-bg p-3 text-sm text-danger">
          {error}
        </p>
      ) : null}
      {!loading && orders.length === 0 && !error ? <EmptyState title="No orders" /> : null}
      <ul className="flex flex-col gap-2">
        {orders.map((order) => (
          <li key={order.id} className="rounded-lg border border-border bg-surface p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cx(
                  'font-display text-xl font-bold',
                  order.status === 'CANCELLED' && 'text-muted line-through',
                )}
              >
                #{order.displayNumber}
              </span>
              <SourceBadge source={order.source} />
              <StatusBadge status={order.status} />
              <span className="tabular ml-auto text-sm text-muted">
                {formatClock(new Date(order.createdAt))}
              </span>
            </div>
            <OrderText text={order.text} className="mt-2 line-clamp-3 text-sm text-muted" />
            {order.notes ? <KitchenNotes notes={order.notes} variant="compact" /> : null}
          </li>
        ))}
      </ul>
      {cursor ? (
        <Button variant="secondary" loading={loadingMore} onClick={() => void loadMore(cursor)}>
          Load more
        </Button>
      ) : null}
    </section>
  );
}
