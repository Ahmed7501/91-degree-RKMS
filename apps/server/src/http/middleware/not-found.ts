import type { RequestHandler } from 'express';
import { AppError } from '../../errors/app-error';

/** Any unmatched `/api/*` route (API_CONTRACTS §3 Fallback). */
export const notFound: RequestHandler = (_req, _res, next) => {
  next(new AppError('ROUTE_NOT_FOUND'));
};
