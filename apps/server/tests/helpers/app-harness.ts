import type { Express } from 'express';
import { createApp, type AppDeps } from '../../src/app';
import { loadEnv, type Env } from '../../src/config/env';
import { createPrisma, type Db } from '../../src/db/prisma';
import {
  DEFAULT_RATE_LIMITS,
  scaleRateLimits,
  type RateLimitConfig,
} from '../../src/http/middleware/rate-limit';
import type { Clock } from '../../src/lib/clock';
import { createLogger } from '../../src/lib/logger';
import { createServices, type Services } from '../../src/services';
import { FixedClock } from './fixed-clock';
import { testDatabaseUrl } from './test-db';

export const TEST_ORIGIN = 'http://localhost:5173';

/** Integration servers scale rate limits so suites that create many rows aren't throttled. */
export const TEST_RATE_LIMIT_MULTIPLIER = 100;

export function testEnv(overrides: Record<string, string> = {}): Env {
  return loadEnv({
    NODE_ENV: 'test',
    DATABASE_URL: testDatabaseUrl(),
    APP_ORIGIN: TEST_ORIGIN,
    TRUST_PROXY: '0',
    LOG_LEVEL: 'trace',
    RATE_LIMIT_MULTIPLIER: String(TEST_RATE_LIMIT_MULTIPLIER),
    ...overrides,
  });
}

export interface TestApp {
  app: Express;
  env: Env;
  clock: FixedClock;
  prisma: Db;
  services: Services;
  /** Every log line written by the app, parsed. */
  logs: () => Record<string, unknown>[];
  /** Raw log output, for "never contains" assertions. */
  rawLogs: () => string;
  close: () => Promise<void>;
}

export interface TestAppOptions {
  env?: Record<string, string>;
  rateLimits?: RateLimitConfig;
  clock?: Clock;
  prisma?: Db;
  checkDatabase?: AppDeps['checkDatabase'];
  requestTimeoutMs?: number;
}

export function createTestApp(options: TestAppOptions = {}): TestApp {
  const env = testEnv(options.env);
  const lines: string[] = [];
  const logger = createLogger({
    level: env.logLevel,
    destination: { write: (line: string) => lines.push(line) },
  });
  const clock = (options.clock as FixedClock | undefined) ?? new FixedClock();
  const ownsPrisma = !options.prisma;
  const prisma = options.prisma ?? createPrisma(env.databaseUrl);
  const core = {
    env,
    logger,
    clock,
    prisma,
    rateLimits: options.rateLimits ?? scaleRateLimits(DEFAULT_RATE_LIMITS, env.rateLimitMultiplier),
  };
  const services = createServices(core);
  const app = createApp({
    ...core,
    services,
    ...(options.checkDatabase ? { checkDatabase: options.checkDatabase } : {}),
    ...(options.requestTimeoutMs ? { requestTimeoutMs: options.requestTimeoutMs } : {}),
  });
  return {
    app,
    env,
    clock,
    prisma,
    services,
    logs: () => lines.map((line) => JSON.parse(line) as Record<string, unknown>),
    rawLogs: () => lines.join(''),
    close: async () => {
      if (ownsPrisma) await prisma.$disconnect();
    },
  };
}
