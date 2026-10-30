import type { RequestHandler } from 'express';
import helmet from 'helmet';
import { AppError } from '../../errors/app-error';

/**
 * API security headers (SECURITY §6). The HTML/static CSP is set by the web nginx; API
 * responses are JSON only, so they get a deny-everything CSP.
 */
export const securityHeaders: RequestHandler = helmet({
  contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
  crossOriginOpenerPolicy: { policy: 'same-origin' },
  crossOriginResourcePolicy: { policy: 'same-origin' },
  referrerPolicy: { policy: 'no-referrer' },
  frameguard: { action: 'deny' },
  // HSTS is set by the HTTPS proxy in front of the stack (SECURITY §10).
  strictTransportSecurity: false,
});

export const noStore: RequestHandler = (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
};

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Requests with a body must be JSON: blocks HTML form posts (CSRF defence 3, SECURITY §4). */
export const requireJsonBody: RequestHandler = (req, _res, next) => {
  const hasBody =
    req.get('transfer-encoding') !== undefined || Number(req.get('content-length') ?? 0) > 0;
  if (UNSAFE_METHODS.has(req.method) && hasBody && !req.is('application/json')) {
    next(new AppError('UNSUPPORTED_MEDIA_TYPE'));
    return;
  }
  next();
};
