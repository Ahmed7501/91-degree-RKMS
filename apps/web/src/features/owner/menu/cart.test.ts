import type { Menu } from '@rkds/shared';
import { describe, expect, it } from 'vitest';
import {
  changeQuantity,
  itemCount,
  quantityOf,
  referenceTotal,
  removeLine,
  sanitizeCart,
  summarize,
  type CartLine,
} from './cart';

const menu: Menu = {
  menuVersion: 't',
  source: 't',
  currency: 'PKR',
  categories: [
    {
      id: 'burgers',
      name: 'Burgers',
      items: [
        {
          id: 'zinger-burger',
          name: 'Zinger Burger',
          active: true,
          variants: [{ id: 'regular', label: null, price: 460 }],
        },
      ],
    },
    {
      id: 'fries',
      name: 'Fries',
      items: [
        {
          id: 'masala-fries',
          name: 'Masala Fries',
          active: true,
          variants: [
            { id: 'medium', label: 'Medium', price: 150 },
            { id: 'large', label: 'Large', price: 200 },
          ],
        },
      ],
    },
  ],
};

const apply = (deltas: [string, string, number][], start: CartLine[] = []) =>
  deltas.reduce(
    (cart, [item, variant, delta]) => changeQuantity(cart, item, variant, delta),
    start,
  );

describe('cart quantities (ADR-027)', () => {
  it('+ adds a line at quantity 1, further + increments it', () => {
    const cart = apply([
      ['zinger-burger', 'regular', 1],
      ['zinger-burger', 'regular', 1],
    ]);
    expect(cart).toEqual([{ itemId: 'zinger-burger', variantId: 'regular', quantity: 2 }]);
  });

  it('− decrements; reaching 0 removes the line', () => {
    const cart = apply([
      ['zinger-burger', 'regular', 1],
      ['zinger-burger', 'regular', 1],
      ['zinger-burger', 'regular', -1],
    ]);
    expect(quantityOf(cart, 'zinger-burger', 'regular')).toBe(1);
    expect(changeQuantity(cart, 'zinger-burger', 'regular', -1)).toEqual([]);
  });

  it('never goes negative: − on an item that is not selected changes nothing', () => {
    expect(changeQuantity([], 'zinger-burger', 'regular', -1)).toEqual([]);
  });

  it('caps a line at 99', () => {
    const cart = changeQuantity(
      [{ itemId: 'zinger-burger', variantId: 'regular', quantity: 99 }],
      'zinger-burger',
      'regular',
      1,
    );
    expect(quantityOf(cart, 'zinger-burger', 'regular')).toBe(99);
  });

  it('keeps sizes of the same item as separate lines, in the order they were added', () => {
    const cart = apply([
      ['masala-fries', 'large', 1],
      ['zinger-burger', 'regular', 1],
      ['masala-fries', 'medium', 1],
    ]);
    expect(cart.map((l) => `${l.itemId}/${l.variantId}`)).toEqual([
      'masala-fries/large',
      'zinger-burger/regular',
      'masala-fries/medium',
    ]);
  });

  it('20 rapid clicks give exactly 20 and never a duplicate line', () => {
    const cart = apply(Array.from({ length: 20 }, () => ['zinger-burger', 'regular', 1] as const));
    expect(cart).toEqual([{ itemId: 'zinger-burger', variantId: 'regular', quantity: 20 }]);
  });

  it('does not add a 51st distinct line', () => {
    const full = Array.from({ length: 50 }, (_, i) => ({
      itemId: `item-${i}`,
      variantId: 'regular',
      quantity: 1,
    }));
    expect(changeQuantity(full, 'zinger-burger', 'regular', 1)).toHaveLength(50);
  });

  it('removeLine and itemCount', () => {
    const cart = apply([
      ['zinger-burger', 'regular', 2],
      ['masala-fries', 'large', 1],
    ]);
    expect(itemCount(cart)).toBe(3);
    expect(removeLine(cart, 'zinger-burger', 'regular')).toEqual([
      { itemId: 'masala-fries', variantId: 'large', quantity: 1 },
    ]);
  });

  it('does not mutate the cart it was given', () => {
    const cart: CartLine[] = [{ itemId: 'zinger-burger', variantId: 'regular', quantity: 1 }];
    changeQuantity(cart, 'zinger-burger', 'regular', 1);
    expect(cart[0]?.quantity).toBe(1);
  });
});

describe('summary and reference total', () => {
  it('joins names, sizes and prices, and totals the selection', () => {
    const lines = summarize(
      [
        { itemId: 'zinger-burger', variantId: 'regular', quantity: 2 },
        { itemId: 'masala-fries', variantId: 'large', quantity: 1 },
      ],
      menu,
    );
    expect(lines.map((l) => [l.name, l.variant, l.unitPrice, l.missing])).toEqual([
      ['Zinger Burger', null, 460, false],
      ['Masala Fries', 'Large', 200, false],
    ]);
    expect(referenceTotal(lines)).toBe(1120);
  });

  it('keeps and flags lines that are no longer on the menu (never silently dropped)', () => {
    const [line] = summarize([{ itemId: 'gone', variantId: 'regular', quantity: 1 }], menu);
    expect(line).toMatchObject({ name: 'gone', missing: true, unitPrice: null });
    expect(referenceTotal([line!])).toBe(0);
  });
});

describe('sanitizeCart (stored drafts)', () => {
  it('keeps valid lines and drops malformed, zero, oversized and duplicate ones', () => {
    expect(
      sanitizeCart([
        { itemId: 'a', variantId: 'regular', quantity: 2 },
        { itemId: 'a', variantId: 'regular', quantity: 5 },
        { itemId: 'b', variantId: 'regular', quantity: 0 },
        { itemId: 'c', variantId: 'regular', quantity: 100 },
        { itemId: 'd', variantId: 'regular', quantity: 1.5 },
        { itemId: 'e', quantity: 1 },
        null,
        'x',
      ]),
    ).toEqual([{ itemId: 'a', variantId: 'regular', quantity: 2 }]);
    expect(sanitizeCart('nope')).toEqual([]);
  });
});
