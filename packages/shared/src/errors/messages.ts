import type { ErrorCode } from './codes';

const KEPT = 'Your order text is kept.';
const UNAVAILABLE = `Kitchen system is temporarily unavailable. ${KEPT}`;

/** Safe, user-facing messages (docs/ERROR_HANDLING.md §2). Never include internals. */
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  VALIDATION_FAILED: 'Please check the highlighted fields.',
  INVALID_JSON: 'The request was malformed. Please reload the page.',
  IDEMPOTENCY_KEY_REQUIRED: 'Please reload the page and try again.',
  PAIRING_CODE_INVALID: 'That code is invalid or expired. Ask the owner for a new one.',
  UNAUTHENTICATED: 'Please sign in.',
  INVALID_CREDENTIALS: 'Incorrect username or password.',
  SESSION_EXPIRED: 'Your session ended. Please sign in again — your draft is kept.',
  FORBIDDEN: "You don't have permission to do that.",
  CSRF_REJECTED: 'Request blocked for security. Please reload the page.',
  ORDER_NOT_FOUND: 'This order no longer exists.',
  NOT_FOUND: 'Not found.',
  ROUTE_NOT_FOUND: 'Not found.',
  INVALID_STATUS_TRANSITION: 'This order was already closed.',
  MENU_ITEM_UNAVAILABLE:
    'Some selected items are no longer on the menu. The menu was refreshed: check the order and send again.',
  PAYLOAD_TOO_LARGE: 'Order is too long (max 5,000 characters).',
  UNSUPPORTED_MEDIA_TYPE: 'Please reload the page.',
  IDEMPOTENCY_KEY_REUSED: 'An earlier version of this order was already sent.',
  RATE_LIMITED: 'Too many attempts. Please wait a moment and try again.',
  INTERNAL_ERROR: `Something went wrong. ${KEPT} Try again.`,
  DATABASE_UNAVAILABLE: UNAVAILABLE,
  SERVICE_UNAVAILABLE: UNAVAILABLE,
  REQUEST_TIMEOUT: UNAVAILABLE,
  NETWORK_ERROR: `No connection to the kitchen system. ${KEPT}`,
  CLIENT_TIMEOUT: `The kitchen system is slow to respond. ${KEPT}`,
  BAD_RESPONSE: `Unexpected response from the server. ${KEPT}`,
};

export interface MessageParams {
  /** RATE_LIMITED: seconds until retry. */
  retryAfterSeconds?: number;
  /** INVALID_STATUS_TRANSITION: the order's current status. */
  currentStatus?: 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  /** IDEMPOTENCY_KEY_REUSED: display number of the order already sent. */
  existingDisplayNumber?: string;
}

/** Catalog message with the documented placeholders filled in. */
export function messageFor(code: ErrorCode, params: MessageParams = {}): string {
  if (code === 'RATE_LIMITED' && params.retryAfterSeconds !== undefined) {
    return `Too many attempts. Please wait ${params.retryAfterSeconds} seconds.`;
  }
  if (
    code === 'INVALID_STATUS_TRANSITION' &&
    params.currentStatus &&
    params.currentStatus !== 'ACTIVE'
  ) {
    return `This order was already ${params.currentStatus.toLowerCase()}.`;
  }
  if (code === 'IDEMPOTENCY_KEY_REUSED' && params.existingDisplayNumber) {
    return `An earlier version of this order was already sent as #${params.existingDisplayNumber}.`;
  }
  return ERROR_MESSAGES[code];
}
