import { expect, test, type Page } from '@playwright/test';

// New game (#230): it leaves the local game in progress for the start position, bot on or off as it was,
// and deletes its save (#218). Once a move is played the first press asks "Confirm new game" for a few
// seconds and only a second press starts over. Online, boss and daily games have no New game button.
// The confirmation runs on the page clock: the tests pause it while they press, so a slow machine, where a
// click waits seconds for a frame, never lets it lapse between two presses (page.clock, installed by `load`).

/** Opens `url` with the page clock installed, flowing in real time until `pause`. */
async function load(page: Page, url: string): Promise<void> {
  await page.clock.install();
  await page.goto(url);
  await ready(page);
}

/** Moves the page clock 1 s on and stops it: no timer fires and nothing is drawn until `runFor` or `resume`. */
const pause = async (page: Page) => page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));

/** Waits for a loaded page to show its game and be ready for clicks. */
async function ready(page: Page): Promise<void> {
  await page.locator('canvas').waitFor();
  await expect(page.locator('#hud')).toContainText('to move');
  await expect(page.locator('#new-game')).toBeEnabled(); // listener ready
  // __cellToScreen reads the camera, which is only set after the first rendered frame.
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => done(null))));
}

async function click(page: Page, q: number, r: number): Promise<void> {
  const p = await page.evaluate(([cq, cr]) => (window as any).__cellToScreen(cq, cr), [q, r]);
  await page.mouse.click(p.x, p.y);
}

/** Moves one marble: select it, then click the cell it goes to. */
async function move(page: Page, from: [number, number], to: [number, number]): Promise<void> {
  await click(page, ...from);
  await click(page, ...to);
}

const plies = (page: Page) => page.evaluate(() => (window as any).__plies() as number);

/** Moves of the saved local game, read from the page's real IndexedDB; 0 when nothing is saved. */
const savedPlies = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<number>((done) => {
        const req = indexedDB.open('ab-alone');
        req.onupgradeneeded = () => req.transaction!.abort(); // never create the page's database here
        req.onerror = () => done(0);
        req.onsuccess = () => {
          const db = req.result;
          const get = db.transaction('game').objectStore('game').get('local');
          get.onsuccess = () => {
            db.close();
            done(get.result?.moves.length ?? 0);
          };
        };
      }),
  );

/** What the start position shows: no ply, Black to move, nothing ejected, the opening legal moves. */
const position = async (page: Page) => ({
  plies: await plies(page),
  legal: await page.evaluate(() => (window as any).__legal()),
  turn: await page.locator('#hud .turn').textContent(),
  score: await page.locator('#hud .score').textContent(),
});

test('New game asks for a confirmation, then starts over from the start position and deletes the save', async ({
  page,
}) => {
  await load(page, './?bot=off');
  const button = page.locator('#new-game');
  const start = await position(page);
  expect(start.plies).toBe(0);
  await expect(button).toHaveText('New game');

  await move(page, [0, 2], [0, 1]); // Black
  await move(page, [0, -2], [0, -1]); // White
  await expect(page.locator('#hud')).toContainText('Black to move');
  await expect.poll(() => savedPlies(page)).toBe(2);

  await pause(page);
  await button.click();
  await expect(button).toHaveText('Confirm new game');
  expect(await plies(page)).toBe(2); // nothing changed yet
  await button.click();
  await expect(button).toHaveText('New game');
  expect(await position(page)).toEqual(start);
  await expect.poll(() => savedPlies(page)).toBe(0);

  await page.clock.resume();
  await page.reload();
  await ready(page);
  expect(await position(page)).toEqual(start);

  // Still hot-seat: Black then White play by hand.
  await move(page, [0, 2], [0, 1]);
  await move(page, [0, -2], [0, -1]);
  expect(await plies(page)).toBe(2);
});

test('New game without a move starts over at once; the confirmation lapses after 4 seconds', async ({ page }) => {
  await load(page, './?bot=off');
  const button = page.locator('#new-game');
  await button.click(); // no move yet: nothing to lose, no confirmation
  await expect(button).toHaveText('New game');
  expect(await plies(page)).toBe(0);

  await move(page, [0, 2], [0, 1]);
  await pause(page);
  await button.click();
  await expect(button).toHaveText('Confirm new game');
  await page.clock.runFor(3_900);
  await expect(button).toHaveText('Confirm new game');
  await page.clock.runFor(100);
  await expect(button).toHaveText('New game'); // lapsed, the game goes on
  expect(await plies(page)).toBe(1);
  await button.click(); // a press after it lapsed asks again
  await expect(button).toHaveText('Confirm new game');
  expect(await plies(page)).toBe(1);
});

test('New game while the bot thinks: its reply to the old game is dropped, the bot plays the new one', async ({
  page,
}) => {
  // The bot worker is held: its requests wait until __releaseBot, so the bot is still thinking when New game starts.
  await page.addInitScript(() => {
    const held: (() => void)[] = [];
    let holding = true;
    let replies = 0;
    const w = window as any;
    w.__heldBot = () => held.length;
    w.__botReplies = () => replies;
    w.__releaseBot = () => {
      holding = false;
      for (const send of held.splice(0)) send();
    };
    const Real = window.Worker;
    w.Worker = class extends Real {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.addEventListener('message', () => replies++); // the page handles the reply in the same task
      }
      postMessage(msg: unknown): void {
        const sent = structuredClone(msg); // what the worker gets is copied now, as postMessage does
        if (holding) held.push(() => super.postMessage(sent));
        else super.postMessage(sent);
      }
    };
  });
  const errors: Error[] = [];
  page.on('pageerror', (e) => errors.push(e));
  await load(page, './');
  const start = await position(page);
  const button = page.locator('#new-game');

  await move(page, [0, 2], [0, 1]);
  await expect.poll(() => page.evaluate(() => (window as any).__heldBot())).toBe(1); // the bot is thinking
  await pause(page);
  await button.click();
  await button.click();
  expect(await position(page)).toEqual(start);
  await page.clock.resume();

  await page.evaluate(() => (window as any).__releaseBot()); // the reply to the old game lands now
  await expect.poll(() => page.evaluate(() => (window as any).__botReplies()), { timeout: 30_000 }).toBe(1);
  expect(await position(page)).toEqual(start);
  expect(errors).toEqual([]);

  // The new game is still against the bot, and the player is not locked out by the old search.
  await move(page, [0, 2], [0, 1]);
  await expect.poll(() => plies(page), { timeout: 30_000 }).toBe(2);
  await expect(page.locator('#hud')).toContainText('Black to move');
  await expect.poll(() => savedPlies(page)).toBe(2);
  expect(errors).toEqual([]);
});

test('no New game button during a boss fight, a daily fight or an online game', async ({ page }) => {
  test.slow(); // three page loads
  const button = page.locator('#new-game');
  await page.goto('./?net=hook');
  await ready(page);
  await expect(button).toBeVisible();
  await page.getByRole('button', { name: 'Boss fight' }).click();
  await page.locator('#boss-list').getByRole('button', { name: 'The Echo' }).click();
  await expect(page.locator('#hud')).toContainText('The Echo');
  await expect(button).toBeHidden();

  await page.goto('./?net=hook');
  await ready(page);
  await page.locator('#daily').click();
  await expect(page.locator('#hud')).toContainText('Daily challenge');
  await expect(button).toBeHidden();

  await page.goto('./?net=hook');
  await ready(page);
  await page.getByRole('button', { name: 'Play online' }).click();
  await expect(page.locator('#hud')).toContainText('Waiting for an opponent');
  await expect(button).toBeHidden();
});
