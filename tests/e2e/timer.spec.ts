import { expect, test } from '@playwright/test';
import { clearOrders, insertBackdatedOrder, loginOwner, pairKitchen } from './fixtures';

// Backdated orders with real clocks (no fast-forward), docs/E2E_TESTING.md.
test.beforeEach(() => clearOrders());

test('timer phases: normal, warning, overdue, and a 25-minute order', async ({ page, browser }) => {
  await insertBackdatedOrder(1, 5); // 15:00 left → normal
  await insertBackdatedOrder(2, 16); // 4:00 left → warning
  await insertBackdatedOrder(3, 21); // 1:00 overdue
  await insertBackdatedOrder(4, 0, 25); // just created, 25 minutes
  await loginOwner(page);
  const { kitchen, context } = await pairKitchen(browser, page);

  const card = (n: string) => kitchen.getByRole('article', { name: `Order ${n}` });
  await expect(card('001')).toHaveAttribute('data-phase', 'normal');
  await expect(card('001').getByRole('timer')).toHaveText(/^1[45]:\d\d$/);
  await expect(card('002')).toHaveAttribute('data-phase', 'warning');
  await expect(card('002').getByRole('timer')).toHaveText(/^0[34]:\d\d$/);
  await expect(card('003')).toHaveAttribute('data-phase', 'overdue');
  await expect(card('003').getByRole('timer')).toHaveText(/^\+0[01]:\d\d$/);
  await expect(card('003').getByText('OVERDUE')).toBeVisible();
  await expect(card('004').getByRole('timer')).toHaveText(/^2[45]:\d\d$/);
  await context.close();
});

test('a card crosses into overdue live', async ({ page, browser }) => {
  await insertBackdatedOrder(1, 20 - 4 / 60); // 4 seconds left
  await loginOwner(page);
  const { kitchen, context } = await pairKitchen(browser, page);
  const card = kitchen.getByRole('article', { name: 'Order 001' });
  await expect(card).toHaveAttribute('data-phase', 'warning');
  await expect(card).toHaveAttribute('data-phase', 'overdue', { timeout: 8_000 });
  await context.close();
});

test('a wrong device clock does not change the timers', async ({ page, browser }) => {
  await insertBackdatedOrder(1, 5);
  await loginOwner(page);
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const skewed = await context.newPage();
  await skewed.clock.setSystemTime(new Date(Date.now() + 10 * 60_000)); // Date only, timers run
  // Owner view in a skewed context: sign in again there.
  await skewed.goto('/owner/login');
  await skewed.getByLabel('Username').fill('e2e-owner');
  await skewed.getByLabel('Password').fill('kitchen display e2e pass');
  await skewed.getByRole('button', { name: 'Sign in' }).click();
  await expect(skewed).toHaveURL(/\/owner$/);
  await skewed.goto('/kitchen');
  const timer = skewed.getByRole('article', { name: 'Order 001' }).getByRole('timer');
  await expect(timer).toHaveText(/^1[45]:\d\d$/); // still ~15:00, not ~05:00
  await expect(skewed.getByText(/Device clock is off by 10 min/)).toBeVisible();
  await context.close();
  void browser;
});
