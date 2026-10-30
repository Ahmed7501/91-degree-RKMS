import { businessDateFor, retentionCutoffDate } from '@rkds/shared';
import type { Env } from '../../config/env';
import type { Clock } from '../../lib/clock';
import type { Logger } from '../../lib/logger';
import type { OrdersRepository } from '../orders/orders.repository';

export const ORDER_RETENTION_INTERVAL_MS = 60 * 60_000;
export const ORDER_RETENTION_BATCH = 500;

/**
 * ADR-024: deletes completed/cancelled orders (and their audit events) whose business date is
 * more than ORDER_RETENTION_DAYS before the current business date. Active orders are never
 * purged; daily counters are kept so numbers are never reused. Logs counts only.
 */
export async function runOrderRetention(
  repo: OrdersRepository,
  clock: Clock,
  env: Env,
  logger: Logger,
  batchSize = ORDER_RETENTION_BATCH,
): Promise<{ deleted: number; cutoffDate: string }> {
  const today = businessDateFor(clock.now(), env.businessDayCutoffHour, env.timeZone);
  const cutoffDate = retentionCutoffDate(today, env.orderRetentionDays);
  let deleted = 0;
  let batches = 0;
  for (;;) {
    const count = await repo.deleteClosedBefore(cutoffDate, batchSize);
    deleted += count;
    batches += 1;
    if (count < batchSize) break;
  }
  logger.info(
    { event: 'order_retention', deleted, batches, cutoffDate },
    'order retention finished',
  );
  return { deleted, cutoffDate };
}
