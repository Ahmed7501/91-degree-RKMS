import { formatPrice, type Menu, type MenuItem } from '@rkds/shared';
import { Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { cx } from '../../../lib/cx';
import { quantityOf, type CartLine } from './cart';
import { QuantityStepper } from './QuantityStepper';

interface Props {
  menu: Menu;
  cart: readonly CartLine[];
  onChange: (itemId: string, variantId: string, delta: 1 | -1) => void;
  disabled?: boolean;
}

const variantLabel = (item: MenuItem, label: string | null) =>
  label ? `${item.name}, ${label}` : item.name;

/**
 * Category tabs, a search box and item cards with + / − per size (ADR-027). The selection lives
 * in the cart, so switching category or searching never changes a quantity.
 */
export function MenuPicker({ menu, cart, onChange, disabled }: Props) {
  const [categoryId, setCategoryId] = useState(menu.categories[0]?.id ?? '');
  const [query, setQuery] = useState('');

  const selectedPerCategory = useMemo(() => {
    const counts = new Map<string, number>();
    for (const category of menu.categories) {
      const ids = new Set(category.items.map((i) => i.id));
      counts.set(
        category.id,
        cart.filter((l) => ids.has(l.itemId)).reduce((n, l) => n + l.quantity, 0),
      );
    }
    return counts;
  }, [menu, cart]);

  const search = query.trim().toLowerCase();
  const category = menu.categories.find((c) => c.id === categoryId) ?? menu.categories[0];
  const items = search
    ? menu.categories.flatMap((c) => c.items).filter((i) => i.name.toLowerCase().includes(search))
    : (category?.items ?? []);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
        />
        <label htmlFor="menu-search" className="sr-only">
          Search the menu
        </label>
        <input
          id="menu-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the menu…"
          autoComplete="off"
          className="h-11 w-full rounded-md border border-border bg-surface pr-10 pl-9 text-base text-white placeholder:text-muted/70 focus:border-gold focus:outline-none"
        />
        {query ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => setQuery('')}
            className="absolute top-1/2 right-1 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-muted hover:text-white"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        ) : null}
      </div>

      {search ? null : (
        <div
          role="tablist"
          aria-label="Menu categories"
          className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1"
        >
          {menu.categories.map((c) => {
            const selected = selectedPerCategory.get(c.id) ?? 0;
            const active = c.id === category?.id;
            return (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setCategoryId(c.id)}
                className={cx(
                  'inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold whitespace-nowrap',
                  active
                    ? 'border-red bg-red text-white'
                    : 'border-border bg-surface-2 text-muted hover:text-white',
                )}
              >
                {c.name}
                {selected > 0 ? (
                  <span className="tabular rounded-full bg-gold px-1.5 text-xs font-bold text-bg">
                    {selected}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      )}

      <ul
        aria-label={search ? 'Search results' : category?.name}
        className="flex max-h-[min(60vh,40rem)] flex-col gap-2 overflow-y-auto pr-1"
      >
        {items.length === 0 ? (
          <li className="rounded-lg border border-border p-4 text-sm text-muted">
            No item matches “{query.trim()}”.
          </li>
        ) : null}
        {items.map((item) => {
          const picked = item.variants.some((v) => quantityOf(cart, item.id, v.id) > 0);
          return (
            <li
              key={item.id}
              className={cx(
                'rounded-lg border bg-surface p-3',
                picked ? 'border-gold/70 bg-gold/5' : 'border-border',
              )}
            >
              <p className="font-semibold leading-snug">{item.name}</p>
              {item.note ? <p className="text-xs font-semibold text-gold">{item.note}</p> : null}
              {item.description ? (
                <p className="mt-0.5 line-clamp-2 text-xs text-muted">{item.description}</p>
              ) : null}
              <div className="mt-2 flex flex-col gap-2">
                {item.variants.map((variant) => (
                  <div key={variant.id} className="flex items-center justify-between gap-3">
                    <p className="text-sm">
                      {variant.label ? (
                        <span className="mr-2 font-semibold">{variant.label}</span>
                      ) : null}
                      <span className="tabular text-muted">{formatPrice(variant.price)}</span>
                    </p>
                    <QuantityStepper
                      label={variantLabel(item, variant.label)}
                      quantity={quantityOf(cart, item.id, variant.id)}
                      onChange={(delta) => onChange(item.id, variant.id, delta)}
                      disabled={disabled}
                    />
                  </div>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
