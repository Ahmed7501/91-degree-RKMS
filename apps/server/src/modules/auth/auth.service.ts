import type { Db } from '../../db/prisma';
import { AppError } from '../../errors/app-error';
import type { RateLimitRule } from '../../http/middleware/rate-limit';
import type { Clock } from '../../lib/clock';
import type { Logger } from '../../lib/logger';
import { getDummyHash, hashPassword, needsRehash, verifyPassword } from './password';
import type { ResolvedSession, SessionService } from './session.service';

interface LockEntry {
  failures: number;
  lockedUntil: number;
  lastFailureAt: number;
}

/**
 * In-memory lock per (username, IP) after N consecutive failures (SECURITY §1, ADR-013).
 * Keying on the pair means an attacker elsewhere cannot lock the real owner out.
 */
export class LoginLock {
  private readonly entries = new Map<string, LockEntry>();

  constructor(
    private readonly rule: RateLimitRule,
    private readonly clock: Clock,
  ) {}

  private key(username: string, ip: string): string {
    return `${username}\u0000${ip}`;
  }

  /** Seconds until the pair may try again, or 0 when not locked. */
  retryAfterSeconds(username: string, ip: string): number {
    const entry = this.entries.get(this.key(username, ip));
    const now = this.clock.now().getTime();
    if (!entry || entry.lockedUntil <= now) return 0;
    return Math.ceil((entry.lockedUntil - now) / 1000);
  }

  recordFailure(username: string, ip: string): void {
    const key = this.key(username, ip);
    const now = this.clock.now().getTime();
    const previous = this.entries.get(key);
    // Failures older than the window, or from before an expired lock, start a fresh count.
    const stale = !previous || now - previous.lastFailureAt > this.rule.windowMs;
    const failures = stale ? 1 : previous.failures + 1;
    const lockedUntil = failures >= this.rule.limit ? now + this.rule.windowMs : 0;
    this.entries.set(key, {
      failures: lockedUntil ? 0 : failures,
      lockedUntil,
      lastFailureAt: now,
    });
    this.prune(now);
  }

  recordSuccess(username: string, ip: string): void {
    this.entries.delete(this.key(username, ip));
  }

  private prune(now: number): void {
    if (this.entries.size < 1000) return;
    for (const [key, entry] of this.entries) {
      if (entry.lockedUntil <= now && now - entry.lastFailureAt > this.rule.windowMs) {
        this.entries.delete(key);
      }
    }
  }
}

export interface LoginInput {
  username: string;
  password: string;
  ip: string;
  userAgent: string | undefined;
  /** A session presented with the login request is revoked (rotation). */
  previousSession: ResolvedSession | undefined;
}

export class AuthService {
  constructor(
    private readonly prisma: Db,
    private readonly sessions: SessionService,
    private readonly lock: LoginLock,
    private readonly logger: Logger,
  ) {}

  async login(input: LoginInput): Promise<{ token: string; session: ResolvedSession }> {
    const { username, password, ip } = input;
    const retryAfterSeconds = this.lock.retryAfterSeconds(username, ip);
    if (retryAfterSeconds > 0) {
      this.logger.warn({ event: 'login_locked' }, 'login attempt while locked');
      throw new AppError('RATE_LIMITED', { messageParams: { retryAfterSeconds } });
    }

    const user = await this.prisma.user.findUnique({ where: { username } });
    // Always run one Argon2id verification so unknown users take as long as known ones.
    const passwordOk = await verifyPassword(user?.passwordHash ?? (await getDummyHash()), password);
    if (!user || !passwordOk || user.disabledAt) {
      this.lock.recordFailure(username, ip);
      this.logger.warn({ event: 'login_failed' }, 'login failed');
      throw new AppError('INVALID_CREDENTIALS');
    }

    this.lock.recordSuccess(username, ip);
    if (needsRehash(user.passwordHash)) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await hashPassword(password) },
      });
    }
    if (input.previousSession) {
      await this.sessions.revoke([input.previousSession.id], 'LOGOUT');
    }
    const created = await this.sessions.createOwnerSession(
      { id: user.id, username: user.username },
      input.userAgent,
    );
    this.logger.info({ event: 'login_succeeded', userId: user.id }, 'owner logged in');
    return created;
  }

  async logout(session: ResolvedSession | undefined): Promise<void> {
    if (session) await this.sessions.revoke([session.id], 'LOGOUT');
  }
}
