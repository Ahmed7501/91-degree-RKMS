import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createPrisma } from '../../src/db/prisma';
import { createTestApp } from '../helpers/app-harness';

const healthy = createTestApp();
// A client pointed at a closed port: the database is "down" for this app only.
const deadPrisma = createPrisma('postgresql://rkds_app:x@127.0.0.1:1/rkds_test');
const unhealthy = createTestApp({ prisma: deadPrisma });

afterAll(async () => {
  await healthy.close();
  await deadPrisma.$disconnect().catch(() => undefined);
});

describe('health', () => {
  it('live answers 200 without touching the database', async () => {
    const res = await request(unhealthy.app).get('/api/health/live');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('ready answers 200 when the database responds', async () => {
    const res = await request(healthy.app).get('/api/health/ready');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', db: 'ok' });
  });

  it('ready answers 503 without details when the database is unreachable', async () => {
    const res = await request(unhealthy.app).get('/api/health/ready');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'degraded', db: 'unavailable' });
    expect(JSON.stringify(res.body)).not.toMatch(/127\.0\.0\.1|ECONNREFUSED|postgres/i);
  });

  it('health responses are never cached', async () => {
    const res = await request(healthy.app).get('/api/health/ready');
    expect(res.headers['cache-control']).toBe('no-store');
  });
});
