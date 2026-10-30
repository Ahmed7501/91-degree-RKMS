import { beforeAll, describe, expect, it } from 'vitest';
import { recreateTestSchema, runPrisma, testDatabaseUrl, withPgClient } from '../helpers/test-db';

// Fresh, empty rkds_test with every migration applied (DATABASE.md §5); other suites may have
// left rows behind, so this suite starts from scratch.
beforeAll(async () => {
  await recreateTestSchema();
}, 60_000);

describe('migrations', () => {
  it('refuses a database whose name does not end in _test', () => {
    const original = process.env.TEST_DATABASE_URL;
    process.env.TEST_DATABASE_URL = 'postgresql://rkds_app:x@127.0.0.1:55432/rkds_dev';
    try {
      expect(() => testDatabaseUrl()).toThrow(/must end in _test/);
    } finally {
      process.env.TEST_DATABASE_URL = original;
    }
  });

  it('applies every migration to an empty database', async () => {
    const rows = await withPgClient(async (c) => {
      const result = await c.query<{ migration_name: string; finished_at: Date | null }>(
        'SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY migration_name',
      );
      return result.rows;
    });
    expect(rows.map((r) => r.migration_name)).toContain('20261029120000_init');
    expect(rows.every((r) => r.finished_at !== null)).toBe(true);
  });

  it('creates exactly the documented tables', async () => {
    const tables = await withPgClient(async (c) => {
      const result = await c.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`,
      );
      return result.rows.map((r) => r.table_name);
    });
    expect(tables).toEqual([
      '_prisma_migrations',
      'kitchen_pairing_codes',
      'order_day_counters',
      'order_events',
      'orders',
      'sessions',
      'users',
    ]);
  });

  it('leaves every data table empty: no seed data, no default user (NFR-11)', async () => {
    const counts = await withPgClient(async (c) => {
      const result = await c.query<{ n: string }>(
        `SELECT (SELECT count(*) FROM users) + (SELECT count(*) FROM sessions)
              + (SELECT count(*) FROM orders) + (SELECT count(*) FROM order_events)
              + (SELECT count(*) FROM order_day_counters)
              + (SELECT count(*) FROM kitchen_pairing_codes) AS n`,
      );
      return Number(result.rows[0]?.n);
    });
    expect(counts).toBe(0);
  });

  it('connects as a non-superuser that owns the database (ADR-022)', async () => {
    const role = await withPgClient(async (c) => {
      const result = await c.query<{
        rolname: string;
        rolsuper: boolean;
        rolcreatedb: boolean;
        rolcreaterole: boolean;
        owner: string;
      }>(
        `SELECT r.rolname, r.rolsuper, r.rolcreatedb, r.rolcreaterole,
                pg_get_userbyid(d.datdba) AS owner
         FROM pg_roles r, pg_database d
         WHERE r.rolname = current_user AND d.datname = current_database()`,
      );
      return result.rows[0];
    });
    expect(role).toEqual({
      rolname: 'rkds_app',
      rolsuper: false,
      rolcreatedb: false,
      rolcreaterole: false,
      owner: 'rkds_app',
    });
  });

  it('has no drift between the migrations and schema.prisma (G9)', () => {
    // Exit code 0 = no difference; 2 = drift (execFileSync throws on non-zero).
    expect(() =>
      runPrisma([
        'migrate',
        'diff',
        '--from-config-datasource',
        '--to-schema',
        '../../database/schema.prisma',
        '--exit-code',
      ]),
    ).not.toThrow();
  });
});
