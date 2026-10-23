import { expect, test, type Page } from '@playwright/test';

// Two isolated browser contexts. The transport is the ?net=hook test hook: the test relays records
// from one page to the other, so no public Nostr relay is involved.
const cell = async (page: Page, q: number, r: number) => {
  const p = await page.evaluate(([cq, cr]) => (window as any).__cellToScreen(cq, cr), [q, r]);
  return page.mouse.click(p.x, p.y);
};
const plies = (page: Page) => page.evaluate(() => (window as any).__plies());

test('a move played on page A shows up on page B over the signed move log', async ({ browser }) => {
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  await a.exposeFunction('__netOut', (rec: unknown) => b.evaluate((r) => (window as any).__netIn(r), rec));
  await b.exposeFunction('__netOut', (rec: unknown) => a.evaluate((r) => (window as any).__netIn(r), rec));

  await a.goto('./?bot=off&net=hook');
  await a.locator('canvas').waitFor();
  await a.locator('#play-online').click();
  const invite = await a.locator('#invite').inputValue();
  expect(invite).toMatch(/#room=[\w-]+$/);
  await expect(a.locator('#hud')).toContainText('you are Black');

  await b.goto(`./?net=hook${new URL(invite).hash}`);
  await b.locator('canvas').waitFor();
  await expect(b.locator('#hud')).toContainText('you are White');

  // Before the connection is open a move is blocked, never applied on one side only.
  await cell(a, 0, 2);
  await cell(a, 0, 1);
  await expect(a.locator('#hud')).toContainText('waiting for opponent');
  await expect(a.locator('#hud')).toContainText('Black to move');
  expect(await plies(a)).toBe(0);

  await a.evaluate(() => (window as any).__netOpen());
  await b.evaluate(() => (window as any).__netOpen());
  await cell(a, 0, 2); // a Black marble
  await cell(a, 0, 1); // its NW neighbour
  await expect(a.locator('#hud')).toContainText('White to move');
  await expect.poll(() => plies(b)).toBe(1);
  await expect(b.locator('#hud')).toContainText('White to move');
  expect(await plies(a)).toBe(1);

  // White answers on page B, Black sees it on page A.
  await cell(b, 0, -2);
  await cell(b, 0, -1);
  await expect.poll(() => plies(a)).toBe(2);
  await expect(a.locator('#hud')).toContainText('Black to move');
  await expect(a.locator('#hud')).not.toContainText('refused');
});
