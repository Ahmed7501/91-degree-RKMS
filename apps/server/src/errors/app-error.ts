import { httpStatusFor, messageFor, type MessageParams, type ServerErrorCode } from '@rkds/shared';

export interface AppErrorOptions {
  details?: unknown;
  cause?: unknown;
  /** Overrides the default (warn for 4xx, error for 5xx). */
  logLevel?: 'warn' | 'error';
  /** Fills message placeholders (ERROR_HANDLING §2). */
  messageParams?: MessageParams;
  /** Overrides the catalog message, e.g. a field-specific validation message. */
  message?: string;
}

/** The only error type services throw deliberately. Status comes from the shared code map. */
export class AppError extends Error {
  readonly status: number;
  readonly details: unknown;
  readonly logLevel: 'warn' | 'error';

  constructor(
    readonly code: ServerErrorCode,
    options: AppErrorOptions = {},
  ) {
    super(options.message ?? messageFor(code, options.messageParams), { cause: options.cause });
    this.name = 'AppError';
    this.status = httpStatusFor(code);
    this.details = options.details;
    this.logLevel = options.logLevel ?? (this.status >= 500 ? 'error' : 'warn');
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
