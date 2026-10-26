import { expect, type Page } from '@playwright/test';
import { openModes } from './modes';

// Reaching the end of a boss fight, for the daily result card tests (#196). With ?bot=off the test
// plays both sides by hand: one marble each, there and back twice, brings the start position back a
// third time at ply 8, a draw by threefold repetition, which is a loss against a boss. The daily boss
// of 2027-01-25 is The Echo with 10 bosses (#635), a plain fight where this works (The Choir moves its armies in turn, so it
// would refuse White's move).
const THERE_AND_BACK: [number, number, number, number][] = [
  [0, 2, 0, 1], // Black (0,2) to (0,1)
  [0, -2, 0, -1], // White (0,-2) to (0,-1)
  [0, 1, 0, 2], // Black back
  [0, -1, 0, -2], // White back
];
export async function loseByRepetition(page: Page): Promise<void> {
  const click = async (q: number, r: number) => {
    const p = await page.evaluate(([cq, cr]) => (window as any).__cellToScreen(cq, cr), [q, r]);
    await page.mouse.click(p.x, p.y);
  };
  for (const [ply, [q, r, tq, tr]] of [...THERE_AND_BACK, ...THERE_AND_BACK].entries()) {
    await click(q, r);
    await click(tq, tr);
    await expect.poll(() => page.evaluate(() => (window as any).__plies())).toBe(ply + 1);
  }
  await expect(page.locator('#hud')).toContainText('Defeat');
}

/** Opens the daily challenge of 2027-01-25 (clock fixed), starts it and returns the boss name. */
export async function startDaily(page: Page): Promise<string> {
  await page.clock.setFixedTime(new Date('2027-01-25T08:00:00Z'));
  await page.goto('./?bot=off');
  const daily = page.locator('#daily');
  await expect(daily).toBeEnabled();
  const name = (await daily.textContent())!.split(': ')[1]!;
  await openModes(page);
  await daily.click();
  await expect(page.locator('#hud')).toContainText('Daily challenge 2027-01-25 · attempt 1');
  return name;
}
