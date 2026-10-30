import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createLogger } from '../../src/lib/logger';
import { runOrderRetention } from '../../src/modules/maintenance/order-retention';
import { createTestApp } from '../helpers/app-harness';
import { createOwner } from '../helpers/factories';
import { pkt } from '../helpers/fixed-clock';
import { truncateAll, withPgClient } from '../helpers/test-db';

const t = createTestApp();
afterAll(() => t.close());

let ownerId: string;
beforeEach(async () => {
  await truncateAll();
  ownerId = (await createOwner(t.prisma)).id;
});

/** Inserts an order (and its CREATED event) directly for a given business date and status. */
async function insertOrder(
  businessDate: string,
  number: number,
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED',
) {
  const created = new Date(`${businessDate}T14:00:00.000Z`);
  const deadline = new Date(created.getTime() + 20 * 60_000);
  const row = await t.prisma.order.create({
    data: {
      businessDate: new Date(`${businessDate}T00:00:00.000Z`),
      dailyNumber: number,
      idempotencyKey: crypto.randomUUID(),
      requestHash: 'h',
      text: `customer text ${number}`,
      source: 'PHONE',
      prepMinutes: 20,
      status,
      createdAt: created,
      deadlineAt: deadline,
      completedAt: status === 'COMPLETED' ? deadline : null,
      cancelledAt: status === 'CANCELLED' ? deadline : null,
      updatedAt: deadline,
      createdByUserId: ownerId,
    },
  });
  await t.prisma.orderEvent.create({
    data: { orderId: row.id, type: 'CREATED', occurredAt: created, actorUserId: ownerId },
  });
  await t.prisma.orderDayCounter.upsert({
    where: { businessDate: new Date(`${businessDate}T00:00:00.000Z`) },
    create: {
      businessDate: new Date(`${businessDate}T00:00:00.000Z`),
      lastNumber: number,
      updatedAt: created,
    },
    update: { lastNumber: number },
  });
  return row.id;
}

function run(batchSize?: number) {
  const lines: string[] = [];
  const logger = createLogger({ destination: { write: (s: string) => lines.push(s) } });
  t.clock.set(pkt('2026-10-29T20:00:00')); // business date 2026-10-29 → keep 22nd onwards
  return runOrderRetention(t.services.ordersRepo, t.clock, t.env, logger, batchSize).then(
    (result) => ({ result, log: lines.join('') }),
  );
}

describe('7-day order retention (ADR-024, FR-ORD-16)', () => {
  it('deletes closed orders older than 7 business days with their events, keeps the rest', async () => {
    const oldCompleted = await insertOrder('2026-10-21', 1, 'COMPLETED');
    const oldCancelled = await insertOrder('2026-10-21', 2, 'CANCELLED');
    const oldActive = await insertOrder('2026-10-20', 1, 'ACTIVE');
    const exactlySeven = await insertOrder('2026-10-22', 1, 'COMPLETED');
    const today = await insertOrder('2026-10-29', 1, 'COMPLETED');

    const { result, log } = await run();
    expect(result).toEqual({ deleted: 2, cutoffDate: '2026-10-22' });
    const left = (await t.prisma.order.findMany({ select: { id: true } })).map((o) => o.id).sort();
    expect(left).toEqual([oldActive, exactlySeven, today].sort());
    const events = await t.prisma.orderEvent.findMany({
      where: { orderId: { in: [oldCompleted, oldCancelled] } },
    });
    expect(events).toHaveLength(0);
    // Counters are kept, so a number is never reused for that date.
    expect(await t.prisma.orderDayCounter.count()).toBe(4);
    // Only counts and the cutoff date are logged, never order text.
    expect(log).toContain('"deleted":2');
    expect(log).not.toContain('customer text');
  });

  it('purges more than one batch', async () => {
    await withPgClient(async (c) => {
      await c.query(
        `INSERT INTO orders (business_date, daily_number, idempotency_key, request_hash, text, source,
           prep_minutes, status, created_at, deadline_at, completed_at, updated_at)
         SELECT '2026-10-01', n, gen_random_uuid(), 'h', 'x', 'PHONE', 20, 'COMPLETED',
           '2026-10-01T14:00:00Z', '2026-10-01T14:20:00Z', '2026-10-01T14:20:00Z', '2026-10-01T14:20:00Z'
         FROM generate_series(1, 1200) AS n`,
      );
    });
    const { result, log } = await run(500);
    expect(result.deleted).toBe(1200);
    expect(log).toContain('"batches":3');
    expect(await t.prisma.order.count()).toBe(0);
  });
});
