import { CreatePairingCodeBody, PairBody, Uuid } from '@rkds/shared';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import type { Env } from '../../config/env';
import { input, validate } from '../../http/validate';
import type { Clock } from '../../lib/clock';
import { setSessionCookie } from '../auth/cookies';
import { currentSession, requireRole, sessionOf } from '../auth/require-role';
import { toSessionDto, type SessionService } from '../auth/session.service';
import type { PairingService } from './pairing.service';

export interface KitchenRouteDeps {
  env: Env;
  clock: Clock;
  pairing: PairingService;
  sessions: SessionService;
  pairLimiter: RequestHandler;
  pairingCodesLimiter: RequestHandler;
}

const DeviceParams = z.strictObject({ id: Uuid });

/** Kitchen screen pairing and management (API_CONTRACTS §3). */
export function kitchenRoutes(deps: KitchenRouteDeps): Router {
  const { env, clock, pairing, sessions } = deps;
  const router = Router();

  router.post(
    '/pairing-codes',
    requireRole('OWNER'),
    deps.pairingCodesLimiter,
    validate(CreatePairingCodeBody, 'body'),
    async (_req, res) => {
      const body = input<CreatePairingCodeBody>(res, 'body');
      const owner = sessionOf(res);
      res.status(201).json(await pairing.createCode(owner.userId!, body.deviceLabel));
    },
  );

  router.post('/pair', deps.pairLimiter, validate(PairBody, 'body'), async (req, res) => {
    const body = input<PairBody>(res, 'body');
    const { token, session } = await pairing.pair(body.code, req.get('user-agent'));
    // The browser becomes a kitchen screen: end any session it had before (like login rotation).
    const previous = currentSession(res);
    if (previous) await sessions.revoke([previous.id], 'LOGOUT');
    setSessionCookie(res, env, token, sessions.absoluteMsFor('KITCHEN'));
    res.json({ session: toSessionDto(session), serverTime: clock.now().toISOString() });
  });

  router.get('/devices', requireRole('OWNER'), async (_req, res) => {
    res.json({ devices: await pairing.listDevices() });
  });

  router.delete(
    '/devices/:id',
    requireRole('OWNER'),
    validate(DeviceParams, 'params'),
    async (_req, res) => {
      await pairing.revokeDevice(input<{ id: string }>(res, 'params').id);
      res.json({ ok: true });
    },
  );

  return router;
}
