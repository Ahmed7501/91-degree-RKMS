import {
  PAIRING_CODE_ALPHABET,
  PAIRING_CODE_LENGTH,
  formatPairingCode,
  isWellFormedPairingCode,
  normalizePairingCode,
  type KitchenDeviceDto,
  type PairingCodeResponse,
} from '@rkds/shared';
import type { Db } from '../../db/prisma';
import { AppError } from '../../errors/app-error';
import type { Clock } from '../../lib/clock';
import { randomFromAlphabet, sha256Hex } from '../../lib/crypto';
import type { Logger } from '../../lib/logger';
import { sessionState, type ResolvedSession, type SessionService } from '../auth/session.service';

export const PAIRING_CODE_TTL_MS = 10 * 60_000;

/** One-time kitchen pairing codes (ADR-008). Only the SHA-256 of a code is stored. */
export class PairingService {
  constructor(
    private readonly prisma: Db,
    private readonly sessions: SessionService,
    private readonly clock: Clock,
    private readonly logger: Logger,
  ) {}

  async createCode(ownerUserId: string, deviceLabel: string): Promise<PairingCodeResponse> {
    const now = this.clock.now();
    const code = randomFromAlphabet(PAIRING_CODE_ALPHABET, PAIRING_CODE_LENGTH);
    const expiresAt = new Date(now.getTime() + PAIRING_CODE_TTL_MS);
    await this.prisma.kitchenPairingCode.create({
      data: {
        codeHash: sha256Hex(code),
        deviceLabel,
        createdByUserId: ownerUserId,
        createdAt: now,
        expiresAt,
      },
    });
    this.logger.info(
      { event: 'pairing_code_created', userId: ownerUserId },
      'pairing code created',
    );
    // The plaintext code is returned exactly once and never logged.
    return { code: formatPairingCode(code), deviceLabel, expiresAt: expiresAt.toISOString() };
  }

  /**
   * Redeems a code atomically (single UPDATE … WHERE used_at IS NULL AND expires_at > now
   * RETURNING) and creates the KITCHEN session in the same transaction. Unknown, used and expired
   * codes all fail the same way.
   */
  async pair(
    rawCode: string,
    userAgent: string | undefined,
  ): Promise<{ token: string; session: ResolvedSession }> {
    const code = normalizePairingCode(rawCode);
    if (!isWellFormedPairingCode(code)) throw new AppError('PAIRING_CODE_INVALID');
    const now = this.clock.now();
    const result = await this.prisma.$transaction(async (tx) => {
      const redeemed = await tx.kitchenPairingCode.updateManyAndReturn({
        where: { codeHash: sha256Hex(code), usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      const row = redeemed[0];
      if (!row) return null;
      return this.sessions.createKitchenSession(
        row.deviceLabel,
        row.createdByUserId,
        userAgent,
        tx,
      );
    });
    if (!result) {
      this.logger.warn({ event: 'pairing_failed' }, 'pairing code rejected');
      throw new AppError('PAIRING_CODE_INVALID');
    }
    this.logger.info({ event: 'kitchen_paired', sessionId: result.session.id }, 'kitchen paired');
    return result;
  }

  /** Active kitchen screens only (not revoked, not expired, not idle-expired). */
  async listDevices(): Promise<KitchenDeviceDto[]> {
    const rows = await this.prisma.session.findMany({
      where: { role: 'KITCHEN', revokedAt: null },
      orderBy: { createdAt: 'asc' },
    });
    const now = this.clock.now();
    return rows
      .filter(
        (row) =>
          sessionState({ ...row, userDisabledAt: null }, now, this.sessions.ttls) === 'valid',
      )
      .map((row) => ({
        id: row.id,
        deviceLabel: row.deviceLabel ?? '',
        createdAt: row.createdAt.toISOString(),
        lastSeenAt: row.lastSeenAt.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
      }));
  }

  /** Revokes one kitchen screen. 404 unless the id is a kitchen session. Idempotent. */
  async revokeDevice(sessionId: string): Promise<void> {
    const row = await this.prisma.session.findUnique({ where: { id: sessionId } });
    if (row?.role !== 'KITCHEN') throw new AppError('NOT_FOUND');
    await this.sessions.revoke([row.id], 'REVOKED');
  }
}
