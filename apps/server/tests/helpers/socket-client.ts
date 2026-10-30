import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { ServerHelloPayload } from '@rkds/shared';
import { io as connect, type Socket } from 'socket.io-client';
import { createRealtime, type Realtime } from '../../src/realtime/socket-server';
import { createTestApp, TEST_ORIGIN, type TestApp, type TestAppOptions } from './app-harness';

export interface TestServer extends TestApp {
  url: string;
  realtime: Realtime;
  http: Server;
  stop(): Promise<void>;
}

/** A listening HTTP server with the app and Socket.IO, on a random local port. */
export async function startTestServer(options: TestAppOptions = {}): Promise<TestServer> {
  const t = createTestApp(options);
  const http = createServer(t.app);
  const realtime = createRealtime(http, {
    env: t.env,
    logger: createSilentLogger(),
    clock: t.clock,
    services: t.services,
    sweepIntervalMs: 3_600_000, // tests trigger sweeps explicitly
  });
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
  const { port } = http.address() as AddressInfo;
  return {
    ...t,
    url: `http://127.0.0.1:${port}`,
    realtime,
    http,
    stop: async () => {
      await realtime.close();
      await t.close();
    },
  };
}

function createSilentLogger() {
  // Socket logs are not asserted on; keep test output quiet.
  return { debug() {}, info() {}, warn() {}, error() {}, fatal() {} } as never;
}

export interface ConnectOptions {
  cookie?: string;
  origin?: string | null;
  transports?: ('polling' | 'websocket')[];
}

export type TestSocket = Socket;

/** Connects and resolves with `server:hello`, or rejects with the connect_error message. */
export function connectSocket(
  url: string,
  { cookie, origin = TEST_ORIGIN, transports }: ConnectOptions = {},
): Promise<{ socket: TestSocket; hello: ServerHelloPayload }> {
  const headers: Record<string, string> = {};
  if (cookie) headers.cookie = cookie;
  if (origin) headers.origin = origin;
  const socket = connect(url, {
    path: '/socket.io',
    reconnection: false,
    forceNew: true,
    extraHeaders: headers,
    ...(transports ? { transports } : {}),
    timeout: 5_000,
  });
  return new Promise((resolve, reject) => {
    socket.once('server:hello', (hello: ServerHelloPayload) => resolve({ socket, hello }));
    socket.once('connect_error', (error: Error) => {
      socket.close();
      reject(error);
    });
  });
}

/** Resolves with the next payload of `event`, or rejects after `timeoutMs`. */
export function nextEvent<T>(socket: TestSocket, event: string, timeoutMs = 3_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`timed out waiting for ${event}`));
    }, timeoutMs);
    const handler = (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    };
    socket.once(event, handler);
  });
}

/** Collects every payload of `event` until read. */
export function collect<T>(socket: TestSocket, event: string): T[] {
  const items: T[] = [];
  socket.on(event, (payload: T) => items.push(payload));
  return items;
}

export function waitForDisconnect(socket: TestSocket, timeoutMs = 3_000): Promise<string> {
  return new Promise((resolve, reject) => {
    if (socket.disconnected) {
      resolve('already disconnected');
      return;
    }
    const timer = setTimeout(() => reject(new Error('socket stayed connected')), timeoutMs);
    socket.once('disconnect', (reason) => {
      clearTimeout(timer);
      resolve(reason);
    });
  });
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
