import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const SERVER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * TEST_DATABASE_URL, refusing anything whose database name does not end in `_test`
 * (CLAUDE.md "Testing"; DATABASE.md §5 rule 5). This guard protects dev and production data.
 */
export function testDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL is not set (see .env.example).');
  const dbName = new URL(url).pathname.replace(/^\//, '');
  if (!dbName.endsWith('_test')) {
    throw new Error(`Refusing to use database "${dbName}" for tests: name must end in _test.`);
  }
  return url;
}

export async function withPgClient<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: testDatabaseUrl() });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

/** Runs the Prisma CLI against the test database. */
export function runPrisma(args: string[]): string {
  return execFileSync(process.execPath, [prismaCliPath(), ...args], {
    cwd: SERVER_DIR,
    env: { ...process.env, DATABASE_URL: testDatabaseUrl(), SHADOW_DATABASE_URL: '' },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function prismaCliPath(): string {
  return path.resolve(SERVER_DIR, '../../node_modules/prisma/build/index.js');
}

/**
 * Empties the guarded test database and applies all migrations from scratch.
 * Uses plain SQL instead of `prisma migrate reset` (never run destructive Prisma commands).
 */
export async function recreateTestSchema(): Promise<void> {
  await withPgClient(async (client) => {
    await client.query('DROP SCHEMA IF EXISTS public CASCADE');
    await client.query('CREATE SCHEMA public');
  });
  runPrisma(['migrate', 'deploy']);
}

const DATA_TABLES = [
  'order_events',
  'orders',
  'order_day_counters',
  'kitchen_pairing_codes',
  'sessions',
  'users',
];

/** Removes all rows between tests; the schema stays. */
export async function truncateAll(client?: pg.Client): Promise<void> {
  const sql = `TRUNCATE ${DATA_TABLES.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`;
  if (client) await client.query(sql);
  else await withPgClient((c) => c.query(sql));
}
