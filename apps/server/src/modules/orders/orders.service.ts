import {
  businessDateFor,
  formatDisplayNumber,
  ORDER_TEXT_MAX_CHARS,
  retentionCutoffDate,
  Uuid,
  type CreateOrderBody,
  type HistoryQuery,
  type OrderDetailResponse,
  type OrderDto,
  type OrderItemDto,
} from '@rkds/shared';
import type { Env } from '../../config/env';
import { isUniqueViolation } from '../../db/errors';
import type { Db } from '../../db/prisma';
import { AppError } from '../../errors/app-error';
import type { Order } from '../../generated/prisma/client';
import type { Clock } from '../../lib/clock';
import type { Logger } from '../../lib/logger';
import { menuOrderText, type MenuCatalog } from '../menu/menu-catalog';
import { idempotencyDecision, requestHash } from './idempotency';
import { toBusinessDateString, toOrderDto } from './order-dto';
import type { OrderEventBus } from './order-events';
import type { OrdersRepository } from './orders.repository';
import { transitionOutcome, type TerminalStatus } from './transitions';

export const ACTIVE_ORDERS_CAP = 500;
const TRANSACTION_OPTIONS = { timeout: 5_000, maxWait: 2_000 };
const IDEMPOTENCY_KEY_CONSTRAINT = 'orders_idempotency_key_key';

export interface Actor {
  userId: string;
  requestId: string | undefined;
}

export interface HistoryPage {
  orders: OrderDto[];
  nextCursor: string | null;
  businessDate: string;
}

interface Cursor {
  createdAt: Date;
  id: string;
}

function encodeCursor(order: Order): string {
  return Buffer.from(JSON.stringify([order.createdAt.toISOString(), order.id])).toString(
    'base64url',
  );
}

function decodeCursor(cursor: string): Cursor {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (Array.isArray(parsed) && parsed.length === 2) {
      const [createdAt, id] = parsed as unknown[];
      const date = new Date(String(createdAt));
      if (
        typeof createdAt === 'string' &&
        typeof id === 'string' &&
        !Number.isNaN(date.getTime()) &&
        Uuid.safeParse(id).success
      ) {
        return { createdAt: date, id };
      }
    }
  } catch {
    // Falls through to the validation error below.
  }
  throw new AppError('VALIDATION_FAILED', {
    details: [{ path: 'cursor', message: 'Invalid cursor.' }],
    message: 'Invalid cursor.',
  });
}

/**
 * Order creation, numbering, idempotency, transitions and queries (modules/orders). Results are
 * reported and events published only after the transaction commits (CLAUDE.md rule 1).
 */
export class OrdersService {
  constructor(
    private readonly prisma: Db,
    private readonly repo: OrdersRepository,
    private readonly clock: Clock,
    private readonly env: Env,
    private readonly events: OrderEventBus,
    private readonly logger: Logger,
    private readonly menu: MenuCatalog,
  ) {}

  currentBusinessDate(now: Date = this.clock.now()): string {
    return businessDateFor(now, this.env.businessDayCutoffHour, this.env.timeZone);
  }

  /** Returns the order and whether this was an idempotent replay (no new row, no event). */
  async create(
    body: CreateOrderBody,
    idempotencyKey: string,
    actor: Actor,
  ): Promise<{ order: OrderDto; replayed: boolean }> {
    const hash = requestHash(body);
    const existing = await this.repo.findByIdempotencyKey(idempotencyKey);
    if (existing) return this.replayOrReject(existing, hash);

    // Menu orders: the server resolves item ids and writes the kitchen text (ADR-027).
    let text: string;
    let items: OrderItemDto[] | null = null;
    if (body.kind === 'MENU') {
      items = this.menu.resolve(body.items);
      text = menuOrderText(items);
      if (text.length > ORDER_TEXT_MAX_CHARS) {
        throw new AppError('VALIDATION_FAILED', {
          details: [{ path: 'items', message: 'Too many items for one order.' }],
          message: 'Too many items for one order. Split it into two orders.',
        });
      }
    } else {
      text = body.text;
    }

    // One clock reading for created_at, deadline_at and business_date (DATABASE §4).
    const now = this.clock.now();
    const businessDate = this.currentBusinessDate(now);
    const deadlineAt = new Date(now.getTime() + body.prepMinutes * 60_000);

    let created: Order;
    try {
      created = await this.prisma.$transaction(
        (tx) =>
          this.repo.insertOrder(tx, {
            businessDate,
            now,
            deadlineAt,
            idempotencyKey,
            requestHash: hash,
            text,
            kind: body.kind,
            items,
            notes: body.notes ?? null,
            source: body.source,
            prepMinutes: body.prepMinutes,
            createdByUserId: actor.userId,
            requestId: actor.requestId,
          }),
        TRANSACTION_OPTIONS,
      );
    } catch (error) {
      // A concurrent request with the same key committed first: answer like a retry would.
      if (isUniqueViolation(error, IDEMPOTENCY_KEY_CONSTRAINT)) {
        const winner = await this.repo.findByIdempotencyKey(idempotencyKey);
        if (winner) return this.replayOrReject(winner, hash);
      }
      throw error;
    }

    const order = toOrderDto(created);
    this.logger.info(
      {
        event: 'order_created',
        orderId: order.id,
        orderNumber: order.orderNumber,
        businessDate,
        kind: order.kind,
        // Counts only: order text, item names and notes are never logged (CLAUDE.md rule 6).
        lines: items?.length,
        hasNotes: order.notes !== null,
      },
      'order created',
    );
    this.events.publish('created', order);
    return { order, replayed: false };
  }

  private replayOrReject(existing: Order, hash: string): { order: OrderDto; replayed: true } {
    if (idempotencyDecision(existing.requestHash, hash) === 'replay') {
      return { order: toOrderDto(existing), replayed: true };
    }
    const existingBusinessDate = toBusinessDateString(existing.businessDate);
    throw new AppError('IDEMPOTENCY_KEY_REUSED', {
      details: { existingOrderNumber: existing.dailyNumber, existingBusinessDate },
      messageParams: { existingDisplayNumber: formatDisplayNumber(existing.dailyNumber) },
    });
  }

  /** ACTIVE → COMPLETED/CANCELLED, guarded in SQL; repeats are idempotent, conflicts are 409. */
  async close(
    id: string,
    target: TerminalStatus,
    actor: Actor,
  ): Promise<{ order: OrderDto; alreadyApplied: boolean }> {
    const now = this.clock.now();
    const closed = await this.prisma.$transaction(async (tx) => {
      const row = await this.repo.closeIfActive(tx, id, target, now, actor.userId);
      if (row) {
        await this.repo.insertEvent(tx, row.id, target, actor.userId, now, actor.requestId);
      }
      return row;
    }, TRANSACTION_OPTIONS);

    if (closed) {
      const order = toOrderDto(closed);
      this.logger.info(
        {
          event: `order_${target.toLowerCase()}`,
          orderId: order.id,
          orderNumber: order.orderNumber,
        },
        'order closed',
      );
      this.events.publish('updated', order);
      return { order, alreadyApplied: false };
    }

    const current = await this.repo.findById(id);
    if (!current) throw new AppError('ORDER_NOT_FOUND');
    if (transitionOutcome(current.status, target) === 'alreadyApplied') {
      return { order: toOrderDto(current), alreadyApplied: true };
    }
    throw new AppError('INVALID_STATUS_TRANSITION', {
      details: { currentStatus: current.status },
      messageParams: { currentStatus: current.status },
    });
  }

  async listActive(): Promise<{ orders: OrderDto[]; truncated: boolean }> {
    const rows = await this.repo.listActive(ACTIVE_ORDERS_CAP + 1);
    const truncated = rows.length > ACTIVE_ORDERS_CAP;
    if (truncated) {
      this.logger.error({ event: 'active_orders_truncated', cap: ACTIVE_ORDERS_CAP }, 'cap hit');
    }
    return { orders: rows.slice(0, ACTIVE_ORDERS_CAP).map(toOrderDto), truncated };
  }

  /** History limited to the retention window: today back to ORDER_RETENTION_DAYS (ADR-024). */
  async history(query: HistoryQuery): Promise<HistoryPage> {
    const today = this.currentBusinessDate();
    const businessDate = query.date ?? today;
    const oldest = retentionCutoffDate(today, this.env.orderRetentionDays);
    if (businessDate < oldest || businessDate > today) {
      throw new AppError('VALIDATION_FAILED', {
        details: [{ path: 'date', message: `Choose a date between ${oldest} and ${today}.` }],
        message: `Order history is kept for ${this.env.orderRetentionDays} days.`,
      });
    }
    const rows = await this.repo.listHistory({
      businessDate,
      status: query.status,
      number: query.number,
      limit: query.limit + 1,
      after: query.cursor ? decodeCursor(query.cursor) : undefined,
    });
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    return {
      orders: page.map(toOrderDto),
      nextCursor: rows.length > query.limit && last ? encodeCursor(last) : null,
      businessDate,
    };
  }

  async detail(id: string): Promise<OrderDetailResponse> {
    const row = await this.repo.findWithEvents(id);
    if (!row) throw new AppError('ORDER_NOT_FOUND');
    const { events, ...order } = row;
    return {
      order: toOrderDto(order),
      events: events.map((event) => ({
        type: event.type,
        occurredAt: event.occurredAt.toISOString(),
        actor: event.actor ? { username: event.actor.username } : null,
      })),
    };
  }
}
