/** Stable error codes (docs/ERROR_HANDLING.md §2). Clients switch on `code`, never on `message`. */

export const SERVER_ERROR_CODES = {
  VALIDATION_FAILED: { status: 400, retryable: false },
  INVALID_JSON: { status: 400, retryable: false },
  IDEMPOTENCY_KEY_REQUIRED: { status: 400, retryable: false },
  PAIRING_CODE_INVALID: { status: 400, retryable: false },
  UNAUTHENTICATED: { status: 401, retryable: false },
  INVALID_CREDENTIALS: { status: 401, retryable: false },
  SESSION_EXPIRED: { status: 401, retryable: false },
  FORBIDDEN: { status: 403, retryable: false },
  CSRF_REJECTED: { status: 403, retryable: false },
  ORDER_NOT_FOUND: { status: 404, retryable: false },
  NOT_FOUND: { status: 404, retryable: false },
  ROUTE_NOT_FOUND: { status: 404, retryable: false },
  INVALID_STATUS_TRANSITION: { status: 409, retryable: false },
  MENU_ITEM_UNAVAILABLE: { status: 409, retryable: false },
  PAYLOAD_TOO_LARGE: { status: 413, retryable: false },
  UNSUPPORTED_MEDIA_TYPE: { status: 415, retryable: false },
  IDEMPOTENCY_KEY_REUSED: { status: 422, retryable: false },
  RATE_LIMITED: { status: 429, retryable: true },
  INTERNAL_ERROR: { status: 500, retryable: true },
  DATABASE_UNAVAILABLE: { status: 503, retryable: true },
  SERVICE_UNAVAILABLE: { status: 503, retryable: true },
  REQUEST_TIMEOUT: { status: 503, retryable: true },
} as const satisfies Record<string, { status: number; retryable: boolean }>;

export type ServerErrorCode = keyof typeof SERVER_ERROR_CODES;

/** Produced only by the browser API client, never sent by the server. */
export const CLIENT_ERROR_CODES = ['NETWORK_ERROR', 'CLIENT_TIMEOUT', 'BAD_RESPONSE'] as const;
export type ClientErrorCode = (typeof CLIENT_ERROR_CODES)[number];

export type ErrorCode = ServerErrorCode | ClientErrorCode;

export function isServerErrorCode(value: string): value is ServerErrorCode {
  return Object.hasOwn(SERVER_ERROR_CODES, value);
}

export function httpStatusFor(code: ServerErrorCode): number {
  return SERVER_ERROR_CODES[code].status;
}

/** Whether the same request may safely be retried. Client-side transport failures always are. */
export function isRetryable(code: ErrorCode): boolean {
  return isServerErrorCode(code) ? SERVER_ERROR_CODES[code].retryable : true;
}
