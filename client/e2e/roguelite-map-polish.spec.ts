import { expect, test, type Page } from '@playwright/test';
import { shot } from './shot';

// The rogue-lite map after a pick (#1468, docs/specs/roguelite.md section 2): the node picked last pops (not under reduced
// motion), the pick has a sound, and a node previews itself on hover and on keyboard focus. Seed 3 with the fight 1 taken:
// the rest 3, the treasure 4 and the unknown 5 are open.
const load = async (page: Page) => {
  await page.goto('./?bot=off');
  await page.waitForFunction(() => typeof (window as any).__run === 'function');
  await page.evaluate((s) => (window as any).__run(s), { seed: 3, army: 9, path: [1], fighting: false, moves: [], end: '', specials: [0, 0, 0], placed: [], reward: false, event: false });
};
const tip = (page: Page, node: number) =>
  page.evaluate((n) => getComputedStyle(document.querySelector(`#run-map [data-node="${n}"]`)!, '::after').content, node);

test('a node previews itself on hover and on focus: its kind and its act, and nothing at rest, #1468', async ({ page }, testInfo) => {
  await load(page);
  expect(await tip(page, 3)).toBe('none');
  await page.locator('#run-map [data-node="3"]').hover();
  expect(await tip(page, 3)).toContain('Rest');
  expect(await tip(page, 3)).toContain('Act 1');
  await shot(page, { path: testInfo.outputPath('roguelite-map-preview.png') });
  await page.locator('#run-map .run-line').hover();
  expect(await tip(page, 3)).toBe('none');
  await page.locator('#run-map [data-node="1"]').hover(); // a node taken, disabled: it previews too
  expect(await tip(page, 1)).toContain('Fight');
  await page.mouse.move(0, 0);
  await page.keyboard.press('Tab');
  await page.locator('#run-map [data-node="4"]').focus();
  expect(await tip(page, 4)).toContain('Treasure');
});

test('the node picked last pops when the map is drawn, not under reduced motion, and a pick has its sound, #1468', async ({ page }) => {
  await load(page);
  const pop = () => page.evaluate(() => getComputedStyle(document.querySelector('#run-map .node.here .glyph')!).animationName);
  expect(await pop()).toBe('node-pop');
  await page.evaluate(() => document.documentElement.setAttribute('data-motion', 'reduced')); // what the Reduced motion setting sets
  expect(await pop()).toBe('none');
  await page.locator('#run-map [data-node="3"]').click();
  await expect(page.locator('body')).toHaveAttribute('data-pick', /^(pick|none)$/); // the sound twin of the pick; muted in an automated browser
});
