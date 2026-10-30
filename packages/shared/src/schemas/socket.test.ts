import { describe, expect, it } from 'vitest';
import {
  OrderEventPayload,
  SOCKET_EVENTS,
  ServerHelloPayload,
  SessionRevokedPayload,
} from './socket';

const order = {
  id: '6b1f2a7e-0c1d-4e5f-8a9b-0c1d2e3f4a5b',
  orderNumber: 1,
  displayNumber: '001',
  businessDate: '2026-10-29',
  text: '1x Zinger',
  kind: 'TEXT',
  items: null,
  notes: null,
  source: 'FOODPANDA',
  prepMinutes: 20,
  status: 'COMPLETED',
  createdAt: '2026-10-29T13:00:00.000Z',
  deadlineAt: '2026-10-29T13:20:00.000Z',
  completedAt: '2026-10-29T13:18:00.000Z',
  cancelledAt: null,
  updatedAt: '2026-10-29T13:18:00.000Z',
  version: 2,
};
const serverTime = '2026-10-29T13:18:00.100Z';

describe('socket contract (REALTIME_FLOW §2)', () => {
  it('event names match the documented ones', () => {
    expect(Object.values(SOCKET_EVENTS).sort()).toEqual(
      ['order:created', 'order:updated', 'server:hello', 'session:revoked'].sort(),
    );
  });

  it('order event payload accepts a valid order', () => {
    expect(OrderEventPayload.safeParse({ order, serverTime }).success).toBe(true);
  });

  it.each([
    ['missing serverTime', { order }],
    ['missing order', { serverTime }],
    ['extra top-level field', { order, serverTime, requestId: 'x' }],
    ['extra order field', { order: { ...order, createdByUserId: 'x' }, serverTime }],
    ['bad timestamp', { order, serverTime: 'yesterday' }],
  ])('order event payload rejects %s', (_name, payload) => {
    expect(OrderEventPayload.safeParse(payload).success).toBe(false);
  });

  it('server:hello requires a known role', () => {
    expect(ServerHelloPayload.safeParse({ serverTime, role: 'KITCHEN' }).success).toBe(true);
    expect(ServerHelloPayload.safeParse({ serverTime, role: 'ADMIN' }).success).toBe(false);
  });

  it('session:revoked carries one of the documented reasons', () => {
    for (const reason of ['LOGOUT', 'REVOKED', 'EXPIRED']) {
      expect(SessionRevokedPayload.safeParse({ reason }).success).toBe(true);
    }
    expect(SessionRevokedPayload.safeParse({ reason: 'KICKED' }).success).toBe(false);
  });
});
