# Integration Testing — 91 Degree RKDS

These tests exercise the real Express app, real Socket.IO and a real PostgreSQL 17 (`rkds_test`). SQL behaviour is never mocked.

Command: `npm run test:integration` (needs `npm run db:up`, i.e. Docker running).

## 1. Harness (`apps/server/tests/helpers/`)

| Helper | Responsibility |
|---|---|
| `test-db.ts` | Reads `TEST_DATABASE_URL`. **Aborts unless the DB name ends with `_test`.** Runs `prisma migrate deploy` once (global setup) and `TRUNCATE … RESTART IDENTITY CASCADE` per test |
| `app-harness.ts` | Builds `app.ts` + Socket.IO on an ephemeral port with `fixedClock` and a captured pino stream |
| `factories.ts` | `createOwner()`, `ownerSession()`, `kitchenSession()`, `createOrder()`. **Test-only**, never imported by `src/` (ESLint boundary rule) |
| `socket-client.ts` | Authenticated socket.io-client with the session cookie and Origin; `waitForEvent(name, predicate, timeout)` |
| `fixed-clock.ts` | Controllable `Clock` (`set`, `advance`) |

Vitest project `server-int`: `fileParallelism: false`, `testTimeout: 15000`. The app harness uses `RATE_LIMIT_MULTIPLIER=100`, so suites that legitimately create many sessions or orders (e.g. 50 concurrent creates) are not throttled. `rate-limit.int` builds its own app with multiplier **1**.

Local DB parity: `database/init/01-create-test-db.sql` (dev compose) creates the same non-superuser `rkds_app` (no superuser, createdb or createrole) as owner of `rkds_dev`, `rkds_test` and `rkds_shadow`, so the tests run with production privileges. The production script `database/init-prod/10-create-app-role.sh` is exercised by the prod-like Docker run (P11).

## 2. Required suites

| File | Covers |
|---|---|
| `migrations.int.test.ts` | Fresh deploy succeeds; `prisma migrate diff` shows no drift; a fresh DB has **0** rows in every table (no seed); hand-written CHECKs exist (query `pg_constraint`); the connected role is not a superuser (`rolsuper = false`) |
| `schema-constraints.int.test.ts` | Direct SQL inserts violating status consistency / prep_minutes / deadline / text length / username format are rejected; `orders_items_shape_chk` (TEXT with items, MENU without/empty/non-array/51 lines) and `orders_notes_length_chk` (empty, 501) rejected; `kind` defaults to TEXT |
| `health.int.test.ts` | live 200; ready 200; ready 503 when the DB is unreachable (harness with a Prisma client pointed at a closed port) |
| `errors.int.test.ts` | Invalid JSON → 400 INVALID_JSON; 33 KB → 413; `text/plain` → 415; unknown route → 404 ROUTE_NOT_FOUND; envelope + `X-Request-Id` on all |
| `security.int.test.ts` | POST without Origin → 403; foreign Origin → 403; helmet headers present; `x-powered-by` absent; `Cache-Control: no-store` |
| `rate-limit.int.test.ts` | Global `/api` limit; login 11th attempt/IP → 429 + Retry-After; (username, IP) lock after 5 failures does **not** block the same username from another IP; pairing 10/15 min/IP; pairing-codes 10/h/owner; orders 31st in a minute → 429 *(global part lands in P3, the rest in P4/P5)* |
| `auth.int.test.ts` | Login success sets the cookie with the correct flags; wrong/unknown → identical 401; disabled user cannot log in **and existing sessions stop working**; logout revokes (next request 401); session rotation; idle/absolute expiry via fixedClock |
| `authorization.int.test.ts` | Table-driven: every route × {anonymous, KITCHEN, OWNER} matches API_CONTRACTS §4; `DELETE /api/orders/:id` does not exist (404 ROUTE_NOT_FOUND) |
| `pairing.int.test.ts` | Code issued once; redeem → KITCHEN session; reuse rejected; expired rejected (fixedClock); `GET /api/kitchen/devices` lists active screens only; revoke device → 401 |
| `order-retention.int.test.ts` | With a fixed clock: completed/cancelled orders older than 7 business days are deleted with their events; an order exactly 7 days old is kept; an old **ACTIVE** order is kept; `order_day_counters` rows are kept; >500 rows purged in batches; log line has counts only; history for a date outside the window → 400 |
| `session-cleanup.int.test.ts` | Expired/revoked sessions older than 30 d and pairing codes older than 1 d are deleted; live sessions untouched |
| `orders.create.int.test.ts` | 201 shape; normalization persisted; text with SQL/HTML payloads stored verbatim; Urdu/emoji round-trip; deadline = created + prep; business date with the cutoff (fixedClock at 03:59/04:00 PKT); missing key → 400; validation errors |
| `idempotency.int.test.ts` | Same key + same payload → 200 replay, same id/number, one row, one CREATED event; same key + different text → 422 with details; **10 concurrent identical requests → exactly one order** |
| `numbering.concurrency.int.test.ts` | 50 concurrent creates → numbers 1..50, unique, no gaps; a new business date restarts at 1; counter survives an app harness restart (new Prisma client); failed create (forced error after counter) leaves no gap |
| `orders.active.int.test.ts` | Only ACTIVE; oldest first with an id tie-break; both roles; includes serverTime |
| `orders.history.int.test.ts` | Date/status filter; number search; keyset pagination stable under inserts; bad cursor → 400 |
| `orders.transitions.int.test.ts` | Complete/cancel persist timestamps + closed_by + version+1 + audit event; `GET /api/orders/:id` returns the events with actor usernames; repeat → alreadyApplied (no new event); conflicting → 409 with currentStatus; unknown → 404; **concurrent complete + cancel → exactly one wins** |
| `socket.auth.int.test.ts` | No cookie → connect_error UNAUTHENTICATED; foreign Origin rejected; missing Origin + valid cookie accepted; polling-only client (`transports: ['polling']`) connects and receives events; KITCHEN + OWNER join; disabling an owner disconnects their sockets; logout → `session:revoked` + disconnect; device revoke → disconnect; sweeper disconnects an expired session (fixedClock + manual sweep trigger) |
| `socket.events.int.test.ts` | `order:created` received by kitchen after POST, payload passes the shared schema; a menu order with notes arrives with `kind`, `items` and `notes`; **not emitted** on replay or on a rolled-back create; `order:updated` after complete; no event on alreadyApplied; client-emitted events ignored |
| `logging.int.test.ts` | During create/login: captured logs contain no order text, no password, no cookie |
| `orders.menu.int.test.ts` | ADR-027: `GET /api/menu` (owner 200 with 12 categories / 88 items, kitchen 403, anonymous 401); menu order 201 with server-built text, item snapshots and notes; shared numbering with text orders; unknown item/size → 409 with failing lines, nothing saved, no number used; invalid lines → 400; replay and 422 under one key; 12 concurrent mixed creates → gap-free numbers; notes on text orders in active/history/detail; blank → NULL; 501 chars → 400; notes stay with the right order after completion |
| `migrations.upgrade.int.test.ts` | Runs the init migration, inserts orders/events/counter like the previous release, applies `20261030120000_menu_orders_notes`: every existing row is unchanged apart from `kind=TEXT`, `items/notes = NULL` |
| `cli.int.test.ts` | create-owner (stdin-driven non-TTY mode for tests) creates a hashed user; refuses a duplicate username; reset-owner-password and disable-owner revoke existing sessions |

## 3. Database outage behaviour

- Automated: `health.int` (ready → 503) and `orders.create.int` with a Prisma client whose pool points at a closed port → `503 DATABASE_UNAVAILABLE`, and the response contains no SQL/host details.
- Manual (release checklist, prod-like local stack): `docker compose -p rkds-local stop db` → owner send shows "temporarily unavailable", text kept → `start db` → retry succeeds, one order. Record PASS/FAIL in the report.

## 4. Data hygiene

- Only `rkds_test` is used. Production data is never copied into tests.
- Factories generate obviously synthetic text (`"TEST ORDER <n>"`).
- No test writes outside the test DB and temp dirs.
