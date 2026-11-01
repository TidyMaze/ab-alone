import { expect, test } from '@playwright/test';

// Issue #849: a sustained slow frame rate offers the low tier, once, never taken without a press. Adaptation is skipped
// under Playwright, so the hook __slowWindow feeds the slow windows (quality.ts SLOW_RUNS).
test('a sustained slow rate offers the low tier; Accept switches to it and a reload does not ask again', async ({ page }) => {
  await page.goto('./?bot=off&quality=high');
  await page.locator('canvas').waitFor();
  const offer = page.locator('#low-offer');
  await expect(offer).toBeHidden();
  await page.evaluate(() => {
    for (let i = 0; i < 4; i++) (window as any).__slowWindow(40);
  });
  await expect(offer).toBeVisible();
  await expect(page.locator('body')).toHaveAttribute('data-tier', 'high'); // nothing changed by itself
  await page.screenshot({ path: test.info().outputPath('offer.png') });
  await offer.getByRole('button', { name: 'Use low quality' }).click();
  await expect(offer).toBeHidden();
  await expect(page.locator('body')).toHaveAttribute('data-tier', 'low');

  await page.goto('./?bot=off');
  await page.locator('canvas').waitFor();
  await expect(page.locator('body')).toHaveAttribute('data-tier', 'low');
});

test('on a phone the offer fits the screen and leaves the dock free', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./?bot=off&quality=high');
  await page.locator('canvas').waitFor();
  await page.evaluate(() => {
    for (let i = 0; i < 4; i++) (window as any).__slowWindow(40);
  });
  const offer = page.locator('#low-offer');
  await expect(offer).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('offer-phone.png') });
  const box = (await offer.boundingBox())!;
  const dock = (await page.locator('#dock').boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(box.y + box.height).toBeLessThanOrEqual(dock.y);
  await offer.getByRole('button', { name: 'Dismiss' }).click();
  await expect(offer).toBeHidden();
});

test('Dismiss is remembered across a reload', async ({ page }) => {
  await page.goto('./?bot=off&quality=high');
  await page.locator('canvas').waitFor();
  await page.evaluate(() => {
    for (let i = 0; i < 4; i++) (window as any).__slowWindow(40);
  });
  await page.getByRole('button', { name: 'Dismiss' }).click();
  await expect(page.locator('#low-offer')).toBeHidden();
  await page.reload();
  await page.locator('canvas').waitFor();
  await page.evaluate(() => {
    for (let i = 0; i < 4; i++) (window as any).__slowWindow(40);
  });
  await page.waitForTimeout(300);
  await expect(page.locator('#low-offer')).toBeHidden();
});
