import { expect, test } from '@playwright/test';
import { clearOrders, loginOwner, OWNER, pairKitchen } from './fixtures';

test.beforeEach(() => clearOrders());

test('@smoke /owner without a session redirects to login; a wrong password is refused', async ({
  page,
}) => {
  await page.goto('/owner');
  await expect(page).toHaveURL(/\/owner\/login\?next=%2Fowner/);
  await page.getByLabel('Username').fill(OWNER.username);
  await page.getByLabel('Password').fill('not the password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toHaveText('Incorrect username or password.');
  await expect(page.getByLabel('Password')).toHaveValue('');
});

test('/kitchen without a session goes to pairing; a bad code shows an error', async ({ page }) => {
  await page.goto('/kitchen');
  await expect(page).toHaveURL(/\/kitchen\/pair/);
  await page.getByLabel('Pairing code').fill('ABCD-EFGH');
  await page.getByRole('button', { name: 'Connect screen' }).click();
  await expect(page.getByRole('alert')).toContainText('invalid or expired');
});

test('disconnecting a kitchen screen sends it back to the pairing page', async ({
  page,
  browser,
}) => {
  await loginOwner(page);
  const { kitchen, context } = await pairKitchen(browser, page, 'Screen to revoke');
  await page.getByRole('button', { name: 'Settings' }).click();
  const row = page.locator('li', { hasText: 'Screen to revoke' });
  await row.getByRole('button', { name: 'Disconnect' }).click();
  await expect(kitchen).toHaveURL(/\/kitchen\/pair/, { timeout: 10_000 });
  await context.close();
});

test('logout ends the owner session; /owner then asks to sign in again', async ({ page }) => {
  await loginOwner(page);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/owner\/login/);
  await page.goto('/owner');
  await expect(page).toHaveURL(/\/owner\/login/);
  await expect(page.getByLabel('Order text')).toHaveCount(0);
});
