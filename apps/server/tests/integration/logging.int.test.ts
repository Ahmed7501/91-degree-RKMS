import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, TEST_ORIGIN } from '../helpers/app-harness';
import { createOwner, loginOwner, OWNER_PASSWORD, postOrder } from '../helpers/factories';
import { truncateAll } from '../helpers/test-db';

// NFR-10: order text, passwords, cookies and pairing codes never reach the logs.

const t = createTestApp();
afterAll(() => t.close());

const SECRET_TEXT = 'Customer Zainab 0300-1234567, House 42 Malir';
let code = '';
let cookie = '';

beforeAll(async () => {
  await truncateAll();
  await createOwner(t.prisma);
  // A failed login and a successful one.
  await request(t.app)
    .post('/api/auth/login')
    .set('Origin', TEST_ORIGIN)
    .send({ username: 'owner', password: 'wrong-password-here' });
  cookie = await loginOwner(t.app);
  // Create, replay, reject (422) and fail validation with the secret text.
  const key = crypto.randomUUID();
  await postOrder(t.app, cookie, { text: SECRET_TEXT, source: 'PHONE' }, key);
  await postOrder(t.app, cookie, { text: SECRET_TEXT, source: 'PHONE' }, key);
  await postOrder(t.app, cookie, { text: `${SECRET_TEXT} edited`, source: 'PHONE' }, key);
  await postOrder(t.app, cookie, { text: SECRET_TEXT, source: 'EMAIL' });
  // Pairing: issue a code and redeem it.
  const issued = await request(t.app)
    .post('/api/kitchen/pairing-codes')
    .set('Origin', TEST_ORIGIN)
    .set('Cookie', cookie)
    .send({ deviceLabel: 'TV' });
  code = String(issued.body.code);
  await request(t.app).post('/api/kitchen/pair').set('Origin', TEST_ORIGIN).send({ code });
});

describe('logs never contain sensitive data', () => {
  it('no order text', () => {
    expect(t.rawLogs()).not.toContain('Zainab');
    expect(t.rawLogs()).not.toContain('0300-1234567');
  });

  it('no passwords', () => {
    expect(t.rawLogs()).not.toContain(OWNER_PASSWORD);
    expect(t.rawLogs()).not.toContain('wrong-password-here');
  });

  it('no session cookies or pairing codes', () => {
    expect(t.rawLogs()).not.toContain(cookie.split('=')[1]!);
    expect(t.rawLogs()).not.toContain(code);
    expect(t.rawLogs()).not.toContain(code.replace('-', ''));
  });

  it('still logs the useful scalar fields', () => {
    const created = t.logs().find((l) => l.event === 'order_created');
    expect(created).toMatchObject({ orderNumber: 1, businessDate: expect.any(String) as string });
    expect(t.logs().some((l) => l.event === 'login_failed')).toBe(true);
    expect(t.logs().some((l) => l.errorCode === 'IDEMPOTENCY_KEY_REUSED')).toBe(true);
  });
});
