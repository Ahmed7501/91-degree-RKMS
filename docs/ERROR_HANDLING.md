# Error Handling — 91 Degree RKDS

**Rules:**
1. An order is never silently discarded.
2. The owner's text is never cleared before the server confirms the save.
3. Users never see stack traces, SQL, secrets or file paths.

Related: [API_CONTRACTS.md](API_CONTRACTS.md) · [REALTIME_FLOW.md](REALTIME_FLOW.md) · [TROUBLESHOOTING.md](TROUBLESHOOTING.md) · [SECURITY.md](SECURITY.md)

## 1. Error envelope

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Order text cannot be empty.",
    "requestId": "8f3c2a8e-…",
    "details": [{ "path": "text", "message": "Required" }]
  }
}
```
- `code` is stable and machine-readable. The frontend switches on `code`, never on `message`.
- `message` is safe and user-facing. It comes from the catalog in `@rkds/shared/errors/messages.ts`.
- `details` appears only for validation errors and the documented cases (`IDEMPOTENCY_KEY_REUSED`, `INVALID_STATUS_TRANSITION`, `MENU_ITEM_UNAVAILABLE`).

## 2. Error code catalog (`@rkds/shared/errors/codes.ts`)

| Code | HTTP | Retryable | User message (owner) |
|---|---|---|---|
| `VALIDATION_FAILED` | 400 | no | Field-specific, e.g. "Order text cannot be empty." |
| `INVALID_JSON` | 400 | no | "The request was malformed. Please reload the page." |
| `IDEMPOTENCY_KEY_REQUIRED` | 400 | no | "Please reload the page and try again." |
| `PAIRING_CODE_INVALID` | 400 | no | "That code is invalid or expired. Ask the owner for a new one." |
| `UNAUTHENTICATED` | 401 | no | "Please sign in." |
| `INVALID_CREDENTIALS` | 401 | no | "Incorrect username or password." |
| `SESSION_EXPIRED` | 401 | no | "Your session ended. Please sign in again — your draft is kept." |
| `FORBIDDEN` | 403 | no | "You don't have permission to do that." |
| `CSRF_REJECTED` | 403 | no | "Request blocked for security. Please reload the page." |
| `ORDER_NOT_FOUND` | 404 | no | "This order no longer exists." |
| `NOT_FOUND` | 404 | no | "Not found." |
| `ROUTE_NOT_FOUND` | 404 | no | "Not found." |
| `INVALID_STATUS_TRANSITION` | 409 | no | "This order was already {completed/cancelled}." |
| `MENU_ITEM_UNAVAILABLE` | 409 | no | "Some selected items are no longer on the menu. The menu was refreshed: check the order and send again." (ADR-027; `details.unavailable[]`) |
| `PAYLOAD_TOO_LARGE` | 413 | no | "Order is too long (max 5,000 characters)." |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | no | "Please reload the page." |
| `IDEMPOTENCY_KEY_REUSED` | 422 | no | "An earlier version of this order was already sent as #{n}." |
| `RATE_LIMITED` | 429 | yes (after `Retry-After`) | "Too many attempts. Please wait {s} seconds." |
| `INTERNAL_ERROR` | 500 | yes | "Something went wrong. Your order text is kept — try again." |
| `DATABASE_UNAVAILABLE` | 503 | yes | "Kitchen system is temporarily unavailable. Your order text is kept." |
| `SERVICE_UNAVAILABLE` | 503 | yes | Same as above (shutdown in progress, overload) |
| `REQUEST_TIMEOUT` | 503 | yes | Same as above |

Client-only codes (never sent by the server):
| Code | Meaning |
|---|---|
| `NETWORK_ERROR` | `fetch` rejected (offline, DNS, proxy refused) |
| `CLIENT_TIMEOUT` | AbortController fired before a response arrived |
| `BAD_RESPONSE` | Non-JSON or schema-invalid response (e.g. proxy HTML error page) |

## 3. Backend architecture

```
request → request-id → pino-http logger → request-timeout → helmet/security → origin check → json(32kb) → rate-limit → routes
        → notFound (ROUTE_NOT_FOUND) → errorHandler
```

- `AppError(code, { details?, cause?, logLevel? })` is the only error type that services throw deliberately. Its HTTP status comes from the shared code map.
- `validate(schema, 'body' | 'query' | 'params')` converts `ZodError` into `AppError('VALIDATION_FAILED', { details })` and stores the parsed values on `res.locals.input` (Express 5's `req.query` is read-only).
- `db/errors.ts` maps Prisma/pg errors. Unique violations are recognized by **SQLSTATE `23505` plus the constraint name**, whether Prisma surfaces them as `P2002` (model queries) or `P2010` with `meta.code='23505'` (raw queries):
  | Source | Mapped to |
  |---|---|
  | 23505 on `orders_idempotency_key_key` | handled in the order service (replay path), not an error |
  | 23505 on `(business_date, daily_number)` | `INTERNAL_ERROR` + `error` log (should be impossible, an invariant breach) |
  | P1001/P1002/P1017, `ECONNREFUSED`, pool timeout P2024 | `DATABASE_UNAVAILABLE` |
  | P2028 transaction timeout | `SERVICE_UNAVAILABLE` |
  | CHECK violation (23514) | `INTERNAL_ERROR` (validation should have caught it), logged with the constraint name only |
- `errorHandler` (last middleware):
  1. Unknown errors become `INTERNAL_ERROR`.
  2. Log once: `level` (`warn` for 4xx, `error` for 5xx), `code`, `requestId`, `method`, `route`, `status`, `sessionRole`, and `err.stack` for 5xx (server logs only).
  3. Respond with the envelope. Never include `err.message` from unknown errors.
  4. If headers were already sent, delegate to Express's default (closes the connection).
- Body-parser errors: `entity.parse.failed` → `INVALID_JSON`, `entity.too.large` → `PAYLOAD_TOO_LARGE`.
- Handler timeout: the `request-timeout` middleware starts a 12 s timer per request. If no response has been sent by then, it responds `503 REQUEST_TIMEOUT` with the normal envelope and logs `warn`. Prisma transactions time out at 5 s, so normal operations finish well inside that. Separately, Node's `server.headersTimeout = 10s` / `requestTimeout = 15s` protect only against slow *clients* while receiving the request (Node answers those with a bare 408). The client maps a bare 408 to `SERVICE_UNAVAILABLE` and retries.
- `process.on('unhandledRejection'|'uncaughtException')`: log fatal, then begin graceful shutdown and exit 1 (Docker restarts it).

### Structured log fields
`time, level, msg, requestId, method, route, status, durationMs, sessionRole, userId?, orderId?, orderNumber?, errorCode?`

Primary rule: **never pass request bodies, order rows, `OrderDto`s, passwords or pairing codes to the logger.** Log explicit scalar fields only. Second line of defence, pino redaction with explicit paths: `req.headers.cookie`, `req.headers.authorization`, `res.headers["set-cookie"]`, `password`, `passwordHash`, `token`, `code`, `pairingCode`, `text`, `order.text`, `body`, `req.body`. Note that wildcard paths like `*.text` only match one level deep, so they are not relied on. `logging.int` captures the log stream during login, pairing, create and errors, and asserts that no order text, password or code appears.

## 4. Frontend architecture

- `lib/api-client.ts`: `apiFetch<T>(path, { method, body, schema, timeoutMs = 10_000, idempotencyKey? })`
  - Adds `Content-Type`, `X-Request-Id` (uuid) and `Idempotency-Key`.
  - Aborts after `timeoutMs` → `ApiError('CLIENT_TIMEOUT')`.
  - Network failure → `ApiError('NETWORK_ERROR')`.
  - Non-JSON or envelope-less response → `ApiError('BAD_RESPONSE', status)`.
  - Validates success bodies with the shared Zod schema (`BAD_RESPONSE` on mismatch).
  - Feeds `serverTime` to `clock-sync`.
- `ApiError { code, status, message, requestId?, details?, retryable }`. `message` comes from the shared catalog.
- Global handling:
  - `401` on any call: session context → `unauthenticated`. Owner goes to `/owner/login?next=…` (the draft is kept in localStorage). Kitchen goes to `/kitchen/pair`.
  - Route-level `ErrorBoundary` with a "Reload" button and the requestId (if any) for support. Kitchen boundary auto-reloads after 30 s.
- Notifications: toasts for transient success/failure (`aria-live="polite"`), and an inline alert in the composer for submission failures (`role="alert"`). Errors on the kitchen screen show as a non-blocking banner, never a modal.

## 5. Scenario playbook

| Scenario | Detection | Behaviour |
|---|---|---|
| **Submission, validation failure** | 400 | Inline message under the textarea. Text kept. Idempotency key regenerated on the next edit (nothing was saved) |
| **Submission, timeout / network error** | `CLIENT_TIMEOUT`, `NETWORK_ERROR` | State → "Checking…". Auto-retry with the **same** idempotency key at 1 s, 2 s, 4 s. On success show the number (a replay is fine). After 3 failures: "Not confirmed — Retry", text kept, key kept. If the user edits the text while the outcome is unknown, warn: "The previous attempt may have reached the kitchen" |
| **Duplicate request** (double-click, retry) | Same key | Button disabled while sending. Server replay returns the original order. The UI shows the same number, and no duplicate card appears (version merge) |
| **Menu changed under the owner** | 409 `MENU_ITEM_UNAVAILABLE` | The composer reloads the menu; lines that are no longer on it stay in the summary, flagged red ("No longer on the menu: remove it"). Nothing is saved, no number used, notes kept |
| **Menu fails to load** | `GET /api/menu` error | Menu mode shows "The menu could not be loaded. You can still use Paste / Type." with Retry. A failed refresh keeps the last loaded menu |
| **Kitchen notes too long** | Client counter / 400 | Counter turns red, message shown, Send blocked. The notes are never cut |
| **Alert sound blocked or failing** | `OrderAlert` result `locked` / `failed` / `unsupported` | Settings show the real state ("The browser is blocking sound", "could not be played"); the banner offers a tap to enable. Orders and sockets are unaffected (ADR-028) |
| **Key reused with different text** | 422 | Show "An earlier version was sent as #N. Send this edited text as a new order?" → Yes generates a new key |
| **DB outage** | 503 `DATABASE_UNAVAILABLE` | Owner: retry as above, text kept. `/health/ready` → 503. Kitchen: snapshot fetch fails → keep last cards, banner, retry with backoff (2, 4, 8 … max 30 s) |
| **Auth failure mid-session** | 401 | Redirect with draft preserved. Socket gets `session:revoked` or `connect_error UNAUTHENTICATED` |
| **Rate limited** | 429 | Countdown from `Retry-After`; the button is disabled until then |
| **Socket disconnect** | `disconnect` | Pill → Reconnecting → Offline. Socket.IO auto-reconnects (1 s → max 10 s, jittered). Cards and timers continue from deadlines |
| **Reconnect failure** | repeated `connect_error` | Keep retrying indefinitely on the kitchen. Owner sees "Offline — orders can't be sent". Sending stays possible via REST if HTTP works, because the socket is not required to send |
| **Stale client state** | Version check, periodic resync | Snapshot replaces the active set. The resync interval covers missed events |
| **Timer sync error** | Clock offset > 120 s | Corrected automatically. Subtle note shown |
| **Complete/cancel failure** | 409, 404, 5xx | 409: toast "Already completed/cancelled" and apply the server's order (card leaves). 404: remove the card and resync. 5xx/timeout: card stays, toast "Couldn't update — try again". The card is never removed optimistically |
| **Malformed socket payload** | Zod fails on the client | Drop it and trigger a resync |
| **Proxy error (502/504 HTML)** | `BAD_RESPONSE` or status ≥ 502 | Treated as `SERVICE_UNAVAILABLE` and retried. TROUBLESHOOTING.md §Proxy |
| **Migration failure** | `migrate` exits non-zero | `server` does not start (`depends_on: service_completed_successfully`). The old containers keep running if this was an update. See DEPLOYMENT.md §Rollback |
| **Container startup failure** | Env validation fails | The server exits with a readable list of missing/invalid **variable names** (never values). Healthcheck fails, `restart: unless-stopped` retries. Logs: `docker compose -p rkds logs server` |
| **Backup failure** | Script exit code, empty file, `pg_restore --list` fails | Script exits non-zero and leaves no partial file (writes to `.partial`, renames on success). Cron mails/logs. See BACKUP_AND_RECOVERY.md |
| **Restore failure** | `pg_restore` error | The restore script keeps the pre-restore safety dump and stops. Instructions to roll back to the safety dump |
| **Graceful shutdown** | SIGTERM | Stop accepting, return `503 SERVICE_UNAVAILABLE` to new requests, wait ≤ 10 s for in-flight requests, close sockets, disconnect Prisma, exit 0 |

## 6. Owner submission states (UI contract)

| State | Button | Textarea | Message |
|---|---|---|---|
| `idle` | "Send to Kitchen" (disabled while empty) + secondary "Paste" | editable | — |
| `sending` | disabled, spinner "Sending…" | read-only | — |
| `checking` | disabled "Checking…" | read-only | "Connection slow — confirming with kitchen…" |
| `saved` | enabled | **cleared** | Success: "Order #012 sent to kitchen" (5 s) |
| `failed` | "Retry" | editable, **text kept** | Error from catalog + requestId (small) |

The "saved" state is only entered from a 200/201 response that passes schema validation.

## 7. Tests

- Unit: `error-handler.test.ts` (each code → status/envelope, unknown → 500 without leak), `db/errors.test.ts` (P2002 and P2010/23505 both recognized), `request-timeout.test.ts`, `api-client.test.ts` (timeout, network, bad response), `use-submit-order.test.ts` (state machine incl. retry with the same key, text preservation).
- Integration: `errors.int.test.ts` (invalid JSON, too large, wrong content type, unknown route, origin rejected), `health.int.test.ts` (DB down → 503).
- E2E: `resilience.spec.ts` (server stopped during submit → text kept → server back → retry succeeds with no duplicate).
