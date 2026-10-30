import {
  ErrorEnvelope,
  isServerErrorCode,
  messageFor,
  type ErrorCode,
  type MessageParams,
} from '@rkds/shared';
import type { z } from 'zod';
import { ApiError } from './api-error';
import { clockSync, type ClockSync } from './clock-sync';

export const DEFAULT_TIMEOUT_MS = 10_000;

export interface ApiFetchOptions<T> {
  method?: 'GET' | 'POST' | 'DELETE';
  body?: unknown;
  schema: z.ZodType<T>;
  timeoutMs?: number;
  idempotencyKey?: string;
}

let unauthenticatedHandler: (() => void) | undefined;

/** The session context registers here; any 401 outside login marks the device signed out. */
export function setUnauthenticatedHandler(handler: (() => void) | undefined): void {
  unauthenticatedHandler = handler;
}

interface Deps {
  fetch: typeof fetch;
  clock: ClockSync;
  now: () => number;
}

const defaultDeps = (): Deps => ({
  fetch: (...args) => globalThis.fetch(...args),
  clock: clockSync,
  now: () => Date.now(),
});

function messageParams(code: ErrorCode, details: unknown, retryAfter: number | undefined) {
  const params: MessageParams = {};
  if (retryAfter !== undefined) params.retryAfterSeconds = retryAfter;
  const d = details as { currentStatus?: unknown; existingOrderNumber?: unknown } | undefined;
  if (code === 'INVALID_STATUS_TRANSITION' && typeof d?.currentStatus === 'string') {
    params.currentStatus = d.currentStatus as MessageParams['currentStatus'];
  }
  if (code === 'IDEMPOTENCY_KEY_REUSED' && typeof d?.existingOrderNumber === 'number') {
    params.existingDisplayNumber = String(d.existingOrderNumber).padStart(3, '0');
  }
  return params;
}

/**
 * JSON fetch against the same-origin API (ERROR_HANDLING §4): request id, idempotency key,
 * timeout, envelope parsing, response validation with the shared schema, and clock samples.
 */
export async function apiFetch<T>(
  path: string,
  options: ApiFetchOptions<T>,
  deps: Deps = defaultDeps(),
): Promise<T> {
  const requestId = crypto.randomUUID();
  const headers: Record<string, string> = { Accept: 'application/json', 'X-Request-Id': requestId };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const t0 = deps.now();
  let response: Response;
  try {
    response = await deps.fetch(path, {
      method: options.method ?? 'GET',
      headers,
      credentials: 'same-origin',
      signal: controller.signal,
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    });
  } catch {
    const code = controller.signal.aborted ? 'CLIENT_TIMEOUT' : 'NETWORK_ERROR';
    throw new ApiError(code, messageFor(code), undefined, requestId);
  } finally {
    clearTimeout(timer);
  }
  const t1 = deps.now();

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    json = undefined;
  }

  if (!response.ok) {
    const envelope = ErrorEnvelope.safeParse(json);
    if (!envelope.success || !isServerErrorCode(envelope.data.error.code)) {
      // A bare 408 comes from Node's slow-client timeout; proxies send HTML error pages.
      const code = response.status === 408 ? 'SERVICE_UNAVAILABLE' : 'BAD_RESPONSE';
      throw new ApiError(code, messageFor(code), response.status, requestId);
    }
    const { code, message, details } = envelope.data.error;
    const retryHeader = Number(response.headers.get('retry-after'));
    const retryAfter = Number.isFinite(retryHeader) && retryHeader > 0 ? retryHeader : undefined;
    const text =
      code === 'VALIDATION_FAILED'
        ? message
        : messageFor(code, messageParams(code, details, retryAfter));
    const error = new ApiError(
      code,
      text,
      response.status,
      envelope.data.error.requestId,
      details,
      retryAfter,
    );
    if (response.status === 401 && !path.startsWith('/api/auth/login')) unauthenticatedHandler?.();
    throw error;
  }

  const parsed = options.schema.safeParse(json);
  if (!parsed.success) {
    throw new ApiError('BAD_RESPONSE', messageFor('BAD_RESPONSE'), response.status, requestId);
  }
  const serverTime = (json as { serverTime?: unknown }).serverTime;
  if (typeof serverTime === 'string') deps.clock.addSample(serverTime, t0, t1);
  return parsed.data;
}
