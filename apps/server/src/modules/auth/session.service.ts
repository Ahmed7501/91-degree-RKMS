import type { SessionDto, SessionRevokedReason, SessionRole } from '@rkds/shared';
import type { Env } from '../../config/env';
import type { Db } from '../../db/prisma';
import type { Prisma } from '../../generated/prisma/client';
import type { Clock } from '../../lib/clock';
import { randomToken, sha256Hex } from '../../lib/crypto';

/** `last_seen_at` is written at most this often (ADR-007). */
export const TOUCH_INTERVAL_MS = 5 * 60_000;

export interface ResolvedSession {
  id: string;
  role: SessionRole;
  userId: string | null;
  username: string | null;
  deviceLabel: string | null;
  expiresAt: Date;
}

export interface SessionRow {
  revokedAt: Date | null;
  expiresAt: Date;
  lastSeenAt: Date;
  role: SessionRole;
  userDisabledAt: Date | null;
}

export type SessionState = 'valid' | 'revoked' | 'expired' | 'idle' | 'disabled';

export interface SessionTtls {
  ownerAbsoluteMs: number;
  ownerIdleMs: number;
  kitchenAbsoluteMs: number;
  kitchenIdleMs: number;
}

export function ttlsFromEnv(env: Env): SessionTtls {
  return {
    ownerAbsoluteMs: env.ownerSessionAbsoluteMs,
    ownerIdleMs: env.ownerSessionIdleMs,
    kitchenAbsoluteMs: env.kitchenSessionAbsoluteMs,
    kitchenIdleMs: env.kitchenSessionIdleMs,
  };
}

export function idleMsFor(role: SessionRole, ttls: SessionTtls): number {
  return role === 'OWNER' ? ttls.ownerIdleMs : ttls.kitchenIdleMs;
}

/** Pure session check: revoked, absolute expiry, idle expiry, disabled owner (SECURITY §1–2). */
export function sessionState(row: SessionRow, now: Date, ttls: SessionTtls): SessionState {
  if (row.revokedAt) return 'revoked';
  if (row.expiresAt.getTime() <= now.getTime()) return 'expired';
  if (row.lastSeenAt.getTime() + idleMsFor(row.role, ttls) <= now.getTime()) return 'idle';
  if (row.role === 'OWNER' && row.userDisabledAt) return 'disabled';
  return 'valid';
}

export function needsTouch(lastSeenAt: Date, now: Date): boolean {
  return now.getTime() - lastSeenAt.getTime() >= TOUCH_INTERVAL_MS;
}

export function toSessionDto(session: ResolvedSession): SessionDto {
  return {
    role: session.role,
    user:
      session.userId && session.username
        ? { id: session.userId, username: session.username }
        : null,
    deviceLabel: session.deviceLabel,
    expiresAt: session.expiresAt.toISOString(),
  };
}

export type RevokeListener = (sessionIds: string[], reason: SessionRevokedReason) => void;

type DbClient = Db | Prisma.TransactionClient;

/** Server-side sessions in PostgreSQL. Only the SHA-256 of the cookie token is stored. */
export class SessionService {
  private readonly listeners: RevokeListener[] = [];

  constructor(
    private readonly prisma: Db,
    private readonly clock: Clock,
    readonly ttls: SessionTtls,
  ) {}

  /** Realtime subscribes here to disconnect sockets of revoked sessions (P6). */
  onRevoke(listener: RevokeListener): void {
    this.listeners.push(listener);
  }

  private notify(sessionIds: string[], reason: SessionRevokedReason): void {
    if (sessionIds.length === 0) return;
    for (const listener of this.listeners) {
      try {
        listener(sessionIds, reason);
      } catch {
        // The revocation is already stored; the 60 s socket sweep disconnects any leftover sockets.
      }
    }
  }

  absoluteMsFor(role: SessionRole): number {
    return role === 'OWNER' ? this.ttls.ownerAbsoluteMs : this.ttls.kitchenAbsoluteMs;
  }

  async createOwnerSession(
    user: { id: string; username: string },
    userAgent: string | undefined,
    db: DbClient = this.prisma,
  ): Promise<{ token: string; session: ResolvedSession }> {
    const now = this.clock.now();
    const token = randomToken();
    const row = await db.session.create({
      data: {
        tokenHash: sha256Hex(token),
        role: 'OWNER',
        userId: user.id,
        createdAt: now,
        lastSeenAt: now,
        expiresAt: new Date(now.getTime() + this.ttls.ownerAbsoluteMs),
        userAgent: userAgent?.slice(0, 200) ?? null,
      },
    });
    return {
      token,
      session: {
        id: row.id,
        role: 'OWNER',
        userId: user.id,
        username: user.username,
        deviceLabel: null,
        expiresAt: row.expiresAt,
      },
    };
  }

  async createKitchenSession(
    deviceLabel: string,
    createdByUserId: string,
    userAgent: string | undefined,
    db: DbClient = this.prisma,
  ): Promise<{ token: string; session: ResolvedSession }> {
    const now = this.clock.now();
    const token = randomToken();
    const row = await db.session.create({
      data: {
        tokenHash: sha256Hex(token),
        role: 'KITCHEN',
        deviceLabel,
        createdByUserId,
        createdAt: now,
        lastSeenAt: now,
        expiresAt: new Date(now.getTime() + this.ttls.kitchenAbsoluteMs),
        userAgent: userAgent?.slice(0, 200) ?? null,
      },
    });
    return {
      token,
      session: {
        id: row.id,
        role: 'KITCHEN',
        userId: null,
        username: null,
        deviceLabel,
        expiresAt: row.expiresAt,
      },
    };
  }

  /** Returns the live session for a cookie token, or null. Disabled owners lose their sessions. */
  async resolve(token: string): Promise<ResolvedSession | null> {
    const row = await this.prisma.session.findUnique({
      where: { tokenHash: sha256Hex(token) },
      include: { user: { select: { username: true, disabledAt: true } } },
    });
    if (!row) return null;
    const now = this.clock.now();
    const state = sessionState(
      { ...row, userDisabledAt: row.user?.disabledAt ?? null },
      now,
      this.ttls,
    );
    if (state === 'disabled') {
      await this.revoke([row.id], 'REVOKED');
      return null;
    }
    if (state !== 'valid') return null;
    if (needsTouch(row.lastSeenAt, now)) {
      await this.prisma.session.updateMany({
        where: { id: row.id, revokedAt: null },
        data: { lastSeenAt: now },
      });
    }
    return {
      id: row.id,
      role: row.role,
      userId: row.userId,
      username: row.user?.username ?? null,
      deviceLabel: row.deviceLabel,
      expiresAt: row.expiresAt,
    };
  }

  /** Revokes the given sessions (idempotent) and notifies realtime. */
  async revoke(sessionIds: string[], reason: SessionRevokedReason): Promise<void> {
    if (sessionIds.length === 0) return;
    await this.prisma.session.updateMany({
      where: { id: { in: sessionIds }, revokedAt: null },
      data: { revokedAt: this.clock.now() },
    });
    this.notify(sessionIds, reason);
  }

  /** Used by disable/reset-password: every session of that owner ends. */
  async revokeAllForUser(userId: string): Promise<number> {
    const active = await this.prisma.session.findMany({
      where: { userId, revokedAt: null },
      select: { id: true },
    });
    await this.revoke(
      active.map((s) => s.id),
      'REVOKED',
    );
    return active.length;
  }

  /** Session ids among `ids` that are no longer valid (socket sweeper, P6). */
  async invalidAmong(ids: string[]): Promise<string[]> {
    if (ids.length === 0) return [];
    const rows = await this.prisma.session.findMany({
      where: { id: { in: ids } },
      include: { user: { select: { disabledAt: true } } },
    });
    const now = this.clock.now();
    const valid = new Set(
      rows
        .filter(
          (row) =>
            sessionState(
              { ...row, userDisabledAt: row.user?.disabledAt ?? null },
              now,
              this.ttls,
            ) === 'valid',
        )
        .map((row) => row.id),
    );
    return ids.filter((id) => !valid.has(id));
  }
}
