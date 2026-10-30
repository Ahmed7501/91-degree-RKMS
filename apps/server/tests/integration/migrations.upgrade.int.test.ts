import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { recreateTestSchema, withPgClient } from '../helpers/test-db';

// DATABASE.md §5 (expand/contract): applying the ADR-027 migration to a database that already
// holds orders keeps every existing row unchanged. Runs both migration files in order on an
// emptied rkds_test, then restores the normal fully-migrated schema for the other suites.

const MIGRATIONS = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../database/migrations',
);
const sql = (name: string) => readFileSync(path.join(MIGRATIONS, name, 'migration.sql'), 'utf8');

const OWNER = '00000000-0000-4000-8000-000000000001';

afterAll(async () => {
  await recreateTestSchema();
}, 60_000);

describe('upgrading an existing database with 20261030120000_menu_orders_notes', () => {
  it('keeps existing orders, events and counters; they become TEXT orders without notes', async () => {
    const result = await withPgClient(async (c) => {
      await c.query('DROP SCHEMA IF EXISTS public CASCADE');
      await c.query('CREATE SCHEMA public');
      await c.query(sql('20261029120000_init'));

      // Data written by the previous release.
      await c.query(`INSERT INTO users (id, username, password_hash) VALUES ($1, 'owner', 'x')`, [
        OWNER,
      ]);
      await c.query(
        `INSERT INTO order_day_counters (business_date, last_number, updated_at)
         VALUES ('2026-10-29', 2, '2026-10-29T13:05:00Z')`,
      );
      const insert = `INSERT INTO orders (id, business_date, daily_number, idempotency_key,
          request_hash, text, source, prep_minutes, status, created_at, deadline_at, completed_at,
          updated_at, version, created_by_user_id)
        VALUES ($1, '2026-10-29', $2, $3, 'h', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`;
      await c.query(insert, [
        '00000000-0000-4000-8000-0000000000a1',
        1,
        '00000000-0000-4000-8000-0000000000b1',
        '2x Tikka\n1x Naan',
        'WHATSAPP',
        20,
        'COMPLETED',
        '2026-10-29T13:00:00Z',
        '2026-10-29T13:20:00Z',
        '2026-10-29T13:15:00Z',
        '2026-10-29T13:15:00Z',
        2,
        OWNER,
      ]);
      await c.query(insert, [
        '00000000-0000-4000-8000-0000000000a2',
        2,
        '00000000-0000-4000-8000-0000000000b2',
        '1x Zinger',
        'PHONE',
        25,
        'ACTIVE',
        '2026-10-29T13:05:00Z',
        '2026-10-29T13:30:00Z',
        null,
        '2026-10-29T13:05:00Z',
        1,
        OWNER,
      ]);
      await c.query(
        `INSERT INTO order_events (order_id, type, actor_user_id, occurred_at)
         VALUES ('00000000-0000-4000-8000-0000000000a1', 'CREATED', $1, '2026-10-29T13:00:00Z')`,
        [OWNER],
      );
      const before = await c.query<Record<string, unknown>>(
        'SELECT * FROM orders ORDER BY daily_number',
      );

      await c.query(sql('20261030120000_menu_orders_notes'));

      const after = await c.query<Record<string, unknown>>(
        'SELECT * FROM orders ORDER BY daily_number',
      );
      const counts = await c.query<{ events: string; counter: number }>(
        `SELECT (SELECT count(*) FROM order_events) AS events,
                (SELECT last_number FROM order_day_counters) AS counter`,
      );
      return { before: before.rows, after: after.rows, counts: counts.rows[0] };
    });

    expect(result.after).toHaveLength(2);
    result.after.forEach((row, i) => {
      expect(row).toEqual({ ...result.before[i], kind: 'TEXT', items: null, notes: null });
    });
    expect(result.counts).toEqual({ events: '1', counter: 2 });
  });
});
