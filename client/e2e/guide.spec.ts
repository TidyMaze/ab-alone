import { expect, test, type Page } from '@playwright/test';

// The first-launch guide (#1293): `?guide` makes the automated browser a player's first launch (the other specs boot
// without it on a fresh profile, so no guide covers them).
const title = (page: Page) => page.locator('#guide-title');
const controls = (page: Page, kind: string) => page.locator(`#guide-text [data-controls="${kind}"]`);

test('a first launch shows the guide; skipped, it stays shut after a reload and opens again from the settings', async ({ page }) => {
  await page.goto('./?bot=off&guide');
  await expect(page.getByRole('dialog', { name: 'Push them into the void' })).toBeVisible();
  await expect(page.locator('#guide-art svg')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeFocused();
  for (const name of ['Move', 'Push', 'Out-number them', 'Controls']) {
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(title(page)).toHaveText(name);
  }
  await expect(controls(page, 'mouse')).toBeVisible(); // a desktop: the mouse and keys
  await expect(controls(page, 'touch')).toBeHidden();
  await page.evaluate(() => (document.body.dataset.pad = '')); // as the first press of a pad does
  await expect(controls(page, 'pad')).toBeVisible();
  await expect(controls(page, 'mouse')).toBeHidden();
  await page.getByRole('button', { name: 'Skip', exact: true }).click();
  await expect(page.locator('#guide')).toBeHidden();

  await page.reload();
  await expect(page.locator('#settings')).toBeEnabled();
  await expect(page.locator('#guide')).toBeHidden();
  await page.locator('#settings').click();
  await page.locator('#setting-guide').click();
  await expect(title(page)).toHaveText('Push them into the void');
  await expect(page.locator('#settings-menu')).toBeHidden();
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true });

  test('the guide fits the screen and names the touch controls', async ({ page }) => {
    await page.goto('./?bot=off&guide');
    const card = page.locator('#guide .card');
    await expect(card).toBeVisible();
    const box = (await card.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(16);
    expect(box.x + box.width).toBeLessThanOrEqual(360 - 16);
    expect(box.y + box.height).toBeLessThanOrEqual(780);
    for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Next', exact: true }).tap();
    await expect(controls(page, 'touch')).toBeVisible();
    await expect(controls(page, 'mouse')).toBeHidden();
    await page.getByRole('button', { name: 'Play', exact: true }).tap();
    await expect(page.locator('#guide')).toBeHidden();
  });
});
