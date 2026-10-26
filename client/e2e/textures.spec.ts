import { expect, test } from '@playwright/test';

test('textures are requested and the board still renders', async ({ page }) => {
  const loaded: string[] = [];
  page.on('response', (r) => r.url().includes('/assets/') && loaded.push(`${r.status()} ${r.url().split('/').pop()}`));
  await page.goto('./?bot=on');
  await page.locator('canvas').waitFor();
  await expect(page.locator('#hud')).toContainText('White to move');
  await expect(page.locator('body')).toHaveAttribute('data-bay', 'ready'); // the room is complete: the bay loads after the page (#661)
  expect(loaded.sort()).toEqual([
    '200 backdrop.png',
    '200 bulkhead-albedo.jpg',
    '200 bulkhead-displacement.png',
    '200 bulkhead-normal.png',
    '200 bulkhead-roughness.png',
    '200 crack-decal.png',
    '200 deck-albedo.png',
    '200 deck-mess-normal.png', // the cells' normal map of the Mess (#440)
    '200 deck-mess.png', // the cells' texture of the Mess, the deck a page opens on (#401)
    '200 deck-pbr-albedo.jpg',
    '200 deck-pbr-displacement.png',
    '200 deck-pbr-normal.png',
    '200 deck-pbr-roughness.png',
    '200 deck-roughness.png',
    '200 grate-albedo.jpg',
    '200 grate-displacement.png',
    '200 grate-normal.png',
    '200 grate-roughness.png',
    '200 shell-normal.png',
    '200 spaceship-bay.glb',
  ]);
});

test('falls back to the flat look when the textures fail to load', async ({ page }) => {
  await page.route('**/assets/*.png', (route) => route.abort());
  await page.goto('./?bot=on');
  await page.locator('canvas').waitFor();
  await expect(page.locator('#hud')).toContainText('White to move');
});
