import { LoginBody } from '@rkds/shared';
import { Router } from 'express';
import type { Env } from '../../config/env';
import { input, validate } from '../../http/validate';
import type { Clock } from '../../lib/clock';
import type { AuthService } from './auth.service';
import { clearSessionCookie, setSessionCookie } from './cookies';
import { currentSession } from './require-role';
import { toSessionDto, type SessionService } from './session.service';
import type { RequestHandler } from 'express';

export interface AuthRouteDeps {
  env: Env;
  clock: Clock;
  auth: AuthService;
  sessions: SessionService;
  loginLimiter: RequestHandler;
}

/** POST /login, POST /logout, GET /session (API_CONTRACTS §3). */
export function authRoutes({ env, clock, auth, sessions, loginLimiter }: AuthRouteDeps): Router {
  const router = Router();

  router.post('/login', loginLimiter, validate(LoginBody, 'body'), async (req, res) => {
    const body = input<LoginBody>(res, 'body');
    const { token, session } = await auth.login({
      username: body.username,
      password: body.password,
      ip: req.ip ?? 'unknown',
      userAgent: req.get('user-agent'),
      previousSession: currentSession(res),
    });
    setSessionCookie(res, env, token, sessions.absoluteMsFor('OWNER'));
    res.json({ session: toSessionDto(session), serverTime: clock.now().toISOString() });
  });

  router.post('/logout', async (_req, res) => {
    await auth.logout(currentSession(res));
    clearSessionCookie(res, env);
    res.json({ ok: true });
  });

  router.get('/session', (_req, res) => {
    const session = currentSession(res);
    res.json({
      session: session ? toSessionDto(session) : null,
      serverTime: clock.now().toISOString(),
    });
  });

  return router;
}
