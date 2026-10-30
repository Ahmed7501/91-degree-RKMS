import { formatDisplayNumber, OrderItemDto, type OrderDto, type PrepMinutes } from '@rkds/shared';
import { z } from 'zod';
import type { Order } from '../../generated/prisma/client';

/** `@db.Date` columns come back as UTC midnight; the business date is that calendar date. */
export function toBusinessDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function fromBusinessDateString(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

const StoredItems = z.array(OrderItemDto);

/** The only shape of an order that leaves the server (API_CONTRACTS §2). */
export function toOrderDto(order: Order): OrderDto {
  return {
    id: order.id,
    orderNumber: order.dailyNumber,
    displayNumber: formatDisplayNumber(order.dailyNumber),
    businessDate: toBusinessDateString(order.businessDate),
    text: order.text,
    kind: order.kind,
    // Written only by the server from the menu; parsed so a malformed row fails loudly.
    items: order.items === null ? null : StoredItems.parse(order.items),
    notes: order.notes,
    source: order.source,
    prepMinutes: order.prepMinutes as PrepMinutes,
    status: order.status,
    createdAt: order.createdAt.toISOString(),
    deadlineAt: order.deadlineAt.toISOString(),
    completedAt: order.completedAt?.toISOString() ?? null,
    cancelledAt: order.cancelledAt?.toISOString() ?? null,
    updatedAt: order.updatedAt.toISOString(),
    version: order.version,
  };
}
