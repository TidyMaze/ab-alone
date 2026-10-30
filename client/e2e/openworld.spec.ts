import { expect, test } from '@playwright/test';
import { openModes } from './modes';

// #962: the Open world mode, behind ?openworld=<seed>: the hero rolls over the generated world, an obstacle (here water or a
// tree on seed 7) stops it, and Escape leaves to the board.
test('the hero rolls over the Open world, an obstacle stops it, and Escape leaves, #965', async ({ page }) => {
  await page.goto('./?bot=off&openworld=7');
  await page.locator('canvas').waitFor();
  await openModes(page);
  await page.locator('#openworld').click();
  const at = () => page.evaluate(() => document.body.dataset.openworldAt);
  await expect.poll(at).toBe('0,0');
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowUp');
  await expect.poll(at).toBe('2,-3');
  await page.keyboard.press('ArrowUp'); // the cell ahead is blocked on this seed
  await expect.poll(at).toBe('2,-3');
  await page.keyboard.press('ArrowRight');
  await expect.poll(at).toBe('3,-3');
  await expect(page.locator('#openworld-hud')).toBeVisible();
  await expect(page.locator('#hud')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.locator('#hud')).toBeVisible();
  expect(await page.evaluate(() => document.body.dataset.openworld)).toBeUndefined();
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

// #976: the wheel zooms the Open world camera out to twice the distance and back, and the hero still rolls at the widest zoom.
test('the wheel zooms the Open world out and back, and the hero still rolls, #976', async ({ page }) => {
  await page.goto('./?bot=off&openworld=7');
  await page.locator('canvas').waitFor();
  await openModes(page);
  await page.locator('#openworld').click();
  const zoom = () => page.evaluate(() => document.body.dataset.openworldZoom);
  await expect.poll(zoom).toBe('1');
  const box = (await page.locator('canvas').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 2000);
  await expect.poll(zoom).toBe('2');
  await page.mouse.wheel(0, -2000);
  await expect.poll(zoom).toBe('1');
  await page.mouse.wheel(0, 2000);
  await expect.poll(zoom).toBe('2');
  await page.keyboard.press('ArrowUp');
  await expect.poll(() => page.evaluate(() => document.body.dataset.openworldAt)).toBe('1,-1');
});

test('the entry is not in the mode menu without the flag, #965', async ({ page }) => {
  await page.goto('./?bot=off');
  await page.locator('canvas').waitFor();
  await expect(page.locator('#openworld')).toBeHidden();
});
