import { expect, test, type Page } from '@playwright/test';
import { openModes } from './modes';

// #1305: the public Open world shows the other heroes. The page runs on the hook transport (?net=hook): the test plays the other
// end of the room through window.__netPeer*, so nothing touches a relay. A far hero gets an arrow at the screen edge with its
// distance in tiles, a near one a marker in the scene; a private seed has no room.
const PUBLIC = 1305;

type Hook = {
  __netPeerOut: (data: Uint8Array, to?: string) => void;
  __netPeerIn: (data: number[], peer: string) => void;
  __netPeerJoin: (peer: string) => void;
  __netPeerLeave: (peer: string) => void;
  __out: number[][];
};

async function enter(page: Page, seed: number): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as Hook;
    w.__out = [];
    w.__netPeerOut = (data) => void w.__out.push(Array.from(data));
  });
  await page.goto(`./?bot=off&net=hook&openworld=${seed}`);
  await page.locator('canvas').waitFor();
  await openModes(page);
  await page.locator('#openworld').click();
  await expect.poll(() => page.evaluate(() => document.body.dataset.openworld)).toBe(String(seed));
}

const pos = (q: number, r: number, seq: number): number[] => [2, 2, (q >> 8) & 255, q & 255, (r >> 8) & 255, r & 255, seq];

test('a far hero shows as an arrow at the screen edge with its distance, a near one as a marker, #1305', async ({ page }) => {
  await enter(page, PUBLIC);
  await page.evaluate(() => (window as unknown as Hook).__netPeerJoin('p'));
  expect(await page.evaluate(() => (window as unknown as Hook).__out)).toContainEqual([2, 1]); // Hello to the peer that joined
  await page.evaluate(
    ([hello, far]) => {
      const w = window as unknown as Hook;
      w.__netPeerIn(hello!, 'p');
      w.__netPeerIn(far!, 'p');
    },
    [[2, 1], pos(0, 60, 0)],
  );
  const edge = page.locator('#openworld-peers .peer-edge');
  await expect(edge).toHaveCount(1);
  await expect(edge).toContainText('60');
  await expect(edge).toHaveAttribute('aria-label', 'Another hero, 60 tiles away');
  const box = (await edge.boundingBox())!;
  const view = page.viewportSize()!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(view.height); // inside the screen
  await page.screenshot({ path: 'test-results/peers-far.png' });

  // The same hero walks next to ours: it is in view, so a marker in the scene and no arrow.
  await page.evaluate((near) => (window as unknown as Hook).__netPeerIn(near, 'p'), pos(1, 0, 1));
  await expect(edge).toHaveCount(0);
  await expect(page.locator('#openworld-peers')).toHaveAttribute('data-peers', '1');
  await page.screenshot({ path: 'test-results/peers-near.png' });

  // It leaves: gone from the screen.
  await page.evaluate(() => (window as unknown as Hook).__netPeerLeave('p'));
  await expect(page.locator('#openworld-peers')).toHaveAttribute('data-peers', '0');
});

test('on a phone screen the arrow stays inside the screen, whichever way the hero is, #1305', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await enter(page, PUBLIC);
  await page.evaluate(() => {
    const w = window as unknown as Hook;
    w.__netPeerJoin('p');
    w.__netPeerIn([2, 1], 'p');
    w.__netPeerIn([2, 2, 0xff, 0xce, 0, 40, 0], 'p'); // q = -50, r = 40
  });
  const edge = page.locator('#openworld-peers .peer-edge');
  await expect(edge).toContainText('50');
  const box = (await edge.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(780);
  await page.screenshot({ path: 'test-results/peers-phone.png' });
});

test('the hero sends its position when it steps, and Escape leaves the room, #1305', async ({ page }) => {
  await enter(page, PUBLIC);
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => page.evaluate(() => (window as unknown as Hook).__out.filter((m) => m[1] === 2).length)).toBeGreaterThanOrEqual(2);
  await page.keyboard.press('Escape');
  await expect(page.locator('#openworld-peers')).toBeHidden();
});

test('a private seed has no room: no position leaves the page, #1305', async ({ page }) => {
  await enter(page, 7);
  await page.evaluate(() => (window as unknown as Hook).__netPeerJoin?.('p'));
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => (window as unknown as Hook).__out)).toEqual([]);
});

test('a public name goes out in the Hello and shows over a near hero, Hide leaves the room, an error is shown, #1305', async ({ page }) => {
  await enter(page, PUBLIC);
  await expect(page.locator('#openworld-net')).toHaveText('Online: nobody else here yet.');
  await page.locator('#openworld-name').fill('Ana');
  const hellos = () => page.evaluate(() => (window as unknown as Hook).__out.filter((m) => m[1] === 1));
  expect(await hellos()).toContainEqual([2, 1, 65, 110, 97]);
  await page.keyboard.press('Escape'); // typed in the field: the world is not left
  await expect(page.locator('body')).toHaveAttribute('data-openworld', String(PUBLIC));
  await page.evaluate(() => {
    const w = window as unknown as Hook;
    w.__netPeerIn([2, 1, 66, 111, 98], 'p'); // Bob, standing next to us
    w.__netPeerIn([2, 2, 0, 1, 0, 0, 0], 'p');
  });
  await expect(page.locator('.peer-tag')).toHaveText('Bob');
  await expect(page.locator('#openworld-net')).toHaveText('Online: 1 other hero here.');
  await page.screenshot({ path: 'test-results/peers-named.png' });
  await page.locator('#openworld-hide').click();
  await expect(page.locator('#openworld-net')).toContainText('Hidden');
  await expect(page.locator('.peer-tag')).toHaveCount(0);
  await page.locator('#openworld-hide').click();
  await expect(page.locator('#openworld-hide')).toHaveText('Hide');
  await page.evaluate(() => (window as unknown as Hook & { __netPeerError: (m: string) => void }).__netPeerError('could not connect to peer p after exchanging SDP'));
  await expect(page.locator('#openworld-net')).toContainText('the direct connection failed');
});

// The HUD of the public world on a phone (390x844): the name field and Hide are touch targets of 44 px, and the plate leaves the hero
// and the troop (the centre of the screen) free. A hero on our own cell is lifted above ours.
test('on a phone the name field and Hide are 44 px high and the plate leaves the play area free, #1305', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enter(page, PUBLIC);
  await page.evaluate(() => {
    const w = window as unknown as Hook;
    w.__netPeerJoin('p');
    w.__netPeerIn([2, 1, 66, 111, 98], 'p');
    w.__netPeerIn([2, 2, 0, 0, 0, 0, 0], 'p'); // on our own cell
  });
  await expect(page.locator('.peer-tag')).toHaveText('Bob');
  const field = (await page.locator('#openworld-name').boundingBox())!;
  const hide = (await page.locator('#openworld-hide').boundingBox())!;
  expect(field.height).toBeGreaterThanOrEqual(44);
  expect(hide.height).toBeGreaterThanOrEqual(44);
  const plate = (await page.locator('#openworld-hud').boundingBox())!;
  console.log('plate', JSON.stringify(plate), 'field', JSON.stringify(field), 'hide', JSON.stringify(hide));
  await page.screenshot({ path: 'test-results/peers-phone-hud.png' });
  expect(plate.y).toBeGreaterThanOrEqual(844 * 0.5); // the lower half only: the hero stands at the middle
});
