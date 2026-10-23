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
  await expect(a.locator('#hud')).not.toBeEmpty(); // refresh() runs after the play-online listener is wired
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
  // Manual contexts stay open after the test: their WebGL pages would slow the next test (#120).
  await a.context().close();
  await b.context().close();
});

test('two tabs of the same browser context play an online game, bug #116', async ({ context }) => {
  const a = await context.newPage();
  const b = await context.newPage(); // same context: shared localStorage
  await a.exposeFunction('__netOut', (rec: unknown) => b.evaluate((r) => (window as any).__netIn(r), rec));
  await b.exposeFunction('__netOut', (rec: unknown) => a.evaluate((r) => (window as any).__netIn(r), rec));

  await a.goto('./?bot=off&net=hook'); // './' keeps the /ab-alone/ path of E2E_BASE_URL, '/' is the Pages host root (404)
  await a.locator('canvas').waitFor();
  await expect(a.locator('#hud')).not.toBeEmpty(); // refresh() runs after the play-online listener is wired
  await a.locator('#play-online').click();
  const invite = await a.locator('#invite').inputValue();
  await b.goto(`./?net=hook${new URL(invite).hash}`);
  await b.locator('canvas').waitFor();
  await a.evaluate(() => (window as any).__netOpen());
  await b.evaluate(() => (window as any).__netOpen());

  await cell(a, 0, 2);
  await cell(a, 0, 1);
  await expect.poll(() => plies(b)).toBe(1);
  await cell(b, 0, -2);
  await cell(b, 0, -1);
  await expect.poll(() => plies(a)).toBe(2);
  await expect(a.locator('#hud')).not.toContainText('refused');
  await expect(b.locator('#hud')).not.toContainText('refused');
});

test('a third peer opening the link is not a player: room is full, its move changes nothing, bug #117', async ({ browser }) => {
  const [a, b, c] = await Promise.all([0, 1, 2].map(async () => (await browser.newContext()).newPage()));
  // Every page broadcasts to the two others, like a Trystero room.
  const all = [a, b, c];
  for (const page of all) {
    await page.exposeFunction('__netOut', (rec: unknown) =>
      Promise.all(all.filter((p) => p !== page).map((p) => p.evaluate((r) => (window as any).__netIn(r), rec))),
    );
  }

  await a.goto('./?bot=off&net=hook');
  await a.locator('canvas').waitFor();
  await a.locator('#play-online').click();
  const hash = new URL(await a.locator('#invite').inputValue()).hash;
  for (const page of [b, c]) {
    await page.goto(`./?net=hook${hash}`);
    await page.locator('canvas').waitFor();
  }
  for (const page of all) await page.evaluate(() => (window as any).__netOpen());

  await expect(b.locator('#hud')).toContainText('you are White');
  await expect(c.locator('#hud')).toContainText('room is full, watching');
  await expect(c.locator('#hud')).not.toContainText('you are White');

  await cell(a, 0, 2);
  await cell(a, 0, 1);
  await expect.poll(() => plies(b)).toBe(1);
  await expect.poll(() => plies(c)).toBe(1); // a spectator still follows the game

  // It is White's turn: C tries to play it.
  await cell(c, 0, -2);
  await cell(c, 0, -1);
  await expect(c.locator('#hud')).toContainText('room is full, watching');
  expect(await plies(c)).toBe(1);
  expect(await plies(a)).toBe(1);
  expect(await plies(b)).toBe(1);
  await expect(b.locator('#hud')).toContainText('White to move');

  // The real White still plays, everyone follows.
  await cell(b, 0, -2);
  await cell(b, 0, -1);
  await expect.poll(() => plies(a)).toBe(2);
  await expect.poll(() => plies(c)).toBe(2);
  await expect(a.locator('#hud')).not.toContainText('refused');
});
