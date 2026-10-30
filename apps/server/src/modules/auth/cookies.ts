import type { Request, Response } from 'express';
import type { Env } from '../../config/env';

/** Reads one cookie value from the raw header (no cookie-parser dependency needed). */
export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    if (part.slice(0, index).trim() === name) {
      const value = part.slice(index + 1).trim();
      return value.length > 0 ? value : undefined;
    }
  }
  return undefined;
}

export function sessionTokenFrom(req: Request, env: Env): string | undefined {
  return readCookie(req.get('cookie'), env.cookieName);
}

/**
 * `__Host-rkds_sid` in production: HttpOnly, Secure, SameSite=Strict, Path=/, no Domain
 * (SECURITY §2). Max-Age equals the absolute session lifetime.
 */
export function setSessionCookie(res: Response, env: Env, token: string, maxAgeMs: number): void {
  res.cookie(env.cookieName, token, {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: 'strict',
    path: '/',
    maxAge: maxAgeMs,
  });
}

export function clearSessionCookie(res: Response, env: Env): void {
  res.clearCookie(env.cookieName, {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: 'strict',
    path: '/',
  });
}
