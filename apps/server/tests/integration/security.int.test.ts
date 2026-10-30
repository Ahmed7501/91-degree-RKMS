import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createTestApp, TEST_ORIGIN } from '../helpers/app-harness';

const t = createTestApp();
afterAll(() => t.close());

describe('CSRF defences (SECURITY §4)', () => {
  it('rejects a state-changing request without Origin', async () => {
    const res = await request(t.app).post('/api/health/live').send({});
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF_REJECTED');
  });

  it('rejects a foreign Origin, including look-alikes', async () => {
    for (const origin of [
      'https://evil.example',
      'http://localhost:5174',
      'http://localhost:5173.evil.example',
      'null',
    ]) {
      const res = await request(t.app).post('/api/health/live').set('Origin', origin).send({});
      expect(res.status).toBe(403);
    }
  });

  it('lets the app origin through to routing', async () => {
    const res = await request(t.app).post('/api/nope').set('Origin', TEST_ORIGIN).send({});
    expect(res.status).toBe(404);
  });

  it('does not require Origin on safe methods', async () => {
    expect((await request(t.app).get('/api/health/live')).status).toBe(200);
  });
});

describe('security headers (SECURITY §6)', () => {
  it('sets the documented headers and hides the framework', async () => {
    const res = await request(t.app).get('/api/health/live');
    expect(res.headers).toMatchObject({
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'x-frame-options': 'DENY',
      'cross-origin-opener-policy': 'same-origin',
      'cross-origin-resource-policy': 'same-origin',
      'cache-control': 'no-store',
    });
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('error responses carry the same headers', async () => {
    const res = await request(t.app).get('/api/nope');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('does not install CORS', async () => {
    const res = await request(t.app).get('/api/health/live').set('Origin', 'https://evil.example');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
