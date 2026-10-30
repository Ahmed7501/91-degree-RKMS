import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from '../helpers/app-harness';
import { closeOrder, createOwner, loginOwner, postOrder } from '../helpers/factories';
import { truncateAll } from '../helpers/test-db';

const t = createTestApp();
afterAll(() => t.close());

let owner: string;
let orderId: string;
const published: string[] = [];
t.services.orderEvents.subscribe((kind, order) => published.push(`${kind}:${order.status}`));

beforeEach(async () => {
  await truncateAll();
  t.clock.set('2026-10-29T13:00:00.000Z');
  await createOwner(t.prisma);
  owner = await loginOwner(t.app);
  orderId = (await postOrder(t.app, owner)).body.order.id;
  published.length = 0;
  t.clock.set('2026-10-29T13:18:00.000Z');
});

describe('complete / cancel (FR-ORD-04/05, CLAUDE.md rule 4)', () => {
  it.each([
    ['complete', 'COMPLETED', 'completedAt'],
    ['cancel', 'CANCELLED', 'cancelledAt'],
  ] as const)(
    '%s persists status, timestamp, closer, version+1 and an audit event',
    async (action, status, field) => {
      const res = await closeOrder(t.app, owner, orderId, action);
      expect(res.status).toBe(200);
      expect(res.body.alreadyApplied).toBe(false);
      expect(res.body.order).toMatchObject({
        id: orderId,
        status,
        [field]: '2026-10-29T13:18:00.000Z',
        updatedAt: '2026-10-29T13:18:00.000Z',
        version: 2,
      });
      const row = await t.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
      const ownerRow = await t.prisma.user.findFirstOrThrow();
      expect(row.closedByUserId).toBe(ownerRow.id);
      const events = await t.prisma.orderEvent.findMany({ orderBy: { id: 'asc' } });
      expect(events.map((e) => e.type)).toEqual(['CREATED', status]);
      expect(published).toEqual([`updated:${status}`]);
    },
  );

  it('repeating the same transition is idempotent: no change, no event, nothing published', async () => {
    await closeOrder(t.app, owner, orderId, 'complete');
    t.clock.advance(60_000);
    const again = await closeOrder(t.app, owner, orderId, 'complete');
    expect(again.status).toBe(200);
    expect(again.body.alreadyApplied).toBe(true);
    expect(again.body.order).toMatchObject({ completedAt: '2026-10-29T13:18:00.000Z', version: 2 });
    expect(await t.prisma.orderEvent.count()).toBe(2);
    expect(published).toEqual(['updated:COMPLETED']);
  });

  it('a conflicting transition → 409 with the current status', async () => {
    await closeOrder(t.app, owner, orderId, 'cancel');
    const res = await closeOrder(t.app, owner, orderId, 'complete');
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({
      code: 'INVALID_STATUS_TRANSITION',
      message: 'This order was already cancelled.',
      details: { currentStatus: 'CANCELLED' },
    });
  });

  it('unknown order → 404 ORDER_NOT_FOUND; malformed id → 400', async () => {
    const missing = await closeOrder(t.app, owner, crypto.randomUUID(), 'complete');
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('ORDER_NOT_FOUND');
    expect((await closeOrder(t.app, owner, 'abc', 'complete')).status).toBe(400);
  });

  it('a non-empty body is rejected (body must be {})', async () => {
    const res = await request(t.app)
      .post(`/api/orders/${orderId}/complete`)
      .set('Origin', 'http://localhost:5173')
      .set('Cookie', owner)
      .send({ status: 'ACTIVE' });
    expect(res.status).toBe(400);
  });

  it('concurrent complete + cancel: exactly one wins, the other gets 409', async () => {
    const [a, b] = await Promise.all([
      closeOrder(t.app, owner, orderId, 'complete'),
      closeOrder(t.app, owner, orderId, 'cancel'),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 409]);
    const row = await t.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(row.version).toBe(2);
    expect(await t.prisma.orderEvent.count()).toBe(2);
    expect(published).toHaveLength(1);
  });

  it('GET /api/orders/:id returns the audit trail with actor usernames', async () => {
    await closeOrder(t.app, owner, orderId, 'complete');
    const res = await request(t.app).get(`/api/orders/${orderId}`).set('Cookie', owner);
    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe('COMPLETED');
    expect(res.body.events).toEqual([
      { type: 'CREATED', occurredAt: '2026-10-29T13:00:00.000Z', actor: { username: 'owner' } },
      { type: 'COMPLETED', occurredAt: '2026-10-29T13:18:00.000Z', actor: { username: 'owner' } },
    ]);
    const missing = await request(t.app)
      .get(`/api/orders/${crypto.randomUUID()}`)
      .set('Cookie', owner);
    expect(missing.status).toBe(404);
  });
});
