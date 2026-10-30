import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createLogger } from '../../lib/logger';
import { errorHandler } from './error-handler';
import { requestId } from './request-id';
import { requestTimeout } from './request-timeout';

function app(handlerDelayMs: number, timeoutMs = 50) {
  const lines: string[] = [];
  const logger = createLogger({
    level: 'trace',
    destination: { write: (s: string) => lines.push(s) },
  });
  const late: { error?: unknown } = {};
  const instance = express();
  instance.use(requestId);
  instance.use(requestTimeout(logger, timeoutMs));
  instance.get('/work', async (_req, res) => {
    await new Promise((resolve) => setTimeout(resolve, handlerDelayMs));
    try {
      res.status(200).json({ done: true });
    } catch (error) {
      late.error = error;
    }
  });
  instance.use(errorHandler(logger));
  return { instance, late, logs: () => lines };
}

describe('requestTimeout', () => {
  it('answers 503 REQUEST_TIMEOUT with the envelope when a handler is too slow', async () => {
    const { instance, logs } = app(150);
    const res = await request(instance).get('/work');
    expect(res.status).toBe(503);
    expect(res.body.error).toMatchObject({ code: 'REQUEST_TIMEOUT' });
    expect(logs().join('')).toContain('REQUEST_TIMEOUT');
  });

  it('drops the late handler response without throwing (no double response)', async () => {
    const { instance, late } = app(100);
    const res = await request(instance).get('/work');
    expect(res.status).toBe(503);
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(late.error).toBeUndefined();
  });

  it('leaves fast handlers alone', async () => {
    const { instance, logs } = app(0, 200);
    const res = await request(instance).get('/work');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ done: true });
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(logs()).toHaveLength(0);
  });
});
