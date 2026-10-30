# Report — Menu ordering, kitchen notes, louder kitchen alert (P13)
Date: 2026-10-30 (Asia/Karachi) · Step: P13 (owner request Q-07) · ADR-027, ADR-028 · Author: Claude Code

## 1. Summary
Three additions to the existing app. Nothing was rebuilt, and Paste / Type works as before.
1. **Menu ordering:** the owner panel has **Menu** and **Paste / Type** tabs.
   - Menu mode has category tabs, search, item cards with every size and price, and − / + per size.
   - An order summary shows the selected lines, with remove and a reference total ("not a bill").
   - Both modes use the same pipeline for numbering, idempotency, timers, history and socket events.
   - The server resolves item ids and writes the kitchen text; the browser never sends text or prices for a menu order.
2. **Kitchen notes:** an optional "Kitchen Notes / Special Instructions" field for both modes.
   - Up to 500 characters with a counter; the server validates the limit and never truncates.
   - Notes are stored with the order and shown on the kitchen card in a gold "KITCHEN NOTES" block.
   - They also appear in the owner's active list and history.
3. **Kitchen alert:** a ~3.5 s synthesized bell sequence, once per new order. Duplicates are ignored, and several arrivals produce one follow-up alert.
   - Settings: on/off, volume 10–100 %, Test sound, and an honest "blocked by the browser" status.

**Scope note:** this lifts exclusions EX-03 and EX-06 at the owner's explicit request. It is recorded as Q-07 and ADR-027. EX-01 stands: no billing or payments, and no prices on the kitchen screen.

## 2. Menu extraction
- **Source:** the two printed-menu images already in `docs/assets/brand-reference/`. The images in the request are the same menu.
- **Imported:** **12 categories, 88 items** into `apps/server/src/modules/menu/91-degree-menu.json` (menuVersion `2026-10-30.1`). The server validates the file at startup.
- **Prices:** all readable. Names are kept exactly as printed.
- **For owner confirmation:** 12 points, listed in **docs/MENU.md §4**:
  - Chicken Madhbi Rice: three prices with no size names.
  - Pizza, Broast and Tikka: which price belongs to which size.
  - Drink flavours and sizes.
  - Reshmi Kabab Roll at 230.
  - Printed spellings.
  - Pakistani and BAR B.Q descriptions: left out because they are unreadable at 859 px.

## 3. Changes
- **Database:** migration `20261030120000_menu_orders_notes`, expand-only.
  - Adds `order_kind` enum, `orders.kind` (default TEXT), `orders.items` JSONB and `orders.notes`.
  - CHECKs `orders_items_shape_chk` and `orders_notes_length_chk`.
  - Existing rows become TEXT orders, otherwise unchanged (proved by `migrations.upgrade.int`).
  - Applied locally to `rkds_test` and `rkds_dev` with `migrate deploy`.
- **API:**
  - `GET /api/menu` (owner only).
  - `POST /api/orders` takes `kind: "MENU"` with lines, plus optional `notes` for both kinds. A body without `kind` is a text order.
  - New error `409 MENU_ITEM_UNAVAILABLE`.
  - `OrderDto` gains `kind`, `items` and `notes`.
  - A text order without notes hashes exactly as before, so idempotency keys from before the change still replay.
- **Server:**
  - New module `modules/menu` (catalog, routes, data).
  - `orders.service`, `orders.repository`, `idempotency` and `order-dto` updated.
  - Log lines carry counts only; `notes` and `items` were added to log redaction.
- **Web:**
  - `OrderComposer` (modes) and `use-submit-order` (menu draft, notes, functional cart updates).
  - New `features/owner/menu/*` and `NotesField`.
  - New `components/orders/{OrderItems,KitchenNotes}`, used on the kitchen card and owner lists.
  - `lib/sound.ts` (`OrderAlert`), new `SoundSettings`, and the kitchen header bell now opens settings.
- **Docs:** CLAUDE.md, README, INDEX, REQUIREMENTS (Q-07, FR-MENU/NOTE/KIT-13/14), DECISIONS (ADR-027/028), DATABASE, API_CONTRACTS, ERROR_HANDLING, SECURITY, REALTIME_FLOW §6, DESIGN_SYSTEM, FILE_STRUCTURE, TESTING, UNIT/INTEGRATION/E2E/REGRESSION_TESTING, DEPLOYMENT §8, IMPLEMENTATION_PLAN (P13), PROJECT_PLAN, CHANGE_WORKFLOW, and new **MENU.md**.

## 4. Tests executed
All gates were run with `npm run verify:release` in this session. It exited 0.

| Gate | Result | Numbers |
|---|---|---|
| G1 Typecheck (all workspaces + E2E) | PASS | |
| G2 Lint (`--max-warnings=0`) | PASS | |
| G3 Unit (shared, server, web) | PASS | 33 files, **383 tests** |
| G4 Integration (real PostgreSQL, `rkds_test`) | PASS | 23 files, **228 tests** (194 before this change) |
| G6 Coverage (`test:coverage`, gates enforced) | PASS | 56 files, 611 tests |
| G7 Build (server + web) | PASS | |
| G5 E2E (Playwright) | PASS | **35 passed**: all specs on Chromium + @smoke on Firefox and WebKit, including the new `menu-and-notes.spec` |
| G8 Compose config | PASS | production+traefik, production+host, dev |
| G9 Migration drift (`db:migrate:check`) | PASS | "No difference detected" (run after the migration was written) |
| G10 Audit + bundle secrets | PASS | 0 vulnerabilities; 13 files scanned |
| Accessibility (axe) | PASS | no serious/critical violations on login, owner, kitchen |
| Latency (20 orders, local) | Reported | median 105 ms, p95 128 ms (target < 1 s) |

Coverage measured from the tool output:
- `modules/orders`: 98.18 % statements / 94.68 % branches (gate 90/90).
- `modules/menu`: 100 / 93.33.
- `cart.ts`: 100 / 97.82.
- `sound.ts`: 91.3 / 78.37.
- Overall: 75.99 % statements.

Logging change: `notes` and `items` were added to log redaction while the suite was running. It was re-verified separately: `logger.test` and `logging.int` (6 tests) PASS, eslint PASS, server typecheck PASS.

**Not run:** live VPS deployment (no domain or approval yet). The prod-like Docker stack was not rebuilt for this change; the migration was verified by `migrations.upgrade.int`, G9 and `migrate deploy` on `rkds_dev`.

## 5. Visual check
Playwright screenshots (1440 px owner, 1920×1080 kitchen) were reviewed:
- **Owner menu mode:** chips with counts, steppers, summary with Rs 1,120.
- **Kitchen cards:** gold quantities, size tags, KITCHEN NOTES blocks with line breaks, no prices.
- **Sound dialog:** shows "browser is blocking sound" until tapped.

## 6. Remaining items
1. **Owner:** confirm or correct MENU.md §4 (12 points). Corrections are a JSON edit; no migration is needed.
2. **Disconnected screens:** orders that arrive while a screen is disconnected still appear on reconnect without an alert (documented in ADR-028).
3. **Menu changes:** price or menu changes need a deploy. There is no editing screen yet; this was a deliberate choice that can be its own change.
4. **Deployment:** going live still needs a domain, the VPS inspection and the owner's go-ahead. The new migration runs automatically in the normal update step, after the mandatory backup.
5. **Owner account:** the owner account still needs to be created on the dev database (`npm run owner:create`).

## 7. Skills and review
- No subagents.
- Change workflow followed: impact plan, stages, targeted tests per stage, full suite, diff review (no debug output, no `dangerouslySetInnerHTML`, no order text, notes or item names in logs).
