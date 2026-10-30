# Report — P5 Orders API, idempotency, numbering, retention
Date: 2026-10-29 (Asia/Karachi) · Phase/step: Phase 2, P5 · Author: Claude Code

## 1. Summary
The orders API is built and tested:
- **Create** (`POST /api/orders`):
  - The daily number comes from a counter upserted in the same transaction as the order.
  - The business date has a 06:00 cutoff, and one clock reading is used per request.
  - Each create needs an idempotency key; a retry with the same payload gets the original order back, and a different payload gets 422.
  - Order text is stored exactly as sent.
  - A CREATED audit event is written.
- **Active list:** oldest first, capped at 500.
- **History:** filtered by business date, status and number, with stable pagination. Only dates inside the 7-day retention window are accepted.
- **Order detail:** the order plus its audit trail.
- **Complete and cancel:**
  - Guarded by `UPDATE … WHERE status='ACTIVE' RETURNING`.
  - Repeating the same action is idempotent; the opposite action gets 409.
- **Order events:** published in-process only after the database commits. Nothing is published for replays or repeated actions.
- **Limits and retention:** 30 orders per minute per session; an hourly 7-day retention purge in batches of 500 (ADR-024).

## 2. Important files
- **Orders module** (`apps/server/src/modules/orders/`): `orders.repository.ts`, `orders.service.ts`, `orders.routes.ts`, `idempotency.ts`, `transitions.ts`, `order-dto.ts`, `order-events.ts`.
- **Maintenance:** `modules/maintenance/order-retention.ts`.
- **Wiring:** `services.ts`, `app.ts`, `main.ts` (hourly retention).
- **Unit tests:** `transitions.test.ts`, `idempotency.test.ts`, `order-events.test.ts`.
- **Integration tests:**
  - `orders.create`, `idempotency`, `numbering.concurrency`, `orders.transitions`, `orders.active`, `orders.history`, `order-retention`, `authorization`, `logging`
  - an orders case in `rate-limit.int`
- **Test helpers:** the harness now exposes `services`; factories gained `postOrder` and `closeOrder`.
- **Docs:** API_CONTRACTS (malformed key → `IDEMPOTENCY_KEY_REQUIRED`).

## 3. Tests executed
| Check | Command | Result | Notes |
|---|---|---|---|
| G1 Typecheck | `npm run typecheck` | PASS | |
| G2 Lint | `npm run lint` | PASS | |
| Format | `npx prettier --check .` | PASS | |
| G3 + G4 + G6 | `npm run test:coverage` (all projects) | PASS | 37 files, 384 tests; thresholds met (exit 0) |
| Build | `npm run build` | PASS | `dist/main.js` 105.9 KB |

What the tests prove:
- **No duplicates (NFR-01):**
  - 10 concurrent identical requests create exactly one order and publish one event; the next number is 002.
  - The race window (the key is committed between lookup and insert) is tested deterministically: same payload → replay, different payload → 422.
  - The real Prisma 7 duplicate-key error is recognized by its constraint name, and the failed transaction's counter increment is rolled back.
- **Numbering (FR-ORD-10/11):**
  - 50 concurrent creates get numbers 1…50 with no gaps.
  - 05:59 PKT counts for the previous evening, and 06:00 PKT starts a new day at 001.
  - Numbering survives a restart.
  - A create that fails after the counter step leaves no gap.
- **Transitions (FR-ORD-04/05):**
  - Timestamp, closer, version +1 and an audit event are recorded.
  - A repeat is idempotent with no new event; the opposite action gets 409 with the current status.
  - When complete and cancel race, exactly one wins.
- **Retention (FR-ORD-16):**
  - Closed orders older than 7 days are deleted with their events.
  - An order exactly 7 days old is kept, as is an old active order.
  - Counters are kept, 1,200 rows are purged in 3 batches, and the log holds counts only.
- **Access matrix (API_CONTRACTS §4):** every route × {anonymous, kitchen, owner}. `DELETE /api/orders/:id` returns 404 ROUTE_NOT_FOUND for everyone (FR-ORD-15).
- **Logs (NFR-10):** no order text, passwords, cookies or pairing codes, checked after login, failed login, create, replay, 422, validation errors and pairing.
- **Stored as sent:** SQL and HTML payloads, Urdu and emoji are stored exactly (ADR-020).

## 4. Coverage
Copied from the tool output (`coverage/coverage-summary.json`, all projects):

| Scope | Statements | Branches | Functions | Lines |
|---|---|---|---|---|
| All measured code | 95.55% (753/788) | 91.06% (377/414) | 94.87% (185/195) | 96.93% (696/718) |
| `apps/server/src` | 94.78% | 90.21% | 94.29% | 96.35% |
| Orders module (target ≥ 90%) | 99.32% (145/146) | 96.10% (74/77) | 100% | 100% |
| Shared time module (target ≥ 90%) | 100% | 100% | 100% | 100% |

## 5. Remaining limitations / open items
- **Missing test found through coverage:** the first coverage run failed the orders branch threshold (88.31%). It showed that the concurrent-same-key path had never actually run. A deterministic race test now covers it, and it passes.
- **Still uncovered:** `SessionService.invalidAmong` is used by the socket sweeper and gets tested in P6.
- **Active-list cap:** the 500-order cap is a safety net (an error is logged if it is ever hit). A real restaurant shouldn't come near it.

## 6. Deployment impact
None.

## 7. Database migrations / environment changes
None. `ORDER_RETENTION_DAYS` and `BUSINESS_DAY_CUTOFF_HOUR` are now used by the server.

## 8. Skills and review
No skills or subagents were used in this step. The coverage tool's report exposed the untested race path.

## 9. Next steps
P6: realtime:
- Socket.IO server with cookie-session handshake auth and a check that rejects foreign Origins
- broadcasting committed order events
- the 60-second session sweeper
- disconnects on logout and revoke
- the `socket.auth` and `socket.events` integration suites
