import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { OrderDto } from '@rkds/shared';
import { createTestApp, TEST_ORIGIN } from '../helpers/app-harness';
import { createOwner, loginOwner, ORDER_BODY, postOrder } from '../helpers/factories';
import { pkt } from '../helpers/fixed-clock';
import { truncateAll } from '../helpers/test-db';

const t = createTestApp();
afterAll(() => t.close());

let owner: string;
beforeEach(async () => {
  await truncateAll();
  t.clock.set('2026-10-29T13:00:00.000Z'); // 18:00 PKT
  await createOwner(t.prisma);
  owner = await loginOwner(t.app);
});

describe('POST /api/orders', () => {
  it('201 with the documented shape; numbering starts at 001', async () => {
    const res = await postOrder(t.app, owner);
    expect(res.status).toBe(201);
    expect(OrderDto.parse(res.body.order)).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/) as string,
      orderNumber: 1,
      displayNumber: '001',
      businessDate: '2026-10-29',
      text: ORDER_BODY.text,
      kind: 'TEXT',
      items: null,
      notes: null,
      source: 'WHATSAPP',
      prepMinutes: 20,
      status: 'ACTIVE',
      createdAt: '2026-10-29T13:00:00.000Z',
      deadlineAt: '2026-10-29T13:20:00.000Z',
      completedAt: null,
      cancelledAt: null,
      updatedAt: '2026-10-29T13:00:00.000Z',
      version: 1,
    });
    expect(res.body.serverTime).toBe('2026-10-29T13:00:00.000Z');
    expect(res.headers['idempotent-replayed']).toBeUndefined();
  });

  it('stores normalized text: CRLF → LF, NUL stripped, outer whitespace trimmed', async () => {
    const res = await postOrder(t.app, owner, {
      ...ORDER_BODY,
      text: '  \r\n1x Zinger\r\n\r\n  no mayo\u0000  \n',
    });
    expect(res.body.order.text).toBe('1x Zinger\n\n  no mayo');
    const row = await t.prisma.order.findFirstOrThrow();
    expect(row.text).toBe('1x Zinger\n\n  no mayo');
  });

  it('stores SQL/HTML payloads, Urdu and emoji verbatim', async () => {
    const text =
      "'; DROP TABLE orders; --\n<img src=x onerror=alert(1)>\nچکن کڑاہی ۲ عدد\nmirchi kam 🌶️🔥";
    const res = await postOrder(t.app, owner, { ...ORDER_BODY, text });
    expect(res.status).toBe(201);
    expect(res.body.order.text).toBe(text);
    expect((await t.prisma.order.findFirstOrThrow()).text).toBe(text);
  });

  it('deadline = created + 25 min for a 25-minute order; prepMinutes defaults to 20', async () => {
    const slow = await postOrder(t.app, owner, { ...ORDER_BODY, prepMinutes: 25 });
    expect(slow.body.order.deadlineAt).toBe('2026-10-29T13:25:00.000Z');
    const dflt = await postOrder(t.app, owner, { text: 'x', source: 'PHONE' });
    expect(dflt.body.order.prepMinutes).toBe(20);
  });

  it.each([
    [15, '2026-10-29T13:15:00.000Z'],
    [30, '2026-10-29T13:30:00.000Z'],
  ])('a %i-minute order gets its deadline (Q-08)', async (prepMinutes, deadlineAt) => {
    const res = await postOrder(t.app, owner, { ...ORDER_BODY, prepMinutes });
    expect(res.status).toBe(201);
    expect(res.body.order).toMatchObject({ prepMinutes, deadlineAt });
  });

  it('400 for a target that is not offered (35 minutes)', async () => {
    const res = await postOrder(t.app, owner, { ...ORDER_BODY, prepMinutes: 35 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it.each([
    ['05:59 PKT counts for the previous evening', '2026-10-30T05:59:59', '2026-10-29'],
    ['06:00 PKT starts the new business day', '2026-10-30T06:00:00', '2026-10-30'],
    ['02:30 PKT after midnight is the same shift', '2026-10-30T02:30:00', '2026-10-29'],
  ])('business date with the 06:00 cutoff: %s', async (_name, local, expected) => {
    t.clock.set(pkt(local));
    const res = await postOrder(t.app, owner);
    expect(res.body.order.businessDate).toBe(expected);
  });

  it('missing or malformed Idempotency-Key → 400 IDEMPOTENCY_KEY_REQUIRED', async () => {
    const missing = await request(t.app)
      .post('/api/orders')
      .set('Origin', TEST_ORIGIN)
      .set('Cookie', owner)
      .send(ORDER_BODY);
    expect(missing.status).toBe(400);
    expect(missing.body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    const malformed = await postOrder(t.app, owner, ORDER_BODY, 'not-a-uuid');
    expect(malformed.body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    expect(await t.prisma.order.count()).toBe(0);
  });

  it.each([
    [
      'whitespace-only text',
      { ...ORDER_BODY, text: ' \n\t ' },
      'text',
      'Order text cannot be empty.',
    ],
    ['5,001 characters', { ...ORDER_BODY, text: 'a'.repeat(5001) }, 'text', 'max 5,000'],
    ['unknown source', { ...ORDER_BODY, source: 'EMAIL' }, 'source', undefined],
    ['prep 35 minutes', { ...ORDER_BODY, prepMinutes: 35 }, 'prepMinutes', undefined],
    ['an extra field', { ...ORDER_BODY, orderNumber: 7 }, '(root)', undefined],
  ])('rejects %s with 400 VALIDATION_FAILED', async (_name, body, path, message) => {
    const res = await postOrder(t.app, owner, body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.details[0].path).toBe(path);
    if (message) expect(res.body.error.message).toContain(message);
    expect(await t.prisma.order.count()).toBe(0);
  });

  it('records a CREATED audit event with the actor and request id', async () => {
    const res = await request(t.app)
      .post('/api/orders')
      .set('Origin', TEST_ORIGIN)
      .set('Cookie', owner)
      .set('Idempotency-Key', crypto.randomUUID())
      .set('X-Request-Id', 'req-create-1')
      .send(ORDER_BODY);
    const events = await t.prisma.orderEvent.findMany({ include: { actor: true } });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      orderId: res.body.order.id,
      type: 'CREATED',
      requestId: 'req-create-1',
    });
    expect(events[0]!.actor?.username).toBe('owner');
  });

  it('sends 413 for a body over 32 KB and keeps nothing', async () => {
    const res = await postOrder(t.app, owner, { ...ORDER_BODY, text: 'a'.repeat(40_000) });
    expect(res.status).toBe(413);
    expect(await t.prisma.order.count()).toBe(0);
  });
});
