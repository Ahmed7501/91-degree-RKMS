import type { RequestHandler } from 'express';
import { AppError } from '../../errors/app-error';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** State-changing requests must come from APP_ORIGIN. A missing Origin is rejected (SECURITY §4). */
export function originCheck(appOrigin: string): RequestHandler {
  return (req, _res, next) => {
    if (SAFE_METHODS.has(req.method)) {
      next();
      return;
    }
    if (req.get('origin') !== appOrigin) {
      next(new AppError('CSRF_REJECTED'));
      return;
    }
    next();
  };
}
