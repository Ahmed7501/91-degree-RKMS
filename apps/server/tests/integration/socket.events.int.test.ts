import { OrderEventPayload } from '@rkds/shared';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createLogger } from '../../src/lib/logger';
import { OrdersRepository } from '../../src/modules/orders/orders.repository';
import { OrdersService } from '../../src/modules/orders/orders.service';
import {
  closeOrder,
  createOwner,
  loginOwner,
  ORDER_BODY,
  pairKitchen,
  postOrder,
} from '../helpers/factories';
import {
  collect,
  connectSocket,
  nextEvent,
  sleep,
  startTestServer,
  type TestServer,
  type TestSocket,
} from '../helpers/socket-client';
import { truncateAll } from '../helpers/test-db';

let s: TestServer;
const open: TestSocket[] = [];
let owner: string;
let kitchenSocket: TestSocket;

beforeAll(async () => {
  s = await startTestServer();
});
afterAll(() => s.stop());
beforeEach(async () => {
  await truncateAll();
  s.clock.set('2026-10-29T13:00:00.000Z');
  await createOwner(s.prisma);
  owner = await loginOwner(s.app);
  const kitchen = await pairKitchen(s.app, owner);
  kitchenSocket = (await connectSocket(s.url, { cookie: kitchen })).socket;
  open.push(kitchenSocket);
});
afterEach(() => {
  for (const socket of open.splice(0)) socket.close();
});

describe('order events (REALTIME_FLOW §2)', () => {
  it('order:created reaches the kitchen after POST, and the payload passes the shared schema', async () => {
    const received = nextEvent<unknown>(kitchenSocket, 'order:created');
    const res = await postOrder(s.app, owner);
    const payload = OrderEventPayload.parse(await received);
    expect(payload.order).toEqual(res.body.order);
    expect(payload.order.text).toBe(ORDER_BODY.text);
  });

  it('menu items and kitchen notes reach the kitchen in order:created (ADR-027)', async () => {
    const received = nextEvent<unknown>(kitchenSocket, 'order:created');
    const res = await postOrder(s.app, owner, {
      kind: 'MENU',
      items: [{ itemId: 'chicken-karahi', variantId: 'regular', quantity: 1 }],
      source: 'PHONE',
      notes: 'Less oil',
    });
    const payload = OrderEventPayload.parse(await received);
    expect(payload.order).toEqual(res.body.order);
    expect(payload.order).toMatchObject({
      kind: 'MENU',
      text: '1 × Chicken Karahi',
      notes: 'Less oil',
    });
    expect(payload.order.items).toHaveLength(1);
  });

  it('the owner screen receives the same events', async () => {
    const ownerSocket = (await connectSocket(s.url, { cookie: owner })).socket;
    open.push(ownerSocket);
    const received = nextEvent<{ order: { id: string } }>(ownerSocket, 'order:created');
    const res = await postOrder(s.app, owner);
    expect((await received).order.id).toBe(res.body.order.id);
  });

  it('is not emitted for an idempotent replay', async () => {
    const created = collect(kitchenSocket, 'order:created');
    const key = crypto.randomUUID();
    await postOrder(s.app, owner, ORDER_BODY, key);
    await postOrder(s.app, owner, ORDER_BODY, key);
    await sleep(300);
    expect(created).toHaveLength(1);
  });

  it('is not emitted when the create transaction rolls back', async () => {
    const created = collect(kitchenSocket, 'order:created');
    class FailingRepo extends OrdersRepository {
      override insertEvent(): Promise<unknown> {
        return Promise.reject(new Error('rollback'));
      }
    }
    const user = await s.prisma.user.findFirstOrThrow();
    const failing = new OrdersService(
      s.prisma,
      new FailingRepo(s.prisma),
      s.clock,
      s.env,
      s.services.orderEvents, // the real bus the socket server listens to
      createLogger({ level: 'silent' }),
      s.services.menu,
    );
    await expect(
      failing.create({ ...ORDER_BODY, kind: 'TEXT' }, crypto.randomUUID(), {
        userId: user.id,
        requestId: undefined,
      }),
    ).rejects.toThrow('rollback');
    await sleep(300);
    expect(created).toHaveLength(0);
    expect(await s.prisma.order.count()).toBe(0);
  });

  it('order:updated after complete; nothing for an already-applied repeat', async () => {
    const id = (await postOrder(s.app, owner)).body.order.id as string;
    const updates = collect<{ order: { status: string; version: number } }>(
      kitchenSocket,
      'order:updated',
    );
    await closeOrder(s.app, owner, id, 'complete');
    await closeOrder(s.app, owner, id, 'complete');
    await sleep(300);
    expect(updates.map((u) => [u.order.status, u.order.version])).toEqual([['COMPLETED', 2]]);
  });

  it('events a client emits are ignored (broadcast-only)', async () => {
    kitchenSocket.emit('order:created', { order: { text: 'forged' } });
    kitchenSocket.emit('complete', { id: 'x' });
    await sleep(200);
    expect(kitchenSocket.connected).toBe(true);
    expect(await s.prisma.order.count()).toBe(0);
  });
});
