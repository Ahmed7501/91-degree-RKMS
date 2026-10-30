import type {
  HistoryStatusFilter,
  OrderItemDto,
  OrderKind,
  OrderSource,
  PrepMinutes,
} from '@rkds/shared';
import type { Db } from '../../db/prisma';
import type { Order, OrderEventType, Prisma } from '../../generated/prisma/client';
import { fromBusinessDateString } from './order-dto';
import type { TerminalStatus } from './transitions';

type Tx = Prisma.TransactionClient;

export interface NewOrder {
  businessDate: string;
  now: Date;
  deadlineAt: Date;
  idempotencyKey: string;
  requestHash: string;
  text: string;
  kind: OrderKind;
  items: OrderItemDto[] | null;
  notes: string | null;
  source: OrderSource;
  prepMinutes: PrepMinutes;
  createdByUserId: string;
  requestId: string | undefined;
}

export interface HistoryFilter {
  businessDate: string;
  status: HistoryStatusFilter;
  number: number | undefined;
  limit: number;
  after: { createdAt: Date; id: string } | undefined;
}

/** All SQL for orders (DATABASE §3). Raw SQL only via tagged templates. */
export class OrdersRepository {
  constructor(private readonly prisma: Db) {}

  findByIdempotencyKey(key: string): Promise<Order | null> {
    return this.prisma.order.findUnique({ where: { idempotencyKey: key } });
  }

  findById(id: string): Promise<Order | null> {
    return this.prisma.order.findUnique({ where: { id } });
  }

  /**
   * Counter upsert → order INSERT → CREATED event, inside the caller's transaction. The counter
   * row lock serializes concurrent creates for the same business date; a rollback also rolls back
   * the increment, so numbers have no gaps (ADR-004).
   */
  async insertOrder(tx: Tx, order: NewOrder): Promise<Order> {
    const counter = await tx.$queryRaw<{ last_number: number }[]>`
      INSERT INTO order_day_counters (business_date, last_number, updated_at)
      VALUES (${order.businessDate}::date, 1, ${order.now})
      ON CONFLICT (business_date)
      DO UPDATE SET last_number = order_day_counters.last_number + 1,
                    updated_at = EXCLUDED.updated_at
      RETURNING last_number`;
    const dailyNumber = counter[0]?.last_number;
    if (dailyNumber === undefined) throw new Error('order counter upsert returned no row');

    const created = await tx.order.create({
      data: {
        businessDate: fromBusinessDateString(order.businessDate),
        dailyNumber,
        idempotencyKey: order.idempotencyKey,
        requestHash: order.requestHash,
        text: order.text,
        kind: order.kind,
        ...(order.items ? { items: order.items } : {}),
        notes: order.notes,
        source: order.source,
        prepMinutes: order.prepMinutes,
        status: 'ACTIVE',
        createdAt: order.now,
        deadlineAt: order.deadlineAt,
        updatedAt: order.now,
        createdByUserId: order.createdByUserId,
      },
    });
    await this.insertEvent(
      tx,
      created.id,
      'CREATED',
      order.createdByUserId,
      order.now,
      order.requestId,
    );
    return created;
  }

  insertEvent(
    tx: Tx,
    orderId: string,
    type: OrderEventType,
    actorUserId: string,
    occurredAt: Date,
    requestId: string | undefined,
  ): Promise<unknown> {
    return tx.orderEvent.create({
      data: { orderId, type, actorUserId, occurredAt, requestId: requestId ?? null },
    });
  }

  /** `UPDATE … WHERE id = $1 AND status = 'ACTIVE' RETURNING *` (CLAUDE.md rule 4). */
  async closeIfActive(
    tx: Tx,
    id: string,
    target: TerminalStatus,
    now: Date,
    userId: string,
  ): Promise<Order | undefined> {
    const rows = await tx.order.updateManyAndReturn({
      where: { id, status: 'ACTIVE' },
      data: {
        status: target,
        ...(target === 'COMPLETED' ? { completedAt: now } : { cancelledAt: now }),
        closedByUserId: userId,
        updatedAt: now,
        version: { increment: 1 },
      },
    });
    return rows[0];
  }

  /** Active orders, oldest first with an id tie-break (FR-KIT-02). */
  listActive(limit: number): Promise<Order[]> {
    return this.prisma.order.findMany({
      where: { status: 'ACTIVE' },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: limit,
    });
  }

  /** Keyset pagination by (createdAt DESC, id DESC): stable while new orders arrive. */
  listHistory(filter: HistoryFilter): Promise<Order[]> {
    const where: Prisma.OrderWhereInput = {
      businessDate: fromBusinessDateString(filter.businessDate),
      ...(filter.status === 'ALL' ? {} : { status: filter.status }),
      ...(filter.number === undefined ? {} : { dailyNumber: filter.number }),
      ...(filter.after
        ? {
            OR: [
              { createdAt: { lt: filter.after.createdAt } },
              { createdAt: filter.after.createdAt, id: { lt: filter.after.id } },
            ],
          }
        : {}),
    };
    return this.prisma.order.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: filter.limit,
    });
  }

  findWithEvents(id: string) {
    return this.prisma.order.findUnique({
      where: { id },
      include: {
        events: {
          orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
          include: { actor: { select: { username: true } } },
        },
      },
    });
  }

  /**
   * Retention (ADR-024): deletes up to `batchSize` closed orders whose business date is before
   * `cutoffDate`. Their events go with them (ON DELETE CASCADE); counters are kept.
   */
  async deleteClosedBefore(cutoffDate: string, batchSize: number): Promise<number> {
    return this.prisma.$executeRaw`
      DELETE FROM orders WHERE id IN (
        SELECT id FROM orders
        WHERE status <> 'ACTIVE' AND business_date < ${cutoffDate}::date
        LIMIT ${batchSize}
      )`;
  }
}
