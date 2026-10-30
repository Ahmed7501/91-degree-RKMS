import type { RequestHandler } from 'express';
import { AppError } from '../../errors/app-error';
import type { Logger } from '../../lib/logger';
import { logError, sendError } from './error-handler';

export const DEFAULT_REQUEST_TIMEOUT_MS = 12_000;

/**
 * Responds 503 REQUEST_TIMEOUT if a handler has not answered within `timeoutMs`
 * (ERROR_HANDLING §3). A late handler response is then dropped instead of crashing on
 * "headers already sent".
 */
export function requestTimeout(
  logger: Logger,
  timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
): RequestHandler {
  return (req, res, next) => {
    const timer = setTimeout(() => {
      if (res.headersSent) return;
      const error = new AppError('REQUEST_TIMEOUT', { logLevel: 'warn' });
      logError(logger, req, res, error);
      sendError(res, error);
      const ignoreLateResponse = () => res;
      res.json = ignoreLateResponse;
      res.send = ignoreLateResponse;
    }, timeoutMs);
    const clear = () => clearTimeout(timer);
    res.on('finish', clear);
    res.on('close', clear);
    next();
  };
}
