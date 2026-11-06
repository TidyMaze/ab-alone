import { expect, test, type Page } from '@playwright/test';
import { shot } from './shot';

// The HUD of a rogue-lite army fight (#1540, #1541, docs/specs/roguelite.md section 31), loaded through the test hook: the army,
// the army the run ends below and the marbles lost in red, a legend line for each special marble the player has not met, and a card
// with the rule of a special marble hovered with a mouse or tapped on its legend line.
/** The first 32 plies of an army of 14 against the 8 marbles of the first fight: White has thrown one Black marble off. */
const LOST_ONE = [[1,2,-4,3,0,0,0,0],[2,5,0,-4,1,-4,0,0],[1,4,-4,4,0,0,0,0],[2,5,0,-3,1,-3,0,0],[1,4,-4,3,0,0,0,0],[2,5,2,-4,2,-3,0,0],[1,2,-4,2,0,0,0,0],[3,3,1,-2,2,-3,3,-4],[1,0,-3,1,0,0,0,0],[3,3,2,-2,3,-3,4,-4],[1,1,-3,2,0,0,0,0],[3,3,1,-1,2,-2,3,-3],[1,0,-4,2,0,0,0,0],[1,1,4,-3,0,0,0,0],[1,1,-3,2,0,0,0,0],[3,3,0,-1,1,-2,2,-3],[1,0,-4,2,0,0,0,0],[1,1,3,-3,0,0,0,0],[1,1,-3,2,0,0,0,0],[2,5,2,-3,2,-2,0,0],[1,0,-4,2,0,0,0,0],[1,3,2,-1,0,0,0,0],[1,1,-3,2,0,0,0,0],[3,5,0,-2,0,-1,0,0],[1,0,-4,2,0,0,0,0],[3,3,-1,0,0,-1,1,-2],[1,4,-4,3,0,0,0,0],[3,3,0,0,1,-1,2,-2],[1,2,-4,2,0,0,0,0],[3,3,-1,1,0,0,1,-1],[1,4,-4,4,0,0,0,0],[3,3,-2,1,-1,0,0,-1]];

const load = async (page: Page, state: object) => {
  await page.goto('./?bot=off');
  await page.waitForFunction(() => (window as any).__run);
  await page.evaluate((s) => (window as any).__run(s), { seed: 3, army: 14, path: [0], fighting: true, moves: [], end: '', specials: [0, 0, 1, 0, 0, 0, 0, 0, 1, 0], placed: [[-4, 4, 3], [0, 4, 9]], reward: false, ...state });
};
const colour = (page: Page, selector: string) => page.locator(selector).evaluate((el) => getComputedStyle(el).color);
const at = (page: Page, q: number, r: number) => page.evaluate(([a, b]) => (window as any).__cellToScreen(a, b) as { x: number; y: number }, [q, r]);

test('the HUD of an army fight reads the army, what the run ends below and the marbles lost in red, not the ejections of both sides, #1540', async ({ page }) => {
  await load(page, { specials: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], placed: [] });
  const score = page.locator('#hud .score');
  await expect(score).toContainText('Army 14 (run ends below 9) · lost 0');
  await expect(score).toContainText('Bot ejected 0/6');
  await expect(page.locator('#hud')).not.toContainText('Black ejected');
  await expect(page.locator('#hud .score .lost')).toHaveCount(0);
  await load(page, { specials: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], placed: [], moves: LOST_ONE });
  await expect(score).toContainText('Army 13 (run ends below 9) · lost 1');
  await expect(page.locator('#hud .score .lost')).toHaveText('lost 1');
  expect(await colour(page, '#hud .score .lost')).toBe(await page.evaluate(() => { const p = document.createElement('i'); p.style.color = 'var(--danger)'; document.body.append(p); return getComputedStyle(p).color; }));
  await page.waitForFunction(() => document.body.dataset.sliding === undefined);
  await shot(page, { path: 'test-results/roguelite-hud-lost.png' });
  await page.setViewportSize({ width: 390, height: 844 }); // the score stays on screen held upright, where the ejection line is hidden
  await expect(page.locator('#hud .score .lost')).toBeVisible();
  const box = await page.locator('#hud .score').boundingBox();
  expect(box!.width).toBeGreaterThan(100);
  await shot(page, { path: 'test-results/roguelite-hud-lost-phone.png' });
});

test('a legend line for each special marble on the board, a card on a hover or a tap of its line, and none of it blocks a move, #1541', async ({ page }) => {
  await load(page, {});
  const rows = page.locator('#hud button[data-special]');
  await expect(rows).toHaveText(['Spark bursts when pushed off', 'Bomb bursts on its side\'s 3rd turn']);
  const card = page.locator('#hud .special-card');
  await expect(card).toHaveCount(0);
  await shot(page, { path: 'test-results/roguelite-hud-legend.png' });
  const spark = await at(page, -4, 4);
  await page.mouse.move(spark.x, spark.y);
  await expect(card).toContainText('Spark (yours): When it is pushed off it bursts');
  await shot(page, { path: 'test-results/roguelite-hud-hover.png' });
  const plain = await at(page, -2, 2);
  await page.mouse.move(plain.x, plain.y);
  await expect(card).toHaveCount(0);
  await rows.nth(1).click(); // a tap on the legend line: the touch route to the same card
  await expect(card).toContainText('Bomb (yours): On its side\'s third turn it bursts');
  await expect(card).toContainText('3 turns left');
  await page.mouse.click(plain.x, plain.y); // a press on a marble selects it whatever the card
  await expect.poll(() => page.evaluate(() => (window as any).__rings().length)).toBe(1);
  await page.mouse.click((await at(page, -3, 2)).x, (await at(page, -3, 2)).y);
  await expect.poll(() => page.evaluate(() => (window as any).__plies())).toBe(1);
});

test('on a phone the legend is on screen and a tap on a line shows the card, #1541', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await load(page, {});
  const rows = page.locator('#hud button[data-special]');
  await expect(rows).toHaveCount(2);
  for (const row of await rows.all()) {
    const box = (await row.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    expect(box.height).toBeGreaterThanOrEqual(24);
  }
  await rows.nth(0).tap();
  await expect(page.locator('#hud .special-card')).toContainText('Spark (yours)');
  await page.waitForFunction(() => document.body.dataset.sliding === undefined);
  await shot(page, { path: 'test-results/roguelite-hud-legend-phone.png' });
  await context.close();
});
