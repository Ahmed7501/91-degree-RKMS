import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, TEST_ORIGIN } from '../helpers/app-harness';
import { createOwner, loginOwner, pairKitchen, postOrder } from '../helpers/factories';
import { truncateAll } from '../helpers/test-db';

// API_CONTRACTS §4 access matrix, exhaustively: every route × {anonymous, KITCHEN, OWNER}.

const t = createTestApp();
afterAll(() => t.close());

const cookies: Record<'anonymous' | 'kitchen' | 'owner', string | undefined> = {
  anonymous: undefined,
  kitchen: undefined,
  owner: undefined,
};
let orderId = '';

beforeAll(async () => {
  await truncateAll();
  await createOwner(t.prisma);
  cookies.owner = await loginOwner(t.app);
  cookies.kitchen = await pairKitchen(t.app, cookies.owner);
  orderId = (await postOrder(t.app, cookies.owner)).body.order.id;
});

type Role = keyof typeof cookies;
type Method = 'get' | 'post' | 'delete';

interface Route {
  name: string;
  method: Method;
  path: () => string;
  body?: () => object;
  idempotent?: boolean;
  /** Expected status per role; "ok" means anything below 400. */
  expect: Record<Role, number | 'ok'>;
}

const DENIED_ALL_BUT_OWNER = { anonymous: 401, kitchen: 403, owner: 'ok' } as const;

const ROUTES: Route[] = [
  {
    name: 'GET health/live',
    method: 'get',
    path: () => '/api/health/live',
    expect: { anonymous: 'ok', kitchen: 'ok', owner: 'ok' },
  },
  {
    name: 'GET health/ready',
    method: 'get',
    path: () => '/api/health/ready',
    expect: { anonymous: 'ok', kitchen: 'ok', owner: 'ok' },
  },
  {
    name: 'GET auth/session',
    method: 'get',
    path: () => '/api/auth/session',
    expect: { anonymous: 'ok', kitchen: 'ok', owner: 'ok' },
  },
  {
    name: 'GET orders/active',
    method: 'get',
    path: () => '/api/orders/active',
    expect: { anonymous: 401, kitchen: 'ok', owner: 'ok' },
  },
  {
    name: 'POST orders',
    method: 'post',
    path: () => '/api/orders',
    body: () => ({ text: 'matrix order', source: 'OTHER' }),
    idempotent: true,
    expect: DENIED_ALL_BUT_OWNER,
  },
  {
    name: 'POST orders (menu order, ADR-027)',
    method: 'post',
    path: () => '/api/orders',
    body: () => ({
      kind: 'MENU',
      items: [{ itemId: 'zinger-burger', variantId: 'regular', quantity: 1 }],
      source: 'OTHER',
    }),
    idempotent: true,
    expect: DENIED_ALL_BUT_OWNER,
  },
  {
    name: 'GET menu',
    method: 'get',
    path: () => '/api/menu',
    expect: DENIED_ALL_BUT_OWNER,
  },
  {
    name: 'GET orders (history)',
    method: 'get',
    path: () => '/api/orders',
    expect: DENIED_ALL_BUT_OWNER,
  },
  {
    name: 'GET orders/:id',
    method: 'get',
    path: () => `/api/orders/${orderId}`,
    expect: DENIED_ALL_BUT_OWNER,
  },
  {
    name: 'POST orders/:id/complete',
    method: 'post',
    path: () => `/api/orders/${orderId}/complete`,
    body: () => ({}),
    expect: DENIED_ALL_BUT_OWNER,
  },
  {
    name: 'POST orders/:id/cancel',
    method: 'post',
    path: () => `/api/orders/${crypto.randomUUID()}/cancel`,
    body: () => ({}),
    // The owner reaches the handler: an unknown order is a 404, not an auth error.
    expect: { anonymous: 401, kitchen: 403, owner: 404 },
  },
  {
    name: 'POST kitchen/pairing-codes',
    method: 'post',
    path: () => '/api/kitchen/pairing-codes',
    body: () => ({ deviceLabel: 'Matrix TV' }),
    expect: DENIED_ALL_BUT_OWNER,
  },
  {
    name: 'GET kitchen/devices',
    method: 'get',
    path: () => '/api/kitchen/devices',
    expect: DENIED_ALL_BUT_OWNER,
  },
  {
    name: 'DELETE kitchen/devices/:id',
    method: 'delete',
    path: () => `/api/kitchen/devices/${crypto.randomUUID()}`,
    expect: { anonymous: 401, kitchen: 403, owner: 404 },
  },
  {
    // FR-ORD-15: there is no delete endpoint for orders, for any role.
    name: 'DELETE orders/:id (does not exist)',
    method: 'delete',
    path: () => `/api/orders/${orderId}`,
    expect: { anonymous: 404, kitchen: 404, owner: 404 },
  },
];

const ROLES: Role[] = ['anonymous', 'kitchen', 'owner'];

describe('access matrix', () => {
  for (const route of ROUTES) {
    for (const role of ROLES) {
      it(`${route.name} as ${role} → ${String(route.expect[role])}`, async () => {
        let req = request(t.app)[route.method](route.path()).set('Origin', TEST_ORIGIN);
        const cookie = cookies[role];
        if (cookie) req = req.set('Cookie', cookie);
        if (route.idempotent) req = req.set('Idempotency-Key', crypto.randomUUID());
        const res = route.body ? await req.send(route.body()) : await req;
        const expected = route.expect[role];
        if (expected === 'ok') expect(res.status).toBeLessThan(400);
        else expect(res.status).toBe(expected);
        if (expected === 401) expect(res.body.error.code).toBe('UNAUTHENTICATED');
        if (expected === 403) expect(res.body.error.code).toBe('FORBIDDEN');
        if (route.name.startsWith('DELETE orders'))
          expect(res.body.error.code).toBe('ROUTE_NOT_FOUND');
      });
    }
  }
});
