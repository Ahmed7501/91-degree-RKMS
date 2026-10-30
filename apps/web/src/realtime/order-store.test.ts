import type { OrderDto } from '@rkds/shared';
import { describe, expect, it } from 'vitest';
import {
  initialOrderState,
  isNew,
  NEW_HIGHLIGHT_MS,
  orderReducer,
  sortedActive,
  TOMBSTONE_TTL_MS,
  type OrderStoreAction,
  type OrderStoreState,
} from './order-store';

const T = 1_000_000;

function order(id: string, version = 1, overrides: Partial<OrderDto> = {}): OrderDto {
  return {
    id,
    orderNumber: 1,
    displayNumber: '001',
    businessDate: '2026-10-29',
    text: `order ${id}`,
    kind: 'TEXT',
    items: null,
    notes: null,
    source: 'PHONE',
    prepMinutes: 20,
    status: 'ACTIVE',
    createdAt: '2026-10-29T13:00:00.000Z',
    deadlineAt: '2026-10-29T13:20:00.000Z',
    completedAt: null,
    cancelledAt: null,
    updatedAt: '2026-10-29T13:00:00.000Z',
    version,
    ...overrides,
  };
}
const completed = (id: string, version = 2) =>
  order(id, version, { status: 'COMPLETED', completedAt: '2026-10-29T13:10:00.000Z' });

const run = (...actions: OrderStoreAction[]) =>
  actions.reduce<OrderStoreState>(orderReducer, initialOrderState);
const ids = (state: OrderStoreState) => sortedActive(state).map((o) => o.id);
const event = (o: OrderDto, highlight = false, now = T): OrderStoreAction => ({
  type: 'event',
  order: o,
  now,
  highlight,
});

describe('order store (REALTIME_FLOW §4)', () => {
  it('a snapshot replaces the active set (authoritative)', () => {
    const state = run(
      event(order('stale')),
      { type: 'syncStart' },
      { type: 'snapshot', orders: [order('a'), order('b')], now: T },
    );
    expect(ids(state)).toEqual(['a', 'b']);
    expect(state.syncing).toBe(false);
  });

  it('ignores non-active orders in a snapshot', () => {
    const state = run({ type: 'snapshot', orders: [order('a'), completed('b')], now: T });
    expect(ids(state)).toEqual(['a']);
  });

  it('buffers events during sync and applies them after the snapshot', () => {
    const state = run({ type: 'syncStart' }, event(order('late')), event(completed('a')), {
      type: 'snapshot',
      orders: [order('a')],
      now: T,
    });
    expect(ids(state)).toEqual(['late']);
    expect(state.buffer).toEqual([]);
  });

  it('ignores duplicates and stale versions', () => {
    const v2 = order('a', 2, { text: 'v2' });
    const state = run(event(v2), event(order('a', 1, { text: 'v1' })), event(v2));
    expect(sortedActive(state)[0]?.text).toBe('v2');
  });

  it('a terminal status removes the card and records a tombstone', () => {
    const state = run(event(order('a')), event(completed('a')));
    expect(ids(state)).toEqual([]);
    expect(state.tombstones.get('a')?.version).toBe(2);
  });

  it('a late order:created (v1) after order:updated (v2) does not bring back a ghost card', () => {
    const state = run(event(completed('a')), event(order('a', 1)));
    expect(ids(state)).toEqual([]);
  });

  it('a snapshot skips tombstoned orders but keeps a newer local version', () => {
    const state = run(
      event(completed('gone')),
      event(order('fresh', 3, { text: 'local v3' })),
      { type: 'syncStart' },
      {
        type: 'snapshot',
        orders: [order('gone', 1), order('fresh', 2, { text: 'server v2' })],
        now: T,
      },
    );
    expect(ids(state)).toEqual(['fresh']);
    expect(sortedActive(state)[0]?.text).toBe('local v3');
  });

  it('prunes tombstones after 24 h and NEW highlights after 8 s', () => {
    const state = run(event(order('new'), true, T), event(completed('old'), false, T));
    expect(isNew(state, 'new', T + 1_000)).toBe(true);
    const pruned = orderReducer(state, { type: 'prune', now: T + TOMBSTONE_TTL_MS });
    expect(pruned.tombstones.size).toBe(0);
    expect(pruned.arrivedAt.size).toBe(0);
    expect(isNew(state, 'new', T + NEW_HIGHLIGHT_MS)).toBe(false);
  });

  it('prune returns the same state when nothing expired', () => {
    const state = run(event(order('a'), true, T));
    expect(orderReducer(state, { type: 'prune', now: T + 1 })).toBe(state);
  });

  it('highlights only orders that arrive live, not updates or snapshot loads', () => {
    const state = run(
      { type: 'snapshot', orders: [order('snap')], now: T },
      event(order('live'), true),
      event(order('snap', 2), true),
    );
    expect(isNew(state, 'live', T)).toBe(true);
    expect(isNew(state, 'snap', T)).toBe(false);
  });

  it('drops the highlight when a highlighted order closes, and after a snapshot without it', () => {
    let state = run(event(order('a'), true), event(completed('a')));
    expect(state.arrivedAt.has('a')).toBe(false);
    state = run(
      event(order('b'), true),
      { type: 'syncStart' },
      { type: 'snapshot', orders: [], now: T },
    );
    expect(state.arrivedAt.has('b')).toBe(false);
  });

  it('sorts oldest first with an id tie-break', () => {
    const state = run(
      event(order('z', 1, { createdAt: '2026-10-29T13:00:00.000Z' })),
      event(order('b', 1, { createdAt: '2026-10-29T13:05:00.000Z' })),
      event(order('a', 1, { createdAt: '2026-10-29T13:00:00.000Z' })),
    );
    expect(ids(state)).toEqual(['a', 'z', 'b']);
  });

  it('reset returns the initial state', () => {
    expect(orderReducer(run(event(order('a'))), { type: 'reset' })).toBe(initialOrderState);
  });
});
