import type { Server as HttpServer } from 'node:http';
import {
  SOCKET_EVENTS,
  type ClientToServerEvents,
  type ServerToClientEvents,
  type SessionRevokedReason,
} from '@rkds/shared';
import { Server } from 'socket.io';
import type { Env } from '../config/env';
import type { Clock } from '../lib/clock';
import type { Logger } from '../lib/logger';
import type { Services } from '../services';
import { originAllowed, socketAuth, type SocketData } from './socket-auth';

export const ORDERS_ROOM = 'orders';
export const SWEEP_INTERVAL_MS = 60_000;
const sessionRoom = (sessionId: string) => `session:${sessionId}`;

export type RkdsSocketServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

export interface Realtime {
  io: RkdsSocketServer;
  /** Re-validates every connected session once; invalid ones are told and disconnected. */
  sweep(): Promise<number>;
  close(): Promise<void>;
}

export interface RealtimeDeps {
  env: Env;
  logger: Logger;
  clock: Clock;
  services: Services;
  sweepIntervalMs?: number;
}

/**
 * Broadcast-only Socket.IO (ADR-009, REALTIME_FLOW). Default transports: polling handshake, then
 * WebSocket upgrade. Clients never send events; anything they emit is ignored.
 */
export function createRealtime(httpServer: HttpServer, deps: RealtimeDeps): Realtime {
  const { env, logger, clock, services } = deps;
  const io: RkdsSocketServer = new Server(httpServer, {
    path: '/socket.io',
    serveClient: false,
    maxHttpBufferSize: 4_096,
    pingInterval: 25_000,
    pingTimeout: 20_000,
    allowRequest: (req, callback) => {
      const ok = originAllowed(req, env.appOrigin);
      if (!ok) logger.warn({ event: 'socket_origin_rejected' }, 'socket origin rejected');
      callback(ok ? null : 'FORBIDDEN', ok);
    },
  });

  io.use(socketAuth(services.sessions, env));

  io.on('connection', (socket) => {
    const { sessionId, role } = socket.data.auth;
    void socket.join([ORDERS_ROOM, sessionRoom(sessionId)]);
    socket.emit(SOCKET_EVENTS.HELLO, { serverTime: clock.now().toISOString(), role });
    socket.onAny((event: string) => {
      logger.debug({ event: 'socket_client_event_ignored', name: event.slice(0, 40) }, 'ignored');
    });
  });

  // Emitted only after the transaction committed; the bus is never called for replays.
  const unsubscribe = services.orderEvents.subscribe((kind, order) => {
    const event = kind === 'created' ? SOCKET_EVENTS.ORDER_CREATED : SOCKET_EVENTS.ORDER_UPDATED;
    io.to(ORDERS_ROOM).emit(event, { order, serverTime: clock.now().toISOString() });
  });

  const disconnectSessions = (sessionIds: string[], reason: SessionRevokedReason) => {
    for (const id of sessionIds) {
      io.to(sessionRoom(id)).emit(SOCKET_EVENTS.SESSION_REVOKED, { reason });
      io.in(sessionRoom(id)).disconnectSockets(true);
    }
  };
  services.sessions.onRevoke(disconnectSessions);

  const sweep = async (): Promise<number> => {
    const connected = [...io.of('/').sockets.values()];
    const ids = [...new Set(connected.map((s) => s.data.auth.sessionId))];
    const invalid = await services.sessions.invalidAmong(ids);
    disconnectSessions(invalid, 'EXPIRED');
    if (invalid.length > 0) {
      logger.info({ event: 'socket_sweep', disconnectedSessions: invalid.length }, 'swept');
    }
    return invalid.length;
  };
  const timer = setInterval(() => {
    sweep().catch((error: unknown) =>
      logger.error(
        { errorName: error instanceof Error ? error.name : typeof error },
        'socket sweep failed',
      ),
    );
  }, deps.sweepIntervalMs ?? SWEEP_INTERVAL_MS);
  timer.unref();

  return {
    io,
    sweep,
    close: () =>
      new Promise<void>((resolve) => {
        clearInterval(timer);
        unsubscribe();
        void io.close(() => resolve());
      }),
  };
}
