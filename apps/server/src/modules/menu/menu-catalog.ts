import { Menu, type MenuOrderLine, type OrderItemDto } from '@rkds/shared';
import { AppError } from '../../errors/app-error';
import menuData from './91-degree-menu.json' with { type: 'json' };

interface Entry {
  name: string;
  variants: Map<string, { label: string | null; price: number }>;
}

/** Thrown at startup when the menu file is invalid: the server refuses to start (fail fast). */
export class MenuDataError extends Error {
  constructor(readonly problems: string[]) {
    super(`invalid menu data: ${problems.join('; ')}`);
    this.name = 'MenuDataError';
  }
}

export function parseMenu(data: unknown): Menu {
  const result = Menu.safeParse(data);
  if (!result.success) {
    throw new MenuDataError(
      result.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`),
    );
  }
  return result.data;
}

/**
 * The validated restaurant menu (ADR-027). Menu orders reference items by id; the server resolves
 * them here into snapshot lines, so the kitchen text never depends on what the browser sent.
 */
export class MenuCatalog {
  private readonly entries = new Map<string, Entry>();
  /** The menu as served to the owner: inactive items (and emptied categories) are left out. */
  readonly ownerMenu: Menu;

  constructor(menu: Menu) {
    for (const category of menu.categories) {
      for (const item of category.items) {
        if (!item.active) continue;
        this.entries.set(item.id, {
          name: item.name,
          variants: new Map(item.variants.map((v) => [v.id, { label: v.label, price: v.price }])),
        });
      }
    }
    this.ownerMenu = {
      ...menu,
      categories: menu.categories
        .map((category) => ({ ...category, items: category.items.filter((item) => item.active) }))
        .filter((category) => category.items.length > 0),
    };
  }

  static load(data: unknown = menuData): MenuCatalog {
    return new MenuCatalog(parseMenu(data));
  }

  get itemCount(): number {
    return this.entries.size;
  }

  /** Resolves every line or throws MENU_ITEM_UNAVAILABLE listing the lines that failed. */
  resolve(lines: readonly MenuOrderLine[]): OrderItemDto[] {
    const unavailable: { index: number; itemId: string; variantId: string }[] = [];
    const items = lines.flatMap((line, index) => {
      const entry = this.entries.get(line.itemId);
      const variant = entry?.variants.get(line.variantId);
      if (!entry || !variant) {
        unavailable.push({ index, itemId: line.itemId, variantId: line.variantId });
        return [];
      }
      return [
        {
          itemId: line.itemId,
          variantId: line.variantId,
          name: entry.name,
          variant: variant.label,
          quantity: line.quantity,
          unitPrice: variant.price,
        },
      ];
    });
    if (unavailable.length > 0) {
      throw new AppError('MENU_ITEM_UNAVAILABLE', { details: { unavailable } });
    }
    return items;
  }
}

/** The kitchen text of a menu order: one "2 × Name (Size)" line per item, in the owner's order. */
export function menuOrderText(items: readonly OrderItemDto[]): string {
  return items
    .map((item) => `${item.quantity} × ${item.name}${item.variant ? ` (${item.variant})` : ''}`)
    .join('\n');
}
