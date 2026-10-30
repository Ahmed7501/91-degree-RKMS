import type { CreateOrderBody } from '@rkds/shared';
import { describe, expect, it } from 'vitest';
import { sha256Hex } from '../../lib/crypto';
import { idempotencyDecision, requestHash } from './idempotency';

const body = { kind: 'TEXT', text: '2x Tikka', source: 'WHATSAPP', prepMinutes: 20 } as const;

describe('requestHash (ADR-006)', () => {
  it('is stable regardless of the key order of the payload', () => {
    const reordered = {
      prepMinutes: 20,
      source: 'WHATSAPP',
      text: '2x Tikka',
      kind: 'TEXT',
    } as const;
    expect(requestHash(reordered)).toBe(requestHash(body));
    expect(requestHash(body)).toMatch(/^[0-9a-f]{64}$/);
  });

  it.each([
    ['text', { ...body, text: '2x Tikka ' }],
    ['source', { ...body, source: 'PHONE' }],
    ['prepMinutes', { ...body, prepMinutes: 25 }],
  ] as const)('changes when %s changes', (_field, changed) => {
    expect(requestHash(changed)).not.toBe(requestHash(body));
  });

  it('cannot be confused by field boundaries', () => {
    expect(requestHash({ ...body, text: 'a","PHONE' })).not.toBe(
      requestHash({ ...body, text: 'a' }),
    );
  });

  it('hashes a text order without notes exactly as before ADR-027 (old keys still replay)', () => {
    expect(requestHash(body)).toBe(sha256Hex(JSON.stringify(['2x Tikka', 'WHATSAPP', 20])));
    expect(requestHash({ ...body, notes: null })).toBe(requestHash(body));
  });

  it('changes when notes change', () => {
    const withNotes = requestHash({ ...body, notes: 'No onions' });
    expect(withNotes).not.toBe(requestHash(body));
    expect(withNotes).not.toBe(requestHash({ ...body, notes: 'Extra spicy' }));
  });
});

describe('requestHash for menu orders (ADR-027)', () => {
  const menu: CreateOrderBody = {
    kind: 'MENU',
    items: [
      { itemId: 'zinger-burger', variantId: 'regular', quantity: 2 },
      { itemId: 'masala-fries', variantId: 'large', quantity: 1 },
    ],
    source: 'PHONE',
    prepMinutes: 20,
  };
  const [line1, line2] = menu.kind === 'MENU' ? menu.items : [];

  it.each([
    ['a quantity', { ...menu, items: [{ ...line1!, quantity: 3 }, line2!] }],
    ['a size', { ...menu, items: [line1!, { ...line2!, variantId: 'medium' }] }],
    ['the line order', { ...menu, items: [line2!, line1!] }],
    ['the notes', { ...menu, notes: 'Sauce separate' }],
    ['the source', { ...menu, source: 'WHATSAPP' }],
  ] as [string, CreateOrderBody][])('changes when %s changes', (_what, changed) => {
    expect(requestHash(changed)).not.toBe(requestHash(menu));
  });

  it('never equals a text order hash', () => {
    expect(requestHash(menu)).not.toBe(
      requestHash({ kind: 'TEXT', text: '2 × Zinger Burger', source: 'PHONE', prepMinutes: 20 }),
    );
  });
});

describe('idempotencyDecision', () => {
  it('replays an identical payload and rejects a different one', () => {
    const hash = requestHash(body);
    expect(idempotencyDecision(hash, hash)).toBe('replay');
    expect(idempotencyDecision(hash, requestHash({ ...body, prepMinutes: 25 }))).toBe('reuse');
  });
});
