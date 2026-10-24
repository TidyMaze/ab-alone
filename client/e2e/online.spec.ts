import { expect, test, type Page } from '@playwright/test';

// Two isolated browser contexts. The transport is the ?net=hook test hook: the test relays records
// from one page to the other, so no public Nostr relay is involved.
const cell = async (page: Page, q: number, r: number) => {
  // The raycaster needs the camera matrices, which three only updates on a rendered frame, and a
  // background tab renders none: bring the page to the front first.
  await page.bringToFront();
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  const p = await page.evaluate(([cq, cr]) => (window as any).__cellToScreen(cq, cr), [q, r]);
  return page.mouse.click(p.x, p.y);
};
const plies = (page: Page) => page.evaluate(() => (window as any).__plies());
// Seating is a Hello round trip after the connection opens: wait for it before the first move.
const seat = (page: Page, role: 'player' | 'spectator') => expect(page.locator('body')).toHaveAttribute('data-seat', role);
// Every page relays its records to the others with its own name as the sender, like a Trystero room.
const room = async (pages: Record<string, Page>) => {
  for (const [name, page] of Object.entries(pages)) {
    await page.exposeFunction('__netOut', (rec: unknown) =>
      Promise.all(
        Object.values(pages)
          .filter((p) => p !== page && !p.isClosed())
          .map((p) => p.evaluate(([r, from]) => (window as any).__netIn(r, from), [rec, name] as const)),
      ),
    );
  }
};
// What Trystero's onPeerLeave does on `page` when the peer `name` closed its page or lost its connection.
const leave = (page: Page, name: string) => page.evaluate((n) => (window as any).__netLeave(n), name);
const open = (page: Page) => page.evaluate(() => (window as any).__netOpen());
const status = (page: Page) => page.locator('#hud .presence');

// Tests with two or three WebGL pages call test.slow() (90 s instead of 30 s): on the CI runners, against
// the live site, a two-page test takes about 25 s and the three-page one more than 30 s (#138).
test('a move played on page A shows up on page B over the signed move log', async ({ browser }) => {
  test.slow();
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  await room({ a, b });

  await a.goto('./?bot=off&net=hook');
  await a.locator('canvas').waitFor();
  await expect(a.locator('#hud')).not.toBeEmpty(); // refresh() runs after the play-online listener is wired
  await a.locator('#play-online').click();
  const invite = await a.locator('#invite').inputValue();
  expect(invite).toMatch(/#room=[\w-]+$/);
  await expect(a.locator('#hud')).toContainText('You are Black');

  await b.goto(`./?net=hook${new URL(invite).hash}`);
  await b.locator('canvas').waitFor();
  await expect(b.locator('#hud')).toContainText('Joining as White...');

  // Before the connection is open a move is blocked, never applied on one side only.
  await cell(a, 0, 2);
  await cell(a, 0, 1);
  await expect(a.locator('#hud')).toContainText('waiting for opponent');
  await expect(a.locator('#hud')).toContainText('Black to move');
  expect(await plies(a)).toBe(0);

  await open(a);
  await open(b);
  await seat(b, 'player');
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
  test.slow();
  const a = await context.newPage();
  const b = await context.newPage(); // same context: shared localStorage
  await room({ a, b });

  await a.goto('./?bot=off&net=hook'); // './' keeps the /ab-alone/ path of E2E_BASE_URL, '/' is the Pages host root (404)
  await a.locator('canvas').waitFor();
  await expect(a.locator('#hud')).not.toBeEmpty(); // refresh() runs after the play-online listener is wired
  await a.locator('#play-online').click();
  const invite = await a.locator('#invite').inputValue();
  await b.goto(`./?net=hook${new URL(invite).hash}`);
  await b.locator('canvas').waitFor();
  await open(a);
  await open(b);
  await seat(b, 'player');

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
  test.slow();
  const [a, b, c] = await Promise.all([0, 1, 2].map(async () => (await browser.newContext()).newPage()));
  const all = [a, b, c];
  await room({ a, b, c });

  await a.goto('./?bot=off&net=hook');
  await a.locator('canvas').waitFor();
  await expect(a.locator('#hud')).not.toBeEmpty(); // refresh() runs after the play-online listener is wired
  await a.locator('#play-online').click();
  const hash = new URL(await a.locator('#invite').inputValue()).hash;
  for (const page of [b, c]) {
    await page.goto(`./?net=hook${hash}`);
    await page.locator('canvas').waitFor();
  }
  for (const page of all) await open(page);

  await seat(b, 'player');
  await seat(c, 'spectator');
  await expect(status(c)).toHaveText('Room is full, watching');
  await expect(c.locator('#hud')).not.toContainText('You are White');
  await expect(status(b)).toHaveText('You are White. Black is here.');
  await expect(status(a)).toHaveText('You are Black. White is here.');

  await cell(a, 0, 2);
  await cell(a, 0, 1);
  await expect.poll(() => plies(b)).toBe(1);
  await expect.poll(() => plies(c)).toBe(1); // a spectator still follows the game

  // It is White's turn: C tries to play it.
  await cell(c, 0, -2);
  await cell(c, 0, -1);
  await expect(c.locator('#hud')).toContainText('Room is full, watching');
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

  // Presence follows the key bound to the seat: the spectator leaving is not White leaving (#121).
  await c.context().close();
  await leave(a, 'c');
  await leave(b, 'c');
  await expect(status(a)).toHaveText('You are Black. White is here.');
  await expect(status(b)).toHaveText('You are White. Black is here.');
  await a.context().close();
  await b.context().close();
});

// Bug #127: main.ts awaits the wasm engine and the textures before it attaches the click listener.
// A click right after domcontentloaded must either hit a disabled button or create the invite.
test('Play online is disabled or works when clicked right after load, bug #127', async ({ page }) => {
  await page.goto('./?bot=off&net=hook', { waitUntil: 'domcontentloaded' });
  const disabledAtClick = await page.evaluate(() => {
    const button = document.getElementById('play-online') as HTMLButtonElement;
    const wasDisabled = button.disabled;
    button.click();
    return wasDisabled;
  });
  const invite = await page.locator('#invite').inputValue();
  expect(disabledAtClick || /#room=[\w-]+$/.test(invite)).toBe(true);
});

// Issue #121: each player sees its own color and whether the opponent is online, updated live.
test('online status: creator waits with the invite, joiner joins, both see each other, drop, reconnect and close, #121', async ({ browser }) => {
  test.slow();
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  await room({ a, b });

  await a.goto('./?bot=off&net=hook');
  await a.locator('canvas').waitFor();
  await expect(a.locator('#hud')).not.toBeEmpty();
  await a.locator('#play-online').click();
  await expect(status(a)).toHaveText('You are Black. Waiting for an opponent...');
  await expect(a.locator('#invite')).toBeVisible();
  await expect(a.getByText('Invite link: send it to your opponent')).toBeVisible();
  const invite = await a.locator('#invite').inputValue();

  await b.goto(`./?net=hook${new URL(invite).hash}`);
  await b.locator('canvas').waitFor();
  await expect(status(b)).toHaveText('Joining as White...');
  await expect(status(a)).toHaveText('You are Black. Waiting for an opponent...'); // B is not connected yet

  await open(a);
  await open(b);
  await expect(status(b)).toHaveText('You are White. Black is here.');
  await expect(status(a)).toHaveText('You are Black. White is here.');

  // The connection drops on both sides, then comes back: same pages, same keys.
  await leave(a, 'b');
  await leave(b, 'a');
  await expect(status(a)).toHaveText('You are Black. White is disconnected.');
  await expect(status(b)).toHaveText('You are White. Black is disconnected.');
  await open(a);
  await open(b);
  await expect(status(a)).toHaveText('You are Black. White is here.');
  await expect(status(b)).toHaveText('You are White. Black is here.');

  // Closing page B: page A shows White disconnected, and still its own color.
  await b.context().close();
  await leave(a, 'b');
  await expect(status(a)).toHaveText('You are Black. White is disconnected.');
  await a.context().close();
});
