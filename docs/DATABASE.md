# Database — 91 Degree RKDS

PostgreSQL 17 · Prisma ORM · schema at `database/schema.prisma` · migrations at `database/migrations/`

Related: [DECISIONS.md](DECISIONS.md) ADR-003/004/005/006/017 · [BACKUP_AND_RECOVERY.md](BACKUP_AND_RECOVERY.md) · [INTEGRATION_TESTING.md](INTEGRATION_TESTING.md)

## 1. Conventions

- Table and column names are `snake_case` in SQL, mapped to camelCase in Prisma with `@map`/`@@map`.
- Primary keys are `uuid DEFAULT gen_random_uuid()` (built into PostgreSQL 13+). `order_events` uses a `BIGSERIAL` id (Prisma `BigInt @default(autoincrement())`; identity columns are not modelled by Prisma and would show as drift).
- Every timestamp is `timestamptz` and stored in UTC. The DB session timezone is left at UTC.
- `business_date` is `date`, the Asia/Karachi business day computed by the app (ADR-005).
- Enums are PostgreSQL enums created by Prisma.

## 2. Schema

### `users` (owners)
| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK |
| username | text | NOT NULL, UNIQUE, CHECK `username = lower(username)`, CHECK length 3–32, CHECK `username ~ '^[a-z0-9._-]+$'` |
| password_hash | text | NOT NULL (Argon2id PHC string) |
| role | `user_role` (`OWNER`) | NOT NULL DEFAULT 'OWNER' |
| created_at / updated_at | timestamptz | NOT NULL DEFAULT now() |
| disabled_at | timestamptz | NULL |

The enum has a single value in v1. It exists so that adding roles later is a non-breaking expand migration.

### `sessions`
| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK |
| token_hash | text | NOT NULL, UNIQUE (hex SHA-256 of cookie token) |
| role | `session_role` (`OWNER`,`KITCHEN`) | NOT NULL |
| user_id | uuid | FK → users(id) ON DELETE CASCADE, NULL |
| device_label | text | NULL, CHECK length ≤ 40 |
| created_by_user_id | uuid | FK → users(id) ON DELETE SET NULL, NULL (who paired a kitchen device) |
| created_at | timestamptz | NOT NULL |
| last_seen_at | timestamptz | NOT NULL |
| expires_at | timestamptz | NOT NULL (absolute) |
| revoked_at | timestamptz | NULL |
| user_agent | text | NULL, truncated to 200 chars |

CHECK: `(role='OWNER' AND user_id IS NOT NULL AND device_label IS NULL) OR (role='KITCHEN' AND user_id IS NULL AND device_label IS NOT NULL)`.
Idle expiry is computed from `last_seen_at` plus the role's idle TTL.
Indexes: `sessions_role_revoked_idx (role, revoked_at)` for the kitchen device list and `sessions_user_idx (user_id)`. (A partial index would be Prisma drift, §5 rule 4.)

### `kitchen_pairing_codes`
| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK |
| code_hash | text | NOT NULL, UNIQUE |
| device_label | text | NOT NULL, length 1–40 |
| created_by_user_id | uuid | FK → users(id) ON DELETE CASCADE |
| created_at, expires_at | timestamptz | NOT NULL |
| used_at | timestamptz | NULL |

Redemption: `UPDATE … SET used_at=$2 WHERE code_hash=$1 AND used_at IS NULL AND expires_at > $2 RETURNING *`, where `$2` is the injected `Clock` time (never the DB's `now()`, so tests with a fixed clock behave like production). This is atomic and single-use.

### `order_day_counters`
| Column | Type | Constraints |
|---|---|---|
| business_date | date | PK |
| last_number | integer | NOT NULL CHECK > 0 |
| updated_at | timestamptz | NOT NULL |

### `orders`
| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK (immutable internal ID) |
| business_date | date | NOT NULL |
| daily_number | integer | NOT NULL CHECK > 0 |
| idempotency_key | uuid | NOT NULL UNIQUE |
| request_hash | text | NOT NULL (hex SHA-256 of normalized payload) |
| text | text | NOT NULL CHECK `char_length(text) BETWEEN 1 AND 5000`. For MENU orders the server writes one "2 × Name (Size)" line per item |
| kind | `order_kind` (`TEXT`,`MENU`) | NOT NULL DEFAULT 'TEXT' (ADR-027) |
| items | jsonb | NULL. MENU orders only: snapshot array of `{itemId, variantId, name, variant, quantity, unitPrice}` |
| notes | text | NULL CHECK `notes IS NULL OR char_length(notes) BETWEEN 1 AND 500` (`orders_notes_length_chk`) |
| source | `order_source` (`WHATSAPP`,`FOODPANDA`,`PHONE`,`OTHER`) | NOT NULL |
| prep_minutes | smallint | NOT NULL CHECK `prep_minutes IN (15,20,25,30)` (widened from 20/25 by migration `20261030140000_prep_minutes_15_30`, Q-08) |
| status | `order_status` (`ACTIVE`,`COMPLETED`,`CANCELLED`) | NOT NULL DEFAULT 'ACTIVE' |
| created_at | timestamptz | NOT NULL |
| deadline_at | timestamptz | NOT NULL, CHECK `deadline_at = created_at + make_interval(mins => prep_minutes)` |
| completed_at | timestamptz | NULL |
| cancelled_at | timestamptz | NULL |
| updated_at | timestamptz | NOT NULL |
| version | integer | NOT NULL DEFAULT 1 (incremented on every change; used by clients to drop stale events) |
| created_by_user_id | uuid | FK → users(id) ON DELETE SET NULL |
| closed_by_user_id | uuid | FK → users(id) ON DELETE SET NULL, NULL |

Constraints:
- `UNIQUE (business_date, daily_number)`
- CHECK status consistency:
  - `status='ACTIVE'` → `completed_at IS NULL AND cancelled_at IS NULL`
  - `status='COMPLETED'` → `completed_at IS NOT NULL AND cancelled_at IS NULL`
  - `status='CANCELLED'` → `cancelled_at IS NOT NULL AND completed_at IS NULL`
- `orders_items_shape_chk`: `kind='TEXT'` → `items IS NULL`; `kind='MENU'` → `items` is a JSON array of 1–50 lines (migration `20261030120000_menu_orders_notes`, expand-only: existing rows become `TEXT` with no items and no notes)

Indexes:
| Index | Purpose |
|---|---|
| `orders_status_created_asc_idx ON orders (status, created_at, id)` (Prisma `@@index`) | Kitchen/owner active snapshot, oldest first. A partial index was rejected because Prisma cannot model it, and `migrate dev` would try to drop it (drift) |
| `UNIQUE (business_date, daily_number)` | Uniqueness + search by number within a date |
| `orders_history_idx ON orders (business_date, created_at DESC, id DESC)` | History by date, keyset pagination |
| `orders_business_status_idx ON orders (business_date, status, created_at DESC)` | Status-filtered history within a date |
| `UNIQUE (idempotency_key)` | Idempotency |

### `order_events` (audit)
| Column | Type | Constraints |
|---|---|---|
| id | bigserial | PK |
| order_id | uuid | FK → orders(id) ON DELETE CASCADE, NOT NULL |
| type | `order_event_type` (`CREATED`,`COMPLETED`,`CANCELLED`) | NOT NULL |
| actor_user_id | uuid | FK → users(id) ON DELETE SET NULL |
| occurred_at | timestamptz | NOT NULL |
| request_id | text | NULL (correlates with logs) |

Index: `(order_id, occurred_at)`.

**Justification:** the audit table records who cancelled or completed an order and when, without logging the order text.

## 3. Transaction boundaries

| Operation | Transaction contents | Isolation |
|---|---|---|
| Create order | counter upsert → order INSERT → event INSERT | READ COMMITTED (the counter row lock serializes) |
| Complete / cancel | conditional UPDATE (`WHERE status='ACTIVE'`) → event INSERT | READ COMMITTED |
| Login | session INSERT (password verified before, outside the txn) | single statement |
| Pair kitchen | code redeem UPDATE → session INSERT | READ COMMITTED |
| Logout / revoke | session UPDATE `revoked_at` | single statement |

Prisma interactive transactions use `timeout: 5000`, `maxWait: 2000`. Socket emits happen **after** `$transaction` resolves.

### Create-order SQL (core)
```sql
INSERT INTO order_day_counters (business_date, last_number, updated_at)
VALUES ($1, 1, $2)
ON CONFLICT (business_date)
DO UPDATE SET last_number = order_day_counters.last_number + 1, updated_at = EXCLUDED.updated_at
RETURNING last_number;
```

### Transition SQL (core)
```sql
UPDATE orders
SET status = 'COMPLETED', completed_at = $2, closed_by_user_id = $3, updated_at = $2, version = version + 1
WHERE id = $1 AND status = 'ACTIVE'
RETURNING *;
```
If zero rows: `SELECT status FROM orders WHERE id=$1`. Missing → `404 ORDER_NOT_FOUND`. Same target status → `200` idempotent (no event). Different terminal status → `409 INVALID_STATUS_TRANSITION`.

## 4. Numbering policy

- Scope: one counter per `business_date` (Asia/Karachi, cutoff `BUSINESS_DAY_CUTOFF_HOUR`, default 6).
- First order of a business day = 1. Display is `String(n).padStart(3,'0')`.
- Numbers are never reused. Cancelled orders keep their number.
- Restarts have no effect because the counter state lives in PostgreSQL.
- The same number can exist on different dates. The UI disambiguates with the date (FR-KIT-10). Search by number always includes a date.
- Timestamps come from the server clock (`Clock` abstraction, injectable in tests), read **once** per request, and are used for `created_at`, `deadline_at` and `business_date`. The `deadline_at` CHECK needs exact equality, so `deadline_at` must be computed from that same single reading (JS millisecond precision, stored exactly in `timestamptz`). SQL never uses `now()` for business timestamps. `DEFAULT now()` exists only as a safety net on `users`/`sessions` audit columns.

## 5. Migrations

- Dev: `npm run db:migrate -- --name <change>` runs `prisma migrate dev` against `rkds_dev`. Its shadow database is `rkds_shadow` (`SHADOW_DATABASE_URL`), created by the dev init script and owned by `rkds_app`, so no superuser URL is needed. For constraints Prisma cannot express, use `--create-only`, then append the SQL by hand.
- Drift check (G9, `db:migrate:check` → `apps/server/scripts/migrate-check.mjs`, also asserted in `migrations.int`): `prisma migrate deploy` on `rkds_test` as `rkds_app`, then `prisma migrate diff --from-config-datasource --to-schema ../../database/schema.prisma --exit-code` with `DATABASE_URL` set to the test URL. Verified to exit 2 on a deliberately added column.
- **Prisma 7.10.1 quirk:** `migrate diff` prints nothing and exits 0 when `prisma.config.ts` has no datasource, even for `--from-empty`. Always set `DATABASE_URL` when generating SQL with `migrate diff`.
- Production: `migrate` service → `prisma migrate deploy` (forward-only, ADR-017). The `prisma` CLI is therefore a **runtime dependency** of `@rkds/server` (not a devDependency), so it exists in the production image.
- Prisma major version is pinned exactly in `package.json`. Error-code handling (P2002 vs P2010 from raw queries) is tested against that version.
- Rules:
  1. Never edit a migration that has been applied anywhere shared. Add a new one.
  2. Every migration is backward-compatible with the currently deployed app (expand/contract).
  3. Back up before production migrations ([BACKUP_AND_RECOVERY.md](BACKUP_AND_RECOVERY.md)).
  4. Hand-written CHECK constraints (which Prisma doesn't model or drop) need an integration test that asserts they exist and work (`schema-constraints.int.test.ts`). Don't use features that Prisma would treat as drift, such as partial or expression indexes.
  5. `prisma migrate reset` is allowed **only** against databases whose name ends in `_test` or `_dev`. The test harness enforces this guard.
- There is no seed script for production. Test fixtures are created by test factories inside `rkds_test` only.

## 6. Databases per environment

| Environment | Database | Where |
|---|---|---|
| Local dev | `rkds_dev` | `docker-compose.dev.yml` Postgres on `127.0.0.1:55432` |
| Automated tests | `rkds_test` | same container, created by `database/init/01-create-test-db.sql` |
| Production | `rkds` (from `POSTGRES_DB`) | `db` service, volume `rkds_pgdata`, no host port. App connects as the non-superuser DB owner `rkds_app` (SECURITY §8) |

## 7. Retention

- Orders (completed/cancelled) and their audit events are deleted automatically once their `business_date` is more than `ORDER_RETENTION_DAYS` (default 7) business days old (owner decision Q-04, ADR-024):
  ```sql
  DELETE FROM orders WHERE id IN (
    SELECT id FROM orders
    WHERE status <> 'ACTIVE' AND business_date < $1   -- $1 = currentBusinessDate − ORDER_RETENTION_DAYS, from the injected Clock
    LIMIT 500)
  ```
  repeated until fewer than 500 rows are deleted. Runs at startup and every hour (`order-retention`). `order_events` rows go with them (`ON DELETE CASCADE`). Only the count is logged. Active orders are never purged. `order_day_counters` rows are kept so numbers are never reused.
- Sessions: expired/revoked rows older than 30 days are deleted by a lightweight daily cleanup in the server (`session-cleanup`, runs at startup and every 24 h).
- Pairing codes: rows older than 1 day are deleted by the same cleanup.
- History queries reject dates outside the retention window (`400 VALIDATION_FAILED`), so the UI never offers a date that can no longer have data.

## 8. Backups

Daily `pg_dump -Fc` with 7-day retention (matches order retention) and monthly restore drills. Full procedure: [BACKUP_AND_RECOVERY.md](BACKUP_AND_RECOVERY.md).
