import type { Request, RequestHandler, Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { AppError } from '../../errors/app-error';

/** All limits in one place (SECURITY §7). Scaled only for test servers (RATE_LIMIT_MULTIPLIER). */
export interface RateLimitRule {
  windowMs: number;
  limit: number;
}

export interface RateLimitConfig {
  global: RateLimitRule;
  login: RateLimitRule;
  /** Consecutive failures per (username, IP) before that pair is locked for `windowMs`. */
  loginLock: RateLimitRule;
  pair: RateLimitRule;
  pairingCodes: RateLimitRule;
  orders: RateLimitRule;
}

const MINUTE = 60_000;

export const DEFAULT_RATE_LIMITS: RateLimitConfig = {
  global: { windowMs: 5 * MINUTE, limit: 600 },
  login: { windowMs: 15 * MINUTE, limit: 10 },
  loginLock: { windowMs: 15 * MINUTE, limit: 5 },
  pair: { windowMs: 15 * MINUTE, limit: 10 },
  pairingCodes: { windowMs: 60 * MINUTE, limit: 10 },
  orders: { windowMs: MINUTE, limit: 30 },
};

export function scaleRateLimits(config: RateLimitConfig, multiplier: number): RateLimitConfig {
  const scale = (rule: RateLimitRule): RateLimitRule => ({
    ...rule,
    limit: rule.limit * multiplier,
  });
  return {
    global: scale(config.global),
    login: scale(config.login),
    // The lock is a security threshold (5 failures), not a throughput limit: never scaled.
    loginLock: config.loginLock,
    pair: scale(config.pair),
    pairingCodes: scale(config.pairingCodes),
    orders: scale(config.orders),
  };
}

/**
 * One limiter with its own memory store. Over the limit → 429 RATE_LIMITED envelope with
 * `Retry-After` (seconds). `key` defaults to the client IP (trust proxy is an exact hop count).
 */
export function createLimiter(
  rule: RateLimitRule,
  key?: (req: Request, res: Response) => string,
): RequestHandler {
  return rateLimit({
    windowMs: rule.windowMs,
    limit: rule.limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    ...(key ? { keyGenerator: key } : {}),
    handler: (req, res, next) => {
      const resetTime = (req as Request & { rateLimit?: { resetTime?: Date } }).rateLimit
        ?.resetTime;
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil(((resetTime?.getTime() ?? Date.now() + rule.windowMs) - Date.now()) / 1000),
      );
      res.set('Retry-After', String(retryAfterSeconds));
      next(new AppError('RATE_LIMITED', { messageParams: { retryAfterSeconds } }));
    },
  });
}
