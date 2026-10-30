import { z } from 'zod';

/**
 * The restaurant menu (ADR-027, docs/MENU.md). The data is the printed 91 Degree menu, versioned
 * in apps/server/src/modules/menu/91-degree-menu.json and validated by the server at startup.
 * Prices are a reference for the owner only: this is not a POS (EX-01).
 */
const MenuId = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase-kebab-case ids.');

export const MenuVariant = z.strictObject({
  id: MenuId,
  /** null for an item that has one size only. */
  label: z.string().min(1).max(60).nullable(),
  /** Whole rupees as printed on the menu. */
  price: z.number().int().positive().max(1_000_000),
});
export type MenuVariant = z.infer<typeof MenuVariant>;

export const MenuItem = z.strictObject({
  id: MenuId,
  name: z.string().min(1).max(160),
  description: z.string().min(1).max(400).optional(),
  /** Owner-facing remark printed on the menu, e.g. "Serves 2 - 3". */
  note: z.string().min(1).max(120).optional(),
  /** false hides the item from ordering without deleting its id. */
  active: z.boolean().default(true),
  variants: z.array(MenuVariant).min(1).max(10),
});
export type MenuItem = z.output<typeof MenuItem>;

export const MenuCategory = z.strictObject({
  id: MenuId,
  name: z.string().min(1).max(60),
  items: z.array(MenuItem).min(1),
});
export type MenuCategory = z.output<typeof MenuCategory>;

/** Ids are unique per level, so an order line is identified by (itemId, variantId). */
export const Menu = z
  .strictObject({
    menuVersion: z.string().min(1).max(40),
    source: z.string().min(1).max(400),
    currency: z.literal('PKR'),
    categories: z.array(MenuCategory).min(1),
  })
  .superRefine((menu, ctx) => {
    const categoryIds = new Set<string>();
    const itemIds = new Set<string>();
    menu.categories.forEach((category, c) => {
      if (categoryIds.has(category.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['categories', c, 'id'],
          message: `Duplicate category id "${category.id}".`,
        });
      }
      categoryIds.add(category.id);
      category.items.forEach((item, i) => {
        if (itemIds.has(item.id)) {
          ctx.addIssue({
            code: 'custom',
            path: ['categories', c, 'items', i, 'id'],
            message: `Duplicate item id "${item.id}".`,
          });
        }
        itemIds.add(item.id);
        const variantIds = new Set(item.variants.map((v) => v.id));
        if (variantIds.size !== item.variants.length) {
          ctx.addIssue({
            code: 'custom',
            path: ['categories', c, 'items', i, 'variants'],
            message: `Duplicate variant id in "${item.id}".`,
          });
        }
        if (item.variants.length > 1 && item.variants.some((v) => v.label === null)) {
          ctx.addIssue({
            code: 'custom',
            path: ['categories', c, 'items', i, 'variants'],
            message: `Every size of "${item.id}" needs a label.`,
          });
        }
      });
    });
  });
export type Menu = z.output<typeof Menu>;

export const MenuResponse = z.object({ menu: Menu });
export type MenuResponse = z.infer<typeof MenuResponse>;

/** Display price in rupees, e.g. "Rs 1,200". */
export function formatPrice(rupees: number): string {
  return `Rs ${rupees.toLocaleString('en-US')}`;
}
