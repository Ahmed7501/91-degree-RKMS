import {
  DEFAULT_BUSINESS_DAY_CUTOFF_HOUR,
  DEFAULT_ORDER_RETENTION_DAYS,
  RESTAURANT_TZ,
} from '@rkds/shared';
import { z } from 'zod';

/** Startup configuration (docs/ENVIRONMENT_VARIABLES.md). Errors list variable names only. */

const int = (min: number, max: number) => z.coerce.number().int().min(min).max(max);

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  PORT: int(1, 65535).default(3000),
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//),
  APP_ORIGIN: z.string().min(1),
  TRUST_PROXY: z.string().default('0'),
  RESTAURANT_TIMEZONE: z.string().default(RESTAURANT_TZ),
  BUSINESS_DAY_CUTOFF_HOUR: int(0, 23).default(DEFAULT_BUSINESS_DAY_CUTOFF_HOUR),
  ORDER_RETENTION_DAYS: int(1, 365).default(DEFAULT_ORDER_RETENTION_DAYS),
  OWNER_SESSION_ABSOLUTE_HOURS: int(1, 24 * 90).default(168),
  OWNER_SESSION_IDLE_HOURS: int(1, 24 * 90).default(24),
  KITCHEN_SESSION_ABSOLUTE_DAYS: int(1, 365).default(90),
  KITCHEN_SESSION_IDLE_DAYS: int(1, 365).default(14),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  RATE_LIMIT_MULTIPLIER: int(1, 10_000).default(1),
  RKDS_INSECURE_LOCAL: z.enum(['1']).optional(),
});

export interface Env {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  databaseUrl: string;
  appOrigin: string;
  trustProxy: number;
  timeZone: string;
  businessDayCutoffHour: number;
  orderRetentionDays: number;
  ownerSessionAbsoluteMs: number;
  ownerSessionIdleMs: number;
  kitchenSessionAbsoluteMs: number;
  kitchenSessionIdleMs: number;
  logLevel: z.infer<typeof EnvSchema>['LOG_LEVEL'];
  rateLimitMultiplier: number;
  /** `__Host-rkds_sid` over HTTPS in production, `rkds_sid` otherwise. */
  cookieName: string;
  cookieSecure: boolean;
}

export class EnvError extends Error {
  constructor(readonly problems: string[]) {
    super(`Invalid environment: ${problems.join('; ')}`);
    this.name = 'EnvError';
  }
}

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function parseOrigin(value: string): URL | null {
  try {
    const url = new URL(value);
    // An origin has no path, query or fragment; `new URL` normalizes "https://x" to "https://x/".
    if (url.pathname !== '/' || url.search || url.hash || url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

function validTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  // Compose passes `${VAR:-}` as an empty string when a variable is unset: treat "" as unset.
  const defined = Object.fromEntries(Object.entries(source).filter(([, value]) => value !== ''));
  const parsed = EnvSchema.safeParse(defined);
  if (!parsed.success) {
    const names = [...new Set(parsed.error.issues.map((i) => String(i.path[0])))].sort();
    throw new EnvError(names.map((name) => `${name} is missing or invalid`));
  }
  const raw = parsed.data;
  const problems: string[] = [];
  const production = raw.NODE_ENV === 'production';
  const insecureLocal = raw.RKDS_INSECURE_LOCAL === '1';

  const origin = parseOrigin(raw.APP_ORIGIN);
  if (!origin) problems.push('APP_ORIGIN must be an origin like https://kds.example.com');
  if (!validTimeZone(raw.RESTAURANT_TIMEZONE)) {
    problems.push('RESTAURANT_TIMEZONE must be an IANA time zone such as Asia/Karachi');
  }

  if (!/^\d+$/.test(raw.TRUST_PROXY)) {
    problems.push('TRUST_PROXY must be an exact hop count (never true)');
  }
  const trustProxy = Number(raw.TRUST_PROXY);
  if (trustProxy > 5) problems.push('TRUST_PROXY must be between 0 and 5');

  if (origin && insecureLocal && !LOOPBACK_HOSTS.has(origin.hostname)) {
    problems.push('RKDS_INSECURE_LOCAL is only allowed with a loopback APP_ORIGIN');
  }
  if (production) {
    if (raw.DATABASE_URL.includes('change-me')) {
      problems.push('DATABASE_URL still contains a change-me placeholder');
    }
    if (origin && origin.protocol !== 'https:' && !insecureLocal) {
      problems.push('APP_ORIGIN must use https in production');
    }
    if (raw.RATE_LIMIT_MULTIPLIER !== 1) {
      problems.push('RATE_LIMIT_MULTIPLIER must be 1 in production');
    }
  }
  if (problems.length > 0) throw new EnvError(problems);

  const cookieSecure = production && !insecureLocal;
  return {
    nodeEnv: raw.NODE_ENV,
    port: raw.PORT,
    databaseUrl: raw.DATABASE_URL,
    appOrigin: origin!.origin,
    trustProxy,
    timeZone: raw.RESTAURANT_TIMEZONE,
    businessDayCutoffHour: raw.BUSINESS_DAY_CUTOFF_HOUR,
    orderRetentionDays: raw.ORDER_RETENTION_DAYS,
    ownerSessionAbsoluteMs: raw.OWNER_SESSION_ABSOLUTE_HOURS * HOUR_MS,
    ownerSessionIdleMs: raw.OWNER_SESSION_IDLE_HOURS * HOUR_MS,
    kitchenSessionAbsoluteMs: raw.KITCHEN_SESSION_ABSOLUTE_DAYS * DAY_MS,
    kitchenSessionIdleMs: raw.KITCHEN_SESSION_IDLE_DAYS * DAY_MS,
    logLevel: raw.LOG_LEVEL,
    rateLimitMultiplier: raw.RATE_LIMIT_MULTIPLIER,
    cookieName: cookieSecure ? '__Host-rkds_sid' : 'rkds_sid',
    cookieSecure,
  };
}
