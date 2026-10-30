import { expect, test } from '@playwright/test';
import { clearOrders, loginOwner, pairKitchen, sendOrder } from './fixtures';

test.beforeEach(() => clearOrders());

test('refreshing either screen loses nothing and timers keep counting from the deadline', async ({
  page,
  browser,
}) => {
  await loginOwner(page);
  const { kitchen, context } = await pairKitchen(browser, page);
  await sendOrder(page, 'survives refresh');
  const timer = kitchen.getByRole('article', { name: 'Order 001' }).getByRole('timer');
  await expect(timer).toBeVisible();
  await kitchen.waitForTimeout(2_200);
  await kitchen.reload();
  await page.reload();
  await expect(timer).toHaveText(/^19:5\d$/); // not reset to 20:00
  await expect(page.getByRole('tab', { name: 'Active (1)' })).toBeVisible();
  await context.close();
});

test('a kitchen that goes offline shows it, keeps its cards, and catches up when back', async ({
  page,
  browser,
}) => {
  await loginOwner(page);
  const { kitchen, context } = await pairKitchen(browser, page);
  await sendOrder(page, 'before the outage');
  await expect(kitchen.getByRole('article')).toHaveCount(1);

  await context.setOffline(true);
  await expect(kitchen.getByText('Offline', { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(kitchen.getByText(/showing last known orders/)).toBeVisible();
  await expect(kitchen.getByRole('article')).toHaveCount(1);

  await sendOrder(page, 'sent during the outage'); // missed by the kitchen socket
  await context.setOffline(false);
  await expect(kitchen.getByText('Live', { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(kitchen.getByRole('article', { name: 'Order 002' })).toBeVisible();
  await context.close();
});

test('a double-click on Send creates exactly one order', async ({ page }) => {
  await loginOwner(page);
  await page.getByLabel('Order text').fill('double click');
  await page.getByRole('button', { name: 'Send to Kitchen' }).dblclick();
  await expect(page.getByText('#001 sent', { exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Active (1)' })).toBeVisible();
});
