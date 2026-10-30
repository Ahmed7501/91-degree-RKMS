import { expect, test } from '@playwright/test';
import { clearOrders, loginOwner, pairKitchen, sendOrder } from './fixtures';

test.beforeEach(() => clearOrders());

test('@smoke complete needs two taps; the card leaves the kitchen; history shows COMPLETED', async ({
  page,
  browser,
}) => {
  await loginOwner(page);
  const { kitchen, context } = await pairKitchen(browser, page);
  await sendOrder(page, 'complete me');
  await expect(kitchen.getByRole('article', { name: 'Order 001' })).toBeVisible();

  await page.getByRole('button', { name: 'Complete order 001' }).click();
  await expect(page.getByRole('button', { name: 'Confirm complete order 001' })).toBeVisible();
  await page.getByRole('button', { name: 'Confirm complete order 001' }).click();

  await expect(kitchen.getByRole('article', { name: 'Order 001' })).toHaveCount(0);
  await expect(kitchen.getByText('No active orders')).toBeVisible();
  await page.getByRole('tab', { name: 'History' }).click();
  await expect(page.getByRole('listitem').getByText('Completed', { exact: true })).toBeVisible();
  await context.close();
});

test('a single tap on Complete expires after 3 s without changing anything', async ({ page }) => {
  await loginOwner(page);
  await sendOrder(page, 'not yet');
  await page.getByRole('button', { name: 'Complete order 001' }).click();
  await expect(page.getByRole('button', { name: 'Complete order 001' })).toBeVisible({
    timeout: 5_000,
  });
  await expect(page.getByRole('tab', { name: 'Active (1)' })).toBeVisible();
});

test('cancel asks first: "Keep order" keeps it, "Cancel order" removes it', async ({
  page,
  browser,
}) => {
  await loginOwner(page);
  const { kitchen, context } = await pairKitchen(browser, page);
  await sendOrder(page, 'maybe cancel');

  await page.getByRole('button', { name: 'Cancel order 001' }).click();
  const dialog = page.getByRole('dialog', { name: 'Cancel order #001?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Keep order' }).click();
  await expect(kitchen.getByRole('article', { name: 'Order 001' })).toBeVisible();

  await page.getByRole('button', { name: 'Cancel order 001' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel order' }).click();
  await expect(kitchen.getByRole('article', { name: 'Order 001' })).toHaveCount(0);
  await page.getByRole('tab', { name: 'History' }).click();
  await expect(page.getByRole('listitem').getByText('Cancelled', { exact: true })).toBeVisible();
  await context.close();
});

test('history finds an order by number for today', async ({ page }) => {
  await loginOwner(page);
  await sendOrder(page, 'one');
  await sendOrder(page, 'two');
  await page.getByRole('tab', { name: 'History' }).click();
  await page.getByLabel('Order #').fill('2');
  await expect(page.locator('li', { hasText: '#002' })).toBeVisible();
  await expect(page.locator('li', { hasText: '#001' })).toHaveCount(0);
});
