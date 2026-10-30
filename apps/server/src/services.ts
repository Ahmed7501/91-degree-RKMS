import type { Env } from './config/env';
import type { Db } from './db/prisma';
import type { RateLimitConfig } from './http/middleware/rate-limit';
import type { Clock } from './lib/clock';
import type { Logger } from './lib/logger';
import { AuthService, LoginLock } from './modules/auth/auth.service';
import { SessionService, ttlsFromEnv } from './modules/auth/session.service';
import { PairingService } from './modules/kitchen-devices/pairing.service';
import { MenuCatalog } from './modules/menu/menu-catalog';
import { OrderEventBus } from './modules/orders/order-events';
import { OrdersRepository } from './modules/orders/orders.repository';
import { OrdersService } from './modules/orders/orders.service';

export interface CoreDeps {
  env: Env;
  logger: Logger;
  clock: Clock;
  prisma: Db;
  rateLimits: RateLimitConfig;
  /** Defaults to the bundled menu file; an invalid file throws MenuDataError at startup. */
  menu?: MenuCatalog;
}

export interface Services {
  sessions: SessionService;
  auth: AuthService;
  pairing: PairingService;
  menu: MenuCatalog;
  orderEvents: OrderEventBus;
  ordersRepo: OrdersRepository;
  orders: OrdersService;
}

/** One instance of each service, shared by the HTTP app and (from P6) the socket server. */
export function createServices({
  env,
  logger,
  clock,
  prisma,
  rateLimits,
  ...deps
}: CoreDeps): Services {
  const menu = deps.menu ?? MenuCatalog.load();
  const sessions = new SessionService(prisma, clock, ttlsFromEnv(env));
  const orderEvents = new OrderEventBus((error) =>
    logger.error(
      {
        event: 'order_event_listener_failed',
        errorName: error instanceof Error ? error.name : typeof error,
      },
      'order event listener failed',
    ),
  );
  const ordersRepo = new OrdersRepository(prisma);
  return {
    sessions,
    menu,
    orderEvents,
    ordersRepo,
    orders: new OrdersService(prisma, ordersRepo, clock, env, orderEvents, logger, menu),
    auth: new AuthService(prisma, sessions, new LoginLock(rateLimits.loginLock, clock), logger),
    pairing: new PairingService(prisma, sessions, clock, logger),
  };
}
