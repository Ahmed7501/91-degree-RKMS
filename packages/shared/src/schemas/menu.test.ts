import { describe, expect, it } from 'vitest';
import { formatPrice, Menu } from './menu';

const item = (
  id: string,
  variants: { id: string; label: string | null; price: number }[] = [
    { id: 'regular', label: null, price: 100 },
  ],
) => ({
  id,
  name: id,
  variants,
});
const menu = (categories: unknown[]) => ({
  menuVersion: 'test',
  source: 'test',
  currency: 'PKR',
  categories,
});
const problems = (data: unknown) => {
  const result = Menu.safeParse(data);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
};

describe('Menu schema (ADR-027)', () => {
  it('accepts a valid menu and defaults items to active', () => {
    const parsed = Menu.parse(
      menu([{ id: 'rolls', name: 'Rolls', items: [item('shawarma-roll')] }]),
    );
    expect(parsed.categories[0]?.items[0]?.active).toBe(true);
  });

  it('rejects duplicate category and item ids', () => {
    expect(
      problems(
        menu([
          { id: 'rolls', name: 'Rolls', items: [item('a')] },
          { id: 'rolls', name: 'Rolls 2', items: [item('a')] },
        ]),
      ),
    ).toEqual(['Duplicate category id "rolls".', 'Duplicate item id "a".']);
  });

  it('rejects duplicate size ids and unlabelled sizes on a multi-size item', () => {
    const sizes = [
      { id: 'small', label: null, price: 1 },
      { id: 'small', label: 'Large', price: 2 },
    ];
    expect(problems(menu([{ id: 'c', name: 'C', items: [item('x', sizes)] }]))).toEqual([
      'Duplicate variant id in "x".',
      'Every size of "x" needs a label.',
    ]);
  });

  it.each([
    ['a zero price', [{ id: 'regular', label: null, price: 0 }]],
    ['a fractional price', [{ id: 'regular', label: null, price: 1.5 }]],
    ['no sizes', []],
  ])('rejects %s', (_name, variants) => {
    expect(
      Menu.safeParse(menu([{ id: 'c', name: 'C', items: [item('x', variants)] }])).success,
    ).toBe(false);
  });

  it('rejects ids that are not lowercase-kebab-case', () => {
    expect(
      Menu.safeParse(menu([{ id: 'c', name: 'C', items: [item('Zinger Burger')] }])).success,
    ).toBe(false);
  });

  it('rejects unknown keys and other currencies', () => {
    expect(Menu.safeParse({ ...menu([]), extra: 1 }).success).toBe(false);
    expect(
      Menu.safeParse({ ...menu([{ id: 'c', name: 'C', items: [item('x')] }]), currency: 'USD' })
        .success,
    ).toBe(false);
  });
});

describe('formatPrice', () => {
  it('formats whole rupees with thousands separators', () => {
    expect(formatPrice(30)).toBe('Rs 30');
    expect(formatPrice(1200)).toBe('Rs 1,200');
  });
});
