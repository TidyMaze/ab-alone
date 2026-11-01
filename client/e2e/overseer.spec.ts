import { expect, test, type Page } from '@playwright/test';
import { pauseClock, stepClock } from './clock';
import { openModes } from './modes';

// The Overseer (#635, game-design.md section 7.11) from the fixture of the core tests
// (crates/abalone-core/src/encounter/overseer.rs) and ?bot=off, so the test plays both sides through the click hook:
// the player pushes the core (1, 1) next to the vent (3, 1) at ply 5, which pulls it in and burns it (#1241), then
// (-2, 1) next to (-4, 1); the boss walks 3 marbles onto (4, -1), where they burn, then pushes the core (2, -1) next to
// it itself at ply 22: the player's 6th ejection. Each ply: the cells to click, the moved marbles then the target. The
// screenshots are kept for the report.

type Axial = [number, number];
const FIXTURE: Axial[][] = [
  [[0, 2], [0, 1]], [[4, -3], [4, -2]], [[-1, 2], [-1, 1]], [[4, -2], [4, -1]],
  [[-1, 1], [0, 1], [1, 1]], [[4, -4], [4, -3]], [[0, 1], [1, 1], [2, 1]], [[4, -3], [4, -2]],
  [[-2, 2], [-1, 1]], [[4, -2], [4, -1]], [[-1, 3], [0, 2]], [[3, -3], [3, -2]],
  [[0, 2], [0, 1]], [[3, -2], [4, -2]], [[-1, 1], [0, 1], [-2, 1]], [[4, -2], [4, -1]],
  [[-2, 1], [-1, 1], [-3, 1]], [[0, -2], [0, -1]], [[-4, 3], [-3, 2]], [[1, -2], [1, -1]],
  [[-3, 2], [-2, 2]], [[0, -1], [1, -1], [2, -1]],
];

const cores = (page: Page) => page.evaluate(() => (window as any).__overseer().cores.length) as Promise<number>;

// Waits for a draw that began after this call. It is asked of the page, so the draw throttle does not hold it (#435).
const freshDraw = async (page: Page) => {
  const asked = await page.evaluate(() => (window as any).__drawNext() as number);
  await page.waitForFunction((n) => (window as any).__draws() > n, asked);
};

async function startOverseer(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: 'reduce' }); // the setup slides take no time
  await page.goto('./?bot=off');
  await page.locator('canvas').waitFor();
  await openModes(page);
  await page.getByRole('button', { name: 'Boss fight' }).click();
  await page.locator('#boss-list').getByRole('button', { name: 'The Overseer' }).click();
  await expect(page.locator('#boss-bar .name')).toContainText('The Overseer');
  await expect(page.locator('body')).toHaveAttribute('data-deck', 'chapel');
}

/** Plies `from` to `to` (excluded) of the fixture, each after the slides of the one before. */
async function plies(page: Page, from: number, to: number): Promise<void> {
  for (const cells of FIXTURE.slice(from, to)) {
    await expect(page.locator('body')).not.toHaveAttribute('data-sliding', '1');
    await page.evaluate((list) => list.forEach(([q, r]) => (window as any).__click(q, r)), cells);
  }
  await expect(page.locator('body')).not.toHaveAttribute('data-sliding', '1');
}

test('The Overseer: a core pushed next to a vent is pulled in and sinks, an ejection for the player, #635 #1241', async ({ page }, testInfo) => {
  await startOverseer(page);
  await expect(page.locator('#hud .boss .tell')).toContainText('Neurotoxin 0 % · 40 turns left');
  expect(await cores(page)).toBe(6);
  await plies(page, 0, 4);
  await expect(page.locator('#hud')).toContainText('1/6'); // a boss marble walked onto a vent and burnt
  await page.emulateMedia({ reducedMotion: 'no-preference' }); // the burn plays
  await page.mouse.move(2, 2); // no hover ghost
  await freshDraw(page);
  await page.screenshot({ path: testInfo.outputPath('overseer-before.png') });
  await plies(page, 4, 5); // the pair pushes the core (1, 1) to (2, 1), next to the vent (3, 1), which pulls it in
  await expect(page.locator('body')).toHaveAttribute('data-burns', '1');
  await expect(page.locator('body')).toHaveAttribute('data-ejecting', 'tumble');
  await expect(page.locator('#hud')).toContainText('2/6');
  expect(await cores(page)).toBe(5);
  await freshDraw(page);
  await page.screenshot({ path: testInfo.outputPath('overseer-burn.png') });
});

test('The Overseer: the boss pushing the 6th core in wins the fight for the player, #635', async ({ page }, testInfo) => {
  await startOverseer(page);
  await plies(page, 0, 22);
  await expect(page.locator('#hud')).toContainText('Victory');
  await expect(page.locator('body')).toHaveAttribute('data-burns', '1');
  expect(await cores(page)).toBe(3);
  await freshDraw(page);
  await page.screenshot({ path: testInfo.outputPath('overseer-victory.png') });
});

// The defeated Overseer (#789): its marble explodes, then its bubble types the farewell instead of an angry line.
test('The Overseer: on victory its marble explodes, then the bubble types the farewell, #789', async ({ page }, testInfo) => {
  await startOverseer(page);
  await plies(page, 0, 21);
  await expect(page.locator('#bubble')).toBeHidden(); // the angry line of an earlier burn has faded
  await page.emulateMedia({ reducedMotion: 'no-preference' }); // the explosion plays
  await page.mouse.move(2, 2);
  await plies(page, 21, 22);
  await expect(page.locator('body')).toHaveAttribute('data-exploding', '1');
  await expect(page.locator('#bubble')).toBeHidden(); // no angry line while it blows
  await freshDraw(page);
  await page.screenshot({ path: testInfo.outputPath('overseer-explosion.png') });
  await expect(page.locator('#bubble-text')).toHaveText('Well done. You broke the last thing that cared about you.');
  await expect(page.locator('#bubble')).not.toHaveClass(/angry/);
  await freshDraw(page);
  await page.screenshot({ path: testInfo.outputPath('overseer-farewell.png') });
});

// The Overseer speaks and its vents turn toxic (#741, docs/specs/ui.md).
const LINES = [
  'That core was load-bearing. Like your hopes.',
  "Do you know what that cost? No. You can't count.",
  'Stop touching my things.',
  'I will remember that. I remember everything.',
  'Congratulations. You broke something. Again.',
  'That was mine. Everything here is mine.',
];
const bubbleText = (page: Page) => page.locator('#bubble-text').textContent() as Promise<string>;

// The bubble runs on the page clock (page.clock): paused after the setup and stepped by hand, so the typed length does
// not depend on how fast a loaded machine draws (#836, #891).
test('The Overseer: its taunt is typed in a bubble over its marble, with a flicker, then fades, #741', async ({ page }, testInfo) => {
  await page.clock.install();
  await startOverseer(page);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.mouse.move(2, 2); // no hover ghost
  await pauseClock(page);
  await page.evaluate(() => document.getElementById('boss-retry')!.click()); // the same fight again: the taunt types in
  const bubble = page.locator('#bubble');
  await expect(bubble).toBeVisible();
  await stepClock(page, 50); // the old line is gone from the bubble: the new one starts typing
  const lengths: number[] = [];
  for (let n = 0; n < 3; n++) {
    lengths.push((await bubbleText(page)).length);
    await stepClock(page, 300);
  }
  expect(lengths[0]).toBeLessThan(lengths[2]!);
  expect(lengths[2]).toBeLessThan('Take your time. The neurotoxin will wait.'.length);
  await stepClock(page, 50);
  await page.screenshot({ path: testInfo.outputPath('overseer-typing.png') });
  await stepClock(page, 2500); // the rest of the line is typed
  await expect(page.locator('#bubble-text')).toHaveText('Take your time. The neurotoxin will wait.');
  const box = (await bubble.boundingBox())!;
  const view = page.viewportSize()!;
  expect(box.x).toBeGreaterThan(0);
  expect(box.x + box.width).toBeLessThan(view.width);
  expect(box.y).toBeGreaterThan(0);
  await stepClock(page, 50);
  await page.screenshot({ path: testInfo.outputPath('overseer-taunt.png') });
  await stepClock(page, 3500); // 3 s after the last character, then the fade
  await expect(bubble).toBeHidden();
});

test('The Overseer: a burnt core makes the bubble angry and shaking, and the vents turn toxic in P2, #741', async ({ page }, testInfo) => {
  await page.clock.install();
  await startOverseer(page);
  await plies(page, 0, 4);
  await expect(page.locator('body')).toHaveAttribute('data-haze', '0'); // P1: the vents burn the boss's marbles only
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.mouse.move(2, 2);
  await plies(page, 4, 5);
  const bubble = page.locator('#bubble');
  await expect(bubble).toHaveClass(/angry/);
  await expect(bubble).not.toHaveClass(/still/);
  await freshDraw(page);
  await page.screenshot({ path: testInfo.outputPath('overseer-angry.png') });
  await expect(page.locator('#bubble-text')).toHaveText(new RegExp(`^(${LINES.map((l) => l.replace(/[.?]/g, '\\$&')).join('|')})$`));
  await expect(page.locator('#hud .boss .tell')).toContainText('The vents now burn your marbles too.');
  await expect(page.locator('#hud .notch.active')).toHaveText('P2');
  await expect(page.locator('body')).toHaveAttribute('data-haze', '18');
  await page.clock.fastForward(5000); // the line is typed, held 1 s, then faded
  await expect(bubble).toBeHidden();
  await freshDraw(page);
  await page.screenshot({ path: testInfo.outputPath('overseer-haze.png') });
});

test('The Overseer: reduced motion shows the whole angry line at once and holds it still, #741', async ({ page }, testInfo) => {
  await startOverseer(page);
  await plies(page, 0, 5);
  await expect(page.locator('#bubble')).toHaveClass(/still/);
  await expect(page.locator('#bubble-text')).toHaveText(new RegExp(`^(${LINES.map((l) => l.replace(/[.?]/g, '\\$&')).join('|')})$`));
  await page.mouse.move(2, 2);
  await freshDraw(page);
  await page.screenshot({ path: testInfo.outputPath('overseer-angry-reduced.png') });
});

test('A boss win earns a medal: a new record on the banner, the turns next to the boss in the menu, #791', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('ab-alone.medals')) localStorage.setItem('ab-alone.medals', JSON.stringify({ echo: 14, overseer: 40 }));
  });
  await startOverseer(page);
  await plies(page, 0, 22); // the boss pushes the 6th core next to a vent at ply 22: 11 player turns
  await expect(page.locator('#hud')).toContainText('Victory');
  await expect(page.locator('#hud .end')).toContainText('New record: 11 turns.');
  await page.screenshot({ path: testInfo.outputPath('medal-banner.png') });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ab-alone.medals')!))).toEqual({ echo: 14, overseer: 11 });
  await openModes(page);
  await page.getByRole('button', { name: 'Boss fight' }).click();
  await expect(page.locator('#boss-list .medal')).toHaveText(['Medal: 14 turns', 'Medal: 11 turns']);
  await expect(page.locator('#boss-list button', { hasText: 'The Overseer' })).toContainText('Medal: 11 turns');
  await page.screenshot({ path: testInfo.outputPath('medal-menu.png') });
});
