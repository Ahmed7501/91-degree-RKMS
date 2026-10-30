import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { DEFAULT_RATE_LIMITS } from '../../src/http/middleware/rate-limit';
import { createTestApp, TEST_ORIGIN } from '../helpers/app-harness';
import { createOwner, loginOwner, postOrder } from '../helpers/factories';
import { truncateAll } from '../helpers/test-db';

// Always multiplier 1 here: these are the production limits (SECURITY §7).
const t = createTestApp({ env: { RATE_LIMIT_MULTIPLIER: '1' }, rateLimits: DEFAULT_RATE_LIMITS });
afterAll(() => t.close());

describe('global /api limit: 600 requests / 5 min / IP', () => {
  it('allows 600 requests, then answers 429 RATE_LIMITED with Retry-After', async () => {
    const agent = request(t.app);
    for (let i = 0; i < 600; i += 1) {
      const res = await agent.get('/api/health/live');
      if (res.status !== 200) throw new Error(`request ${i + 1} got ${res.status}`);
    }
    const limited = await agent.get('/api/health/live');
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');
    expect(limited.body.error.message).toMatch(/Please wait \d+ seconds/);
    const retryAfter = Number(limited.headers['retry-after']);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(300);
  });
});

describe('route limits (multiplier 1)', () => {
  it('login: the 11th attempt from one IP within 15 min → 429', async () => {
    const app = createTestApp({
      env: { RATE_LIMIT_MULTIPLIER: '1' },
      rateLimits: DEFAULT_RATE_LIMITS,
    });
    // Different usernames, so the (username, IP) lock never triggers: this is the IP limiter.
    for (let i = 1; i <= 10; i += 1) {
      const res = await request(app.app)
        .post('/api/auth/login')
        .set('Origin', TEST_ORIGIN)
        .send({ username: `user${i}`, password: 'wrong password!' });
      expect(res.status).toBe(401);
    }
    const limited = await request(app.app)
      .post('/api/auth/login')
      .set('Origin', TEST_ORIGIN)
      .send({ username: 'user11', password: 'wrong password!' });
    expect(limited.status).toBe(429);
    expect(limited.headers['retry-after']).toBeDefined();
    await app.close();
  });

  it('pair: the 11th attempt from one IP within 15 min → 429', async () => {
    const app = createTestApp({
      env: { RATE_LIMIT_MULTIPLIER: '1' },
      rateLimits: DEFAULT_RATE_LIMITS,
    });
    for (let i = 0; i < 10; i += 1) {
      const res = await request(app.app)
        .post('/api/kitchen/pair')
        .set('Origin', TEST_ORIGIN)
        .send({ code: 'ABCD-EFGH' });
      expect(res.status).toBe(400);
    }
    const limited = await request(app.app)
      .post('/api/kitchen/pair')
      .set('Origin', TEST_ORIGIN)
      .send({ code: 'ABCD-EFGH' });
    expect(limited.status).toBe(429);
    await app.close();
  });

  it('pairing codes: 10 per hour per owner, counted per owner', async () => {
    await truncateAll();
    const app = createTestApp({
      env: { RATE_LIMIT_MULTIPLIER: '1' },
      rateLimits: DEFAULT_RATE_LIMITS,
    });
    await createOwner(app.prisma, 'owner');
    await createOwner(app.prisma, 'partner');
    const first = await loginOwner(app.app, 'owner');
    const second = await loginOwner(app.app, 'partner');
    const issue = (cookie: string) =>
      request(app.app)
        .post('/api/kitchen/pairing-codes')
        .set('Origin', TEST_ORIGIN)
        .set('Cookie', cookie)
        .send({ deviceLabel: 'TV' });
    for (let i = 0; i < 10; i += 1) expect((await issue(first)).status).toBe(201);
    expect((await issue(first)).status).toBe(429);
    expect((await issue(second)).status).toBe(201);
    await app.close();
  });
});

describe('order creation limit (multiplier 1)', () => {
  it('the 31st order from one session within a minute → 429', async () => {
    await truncateAll();
    const app = createTestApp({
      env: { RATE_LIMIT_MULTIPLIER: '1' },
      rateLimits: DEFAULT_RATE_LIMITS,
    });
    await createOwner(app.prisma);
    const cookie = await loginOwner(app.app);
    for (let i = 0; i < 30; i += 1) {
      expect((await postOrder(app.app, cookie, { text: `o${i}`, source: 'PHONE' })).status).toBe(
        201,
      );
    }
    const limited = await postOrder(app.app, cookie, { text: 'o31', source: 'PHONE' });
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');
    expect(await app.prisma.order.count()).toBe(30);
    await app.close();
  });
});
