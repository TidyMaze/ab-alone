import { expect, test } from '@playwright/test';
import { openModes } from './modes';

// The Stalker as a boss (#1111): picked in the Boss fight list, fogged at sight 3, the dark veil over what the player's
// marbles do not see, the sight on the HUD. A move is played and the boss answers under the same fog.
test('The Stalker is a boss: pick it in the Boss fight list, the veil and the sight show, a move gets a reply, #1121', async ({ page }, testInfo) => {
  await page.goto('./?bot=on'); // a query: no landing on the Ship hub (#602)
  await page.locator('canvas').waitFor();
  await openModes(page);
  await page.locator('#boss-fight').click();
  const entries = page.locator('#boss-list button');
  await expect(entries.last()).toHaveText('The Stalker');
  await page.screenshot({ path: testInfo.outputPath('stalker-boss-list.png') });
  await entries.last().click();
  await expect(page.locator('#hud')).toContainText('Sight 3 · narrows to 2 after 3 more ejections');
  const fog = await page.evaluate(() => (window as any).__stalker() as { visible: unknown[]; drawn: unknown[] });
  expect(fog.visible).toHaveLength(41);
  expect(fog.drawn).toEqual([]); // the boss is four cells away: all hidden
  const plies = async () => page.evaluate(() => (window as any).__plies() as number);
  const move = await page.evaluate(() => (window as any).__legal()[0] as { cells: [number, number][]; dir: number });
  await page.evaluate((m) => (window as any).__click(...m.cells[0]!), move);
  await page.evaluate((m) => (window as any).__click(...(window as any).__targets().find((t: any) => t.dir === m.dir).cell), move);
  await expect.poll(plies).toBe(2); // the move and the boss's reply
  await page.screenshot({ path: testInfo.outputPath('stalker-boss-fight.png') });
});

// #1122: reload during a Stalker fight and come back to the same fight under its fog; the Game modes menu has no Stalker (#1123).
test('A Stalker fight comes back under its fog after a reload, and the menu has no Stalker entry, #1122 #1123', async ({ page }, testInfo) => {
  await page.goto('./?bot=on');
  await page.locator('canvas').waitFor();
  await openModes(page);
  await expect(page.locator('#stalker')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('modes-no-stalker.png') });
  await page.locator('#boss-fight').click();
  await page.locator('#boss-list button').last().click();
  const move = await page.evaluate(() => (window as any).__legal()[0] as { cells: [number, number][]; dir: number });
  await page.evaluate((m) => (window as any).__click(...m.cells[0]!), move);
  await page.evaluate((m) => (window as any).__click(...(window as any).__targets().find((t: any) => t.dir === m.dir).cell), move);
  await expect.poll(() => page.evaluate(() => (window as any).__plies() as number)).toBe(2);
  const history = await page.evaluate(() => (window as any).__history());
  await page.reload();
  await expect(page.locator('#hud')).toContainText('Sight 3');
  expect(await page.evaluate(() => (window as any).__history())).toEqual(history);
  expect(await page.evaluate(() => (window as any).__stalker().visible.length)).toBeGreaterThan(0);
  await page.screenshot({ path: testInfo.outputPath('stalker-after-reload.png') });
});
