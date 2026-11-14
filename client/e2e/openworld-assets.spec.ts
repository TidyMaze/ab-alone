import { expect, test, type Page } from '@playwright/test';
import { lowTierOnCi } from './modes';

lowTierOnCi();

// #1520 (docs/specs/openworld.md section 17): a page that opens in the Open world fetches none of the files that only the board needs, read from the
// network log; a wild fight asks for them, and its arena is drawn as ever.
const BOARD_FILE = /\/(spaceship-bay|arena|kit-[\w-]+|slab-[\w-]+)\.glb$/;
// The deck's maps (60 KB): the board's materials take them at the first board draw, not at the entry (#1603).
const DECK_FILE = /\/(deck-[\w-]+|crack-decal)\.ktx2$/;
type Hooks = { __openworldFixture: (f: object) => void; __openworldEnemies: () => [number, number][]; __frame: () => { dishes?: number; drawn: boolean } };

/** The model and texture files the page requests, by name. */
function models(page: Page): string[] {
  const names: string[] = [];
  page.on('request', (request) => /\.(glb|ktx2)$/.test(request.url()) && names.push(request.url().slice(request.url().lastIndexOf('/') + 1)));
  return names;
}

test('?openworld=7 fetches the world files and no file of the board, #1520', async ({ page }) => {
  const names = models(page);
  await page.goto('./?openworld=7');
  await expect(page.locator('body')).toHaveAttribute('data-openworld-at', '0,0');
  await page.waitForTimeout(1500); // the files a late request would add
  expect(names).toContain('openworld.glb');
  expect(names.filter((name) => BOARD_FILE.test(`/${name}`))).toEqual([]);
  expect(names.filter((name) => DECK_FILE.test(`/${name}`))).toEqual([]);
});

test('a wild fight fetches the files of the board, and the arena is drawn on the terrace, #1520', async ({ page }) => {
  const names = models(page);
  await page.goto('./?openworld=3&nodes=200');
  await expect(page.locator('body')).toHaveAttribute('data-openworld-at', '0,0');
  const [marble] = await page.evaluate(() => (window as unknown as Hooks).__openworldEnemies());
  await page.evaluate((hero) => (window as unknown as Hooks).__openworldFixture({ hero, troop: [] }), [marble![0] + 1, marble![1]]);
  await page.locator('#openworld-ask-fight').click(); // the wild marble asks first (#1662)
  await expect(page.getByRole('button', { name: 'Flee' })).toBeVisible();
  await expect.poll(() => names.filter((name) => BOARD_FILE.test(`/${name}`)).length).toBe(9);
  await expect.poll(() => names.filter((name) => DECK_FILE.test(`/${name}`))).toEqual(expect.arrayContaining(['deck-albedo.ktx2', 'deck-roughness.ktx2', 'crack-decal.ktx2']));
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'table-zero');
  await expect.poll(() => page.evaluate(() => (window as unknown as Hooks).__frame().dishes)).toBe(61); // the radius 4 board, every cell a dish
  await expect(page.locator('body')).not.toHaveAttribute('data-veil', 'on');
});

test('a page that does not open in the world fetches the files of the board at the load, as ever, #1520', async ({ page }) => {
  const names = models(page);
  await page.goto('./?bot=off');
  await expect(page.locator('body')).toHaveAttribute('data-bay', 'ready');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'table-zero');
  expect(names.filter((name) => BOARD_FILE.test(`/${name}`))).toHaveLength(9);
});
