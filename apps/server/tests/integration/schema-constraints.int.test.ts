import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { testDatabaseUrl, truncateAll } from '../helpers/test-db';
import pgModule from 'pg';

// Hand-written CHECK constraints (DATABASE.md §2, migration 20261029120000_init).

let client: pg.Client;

beforeAll(async () => {
  client = new pgModule.Client({ connectionString: testDatabaseUrl() });
  await client.connect();
});
afterAll(async () => {
  await client.end();
});
beforeEach(async () => {
  await truncateAll(client);
});

interface PgError {
  code?: string;
  constraint?: string;
}

async function violation(sql: string, params: unknown[] = []): Promise<PgError> {
  try {
    await client.query(sql, params);
  } catch (error) {
    return error as PgError;
  }
  throw new Error(`Expected a constraint violation for: ${sql}`);
}

const CREATED = '2026-10-29T13:00:00.000Z';

async function insertOwner(username = 'owner'): Promise<string> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO users (username, password_hash) VALUES ($1, 'x') RETURNING id`,
    [username],
  );
  return result.rows[0]!.id;
}

function orderValues(overrides: Record<string, unknown> = {}) {
  const v = {
    business_date: '2026-10-29',
    daily_number: 1,
    idempotency_key: crypto.randomUUID(),
    text: '2x Tikka',
    prep_minutes: 20,
    status: 'ACTIVE',
    created_at: CREATED,
    deadline_at: '2026-10-29T13:20:00.000Z',
    completed_at: null as string | null,
    cancelled_at: null as string | null,
    version: 1,
    ...overrides,
  };
  return [
    v.business_date,
    v.daily_number,
    v.idempotency_key,
    v.text,
    v.prep_minutes,
    v.status,
    v.created_at,
    v.deadline_at,
    v.completed_at,
    v.cancelled_at,
    v.version,
  ];
}

const INSERT_ORDER = `INSERT INTO orders (business_date, daily_number, idempotency_key, request_hash, text,
  source, prep_minutes, status, created_at, deadline_at, completed_at, cancelled_at, updated_at, version)
  VALUES ($1, $2, $3, 'hash', $4, 'WHATSAPP', $5, $6, $7, $8, $9, $10, $7, $11) RETURNING id`;

describe('users constraints', () => {
  it('rejects uppercase usernames (lowercase and charset checks both cover it)', async () => {
    const error = await violation(
      `INSERT INTO users (username, password_hash) VALUES ('Owner', 'x')`,
    );
    expect(error.code).toBe('23514');
    expect(['users_username_lowercase_chk', 'users_username_charset_chk']).toContain(
      error.constraint,
    );
  });

  it.each([
    ['ab', 'users_username_length_chk'],
    ['a'.repeat(33), 'users_username_length_chk'],
    ['own er', 'users_username_charset_chk'],
  ])('rejects username %j', async (username, constraint) => {
    const error = await violation(`INSERT INTO users (username, password_hash) VALUES ($1, 'x')`, [
      username,
    ]);
    expect(error).toMatchObject({ code: '23514', constraint });
  });

  it('accepts a valid username and enforces uniqueness', async () => {
    await insertOwner('owner.91');
    const error = await violation(
      `INSERT INTO users (username, password_hash) VALUES ('owner.91', 'x')`,
    );
    expect(error.code).toBe('23505');
  });
});

describe('sessions constraints', () => {
  it('owner sessions need a user and no device label; kitchen sessions the opposite', async () => {
    const userId = await insertOwner();
    const insert = `INSERT INTO sessions (token_hash, role, user_id, device_label, last_seen_at, expires_at)
      VALUES ($1, $2, $3, $4, now(), now() + interval '1 day')`;
    await client.query(insert, ['t1', 'OWNER', userId, null]);
    await client.query(insert, ['t2', 'KITCHEN', null, 'Grill TV']);
    for (const params of [
      ['t3', 'OWNER', null, null],
      ['t4', 'OWNER', userId, 'TV'],
      ['t5', 'KITCHEN', userId, 'TV'],
      ['t6', 'KITCHEN', null, null],
    ]) {
      expect(await violation(insert, params)).toMatchObject({
        code: '23514',
        constraint: 'sessions_role_shape_chk',
      });
    }
    expect(await violation(insert, ['t7', 'KITCHEN', null, 'x'.repeat(41)])).toMatchObject({
      constraint: 'sessions_device_label_length_chk',
    });
  });
});

describe('order_day_counters constraints', () => {
  it('rejects a non-positive last number', async () => {
    const error = await violation(
      `INSERT INTO order_day_counters (business_date, last_number, updated_at) VALUES ('2026-10-29', 0, now())`,
    );
    expect(error).toMatchObject({ constraint: 'order_day_counters_last_number_positive_chk' });
  });
});

describe('orders constraints', () => {
  it('accepts a valid active order', async () => {
    await expect(client.query(INSERT_ORDER, orderValues())).resolves.toBeDefined();
  });

  it.each([
    ['empty text', { text: '' }, 'orders_text_length_chk'],
    ['5,001 characters', { text: 'a'.repeat(5001) }, 'orders_text_length_chk'],
    [
      'prep 21 minutes',
      { prep_minutes: 21, deadline_at: '2026-10-29T13:21:00.000Z' },
      'orders_prep_minutes_chk',
    ],
    [
      'deadline not created + prep',
      { deadline_at: '2026-10-29T13:21:00.000Z' },
      'orders_deadline_chk',
    ],
    ['deadline off by 1 ms', { deadline_at: '2026-10-29T13:20:00.001Z' }, 'orders_deadline_chk'],
    ['daily number 0', { daily_number: 0 }, 'orders_daily_number_positive_chk'],
    ['version 0', { version: 0 }, 'orders_version_positive_chk'],
    ['active with completed_at', { completed_at: CREATED }, 'orders_status_timestamps_chk'],
    ['completed without completed_at', { status: 'COMPLETED' }, 'orders_status_timestamps_chk'],
    ['cancelled without cancelled_at', { status: 'CANCELLED' }, 'orders_status_timestamps_chk'],
    [
      'completed and cancelled',
      { status: 'COMPLETED', completed_at: CREATED, cancelled_at: CREATED },
      'orders_status_timestamps_chk',
    ],
  ])('rejects %s', async (_name, overrides, constraint) => {
    expect(await violation(INSERT_ORDER, orderValues(overrides))).toMatchObject({
      code: '23514',
      constraint,
    });
  });

  it.each([15, 30])('accepts a %i-minute order (Q-08)', async (prep) => {
    await client.query(
      INSERT_ORDER,
      orderValues({
        prep_minutes: prep,
        deadline_at: new Date(Date.parse(CREATED) + prep * 60_000).toISOString(),
      }),
    );
  });

  it('rejects a 35-minute order', async () => {
    expect(
      await violation(
        INSERT_ORDER,
        orderValues({ prep_minutes: 35, deadline_at: '2026-10-29T13:35:00.000Z' }),
      ),
    ).toMatchObject({ code: '23514', constraint: 'orders_prep_minutes_chk' });
  });

  it('accepts 5,000 characters and a 25-minute order', async () => {
    await client.query(
      INSERT_ORDER,
      orderValues({
        text: 'a'.repeat(5000),
        prep_minutes: 25,
        deadline_at: '2026-10-29T13:25:00.000Z',
      }),
    );
  });

  it('enforces unique (business_date, daily_number) and unique idempotency key', async () => {
    const key = crypto.randomUUID();
    await client.query(INSERT_ORDER, orderValues({ idempotency_key: key }));
    expect(await violation(INSERT_ORDER, orderValues())).toMatchObject({
      code: '23505',
      constraint: 'orders_business_date_daily_number_key',
    });
    expect(
      await violation(INSERT_ORDER, orderValues({ daily_number: 2, idempotency_key: key })),
    ).toMatchObject({ code: '23505', constraint: 'orders_idempotency_key_key' });
    // The same number on another business date is fine.
    await client.query(INSERT_ORDER, orderValues({ business_date: '2026-10-30' }));
  });

  it('deleting an order removes its audit events (retention purge, ADR-024)', async () => {
    const result = await client.query<{ id: string }>(INSERT_ORDER, orderValues());
    const orderId = result.rows[0]!.id;
    await client.query(
      `INSERT INTO order_events (order_id, type, occurred_at) VALUES ($1, 'CREATED', now())`,
      [orderId],
    );
    await client.query('DELETE FROM orders WHERE id = $1', [orderId]);
    const left = await client.query('SELECT 1 FROM order_events WHERE order_id = $1', [orderId]);
    expect(left.rowCount).toBe(0);
  });
});

describe('menu order and notes constraints (migration 20261030120000_menu_orders_notes)', () => {
  const INSERT_KIND = `INSERT INTO orders (business_date, daily_number, idempotency_key, request_hash, text,
    source, prep_minutes, status, created_at, deadline_at, updated_at, kind, items, notes)
    VALUES ('2026-10-29', $1, $2, 'hash', 'x', 'WHATSAPP', 20, 'ACTIVE', $3,
            '2026-10-29T13:20:00.000Z', $3, $4, $5, $6)`;
  const LINE = { itemId: 'zinger-burger', quantity: 1 };
  const values = (kind: string, items: unknown, notes: string | null, n = 1) => [
    n,
    crypto.randomUUID(),
    CREATED,
    kind,
    items === null ? null : JSON.stringify(items),
    notes,
  ];

  it('defaults kind to TEXT for an insert that does not name the new columns', async () => {
    const { rows } = await client.query<{ kind: string; items: unknown; notes: unknown }>(
      INSERT_ORDER.replace('RETURNING id', 'RETURNING kind, items, notes'),
      orderValues(),
    );
    expect(rows[0]).toEqual({ kind: 'TEXT', items: null, notes: null });
  });

  it('accepts a menu order with lines and notes up to 500 characters', async () => {
    await client.query(INSERT_KIND, values('MENU', [LINE], 'a'.repeat(500)));
    await client.query(INSERT_KIND, values('TEXT', null, 'No onions', 2));
  });

  it.each([
    ['a text order with items', 'TEXT', [LINE], null, 'orders_items_shape_chk'],
    ['a menu order without items', 'MENU', null, null, 'orders_items_shape_chk'],
    ['a menu order whose items are not an array', 'MENU', LINE, null, 'orders_items_shape_chk'],
    ['a menu order with no lines', 'MENU', [], null, 'orders_items_shape_chk'],
    [
      'a menu order with 51 lines',
      'MENU',
      Array.from({ length: 51 }, () => LINE),
      null,
      'orders_items_shape_chk',
    ],
    ['empty notes', 'TEXT', null, '', 'orders_notes_length_chk'],
    ['501-character notes', 'TEXT', null, 'a'.repeat(501), 'orders_notes_length_chk'],
  ])('rejects %s', async (_name, kind, items, notes, constraint) => {
    expect(await violation(INSERT_KIND, values(kind, items, notes))).toMatchObject({
      code: '23514',
      constraint,
    });
  });
});
