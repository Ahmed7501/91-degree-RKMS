# Unit Testing — 91 Degree RKDS

Vitest. Tests are colocated as `*.test.ts(x)` and are fast (the whole unit suite should finish in under 20 s). No database and no network. Run with `npm run test:unit` or `npx vitest run <path>`.

## 1. Rules

- Test behaviour through public functions/components. Do not assert on internals.
- Inject time (`Clock` on the server, fake timers on the web). Never depend on the real clock or timezone of the machine. Set `TZ=UTC` in the Vitest env, and all Karachi logic must pass regardless.
- Table-driven tests (`it.each`) for boundaries.
- Mock only at module edges (fetch, socket, Audio, clipboard, Prisma in `db-errors`). Never mock the unit under test.
- Every bug fix adds a failing test first (see REGRESSION_TESTING.md).

## 2. Required unit tests

### `packages/shared`
| File | Cases |
|---|---|
| `time/timer.test.ts` | 25:00 at creation; 05:01 → normal; 05:00 → warning; 00:01 → warning; 00:00 → **overdue** (`+00:00`); −1 s → `+00:01`; −59:59 → `+59:59`; −1 h → `+1:00:00`; negative clock skew; sub-second rounding (ceil for remaining, floor for overdue so the display never shows `00:00` twice) |
| `time/business-date.test.ts` | cutoff 6 (default): 03:00 and 05:59 PKT → previous date; 06:00 → same date; 17:00 opening → same date as 02:59 next night; `retentionCutoffDate(businessDate, 7)` subtracts 7 calendar days across month/year ends; cutoff 0 at midnight; UTC↔PKT around 19:00 UTC (= 00:00 PKT); year/month boundaries; leap day 2028-02-29; invalid cutoff throws |
| `time/format.test.ts` | `formatDisplayNumber(1)='001'`, `999`, `1000`; Karachi clock formatting independent of host TZ |
| `text/normalize-order-text.test.ts` | CRLF/CR→LF; NUL stripped; outer trim; internal blank lines kept; Urdu + emoji preserved; whitespace-only → empty; 5,000 vs 5,001 chars; `<script>` unchanged (data, not HTML) |
| `schemas/order.test.ts` | Unknown keys rejected; prepMinutes 15/20/25/30 only (Q-08); source enum; default prepMinutes |
| `schemas/socket.test.ts` | Each event payload schema accepts a valid `OrderDto` and rejects missing/extra fields; event-name constants match REALTIME_FLOW §2 |
| `errors/codes.test.ts` / `messages.test.ts` | Every code maps to a status; every code has a message; retryable set is exactly the documented one |

### `apps/server`
| File | Cases |
|---|---|
| `modules/orders/transitions.test.ts` | ACTIVE→COMPLETED ok; ACTIVE→CANCELLED ok; COMPLETED→COMPLETED `alreadyApplied`; CANCELLED→COMPLETED 409; COMPLETED→CANCELLED 409 |
| `modules/orders/idempotency.test.ts` | Hash stable across key order; differs on text/source/prep/notes; a text order without notes hashes exactly as before ADR-027; menu hash changes with quantity, size, line order, notes, source and never equals a text hash; replay vs reuse decision |
| `modules/menu/menu-catalog.test.ts` | The real menu file is valid (12 categories, 88 items, printed order, spot-checked prices); inactive items and emptied categories hidden; lines resolved into snapshots; unknown item/size/inactive → MENU_ITEM_UNAVAILABLE listing every failing line; invalid data → MenuDataError; kitchen text format |
| `modules/auth/password.test.ts` | Hash/verify; wrong password; min length 12; common password rejected; `needsRehash` |
| `modules/auth/session.service.test.ts` | Token hash only stored; absolute + idle expiry per role (fixed clock); touch throttled to 5 min; revoked rejected |
| `http/middleware/error-handler.test.ts` | Each AppError → status + envelope; unknown Error → 500 with no message/stack leak; requestId present |
| `db/errors.test.ts` | P1001/P2024 → DATABASE_UNAVAILABLE; P2028 → SERVICE_UNAVAILABLE; unknown → INTERNAL_ERROR |
| `config/env.test.ts` | Missing vars listed by name; `change-me` refused in production; `TRUST_PROXY=true` refused; `RATE_LIMIT_MULTIPLIER≠1` refused in production; `RKDS_INSECURE_LOCAL` accepted only with a loopback `APP_ORIGIN`; non-https origin refused otherwise; `ORDER_RETENTION_DAYS` 1–365 |
| `http/middleware/request-timeout.test.ts` | Slow handler → 503 REQUEST_TIMEOUT envelope after the timeout (fake timers); fast handler unaffected; no double response |
| `lib/logger.test.ts` | Redaction of password, cookie, text, code |

### `apps/web`
| File | Cases |
|---|---|
| `realtime/order-store.test.ts` | Snapshot replaces active set; buffered events applied after snapshot; duplicate ignored; stale version ignored; terminal status removes **and records a tombstone**; late `order:created` v1 after `order:updated` v2 does not resurrect the card; snapshot skips tombstoned orders; tombstones > 24 h pruned; sorting oldest first with an id tie-break |
| `realtime/use-order-sync.test.tsx` | Mock socket: connect → syncing → live; events during snapshot fetch are buffered then applied; `connect_error UNAUTHENTICATED` → unauthenticated; `session:revoked` → redirect signal; 2 s grace before "Reconnecting"; resync on `visibilitychange`; live `order:created` triggers sound, snapshot loads do not |
| `lib/clock-sync.test.ts` | Offset with RTT; median of 5; outlier resistance; > 120 s flag |
| `hooks/use-now.test.ts` | Single interval shared by N subscribers; aligned to the **corrected** second (`Date.now()+offset`) so no second is skipped or repeated when the offset is fractional; cleanup on unmount |
| `lib/wake-lock.test.ts` | Acquires when visible; re-acquires on `visibilitychange`; unsupported API → no throw |
| `features/owner/OwnerHeader.test.tsx` | Brand, Karachi clock independent of host TZ, active count, connection pill text, logout calls the API and clears the draft |
| `features/kitchen/KitchenHeader.test.tsx` / `KitchenPage.test.tsx` | Count, clock, pill; full-screen toggle calls the Fullscreen API (mocked); cursor hidden after 3 s idle (fake timers); density setting persists |
| `lib/api-client.test.ts` | Timeout → CLIENT_TIMEOUT; fetch reject → NETWORK_ERROR; HTML 502 → BAD_RESPONSE; envelope → ApiError with code; serverTime fed to clock-sync |
| `features/owner/use-submit-order.test.ts` | idle→sending→saved clears text; 400 keeps text; timeout → auto-retry ×3 with the **same** key; 422 prompt; edit after unknown outcome warns; draft restored from storage; cleared on logout. ADR-027: menu body with notes, only the sent mode and notes cleared; cart/notes/key kept on failure; empty cart not sent; rapid `updateCart`; blank notes omitted; menu draft and last mode restored; `notesProblem` / `sendProblem` |
| `lib/clipboard.test.ts` | `readText` success; permission denied → fallback signal; API missing → fallback; only called from the handler |
| `lib/sound.test.ts` | ADR-028: locked until unlock(); a blocked unlock is reported; one ~3.5 s alert (7 notes) per order; duplicate order ids ignored; arrivals during an alert → exactly one follow-up; disabled is silent and remembered, re-enabling never replays; volume clamped 10–100 % and remembered, sets the master gain; Test sound; playback failure → "failed", never throws; no Web Audio → unsupported |
| `features/owner/menu/cart.test.ts` | + adds/increments; − decrements and removes at 0; never negative; cap 99; sizes are separate lines in added order; 20 rapid clicks = 20 with one line; no 51st line; remove/count; no mutation; summary with prices, stale lines flagged not dropped; reference total; stored-cart sanitizing |
| `features/owner/OrderComposer.menu.test.tsx` | Menu mode: + / − quantities, summary and total, category switch keeps quantities; − disabled at 0; send with notes then cart and notes cleared; bin removes; mode switches keep both inputs; search across categories; menu load failure → Retry. Notes: sent with a text order and cleared; 501 chars → counter, message, Send blocked, not cut; kept on failure |
| `components/orders/TimerBadge.test.tsx` | Phase classes + labels; accessible label |
| `features/kitchen/KitchenOrderCard.test.tsx` | Full multiline text rendered; `<img onerror>` rendered literally (no element created); "Yesterday" badge; source badge; menu lines with quantity and size and no prices; KITCHEN NOTES block with line breaks; no block without notes; HTML in notes literal |
| `features/kitchen/OrderBoard.test.tsx` | Empty state; ordering; overflow indicator |
| `features/owner/OrderComposer.test.tsx` | Paste fills the textarea and never calls submit; Paste over text → Undo restores; Send disabled while empty; Ctrl+Enter; empty blocked; disabled while sending; counter thresholds |
| `features/owner/ActiveOrdersList.test.tsx` | Two-step complete (3 s window, fake timers); cancel dialog; card stays on failure |
| Loading/empty/error states | Each page component has one test per state |
