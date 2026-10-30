import { expect, test } from '@playwright/test';
import { clearOrders, loginOwner, pairKitchen } from './fixtures';

// Owner decision Q-02: Paste fills the box, the owner reviews, Send is a separate click.
test.beforeEach(() => clearOrders());

test('Paste fills the textarea without sending; the edited text is what reaches the kitchen', async ({
  page,
  browser,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await loginOwner(page);
  const { kitchen, context: kitchenContext } = await pairKitchen(browser, page);

  await page.evaluate(() => navigator.clipboard.writeText('1x Zinger Burger\n1x Fries'));
  await page.getByRole('button', { name: 'Paste' }).click();
  await expect(page.getByLabel('Order text')).toHaveValue('1x Zinger Burger\n1x Fries');

  // Nothing was sent by pasting.
  await page.waitForTimeout(800);
  await expect(kitchen.getByText('No active orders')).toBeVisible();

  await page.getByLabel('Order text').press('End');
  await page.getByLabel('Order text').pressSequentially('\nno mayo');
  await page.getByRole('button', { name: 'Send to Kitchen' }).click();
  const card = kitchen.getByRole('article', { name: 'Order 001' });
  await expect(card.locator('p.order-text')).toHaveText('1x Zinger Burger\n1x Fries\nno mayo', {
    useInnerText: true,
  });
  await kitchenContext.close();
});

test('Paste over existing text can be undone', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await loginOwner(page);
  await page.getByLabel('Order text').fill('typed by hand');
  await page.evaluate(() => navigator.clipboard.writeText('from WhatsApp'));
  await page.getByRole('button', { name: 'Paste' }).click();
  await expect(page.getByLabel('Order text')).toHaveValue('from WhatsApp');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByLabel('Order text')).toHaveValue('typed by hand');
});

test('clipboard denied: the textarea is focused with a paste hint and nothing is sent', async ({
  page,
}) => {
  await loginOwner(page);
  await page.evaluate(() => {
    Object.defineProperty(navigator.clipboard, 'readText', {
      value: () => Promise.reject(new DOMException('denied', 'NotAllowedError')),
    });
  });
  await page.getByRole('button', { name: 'Paste' }).click();
  await expect(page.getByText(/Press Ctrl\+V/)).toBeVisible();
  await expect(page.getByLabel('Order text')).toBeFocused();
  await expect(page.getByRole('button', { name: 'Send to Kitchen' })).toBeDisabled();
});
