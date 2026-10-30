import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sha256Hex } from '../../src/lib/crypto';
import { createTestApp, TEST_ORIGIN } from '../helpers/app-harness';
import { createOwner, loginOwner, OWNER_PASSWORD, sessionCookieFrom } from '../helpers/factories';
import { truncateAll } from '../helpers/test-db';

const t = createTestApp();
afterAll(() => t.close());
beforeEach(async () => {
  await truncateAll();
  t.clock.set('2026-10-29T13:00:00.000Z');
});

const login = (body: object) =>
  request(t.app).post('/api/auth/login').set('Origin', TEST_ORIGIN).send(body);
const session = (cookie?: string) => {
  const req = request(t.app).get('/api/auth/session');
  return cookie ? req.set('Cookie', cookie) : req;
};

describe('POST /api/auth/login', () => {
  it('signs in, sets a hardened cookie and stores only the token hash', async () => {
    const owner = await createOwner(t.prisma);
    const res = await login({ username: '  OWNER ', password: OWNER_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      session: {
        role: 'OWNER',
        user: { id: owner.id, username: 'owner' },
        deviceLabel: null,
        expiresAt: '2026-11-05T13:00:00.000Z',
      },
      serverTime: '2026-10-29T13:00:00.000Z',
    });
    const setCookie = (res.headers['set-cookie'] as unknown as string[])[0]!;
    expect(setCookie).toMatch(/^rkds_sid=[A-Za-z0-9_-]{43};/);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Strict');
    expect(setCookie).toContain('Path=/');
    expect(setCookie).toContain(`Max-Age=${7 * 24 * 3600}`);
    const token = sessionCookieFrom(res).split('=')[1]!;
    const rows = await t.prisma.session.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tokenHash).toBe(sha256Hex(token));
    expect(JSON.stringify(rows)).not.toContain(token);
  });

  it('gives the identical 401 for a wrong password and an unknown user', async () => {
    await createOwner(t.prisma);
    const wrong = await login({ username: 'owner', password: 'not the password!' });
    const unknown = await login({ username: 'nobody', password: 'not the password!' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
    expect({ ...wrong.body.error, requestId: 'x' }).toEqual({
      ...unknown.body.error,
      requestId: 'x',
    });
    expect(wrong.headers['set-cookie']).toBeUndefined();
  });

  it('validates the body strictly', async () => {
    const res = await login({ username: 'owner', password: OWNER_PASSWORD, role: 'OWNER' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('rotates: a session presented with a new login is revoked', async () => {
    await createOwner(t.prisma);
    const first = await loginOwner(t.app);
    const second = await request(t.app)
      .post('/api/auth/login')
      .set('Origin', TEST_ORIGIN)
      .set('Cookie', first)
      .send({ username: 'owner', password: OWNER_PASSWORD });
    expect(second.status).toBe(200);
    expect((await session(first)).body.session).toBeNull();
    expect((await session(sessionCookieFrom(second))).body.session.role).toBe('OWNER');
  });

  it('locks a (username, IP) pair after 5 failures without blocking another IP', async () => {
    const app = createTestApp({ env: { TRUST_PROXY: '1' } });
    await createOwner(app.prisma);
    const attempt = (ip: string, password: string) =>
      request(app.app)
        .post('/api/auth/login')
        .set('Origin', TEST_ORIGIN)
        .set('X-Forwarded-For', ip)
        .send({ username: 'owner', password });
    for (let i = 0; i < 5; i += 1) {
      expect((await attempt('203.0.113.7', 'wrong password!!')).status).toBe(401);
    }
    const locked = await attempt('203.0.113.7', OWNER_PASSWORD);
    expect(locked.status).toBe(429);
    expect(locked.body.error.code).toBe('RATE_LIMITED');
    // The real owner on another network is not locked out.
    expect((await attempt('198.51.100.20', OWNER_PASSWORD)).status).toBe(200);
    // After 15 minutes the pair may try again.
    app.clock.advance(15 * 60_000 + 1);
    expect((await attempt('203.0.113.7', OWNER_PASSWORD)).status).toBe(200);
    await app.close();
  });
});

describe('sessions', () => {
  it('GET /api/auth/session returns null without a session', async () => {
    const res = await session();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ session: null, serverTime: '2026-10-29T13:00:00.000Z' });
  });

  it('logout revokes server-side and clears the cookie', async () => {
    await createOwner(t.prisma);
    const cookie = await loginOwner(t.app);
    const res = await request(t.app)
      .post('/api/auth/logout')
      .set('Origin', TEST_ORIGIN)
      .set('Cookie', cookie)
      .send({});
    expect(res.body).toEqual({ ok: true });
    expect((res.headers['set-cookie'] as unknown as string[])[0]).toMatch(/^rkds_sid=;/);
    expect((await session(cookie)).body.session).toBeNull();
    const devices = await request(t.app).get('/api/kitchen/devices').set('Cookie', cookie);
    expect(devices.status).toBe(401);
    expect(devices.body.error.code).toBe('SESSION_EXPIRED');
  });

  it('logout without a session is a no-op', async () => {
    const res = await request(t.app).post('/api/auth/logout').set('Origin', TEST_ORIGIN).send({});
    expect(res.status).toBe(200);
  });

  it('expires after 24 h idle, and is kept alive by activity', async () => {
    await createOwner(t.prisma);
    const cookie = await loginOwner(t.app);
    t.clock.advance(23 * 3_600_000);
    expect((await session(cookie)).body.session).not.toBeNull(); // touches last_seen_at
    t.clock.advance(23 * 3_600_000);
    expect((await session(cookie)).body.session).not.toBeNull();
    t.clock.advance(24 * 3_600_000);
    expect((await session(cookie)).body.session).toBeNull();
  });

  it('expires after 7 days absolute even when active', async () => {
    await createOwner(t.prisma);
    const cookie = await loginOwner(t.app);
    for (let day = 0; day < 6; day += 1) {
      t.clock.advance(20 * 3_600_000);
      expect((await session(cookie)).body.session).not.toBeNull();
    }
    t.clock.set('2026-11-05T13:00:00.000Z');
    expect((await session(cookie)).body.session).toBeNull();
  });

  it('writes last_seen_at at most every 5 minutes', async () => {
    await createOwner(t.prisma);
    const cookie = await loginOwner(t.app);
    const lastSeen = async () =>
      (await t.prisma.session.findFirstOrThrow()).lastSeenAt.toISOString();
    t.clock.advance(4 * 60_000);
    await session(cookie);
    expect(await lastSeen()).toBe('2026-10-29T13:00:00.000Z');
    t.clock.advance(60_000);
    await session(cookie);
    expect(await lastSeen()).toBe('2026-10-29T13:05:00.000Z');
  });

  it('a disabled owner cannot log in and existing sessions stop working', async () => {
    const owner = await createOwner(t.prisma);
    const cookie = await loginOwner(t.app);
    await t.prisma.user.update({ where: { id: owner.id }, data: { disabledAt: new Date() } });
    expect((await session(cookie)).body.session).toBeNull();
    const row = await t.prisma.session.findFirstOrThrow();
    expect(row.revokedAt).not.toBeNull();
    const res = await login({ username: 'owner', password: OWNER_PASSWORD });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('a forged cookie is treated as no session', async () => {
    expect((await session('rkds_sid=forged-token')).body.session).toBeNull();
  });
});
