# Menu — 91 Degree RKDS

The digital menu used by **Menu ordering** on `/owner` (ADR-027). It is the restaurant's printed menu, transcribed. It is **not** a POS catalogue: there is no stock, tax, discount or payment, and prices are shown to the owner as a reference only (EX-01).

## 1. Source and data file

| What | Where |
|---|---|
| Original menu images (source of truth) | `docs/assets/brand-reference/91-degree.jpeg`, `91-degreee.jpeg` (859 px wide) |
| Menu data (versioned, reviewed in Git) | `apps/server/src/modules/menu/91-degree-menu.json` |
| Schema | `Menu` in `packages/shared/src/schemas/menu.ts` |
| Served to the owner | `GET /api/menu` (owner only; inactive items left out) |

The server validates the file at startup with the shared schema. An invalid file stops the server with a readable list of problems (`MenuDataError`), so a broken menu can never reach production silently.

**Imported (2026-10-30, menuVersion `2026-10-30.1`): 12 categories, 88 items**, in the printed order: Appetizers (2), Fries & Fast-Food (8), Wings & Strips (6), Burgers (11), Chinese (6), Pakistani (7), BAR B.Q (6), Flavours of Fame (6), Rolls (7), Deals (12), Sandwiches (7), Additional (10).

## 2. Structure

```
category { id, name, items[] }
item     { id, name, description?, note?, active (default true), variants[] }
variant  { id, label | null, price }      // label null = the item has one size
```

- Ids are lowercase-kebab-case and **never reused**: an order stores `itemId`/`variantId` and a snapshot of name, size and price, so history is unaffected by later edits.
- A printed size list becomes variants: "Masala Fries (Medium/Large) 150/200" → `Masala Fries` with `Medium 150`, `Large 200`.
- "(Serves 2 - 3)" is kept as the item `note`. "(Plate)" and "(Spicy)" stay in the name because the kitchen needs them.
- Names and prices are exactly as printed, including spellings such as "Panne", "Madhbi", "Pori Paratha", "Chowmin" and "Litter".

## 3. Changing the menu

1. Edit the JSON: change a price, add an item with a **new** id, or set `"active": false` to hide an item. Do not delete or re-use ids.
2. Bump `menuVersion` (for example `2026-11-15.1`).
3. Run `npm run test:unit` (`menu-catalog.test.ts` validates the real file; update its counts if items were added) and `npm run build`.
4. Deploy as a normal update (DEPLOYMENT §8). No migration is needed.

An owner who still has the old menu open and sends an item that no longer exists gets `409 MENU_ITEM_UNAVAILABLE`. The menu then reloads and the stale line is flagged in red in the summary, so nothing is silently dropped.

## 4. Owner verification checklist

Everything below was read from the 859 px images. Please confirm or correct each point; corrections are a JSON edit (§3).

| # | Item | Question |
|---|---|---|
| V-01 | Chicken Madhbi Rice: 700 / 1000 / 2000 | The menu shows three prices but no size names. They are labelled "Rs 700 size", "Rs 1000 size", "Rs 2000 size". What should the kitchen see (e.g. Single / Double / Family)? |
| V-02 | 91 Pizza (Medium and Small) 800/400 | Read as Medium = 800, Small = 400 (printed order). Correct? |
| V-03 | Broast Quarter Chest / Leg 600/500 | Read as Chest = 600, Leg = 500. Correct? |
| V-04 | Chicken Tikka (Chest & Leg) 500/450 | Read as Chest = 500, Leg = 450. Correct? |
| V-05 | Drinks 300 Ml / 500 Ml 100/130 | Which drinks or flavours? For now the owner writes the flavour in Kitchen Notes. |
| V-06 | Deals 1, 3, 8 say "Drink" without a size | Is a specific size included? |
| V-07 | Deal 2 "4 Zinger burger with Fries + 1.5 Ltr Drink" 1800 | Four burgers? Name kept as printed. |
| V-08 | Reshmi Kabab Roll 230 vs Seekh Kabab Roll 350 | 230 is lower than similar rolls. Please confirm the price. |
| V-09 | Spellings kept as printed | "Panne Marinara Pasta" (description says Penne), "Chicken Madhbi Rice", "Pori Paratha" (Deal 7) vs "Puri Paratha", "Chowmin" (Deal 10), "Texmax Burger" (Deal 4), "1.5 Litter Drink" (Deal 12). Correct any you want changed. |
| V-10 | Descriptions | Pakistani and BAR B.Q descriptions are too small to read reliably at this resolution and were **left out**. Other descriptions were transcribed as printed (owner screen only; the kitchen never shows them). |
| V-11 | Fish and Chips | Note "Order to be placed 24 hrs in advance" is shown to the owner. |
| V-12 | Not imported | The banner "Arrangements for Biryani, Pulao, Karhai, and dessert … for a small party of 20-30 people" is not an orderable item. Use Paste / Type for such orders. |

A higher-resolution photo or PDF of the menu would let V-08 to V-10 be checked properly.
