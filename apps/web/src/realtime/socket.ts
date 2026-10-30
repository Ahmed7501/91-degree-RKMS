import type { ClientToServerEvents, ServerToClientEvents } from '@rkds/shared';
import { io, type Socket } from 'socket.io-client';

export type RkdsSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * Same-origin Socket.IO with the default transports (polling handshake, then WebSocket),
 * so it still works behind proxies that block WebSocket (ADR-023).
 */
export function createSocket(): RkdsSocket {
  return io({
    path: '/socket.io',
    withCredentials: true,
    reconnectionDelay: 1_000,
    reconnectionDelayMax: 10_000,
    timeout: 10_000,
  });
}
