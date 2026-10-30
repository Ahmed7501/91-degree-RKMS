import { describe, expect, it } from 'vitest';
import { EnvError, loadEnv } from './env';

const base = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://rkds_app:secret@db:5432/rkds',
  APP_ORIGIN: 'https://kds.example.com',
  TRUST_PROXY: '2',
};

function problemsOf(source: Record<string, string>): string[] {
  try {
    loadEnv(source);
  } catch (error) {
    if (error instanceof EnvError) return error.problems;
    throw error;
  }
  return [];
}

describe('loadEnv', () => {
  it('accepts a valid production environment with documented defaults', () => {
    const env = loadEnv(base);
    expect(env).toMatchObject({
      nodeEnv: 'production',
      port: 3000,
      appOrigin: 'https://kds.example.com',
      trustProxy: 2,
      timeZone: 'Asia/Karachi',
      businessDayCutoffHour: 6,
      orderRetentionDays: 7,
      rateLimitMultiplier: 1,
      cookieName: '__Host-rkds_sid',
      cookieSecure: true,
    });
    expect(env.ownerSessionAbsoluteMs).toBe(168 * 3_600_000);
    expect(env.kitchenSessionIdleMs).toBe(14 * 86_400_000);
  });

  it('lists missing variables by name only', () => {
    const problems = problemsOf({ NODE_ENV: 'production' });
    expect(problems).toEqual([
      'APP_ORIGIN is missing or invalid',
      'DATABASE_URL is missing or invalid',
    ]);
  });

  it('never echoes variable values in errors', () => {
    const error = (() => {
      try {
        loadEnv({ ...base, DATABASE_URL: 'mysql://user:topsecret@db/x' });
      } catch (e) {
        return e as Error;
      }
      return undefined;
    })();
    expect(error?.message).toContain('DATABASE_URL');
    expect(error?.message).not.toContain('topsecret');
  });

  it('refuses a change-me placeholder in production', () => {
    expect(
      problemsOf({ ...base, DATABASE_URL: 'postgresql://rkds_app:change-me@db:5432/rkds' }),
    ).toContain('DATABASE_URL still contains a change-me placeholder');
  });

  it.each(['true', 'yes', '-1'])('refuses TRUST_PROXY=%s', (value) => {
    expect(problemsOf({ ...base, TRUST_PROXY: value })).toContain(
      'TRUST_PROXY must be an exact hop count (never true)',
    );
  });

  it('refuses RATE_LIMIT_MULTIPLIER other than 1 in production only', () => {
    expect(problemsOf({ ...base, RATE_LIMIT_MULTIPLIER: '100' })).toContain(
      'RATE_LIMIT_MULTIPLIER must be 1 in production',
    );
    expect(
      loadEnv({ ...base, NODE_ENV: 'test', RATE_LIMIT_MULTIPLIER: '100' }).rateLimitMultiplier,
    ).toBe(100);
  });

  it('refuses a non-https origin in production', () => {
    expect(problemsOf({ ...base, APP_ORIGIN: 'http://kds.example.com' })).toContain(
      'APP_ORIGIN must use https in production',
    );
  });

  it('allows plain HTTP only with RKDS_INSECURE_LOCAL and a loopback origin', () => {
    const env = loadEnv({ ...base, APP_ORIGIN: 'http://127.0.0.1:8080', RKDS_INSECURE_LOCAL: '1' });
    expect(env).toMatchObject({ cookieName: 'rkds_sid', cookieSecure: false });
    expect(
      loadEnv({ ...base, APP_ORIGIN: 'http://localhost:8080', RKDS_INSECURE_LOCAL: '1' }),
    ).toBeDefined();
    expect(
      problemsOf({ ...base, APP_ORIGIN: 'http://192.168.1.50:8080', RKDS_INSECURE_LOCAL: '1' }),
    ).toContain('RKDS_INSECURE_LOCAL is only allowed with a loopback APP_ORIGIN');
    expect(
      problemsOf({ ...base, APP_ORIGIN: 'https://kds.example.com', RKDS_INSECURE_LOCAL: '1' }),
    ).toContain('RKDS_INSECURE_LOCAL is only allowed with a loopback APP_ORIGIN');
  });

  it.each(['https://kds.example.com/owner', 'kds.example.com', 'https://u:p@kds.example.com'])(
    'refuses APP_ORIGIN %s that is not a bare origin',
    (origin) => {
      expect(problemsOf({ ...base, APP_ORIGIN: origin })).toContain(
        'APP_ORIGIN must be an origin like https://kds.example.com',
      );
    },
  );

  it.each([
    ['0', false],
    ['1', true],
    ['365', true],
    ['366', false],
  ])('ORDER_RETENTION_DAYS=%s valid: %s', (value, ok) => {
    expect(problemsOf({ ...base, ORDER_RETENTION_DAYS: value }).length === 0).toBe(ok);
  });

  it('treats empty variables as unset (Compose passes ${VAR:-} as "")', () => {
    const env = loadEnv({
      ...base,
      RKDS_INSECURE_LOCAL: '',
      LOG_LEVEL: '',
      ORDER_RETENTION_DAYS: '',
    });
    expect(env).toMatchObject({ cookieSecure: true, logLevel: 'info', orderRetentionDays: 7 });
  });

  it('refuses an unknown time zone at startup', () => {
    expect(problemsOf({ ...base, RESTAURANT_TIMEZONE: 'Asia/Karachy' })).toContain(
      'RESTAURANT_TIMEZONE must be an IANA time zone such as Asia/Karachi',
    );
  });

  it('uses a plain cookie name outside production', () => {
    const env = loadEnv({ ...base, NODE_ENV: 'development', APP_ORIGIN: 'http://localhost:5173' });
    expect(env).toMatchObject({ cookieName: 'rkds_sid', cookieSecure: false, trustProxy: 2 });
  });
});
