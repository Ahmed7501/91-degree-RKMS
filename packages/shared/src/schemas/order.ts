import { z } from 'zod';
import {
  DEFAULT_PREP_MINUTES,
  HISTORY_PAGE_DEFAULT,
  HISTORY_PAGE_MAX,
  MENU_LINE_MAX_QUANTITY,
  MENU_ORDER_MAX_LINES,
  ORDER_KINDS,
  ORDER_NOTES_MAX_CHARS,
  ORDER_SOURCES,
  ORDER_STATUSES,
  PREP_MINUTES,
  ORDER_TEXT_MAX_CHARS,
} from '../constants';
import { normalizeOrderText } from '../text/normalize-order-text';
import { BusinessDate, IsoDateTime, Uuid } from './common';

export const OrderSource = z.enum(ORDER_SOURCES);
export type OrderSource = z.infer<typeof OrderSource>;

export const OrderStatus = z.enum(ORDER_STATUSES);
export type OrderStatus = z.infer<typeof OrderStatus>;

export const PrepMinutes = z.literal(PREP_MINUTES);
export type PrepMinutes = z.infer<typeof PrepMinutes>;

export const ORDER_TEXT_EMPTY_MESSAGE = 'Order text cannot be empty.';
export const ORDER_TEXT_TOO_LONG_MESSAGE = 'Order is too long (max 5,000 characters).';

/** Normalized per ADR-020, then 1–5,000 characters. */
export const OrderText = z
  .string()
  .transform(normalizeOrderText)
  .pipe(
    z
      .string()
      .min(1, ORDER_TEXT_EMPTY_MESSAGE)
      .max(ORDER_TEXT_MAX_CHARS, ORDER_TEXT_TOO_LONG_MESSAGE),
  );

export const OrderKind = z.enum(ORDER_KINDS);
export type OrderKind = z.infer<typeof OrderKind>;

export const ORDER_NOTES_TOO_LONG_MESSAGE = 'Kitchen notes are too long (max 500 characters).';

/** Optional kitchen notes (ADR-027): ADR-020 normalization, max 500 characters, blank → null. */
export const OrderNotes = z
  .string()
  .transform(normalizeOrderText)
  .pipe(z.string().max(ORDER_NOTES_MAX_CHARS, ORDER_NOTES_TOO_LONG_MESSAGE))
  .transform((notes) => (notes.length > 0 ? notes : null));

const orderCommon = {
  source: OrderSource,
  prepMinutes: PrepMinutes.default(DEFAULT_PREP_MINUTES),
  notes: OrderNotes.optional(),
};

export const TextOrderBody = z.strictObject({
  kind: z.literal('TEXT'),
  text: OrderText,
  ...orderCommon,
});

/** One selected menu line: an item, one of its sizes, and how many. */
export const MenuOrderLine = z.strictObject({
  itemId: z.string().min(1).max(80),
  variantId: z.string().min(1).max(80),
  quantity: z.number().int().min(1).max(MENU_LINE_MAX_QUANTITY),
});
export type MenuOrderLine = z.infer<typeof MenuOrderLine>;

export const MENU_ORDER_EMPTY_MESSAGE = 'Choose at least one item.';

export const MenuOrderBody = z.strictObject({
  kind: z.literal('MENU'),
  items: z
    .array(MenuOrderLine)
    .min(1, MENU_ORDER_EMPTY_MESSAGE)
    .max(MENU_ORDER_MAX_LINES, `At most ${MENU_ORDER_MAX_LINES} different items per order.`)
    .superRefine((lines, ctx) => {
      const seen = new Set<string>();
      lines.forEach((line, i) => {
        const key = `${line.itemId}/${line.variantId}`;
        if (seen.has(key)) {
          ctx.addIssue({ code: 'custom', path: [i], message: 'This item is listed twice.' });
        }
        seen.add(key);
      });
    }),
  ...orderCommon,
});

/**
 * POST /api/orders body. A body without `kind` is a text order, so existing clients keep working
 * (ADR-027). Menu orders send item ids; the server builds the kitchen text from the menu.
 */
export const CreateOrderBody = z.preprocess(
  (value) =>
    value !== null && typeof value === 'object' && !Array.isArray(value) && !('kind' in value)
      ? { ...value, kind: 'TEXT' }
      : value,
  z.discriminatedUnion('kind', [TextOrderBody, MenuOrderBody]),
);
export type CreateOrderInput =
  (Omit<z.input<typeof TextOrderBody>, 'kind'> & { kind?: 'TEXT' }) | z.input<typeof MenuOrderBody>;
export type CreateOrderBody = z.output<typeof CreateOrderBody>;

export const IdempotencyKey = Uuid;

export const TransitionBody = z.strictObject({});

/** A menu line as saved with the order: a snapshot, unaffected by later menu changes. */
export const OrderItemDto = z.strictObject({
  itemId: z.string(),
  variantId: z.string(),
  name: z.string(),
  variant: z.string().nullable(),
  quantity: z.number().int().positive(),
  unitPrice: z.number().int().nonnegative().nullable(),
});
export type OrderItemDto = z.infer<typeof OrderItemDto>;

export const OrderDto = z.strictObject({
  id: Uuid,
  orderNumber: z.number().int().positive(),
  displayNumber: z.string(),
  businessDate: BusinessDate,
  /** TEXT: the owner's text. MENU: one "2 × Name (Size)" line per item, built by the server. */
  text: z.string(),
  kind: OrderKind,
  items: z.array(OrderItemDto).nullable(),
  notes: z.string().nullable(),
  source: OrderSource,
  prepMinutes: PrepMinutes,
  status: OrderStatus,
  createdAt: IsoDateTime,
  deadlineAt: IsoDateTime,
  completedAt: IsoDateTime.nullable(),
  cancelledAt: IsoDateTime.nullable(),
  updatedAt: IsoDateTime,
  version: z.number().int().positive(),
});
export type OrderDto = z.infer<typeof OrderDto>;

export const HistoryStatusFilter = z.enum(['ALL', ...ORDER_STATUSES]);
export type HistoryStatusFilter = z.infer<typeof HistoryStatusFilter>;

export const HistoryQuery = z.strictObject({
  date: BusinessDate.optional(),
  status: HistoryStatusFilter.default('ALL'),
  number: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(HISTORY_PAGE_MAX).default(HISTORY_PAGE_DEFAULT),
  cursor: z.string().min(1).max(200).optional(),
});
export type HistoryQuery = z.output<typeof HistoryQuery>;

export const OrderEventType = z.enum(['CREATED', 'COMPLETED', 'CANCELLED']);
export type OrderEventType = z.infer<typeof OrderEventType>;

export const OrderEventDto = z.strictObject({
  type: OrderEventType,
  occurredAt: IsoDateTime,
  actor: z.strictObject({ username: z.string() }).nullable(),
});
export type OrderEventDto = z.infer<typeof OrderEventDto>;

export const CreateOrderResponse = z.object({ order: OrderDto, serverTime: IsoDateTime });
export type CreateOrderResponse = z.infer<typeof CreateOrderResponse>;

export const ActiveOrdersResponse = z.object({
  orders: z.array(OrderDto),
  serverTime: IsoDateTime,
  truncated: z.boolean().optional(),
});
export type ActiveOrdersResponse = z.infer<typeof ActiveOrdersResponse>;

export const HistoryResponse = z.object({
  orders: z.array(OrderDto),
  nextCursor: z.string().nullable(),
  businessDate: BusinessDate,
  serverTime: IsoDateTime,
});
export type HistoryResponse = z.infer<typeof HistoryResponse>;

export const OrderDetailResponse = z.object({ order: OrderDto, events: z.array(OrderEventDto) });
export type OrderDetailResponse = z.infer<typeof OrderDetailResponse>;

export const TransitionResponse = z.object({
  order: OrderDto,
  alreadyApplied: z.boolean(),
  serverTime: IsoDateTime,
});
export type TransitionResponse = z.infer<typeof TransitionResponse>;
