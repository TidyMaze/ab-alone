import { expect, test, type Page } from '@playwright/test';
import { generateKeyPairSync, sign } from 'node:crypto';
import { openModes } from './modes';

// The opponent's Hello is signed here with Node's Ed25519, over the bytes helloPayload signs in the client.
// The page receives it through the ?net=hook transport, so no peer and no public relay is involved (#255).
const signedHello = (game: string, agent: boolean) => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const pub = (publicKey.export({ format: 'der', type: 'spki' }) as Buffer).subarray(-32).toString('base64');
  const fields = ['hello', game, 2, [], pub, ...(agent ? ['agent'] : [])];
  const sig = sign(null, Buffer.from(JSON.stringify(fields)), privateKey).toString('base64');
  return agent ? { kind: 'hello', game, seat: 2, roster: [], agent: true, pub, sig } : { kind: 'hello', game, seat: 2, roster: [], pub, sig };
};

// Seating and presence run after the hook transport opens: wait for the session, then open it.
const openRoom = async (page: Page) => {
  await page.locator('body[data-seat]').waitFor({ state: 'attached' });
  await page.evaluate(() => (window as any).__netOpen());
};

const status = (page: Page) => page.locator('#hud .presence');

test.use({ viewport: { width: 1280, height: 720 } });

async function creatorRoom(page: Page): Promise<string> {
  await page.goto('./?bot=off&net=hook');
  await page.locator('canvas').waitFor();
  await expect(page.locator('#hud')).not.toBeEmpty(); // refresh() runs after the play-online listener is wired
  await openModes(page);
  await page.locator('#play-online').click();
  const invite = await page.locator('#invite').inputValue();
  const game = /room=([\w-]+)/.exec(invite)?.[1];
  expect(game).toBeTruthy();
  await expect(page.locator('#hud')).toContainText('You are Black');
  await openRoom(page);
  return game!;
}

test('a human White seat is not marked as an agent (before)', async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  const game = await creatorRoom(page);
  await page.evaluate((h) => (window as any).__netIn(h, 'human-peer'), signedHello(game, false));
  await expect(status(page)).toHaveText('You are Black. White is here.');
  await page.screenshot({ path: test.info().outputPath('presence-before.png') });
});

test('an agent White seat is marked in the presence line (after)', async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  const game = await creatorRoom(page);
  await page.evaluate((h) => (window as any).__netIn(h, 'agent-peer'), signedHello(game, true));
  await expect(status(page)).toHaveText('You are Black. White (agent) is here.');
  await page.screenshot({ path: test.info().outputPath('presence-after.png') });
});
