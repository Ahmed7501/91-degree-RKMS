import { Router } from 'express';

/** Liveness and readiness (API_CONTRACTS §3 Health). Never reveals versions, hosts or errors. */
export function healthRoutes(checkDatabase: () => Promise<boolean>): Router {
  const router = Router();
  router.get('/live', (_req, res) => {
    res.json({ status: 'ok' });
  });
  router.get('/ready', async (_req, res) => {
    if (await checkDatabase()) {
      res.json({ status: 'ok', db: 'ok' });
    } else {
      res.status(503).json({ status: 'degraded', db: 'unavailable' });
    }
  });
  return router;
}
