# Architecture — 91 Degree RKDS

Related: [DECISIONS.md](DECISIONS.md) · [REALTIME_FLOW.md](REALTIME_FLOW.md) · [DATABASE.md](DATABASE.md) · [SECURITY.md](SECURITY.md) · [DEPLOYMENT.md](DEPLOYMENT.md)

## 1. System overview

```mermaid
flowchart LR
  subgraph Devices
    O["Owner browser<br/>/owner (phone or PC)"]
    K["Kitchen screen<br/>/kitchen (TV / mini-PC)"]
  end
  subgraph VPS["Hostinger KVM 2 (existing)"]
    P["Existing reverse proxy<br/>(Traefik or nginx — to be inspected)<br/>TLS termination"]
    subgraph RKDS["Compose project: rkds (network rkds_internal)"]
      W["web<br/>nginx-unprivileged :8080<br/>static SPA + proxy /api, /socket.io"]
      S["server<br/>Node 24 · Express · Socket.IO :3000"]
      D[("db<br/>PostgreSQL 17<br/>volume rkds_pgdata")]
      M["migrate (one-off)<br/>prisma migrate deploy"]
    end
    N8N["n8n (untouched)"]
    EVO["Evolution API (untouched)"]
  end
  O -- HTTPS --> P
  K -- HTTPS / WSS --> P
  P --> W
  W -- "/api, /socket.io" --> S
  S --> D
  M --> D
```

Only `web` is reachable from the proxy. `server` and `db` have no host ports. PostgreSQL is never published.

## 2. Components and responsibilities

| Component | Responsibilities | Must NOT |
|---|---|---|
| `apps/web` (React SPA) | Owner panel, kitchen display, pairing/login pages; API client with timeouts and idempotency; socket client; snapshot+event merge; clock-offset timers; error presentation | Generate authoritative numbers/timestamps; hold secrets; render order text as HTML |
| `apps/web/nginx` | Serve static assets; SPA history fallback; proxy `/api` + `/socket.io` (WebSocket upgrade) to `server`; security headers for HTML | Terminate public TLS (the host proxy does that) |
| `apps/server` | Config validation; auth/sessions; authorization; validation; order creation (numbering + idempotency); status transitions; audit; Socket.IO broadcast after commit; health; structured logs; CLI tools | Accept mutations over sockets; log order text or secrets |
| `packages/shared` | Zod schemas (API + socket payloads), error codes + HTTP map + user messages, constants, pure time functions (business date, timer state, formatting), text normalization | Import framework or DB code |
| `database/` | Prisma schema and versioned SQL migrations | Contain seed data for production |
| PostgreSQL | Source of truth for orders, counters, sessions, users, audit | Be reachable from outside `rkds_internal` |

## 3. Server module map (ownership)

```mermaid
flowchart TB
  main[main.ts bootstrap] --> app[app.ts Express factory]
  main --> rt[realtime/socket-server]
  app --> mw[http/middleware<br/>request-id · logger · security · rate-limit · error-handler]
  app --> health[modules/health]
  app --> auth[modules/auth]
  app --> kd[modules/kitchen-devices]
  app --> orders[modules/orders]
  orders --> repo[orders.repository<br/>raw SQL counter + conditional update]
  orders --> bc[realtime/broadcaster]
  kd --> bc
  auth --> sess[session.service]
  rt --> sess
  repo --> prisma[(db/prisma)]
  sess --> prisma
  orders --> shared[[@rkds/shared]]
  auth --> shared
```

| Module | Owns | Doc |
|---|---|---|
| `modules/orders` | Create, list, history, complete, cancel, numbering, idempotency, transitions, audit events | [DATABASE.md](DATABASE.md), [API_CONTRACTS.md](API_CONTRACTS.md) |
| `modules/auth` | Login/logout/session, password hashing, role guards, cookie handling | [SECURITY.md](SECURITY.md) |
| `modules/kitchen-devices` | Pairing codes, kitchen sessions, revocation | [SECURITY.md](SECURITY.md) |
| `realtime/*` | Socket auth, rooms, broadcasting, session sweeper | [REALTIME_FLOW.md](REALTIME_FLOW.md) |
| `http/middleware/*` | Cross-cutting HTTP concerns | [ERROR_HANDLING.md](ERROR_HANDLING.md), [SECURITY.md](SECURITY.md) |
| `cli/*` | Owner account management | [DEPLOYMENT.md](DEPLOYMENT.md) |

## 4. Authentication boundaries

```mermaid
flowchart LR
  A[Anonymous] -->|POST /api/auth/login| OWN[OWNER session]
  A -->|POST /api/kitchen/pair + code| KIT[KITCHEN session]
  OWN -->|POST /api/kitchen/pairing-codes| CODE[one-time code]
  CODE -.typed on TV.-> A
  OWN -->|REST: create/complete/cancel/history/devices| API[(API)]
  KIT -->|GET /api/orders/active only| API
  OWN & KIT -->|Socket.IO handshake w/ cookie| WS[room: orders]
```

- Cookie: `__Host-rkds_sid` (prod) / `rkds_sid` (dev). It is httpOnly, Secure (prod), SameSite=Strict, Path=/.
- Every request resolves the session from the token hash, checks expiry and revocation, and attaches `req.auth = { sessionId, role, userId? }`.
- Role guards: `requireRole('OWNER')`, `requireRole('OWNER','KITCHEN')`.

## 5. Order creation data flow

```mermaid
sequenceDiagram
  participant Owner as Owner UI
  participant API as server /api/orders
  participant DB as PostgreSQL
  participant IO as Socket.IO
  participant Kit as Kitchen UI
  Owner->>Owner: validate non-empty, keep idempotency key for this draft
  Owner->>API: POST /api/orders (Idempotency-Key, {text, source, prepMinutes})
  API->>API: auth OWNER · Origin check · zod validate · normalize text
  API->>DB: SELECT by idempotency_key (fast path)
  alt key exists
    DB-->>API: existing order
    API-->>Owner: 200 replay (or 422 if hash differs)
  else new
    API->>DB: BEGIN
    API->>DB: upsert order_day_counters → daily_number
    API->>DB: INSERT orders (+ order_events CREATED)
    API->>DB: COMMIT
    API->>IO: emit order:created {order}
    API-->>Owner: 201 {order, serverTime}
    IO-->>Kit: order:created
    Kit->>Kit: version-merge, animate in, chime
  end
  Owner->>Owner: clear textarea ONLY after 200/201
```

If the INSERT hits the `idempotency_key` unique constraint (a concurrent duplicate), the transaction rolls back, including the counter increment. The API then re-reads the existing order and responds as a replay.

## 6. Order lifecycle

```mermaid
stateDiagram-v2
  [*] --> ACTIVE: created (timer starts at commit)
  ACTIVE --> COMPLETED: owner completes
  ACTIVE --> CANCELLED: owner cancels (confirmed)
  COMPLETED --> [*]
  CANCELLED --> [*]
```

A transition is one SQL statement, `UPDATE … WHERE id=$1 AND status='ACTIVE' RETURNING *`, plus an audit insert, in one transaction. It is broadcast as `order:updated` after commit. Clients remove the card only when they receive the confirmed status (from the HTTP response or the event).

## 7. Timer model

- Stored: `created_at`, `deadline_at = created_at + prep_minutes` (CHECK-enforced).
- Client: `remainingMs = deadlineAt − (Date.now() + clockOffset)`. The pure function `computeTimerState` lives in `@rkds/shared/time/timer.ts`.
- Phases (by remaining ms): `normal` > 300 000 · `warning` 0 < r ≤ 300 000 · `overdue` r ≤ 0 (the deadline instant itself is overdue, shown as `+00:00`).
- Rounding: remaining time is shown rounded **up** (ceil) and overdue time rounded **down** (floor), so `00:00` never appears as a countdown value.
- Display: `MM:SS` / `+MM:SS` / `+H:MM:SS`. All display uses Asia/Karachi.

## 8. Error handling and observability

There is one central error middleware, stable error codes from `@rkds/shared`, request IDs on every request and response, and pino JSON logs with redaction. Details: [ERROR_HANDLING.md](ERROR_HANDLING.md).

## 9. Deployment topology

- Compose project `rkds`, services `db`, `migrate`, `server`, `web`, network `rkds_internal` (bridge), volume `rkds_pgdata`.
- Start order: `db` (healthy) → `migrate` (completed successfully) → `server` (healthy) → `web`.
- Exposure: one overlay, chosen after inspecting the VPS (ADR-019, ADR-026).
- Details: [DEPLOYMENT.md](DEPLOYMENT.md).

## 10. Key invariants (do not break)

1. Success is reported to the owner only after COMMIT.
2. Socket events are emitted only after COMMIT, and never carry data that was not committed.
3. Order numbers come only from the DB counter inside the create transaction.
4. Status transitions are guarded by `WHERE status='ACTIVE'` in SQL, not only in application code.
5. Order text is never rendered as HTML and never logged.
6. PostgreSQL has no published host port.
7. Production has no seed data and no default credentials.
