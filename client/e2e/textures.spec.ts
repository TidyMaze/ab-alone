import { expect, test } from '@playwright/test';

test('textures are requested and the board still renders', async ({ page }) => {
  const loaded: string[] = [];
  const transcoder: string[] = [];
  page.on('response', (r) => {
    const file = r.url().split('/').pop()!;
    // KTX2Loader's transcoder comes from the app, not a CDN: node_modules in dev, a hashed asset in the build (#700).
    if (file.startsWith('basis_transcoder')) transcoder.push(`${r.status()} ${new URL(r.url()).origin} ${file.replace(/-[\w-]+\./, '.')}`);
    else if (r.url().includes('/assets/')) loaded.push(`${r.status()} ${file}`);
  });
  await page.goto('./?bot=on');
  await page.locator('canvas').waitFor();
  await expect(page.locator('#hud')).toContainText('White to move');
  await expect(page.locator('body')).toHaveAttribute('data-bay', 'ready'); // the room is complete: the bay loads after the page (#661)
  const { origin } = new URL(page.url());
  expect(transcoder.sort()).toEqual([`200 ${origin} basis_transcoder.js`, `200 ${origin} basis_transcoder.wasm`]);
  // Every texture ships as KTX2 (#700).
  expect(loaded.sort()).toEqual([
    '200 backdrop.ktx2',
    '200 bulkhead-albedo.ktx2',
    '200 bulkhead-displacement.ktx2',
    '200 bulkhead-normal.ktx2',
    '200 bulkhead-roughness.ktx2',
    '200 crack-decal.ktx2',
    '200 deck-albedo.ktx2',
    '200 deck-mess-normal.ktx2', // the cells' normal map of the Mess (#440)
    '200 deck-mess.ktx2', // the cells' texture of the Mess, the deck a page opens on (#401)
    '200 deck-pbr-albedo.ktx2', // the bay's deck, and the board's rim (#775)
    '200 deck-pbr-albedo.ktx2',
    '200 deck-pbr-displacement.ktx2',
    '200 deck-pbr-normal.ktx2',
    '200 deck-pbr-normal.ktx2',
    '200 deck-pbr-roughness.ktx2',
    '200 deck-pbr-roughness.ktx2',
    '200 deck-roughness.ktx2',
    '200 grate-albedo.ktx2',
    '200 grate-displacement.ktx2',
    '200 grate-normal.ktx2',
    '200 grate-roughness.ktx2',
    '200 plate-albedo.ktx2', // the board's plate (#772)
    '200 plate-normal.ktx2',
    '200 plate-roughness.ktx2',
    '200 shell-normal.ktx2',
    '200 spaceship-bay.glb',
  ]);
});

test('falls back to the flat look when the textures fail to load', async ({ page }) => {
  await page.route('**/assets/*.ktx2', (route) => route.abort());
  await page.goto('./?bot=on');
  await page.locator('canvas').waitFor();
  await expect(page.locator('#hud')).toContainText('White to move');
});
