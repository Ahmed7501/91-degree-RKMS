import { describe, expect, it } from 'vitest';
import {
  CreateOrderBody,
  HistoryQuery,
  MENU_ORDER_EMPTY_MESSAGE,
  ORDER_NOTES_TOO_LONG_MESSAGE,
  ORDER_TEXT_EMPTY_MESSAGE,
  ORDER_TEXT_TOO_LONG_MESSAGE,
  OrderDto,
} from './order';

const valid = { text: '2x Chicken Tikka', source: 'WHATSAPP', prepMinutes: 20 };

const firstMessage = (input: unknown) => {
  const result = CreateOrderBody.safeParse(input);
  return result.success ? undefined : result.error.issues[0]?.message;
};

describe('CreateOrderBody', () => {
  it('accepts a valid order and normalizes its text', () => {
    expect(CreateOrderBody.parse({ ...valid, text: ' 2x Tikka\r\n1x Naan ' })).toEqual({
      ...valid,
      kind: 'TEXT',
      text: '2x Tikka\n1x Naan',
    });
  });

  it('treats a body without kind as a text order (pre-ADR-027 clients)', () => {
    expect(CreateOrderBody.parse(valid).kind).toBe('TEXT');
    expect(CreateOrderBody.parse({ ...valid, kind: 'TEXT' }).kind).toBe('TEXT');
  });

  it('rejects an unknown kind', () => {
    expect(CreateOrderBody.safeParse({ ...valid, kind: 'POS' }).success).toBe(false);
  });

  it('defaults prepMinutes to 20', () => {
    expect(CreateOrderBody.parse({ text: 'x', source: 'PHONE' }).prepMinutes).toBe(20);
  });

  it.each([15, 20, 25, 30])('accepts prepMinutes %i', (prepMinutes) => {
    expect(CreateOrderBody.safeParse({ ...valid, prepMinutes }).success).toBe(true);
  });

  it.each([0, 10, 19, 22, 35, 45, '20', null])('rejects prepMinutes %s', (prepMinutes) => {
    expect(CreateOrderBody.safeParse({ ...valid, prepMinutes }).success).toBe(false);
  });

  it.each(['WHATSAPP', 'FOODPANDA', 'PHONE', 'OTHER'])('accepts source %s', (source) => {
    expect(CreateOrderBody.safeParse({ ...valid, source }).success).toBe(true);
  });

  it.each(['whatsapp', 'EMAIL', ''])('rejects source %s', (source) => {
    expect(CreateOrderBody.safeParse({ ...valid, source }).success).toBe(false);
  });

  it('rejects unknown keys', () => {
    expect(CreateOrderBody.safeParse({ ...valid, orderNumber: 7 }).success).toBe(false);
  });

  it('rejects empty or whitespace-only text with the owner-facing message', () => {
    expect(firstMessage({ ...valid, text: '' })).toBe(ORDER_TEXT_EMPTY_MESSAGE);
    expect(firstMessage({ ...valid, text: ' \n\t ' })).toBe(ORDER_TEXT_EMPTY_MESSAGE);
  });

  it('accepts 5,000 characters and rejects 5,001', () => {
    expect(CreateOrderBody.safeParse({ ...valid, text: 'a'.repeat(5000) }).success).toBe(true);
    expect(firstMessage({ ...valid, text: 'a'.repeat(5001) })).toBe(ORDER_TEXT_TOO_LONG_MESSAGE);
  });

  it('counts length after trimming', () => {
    expect(CreateOrderBody.safeParse({ ...valid, text: `  ${'a'.repeat(5000)}  ` }).success).toBe(
      true,
    );
  });
});

describe('kitchen notes (ADR-027)', () => {
  const notesOf = (notes: unknown) => {
    const result = CreateOrderBody.safeParse({ ...valid, notes });
    return result.success ? result.data.notes : 'invalid';
  };

  it('are optional', () => {
    expect(CreateOrderBody.parse(valid).notes).toBeUndefined();
  });

  it('keep line breaks and internal spacing; normalize CRLF and trim the outside', () => {
    expect(notesOf('  No onions\r\n\r\n  Sauce separate  ')).toBe('No onions\n\n  Sauce separate');
  });

  it('become null when blank', () => {
    expect(notesOf('')).toBeNull();
    expect(notesOf(' \n\t ')).toBeNull();
  });

  it('accept 500 characters and reject 501 with the owner-facing message (never truncated)', () => {
    expect(notesOf('a'.repeat(500))).toBe('a'.repeat(500));
    const result = CreateOrderBody.safeParse({ ...valid, notes: 'a'.repeat(501) });
    expect(result.success ? undefined : result.error.issues[0]?.message).toBe(
      ORDER_NOTES_TOO_LONG_MESSAGE,
    );
  });

  it('reject non-strings', () => {
    expect(notesOf(42)).toBe('invalid');
    expect(notesOf(null)).toBe('invalid');
  });
});

describe('menu order body (ADR-027)', () => {
  const menuBody = {
    kind: 'MENU',
    items: [
      { itemId: 'zinger-burger', variantId: 'regular', quantity: 2 },
      { itemId: 'masala-fries', variantId: 'large', quantity: 1 },
    ],
    source: 'PHONE',
  };
  const messageOf = (input: unknown) => {
    const result = CreateOrderBody.safeParse(input);
    return result.success ? undefined : result.error.issues[0]?.message;
  };

  it('accepts item lines with a default prep target and optional notes', () => {
    const parsed = CreateOrderBody.parse({ ...menuBody, notes: 'Extra spicy' });
    expect(parsed).toEqual({ ...menuBody, prepMinutes: 20, notes: 'Extra spicy' });
  });

  it('rejects an empty selection with the owner-facing message', () => {
    expect(messageOf({ ...menuBody, items: [] })).toBe(MENU_ORDER_EMPTY_MESSAGE);
  });

  it.each([0, -1, 1.5, 100, '2'])('rejects quantity %s', (quantity) => {
    const items = [{ itemId: 'zinger-burger', variantId: 'regular', quantity }];
    expect(CreateOrderBody.safeParse({ ...menuBody, items }).success).toBe(false);
  });

  it('accepts quantity 99', () => {
    const items = [{ itemId: 'zinger-burger', variantId: 'regular', quantity: 99 }];
    expect(CreateOrderBody.safeParse({ ...menuBody, items }).success).toBe(true);
  });

  it('rejects the same item and size twice', () => {
    const line = { itemId: 'zinger-burger', variantId: 'regular', quantity: 1 };
    expect(messageOf({ ...menuBody, items: [line, line] })).toBe('This item is listed twice.');
  });

  it('allows two sizes of the same item', () => {
    const items = [
      { itemId: 'masala-fries', variantId: 'medium', quantity: 1 },
      { itemId: 'masala-fries', variantId: 'large', quantity: 1 },
    ];
    expect(CreateOrderBody.safeParse({ ...menuBody, items }).success).toBe(true);
  });

  it('rejects more than 50 lines', () => {
    const items = Array.from({ length: 51 }, (_, i) => ({
      itemId: `item-${i}`,
      variantId: 'regular',
      quantity: 1,
    }));
    expect(CreateOrderBody.safeParse({ ...menuBody, items }).success).toBe(false);
  });

  it('rejects text on a menu order and items on a text order (no mixing)', () => {
    expect(CreateOrderBody.safeParse({ ...menuBody, text: 'x' }).success).toBe(false);
    expect(CreateOrderBody.safeParse({ ...valid, items: menuBody.items }).success).toBe(false);
  });

  it('rejects unknown keys on a line', () => {
    const items = [{ itemId: 'zinger-burger', variantId: 'regular', quantity: 1, price: 1 }];
    expect(CreateOrderBody.safeParse({ ...menuBody, items }).success).toBe(false);
  });
});

describe('HistoryQuery', () => {
  it('applies defaults', () => {
    expect(HistoryQuery.parse({})).toEqual({ status: 'ALL', limit: 50 });
  });

  it('coerces query-string numbers', () => {
    expect(HistoryQuery.parse({ number: '7', limit: '20', date: '2026-10-29' })).toEqual({
      number: 7,
      limit: 20,
      date: '2026-10-29',
      status: 'ALL',
    });
  });

  it.each([
    { limit: '0' },
    { limit: '101' },
    { number: '0' },
    { number: 'abc' },
    { date: '29-10-2026' },
    { date: '2026-02-30' },
    { status: 'DELETED' },
    { cursor: '' },
    { extra: '1' },
  ])('rejects %o', (query) => {
    expect(HistoryQuery.safeParse(query).success).toBe(false);
  });
});

describe('OrderDto', () => {
  const dto = {
    id: '6b1f2a7e-0c1d-4e5f-8a9b-0c1d2e3f4a5b',
    orderNumber: 7,
    displayNumber: '007',
    businessDate: '2026-10-29',
    text: '2x Tikka',
    kind: 'TEXT',
    items: null,
    notes: null,
    source: 'WHATSAPP',
    prepMinutes: 25,
    status: 'ACTIVE',
    createdAt: '2026-10-29T13:45:12.345Z',
    deadlineAt: '2026-10-29T14:10:12.345Z',
    completedAt: null,
    cancelledAt: null,
    updatedAt: '2026-10-29T13:45:12.345Z',
    version: 1,
  };

  it('accepts a complete DTO', () => {
    expect(OrderDto.safeParse(dto).success).toBe(true);
  });

  it('rejects extra fields and missing fields', () => {
    expect(OrderDto.safeParse({ ...dto, requestHash: 'x' }).success).toBe(false);
    const { version: _version, ...missing } = dto;
    expect(OrderDto.safeParse(missing).success).toBe(false);
  });
});
