import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import pg from 'pg';

export const OWNER = { username: 'e2e-owner', password: 'kitchen display e2e pass' };

/** Direct access to rkds_test (guarded) for cleanup and backdated orders (timer specs). */
export async function withDb<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
  try {
    process.loadEnvFile('.env');
  } catch {
    // CI environment.
  }
  const url = process.env.TEST_DATABASE_URL;
  if (!url || !new URL(url).pathname.endsWith('_test'))
    throw new Error('E2E needs a _test database');
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

/** Removes every order between specs (users and sessions stay). */
export function clearOrders(): Promise<void> {
  // Against the prod-like Docker stack the database is not published: truncate via `compose exec`.
  const compose = process.env.E2E_COMPOSE_ARGS;
  if (compose) {
    execFileSync('docker', [
      'compose',
      ...compose.split(' '),
      'exec',
      '-T',
      'db',
      'sh',
      '-c',
      'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "TRUNCATE order_events, orders, order_day_counters RESTART IDENTITY CASCADE"',
    ]);
    return Promise.resolve();
  }
  return withDb(async (c) => {
    await c.query('TRUNCATE order_events, orders, order_day_counters RESTART IDENTITY CASCADE');
  });
}

/** Inserts an ACTIVE order created `minutesAgo` before now (real clocks, no fast-forward). */
export function insertBackdatedOrder(
  number: number,
  minutesAgo: number,
  prepMinutes: 15 | 20 | 25 | 30 = 20,
) {
  return withDb(async (c) => {
    const owner = await c.query<{ id: string }>('SELECT id FROM users LIMIT 1');
    await c.query(
      `WITH t AS (SELECT date_trunc('milliseconds', now() - make_interval(secs => $2::double precision * 60)) AS created)
       INSERT INTO orders (business_date, daily_number, idempotency_key, request_hash, text, source,
         prep_minutes, status, created_at, deadline_at, updated_at, created_by_user_id)
       SELECT (now() AT TIME ZONE 'Asia/Karachi' - interval '6 hours')::date, $1::int, gen_random_uuid(), 'h',
         'Backdated order ' || $1::text, 'PHONE', $3::int, 'ACTIVE', t.created,
         t.created + make_interval(mins => $3::int), t.created, $4
       FROM t`,
      [number, minutesAgo, prepMinutes, owner.rows[0]!.id],
    );
  });
}

export async function loginOwner(page: Page): Promise<void> {
  await page.goto('/owner/login');
  await page.getByLabel('Username').fill(OWNER.username);
  await page.getByLabel('Password').fill(OWNER.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/owner$/);
  await expect(page.getByText('Live', { exact: true })).toBeVisible();
}

/** Owner issues a pairing code; a new browser context pairs as a kitchen screen. */
export async function pairKitchen(
  browser: Browser,
  owner: Page,
  label = 'E2E Kitchen TV',
  viewport = { width: 1920, height: 1080 },
): Promise<{ kitchen: Page; context: BrowserContext }> {
  await owner.getByRole('button', { name: 'Settings' }).click();
  await owner.getByLabel('Screen name').fill(label);
  await owner.getByRole('button', { name: 'Get pairing code' }).click();
  const code = (await owner.locator('p.font-display.text-5xl').textContent())?.trim() ?? '';
  expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  await owner.getByRole('button', { name: 'Close settings' }).click();

  const context = await browser.newContext({ viewport, timezoneId: 'Asia/Karachi' });
  const kitchen = await context.newPage();
  await kitchen.goto('/kitchen');
  await expect(kitchen).toHaveURL(/\/kitchen\/pair/);
  await kitchen.getByLabel('Pairing code').fill(code);
  await kitchen.getByRole('button', { name: 'Connect screen' }).click();
  await expect(kitchen).toHaveURL(/\/kitchen$/);
  await expect(kitchen.getByText('Live', { exact: true })).toBeVisible();
  return { kitchen, context };
}

/** Types an order into the composer and sends it; returns the display number shown. */
export async function sendOrder(owner: Page, text: string): Promise<string> {
  await owner.getByLabel('Order text').fill(text);
  await owner.getByRole('button', { name: 'Send to Kitchen' }).click();
  const confirmation = owner.getByText(/^#\d{3,} sent$/);
  await expect(confirmation).toBeVisible();
  return ((await confirmation.textContent()) ?? '').replace(/^#| sent$/g, '');
}
