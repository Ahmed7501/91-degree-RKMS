# API Contracts — 91 Degree RKDS

Base path `/api`. JSON only. All schemas are defined once in `packages/shared/src/schemas/*` (Zod) and imported by both server and web.

Related: [ERROR_HANDLING.md](ERROR_HANDLING.md) (error envelope and codes) · [REALTIME_FLOW.md](REALTIME_FLOW.md) (socket events) · [SECURITY.md](SECURITY.md)

## 1. Conventions

| Item | Rule |
|---|---|
| Content type | Requests with a body must send `Content-Type: application/json`, otherwise `415 UNSUPPORTED_MEDIA_TYPE` |
| Body size | 32 KB max, otherwise `413 PAYLOAD_TOO_LARGE` |
| Origin | Every non-GET request must carry `Origin` equal to `APP_ORIGIN`, otherwise `403 CSRF_REJECTED` |
| Request ID | Server accepts `X-Request-Id` (≤ 64 chars, `[A-Za-z0-9-]`) or generates a UUID. It is always echoed back in the `X-Request-Id` response header and in error bodies |
| Time | Timestamps are ISO-8601 UTC strings (`2026-10-29T13:45:12.345Z`). Responses that clients use for timers include `serverTime` |
| Errors | `{ "error": { "code", "message", "requestId", "details"? } }`, see ERROR_HANDLING.md |
| Caching | API responses send `Cache-Control: no-store` |
| Unknown fields | Rejected (`z.strictObject`) → `400 VALIDATION_FAILED` |

## 2. Shared types

```ts
type OrderSource = 'WHATSAPP' | 'FOODPANDA' | 'PHONE' | 'OTHER';
type OrderStatus = 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
type PrepMinutes = 15 | 20 | 25 | 30;   // Q-08
type OrderKind = 'TEXT' | 'MENU';                  // ADR-027

interface OrderItemDto {   // a menu line as saved: a snapshot, unaffected by later menu edits
  itemId: string; variantId: string;
  name: string; variant: string | null;            // size label, null for one-size items
  quantity: number;                                // 1–99
  unitPrice: number | null;                        // menu price in rupees (reference only)
}

interface OrderDto {
  id: string;              // uuid
  orderNumber: number;     // daily sequence
  displayNumber: string;   // "007"
  businessDate: string;    // "2026-10-29"
  text: string;            // TEXT: normalized original text. MENU: "2 × Name (Size)" lines built by the server
  kind: OrderKind;
  items: OrderItemDto[] | null;   // MENU only
  notes: string | null;    // kitchen notes, max 500 chars
  source: OrderSource;
  prepMinutes: PrepMinutes;
  status: OrderStatus;
  createdAt: string;
  deadlineAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
  updatedAt: string;
  version: number;
}

interface SessionDto {
  role: 'OWNER' | 'KITCHEN';
  user: { id: string; username: string } | null;   // OWNER only
  deviceLabel: string | null;                       // KITCHEN only
  expiresAt: string;
}
```

## 3. Endpoints

### Health

| | `GET /api/health/live` | `GET /api/health/ready` |
|---|---|---|
| Auth | none | none |
| Response | `200 {status:"ok"}` | `200 {status:"ok", db:"ok"}` or `503 {status:"degraded", db:"unavailable"}` |
| Notes | Process alive. Used by the Docker healthcheck | Runs `SELECT 1` with a 2 s timeout. Used for monitoring/deploy verification. Never reveals versions, hosts or errors |
| Tests | `health.int.test.ts` | `health.int.test.ts` (DB down simulated) |

---

### `POST /api/auth/login`
- **Auth:** none. **Rate limit:** 10 / 15 min per IP, plus 5 consecutive failures per (username, IP) pair → 15 min lock for that pair.
- **Body:** `{ username: string (3–32, trimmed, lowercased), password: string (1–200) }`
- **200:** `{ session: SessionDto, serverTime }` and `Set-Cookie` for the session.
- **Errors:** `400 VALIDATION_FAILED`, `401 INVALID_CREDENTIALS` (same message whether the user is unknown or the password is wrong; the response is timing-equalized with a dummy hash), `429 RATE_LIMITED`.
- **Side effects:** inserts a `sessions` row, rotating any session presented in the request (that one is revoked).
- **Tests:** `auth.int.test.ts`: success, wrong password, unknown user, disabled user, lockout, cookie flags.

### `POST /api/auth/logout`
- **Auth:** any session (no-op if none). **200:** `{ ok: true }`, clears the cookie.
- **Side effects:** sets `revoked_at`, disconnects the session's sockets.

### `GET /api/auth/session`
- **Auth:** none required. **200:** `{ session: SessionDto | null, serverTime }`.
- Used by the SPA at boot and as a cheap clock-sync sample.

---

### `POST /api/kitchen/pairing-codes`
- **Auth:** OWNER. **Body:** `{ deviceLabel: string (1–40) }`
- **201:** `{ code: "ABCD-EF23", deviceLabel, expiresAt }`. The plaintext code is returned only once.
- **Errors:** `400`, `401`, `403`, `429` (10 codes / hour per owner).

### `POST /api/kitchen/pair`
- **Auth:** none. **Rate limit:** 10 / 15 min per IP.
- **Body:** `{ code: string }`. The format is normalized (uppercase, dash optional).
- **200:** `{ session: SessionDto, serverTime }` + `Set-Cookie` (KITCHEN session).
- **Errors:** `400 PAIRING_CODE_INVALID` (unknown, used or expired all return the same message), `429`.

### `GET /api/kitchen/devices`
- **Auth:** OWNER. **200:** `{ devices: [{ id, deviceLabel, createdAt, lastSeenAt, expiresAt }] }` (active kitchen sessions only).

### `DELETE /api/kitchen/devices/:id`
- **Auth:** OWNER. **200:** `{ ok: true }`. **404 NOT_FOUND** if the session is unknown or not a kitchen session.
- **Side effects:** revokes the session and emits `session:revoked`, then disconnects its sockets.

---

### `POST /api/orders`
- **Auth:** OWNER. **Rate limit:** 30 / min per session.
- **Headers:** `Idempotency-Key: <uuid>` (required; missing or not a UUID → `400 IDEMPOTENCY_KEY_REQUIRED`).
- **Body:**
  ```json
  { "text": "2x Chicken Tikka\n1x Zinger Burger (no mayo)", "source": "WHATSAPP", "prepMinutes": 20 }
  ```
  - `text`: string. Normalized per ADR-020, then 1–5,000 chars → `400 VALIDATION_FAILED` (`details[].path = "text"`).
  - `source`: enum. `prepMinutes`: `15 | 20 | 25 | 30` (default 20 if omitted; anything else → `400 VALIDATION_FAILED`).
  - `kind`: optional `"TEXT"` (the default when omitted, so pre-ADR-027 clients keep working) or `"MENU"`.
  - `notes` (optional, both kinds): string, ADR-020 normalization, max 500 chars → `400 VALIDATION_FAILED`; blank → stored as `null`. Never truncated.
- **Menu order body (ADR-027):**
  ```json
  { "kind": "MENU", "items": [{ "itemId": "zinger-burger", "variantId": "regular", "quantity": 2 }],
    "source": "PHONE", "prepMinutes": 20, "notes": "No onions" }
  ```
  - `items`: 1–50 lines, `quantity` integer 1–99, no (item, size) twice, no extra keys (a client cannot send a price or text) → otherwise `400 VALIDATION_FAILED`. `text` is not allowed on a menu order.
  - The server resolves each line against the menu. Unknown or inactive item or size → `409 MENU_ITEM_UNAVAILABLE` with `details: { unavailable: [{ index, itemId, variantId }] }`; nothing is saved and no number is used.
  - The server writes `text` ("2 × Zinger Burger\n1 × Masala Fries (Large)") and saves `items` as snapshots.
- **201:** `{ order: OrderDto, serverTime }`.
- **200 (replay):** same body plus header `Idempotent-Replayed: true` when the key was already used with an identical payload.
- **Errors:** `400 VALIDATION_FAILED`, `400 IDEMPOTENCY_KEY_REQUIRED`, `401`, `403`, `409 MENU_ITEM_UNAVAILABLE`, `413`, `415`, `422 IDEMPOTENCY_KEY_REUSED` (`details: { existingOrderNumber, existingBusinessDate }`), `429`, `503 DATABASE_UNAVAILABLE`.
- **Side effects:** counter increment, order + `CREATED` event inserted, `order:created` broadcast after commit. A replay emits nothing.
- **Tests:** `orders.create.int.test.ts`, `orders.menu.int.test.ts`, `numbering.concurrency.int.test.ts`, `idempotency.int.test.ts`. Unit: `normalize-order-text.test.ts`, `business-date.test.ts`, `order.test.ts`, `menu-catalog.test.ts`, `idempotency.test.ts`.

### `GET /api/menu`
- **Auth:** OWNER (ADR-027).
- **200:** `{ menu: Menu }`: `{ menuVersion, source, currency: "PKR", categories: [{ id, name, items: [{ id, name, description?, note?, active, variants: [{ id, label, price }] }] }] }`. Inactive items, and categories left empty, are omitted. Schema: `Menu` in `packages/shared/src/schemas/menu.ts`; data and changes: [MENU.md](MENU.md).
- **Errors:** `401`, `403`.
- **Tests:** `orders.menu.int.test.ts`, `authorization.int.test.ts`.

### `GET /api/orders/active`
- **Auth:** OWNER or KITCHEN.
- **200:** `{ orders: OrderDto[] /* ACTIVE, createdAt ASC, id ASC */, serverTime }`. No pagination: the active set is small by nature, with a hard cap of 500 (a `truncated: true` flag is logged and returned if ever exceeded).
- **Tests:** `orders.active.int.test.ts` (both roles, ordering, excludes terminal).

### `GET /api/orders`
- **Auth:** OWNER.
- **Query:** `date` (`YYYY-MM-DD`, default current business date; must be within the retention window: current business date back to `ORDER_RETENTION_DAYS` days before it), `status` (`ALL|ACTIVE|COMPLETED|CANCELLED`, default `ALL`), `number` (positive int, optional; exact match within `date`), `limit` (1–100, default 50), `cursor` (opaque, from the previous page).
- **200:** `{ orders: OrderDto[] /* createdAt DESC, id DESC */, nextCursor: string | null, businessDate, serverTime }`.
- **Errors:** `400 VALIDATION_FAILED` (bad date, date outside the retention window, bad cursor, etc.).

### `GET /api/orders/:id`
- **Auth:** OWNER. **200:** `{ order: OrderDto, events: [{ type, occurredAt, actor: { username } | null }] }`. **404 ORDER_NOT_FOUND**. `:id` must be a UUID, otherwise `400`.

### `POST /api/orders/:id/complete` and `POST /api/orders/:id/cancel`
- **Auth:** OWNER. **Body:** `{}` (an empty JSON object).
- **200:** `{ order: OrderDto, alreadyApplied: boolean, serverTime }`.
- **Errors:** `404 ORDER_NOT_FOUND`, `409 INVALID_STATUS_TRANSITION` (`details: { currentStatus }`), `401`, `403`, `503`.
- **Side effects:** status update + audit event, `order:updated` broadcast after commit. Nothing is emitted when `alreadyApplied`.
- **Tests:** `orders.transitions.int.test.ts`. Unit: `transitions.test.ts`.

### Fallback
- Any other `/api/*` → `404 ROUTE_NOT_FOUND`.

## 4. Kitchen access matrix

| Endpoint | Anonymous | KITCHEN | OWNER |
|---|---|---|---|
| health/* | ✅ | ✅ | ✅ |
| auth/login, kitchen/pair | ✅ | ✅ | ✅ |
| auth/session, auth/logout | ✅ | ✅ | ✅ |
| GET orders/active | ❌ 401 | ✅ | ✅ |
| POST orders, complete, cancel | ❌ 401 | ❌ 403 | ✅ |
| GET orders, orders/:id | ❌ 401 | ❌ 403 | ✅ |
| GET menu | ❌ 401 | ❌ 403 | ✅ |
| kitchen/pairing-codes, kitchen/devices | ❌ 401 | ❌ 403 | ✅ |

This matrix is tested exhaustively in `authorization.int.test.ts` (one table-driven test).

## 5. Versioning

There is a single consumer (this SPA), deployed together with the API. Breaking changes are allowed only when both are changed in the same release, and must be recorded in DECISIONS.md and the report. Socket event payloads follow the same rule.
