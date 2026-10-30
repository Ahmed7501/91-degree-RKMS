import type { ActiveOrdersResponse, OrderDto } from '@rkds/shared';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../lib/api-error';
import type { RkdsSocket } from './socket';
import { pillState, useOrderSync, type OrderSyncOptions } from './use-order-sync';

type Handler = (payload?: unknown) => void;

class FakeSocket {
  connected = false;
  active = true;
  connectCalls = 0;
  connect() {
    this.connectCalls += 1;
    return this;
  }
  handlers = new Map<string, Handler[]>();
  closed = false;
  on(event: string, handler: Handler) {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
    return this;
  }
  fire(event: string, payload?: unknown) {
    if (event === 'connect') this.connected = true;
    if (event === 'disconnect') this.connected = false;
    for (const handler of this.handlers.get(event) ?? []) handler(payload);
  }
  removeAllListeners() {
    this.handlers.clear();
    return this;
  }
  close() {
    this.closed = true;
    return this;
  }
}

/** Socket payloads are schema-validated, so ids must be real UUIDs. */
const uuid = (name: string) =>
  `00000000-0000-4000-8000-${name.padStart(12, '0').replace(/[^0-9a-f]/g, 'a')}`;

function order(name: string, version = 1, status: OrderDto['status'] = 'ACTIVE'): OrderDto {
  const id = uuid(name);
  return {
    id,
    orderNumber: 1,
    displayNumber: '001',
    businessDate: '2026-10-29',
    text: id,
    kind: 'TEXT',
    items: null,
    notes: null,
    source: 'PHONE',
    prepMinutes: 20,
    status,
    createdAt: '2026-10-29T13:00:00.000Z',
    deadlineAt: '2026-10-29T13:20:00.000Z',
    completedAt: status === 'COMPLETED' ? '2026-10-29T13:10:00.000Z' : null,
    cancelledAt: null,
    updatedAt: '2026-10-29T13:00:00.000Z',
    version,
  };
}
const SERVER_TIME = '2026-10-29T13:00:00.000Z';
const snapshot = (...orders: OrderDto[]): ActiveOrdersResponse => ({
  orders,
  serverTime: SERVER_TIME,
});

function setup(
  fetchActive: OrderSyncOptions['fetchActive'],
  extra: Partial<OrderSyncOptions> = {},
) {
  const socket = new FakeSocket();
  const onNewOrder = vi.fn();
  const onUnauthenticated = vi.fn();
  const hook = renderHook(() =>
    useOrderSync({
      createSocket: () => socket as unknown as RkdsSocket,
      fetchActive,
      onNewOrder,
      onUnauthenticated,
      now: () => 1_000,
      ...extra,
    }),
  );
  return { hook, socket, onNewOrder, onUnauthenticated };
}

describe('useOrderSync (REALTIME_FLOW §3–4)', () => {
  it('connect → syncing → live with the snapshot', async () => {
    const { hook, socket } = setup(() => Promise.resolve(snapshot(order('a'))));
    expect(hook.result.current.connection).toBe('connecting');
    act(() => socket.fire('connect'));
    await waitFor(() => expect(hook.result.current.connection).toBe('live'));
    expect(hook.result.current.orders.map((o) => o.id)).toEqual([uuid('a')]);
  });

  it('events that arrive during the snapshot fetch are buffered, then applied', async () => {
    let resolve: (value: ActiveOrdersResponse) => void = () => undefined;
    const { hook, socket } = setup(() => new Promise((r) => (resolve = r)));
    act(() => socket.fire('connect'));
    act(() => socket.fire('order:created', { order: order('b'), serverTime: SERVER_TIME }));
    expect(hook.result.current.orders).toEqual([]);
    await act(async () => {
      resolve(snapshot(order('a')));
      await Promise.resolve();
    });
    expect(hook.result.current.orders.map((o) => o.id)).toEqual([uuid('a'), uuid('b')]);
  });

  it('live order:created triggers the new-order callback; snapshot loads do not', async () => {
    const { hook, socket, onNewOrder } = setup(() => Promise.resolve(snapshot(order('a'))));
    act(() => socket.fire('connect'));
    await waitFor(() => expect(hook.result.current.connection).toBe('live'));
    expect(onNewOrder).not.toHaveBeenCalled();
    act(() => socket.fire('order:created', { order: order('b'), serverTime: SERVER_TIME }));
    expect(onNewOrder).toHaveBeenCalledTimes(1);
    act(() =>
      socket.fire('order:updated', { order: order('b', 2, 'COMPLETED'), serverTime: SERVER_TIME }),
    );
    expect(hook.result.current.orders.map((o) => o.id)).toEqual([uuid('a')]);
  });

  it('ignores malformed socket payloads', async () => {
    const { hook, socket } = setup(() => Promise.resolve(snapshot()));
    act(() => socket.fire('connect'));
    await waitFor(() => expect(hook.result.current.connection).toBe('live'));
    act(() => socket.fire('order:created', { order: { id: 'x' } }));
    expect(hook.result.current.orders).toEqual([]);
  });

  it('connect_error UNAUTHENTICATED → unauthenticated and the redirect callback', () => {
    const { hook, socket, onUnauthenticated } = setup(() => Promise.resolve(snapshot()));
    act(() => socket.fire('connect_error', new Error('UNAUTHENTICATED')));
    expect(hook.result.current.connection).toBe('unauthenticated');
    expect(onUnauthenticated).toHaveBeenCalled();
    expect(socket.closed).toBe(true);
  });

  it('session:revoked → unauthenticated', async () => {
    const { hook, socket, onUnauthenticated } = setup(() => Promise.resolve(snapshot()));
    act(() => socket.fire('connect'));
    await waitFor(() => expect(hook.result.current.connection).toBe('live'));
    act(() => socket.fire('session:revoked', { reason: 'REVOKED' }));
    expect(hook.result.current.connection).toBe('unauthenticated');
    expect(onUnauthenticated).toHaveBeenCalled();
  });

  it('a 401 on the snapshot → unauthenticated', async () => {
    const { hook, socket } = setup(() => Promise.reject(new ApiError('SESSION_EXPIRED', 'x', 401)));
    act(() => socket.fire('connect'));
    await waitFor(() => expect(hook.result.current.connection).toBe('unauthenticated'));
  });

  it('a disconnect keeps the last known cards and reports reconnecting', async () => {
    const { hook, socket } = setup(() => Promise.resolve(snapshot(order('a'))));
    act(() => socket.fire('connect'));
    await waitFor(() => expect(hook.result.current.connection).toBe('live'));
    act(() => socket.fire('disconnect'));
    expect(hook.result.current.connection).toBe('reconnecting');
    expect(hook.result.current.disconnectedAt).toBe(1_000);
    expect(hook.result.current.orders.map((o) => o.id)).toEqual([uuid('a')]);
  });

  it('resyncs when the screen becomes visible again', async () => {
    const fetchActive = vi.fn(() => Promise.resolve(snapshot()));
    const { socket } = setup(fetchActive);
    act(() => socket.fire('connect'));
    await waitFor(() => expect(fetchActive).toHaveBeenCalledTimes(1));
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitFor(() => expect(fetchActive).toHaveBeenCalledTimes(2));
  });

  it('apply() puts owner-side results through the same version check', async () => {
    const { hook, socket } = setup(() => Promise.resolve(snapshot(order('a'))));
    act(() => socket.fire('connect'));
    await waitFor(() => expect(hook.result.current.connection).toBe('live'));
    act(() => hook.result.current.apply(order('a', 2, 'COMPLETED')));
    act(() =>
      socket.fire('order:updated', { order: order('a', 2, 'COMPLETED'), serverTime: SERVER_TIME }),
    );
    expect(hook.result.current.orders).toEqual([]);
  });
});

describe('manual reconnect', () => {
  it('retries by itself after a server-side handshake rejection that stops Socket.IO', () => {
    vi.useFakeTimers();
    try {
      const { hook, socket } = setup(() => Promise.resolve(snapshot()));
      socket.active = false;
      act(() => socket.fire('connect_error', new Error('SERVICE_UNAVAILABLE')));
      expect(hook.result.current.connection).toBe('reconnecting');
      act(() => {
        vi.advanceTimersByTime(1_000);
      });
      expect(socket.connectCalls).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('leaves reconnection to Socket.IO while it is still active', () => {
    vi.useFakeTimers();
    try {
      const { socket } = setup(() => Promise.resolve(snapshot()));
      act(() => socket.fire('connect_error', new Error('xhr poll error')));
      act(() => {
        vi.advanceTimersByTime(5_000);
      });
      expect(socket.connectCalls).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('pillState', () => {
  it('waits 2 s before "Reconnecting" and shows "Offline" after 30 s or when the browser is offline', () => {
    expect(pillState('live', null, 0, true)).toBe('live');
    expect(pillState('reconnecting', 0, 1_999, true)).toBe('live');
    expect(pillState('reconnecting', 0, 2_000, true)).toBe('reconnecting');
    expect(pillState('reconnecting', 0, 30_000, true)).toBe('offline');
    expect(pillState('live', null, 0, false)).toBe('offline');
    expect(pillState('syncing', null, 0, true)).toBe('connecting');
  });
});
