import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sha256Hex } from '../../src/lib/crypto';
import { createTestApp, TEST_ORIGIN } from '../helpers/app-harness';
import { createOwner, loginOwner, pairKitchen, sessionCookieFrom } from '../helpers/factories';
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

const issueCode = (label = 'Grill TV') =>
  request(t.app)
    .post('/api/kitchen/pairing-codes')
    .set('Origin', TEST_ORIGIN)
    .set('Cookie', owner)
    .send({ deviceLabel: label });
const pair = (code: string) =>
  request(t.app).post('/api/kitchen/pair').set('Origin', TEST_ORIGIN).send({ code });

describe('pairing codes', () => {
  it('issues a XXXX-XXXX code once and stores only its hash', async () => {
    const res = await issueCode('  Tandoor screen ');
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      code: expect.stringMatching(/^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/) as string,
      deviceLabel: 'Tandoor screen',
      expiresAt: '2026-10-29T13:10:00.000Z',
    });
    const row = await t.prisma.kitchenPairingCode.findFirstOrThrow();
    expect(row.codeHash).toBe(sha256Hex(String(res.body.code).replace('-', '')));
    expect(t.rawLogs()).not.toContain(String(res.body.code).replace('-', ''));
  });

  it('redeeming creates a KITCHEN session with the device label', async () => {
    const { code } = (await issueCode()).body;
    const res = await pair(String(code).toLowerCase());
    expect(res.status).toBe(200);
    expect(res.body.session).toEqual({
      role: 'KITCHEN',
      user: null,
      deviceLabel: 'Grill TV',
      expiresAt: '2027-01-27T13:00:00.000Z',
    });
    expect((res.headers['set-cookie'] as unknown as string[])[0]).toContain(
      `Max-Age=${90 * 24 * 3600}`,
    );
  });

  it('a code works once only', async () => {
    const { code } = (await issueCode()).body;
    expect((await pair(code)).status).toBe(200);
    const again = await pair(code);
    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe('PAIRING_CODE_INVALID');
  });

  it('an expired code is rejected with the same error', async () => {
    const { code } = (await issueCode()).body;
    t.clock.advance(10 * 60_000);
    const res = await pair(code);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('PAIRING_CODE_INVALID');
  });

  it.each(['ABCD-EF2', 'ILO0-1111', 'not a code'])(
    'malformed code %s → PAIRING_CODE_INVALID',
    async (code) => {
      const res = await pair(code);
      expect(res.body.error.code).toBe('PAIRING_CODE_INVALID');
    },
  );

  it('only owners may issue codes', async () => {
    const kitchen = await pairKitchen(t.app, owner);
    const asKitchen = await request(t.app)
      .post('/api/kitchen/pairing-codes')
      .set('Origin', TEST_ORIGIN)
      .set('Cookie', kitchen)
      .send({ deviceLabel: 'x' });
    expect(asKitchen.status).toBe(403);
    const anonymous = await request(t.app)
      .post('/api/kitchen/pairing-codes')
      .set('Origin', TEST_ORIGIN)
      .send({ deviceLabel: 'x' });
    expect(anonymous.status).toBe(401);
  });
});

describe('kitchen devices', () => {
  it('lists active screens only and revoking one ends its session', async () => {
    const grill = await pairKitchen(t.app, owner, 'Grill TV');
    await pairKitchen(t.app, owner, 'Fryer tablet');
    const list = await request(t.app).get('/api/kitchen/devices').set('Cookie', owner);
    expect(list.status).toBe(200);
    expect(list.body.devices.map((d: { deviceLabel: string }) => d.deviceLabel)).toEqual([
      'Grill TV',
      'Fryer tablet',
    ]);

    const grillId = (list.body.devices as Array<{ id: string; deviceLabel: string }>).find(
      (d) => d.deviceLabel === 'Grill TV',
    )!.id;
    const revoke = await request(t.app)
      .delete(`/api/kitchen/devices/${grillId}`)
      .set('Origin', TEST_ORIGIN)
      .set('Cookie', owner);
    expect(revoke.body).toEqual({ ok: true });

    const session = await request(t.app).get('/api/auth/session').set('Cookie', grill);
    expect(session.body.session).toBeNull();
    const after = await request(t.app).get('/api/kitchen/devices').set('Cookie', owner);
    expect(after.body.devices).toHaveLength(1);
  });

  it('revoking an unknown id or an owner session → 404 NOT_FOUND', async () => {
    const ownerRow = await t.prisma.session.findFirstOrThrow({ where: { role: 'OWNER' } });
    for (const id of [crypto.randomUUID(), ownerRow.id]) {
      const res = await request(t.app)
        .delete(`/api/kitchen/devices/${id}`)
        .set('Origin', TEST_ORIGIN)
        .set('Cookie', owner);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    }
    const bad = await request(t.app)
      .delete('/api/kitchen/devices/not-a-uuid')
      .set('Origin', TEST_ORIGIN)
      .set('Cookie', owner);
    expect(bad.status).toBe(400);
  });

  it('kitchen sessions end after 14 idle days', async () => {
    const kitchen = await pairKitchen(t.app, owner);
    t.clock.advance(14 * 86_400_000);
    const res = await request(t.app).get('/api/auth/session').set('Cookie', kitchen);
    expect(res.body.session).toBeNull();
    // A fresh owner login (the old owner session also idled out) no longer lists the screen.
    const freshOwner = await loginOwner(t.app);
    const list = await request(t.app).get('/api/kitchen/devices').set('Cookie', freshOwner);
    expect(list.body.devices).toEqual([]);
  });

  it('the pairing response cookie is a kitchen session cookie', async () => {
    const { code } = (await issueCode()).body;
    const cookie = sessionCookieFrom(await pair(code));
    const session = await request(t.app).get('/api/auth/session').set('Cookie', cookie);
    expect(session.body.session.role).toBe('KITCHEN');
  });
});

describe('pairing an already signed-in browser', () => {
  it('revokes the session the browser had before it became a kitchen screen', async () => {
    const { code } = (await issueCode()).body;
    const res = await request(t.app)
      .post('/api/kitchen/pair')
      .set('Origin', TEST_ORIGIN)
      .set('Cookie', owner)
      .send({ code });
    expect(res.status).toBe(200);
    const old = await request(t.app).get('/api/auth/session').set('Cookie', owner);
    expect(old.body.session).toBeNull();
  });
});
