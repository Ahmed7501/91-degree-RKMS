import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { ActiveOrdersResponse } from '@rkds/shared';
import { createTestApp } from '../helpers/app-harness';
import { closeOrder, createOwner, loginOwner, pairKitchen, postOrder } from '../helpers/factories';
import { truncateAll, withPgClient } from '../helpers/test-db';

const t = createTestApp();
afterAll(() => t.close());

let owner: string;
let kitchen: string;
beforeEach(async () => {
  await truncateAll();
  t.clock.set('2026-10-29T13:00:00.000Z');
  await createOwner(t.prisma);
  owner = await loginOwner(t.app);
  kitchen = await pairKitchen(t.app, owner);
});

describe('GET /api/orders/active', () => {
  it('lists only ACTIVE orders, oldest first, for both roles, with serverTime', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 4; i += 1) {
      t.clock.advance(60_000);
      ids.push(
        (await postOrder(t.app, owner, { text: `order ${i}`, source: 'PHONE' })).body.order.id,
      );
    }
    await closeOrder(t.app, owner, ids[1]!, 'complete');
    await closeOrder(t.app, owner, ids[2]!, 'cancel');

    for (const cookie of [owner, kitchen]) {
      const res = await request(t.app).get('/api/orders/active').set('Cookie', cookie);
      expect(res.status).toBe(200);
      const body = ActiveOrdersResponse.parse(res.body);
      expect(body.orders.map((o) => o.id)).toEqual([ids[0], ids[3]]);
      expect(body.serverTime).toBe('2026-10-29T13:04:00.000Z');
      expect(body.truncated).toBeUndefined();
    }
  });

  it('breaks createdAt ties by id', async () => {
    const a = await postOrder(t.app, owner);
    const b = await postOrder(t.app, owner); // same fixed clock instant
    const res = await request(t.app).get('/api/orders/active').set('Cookie', kitchen);
    const expected = [a.body.order.id, b.body.order.id].sort();
    expect(res.body.orders.map((o: { id: string }) => o.id)).toEqual(expected);
  });

  it('anonymous → 401', async () => {
    expect((await request(t.app).get('/api/orders/active')).status).toBe(401);
  });
});

describe('active list cap', () => {
  it('returns at most 500 orders, flags truncated and logs an error', async () => {
    const ownerId = (await t.prisma.user.findFirstOrThrow()).id;
    await withPgClient((c) =>
      c.query(
        `INSERT INTO orders (business_date, daily_number, idempotency_key, request_hash, text, source,
           prep_minutes, status, created_at, deadline_at, updated_at, created_by_user_id)
         SELECT '2026-10-29', n, gen_random_uuid(), 'h', 'x', 'PHONE', 20, 'ACTIVE',
           '2026-10-29T12:00:00Z'::timestamptz + n * interval '1 second',
           '2026-10-29T12:20:00Z'::timestamptz + n * interval '1 second',
           '2026-10-29T12:00:00Z', $1
         FROM generate_series(1, 501) AS n`,
        [ownerId],
      ),
    );
    const res = await request(t.app).get('/api/orders/active').set('Cookie', kitchen);
    expect(res.body.orders).toHaveLength(500);
    expect(res.body.truncated).toBe(true);
    expect(res.body.orders[0].orderNumber).toBe(1);
    expect(t.logs().some((l) => l.event === 'active_orders_truncated')).toBe(true);
  });
});
