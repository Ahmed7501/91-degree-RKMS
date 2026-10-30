import type { ErrorRequestHandler, Request, Response } from 'express';
import { dbErrorInfo, mapDbError } from '../../db/errors';
import { AppError } from '../../errors/app-error';
import type { Logger } from '../../lib/logger';

/** Body-parser failures (ERROR_HANDLING §3). */
function fromBodyParser(error: unknown): AppError | undefined {
  const type = (error as { type?: unknown } | null)?.type;
  if (type === 'entity.parse.failed') return new AppError('INVALID_JSON', { cause: error });
  if (type === 'entity.too.large') return new AppError('PAYLOAD_TOO_LARGE', { cause: error });
  return undefined;
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  return fromBodyParser(error) ?? mapDbError(error);
}

function sessionRoleOf(res: Response): string | undefined {
  return (res.locals as { session?: { role?: string } }).session?.role;
}

/** Writes the standard envelope. Never includes messages or stacks from unknown errors. */
export function sendError(res: Response, error: AppError): void {
  const requestId = String((res.locals as { requestId?: string }).requestId ?? 'unknown');
  if (error.code === 'RATE_LIMITED' || error.status === 503) res.set('Cache-Control', 'no-store');
  res.status(error.status).json({
    error: {
      code: error.code,
      message: error.message,
      requestId,
      ...(error.details === undefined ? {} : { details: error.details }),
    },
  });
}

export function logError(logger: Logger, req: Request, res: Response, error: AppError): void {
  const original = error.cause;
  const fields: Record<string, unknown> = {
    requestId: (res.locals as { requestId?: string }).requestId,
    errorCode: error.code,
    method: req.method,
    route: req.route ? `${req.baseUrl}${String((req.route as { path: unknown }).path)}` : req.path,
    status: error.status,
    sessionRole: sessionRoleOf(res),
  };
  if (error.status >= 500 && original !== undefined) {
    const constraint = dbErrorInfo(original).constraint;
    if (constraint) fields.constraint = constraint;
    fields.errorName = original instanceof Error ? original.name : typeof original;
    fields.stack = original instanceof Error ? original.stack : undefined;
  }
  logger[error.logLevel](fields, 'request failed');
}

/** Last middleware: converts anything thrown into the envelope and logs it exactly once. */
export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (error: unknown, req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    const appError = toAppError(error);
    logError(logger, req, res, appError);
    sendError(res, appError);
  };
}
