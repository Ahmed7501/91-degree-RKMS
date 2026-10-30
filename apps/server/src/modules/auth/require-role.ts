import type { SessionRole } from '@rkds/shared';
import type { RequestHandler, Response } from 'express';
import type { Env } from '../../config/env';
import { AppError } from '../../errors/app-error';
import { sessionTokenFrom } from './cookies';
import type { ResolvedSession, SessionService } from './session.service';

interface SessionLocals {
  session?: ResolvedSession;
  /** A cookie was presented but no longer maps to a live session. */
  sessionEnded?: boolean;
}

/** Resolves the session cookie once per request and stores it on `res.locals.session`. */
export function loadSession(sessions: SessionService, env: Env): RequestHandler {
  return async (req, res, next) => {
    const token = sessionTokenFrom(req, env);
    if (token) {
      const session = await sessions.resolve(token);
      const locals = res.locals as SessionLocals;
      if (session) locals.session = session;
      else locals.sessionEnded = true;
    }
    next();
  };
}

export function currentSession(res: Response): ResolvedSession | undefined {
  return (res.locals as SessionLocals).session;
}

/** The authenticated session; only call after `requireRole`. */
export function sessionOf(res: Response): ResolvedSession {
  const session = currentSession(res);
  if (!session) throw new AppError('UNAUTHENTICATED');
  return session;
}

/** 401 without a live session (SESSION_EXPIRED if a stale cookie was sent), 403 for other roles. */
export function requireRole(...roles: SessionRole[]): RequestHandler {
  return (_req, res, next) => {
    const locals = res.locals as SessionLocals;
    if (!locals.session) {
      next(new AppError(locals.sessionEnded ? 'SESSION_EXPIRED' : 'UNAUTHENTICATED'));
      return;
    }
    if (!roles.includes(locals.session.role)) {
      next(new AppError('FORBIDDEN'));
      return;
    }
    next();
  };
}
