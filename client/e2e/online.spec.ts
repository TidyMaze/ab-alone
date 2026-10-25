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
// The same click through the game's own handler (window.__click), without the raycast and the frames of a mouse
// click. The setup plies of a test use it, so each test pays the mouse path once, on its last ply.
const play = (page: Page, q: number, r: number) => page.evaluate(([cq, cr]) => (window as any).__click(cq, cr), [q, r]);
// Reduced motion on pages whose test checks no animation: slides and ejection effects take no time.
const calm = (...pages: Page[]) => Promise.all(pages.map((p) => p.emulateMedia({ reducedMotion: 'reduce' })));
const plies =(page: Page) => page.evaluate(() => (window as any).__plies());
// Seating is a Hello round trip after the connection opens: wait for it before the first move.
const seat = (page: Page, role: 'player' | 'spectator') => expect(page.locator('body')).toHaveAttribute('data-seat', role);
// Every page relays its records to the others with its own name as the sender, like a Trystero room,
// or to the one page `to` names (a catch-up answer, #226). Whatever goes to or from a page named in
// `lost` is lost, as on a connection that broke before anyone noticed.
const room = async (pages: Record<string, Page>, lost = new Set<string>()) => {
  for (const [name, page] of Object.entries(pages)) {
    await page.exposeFunction('__netOut', (rec: unknown, to?: string) =>
      Promise.all(
        Object.entries(pages)
          .filter(([n, p]) => p !== page && !p.isClosed() && (!to || to === n) && !lost.has(n) && !lost.has(name))
          // A page whose session does not exist yet has no __netIn: like a Trystero room, drop the record for it
          // instead of throwing inside the sender's __netOut (an unhandled rejection, #249).
          .map(([, p]) => p.evaluate(([r, from]) => (window as any).__netIn?.(r, from), [rec, name] as const)),
      ),
    );
  }
};
// What Trystero's onPeerLeave does on `page` when the peer `name` closed its page or lost its connection.
const leave = (page: Page, name: string) => page.evaluate((n) => (window as any).__netLeave(n), name);
// The hook transport only exists once main.ts reaches goOnline, after the textures and the saved game
// loaded: the canvas shows well before (bug #238). data-seat is set once the session is wired to it,
// and like the canvas it is waited for as long as the test runs, a page load on a loaded machine.
const open = async (page: Page) => {
  await page.locator('body[data-seat]').waitFor({ state: 'attached' });
  await page.evaluate(() => (window as any).__netOpen());
};
const status = (page: Page) => page.locator('#hud .presence');

test('a move played on page A shows up on page B over the signed move log', async ({ browser }) => {
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
  const a = await context.newPage();
  const b = await context.newPage(); // same context: shared localStorage
  const errors: string[] = [];
  for (const page of [a, b]) page.on('pageerror', (e) => errors.push(e.message));
  await room({ a, b });
  // Bug #238: page b shows its canvas before main.ts loads the textures and the saved game, and its
  // hook transport only comes after both. Its textures are held until open(b) has run in the page, so
  // the test opens a page that is still loading on every run, not only on a loaded machine.
  let release!: () => void;
  const held = new Promise<void>((done) => (release = () => done()));
  await b.route('**/assets/*.png', async (route) => {
    await held;
    await route.continue();
  });

  await a.goto('./?bot=off&net=hook'); // './' keeps the /ab-alone/ path of E2E_BASE_URL, '/' is the Pages host root (404)
  await a.locator('canvas').waitFor();
  await expect(a.locator('#hud')).not.toBeEmpty(); // refresh() runs after the play-online listener is wired
  await a.locator('#play-online').click();
  const invite = await a.locator('#invite').inputValue();
  await b.goto(`./?net=hook${new URL(invite).hash}`, { waitUntil: 'commit' }); // held textures can hold the load event
  await b.locator('canvas').waitFor();
  await open(a);
  // Calls on a page run in order: the textures go only once a later call on page b came back, so open(b)
  // reaches page b while it still loads.
  await Promise.all([open(b), b.evaluate(() => {}).then(release)]);
  await seat(b, 'player');

  await cell(a, 0, 2);
  await cell(a, 0, 1);
  await expect.poll(() => plies(b)).toBe(1);
  await cell(b, 0, -2);
  await cell(b, 0, -1);
  await expect.poll(() => plies(a)).toBe(2);
  await expect(a.locator('#hud')).not.toContainText('refused');
  await expect(b.locator('#hud')).not.toContainText('refused');
  expect(errors).toEqual([]); // a record relayed to a page with no session yet was an unhandled rejection (#249)
});

test('a third peer opening the link is not a player: room is full, its move changes nothing, bug #117', async ({ browser }) => {
  const [a, b, c] = await Promise.all([0, 1, 2].map(async () => (await browser.newContext()).newPage()));
  const all = [a, b, c];
  await calm(a, b, c);
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

  await play(a, 0, 2);
  await play(a, 0, 1);
  await expect.poll(() => plies(b)).toBe(1);
  await expect.poll(() => plies(c)).toBe(1); // a spectator still follows the game

  // It is White's turn: C tries to play it.
  await play(c, 0, -2);
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

// Issue #143: a move is sent only while the key bound to the opponent's seat is connected, not
// while just any peer (here a spectator) is.
test('a player cannot move while the opponent is gone, even with a spectator still there, #143', async ({ browser }) => {
  const [a, b, c] = await Promise.all([0, 1, 2].map(async () => (await browser.newContext()).newPage()));
  await calm(a, b, c);
  await room({ a, b, c });
  await a.goto('./?bot=off&net=hook');
  await a.locator('canvas').waitFor();
  await expect(a.locator('#hud')).not.toBeEmpty();
  await a.locator('#play-online').click();
  const hash = new URL(await a.locator('#invite').inputValue()).hash;
  for (const page of [b, c]) {
    await page.goto(`./?net=hook${hash}`);
    await page.locator('canvas').waitFor();
  }
  for (const page of [a, b, c]) await open(page);
  await seat(b, 'player');
  await seat(c, 'spectator');
  await expect(status(a)).toHaveText('You are Black. White is here.');

  // White's connection drops, the spectator stays: Black's move must not be sent.
  await leave(a, 'b');
  await leave(c, 'b');
  await leave(b, 'a');
  await leave(b, 'c');
  await expect(status(a)).toHaveText('You are Black. White is disconnected.');
  await play(a, 0, 2);
  await cell(a, 0, 1);
  await expect(a.locator('#hud')).toContainText('waiting for opponent');
  for (const page of [a, b, c]) expect(await plies(page)).toBe(0);

  // White comes back on the same key: the move goes through to everyone.
  await open(b);
  await open(a);
  await expect(status(a)).toHaveText('You are Black. White is here.');
  await play(a, 0, 2);
  await cell(a, 0, 1);
  await expect.poll(() => plies(b)).toBe(1);
  await expect.poll(() => plies(c)).toBe(1);
  await a.context().close();
  await b.context().close();
  await c.context().close();
});

// Issue #186: after a finished game both players ask for a rematch, a new game on the same channel
// with the colours swapped. The cheapest real way to finish a game: one marble each, there and
// back twice, brings the start position back a third time, a draw by threefold repetition.
test('a finished online game ends in a rematch: colours swapped, the new Black moves first, #186', async ({ browser }) => {
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  await calm(a, b);
  await room({ a, b });
  await a.goto('./?bot=off&net=hook');
  await a.locator('canvas').waitFor();
  await expect(a.locator('#hud')).not.toBeEmpty();
  await a.locator('#play-online').click();
  const hash = new URL(await a.locator('#invite').inputValue()).hash;
  await b.goto(`./?net=hook${hash}`);
  await b.locator('canvas').waitFor();
  await open(a);
  await open(b);
  await seat(b, 'player');
  await expect(status(a)).toHaveText('You are Black. White is here.');
  await expect(a.locator('#rematch')).toBeHidden(); // the game runs

  const cycle: [Page, number, number, number, number][] = [
    [a, 0, 2, 0, 1],
    [b, 0, -2, 0, -1],
    [a, 0, 1, 0, 2],
    [b, 0, -1, 0, -2],
  ];
  for (let ply = 0; ply < 8; ply++) {
    const [page, fq, fr, tq, tr] = cycle[ply % 4]!;
    const press = ply < 7 ? play : cell; // the last ply goes through the mouse
    await press(page, fq, fr);
    await press(page, tq, tr);
    await expect.poll(() => plies(page === a ? b : a)).toBe(ply + 1); // the other page replayed it
  }
  for (const page of [a, b]) await expect(page.locator('#hud .turn')).toHaveText('Draw');
  for (const page of [a, b]) {
    // Each side sees its own result (a draw is the same for both) and the one action it can take (#282).
    await expect(page.locator('body')).toHaveAttribute('data-over', 'draw');
    await expect(page.locator('#hud .end')).toContainText('Tally closes the page.');
  }

  // Each seated player sees the Rematch button. Black asks first, White sees it.
  await expect(a.locator('#rematch')).toBeVisible();
  await expect(b.locator('#rematch')).toBeVisible();
  await a.locator('#rematch').click();
  await expect(a.locator('#hud .rematch')).toHaveText('You asked for a rematch. Waiting for White...');
  await expect(a.locator('#rematch')).toBeDisabled();
  await expect(b.locator('#hud .rematch')).toHaveText('Black asks for a rematch.');
  await expect(status(a)).toHaveText('You are Black. White is here.'); // nothing starts on one ask

  // White asks too: a new game, colours swapped, nothing played yet.
  await b.locator('#rematch').click();
  await expect(status(a)).toHaveText('You are White. Black is here.');
  await expect(status(b)).toHaveText('You are Black. White is here.');
  for (const page of [a, b]) {
    await expect(page.locator('#hud .turn')).toHaveText('Black to move');
    await expect.poll(() => plies(page)).toBe(0);
    await expect(page.locator('#rematch')).toBeHidden();
    await expect(page.locator('#hud .rematch')).toHaveCount(0);
  }

  // The former Black cannot open the new game, the new Black (page B) does and page A sees it.
  await play(a, 0, -2);
  await cell(a, 0, -1);
  expect(await plies(a)).toBe(0);
  await play(b, 0, 2);
  await cell(b, 0, 1);
  await expect.poll(() => plies(a)).toBe(1);
  await expect(a.locator('#hud .turn')).toHaveText('White to move');
  await expect(b.locator('#hud .turn')).toHaveText('White to move');
  await play(a, 0, -2); // and the new White answers
  await cell(a, 0, -1);
  await expect.poll(() => plies(b)).toBe(2);
  await expect(a.locator('#hud')).not.toContainText('refused');
  await expect(b.locator('#hud')).not.toContainText('refused');
  await a.context().close();
  await b.context().close();
});

// Issue #226: a player back after a drop catches up on the move it missed. Page B's connection breaks
// before page A notices (Trystero sees a peer leave only after a timeout), so A still plays and its move
// is lost on the way. B comes back on the same key: A sends it the signed move it missed.
test('a player back after a drop shows the same ply and side to move as the other page, #226', async ({ browser }) => {
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  const lost = new Set<string>();
  await room({ a, b }, lost);
  await a.goto('./?bot=off&net=hook');
  await a.locator('canvas').waitFor();
  await expect(a.locator('#hud')).not.toBeEmpty();
  await a.locator('#play-online').click();
  const hash = new URL(await a.locator('#invite').inputValue()).hash;
  await b.goto(`./?net=hook${hash}`);
  await b.locator('canvas').waitFor();
  await open(a);
  await open(b);
  await seat(b, 'player');
  await expect(status(a)).toHaveText('You are Black. White is here.');
  await play(a, 0, 2);
  await play(a, 0, 1);
  await expect.poll(() => plies(b)).toBe(1);
  await play(b, 0, -2);
  await play(b, 0, -1);
  await expect.poll(() => plies(a)).toBe(2);

  // B's connection breaks: B sees Black leave, A does not notice yet and plays.
  lost.add('b');
  await leave(b, 'a');
  await expect(status(b)).toHaveText('You are White. Black is disconnected.');
  await play(a, 0, 1);
  await play(a, 0, 2);
  await expect(a.locator('#hud .turn')).toHaveText('White to move');
  expect(await plies(a)).toBe(3);
  expect(await plies(b)).toBe(2);
  await expect(b.locator('#hud .turn')).toHaveText('Black to move');

  // A notices, then both come back on the same keys: B catches up on the move it missed.
  await leave(a, 'b');
  lost.delete('b');
  await open(a);
  await open(b);
  await expect.poll(() => plies(b)).toBe(3);
  for (const page of [a, b]) await expect(page.locator('#hud .turn')).toHaveText('White to move');
  await expect(status(b)).toHaveText('You are White. Black is here.');
  await expect(status(a)).toHaveText('You are Black. White is here.');

  // And the game goes on from there.
  await cell(b, 0, -1);
  await cell(b, 0, -2);
  await expect.poll(() => plies(a)).toBe(4);
  for (const page of [a, b]) await expect(page.locator('#hud')).not.toContainText('refused');
  await a.context().close();
  await b.context().close();
});

// Issue #232: the moves a peer catches up on show at once, without their ejection effect. Black pushes a
// White marble off in the 3v2 push of eject.spec.ts, then a spectator joins: it shows the score of that
// ply, and no effect ever started on it (recorded in the page, so a slow runner cannot miss one).
test('a spectator joining after an ejection shows the score at once, with no ejection effect, #232', async ({ browser }) => {
  const [a, b, c] = await Promise.all([0, 1, 2].map(async () => (await browser.newContext()).newPage()));
  const lost = new Set(['c']); // the spectator is not there yet
  await room({ a, b, c }, lost);
  await a.goto('./?bot=off&net=hook');
  await a.locator('canvas').waitFor();
  await expect(a.locator('#hud')).not.toBeEmpty();
  await a.locator('#play-online').click();
  const hash = new URL(await a.locator('#invite').inputValue()).hash;
  await b.goto(`./?net=hook${hash}`);
  await b.locator('canvas').waitFor();
  await open(a);
  await open(b);
  await seat(b, 'player');
  await expect(status(a)).toHaveText('You are Black. White is here.');
  const plays: [Page, ...[number, number][]][] = [
    [a, [-2, 2], [-2, 3], [-2, 4], [-2, 1]], // Black trio NW
    [b, [0, -3], [0, -2], [-1, -2]], // White pair SW
    [a, [-2, 1], [-2, 2], [-2, 3], [-2, 0]], // Black trio NW
    [b, [-1, -2], [-1, -1], [-2, -2]], // White pair W, into the Black column
    [a, [-2, 0], [-2, 1], [-2, 2], [-2, -1]], // 3v2 push, the last White marble leaves
  ];
  for (const [ply, [page, ...cells]] of plays.entries()) {
    const press = ply < plays.length - 1 ? play : cell; // the last ply goes through the mouse
    for (const [q, r] of cells) await press(page, q, r);
    await expect.poll(() => plies(page === a ? b : a)).toBe(ply + 1); // the other page replayed it
  }
  const score = 'Black ejected 1/6 · White ejected 0/6';
  for (const page of [a, b]) {
    await expect(page.locator('#hud .score')).toHaveText(score);
    await expect(page.locator('body')).toHaveAttribute('data-ejections', '1'); // a live move plays its effect
  }

  await c.goto(`./?net=hook${hash}`);
  await c.locator('canvas').waitFor();
  await c.evaluate(() => {
    const w = window as any;
    w.__effects = [];
    new MutationObserver((changes) => w.__effects.push(...changes.map((ch) => ch.attributeName))).observe(document.body, {
      attributeFilter: ['data-ejecting', 'data-ejections', 'data-sound'],
    });
  });
  lost.delete('c');
  await open(c);
  // A Hello round trip, then a Sync answered by both players, each record verified: slow with three WebGL pages.
  await expect(c.locator('body')).toHaveAttribute('data-seat', 'spectator', { timeout: 30_000 });
  await expect.poll(() => plies(c), { timeout: 30_000 }).toBe(5);
  await expect(c.locator('#hud .score')).toHaveText(score);
  await expect(c.locator('#hud .turn')).toHaveText('White to move');
  await expect(c.locator('#hud .pip.out')).toHaveCount(1); // the ejected marble shows
  expect(await c.evaluate(() => (window as any).__effects)).toEqual([]);
  expect(await c.evaluate(() => document.body.dataset.ejecting)).toBeUndefined();
  await expect(c.locator('#hud')).not.toContainText('refused');
  for (const page of [a, b, c]) await page.context().close();
});

// Issue #194: offline, Play online is disabled with a notice. Back online, it works again without a reload.
test('Play online is disabled with a notice while offline and works again back online, #194', async ({ page, context }) => {
  await page.goto('./?bot=off&net=hook');
  await page.locator('canvas').waitFor();
  const button = page.locator('#play-online');
  await expect(button).toBeEnabled();

  await context.setOffline(true);
  await expect(button).toBeDisabled();
  await expect(page.locator('#hud')).toContainText('online play needs a connection');

  await context.setOffline(false);
  await expect(button).toBeEnabled();
  await expect(page.locator('#hud')).not.toContainText('online play needs a connection');
  await button.click();
  await expect(page.locator('#hud')).toContainText('You are Black');
});

// Issue #187: online games end by anti-stalling exactly like hot-seat (rules.md sections 9 and 10.2).
// The move list of the rematch test above, one marble each there and back twice, is played first in
// hot-seat on one page, then online between two pages: after every ply both online pages show the
// turn and score lines the hot-seat page showed, the draw by threefold repetition at ply 8 included.
// The no-ejection cap needs 100 plies: src/antistalling.test.ts checks it on two real sessions.
test('threefold repetition ends an online game as a draw on both pages, as in hot-seat, #187', async ({ browser }) => {
  const plays: [number, number, number, number][] = [
    [0, 2, 0, 1],
    [0, -2, 0, -1],
    [0, 1, 0, 2],
    [0, -1, 0, -2],
  ];
  const shown = (page: Page) => Promise.all(['.turn', '.score'].map((c) => page.locator(`#hud ${c}`).textContent()));

  const hot = await (await browser.newContext()).newPage();
  await calm(hot);
  await hot.goto('./?bot=off');
  await hot.locator('canvas').waitFor();
  await expect(hot.locator('#hud')).toContainText('Black to move');
  const hotSeat: (string | null)[][] = [];
  for (let ply = 0; ply < 8; ply++) {
    const [fq, fr, tq, tr] = plays[ply % 4]!;
    const press = ply < 7 ? play : cell; // the last ply goes through the mouse
    await press(hot, fq, fr);
    await press(hot, tq, tr);
    await expect.poll(() => plies(hot)).toBe(ply + 1);
    hotSeat.push(await shown(hot));
  }
  expect(hotSeat[3]).toEqual(['Black to move', 'Black ejected 0/6 · White ejected 0/6']); // the start position twice: the game goes on
  expect(hotSeat[7]).toEqual(['Draw', 'Draw by threefold repetition · Black ejected 0/6 · White ejected 0/6']);
  await hot.context().close();

  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  await calm(a, b);
  await room({ a, b });
  await a.goto('./?bot=off&net=hook');
  await a.locator('canvas').waitFor();
  await expect(a.locator('#hud')).not.toBeEmpty();
  await a.locator('#play-online').click();
  const hash = new URL(await a.locator('#invite').inputValue()).hash;
  await b.goto(`./?net=hook${hash}`);
  await b.locator('canvas').waitFor();
  await open(a);
  await open(b);
  await seat(b, 'player');
  await expect(status(a)).toHaveText('You are Black. White is here.');
  for (let ply = 0; ply < 8; ply++) {
    const [fq, fr, tq, tr] = plays[ply % 4]!;
    const [mover, other] = ply % 2 === 0 ? [a, b] : [b, a];
    const press = ply < 7 ? play : cell; // the last ply goes through the mouse
    await press(mover, fq, fr);
    await press(mover, tq, tr);
    await expect.poll(() => plies(other)).toBe(ply + 1); // the other page replayed it
    for (const page of [a, b]) {
      await expect(page.locator('#hud .turn')).toHaveText(hotSeat[ply]![0]!);
      await expect(page.locator('#hud .score')).toHaveText(hotSeat[ply]![1]!);
    }
  }
  await expect(a.locator('#hud')).not.toContainText('refused');
  await expect(b.locator('#hud')).not.toContainText('refused');
  await a.context().close();
  await b.context().close();
});
