import { expect, test } from '@playwright/test';
import { clearOrders, loginOwner, pairKitchen, sendOrder } from './fixtures';

test.beforeEach(() => clearOrders());

test('@smoke owner sends an order and it appears on the kitchen without reload', async ({
  page,
  browser,
}) => {
  await loginOwner(page);
  const { kitchen, context } = await pairKitchen(browser, page);
  await expect(kitchen.getByText('No active orders')).toBeVisible();

  const text = '2x Chicken Tikka\n1x Garlic Naan\nچکن کڑاہی ۲ عدد\n<b>no onion</b>';
  const number = await sendOrder(page, text);
  expect(number).toBe('001');
  await expect(page.getByLabel('Order text')).toHaveValue('');

  const card = kitchen.getByRole('article', { name: 'Order 001' });
  await expect(card).toBeVisible({ timeout: 2_000 });
  // Text is identical, including line breaks; HTML is shown literally.
  await expect(card.locator('p.order-text')).toHaveText(text, { useInnerText: true });
  await expect(card.locator('b')).toHaveCount(0);
  await expect(card.getByRole('timer')).toHaveText(/^(20:00|19:5\d)$/);
  await expect(card.getByText('NEW')).toBeVisible();
  await context.close();
});

test('orders show oldest first and the count matches on both screens', async ({
  page,
  browser,
}) => {
  await loginOwner(page);
  const { kitchen, context } = await pairKitchen(browser, page);
  for (const item of ['first order', 'second order', 'third order']) await sendOrder(page, item);

  const cards = kitchen.getByRole('article');
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(0)).toHaveAccessibleName('Order 001');
  await expect(cards.nth(2)).toHaveAccessibleName('Order 003');
  await expect(kitchen.getByText(/^3\s*ACTIVE$/)).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Active (3)' })).toBeVisible();
  await context.close();
});

test('the kitchen view has no order controls (read-only, ADR-021)', async ({ page, browser }) => {
  await loginOwner(page);
  const { kitchen, context } = await pairKitchen(browser, page);
  await sendOrder(page, 'read-only check');
  await expect(kitchen.getByRole('article')).toHaveCount(1);
  await expect(kitchen.getByRole('button', { name: /complete|cancel/i })).toHaveCount(0);
  await context.close();
});
