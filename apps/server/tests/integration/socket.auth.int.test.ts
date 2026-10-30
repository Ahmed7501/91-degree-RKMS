import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { TEST_ORIGIN } from '../helpers/app-harness';
import { createOwner, loginOwner, pairKitchen } from '../helpers/factories';
import {
  connectSocket,
  nextEvent,
  startTestServer,
  waitForDisconnect,
  type TestServer,
  type TestSocket,
} from '../helpers/socket-client';
import { truncateAll } from '../helpers/test-db';

let s: TestServer;
const open: TestSocket[] = [];
let owner: string;

beforeAll(async () => {
  s = await startTestServer();
});
afterAll(() => s.stop());
beforeEach(async () => {
  await truncateAll();
  s.clock.set('2026-10-29T13:00:00.000Z');
  await createOwner(s.prisma);
  owner = await loginOwner(s.app);
});
afterEach(() => {
  for (const socket of open.splice(0)) socket.close();
});

async function connect(options: Parameters<typeof connectSocket>[1]) {
  const result = await connectSocket(s.url, options);
  open.push(result.socket);
  return result;
}

describe('socket handshake (REALTIME_FLOW §1)', () => {
  it('rejects a connection without a session cookie', async () => {
    await expect(connect({})).rejects.toThrow('UNAUTHENTICATED');
  });

  it('rejects a forged or revoked cookie', async () => {
    await expect(connect({ cookie: 'rkds_sid=forged' })).rejects.toThrow('UNAUTHENTICATED');
    await request(s.app)
      .post('/api/auth/logout')
      .set('Origin', TEST_ORIGIN)
      .set('Cookie', owner)
      .send({});
    await expect(connect({ cookie: owner })).rejects.toThrow('UNAUTHENTICATED');
  });

  it('rejects a foreign Origin even with a valid cookie', async () => {
    await expect(connect({ cookie: owner, origin: 'https://evil.example' })).rejects.toThrow();
  });

  it('accepts a missing Origin with a valid cookie (same-origin polling GETs)', async () => {
    const { hello } = await connect({ cookie: owner, origin: null });
    expect(hello.role).toBe('OWNER');
  });

  it('owner and kitchen both connect and receive server:hello with serverTime and role', async () => {
    const kitchen = await pairKitchen(s.app, owner);
    const a = await connect({ cookie: owner });
    const b = await connect({ cookie: kitchen });
    expect(a.hello).toEqual({ serverTime: '2026-10-29T13:00:00.000Z', role: 'OWNER' });
    expect(b.hello.role).toBe('KITCHEN');
  });

  it('a polling-only client connects (proxies that block WebSocket)', async () => {
    const { socket } = await connect({ cookie: owner, transports: ['polling'] });
    expect(socket.io.engine.transport.name).toBe('polling');
  });
});

describe('revocation disconnects sockets', () => {
  it('logout → session:revoked LOGOUT, then disconnect', async () => {
    const { socket } = await connect({ cookie: owner });
    const revoked = nextEvent<{ reason: string }>(socket, 'session:revoked');
    const closed = waitForDisconnect(socket);
    await request(s.app)
      .post('/api/auth/logout')
      .set('Origin', TEST_ORIGIN)
      .set('Cookie', owner)
      .send({});
    expect(await revoked).toEqual({ reason: 'LOGOUT' });
    expect(await closed).toBe('io server disconnect');
  });

  it('revoking a kitchen device disconnects only that screen', async () => {
    const grill = await pairKitchen(s.app, owner, 'Grill TV');
    const fryer = await pairKitchen(s.app, owner, 'Fryer');
    const grillSocket = (await connect({ cookie: grill })).socket;
    const fryerSocket = (await connect({ cookie: fryer })).socket;
    const grillRow = await s.prisma.session.findFirstOrThrow({
      where: { deviceLabel: 'Grill TV' },
    });
    const revoked = nextEvent<{ reason: string }>(grillSocket, 'session:revoked');
    await request(s.app)
      .delete(`/api/kitchen/devices/${grillRow.id}`)
      .set('Origin', TEST_ORIGIN)
      .set('Cookie', owner);
    expect(await revoked).toEqual({ reason: 'REVOKED' });
    await waitForDisconnect(grillSocket);
    expect(fryerSocket.connected).toBe(true);
  });

  it('the sweeper disconnects a session that expired while connected', async () => {
    const { socket } = await connect({ cookie: owner });
    s.clock.advance(25 * 3_600_000); // owner idle limit is 24 h
    const revoked = nextEvent<{ reason: string }>(socket, 'session:revoked');
    expect(await s.realtime.sweep()).toBe(1);
    expect(await revoked).toEqual({ reason: 'EXPIRED' });
    await waitForDisconnect(socket);
  });

  it('the sweeper disconnects a disabled owner (e.g. disabled from the CLI)', async () => {
    const { socket } = await connect({ cookie: owner });
    await s.prisma.user.updateMany({ data: { disabledAt: new Date() } });
    const closed = waitForDisconnect(socket);
    expect(await s.realtime.sweep()).toBe(1);
    await closed;
  });

  it('the sweeper leaves live sessions connected', async () => {
    const { socket } = await connect({ cookie: owner });
    expect(await s.realtime.sweep()).toBe(0);
    expect(socket.connected).toBe(true);
  });
});
