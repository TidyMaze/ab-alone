import { expect, test } from '@playwright/test';
import { openModes } from './modes';

// #962: the Open world mode, behind ?openworld=<seed>: the hero rolls over the generated world, an obstacle stops it, and
// Escape leaves to the board. The test does not name the blocked cell (a change of the terrain constants moves it, #1002): it
// walks right until a press moves nothing, at most 200 steps.
test('the hero rolls over the Open world, an obstacle stops it, and Escape leaves, #965', async ({ page }) => {
  await page.goto('./?bot=off&openworld=7');
  await page.locator('canvas').waitFor();
  await openModes(page);
  await page.locator('#openworld').click();
  const at = () => page.evaluate(() => document.body.dataset.openworldAt);
  await expect.poll(at).toBe('0,0');
  let before = '0,0';
  let stopped = false;
  for (let i = 0; i < 200 && !stopped; i++) {
    await page.keyboard.press('ArrowRight');
    const now = (await at())!;
    stopped = now === before;
    before = now;
  }
  expect(stopped, 'something blocks the way right within 200 steps').toBe(true);
  expect(before).not.toBe('0,0'); // it rolled before it was stopped
  await page.keyboard.press('ArrowRight'); // still blocked
  await expect.poll(at).toBe(before);
  await page.keyboard.press('ArrowLeft'); // the cell it came from is open
  await expect.poll(at).not.toBe(before);
  await expect(page.locator('#openworld-hud')).toBeVisible();
  await expect(page.locator('#hud')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.locator('#hud')).toBeVisible();
  expect(await page.evaluate(() => document.body.dataset.openworld)).toBeUndefined();
});

// #988: a step up onto a higher cell. On seed 7 the spawn row runs grass at height 3 to (3, 0), then (4, 0) is grass at
// height 4: four Right presses reach it, the cell changes and the page keeps running while the camera eases up (the ease
// itself is unit tested in openworldview.test.ts).
test('the hero steps up onto a higher cell of the Open world and the page keeps running, #988', async ({ page }) => {
  const errors: Error[] = [];
  page.on('pageerror', (error) => errors.push(error));
  await page.goto('./?bot=off&openworld=7');
  await page.locator('canvas').waitFor();
  await openModes(page);
  await page.locator('#openworld').click();
  const at = () => page.evaluate(() => document.body.dataset.openworldAt);
  await expect.poll(at).toBe('0,0');
  for (let i = 1; i <= 4; i++) {
    await page.keyboard.press('ArrowRight');
    await expect.poll(at).toBe(`${i},0`);
  }
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))); // the frames after the step
  expect(errors).toEqual([]);
});

// #966: enemy marbles stand on the map and the troop of 6 trails the hero, the first marble on the cell it just left.
test('enemy marbles are on the map and the troop follows the hero, #966', async ({ page }) => {
  await page.goto('./?bot=off&openworld=7');
  await page.locator('canvas').waitFor();
  await openModes(page);
  await page.locator('#openworld').click();
  const data = (key: 'openworldAt' | 'openworldTroop' | 'openworldEnemies') => page.evaluate((k) => document.body.dataset[k], key);
  await expect.poll(() => data('openworldAt')).toBe('0,0');
  expect(Number(await data('openworldEnemies'))).toBeGreaterThan(0);
  expect((await data('openworldTroop'))!.split(' ')).toHaveLength(6);
  await page.keyboard.press('ArrowUp');
  await expect.poll(() => data('openworldAt')).not.toBe('0,0');
  const before = await data('openworldAt');
  await page.keyboard.press('ArrowUp');
  await expect.poll(() => data('openworldAt')).not.toBe(before);
  expect((await data('openworldTroop'))!.split(' ')[0]).toBe(before);
});

// #977: a vertical and a horizontal arrow held together roll the hero on the diagonal. From (0, 0) Up rolls to (1, -1), the
// cell up-left of that is (1, -2), free on seed 7 (the path of the first test goes through it).
test('two held arrows roll the hero on the diagonal, #977', async ({ page }) => {
  await page.goto('./?bot=off&openworld=7');
  await page.locator('canvas').waitFor();
  await openModes(page);
  await page.locator('#openworld').click();
  const at = () => page.evaluate(() => document.body.dataset.openworldAt);
  await expect.poll(at).toBe('0,0');
  await page.keyboard.down('ArrowUp');
  await expect.poll(at).toBe('1,-1');
  await page.keyboard.down('ArrowLeft'); // Up and Left held: up-left
  await expect.poll(at).toBe('1,-2');
  await page.keyboard.up('ArrowLeft');
  await page.keyboard.up('ArrowUp');
});

// #976: the wheel zooms the Open world camera out far and back, and the hero still rolls from the far zoom.
test('the wheel zooms the Open world out far and back, and the hero still rolls, #976', async ({ page }) => {
  await page.goto('./?bot=off&openworld=7');
  await page.locator('canvas').waitFor();
  await openModes(page);
  await page.locator('#openworld').click();
  const zoom = async () => Number(await page.evaluate(() => document.body.dataset.openworldZoom));
  await expect.poll(zoom).toBe(1);
  const box = (await page.locator('canvas').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 2000);
  await expect.poll(zoom).toBeGreaterThan(2.5); // far out
  // still 3D: the ground, the props, the troop and the enemies are all drawn
  const drawn = await page.evaluate(() => JSON.parse(document.body.dataset.openworldDrawn!) as Record<string, number>);
  expect(drawn['terrain-grass']).toBeGreaterThan(0);
  expect(drawn['prop-tree']).toBeGreaterThan(0);
  expect(drawn.troop).toBe(6);
  expect(drawn.enemies).toBeGreaterThan(0);
  await page.mouse.wheel(0, -2000);
  await expect.poll(zoom).toBe(1);
  await page.mouse.wheel(0, 2000);
  await expect.poll(zoom).toBeGreaterThan(2.5);
  await page.keyboard.press('ArrowUp');
  await expect.poll(() => page.evaluate(() => document.body.dataset.openworldAt)).toBe('1,-1');
});

// #976: the loaded chunks cover the ground in view at every zoom, so the edge of the loaded area never shows: on a 32:9 screen
// at the widest zoom, the four edge strips of a screenshot have no pixel of the background colour (#0b1220).
test('the widest zoom on a 32:9 screen shows no black background at its edges, #976', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 540 });
  await page.goto('./?bot=off&openworld=7');
  await page.locator('canvas').waitFor();
  await openModes(page);
  await page.locator('#openworld').click();
  const box = (await page.locator('canvas').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 5000); // as far out as the screen allows
  await expect.poll(async () => Number(await page.evaluate(() => document.body.dataset.openworldZoom))).toBeGreaterThan(2.5);
  // a 32:9 screen stops before the 16:9 widest zoom (6): its reach would pass MAX_REACH further out
  expect(Number(await page.evaluate(() => document.body.dataset.openworldZoom))).toBeLessThan(6);
  const png = await page.screenshot();
  const background = await page.evaluate(async (base64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${base64}`;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const strip = (x: number, y: number, w: number, h: number): number => {
      const d = ctx.getImageData(x, y, w, h).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i]! - 11) <= 2 && Math.abs(d[i + 1]! - 18) <= 2 && Math.abs(d[i + 2]! - 32) <= 2) n++;
      return n;
    };
    const { width: w, height: h } = canvas;
    return { top: strip(0, 0, w, 6), bottom: strip(0, h - 6, w, 6), left: strip(0, 0, 6, h), right: strip(w - 6, 0, 6, h) };
  }, png.toString('base64'));
  expect(background).toEqual({ top: 0, bottom: 0, left: 0, right: 0 });
});

// #989: the props within 8 cells of the hero are drawn with their detailed models once those load, the low-poly ones beyond.
test('the props near the hero are drawn detailed, the ones beyond low-poly, #989', async ({ page }) => {
  await page.goto('./?bot=off&openworld=7');
  await page.locator('canvas').waitFor();
  await openModes(page);
  await page.locator('#openworld').click();
  const drawn = () => page.evaluate(() => JSON.parse(document.body.dataset.openworldDrawn!) as Record<string, number>);
  const DETAILED = ['prop-mountain-hi', 'prop-tree-hi', 'prop-boulder-hi', 'prop-wall-hi'];
  const LOW = ['prop-mountain', 'prop-tree', 'prop-boulder', 'prop-wall'];
  const sum = (counts: Record<string, number>, keys: string[]) => keys.reduce((total, k) => total + (counts[k] ?? 0), 0);
  await expect.poll(async () => sum(await drawn(), DETAILED)).toBeGreaterThan(0); // the detailed models arrive, then near the hero
  const counts = await drawn();
  expect(sum(counts, LOW)).toBeGreaterThan(0); // and the low-poly ones beyond
  expect(counts['prop-tree-hi']).toBeLessThanOrEqual(217);
});

// #1000: the entry is in the mode menu for everyone, and a click enters a world with a random seed.
test('the Open world is in the mode menu without the flag, and a click enters a random world, #1000', async ({ page }) => {
  await page.goto('./?bot=off');
  await page.locator('canvas').waitFor();
  await openModes(page);
  await expect(page.locator('#openworld')).toBeVisible();
  await page.locator('#openworld').click();
  await expect.poll(() => page.evaluate(() => document.body.dataset.openworld)).toMatch(/^\d+$/);
});

// #967: the troop pushes the enemy in front of it after a step. The fixture puts the hero on (0, 0) with two troop marbles
// behind it and one enemy on (2, 0): one Right press rolls the hero onto (1, 0), the line of three pushes the enemy on to
// (3, 0) and the hero along with it, to (2, 0). No animation yet: the marbles jump.
test('the troop pushes the enemy in front of it after a step, and the enemy moves on, #967', async ({ page }) => {
  await page.goto('./?bot=off&openworld=7');
  await page.locator('canvas').waitFor();
  await openModes(page);
  await page.locator('#openworld').click();
  await page.evaluate(() =>
    (window as unknown as { __openworldFixture: (f: object) => void }).__openworldFixture({
      hero: [0, 0],
      troop: [[-1, 0], [-2, 0]],
      enemies: [[2, 0]],
    }),
  );
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => page.evaluate(() => document.body.dataset.openworldPush)).toBe('1');
  expect(await page.evaluate(() => document.body.dataset.openworldAt)).toBe('2,0');
  expect(await page.evaluate(() => document.body.dataset.openworldTroop)).toBe('1,0 0,0 -2,0');
  expect(await page.evaluate(() => (window as unknown as { __openworldEnemies: () => number[][] }).__openworldEnemies())).toEqual([[3, 0]]);
  expect(await page.evaluate(() => document.body.dataset.openworldBeaten)).toBe('0');
});
