import { z } from 'zod';
import { SessionRole } from './auth';
import { IsoDateTime } from './common';
import { OrderDto } from './order';

/** Server → client events (docs/REALTIME_FLOW.md §2). Sockets are broadcast-only. */
export const SOCKET_EVENTS = {
  HELLO: 'server:hello',
  ORDER_CREATED: 'order:created',
  ORDER_UPDATED: 'order:updated',
  SESSION_REVOKED: 'session:revoked',
} as const;

export const ServerHelloPayload = z.strictObject({ serverTime: IsoDateTime, role: SessionRole });
export type ServerHelloPayload = z.infer<typeof ServerHelloPayload>;

export const OrderEventPayload = z.strictObject({ order: OrderDto, serverTime: IsoDateTime });
export type OrderEventPayload = z.infer<typeof OrderEventPayload>;

export const SessionRevokedReason = z.enum(['LOGOUT', 'REVOKED', 'EXPIRED']);
export type SessionRevokedReason = z.infer<typeof SessionRevokedReason>;

export const SessionRevokedPayload = z.strictObject({ reason: SessionRevokedReason });
export type SessionRevokedPayload = z.infer<typeof SessionRevokedPayload>;

export interface ServerToClientEvents {
  'server:hello': (payload: ServerHelloPayload) => void;
  'order:created': (payload: OrderEventPayload) => void;
  'order:updated': (payload: OrderEventPayload) => void;
  'session:revoked': (payload: SessionRevokedPayload) => void;
}

/** Clients never send events (CLAUDE.md rule 7). */
export type ClientToServerEvents = Record<string, never>;
