import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { isUniqueViolation } from '../../src/db/errors';
import { createLogger } from '../../src/lib/logger';
import { OrderEventBus } from '../../src/modules/orders/order-events';
import { OrdersRepository } from '../../src/modules/orders/orders.repository';
import { OrdersService } from '../../src/modules/orders/orders.service';
import { createTestApp } from '../helpers/app-harness';
import { createOwner, loginOwner, ORDER_BODY, postOrder } from '../helpers/factories';
import { truncateAll } from '../helpers/test-db';

const t = createTestApp();
afterAll(() => t.close());

let owner: string;
const published: string[] = [];
t.services.orderEvents.subscribe((kind, order) => published.push(`${kind}:${order.orderNumber}`));
beforeEach(async () => {
  await truncateAll();
  published.length = 0;
  await createOwner(t.prisma);
  owner = await loginOwner(t.app);
});

describe('idempotency (ADR-006)', () => {
  it('same key + same payload → 200 replay of the same order, one row, one event', async () => {
    const key = crypto.randomUUID();
    const first = await postOrder(t.app, owner, ORDER_BODY, key);
    const again = await postOrder(t.app, owner, ORDER_BODY, key);
    expect(first.status).toBe(201);
    expect(again.status).toBe(200);
    expect(again.headers['idempotent-replayed']).toBe('true');
    expect(again.body.order).toEqual(first.body.order);
    expect(await t.prisma.order.count()).toBe(1);
    expect(await t.prisma.orderEvent.count()).toBe(1);
    expect(published).toEqual(['created:1']); // the replay publishes nothing
  });

  it('a replay with differently formatted but equivalent text is still a replay', async () => {
    const key = crypto.randomUUID();
    await postOrder(t.app, owner, ORDER_BODY, key);
    const crlf = { ...ORDER_BODY, text: `  ${ORDER_BODY.text.replaceAll('\n', '\r\n')}  ` };
    const again = await postOrder(t.app, owner, crlf, key);
    expect(again.status).toBe(200);
  });

  it('same key + different payload → 422 with the existing order number', async () => {
    const key = crypto.randomUUID();
    await postOrder(t.app, owner, ORDER_BODY, key);
    const changed = await postOrder(t.app, owner, { ...ORDER_BODY, text: 'edited text' }, key);
    expect(changed.status).toBe(422);
    expect(changed.body.error).toMatchObject({
      code: 'IDEMPOTENCY_KEY_REUSED',
      message: 'An earlier version of this order was already sent as #001.',
      details: { existingOrderNumber: 1, existingBusinessDate: '2026-10-29' },
    });
    expect(await t.prisma.order.count()).toBe(1);
  });

  it('10 concurrent identical requests create exactly one order', async () => {
    const key = crypto.randomUUID();
    const responses = await Promise.all(
      Array.from({ length: 10 }, () => postOrder(t.app, owner, ORDER_BODY, key)),
    );
    const statuses = responses.map((r) => r.status).sort();
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s === 200)).toHaveLength(9);
    const ids = new Set(responses.map((r) => r.body.order.id));
    expect(ids.size).toBe(1);
    expect(await t.prisma.order.count()).toBe(1);
    expect(await t.prisma.orderEvent.count()).toBe(1);
    expect(published).toEqual(['created:1']);
    // The losing transactions rolled back their counter increments: the next order is #002.
    const next = await postOrder(t.app, owner);
    expect(next.body.order.orderNumber).toBe(2);
  });

  it('different keys with identical text are different orders (genuine repeats)', async () => {
    const a = await postOrder(t.app, owner);
    const b = await postOrder(t.app, owner);
    expect(a.body.order.id).not.toBe(b.body.order.id);
    expect(b.body.order.orderNumber).toBe(2);
  });
});

describe('real Prisma 7 unique-violation errors are recognized by constraint name', () => {
  it('duplicate idempotency key inside the create transaction', async () => {
    const user = await t.prisma.user.findFirstOrThrow();
    const key = crypto.randomUUID();
    const order = {
      businessDate: '2026-10-29',
      now: new Date('2026-10-29T13:00:00.000Z'),
      deadlineAt: new Date('2026-10-29T13:20:00.000Z'),
      idempotencyKey: key,
      requestHash: 'hash',
      text: 'x',
      kind: 'TEXT' as const,
      items: null,
      notes: null,
      source: 'PHONE' as const,
      prepMinutes: 20 as const,
      createdByUserId: user.id,
      requestId: undefined,
    };
    const repo = t.services.ordersRepo;
    await t.prisma.$transaction((tx) => repo.insertOrder(tx, order));
    const error = await t.prisma
      .$transaction((tx) => repo.insertOrder(tx, order))
      .then(
        () => undefined,
        (e: unknown) => e,
      );
    expect(isUniqueViolation(error, 'orders_idempotency_key_key')).toBe(true);
    expect(isUniqueViolation(error, 'orders_business_date_daily_number_key')).toBe(false);
    // The failed transaction rolled back its counter increment.
    const counter = await t.prisma.orderDayCounter.findFirstOrThrow();
    expect(counter.lastNumber).toBe(1);
  });
});

describe('the race window: the key is committed between the lookup and the insert', () => {
  /** The first lookup misses (as if the other request had not committed yet); later ones are real. */
  class RacingRepo extends OrdersRepository {
    private calls = 0;
    override findByIdempotencyKey(key: string) {
      this.calls += 1;
      return this.calls === 1 ? Promise.resolve(null) : super.findByIdempotencyKey(key);
    }
  }

  function racingService() {
    const bus = new OrderEventBus();
    const events: string[] = [];
    bus.subscribe((kind) => events.push(kind));
    const service = new OrdersService(
      t.prisma,
      new RacingRepo(t.prisma),
      t.clock,
      t.env,
      bus,
      createLogger({ level: 'silent' }),
      t.services.menu,
    );
    return { service, events };
  }

  it('same payload → the loser replays the winner (no second order, no event)', async () => {
    const key = crypto.randomUUID();
    const winner = await postOrder(t.app, owner, ORDER_BODY, key);
    const user = await t.prisma.user.findFirstOrThrow();
    const { service, events } = racingService();
    const result = await service.create({ ...ORDER_BODY, kind: 'TEXT' }, key, {
      userId: user.id,
      requestId: undefined,
    });
    expect(result.replayed).toBe(true);
    expect(result.order.id).toBe(winner.body.order.id);
    expect(events).toEqual([]);
    expect(await t.prisma.order.count()).toBe(1);
    // The loser's counter increment was rolled back.
    expect((await t.prisma.orderDayCounter.findFirstOrThrow()).lastNumber).toBe(1);
  });

  it('different payload → 422 IDEMPOTENCY_KEY_REUSED', async () => {
    const key = crypto.randomUUID();
    await postOrder(t.app, owner, ORDER_BODY, key);
    const user = await t.prisma.user.findFirstOrThrow();
    const { service } = racingService();
    await expect(
      service.create({ ...ORDER_BODY, kind: 'TEXT', text: 'different' }, key, {
        userId: user.id,
        requestId: undefined,
      }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
  });
});
