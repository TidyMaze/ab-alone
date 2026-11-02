import { expect, test } from '@playwright/test';

test('textures are requested and the board still renders', async ({ page }) => {
  const loaded: string[] = [];
  const transcoder: string[] = [];
  page.on('response', (r) => {
    const file = r.url().split('/').pop()!;
    // KTX2Loader's transcoder comes from the app, not a CDN: node_modules in dev, a hashed asset in the build (#700).
    if (file.startsWith('basis_transcoder')) transcoder.push(`${r.status()} ${new URL(r.url()).origin} ${file.replace(/-[\w-]+\./, '.')}`);
    // The build's own files (page, bot worker, engine) are not textures; any other file under /assets/ is.
    else if (r.url().includes('/assets/') && !/^(index|bot\.worker|abalone_wasm_bg)-[\w-]+\.(js|css|wasm)$/.test(file)) loaded.push(`${r.status()} ${file}`);
  });
  await page.goto('./?bot=on');
  await page.locator('canvas').waitFor();
  await expect(page.locator('#hud')).toContainText('White to move');
  await expect(page.locator('body')).toHaveAttribute('data-bay', 'ready'); // the room is complete: the bay loads after the page (#661)
  const { origin } = new URL(page.url());
  expect(transcoder.sort()).toEqual([`200 ${origin} basis_transcoder.js`, `200 ${origin} basis_transcoder.wasm`]);
  // Every texture ships as KTX2 (#700). The room's board, plate, backdrop, default skin, bay, bulkhead and grate maps are not asked for on the terrace (#1370).
  expect(loaded.sort()).toEqual([
    '200 arena.glb', // the terrace (#1314)
    '200 crack-decal.ktx2', // a cracked cell and a breached arena cell draw it on the terrace (#1370)
    '200 deck-albedo.ktx2',
    '200 deck-mess-normal.ktx2', // the cells' normal map of the Mess (#440)
    '200 deck-mess-roughness.ktx2',
    '200 deck-mess.ktx2', // the cells' texture of the Mess, the deck a page opens on (#401): the discs wear them when the arena fails (#1374)
    '200 deck-roughness.ktx2',
    '200 kit-arena.glb', // the terrace's marks and pedestal (#1314)
    '200 kit-boss.glb', // the bosses' props (#1374)
    '200 kit-ring-hint.glb', // the terrace's hint ring (#1364)
    '200 slab-ballast.glb', // the Ballast Mind's board (#1374)
    '200 slab-dual.glb', // the Dual Room's board (#1374)
    '200 slab-hub.glb', // the hub's deck (#1374)
    '200 slab-royale.glb', // the Battle royale's board (#1374)
    '200 spaceship-bay.glb',
  ]);
});

// Bug #925: the skin maps are asked for with the first maps, not after them. The room's default skins (#1370): `?scene=room`. The first map of the first wave is held until
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
  await page.goto('./?bot=on&scene=room');
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
