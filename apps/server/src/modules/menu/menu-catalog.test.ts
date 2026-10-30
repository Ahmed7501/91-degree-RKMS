import { describe, expect, it } from 'vitest';
import menuData from './91-degree-menu.json' with { type: 'json' };
import { MenuCatalog, MenuDataError, menuOrderText, parseMenu } from './menu-catalog';

const small = {
  menuVersion: 't',
  source: 't',
  currency: 'PKR',
  categories: [
    {
      id: 'fries',
      name: 'Fries',
      items: [
        {
          id: 'masala-fries',
          name: 'Masala Fries',
          variants: [
            { id: 'medium', label: 'Medium', price: 150 },
            { id: 'large', label: 'Large', price: 200 },
          ],
        },
        {
          id: 'old-fries',
          name: 'Old Fries',
          active: false,
          variants: [{ id: 'regular', label: null, price: 1 }],
        },
      ],
    },
    {
      id: 'retired',
      name: 'Retired',
      items: [
        {
          id: 'gone',
          name: 'Gone',
          active: false,
          variants: [{ id: 'regular', label: null, price: 1 }],
        },
      ],
    },
  ],
};

describe('the bundled 91 Degree menu (docs/MENU.md)', () => {
  const menu = parseMenu(menuData);

  it('is valid: 12 categories and 88 items as transcribed from the printed menu', () => {
    expect(menu.categories).toHaveLength(12);
    expect(menu.categories.reduce((n, c) => n + c.items.length, 0)).toBe(88);
  });

  it('keeps the printed category order', () => {
    expect(menu.categories.map((c) => c.name)).toEqual([
      'Appetizers',
      'Fries & Fast-Food',
      'Wings & Strips',
      'Burgers',
      'Chinese',
      'Pakistani',
      'BAR B.Q',
      'Flavours of Fame',
      'Rolls',
      'Deals',
      'Sandwiches',
      'Additional',
    ]);
  });

  it('spot-checks printed names and prices', () => {
    const price = (itemId: string, variantId = 'regular') =>
      menu.categories
        .flatMap((c) => c.items)
        .find((i) => i.id === itemId)
        ?.variants.find((v) => v.id === variantId)?.price;
    expect(price('zinger-burger')).toBe(460);
    expect(price('chicken-karahi')).toBe(1100);
    expect(price('masala-fries', 'large')).toBe(200);
    expect(price('broast-quarter', 'chest')).toBe(600);
    expect(price('deal-12')).toBe(3000);
    expect(price('coleslaw')).toBe(20);
  });
});

describe('MenuCatalog', () => {
  const catalog = MenuCatalog.load(small);

  it('serves only active items and drops categories left empty', () => {
    expect(catalog.ownerMenu.categories.map((c) => c.id)).toEqual(['fries']);
    expect(catalog.ownerMenu.categories[0]?.items.map((i) => i.id)).toEqual(['masala-fries']);
    expect(catalog.itemCount).toBe(1);
  });

  it('resolves lines into snapshots with name, size label and price', () => {
    expect(
      catalog.resolve([
        { itemId: 'masala-fries', variantId: 'large', quantity: 2 },
        { itemId: 'masala-fries', variantId: 'medium', quantity: 1 },
      ]),
    ).toEqual([
      {
        itemId: 'masala-fries',
        variantId: 'large',
        name: 'Masala Fries',
        variant: 'Large',
        quantity: 2,
        unitPrice: 200,
      },
      {
        itemId: 'masala-fries',
        variantId: 'medium',
        name: 'Masala Fries',
        variant: 'Medium',
        quantity: 1,
        unitPrice: 150,
      },
    ]);
  });

  it('rejects unknown items, unknown sizes and inactive items with every failing line', () => {
    let error: unknown;
    try {
      catalog.resolve([
        { itemId: 'masala-fries', variantId: 'large', quantity: 1 },
        { itemId: 'nope', variantId: 'regular', quantity: 1 },
        { itemId: 'masala-fries', variantId: 'huge', quantity: 1 },
        { itemId: 'old-fries', variantId: 'regular', quantity: 1 },
      ]);
    } catch (e) {
      error = e;
    }
    expect(error).toMatchObject({
      code: 'MENU_ITEM_UNAVAILABLE',
      status: 409,
      details: {
        unavailable: [
          { index: 1, itemId: 'nope', variantId: 'regular' },
          { index: 2, itemId: 'masala-fries', variantId: 'huge' },
          { index: 3, itemId: 'old-fries', variantId: 'regular' },
        ],
      },
    });
  });

  it('refuses invalid menu data with readable problems (startup fails fast)', () => {
    expect(() => MenuCatalog.load({ ...small, currency: 'USD' })).toThrow(MenuDataError);
    try {
      parseMenu({ ...small, categories: [] });
    } catch (error) {
      expect((error as MenuDataError).problems[0]).toMatch(/^categories:/);
    }
  });
});

describe('menuOrderText', () => {
  it('writes one "quantity × name (size)" line per item, in order', () => {
    expect(
      menuOrderText([
        {
          itemId: 'a',
          variantId: 'regular',
          name: 'Zinger Burger',
          variant: null,
          quantity: 2,
          unitPrice: 460,
        },
        {
          itemId: 'b',
          variantId: 'large',
          name: 'Masala Fries',
          variant: 'Large',
          quantity: 1,
          unitPrice: 200,
        },
      ]),
    ).toBe('2 × Zinger Burger\n1 × Masala Fries (Large)');
  });
});
