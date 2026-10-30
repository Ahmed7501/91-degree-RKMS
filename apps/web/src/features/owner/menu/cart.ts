import {
  MENU_LINE_MAX_QUANTITY,
  MENU_ORDER_MAX_LINES,
  type Menu,
  type MenuOrderLine,
} from '@rkds/shared';

/**
 * The owner's menu selection (ADR-027). A line is one item in one size; the cart never holds the
 * same (item, size) twice and never holds a zero or negative quantity. Pure functions, so rapid
 * clicks applied through React's functional updates always land on the latest cart.
 */
export type CartLine = MenuOrderLine;

export function lineKey(itemId: string, variantId: string): string {
  return `${itemId}/${variantId}`;
}

export function quantityOf(cart: readonly CartLine[], itemId: string, variantId: string): number {
  return cart.find((l) => l.itemId === itemId && l.variantId === variantId)?.quantity ?? 0;
}

/** +1 / −1 (or any delta). New lines go to the end; a line that reaches 0 is removed. */
export function changeQuantity(
  cart: readonly CartLine[],
  itemId: string,
  variantId: string,
  delta: number,
): CartLine[] {
  const index = cart.findIndex((l) => l.itemId === itemId && l.variantId === variantId);
  const current = index === -1 ? 0 : cart[index]!.quantity;
  const next = Math.min(MENU_LINE_MAX_QUANTITY, Math.max(0, current + delta));
  if (next === current) return [...cart];
  if (index === -1) {
    if (cart.length >= MENU_ORDER_MAX_LINES) return [...cart];
    return [...cart, { itemId, variantId, quantity: next }];
  }
  if (next === 0) return cart.filter((_, i) => i !== index);
  return cart.map((line, i) => (i === index ? { ...line, quantity: next } : line));
}

export function removeLine(cart: readonly CartLine[], itemId: string, variantId: string) {
  return cart.filter((l) => !(l.itemId === itemId && l.variantId === variantId));
}

export function itemCount(cart: readonly CartLine[]): number {
  return cart.reduce((n, line) => n + line.quantity, 0);
}

export interface SummaryLine extends CartLine {
  name: string;
  variant: string | null;
  unitPrice: number | null;
  /** The item or size is not on the current menu (it was removed or renamed). */
  missing: boolean;
}

/** Cart lines joined with the menu for display; unknown lines are kept and flagged, never dropped. */
export function summarize(cart: readonly CartLine[], menu: Menu | null): SummaryLine[] {
  const items = new Map(menu?.categories.flatMap((c) => c.items).map((i) => [i.id, i]) ?? []);
  return cart.map((line) => {
    const item = items.get(line.itemId);
    const variant = item?.variants.find((v) => v.id === line.variantId);
    return {
      ...line,
      name: item?.name ?? line.itemId,
      variant: variant?.label ?? null,
      unitPrice: variant?.price ?? null,
      missing: !item || !variant,
    };
  });
}

/** Reference total in rupees from menu prices (not a bill: EX-01). Unknown lines count as 0. */
export function referenceTotal(lines: readonly SummaryLine[]): number {
  return lines.reduce((sum, line) => sum + (line.unitPrice ?? 0) * line.quantity, 0);
}

/** Keeps only well-formed lines from storage (an old or edited draft must not crash the page). */
export function sanitizeCart(value: unknown): CartLine[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const cart: CartLine[] = [];
  for (const raw of value) {
    const line = raw as Partial<CartLine> | null;
    if (
      typeof line?.itemId !== 'string' ||
      typeof line.variantId !== 'string' ||
      typeof line.quantity !== 'number' ||
      !Number.isInteger(line.quantity) ||
      line.quantity < 1 ||
      line.quantity > MENU_LINE_MAX_QUANTITY
    ) {
      continue;
    }
    const key = lineKey(line.itemId, line.variantId);
    if (seen.has(key) || cart.length >= MENU_ORDER_MAX_LINES) continue;
    seen.add(key);
    cart.push({ itemId: line.itemId, variantId: line.variantId, quantity: line.quantity });
  }
  return cart;
}
