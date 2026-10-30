import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createLogger } from '../../src/lib/logger';
import { runSessionCleanup } from '../../src/modules/maintenance/session-cleanup';
import { createTestApp } from '../helpers/app-harness';
import { createOwner } from '../helpers/factories';
import { FixedClock } from '../helpers/fixed-clock';
import { truncateAll } from '../helpers/test-db';

const t = createTestApp();
afterAll(() => t.close());
beforeEach(() => truncateAll());

const DAY = 86_400_000;
const NOW = new Date('2026-10-29T13:00:00.000Z');
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);
const ttls = {
  ownerAbsoluteMs: 7 * DAY,
  ownerIdleMs: DAY,
  kitchenAbsoluteMs: 90 * DAY,
  kitchenIdleMs: 14 * DAY,
};

describe('session cleanup (DATABASE §7)', () => {
  it('deletes sessions that ended > 30 days ago and pairing codes > 1 day old only', async () => {
    const owner = await createOwner(t.prisma);
    const make = (
      tokenHash: string,
      data: Record<string, Date | null>,
      role: 'OWNER' | 'KITCHEN',
    ) =>
      t.prisma.session.create({
        data: {
          tokenHash,
          role,
          ...(role === 'OWNER' ? { userId: owner.id } : { deviceLabel: 'TV' }),
          createdAt: ago(100),
          lastSeenAt: NOW,
          expiresAt: new Date(NOW.getTime() + DAY),
          ...data,
        },
      });
    await make('revoked-old', { revokedAt: ago(31) }, 'OWNER');
    await make('revoked-recent', { revokedAt: ago(29) }, 'OWNER');
    await make('expired-old', { expiresAt: ago(31) }, 'KITCHEN');
    await make('expired-recent', { expiresAt: ago(10) }, 'KITCHEN');
    await make('owner-idle-old', { lastSeenAt: ago(32) }, 'OWNER');
    await make('kitchen-idle-old', { lastSeenAt: ago(45) }, 'KITCHEN');
    await make('kitchen-idle-recent', { lastSeenAt: ago(40) }, 'KITCHEN');
    await make('live', {}, 'OWNER');

    const code = (codeHash: string, createdAt: Date) =>
      t.prisma.kitchenPairingCode.create({
        data: {
          codeHash,
          deviceLabel: 'TV',
          createdByUserId: owner.id,
          createdAt,
          expiresAt: new Date(createdAt.getTime() + 600_000),
        },
      });
    await code('old-code', new Date(NOW.getTime() - DAY - 1));
    await code('new-code', new Date(NOW.getTime() - 3_600_000));

    const lines: string[] = [];
    const logger = createLogger({ destination: { write: (s: string) => lines.push(s) } });
    const result = await runSessionCleanup(t.prisma, new FixedClock(NOW), ttls, logger);

    expect(result).toEqual({ sessions: 4, pairingCodes: 1 });
    const left = (await t.prisma.session.findMany({ select: { tokenHash: true } }))
      .map((s) => s.tokenHash)
      .sort();
    expect(left).toEqual(['expired-recent', 'kitchen-idle-recent', 'live', 'revoked-recent']);
    expect(
      (await t.prisma.kitchenPairingCode.findMany({ select: { codeHash: true } })).map(
        (c) => c.codeHash,
      ),
    ).toEqual(['new-code']);
    expect(JSON.parse(lines[0]!)).toMatchObject({ sessions: 4, pairingCodes: 1 });
  });
});
