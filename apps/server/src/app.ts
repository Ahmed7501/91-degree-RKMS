import express, { type Express, type Response } from 'express';
import { pingDatabase } from './db/prisma';
import { errorHandler } from './http/middleware/error-handler';
import { httpLogger } from './http/middleware/http-logger';
import { notFound } from './http/middleware/not-found';
import { originCheck } from './http/middleware/origin-check';
import { createLimiter } from './http/middleware/rate-limit';
import { requestId } from './http/middleware/request-id';
import { DEFAULT_REQUEST_TIMEOUT_MS, requestTimeout } from './http/middleware/request-timeout';
import { noStore, requireJsonBody, securityHeaders } from './http/middleware/security';
import { authRoutes } from './modules/auth/auth.routes';
import { currentSession, loadSession } from './modules/auth/require-role';
import { healthRoutes } from './modules/health/health.routes';
import { kitchenRoutes } from './modules/kitchen-devices/kitchen-devices.routes';
import { menuRoutes } from './modules/menu/menu.routes';
import { orderRoutes } from './modules/orders/orders.routes';
import { createServices, type CoreDeps, type Services } from './services';

export interface AppDeps extends CoreDeps {
  /** Shared with the socket server; created here when not supplied. */
  services?: Services;
  requestTimeoutMs?: number;
  /** Overridable for tests; defaults to `SELECT 1` with a 2 s timeout. */
  checkDatabase?: () => Promise<boolean>;
}

const ownerKey = (_req: unknown, res: Response) => currentSession(res)?.userId ?? 'anonymous';
const sessionKey = (_req: unknown, res: Response) => currentSession(res)?.id ?? 'anonymous';

/**
 * Express app factory. Middleware order is fixed (ERROR_HANDLING §3):
 * request-id → logger → request-timeout → security → origin → json → rate-limit → routes
 * → notFound → errorHandler.
 */
export function createApp(deps: AppDeps): Express {
  const { env, logger, prisma, clock, rateLimits } = deps;
  const services = deps.services ?? createServices(deps);
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', env.trustProxy);

  app.use(requestId);
  app.use(httpLogger(logger));
  app.use(requestTimeout(logger, deps.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS));
  app.use(securityHeaders, noStore);
  app.use('/api', originCheck(env.appOrigin));
  app.use(requireJsonBody);
  app.use(express.json({ limit: '32kb', strict: true, type: 'application/json' }));
  app.use('/api', createLimiter(rateLimits.global));

  app.use('/api/health', healthRoutes(deps.checkDatabase ?? (() => pingDatabase(prisma))));
  app.use('/api', loadSession(services.sessions, env));
  app.use(
    '/api/auth',
    authRoutes({
      env,
      clock,
      auth: services.auth,
      sessions: services.sessions,
      loginLimiter: createLimiter(rateLimits.login),
    }),
  );
  app.use(
    '/api/kitchen',
    kitchenRoutes({
      env,
      clock,
      pairing: services.pairing,
      sessions: services.sessions,
      pairLimiter: createLimiter(rateLimits.pair),
      pairingCodesLimiter: createLimiter(rateLimits.pairingCodes, ownerKey),
    }),
  );
  app.use(
    '/api/orders',
    orderRoutes({
      clock,
      orders: services.orders,
      ordersLimiter: createLimiter(rateLimits.orders, sessionKey),
    }),
  );

  app.use('/api/menu', menuRoutes(services.menu));

  app.use(notFound);
  app.use(errorHandler(logger));
  return app;
}
