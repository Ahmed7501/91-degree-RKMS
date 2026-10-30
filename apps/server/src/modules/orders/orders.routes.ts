import { CreateOrderBody, HistoryQuery, IdempotencyKey, TransitionBody, Uuid } from '@rkds/shared';
import { Router, type RequestHandler, type Response } from 'express';
import { z } from 'zod';
import { AppError } from '../../errors/app-error';
import { input, validate } from '../../http/validate';
import type { Clock } from '../../lib/clock';
import { requireRole, sessionOf } from '../auth/require-role';
import type { Actor, OrdersService } from './orders.service';
import type { TerminalStatus } from './transitions';

export interface OrderRouteDeps {
  clock: Clock;
  orders: OrdersService;
  ordersLimiter: RequestHandler;
}

const IdParams = z.strictObject({ id: Uuid });

const requireIdempotencyKey: RequestHandler = (req, res, next) => {
  const key = IdempotencyKey.safeParse(req.get('idempotency-key'));
  if (!key.success) {
    next(new AppError('IDEMPOTENCY_KEY_REQUIRED'));
    return;
  }
  (res.locals as { idempotencyKey?: string }).idempotencyKey = key.data;
  next();
};

function actorOf(res: Response): Actor {
  return {
    userId: sessionOf(res).userId!,
    requestId: (res.locals as { requestId?: string }).requestId,
  };
}

/** Orders API (API_CONTRACTS §3). Only OWNER mutates; KITCHEN reads the active list. */
export function orderRoutes({ clock, orders, ordersLimiter }: OrderRouteDeps): Router {
  const router = Router();
  const serverTime = () => clock.now().toISOString();

  router.post(
    '/',
    requireRole('OWNER'),
    ordersLimiter,
    requireIdempotencyKey,
    validate(CreateOrderBody, 'body'),
    async (_req, res) => {
      const key = (res.locals as { idempotencyKey: string }).idempotencyKey;
      const { order, replayed } = await orders.create(
        input<CreateOrderBody>(res, 'body'),
        key,
        actorOf(res),
      );
      if (replayed) res.set('Idempotent-Replayed', 'true');
      res.status(replayed ? 200 : 201).json({ order, serverTime: serverTime() });
    },
  );

  router.get('/active', requireRole('OWNER', 'KITCHEN'), async (_req, res) => {
    const { orders: active, truncated } = await orders.listActive();
    res.json({ orders: active, serverTime: serverTime(), ...(truncated ? { truncated } : {}) });
  });

  router.get('/', requireRole('OWNER'), validate(HistoryQuery, 'query'), async (_req, res) => {
    const page = await orders.history(input<HistoryQuery>(res, 'query'));
    res.json({ ...page, serverTime: serverTime() });
  });

  router.get('/:id', requireRole('OWNER'), validate(IdParams, 'params'), async (_req, res) => {
    res.json(await orders.detail(input<{ id: string }>(res, 'params').id));
  });

  const transition = (target: TerminalStatus): RequestHandler[] => [
    requireRole('OWNER'),
    validate(IdParams, 'params'),
    validate(TransitionBody, 'body'),
    async (_req, res) => {
      const result = await orders.close(
        input<{ id: string }>(res, 'params').id,
        target,
        actorOf(res),
      );
      res.json({ ...result, serverTime: serverTime() });
    },
  ];
  router.post('/:id/complete', ...transition('COMPLETED'));
  router.post('/:id/cancel', ...transition('CANCELLED'));

  return router;
}
