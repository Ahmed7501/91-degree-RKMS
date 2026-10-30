import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createLogger } from '../../src/lib/logger';
import { OrderEventBus } from '../../src/modules/orders/order-events';
import { OrdersRepository } from '../../src/modules/orders/orders.repository';
import { OrdersService } from '../../src/modules/orders/orders.service';
import { createTestApp } from '../helpers/app-harness';
import { createOwner, loginOwner, ORDER_BODY, postOrder } from '../helpers/factories';
import { pkt } from '../helpers/fixed-clock';
import { truncateAll } from '../helpers/test-db';

const t = createTestApp();
afterAll(() => t.close());

let owner: string;
beforeEach(async () => {
  await truncateAll();
  t.clock.set('2026-10-29T13:00:00.000Z');
  await createOwner(t.prisma);
  owner = await loginOwner(t.app);
});

describe('daily numbering (ADR-004, FR-ORD-10)', () => {
  it('50 concurrent creates get numbers 1..50: unique, sequential, no gaps', async () => {
    const responses = await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        postOrder(t.app, owner, { ...ORDER_BODY, text: `order ${i}` }),
      ),
    );
    expect(responses.every((r) => r.status === 201)).toBe(true);
    const numbers = responses.map((r) => r.body.order.orderNumber as number).sort((a, b) => a - b);
    expect(numbers).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
    const counter = await t.prisma.orderDayCounter.findFirstOrThrow();
    expect(counter.lastNumber).toBe(50);
  });

  it('a new business day (06:00 PKT) restarts at 001; the previous day keeps its numbers', async () => {
    t.clock.set(pkt('2026-10-30T02:00:00'));
    expect((await postOrder(t.app, owner)).body.order.displayNumber).toBe('001');
    expect((await postOrder(t.app, owner)).body.order.orderNumber).toBe(2);
    t.clock.set(pkt('2026-10-30T06:00:00'));
    const next = await postOrder(t.app, owner);
    expect(next.body.order).toMatchObject({ businessDate: '2026-10-30', orderNumber: 1 });
    const rows = await t.prisma.orderDayCounter.findMany({ orderBy: { businessDate: 'asc' } });
    expect(rows.map((r) => r.lastNumber)).toEqual([2, 1]);
  });

  it('numbering survives a restart (a new app with a new Prisma client)', async () => {
    await postOrder(t.app, owner);
    await postOrder(t.app, owner);
    const restarted = createTestApp();
    const cookie = await loginOwner(restarted.app);
    const res = await postOrder(restarted.app, cookie);
    expect(res.body.order.orderNumber).toBe(3);
    await restarted.close();
  });

  it('a create that fails after the counter increment leaves no gap', async () => {
    await postOrder(t.app, owner); // #1
    const user = await t.prisma.user.findFirstOrThrow();
    class FailingRepo extends OrdersRepository {
      override insertEvent(): Promise<unknown> {
        return Promise.reject(new Error('simulated failure after counter + insert'));
      }
    }
    const failing = new OrdersService(
      t.prisma,
      new FailingRepo(t.prisma),
      t.clock,
      t.env,
      new OrderEventBus(),
      createLogger({ level: 'silent' }),
      t.services.menu,
    );
    await expect(
      failing.create(
        { kind: 'TEXT', text: 'will fail', source: 'PHONE', prepMinutes: 20 },
        crypto.randomUUID(),
        {
          userId: user.id,
          requestId: undefined,
        },
      ),
    ).rejects.toThrow('simulated failure');
    expect(await t.prisma.order.count()).toBe(1);
    const res = await postOrder(t.app, owner);
    expect(res.body.order.orderNumber).toBe(2);
  });
});
