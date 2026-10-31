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
  await page.goto('./?bot=on&room=today');
  await page.locator('canvas').waitFor();
  await expect(page.locator('#hud')).toContainText('White to move');
  await expect(page.locator('body')).toHaveAttribute('data-bay', 'ready'); // the room is complete: the bay loads after the page (#661)
  const { origin } = new URL(page.url());
  expect(transcoder.sort()).toEqual([`200 ${origin} basis_transcoder.js`, `200 ${origin} basis_transcoder.wasm`]);
  // Every texture ships as KTX2 (#700).
  expect(loaded.sort()).toEqual([
    '200 backdrop.ktx2',
    '200 board-albedo.ktx2', // the PBR board (#876)
    '200 board-metalness.ktx2',
    '200 board-normal.ktx2',
    '200 board-roughness.ktx2',
    '200 bulkhead-albedo.ktx2',
    '200 bulkhead-ao.ktx2',
    '200 bulkhead-displacement.ktx2',
    '200 bulkhead-normal.ktx2',
    '200 bulkhead-roughness.ktx2',
    '200 crack-decal.ktx2',
    '200 deck-albedo.ktx2',
    '200 deck-mess-normal.ktx2', // the cells' normal map of the Mess (#440)
    '200 deck-mess-roughness.ktx2',
    '200 deck-mess.ktx2', // the cells' texture of the Mess, the deck a page opens on (#401)
    '200 deck-pbr-albedo.ktx2', // the bay's deck, and the board's rim (#775), downloaded once
    '200 deck-pbr-ao.ktx2',
    '200 deck-pbr-displacement.ktx2',
    '200 deck-pbr-normal.ktx2',
    '200 deck-pbr-roughness.ktx2',
    '200 deck-roughness.ktx2',
    '200 grate-albedo.ktx2',
    '200 grate-displacement.ktx2',
    '200 grate-metalness.ktx2',
    '200 grate-normal.ktx2',
    '200 grate-roughness.ktx2',
    '200 plate-albedo.ktx2', // the board's plate (#772)
    '200 plate-normal.ktx2',
    '200 plate-roughness.ktx2',
    '200 skin-Leather027-albedo.ktx2', // the default shell skin, the other skins load when picked
    '200 skin-Leather027-normal.ktx2',
    '200 skin-Leather027-roughness.ktx2',
    '200 skin-Marble025-albedo.ktx2', // the default glass skin
    '200 skin-Marble025-normal.ktx2',
    '200 skin-Marble025-roughness.ktx2',
    '200 spaceship-bay.glb',
  ]);
});

// Bug #925: the skin maps are asked for with the first maps, not after them. The first map of the first wave is held until
// the six maps of the two default skins are asked for, or 3 s pass: a skin wave that waits for the first wave never asks.
test('the skin maps are asked for with the first wave, not after it (bug #925)', async ({ page }) => {
  const skinFiles = new Set<string>();
  let allSkinsAsked!: () => void;
  const asked = new Promise<void>((done) => (allSkinsAsked = done));
  await page.route(/\/assets\/.*skin-[^/]+\.ktx2$/, (route) => {
    skinFiles.add(route.request().url().split('/').pop()!);
    if (skinFiles.size === 6) allSkinsAsked();
    return route.continue();
  });
  let skinsAskedWhenWaveEnded = -1;
  await page.route('**/assets/deck-albedo.ktx2', async (route) => {
    await Promise.race([asked, new Promise((done) => setTimeout(done, 3000))]);
    skinsAskedWhenWaveEnded = skinFiles.size;
    return route.continue();
  });
  await page.goto('./?bot=on');
  await page.locator('canvas').waitFor();
  await expect(page.locator('body')).toHaveAttribute('data-bay', 'ready');
  expect(skinsAskedWhenWaveEnded).toBe(6);
});

test('falls back to the flat look when the textures fail to load', async ({ page }) => {
  await page.route('**/assets/*.ktx2', (route) => route.abort());
  await page.goto('./?bot=on');
  await page.locator('canvas').waitFor();
  await expect(page.locator('#hud')).toContainText('White to move');
});
