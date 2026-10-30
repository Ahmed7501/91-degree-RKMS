import type { Express } from 'express';
import request from 'supertest';
import type { Db } from '../../src/db/prisma';
import { hashPassword } from '../../src/modules/auth/password';
import { TEST_ORIGIN } from './app-harness';

export const OWNER_PASSWORD = 'correct horse battery staple';

let ownerHash: Promise<string> | undefined;

/** Inserts an owner directly (tests only; production owners come from the CLI). */
export async function createOwner(
  prisma: Db,
  username = 'owner',
  password = OWNER_PASSWORD,
): Promise<{ id: string; username: string }> {
  const passwordHash =
    password === OWNER_PASSWORD
      ? await (ownerHash ??= hashPassword(OWNER_PASSWORD))
      : await hashPassword(password);
  return prisma.user.create({
    data: { username, passwordHash },
    select: { id: true, username: true },
  });
}

/** `name=value` from a Set-Cookie header, ready for a Cookie request header. */
export function sessionCookieFrom(res: request.Response): string {
  const header = res.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = header?.[0]?.split(';')[0];
  if (!cookie) throw new Error(`No Set-Cookie in response (status ${res.status})`);
  return cookie;
}

export async function loginOwner(
  app: Express,
  username = 'owner',
  password = OWNER_PASSWORD,
): Promise<string> {
  const res = await request(app)
    .post('/api/auth/login')
    .set('Origin', TEST_ORIGIN)
    .send({ username, password });
  if (res.status !== 200)
    throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
  return sessionCookieFrom(res);
}

/** Owner issues a code, a kitchen device redeems it. Returns the kitchen cookie. */
export async function pairKitchen(
  app: Express,
  ownerCookie: string,
  label = 'Grill TV',
): Promise<string> {
  const code = await request(app)
    .post('/api/kitchen/pairing-codes')
    .set('Origin', TEST_ORIGIN)
    .set('Cookie', ownerCookie)
    .send({ deviceLabel: label });
  if (code.status !== 201) throw new Error(`pairing code failed: ${code.status}`);
  const res = await request(app)
    .post('/api/kitchen/pair')
    .set('Origin', TEST_ORIGIN)
    .send({ code: code.body.code });
  if (res.status !== 200) throw new Error(`pair failed: ${res.status}`);
  return sessionCookieFrom(res);
}

export const ORDER_BODY = {
  text: '2x Chicken Tikka\n1x Garlic Naan\nNo onions please',
  source: 'WHATSAPP',
  prepMinutes: 20,
} as const;

/** POST /api/orders as the owner, with a fresh idempotency key unless one is given. */
export function postOrder(
  app: Express,
  ownerCookie: string,
  body: object = ORDER_BODY,
  key: string = crypto.randomUUID(),
) {
  return request(app)
    .post('/api/orders')
    .set('Origin', TEST_ORIGIN)
    .set('Cookie', ownerCookie)
    .set('Idempotency-Key', key)
    .send(body);
}

export function closeOrder(
  app: Express,
  ownerCookie: string,
  id: string,
  action: 'complete' | 'cancel',
) {
  return request(app)
    .post(`/api/orders/${id}/${action}`)
    .set('Origin', TEST_ORIGIN)
    .set('Cookie', ownerCookie)
    .send({});
}
