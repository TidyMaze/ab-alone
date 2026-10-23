import { expect, test } from '@playwright/test';

test('textures are requested and the board still renders', async ({ page }) => {
  const loaded: string[] = [];
  page.on('response', (r) => r.url().includes('/assets/') && loaded.push(`${r.status()} ${r.url().split('/').pop()}`));
  await page.goto('/');
  await page.locator('canvas').waitFor();
  await expect(page.locator('#hud')).toContainText('Black to move');
  expect(loaded.sort()).toEqual([
    '200 backdrop.png',
    '200 deck-albedo.png',
    '200 deck-roughness.png',
    '200 marble-normal.png',
  ]);
});

test('falls back to the flat look when the textures fail to load', async ({ page }) => {
  await page.route('**/assets/*.png', (route) => route.abort());
  await page.goto('/');
  await page.locator('canvas').waitFor();
  await expect(page.locator('#hud')).toContainText('Black to move');
});
