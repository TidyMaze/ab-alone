import { expect, test, type Page } from '@playwright/test';
import { BLACK_WINS, WHITE_WINS } from './end-games';
import { loseByRepetition, startDaily } from './fight-end';

// End of the game (#282): a banner that says it is over, one animation id per outcome in body[data-over],
// a locked board, and a plate that covers no cell. Finished games come from an imported file (end-games.ts).

const A = [1, 4, 0, 2, 0, 0, 0, 0]; // Black (0, 2) to (0, 1)
const B = [1, 5, 0, -2, 0, 0, 0, 0]; // White (0, -2) to (0, -1)
const C = [1, 4, 0, 1, 0, 0, 0, 0]; // Black (0, 1) to (0, 0)
const D = [1, 4, 0, -1, 0, 0, 0, 0]; // White (0, -1) back to (0, -2)
const E = [1, 5, 0, 0, 0, 0, 0, 0]; // Black (0, 0) back to (0, 1)
const DRAW = [A, B, C, D, E, B, C, D, E]; // the start position after A comes back a third time

const plies = (page: Page) => page.evaluate(() => (window as any).__plies() as number);

async function open(page: Page, query: string): Promise<void> {
  await page.goto(`./${query}`);
  await page.locator('canvas').waitFor();
  await expect(page.locator('#hud')).toContainText('to move');
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
}

const load = (page: Page, bot: boolean, moves: number[][]) =>
  page
    .locator('#import-file')
    .setInputFiles({
      name: 'game.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ version: 1, mode: 'local', layout: 'standard', bot, moves })),
    });

/** Every marble cell and the cell next to it: a locked board plays nothing, whoever's turn it is. */
async function tryToMove(page: Page): Promise<void> {
  for (const [from, to] of [[[0, 2], [0, 1]], [[0, -2], [0, -1]], [[-4, 4], [-3, 3]], [[4, -4], [3, -3]]]) {
    for (const [q, r] of [from!, to!]) {
      const p = await page.evaluate(([cq, cr]) => (window as any).__cellToScreen(cq, cr), [q!, r!]);
      await page.mouse.click(p.x, p.y);
    }
  }
}

/** Waits for the end animation to finish, so a screenshot shows the position the player keeps looking at. */
const settled = (page: Page) =>
  expect.poll(() => page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length)).toBe(0);

/** The banner as the player reads it, and the marker the CSS animation hangs on. */
async function expectOver(page: Page, anim: string, title: string, line: RegExp | string) {
  await expect(page.locator('body')).toHaveAttribute('data-over', anim);
  await expect(page.locator('#hud .turn')).toHaveText(title);
  await expect(page.locator('#hud .end')).toHaveAttribute('data-anim', anim);
  await expect(page.locator('#hud .end')).toContainText(line);
}

test('a win against the bot: banner, warm animation id, locked board', async ({ page }) => {
  await open(page, '');
  await expect(page.locator('body')).not.toHaveAttribute('data-over', /.*/); // nothing while the game runs
  await load(page, true, BLACK_WINS);
  await expectOver(page, 'win', 'You win', '6 out. The books balance.');
  const before = await plies(page);
  await tryToMove(page);
  expect(await plies(page)).toBe(before);
  await settled(page);
  await page.screenshot({ path: 'test-results/end-win.png' });
  // The next game takes the banner and the marker away.
  await page.locator('#new-game').click(); // a played game asks for a second press
  await page.getByRole('button', { name: 'Confirm new game' }).click();
  await expect(page.locator('body')).not.toHaveAttribute('data-over', /.*/);
  await expect(page.locator('#hud .end')).toHaveCount(0);
});

test('a loss against the bot: banner, cold animation id, locked board', async ({ page }) => {
  await open(page, '');
  await load(page, true, WHITE_WINS);
  await expectOver(page, 'loss', 'You lose', '6 out. Tally strikes your name.');
  const before = await plies(page);
  await tryToMove(page);
  expect(await plies(page)).toBe(before);
  await settled(page);
  await page.screenshot({ path: 'test-results/end-loss.png' });
});

test('a draw at the table: banner, still animation id, locked board', async ({ page }) => {
  await open(page, '?bot=off');
  await load(page, false, DRAW);
  await expectOver(page, 'draw', 'Draw', 'Same position three times. Tally closes the page.');
  await tryToMove(page);
  expect(await plies(page)).toBe(9);
  await settled(page);
  await page.screenshot({ path: 'test-results/end-draw.png' });
});

test('hot-seat: the colour that won is named', async ({ page }) => {
  await open(page, '?bot=off');
  await load(page, false, WHITE_WINS);
  await expectOver(page, 'win', 'White wins', '6 out. The books balance.');
});

test('a draw against a boss is a defeat, and the daily result card stays reachable', async ({ page }) => {
  test.slow(); // eight plies played by hand against the boss search
  await startDaily(page);
  await loseByRepetition(page);
  await expectOver(page, 'loss', 'Defeat', 'Repeated 3 times: a defeat.');
  await expect(page.locator('#daily-card')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
  await expect(page.locator('#hud')).toContainText('Defeat');
  await settled(page);
  await page.screenshot({ path: 'test-results/end-boss.png' });
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.locator('body')).not.toHaveAttribute('data-over', /.*/);
});

test('reduced motion: the banner stays and the board is dimmed, nothing animates', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page, '');
  await load(page, true, BLACK_WINS);
  await expectOver(page, 'win', 'You win', '6 out. The books balance.');
  const style = await page.evaluate(() => {
    const canvas = getComputedStyle(document.querySelector('canvas')!);
    const veil = getComputedStyle(document.body, '::before');
    return { filter: canvas.filter, animation: canvas.animationName, veilDisplay: veil.display, veilAnimation: veil.animationDuration };
  });
  expect(style.filter).not.toBe('none'); // dimmed
  expect(style.veilDisplay).toBe('none'); // no animated light
});

test('with motion: each outcome has its own animation, and it ends by itself', async ({ page }) => {
  await open(page, '');
  const seen: Record<string, string> = {};
  for (const [anim, moves] of [['win', BLACK_WINS], ['loss', WHITE_WINS]] as const) {
    await load(page, true, moves);
    await expect(page.locator('body')).toHaveAttribute('data-over', anim);
    seen[anim] = await page.evaluate(() => getComputedStyle(document.body, '::before').animationName);
  }
  await open(page, '?bot=off');
  await load(page, false, DRAW);
  await expect(page.locator('body')).toHaveAttribute('data-over', 'draw');
  seen.draw = await page.evaluate(() => getComputedStyle(document.body, '::before').animationName);
  expect(new Set(Object.values(seen)).size).toBe(3);
  expect(seen.win).toBe('end-win');
  expect(seen.loss).toBe('end-loss');
  expect(seen.draw).toBe('end-draw');
  // Short: finished well inside 3 s.
  await expect
    .poll(() => page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length), { timeout: 3000 })
    .toBe(0);
});

test.describe('a phone held upright', () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
  test.skip(({ browserName }) => browserName === 'firefox', 'Firefox has no mobile emulation');

  test('the banner reads on a phone', async ({ page }) => {
    await open(page, '');
    await load(page, true, BLACK_WINS);
    await expectOver(page, 'win', 'You win', '6 out. The books balance.');
    await settled(page);
    await page.screenshot({ path: 'test-results/end-phone-win.png' });
  });
});
