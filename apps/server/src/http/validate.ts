import type { ValidationIssue } from '@rkds/shared';
import type { RequestHandler, Response } from 'express';
import type { z } from 'zod';
import { AppError } from '../errors/app-error';

export type InputSource = 'body' | 'query' | 'params';

function toIssues(error: z.ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.length > 0 ? issue.path.join('.') : '(root)',
    message: issue.message,
  }));
}

/**
 * Parses one request part with a shared Zod schema and stores the result on
 * `res.locals.input[source]` (Express 5's `req.query` is read-only). Handlers read only parsed input.
 */
export function validate(schema: z.ZodType, source: InputSource): RequestHandler {
  return (req, res, next) => {
    const result = schema.safeParse(source === 'body' ? (req.body ?? {}) : req[source]);
    if (!result.success) {
      const details = toIssues(result.error);
      next(
        new AppError('VALIDATION_FAILED', {
          details,
          message: details.length === 1 ? details[0]!.message : undefined,
        }),
      );
      return;
    }
    const locals = res.locals as { input?: Partial<Record<InputSource, unknown>> };
    locals.input = { ...locals.input, [source]: result.data };
    next();
  };
}

/** Typed access to input stored by `validate`. */
export function input<T>(res: Response, source: InputSource): T {
  return (res.locals as { input: Record<InputSource, T> }).input[source];
}
