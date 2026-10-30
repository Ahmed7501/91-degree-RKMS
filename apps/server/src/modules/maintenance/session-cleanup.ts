import type { Db } from '../../db/prisma';
import type { Clock } from '../../lib/clock';
import type { Logger } from '../../lib/logger';
import type { SessionTtls } from '../auth/session.service';

const DAY_MS = 86_400_000;
export const SESSION_RETENTION_MS = 30 * DAY_MS;
export const PAIRING_CODE_RETENTION_MS = DAY_MS;
export const SESSION_CLEANUP_INTERVAL_MS = DAY_MS;

/**
 * Deletes sessions that ended more than 30 days ago (revoked, absolutely expired or idle-expired)
 * and pairing codes older than 1 day (DATABASE §7). Live sessions are never touched.
 */
export async function runSessionCleanup(
  prisma: Db,
  clock: Clock,
  ttls: SessionTtls,
  logger: Logger,
): Promise<{ sessions: number; pairingCodes: number }> {
  const now = clock.now().getTime();
  const cutoff = new Date(now - SESSION_RETENTION_MS);
  const sessions = await prisma.session.deleteMany({
    where: {
      OR: [
        { revokedAt: { lt: cutoff } },
        { expiresAt: { lt: cutoff } },
        { role: 'OWNER', lastSeenAt: { lt: new Date(cutoff.getTime() - ttls.ownerIdleMs) } },
        { role: 'KITCHEN', lastSeenAt: { lt: new Date(cutoff.getTime() - ttls.kitchenIdleMs) } },
      ],
    },
  });
  const pairingCodes = await prisma.kitchenPairingCode.deleteMany({
    where: { createdAt: { lt: new Date(now - PAIRING_CODE_RETENTION_MS) } },
  });
  const result = { sessions: sessions.count, pairingCodes: pairingCodes.count };
  logger.info({ event: 'session_cleanup', ...result }, 'session cleanup finished');
  return result;
}
