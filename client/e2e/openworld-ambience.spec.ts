import { expect, test, type Page } from '@playwright/test';
import { openModes } from './modes';

// #1104: each Open world biome has its own ambience: leaves in the forest, snow in the tundra, a shimmer of the sand in the desert,
// nothing in the meadow. Seed 1 has a cell of each (found with `world_chunk`). The page marks what is drawn (`data-openworld-particles`,
// `data-openworld-motion`, webdriver pages only).
const CELL = { forest: [-58, 6], tundra: [-10, 38], desert: [-41, 23], meadow: [-42, 23] } as const;
type Biome = keyof typeof CELL;

async function enter(page: Page, query = ''): Promise<void> {
  await page.setViewportSize({ width: 480, height: 270 }); // software WebGL: a frame costs by its pixels
  await page.goto(`./?bot=off&openworld=1${query}`);
  await page.locator('canvas').waitFor();
  await openModes(page);
  await page.locator('#openworld').click();
  await expect.poll(() => page.evaluate(() => document.body.dataset.openworldAt)).toBe('0,0');
}
async function stand(page: Page, biome: Biome): Promise<void> {
  const [q, r] = CELL[biome];
  await page.evaluate((hero) => (window as unknown as { __openworldFixture: (f: object) => void }).__openworldFixture({ hero, troop: [], enemies: [] }), [q, r]);
  await expect.poll(() => page.evaluate(() => document.body.dataset.openworldAt)).toBe(`${q},${r}`);
}
const flakes = (page: Page) => page.evaluate(() => Number(document.body.dataset.openworldParticles ?? 0));
const moves = (page: Page) => page.evaluate(() => document.body.dataset.openworldMotion ?? '');

test('the forest drifts leaves, the tundra more snow, the desert shimmers and the meadow is still, #1104', async ({ page }) => {
  await enter(page);
  await stand(page, 'forest');
  await expect.poll(() => flakes(page)).toBeGreaterThan(2);
  const leaves = await flakes(page);
  expect(leaves).toBeLessThanOrEqual(9);
  await stand(page, 'tundra');
  await expect.poll(() => flakes(page), { timeout: 8000 }).toBeGreaterThan(leaves); // the leaves finish their fall, then 16 flakes
  expect(await flakes(page)).toBeLessThanOrEqual(24);
  await stand(page, 'desert');
  await expect.poll(() => moves(page)).toContain('shimmer');
  await stand(page, 'meadow');
  await expect.poll(() => moves(page)).not.toContain('shimmer');
  await expect.poll(() => flakes(page), { timeout: 8000 }).toBe(0);
});

test('nothing drifts or shimmers on the low tier, #1104', async ({ page }) => {
  await enter(page, '&quality=low');
  await expect.poll(() => page.evaluate(() => document.body.dataset.tier)).toBe('low');
  await stand(page, 'forest');
  await page.waitForTimeout(800);
  expect(await flakes(page)).toBe(0);
  await stand(page, 'desert');
  await page.waitForTimeout(500);
  expect(await moves(page)).toBe('');
});
