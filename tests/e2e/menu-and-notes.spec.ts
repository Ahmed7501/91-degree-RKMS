import { expect, test } from '@playwright/test';
import { clearOrders, loginOwner, pairKitchen, sendOrder } from './fixtures';

// ADR-027 (menu ordering, kitchen notes) and ADR-028 (kitchen alert settings).

test.beforeEach(() => clearOrders());

test('@smoke owner builds an order from the menu with notes; the kitchen shows lines and notes', async ({
  page,
  browser,
}) => {
  await loginOwner(page);
  const { kitchen, context } = await pairKitchen(browser, page);

  await page.getByRole('tab', { name: /^Menu/ }).click();
  await page.getByRole('tab', { name: /^Burgers/ }).click();
  // Scoped to the menu list: selected items also get + / − in the order summary.
  const zinger = page
    .getByRole('list', { name: 'Burgers' })
    .getByRole('button', { name: 'Add one Zinger Burger', exact: true });
  await zinger.click();
  await zinger.click();
  await page.getByLabel('Search the menu').fill('masala');
  await page
    .getByRole('list', { name: 'Search results' })
    .getByRole('button', { name: 'Add one Masala Fries, Large' })
    .click();
  await page.getByLabel('Search the menu').fill('');

  const summary = page.getByRole('region', { name: /order summary/i });
  await expect(summary).toContainText('(3 items)');
  await expect(summary).toContainText('Rs 1,120');

  await page.getByRole('textbox', { name: /kitchen notes/i }).fill('No onions\nSauce separate');
  await page.getByRole('button', { name: 'Send to Kitchen' }).click();
  await expect(page.getByText(/^#001 sent$/)).toBeVisible();
  await expect(summary).toContainText('(0 items)');
  await expect(page.getByRole('textbox', { name: /kitchen notes/i })).toHaveValue('');

  const card = kitchen.getByRole('article', { name: 'Order 001' });
  await expect(card).toBeVisible({ timeout: 2_000 });
  const lines = card.getByRole('list', { name: 'Items' }).getByRole('listitem');
  await expect(lines).toHaveText(['2×Zinger Burger', '1×Masala FriesLarge']);
  const notes = card.getByRole('region', { name: 'Kitchen notes' });
  await expect(notes).toContainText('KITCHEN NOTES');
  await expect(notes.locator('p.order-text')).toHaveText('No onions\nSauce separate', {
    useInnerText: true,
  });
  await expect(card).not.toContainText('Rs '); // no prices on the kitchen screen

  // Notes survive a kitchen reload (they are stored with the order).
  await kitchen.reload();
  await expect(
    kitchen
      .getByRole('article', { name: 'Order 001' })
      .getByRole('region', { name: 'Kitchen notes' }),
  ).toContainText('No onions');
  await context.close();
});

test('pasted/typed orders carry notes too, and the notes stay with the right order', async ({
  page,
  browser,
}) => {
  await loginOwner(page);
  const { kitchen, context } = await pairKitchen(browser, page);
  await page.getByRole('textbox', { name: /kitchen notes/i }).fill('Extra spicy');
  await sendOrder(page, '2x Chicken Tikka');
  await sendOrder(page, '1x Zinger');

  const first = kitchen.getByRole('article', { name: 'Order 001' });
  const second = kitchen.getByRole('article', { name: 'Order 002' });
  await expect(first.getByRole('region', { name: 'Kitchen notes' })).toContainText('Extra spicy');
  await expect(second).toBeVisible();
  await expect(second.getByRole('region', { name: 'Kitchen notes' })).toHaveCount(0);
  // The owner's active list shows the notes as well.
  await expect(page.getByRole('region', { name: 'Kitchen notes' })).toHaveCount(1);
  await context.close();
});

test('an unsent menu selection and typed text both survive a refresh and mode switches', async ({
  page,
}) => {
  await loginOwner(page);
  await page.getByLabel('Order text').fill('typed but not sent');
  await page.getByRole('tab', { name: /^Menu/ }).click();
  await page.getByRole('tab', { name: /^Rolls/ }).click();
  await page.getByRole('button', { name: 'Add one Shawarma Roll' }).click();
  await page.reload();
  await expect(page.getByRole('region', { name: /order summary/i })).toContainText('(1 item)');
  await page.getByRole('tab', { name: 'Paste / Type' }).click();
  await expect(page.getByLabel('Order text')).toHaveValue('typed but not sent');
});

test('kitchen sound settings: enable, adjust volume and test (ADR-028)', async ({
  page,
  browser,
}) => {
  await loginOwner(page);
  const { kitchen, context } = await pairKitchen(browser, page);
  await kitchen.getByRole('button', { name: /open sound settings/i }).click();
  const dialog = kitchen.getByRole('dialog', { name: 'Sound for new orders' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Turn sound on' }).click();
  await expect(dialog.getByRole('status')).toHaveText(/sound is on/i);
  await dialog.getByRole('slider', { name: /alert volume/i }).fill('50');
  await expect(dialog).toContainText('50%');
  await dialog.getByRole('button', { name: 'Test sound' }).click();
  await expect(dialog.getByRole('alert')).toHaveCount(0); // played, nothing blocked
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(
    kitchen.getByRole('button', { name: 'Sound on: open sound settings' }),
  ).toBeVisible();
  await context.close();
});
