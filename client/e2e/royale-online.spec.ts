import { expect, test, type Page } from '@playwright/test';
import { openModes } from './modes';

// The online battle royale (#504, docs/specs/tech.md section 6) between three browser contexts. The transport is the
// ?net=hook test hook: the test relays every message from one page to the others, so no public Nostr relay is
// involved. ?round=1500 makes the round deadline 1.5 s.

// Every page relays its messages to the others with its own name as the sender, like a Trystero room, or to the one
// page `to` names. A page whose session does not exist yet has no __netIn: the message is dropped for it (#249).
const relay = async (pages: Record<string, Page>) => {
  for (const [name, page] of Object.entries(pages)) {
    await page.exposeFunction('__netOut', (rec: unknown, to?: string) =>
      Promise.all(
        Object.entries(pages)
          .filter(([n, p]) => p !== page && !p.isClosed() && (!to || to === n))
          .map(([, p]) => p.evaluate(([r, from]) => (window as any).__netIn?.(r, from), [rec, name] as const)),
      ),
    );
  }
};
// The hook transport exists once the page went online, after its textures loaded (bug #238): data-seat says so.
const open = async (page: Page) => {
  await page.locator('body[data-seat]').waitFor({ state: 'attached' });
  await page.evaluate(() => (window as any).__netOpen());
};
const seated = (page: Page) => expect(page.locator('body')).toHaveAttribute('data-seat', 'player', { timeout: 15_000 });
const reveal = (page: Page) => page.locator('#hud .reveal li');

test('three players: a round resolves at its deadline, the silent player holds, then the bot plays its seat until it is back (#504, #673, #674)', async ({ browser }) => {
  const [a, b, c] = await Promise.all([0, 1, 2].map(async () => (await browser.newContext()).newPage()));
  await relay({ a, b, c });
  // Reduced motion: the reveal shows at once, no animation is checked here.
  await Promise.all([a, b, c].map((p) => p.emulateMedia({ reducedMotion: 'reduce' })));

  await a.goto('./?bot=off&net=hook&round=1500');
  await expect(a.locator('#hud')).not.toBeEmpty(); // the mode menu's listeners are wired
  await openModes(a);
  await a.getByRole('button', { name: 'Battle royale', exact: true }).click();
  await a.getByRole('button', { name: 'Invite' }).click(); // the offline game becomes a room
  const hash = new URL(await a.locator('#invite').inputValue()).hash;
  expect(hash).toMatch(/^#royale=[\w-]+$/);
  await Promise.all([b, c].map((p) => p.goto(`./?bot=off&net=hook&round=1500${hash}`)));
  await open(a);
  await open(b);
  await seated(b); // seat 2, then c takes seat 3
  await open(c);
  await seated(c);
  await expect(a.locator('#hud .presence')).toHaveText('3 players in. Start: bots take the empty seats');

  await a.getByRole('button', { name: 'Start' }).click();
  for (const p of [a, b, c]) await expect(p.locator('body')).toHaveAttribute('data-net', 'choosing');
  // a orders (-2, 6) NW, b holds, c says nothing.
  await a.evaluate(() => [(window as any).__click(-2, 6), (window as any).__click(-2, 5)]);
  await b.getByRole('button', { name: 'Hold' }).click();
  await expect(a.locator('#hud .presence')).toHaveText('Order locked, waiting for the others...');
  // The order deadline counts down on the plate of the silent page (#673).
  const deadline = c.locator('#hud .presence + .deadline');
  await expect(deadline).toHaveText('Order deadline: 2 s');
  await expect(deadline).toHaveText('Order deadline: 1 s');

  for (const p of [a, b, c]) await expect(p.locator('body')).toHaveAttribute('data-royale', '2');
  await a.waitForTimeout(1700); // a loaded machine (#707): the next round deadline passes before the reveal is read
  await expect(reveal(a).nth(0)).toHaveText('You: moved');
  await expect(reveal(a).nth(1)).toHaveText('Player 2: held');
  await expect(reveal(a).nth(2)).toHaveText('Player 3: held');
  await expect(reveal(c).nth(0)).toHaveText('Player 1: moved');
  await expect(reveal(c).nth(2)).toHaveText('You: held');
  // c says nothing in round 2 either: from round 3 on, the bot plays its seat on every page (#674).
  const seat3 = (p: Page, name: string) => reveal(p).filter({ hasText: new RegExp(`^${name}: `) });
  for (const round of [2, 3]) {
    for (const p of [a, b]) await expect(p.locator('body')).toHaveAttribute('data-net', 'choosing');
    for (const p of [a, b]) await p.getByRole('button', { name: 'Hold' }).click();
    for (const p of [a, b, c]) await expect(p.locator('body')).toHaveAttribute('data-royale', String(round + 1));
  }
  await expect(seat3(a, 'Player 3')).toHaveText(/^Player 3: (moved|fizzled)/);
  await expect(seat3(c, 'You')).toHaveText(/^You: (moved|fizzled)/);
  // c is back: its Hold retakes the seat.
  for (const p of [a, b, c]) await p.getByRole('button', { name: 'Hold' }).click();
  for (const p of [a, b, c]) await expect(p.locator('body')).toHaveAttribute('data-royale', '5');
  await expect(seat3(a, 'Player 3')).toHaveText('Player 3: held');
  await expect(seat3(c, 'You')).toHaveText('You: held');
  for (const p of [a, b, c]) await expect(p.locator('body')).toHaveAttribute('data-desync', '0');
  for (const p of [a, b, c]) await p.context().close(); // their WebGL pages would slow the next test (#120)
});
