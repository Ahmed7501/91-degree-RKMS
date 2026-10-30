import { CreateOrderResponse, SessionResponse } from '@rkds/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiFetch, setUnauthenticatedHandler } from './api-client';
import { ApiError } from './api-error';
import { ClockSync } from './clock-sync';

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });

function deps(response: Response | (() => Promise<Response>), times = [1_000, 1_100]) {
  const clock = new ClockSync(() => 0);
  const fetch = vi.fn<typeof globalThis.fetch>(
    typeof response === 'function' ? response : () => Promise.resolve(response),
  );
  let i = 0;
  return { fetch, clock, now: () => times[Math.min(i++, times.length - 1)]! };
}

const envelope = (code: string, extra: object = {}) => ({
  error: { code, message: 'server message', requestId: 'req-1', ...extra },
});

afterEach(() => setUnauthenticatedHandler(undefined));

describe('apiFetch (ERROR_HANDLING §4)', () => {
  it('sends JSON with a request id and idempotency key, validates, and samples the clock', async () => {
    const d = deps(json(200, { session: null, serverTime: new Date(5_050).toISOString() }));
    const res = await apiFetch(
      '/api/auth/session',
      { method: 'POST', body: { a: 1 }, schema: SessionResponse, idempotencyKey: 'k-1' },
      d,
    );
    expect(res.session).toBeNull();
    const [, init] = d.fetch.mock.calls[0]!;
    const headers = init!.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['Idempotency-Key']).toBe('k-1');
    expect(headers['X-Request-Id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(init!.credentials).toBe('same-origin');
    expect(init!.body).toBe('{"a":1}');
    expect(d.clock.offsetMs()).toBe(5_050 - 1_050);
  });

  it('a rejected fetch → NETWORK_ERROR (retryable)', async () => {
    const d = deps(() => Promise.reject(new TypeError('failed')));
    await expect(apiFetch('/x', { schema: SessionResponse }, d)).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      retryable: true,
    });
  });

  it('an aborted request → CLIENT_TIMEOUT', async () => {
    const d = deps(
      () =>
        new Promise<Response>((_resolve, reject) => {
          setTimeout(() => reject(new DOMException('aborted', 'AbortError')), 30);
        }),
    );
    await expect(
      apiFetch('/x', { schema: SessionResponse, timeoutMs: 1 }, d),
    ).rejects.toMatchObject({
      code: 'CLIENT_TIMEOUT',
    });
  });

  it('a non-JSON error page → BAD_RESPONSE with the status', async () => {
    const d = deps(new Response('<html>502</html>', { status: 502 }));
    await expect(apiFetch('/x', { schema: SessionResponse }, d)).rejects.toMatchObject({
      code: 'BAD_RESPONSE',
      status: 502,
    });
  });

  it('a bare 408 → SERVICE_UNAVAILABLE', async () => {
    const d = deps(new Response('', { status: 408 }));
    await expect(apiFetch('/x', { schema: SessionResponse }, d)).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
    });
  });

  it('a success body that fails the schema → BAD_RESPONSE', async () => {
    const d = deps(json(200, { unexpected: true }));
    await expect(apiFetch('/x', { schema: CreateOrderResponse }, d)).rejects.toMatchObject({
      code: 'BAD_RESPONSE',
    });
  });

  it('maps the envelope: catalog message, Retry-After, details', async () => {
    const d = deps(json(429, envelope('RATE_LIMITED'), { 'Retry-After': '42' }));
    const error = await apiFetch('/x', { schema: SessionResponse }, d).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      code: 'RATE_LIMITED',
      status: 429,
      requestId: 'req-1',
      retryAfterSeconds: 42,
      message: 'Too many attempts. Please wait 42 seconds.',
    });
  });

  it('keeps field-specific validation messages and fills 409/422 placeholders', async () => {
    const validation = deps(
      json(400, {
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Order text cannot be empty.',
          requestId: 'r',
        },
      }),
    );
    await expect(apiFetch('/x', { schema: SessionResponse }, validation)).rejects.toMatchObject({
      message: 'Order text cannot be empty.',
    });
    const conflict = deps(
      json(409, envelope('INVALID_STATUS_TRANSITION', { details: { currentStatus: 'COMPLETED' } })),
    );
    await expect(apiFetch('/x', { schema: SessionResponse }, conflict)).rejects.toMatchObject({
      message: 'This order was already completed.',
    });
    const reused = deps(
      json(422, envelope('IDEMPOTENCY_KEY_REUSED', { details: { existingOrderNumber: 7 } })),
    );
    await expect(apiFetch('/x', { schema: SessionResponse }, reused)).rejects.toMatchObject({
      message: 'An earlier version of this order was already sent as #007.',
    });
  });

  it('a 401 tells the session context, except on the login endpoint', async () => {
    const handler = vi.fn();
    setUnauthenticatedHandler(handler);
    await apiFetch(
      '/api/orders/active',
      { schema: SessionResponse },
      deps(json(401, envelope('SESSION_EXPIRED'))),
    ).catch(() => undefined);
    expect(handler).toHaveBeenCalledTimes(1);
    await apiFetch(
      '/api/auth/login',
      { schema: SessionResponse },
      deps(json(401, envelope('INVALID_CREDENTIALS'))),
    ).catch(() => undefined);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('an unknown error code is treated as a bad response', async () => {
    const d = deps(json(500, envelope('SOMETHING_NEW')));
    await expect(apiFetch('/x', { schema: SessionResponse }, d)).rejects.toMatchObject({
      code: 'BAD_RESPONSE',
    });
  });
});
