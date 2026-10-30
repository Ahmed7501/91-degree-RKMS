import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createTestApp, TEST_ORIGIN } from '../helpers/app-harness';

const t = createTestApp();
afterAll(() => t.close());

const post = (path: string) => request(t.app).post(path).set('Origin', TEST_ORIGIN);

function expectEnvelope(res: request.Response, code: string, status: number) {
  expect(res.status).toBe(status);
  expect(res.body).toEqual({
    error: expect.objectContaining({
      code,
      message: expect.any(String) as string,
      requestId: res.headers['x-request-id'] as string,
    }) as object,
  });
}

describe('error envelope (ERROR_HANDLING §1)', () => {
  it('malformed JSON → 400 INVALID_JSON', async () => {
    const res = await post('/api/anything').set('Content-Type', 'application/json').send('{"a":');
    expectEnvelope(res, 'INVALID_JSON', 400);
  });

  it('a 33 KB body → 413 PAYLOAD_TOO_LARGE', async () => {
    const res = await post('/api/anything')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ text: 'x'.repeat(33 * 1024) }));
    expectEnvelope(res, 'PAYLOAD_TOO_LARGE', 413);
  });

  it('a text/plain body → 415 UNSUPPORTED_MEDIA_TYPE', async () => {
    const res = await post('/api/anything').set('Content-Type', 'text/plain').send('hello');
    expectEnvelope(res, 'UNSUPPORTED_MEDIA_TYPE', 415);
  });

  it('a form post → 415 (blocks HTML form CSRF)', async () => {
    const res = await post('/api/anything').type('form').send({ a: '1' });
    expectEnvelope(res, 'UNSUPPORTED_MEDIA_TYPE', 415);
  });

  it('unknown routes → 404 ROUTE_NOT_FOUND, including outside /api', async () => {
    expectEnvelope(await request(t.app).get('/api/nope'), 'ROUTE_NOT_FOUND', 404);
    expectEnvelope(await request(t.app).get('/owner'), 'ROUTE_NOT_FOUND', 404);
  });

  it('echoes a valid X-Request-Id and replaces an invalid one', async () => {
    const kept = await request(t.app).get('/api/nope').set('X-Request-Id', 'abc-123');
    expect(kept.headers['x-request-id']).toBe('abc-123');
    expect(kept.body.error.requestId).toBe('abc-123');
    const replaced = await request(t.app).get('/api/nope').set('X-Request-Id', 'bad id; drop');
    expect(replaced.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('a handler slower than the timeout → 503 REQUEST_TIMEOUT', async () => {
    let resolveSlow: () => void = () => undefined;
    const slow = createTestApp({
      requestTimeoutMs: 50,
      checkDatabase: () =>
        new Promise<boolean>((resolve) => {
          resolveSlow = () => resolve(true);
        }),
    });
    const res = await request(slow.app).get('/api/health/ready');
    resolveSlow();
    expectEnvelope(res, 'REQUEST_TIMEOUT', 503);
    await slow.close();
  });
});
