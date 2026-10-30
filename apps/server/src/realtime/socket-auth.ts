import type { IncomingMessage } from 'node:http';
import type { SessionRole } from '@rkds/shared';
import type { Socket } from 'socket.io';
import type { Env } from '../config/env';
import { readCookie } from '../modules/auth/cookies';
import type { SessionService } from '../modules/auth/session.service';

export interface SocketAuth {
  sessionId: string;
  role: SessionRole;
}

export interface SocketData {
  auth: SocketAuth;
}

/**
 * `allowRequest`: reject a present-but-foreign Origin. A missing Origin is allowed because browsers
 * omit it on same-origin polling GETs; the session cookie is still required (ADR-023).
 */
export function originAllowed(req: IncomingMessage, appOrigin: string): boolean {
  const origin = req.headers.origin;
  return origin === undefined || origin === appOrigin;
}

/** Handshake middleware: a live OWNER or KITCHEN session, otherwise `UNAUTHENTICATED`. */
export function socketAuth(sessions: SessionService, env: Env) {
  return (socket: Socket, next: (error?: Error) => void) => {
    const token = readCookie(socket.request.headers.cookie, env.cookieName);
    const fail = () => next(new Error('UNAUTHENTICATED'));
    if (!token) {
      fail();
      return;
    }
    sessions.resolve(token).then(
      (session) => {
        if (!session) {
          fail();
          return;
        }
        (socket.data as SocketData).auth = { sessionId: session.id, role: session.role };
        next();
      },
      () => next(new Error('SERVICE_UNAVAILABLE')),
    );
  };
}
