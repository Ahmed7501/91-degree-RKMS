import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { HistoryResponse } from '@rkds/shared';
import { createTestApp } from '../helpers/app-harness';
import { closeOrder, createOwner, loginOwner, pairKitchen, postOrder } from '../helpers/factories';
import { pkt } from '../helpers/fixed-clock';
import { truncateAll } from '../helpers/test-db';

const t = createTestApp();
afterAll(() => t.close());

let owner: string;
beforeEach(async () => {
  await truncateAll();
  t.clock.set(pkt('2026-10-29T18:00:00'));
  await createOwner(t.prisma);
  owner = await loginOwner(t.app);
});

const history = (query: Record<string, string | number> = {}) =>
  request(t.app).get('/api/orders').query(query).set('Cookie', owner);

async function seed(count: number): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < count; i += 1) {
    t.clock.advance(60_000);
    ids.push(
      (await postOrder(t.app, owner, { text: `order ${i + 1}`, source: 'PHONE' })).body.order.id,
    );
  }
  return ids;
}

describe('GET /api/orders (history)', () => {
  it('defaults to the current business date, newest first, all statuses', async () => {
    const ids = await seed(3);
    await closeOrder(t.app, owner, ids[0]!, 'complete');
    const res = await history();
    expect(res.status).toBe(200);
    const body = HistoryResponse.parse(res.body);
    expect(body.businessDate).toBe('2026-10-29');
    expect(body.orders.map((o) => o.id)).toEqual([...ids].reverse());
    expect(body.nextCursor).toBeNull();
  });

  it('filters by status and finds a number within the date', async () => {
    const ids = await seed(3);
    await closeOrder(t.app, owner, ids[1]!, 'cancel');
    const cancelled = await history({ status: 'CANCELLED' });
    expect(cancelled.body.orders.map((o: { id: string }) => o.id)).toEqual([ids[1]]);
    const number = await history({ number: 3 });
    expect(number.body.orders).toHaveLength(1);
    expect(number.body.orders[0].displayNumber).toBe('003');
  });

  it('paginates with a keyset cursor that stays stable while new orders arrive', async () => {
    const ids = await seed(5);
    const first = await history({ limit: 2 });
    expect(first.body.orders.map((o: { id: string }) => o.id)).toEqual([ids[4], ids[3]]);
    expect(first.body.nextCursor).toEqual(expect.any(String));
    await seed(2); // newer orders must not shift the next page
    const second = await history({ limit: 2, cursor: first.body.nextCursor as string });
    expect(second.body.orders.map((o: { id: string }) => o.id)).toEqual([ids[2], ids[1]]);
    const third = await history({ limit: 2, cursor: second.body.nextCursor as string });
    expect(third.body.orders.map((o: { id: string }) => o.id)).toEqual([ids[0]]);
    expect(third.body.nextCursor).toBeNull();
  });

  it('a malformed cursor → 400 VALIDATION_FAILED', async () => {
    for (const cursor of [
      'garbage',
      Buffer.from('["x","y"]').toString('base64url'),
      // 36 dashes looked like a UUID to a loose regex and caused a 500 (review finding).
      Buffer.from(JSON.stringify(['2026-10-29T13:00:00.000Z', '-'.repeat(36)])).toString(
        'base64url',
      ),
    ]) {
      const res = await history({ cursor });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    }
  });

  it('only dates inside the 7-day retention window are accepted', async () => {
    expect((await history({ date: '2026-10-22' })).status).toBe(200);
    for (const date of ['2026-10-21', '2026-10-30']) {
      const res = await history({ date });
      expect(res.status).toBe(400);
      expect(res.body.error.message).toBe('Order history is kept for 7 days.');
    }
  });

  it('kitchen sessions may not read history', async () => {
    const kitchen = await pairKitchen(t.app, owner);
    const res = await request(t.app).get('/api/orders').set('Cookie', kitchen);
    expect(res.status).toBe(403);
  });
});
