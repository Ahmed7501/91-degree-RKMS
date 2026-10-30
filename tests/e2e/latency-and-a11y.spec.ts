import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { clearOrders, insertBackdatedOrder, loginOwner, pairKitchen } from './fixtures';

test.beforeEach(() => clearOrders());

test('latency: Send → kitchen card, 20 orders (NFR-02, reported)', async ({ page, browser }) => {
  await loginOwner(page);
  const { kitchen, context } = await pairKitchen(browser, page);
  const samples: number[] = [];
  for (let i = 1; i <= 20; i += 1) {
    const display = String(i).padStart(3, '0');
    await page.getByLabel('Order text').fill(`latency ${i}`);
    const start = Date.now();
    await page.getByRole('button', { name: 'Send to Kitchen' }).click();
    await kitchen.getByRole('article', { name: `Order ${display}` }).waitFor();
    samples.push(Date.now() - start);
    await expect(page.getByText(`#${display} sent`, { exact: true })).toBeVisible();
  }
  samples.sort((a, b) => a - b);
  const median = samples[Math.floor(samples.length / 2)]!;
  const p95 = samples[Math.ceil(samples.length * 0.95) - 1]!;
  console.log(`LATENCY ms: median=${median} p95=${p95} min=${samples[0]} max=${samples.at(-1)}`);
  expect(p95).toBeLessThan(1_000);
  await context.close();
});

test('accessibility: no serious axe violations on login, owner and kitchen', async ({
  page,
  browser,
}) => {
  const serious = async (p: typeof page) =>
    (
      await new AxeBuilder({ page: p })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze()
    ).violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => `${v.id}: ${v.nodes.length} node(s)`);

  await page.goto('/owner/login');
  expect(await serious(page)).toEqual([]);
  await loginOwner(page);
  expect(await serious(page)).toEqual([]);
  await insertBackdatedOrder(1, 3);
  await insertBackdatedOrder(2, 17);
  const { kitchen, context } = await pairKitchen(browser, page);
  await expect(kitchen.getByRole('article')).toHaveCount(2);
  expect(await serious(kitchen)).toEqual([]);
  await context.close();
});

test('screenshots: kitchen at 1920×1080 fits at least 8 cards; owner on desktop and phone', async ({
  page,
  browser,
}) => {
  mkdirSync('test-results/screens', { recursive: true });
  const texts = [
    [3, '2x Chicken Tikka\n1x Garlic Naan\nRaita'],
    [6, '1x Zinger Burger\n1x Fries (large)'],
    [9, 'چکن کڑاہی (Serves 2-3)\n4x Roghni Naan'],
    [12, '1x 91 Pizza (Medium)\nextra cheese'],
    [15, 'Deal 7\nChicken tikka + Puri Paratha'],
    [17, '2x Seekh Kabab\n1x Chicken Biryani'],
    [19, '1x Dry Chicken Chilli with Fried Rice'],
    [22, '3x Shawarma Roll\n2x Drinks 500ml'],
    [1, '1x Kunafa (Medium)'],
  ] as const;
  let n = 1;
  for (const [minutesAgo] of texts) await insertBackdatedOrder(n++, minutesAgo);
  await loginOwner(page);
  const { kitchen, context } = await pairKitchen(browser, page, 'Screenshot TV');
  await expect(kitchen.getByRole('article')).toHaveCount(texts.length);
  await kitchen.waitForTimeout(500);
  const fullyVisible = await kitchen
    .getByRole('article')
    .evaluateAll(
      (cards) => cards.filter((c) => c.getBoundingClientRect().bottom <= window.innerHeight).length,
    );
  console.log(
    `KITCHEN 1920x1080: ${fullyVisible} of ${texts.length} cards fully visible without scrolling`,
  );
  expect(fullyVisible).toBeGreaterThanOrEqual(8);
  await kitchen.screenshot({ path: 'test-results/screens/kitchen-1920x1080.png' });
  await page.screenshot({ path: 'test-results/screens/owner-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/screens/owner-phone.png', fullPage: true });
  await context.close();
});
