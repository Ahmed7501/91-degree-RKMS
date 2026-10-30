import type { IncomingMessage, ServerResponse } from 'node:http';
import type { RequestHandler } from 'express';
import { pinoHttp } from 'pino-http';
import type { Logger } from '../../lib/logger';

type Res = ServerResponse & { locals?: { requestId?: string; session?: { role?: string } } };

/**
 * Access log: one line per request with scalar fields only. Headers, query strings and bodies are
 * never logged (order text, cookies, codes). Errors are logged once by the error handler.
 */
export function httpLogger(logger: Logger): RequestHandler {
  return pinoHttp({
    logger,
    genReqId: (_req: IncomingMessage, res: ServerResponse) =>
      (res as Res).locals?.requestId ?? 'unknown',
    serializers: {
      req: (req: { method?: string; url?: string }) => ({
        method: req.method,
        path: (req.url ?? '').split('?')[0],
      }),
      res: (res: { statusCode?: number }) => ({ status: res.statusCode }),
      err: () => undefined,
    },
    customProps: (_req, res) => ({ sessionRole: (res as Res).locals?.session?.role }),
    customLogLevel: (_req, res, err) =>
      err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
    customSuccessMessage: () => 'request completed',
    customErrorMessage: () => 'request completed',
    quietReqLogger: true,
  });
}
