import { isRetryable, type ErrorCode } from '@rkds/shared';

/** The single error type the UI handles (ERROR_HANDLING §4). Switch on `code`, never `message`. */
export class ApiError extends Error {
  readonly retryable: boolean;

  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly status: number | undefined = undefined,
    readonly requestId: string | undefined = undefined,
    readonly details: unknown = undefined,
    readonly retryAfterSeconds: number | undefined = undefined,
  ) {
    super(message);
    this.name = 'ApiError';
    this.retryable = isRetryable(code);
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/** 401s that mean "this device has no valid session any more". */
export function isAuthError(error: unknown): boolean {
  return (
    isApiError(error) && (error.code === 'UNAUTHENTICATED' || error.code === 'SESSION_EXPIRED')
  );
}
