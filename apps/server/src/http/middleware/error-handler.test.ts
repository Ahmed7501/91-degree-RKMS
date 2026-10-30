import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { AppError } from '../../errors/app-error';
import { createLogger } from '../../lib/logger';
import { errorHandler } from './error-handler';
import { requestId } from './request-id';

function appThrowing(error: unknown) {
  const lines: string[] = [];
  const logger = createLogger({
    level: 'trace',
    destination: { write: (s: string) => lines.push(s) },
  });
  const app = express();
  app.use(requestId);
  app.use(express.json({ limit: '1kb' }));
  app.post('/boom', () => {
    throw error;
  });
  app.use(errorHandler(logger));
  return { app, logs: () => lines.map((l) => JSON.parse(l) as Record<string, unknown>) };
}

describe('errorHandler', () => {
  it.each([
    ['ORDER_NOT_FOUND', 404],
    ['INVALID_STATUS_TRANSITION', 409],
    ['IDEMPOTENCY_KEY_REUSED', 422],
    ['DATABASE_UNAVAILABLE', 503],
  ] as const)('%s → %i with the envelope', async (code, status) => {
    const { app } = appThrowing(new AppError(code));
    const res = await request(app).post('/boom').set('X-Request-Id', 'req-123');
    expect(res.status).toBe(status);
    expect(res.body).toEqual({
      error: { code, message: expect.any(String) as string, requestId: 'req-123' },
    });
  });

  it('includes details only when the error has them', async () => {
    const details = [{ path: 'text', message: 'Order text cannot be empty.' }];
    const { app } = appThrowing(new AppError('VALIDATION_FAILED', { details }));
    const res = await request(app).post('/boom');
    expect(res.body.error.details).toEqual(details);
    expect(res.body.error.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('turns unknown errors into a 500 without leaking message or stack', async () => {
    const { app, logs } = appThrowing(new Error('SELECT * FROM secrets at /srv/app.js:12'));
    const res = await request(app).post('/boom');
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(res.body)).not.toContain('secrets');
    expect(JSON.stringify(res.body)).not.toContain('app.js');
    const [entry] = logs();
    expect(entry).toMatchObject({ level: 'error', errorCode: 'INTERNAL_ERROR', status: 500 });
    expect(entry?.stack).toEqual(expect.stringContaining('Error'));
  });

  it('logs 4xx at warn without a stack, exactly once', async () => {
    const { app, logs } = appThrowing(new AppError('FORBIDDEN'));
    await request(app).post('/boom');
    expect(logs()).toHaveLength(1);
    expect(logs()[0]).toMatchObject({ level: 'warn', errorCode: 'FORBIDDEN' });
    expect(logs()[0]?.stack).toBeUndefined();
  });

  it('maps body-parser failures', async () => {
    const { app } = appThrowing(new Error('unused'));
    const bad = await request(app)
      .post('/boom')
      .set('Content-Type', 'application/json')
      .send('{"text":');
    expect(bad.body.error.code).toBe('INVALID_JSON');
    const big = await request(app)
      .post('/boom')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ text: 'x'.repeat(2000) }));
    expect(big.status).toBe(413);
    expect(big.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});
