import { describe, expect, it } from 'vitest';
import {
  CLIENT_ERROR_CODES,
  SERVER_ERROR_CODES,
  httpStatusFor,
  isRetryable,
  isServerErrorCode,
  type ServerErrorCode,
} from './codes';
import { ERROR_MESSAGES, messageFor } from './messages';

const serverCodes = Object.keys(SERVER_ERROR_CODES) as ServerErrorCode[];

describe('error codes (ERROR_HANDLING §2)', () => {
  it('maps every server code to a 4xx/5xx status', () => {
    for (const code of serverCodes) {
      expect(httpStatusFor(code)).toBeGreaterThanOrEqual(400);
      expect(httpStatusFor(code)).toBeLessThan(600);
    }
  });

  it.each([
    ['VALIDATION_FAILED', 400],
    ['UNAUTHENTICATED', 401],
    ['CSRF_REJECTED', 403],
    ['ORDER_NOT_FOUND', 404],
    ['INVALID_STATUS_TRANSITION', 409],
    ['MENU_ITEM_UNAVAILABLE', 409],
    ['PAYLOAD_TOO_LARGE', 413],
    ['UNSUPPORTED_MEDIA_TYPE', 415],
    ['IDEMPOTENCY_KEY_REUSED', 422],
    ['RATE_LIMITED', 429],
    ['INTERNAL_ERROR', 500],
    ['DATABASE_UNAVAILABLE', 503],
  ] as const)('%s → %i', (code, status) => {
    expect(httpStatusFor(code)).toBe(status);
  });

  it('retryable server codes are exactly the documented set', () => {
    expect(serverCodes.filter((code) => isRetryable(code)).sort()).toEqual(
      [
        'RATE_LIMITED',
        'INTERNAL_ERROR',
        'DATABASE_UNAVAILABLE',
        'SERVICE_UNAVAILABLE',
        'REQUEST_TIMEOUT',
      ].sort(),
    );
  });

  it('client-only transport failures are retryable and not server codes', () => {
    for (const code of CLIENT_ERROR_CODES) {
      expect(isRetryable(code)).toBe(true);
      expect(isServerErrorCode(code)).toBe(false);
    }
  });

  it('does not treat inherited object keys as codes', () => {
    expect(isServerErrorCode('toString')).toBe(false);
  });
});

describe('error messages', () => {
  it('every code has a non-empty message', () => {
    for (const code of [...serverCodes, ...CLIENT_ERROR_CODES]) {
      expect(ERROR_MESSAGES[code].length).toBeGreaterThan(0);
    }
  });

  it('messages that report failures while sending keep the owner reassured', () => {
    for (const code of ['INTERNAL_ERROR', 'DATABASE_UNAVAILABLE', 'NETWORK_ERROR'] as const) {
      expect(ERROR_MESSAGES[code]).toContain('order text is kept');
    }
  });

  it('fills documented placeholders', () => {
    expect(messageFor('RATE_LIMITED', { retryAfterSeconds: 42 })).toBe(
      'Too many attempts. Please wait 42 seconds.',
    );
    expect(messageFor('INVALID_STATUS_TRANSITION', { currentStatus: 'CANCELLED' })).toBe(
      'This order was already cancelled.',
    );
    expect(messageFor('IDEMPOTENCY_KEY_REUSED', { existingDisplayNumber: '012' })).toBe(
      'An earlier version of this order was already sent as #012.',
    );
  });

  it('falls back to the catalog message without parameters', () => {
    expect(messageFor('RATE_LIMITED')).toBe(ERROR_MESSAGES.RATE_LIMITED);
    expect(messageFor('INVALID_STATUS_TRANSITION', { currentStatus: 'ACTIVE' })).toBe(
      ERROR_MESSAGES.INVALID_STATUS_TRANSITION,
    );
  });
});
