import { MenuResponse, OrderDto } from '@rkds/shared';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, TEST_ORIGIN } from '../helpers/app-harness';
import { createOwner, loginOwner, ORDER_BODY, pairKitchen, postOrder } from '../helpers/factories';
import { truncateAll } from '../helpers/test-db';

// ADR-027: menu orders and kitchen notes share the existing order pipeline.

const t = createTestApp();
afterAll(() => t.close());

let owner: string;
beforeEach(async () => {
  await truncateAll();
  t.clock.set('2026-10-29T13:00:00.000Z'); // 18:00 PKT
  await createOwner(t.prisma);
  owner = await loginOwner(t.app);
});

const MENU_BODY = {
  kind: 'MENU',
  items: [
    { itemId: 'zinger-burger', variantId: 'regular', quantity: 2 },
    { itemId: 'masala-fries', variantId: 'large', quantity: 1 },
  ],
  source: 'PHONE',
  prepMinutes: 25,
  notes: 'No onions\nSauce separate',
} as const;

const getAs = (cookie: string, path: string) =>
  request(t.app).get(path).set('Origin', TEST_ORIGIN).set('Cookie', cookie);

describe('GET /api/menu', () => {
  it('returns the active menu to the owner', async () => {
    const res = await getAs(owner, '/api/menu');
    expect(res.status).toBe(200);
    const { menu } = MenuResponse.parse(res.body);
    expect(menu.categories).toHaveLength(12);
    expect(menu.categories.flatMap((c) => c.items)).toHaveLength(88);
  });

  it('is owner-only: a kitchen screen gets 403, an anonymous request 401', async () => {
    const kitchen = await pairKitchen(t.app, owner);
    expect((await getAs(kitchen, '/api/menu')).status).toBe(403);
    expect((await request(t.app).get('/api/menu').set('Origin', TEST_ORIGIN)).status).toBe(401);
  });
});

describe('POST /api/orders with kind MENU', () => {
  it('201: the server builds the kitchen text and saves an item snapshot and the notes', async () => {
    const res = await postOrder(t.app, owner, MENU_BODY);
    expect(res.status).toBe(201);
    const order = OrderDto.parse(res.body.order);
    expect(order).toMatchObject({
      orderNumber: 1,
      kind: 'MENU',
      text: '2 × Zinger Burger\n1 × Masala Fries (Large)',
      notes: 'No onions\nSauce separate',
      source: 'PHONE',
      prepMinutes: 25,
      deadlineAt: '2026-10-29T13:25:00.000Z',
      status: 'ACTIVE',
    });
    expect(order.items).toEqual([
      {
        itemId: 'zinger-burger',
        variantId: 'regular',
        name: 'Zinger Burger',
        variant: null,
        quantity: 2,
        unitPrice: 460,
      },
      {
        itemId: 'masala-fries',
        variantId: 'large',
        name: 'Masala Fries',
        variant: 'Large',
        quantity: 1,
        unitPrice: 200,
      },
    ]);
    const row = await t.prisma.order.findFirstOrThrow();
    expect(row.kind).toBe('MENU');
    expect(row.items).toEqual(order.items);
    expect(row.notes).toBe('No onions\nSauce separate');
    expect(await t.prisma.orderEvent.count({ where: { type: 'CREATED' } })).toBe(1);
  });

  it('menu and text orders share one daily number sequence', async () => {
    const first = await postOrder(t.app, owner);
    const second = await postOrder(t.app, owner, MENU_BODY);
    const third = await postOrder(t.app, owner);
    expect([first, second, third].map((r) => r.body.order.displayNumber)).toEqual([
      '001',
      '002',
      '003',
    ]);
  });

  it('409 MENU_ITEM_UNAVAILABLE for an unknown item or size: nothing saved, no number used', async () => {
    const res = await postOrder(t.app, owner, {
      ...MENU_BODY,
      items: [
        { itemId: 'zinger-burger', variantId: 'regular', quantity: 1 },
        { itemId: 'zinger-burger', variantId: 'jumbo', quantity: 1 },
        { itemId: 'pepperoni-pizza', variantId: 'regular', quantity: 1 },
      ],
    });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({
      code: 'MENU_ITEM_UNAVAILABLE',
      details: {
        unavailable: [
          { index: 1, itemId: 'zinger-burger', variantId: 'jumbo' },
          { index: 2, itemId: 'pepperoni-pizza', variantId: 'regular' },
        ],
      },
    });
    expect(await t.prisma.order.count()).toBe(0);
    expect((await postOrder(t.app, owner)).body.order.orderNumber).toBe(1);
  });

  it.each([
    ['no items', { ...MENU_BODY, items: [] }],
    ['quantity 0', { ...MENU_BODY, items: [{ ...MENU_BODY.items[0], quantity: 0 }] }],
    ['quantity 100', { ...MENU_BODY, items: [{ ...MENU_BODY.items[0], quantity: 100 }] }],
    ['a duplicate line', { ...MENU_BODY, items: [MENU_BODY.items[0], MENU_BODY.items[0]] }],
    ['a client-supplied price', { ...MENU_BODY, items: [{ ...MENU_BODY.items[0], price: 1 }] }],
    ['text on a menu order', { ...MENU_BODY, text: 'free food' }],
  ])('400 VALIDATION_FAILED for %s', async (_name, body) => {
    const res = await postOrder(t.app, owner, body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(await t.prisma.order.count()).toBe(0);
  });

  it('a retry with the same key replays; a changed quantity under that key is 422', async () => {
    const key = crypto.randomUUID();
    const first = await postOrder(t.app, owner, MENU_BODY, key);
    const replay = await postOrder(t.app, owner, MENU_BODY, key);
    expect(replay.status).toBe(200);
    expect(replay.headers['idempotent-replayed']).toBe('true');
    expect(replay.body.order.id).toBe(first.body.order.id);
    const changed = await postOrder(
      t.app,
      owner,
      { ...MENU_BODY, items: [{ ...MENU_BODY.items[0], quantity: 3 }, MENU_BODY.items[1]] },
      key,
    );
    expect(changed.status).toBe(422);
    expect(changed.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
    expect(await t.prisma.order.count()).toBe(1);
  });

  it('concurrent menu and text creates get unique, gap-free numbers', async () => {
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        postOrder(t.app, owner, i % 2 === 0 ? MENU_BODY : ORDER_BODY),
      ),
    );
    expect(results.every((r) => r.status === 201)).toBe(true);
    const numbers = results.map((r) => r.body.order.orderNumber as number).sort((a, b) => a - b);
    expect(numbers).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
  });
});

describe('kitchen notes on text orders', () => {
  it('are saved and returned everywhere the order appears', async () => {
    const created = await postOrder(t.app, owner, { ...ORDER_BODY, notes: '  Extra spicy\r\n' });
    expect(created.status).toBe(201);
    expect(created.body.order).toMatchObject({ kind: 'TEXT', items: null, notes: 'Extra spicy' });
    const id = created.body.order.id as string;

    const active = await getAs(owner, '/api/orders/active');
    expect(active.body.orders[0]).toMatchObject({ id, notes: 'Extra spicy' });
    const history = await getAs(owner, '/api/orders?date=2026-10-29');
    expect(history.body.orders[0]).toMatchObject({ id, notes: 'Extra spicy' });
    const detail = await getAs(owner, `/api/orders/${id}`);
    expect(detail.body.order).toMatchObject({ id, notes: 'Extra spicy' });
  });

  it('blank notes are stored as NULL', async () => {
    const res = await postOrder(t.app, owner, { ...ORDER_BODY, notes: ' \n ' });
    expect(res.body.order.notes).toBeNull();
    expect((await t.prisma.order.findFirstOrThrow()).notes).toBeNull();
  });

  it('501 characters are rejected (400), never truncated', async () => {
    const res = await postOrder(t.app, owner, { ...ORDER_BODY, notes: 'a'.repeat(501) });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(await t.prisma.order.count()).toBe(0);
  });

  it('survive completion and stay attached to the right order', async () => {
    const a = await postOrder(t.app, owner, { ...ORDER_BODY, notes: 'for A' });
    const b = await postOrder(t.app, owner, MENU_BODY);
    const done = await request(t.app)
      .post(`/api/orders/${a.body.order.id}/complete`)
      .set('Origin', TEST_ORIGIN)
      .set('Cookie', owner)
      .send({});
    expect(done.body.order).toMatchObject({ status: 'COMPLETED', notes: 'for A' });
    const active = await getAs(owner, '/api/orders/active');
    expect(active.body.orders).toEqual([
      expect.objectContaining({ id: b.body.order.id, notes: MENU_BODY.notes }),
    ]);
  });
});
