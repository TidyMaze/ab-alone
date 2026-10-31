import { expect, test, type Page } from '@playwright/test';
import { BLACK_WINS } from './end-games';
import { openModes } from './modes';

// #962: the Open world mode, behind ?openworld=<seed>: the hero rolls over the generated world, an obstacle stops it, and
// Escape leaves to the board. The test does not name the blocked cell (a change of the terrain constants moves it, #1002): it
// walks right until a press moves nothing, at most 200 steps.
test('the hero rolls over the Open world, an obstacle stops it, and Escape leaves, #965', async ({ page }) => {
  await page.goto('./?bot=off&openworld=7');
  await page.locator('canvas').waitFor();
  await openModes(page);
  await page.locator('#openworld').click();
  const at = () => page.evaluate(() => document.body.dataset.openworldAt);
  await expect.poll(at).toBe('0,0');
  let before = '0,0';
  let stopped = false;
  for (let i = 0; i < 200 && !stopped; i++) {
    await page.keyboard.press('ArrowRight');
    const now = (await at())!;
    stopped = now === before;
    before = now;
  }
  expect(stopped, 'something blocks the way right within 200 steps').toBe(true);
  expect(before).not.toBe('0,0'); // it rolled before it was stopped
  await page.keyboard.press('ArrowRight'); // still blocked
  await expect.poll(at).toBe(before);
  // the cell it came from is open: the step is made, and a push of the troop may carry the hero back onto its cell (#967)
  const pushes = () => page.evaluate(() => document.body.dataset.openworldPush);
  const pushesBefore = await pushes();
  await page.keyboard.press('ArrowLeft');
  await expect.poll(async () => (await at()) !== before || (await pushes()) !== pushesBefore).toBe(true);
  await expect(page.locator('#openworld-hud')).toBeVisible();
  await expect(page.locator('#hud')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.locator('#hud')).toBeVisible();
  expect(await page.evaluate(() => document.body.dataset.openworld)).toBeUndefined();
});

// #1063: while the Open world is on, its arrows roll the hero and do not open the board's replay underneath; Escape leaves
// the world and the board is back as it was. The game (moves played) is loaded through the game file import.
test('the arrows in the Open world do not open the board replay, and leaving the world returns the board, #1063', async ({ page }) => {
  await page.goto('./?bot=off&openworld=7');
  await page.locator('canvas').waitFor();
  const save = JSON.stringify({ version: 1, mode: 'local', layout: 'standard', bot: false, moves: BLACK_WINS });
  await page.locator('#import-file').setInputFiles({ name: 'game.json', mimeType: 'application/json', buffer: Buffer.from(save) });
  await expect(page.locator('body')).toHaveAttribute('data-over', 'win');
  await openModes(page);
  await page.locator('#openworld').click();
  const at = () => page.evaluate(() => document.body.dataset.openworldAt);
  await expect.poll(at).toBe('0,0');
  await page.keyboard.press('ArrowLeft');
  await expect.poll(at).toBe('-1,0');
  await expect(page.locator('#replay-bar')).toHaveJSProperty('hidden', true); // the attribute, not the CSS: the HUD is hidden here anyway
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => document.body.dataset.openworld)).toBeUndefined();
  await expect(page.locator('#replay-bar')).toHaveJSProperty('hidden', true);
  await expect(page.locator('body')).toHaveAttribute('data-over', 'win');
});

// #988: a step up onto a higher cell. On seed 7 the spawn row runs grass at height 3 to (3, 0), then (4, 0) is grass at
// height 4: four Right presses reach it, the cell changes and the page keeps running while the camera eases up (the ease
// itself is unit tested in openworldview.test.ts).
test('the hero steps up onto a higher cell of the Open world and the page keeps running, #988', async ({ page }) => {
  const errors: Error[] = [];
  page.on('pageerror', (error) => errors.push(error));
  await page.goto('./?bot=off&openworld=7');
  await page.locator('canvas').waitFor();
  await openModes(page);
  await page.locator('#openworld').click();
  const at = () => page.evaluate(() => document.body.dataset.openworldAt);
  await expect.poll(at).toBe('0,0');
  for (let i = 1; i <= 4; i++) {
    await page.keyboard.press('ArrowRight');
    await expect.poll(at).toBe(`${i},0`);
  }
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))); // the frames after the step
  expect(errors).toEqual([]);
});

// #966: enemy marbles stand on the map and the troop of 6 trails the hero, the first marble on the cell it just left.
test('enemy marbles are on the map and the troop follows the hero, #966', async ({ page }) => {
  await page.goto('./?bot=off&openworld=7');
  await page.locator('canvas').waitFor();
  await openModes(page);
  await page.locator('#openworld').click();
  const data = (key: 'openworldAt' | 'openworldTroop' | 'openworldEnemies') => page.evaluate((k) => document.body.dataset[k], key);
  await expect.poll(() => data('openworldAt')).toBe('0,0');
  expect(Number(await data('openworldEnemies'))).toBeGreaterThan(0);
  expect((await data('openworldTroop'))!.split(' ')).toHaveLength(6);
  await page.keyboard.press('ArrowUp');
  await expect.poll(() => data('openworldAt')).not.toBe('0,0');
  const before = await data('openworldAt');
  await page.keyboard.press('ArrowUp');
  await expect.poll(() => data('openworldAt')).not.toBe(before);
  expect((await data('openworldTroop'))!.split(' ')[0]).toBe(before);
});

// #977: a vertical and a horizontal arrow held together roll the hero on the diagonal. From (0, 0) Up rolls to (1, -1), the
// cell up-left of that is (1, -2), free on seed 7 (the path of the first test goes through it).
test('two held arrows roll the hero on the diagonal, #977', async ({ page }) => {
  await page.goto('./?bot=off&openworld=7');
  await page.locator('canvas').waitFor();
  await openModes(page);
  await page.locator('#openworld').click();
  const at = () => page.evaluate(() => document.body.dataset.openworldAt);
  await expect.poll(at).toBe('0,0');
  await page.keyboard.down('ArrowUp');
  await expect.poll(at).toBe('1,-1');
  // Up and Left held: the diagonal is the next step of the cadence (#1059), so the first move after the Left keydown is up-left.
  // Read in the page as it is made: the walk goes on while both are held, and a poll could see a later cell.
  const firstMove = page.evaluate(
    () =>
      new Promise<string>((done) => {
        const from = document.body.dataset.openworldAt; // a mark of the same cell (the models arriving) is no move
        const observer = new MutationObserver(() => {
          if (document.body.dataset.openworldAt === from) return;
          observer.disconnect();
          done(document.body.dataset.openworldAt!);
        });
        observer.observe(document.body, { attributes: true, attributeFilter: ['data-openworld-at'] });
      }),
  );
  await page.keyboard.down('ArrowLeft');
  expect(await firstMove).toBe('1,-2');
  await page.keyboard.up('ArrowLeft');
  await page.keyboard.up('ArrowUp');
});

// #1059: a held arrow walks the hero on its own, one cell per 140 ms, with no key repeat: the keydown steps at once, the frames
// step while it is held, and the keyup stops it. The spawn's clearing is open to 3 cells on every seed, so 3 cells are walked
// within 3 s with no obstacle in the way, and the walk stops once the arrow is let go.
test('a held arrow walks the Open world on its own and stops on keyup, #1059', async ({ page }) => {
  await page.goto('./?bot=off&openworld=7');
  await page.locator('canvas').waitFor();
  await openModes(page);
  await page.locator('#openworld').click();
  const at = () => page.evaluate(() => document.body.dataset.openworldAt);
  await expect.poll(at).toBe('0,0');
  await page.keyboard.down('ArrowRight');
  await expect.poll(at).toBe('1,0'); // the keydown's own step
  await expect.poll(at, { timeout: 3000 }).toBe('3,0'); // the frames walk on: no key repeat is sent for a key held down
  await page.keyboard.up('ArrowRight');
  const stopped = await at();
  await page.evaluate(() => new Promise((done) => setTimeout(done, 400)));
  expect(await at()).toBe(stopped); // let go: no more steps
});

// #976: the wheel zooms the Open world camera out far and back, and the hero still rolls from the far zoom.
test('the wheel zooms the Open world out far and back, and the hero still rolls, #976', async ({ page }) => {
  await page.goto('./?bot=off&openworld=7');
  await page.locator('canvas').waitFor();
  await openModes(page);
  await page.locator('#openworld').click();
  const zoom = async () => Number(await page.evaluate(() => document.body.dataset.openworldZoom));
  await expect.poll(zoom).toBe(1);
  const box = (await page.locator('canvas').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 2000);
  await expect.poll(zoom).toBeGreaterThan(2.5); // far out
  // still 3D: the ground, the props, the troop and the enemies are all drawn
  const drawn = await page.evaluate(() => JSON.parse(document.body.dataset.openworldDrawn!) as Record<string, number>);
  expect(drawn['terrain-grass']).toBeGreaterThan(0);
  expect(drawn['prop-tree']).toBeGreaterThan(0);
  expect(drawn.troop).toBe(6);
  expect(drawn.enemies).toBeGreaterThan(0);
  await page.mouse.wheel(0, -2000);
  await expect.poll(zoom).toBe(1);
  await page.mouse.wheel(0, 2000);
  await expect.poll(zoom).toBeGreaterThan(2.5);
  await page.keyboard.press('ArrowUp');
  await expect.poll(() => page.evaluate(() => document.body.dataset.openworldAt)).toBe('1,-1');
});

// #976: the loaded chunks cover the ground in view at every zoom, so the edge of the loaded area never shows: on a 32:9 screen
// at the widest zoom, the four edge strips of a screenshot have no pixel of the background colour (#0b1220).
test('the widest zoom on a 32:9 screen shows no black background at its edges, #976', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 540 });
  await page.goto('./?bot=off&openworld=7');
  await page.locator('canvas').waitFor();
  await openModes(page);
  await page.locator('#openworld').click();
  const box = (await page.locator('canvas').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 5000); // as far out as the screen allows
  await expect.poll(async () => Number(await page.evaluate(() => document.body.dataset.openworldZoom))).toBeGreaterThan(2.5);
  // a 32:9 screen stops before the 16:9 widest zoom (6): its reach would pass MAX_REACH further out
  expect(Number(await page.evaluate(() => document.body.dataset.openworldZoom))).toBeLessThan(6);
  const png = await page.screenshot();
  const background = await page.evaluate(async (base64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${base64}`;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const strip = (x: number, y: number, w: number, h: number): number => {
      const d = ctx.getImageData(x, y, w, h).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i]! - 11) <= 2 && Math.abs(d[i + 1]! - 18) <= 2 && Math.abs(d[i + 2]! - 32) <= 2) n++;
      return n;
    };
    const { width: w, height: h } = canvas;
    return { top: strip(0, 0, w, 6), bottom: strip(0, h - 6, w, 6), left: strip(0, 0, 6, h), right: strip(w - 6, 0, 6, h) };
  }, png.toString('base64'));
  expect(background).toEqual({ top: 0, bottom: 0, left: 0, right: 0 });
});

// #989: the props within 8 cells of the hero are drawn with their detailed models once those load, the low-poly ones beyond.
test('the props near the hero are drawn detailed, the ones beyond low-poly, #989', async ({ page }) => {
  await page.goto('./?bot=off&openworld=7');
  await page.locator('canvas').waitFor();
  await openModes(page);
  await page.locator('#openworld').click();
  await expect.poll(() => page.evaluate(() => document.body.dataset.openworld)).toBe('7'); // entered: the world is drawn
  const drawn = () => page.evaluate(() => JSON.parse(document.body.dataset.openworldDrawn!) as Record<string, number>);
  const DETAILED = ['prop-mountain-hi', 'prop-tree-hi', 'prop-boulder-hi', 'prop-wall-hi'];
  const LOW = ['prop-mountain', 'prop-tree', 'prop-boulder', 'prop-wall'];
  const sum = (counts: Record<string, number>, keys: string[]) => keys.reduce((total, k) => total + (counts[k] ?? 0), 0);
  await expect.poll(async () => sum(await drawn(), DETAILED)).toBeGreaterThan(0); // the detailed models arrive, then near the hero
  const counts = await drawn();
  expect(sum(counts, LOW)).toBeGreaterThan(0); // and the low-poly ones beyond
  expect(counts['prop-tree-hi']).toBeLessThanOrEqual(217);
});

// #1000: the entry is in the mode menu for everyone, and a click enters a world with a random seed.
test('the Open world is in the mode menu without the flag, and a click enters a random world, #1000', async ({ page }) => {
  await page.goto('./?bot=off');
  await page.locator('canvas').waitFor();
  await openModes(page);
  await expect(page.locator('#openworld')).toBeVisible();
  await page.locator('#openworld').click();
  await expect.poll(() => page.evaluate(() => document.body.dataset.openworld)).toMatch(/^\d+$/);
});

// #967: the troop pushes the enemy in front of it after a step. The fixture puts the hero on (0, 0) with two troop marbles
// behind it and one enemy on (2, 0): one Right press rolls the hero onto (1, 0), the line of three pushes the enemy on to
// (3, 0) and the hero along with it, to (2, 0). The state is final at once; the push is drawn as an animation of 0.7 s.
test('the troop pushes the enemy in front of it after a step, and the enemy moves on, #967', async ({ page }) => {
  await page.goto('./?bot=off&openworld=7');
  await page.locator('canvas').waitFor();
  await openModes(page);
  await page.locator('#openworld').click();
  await expect.poll(() => page.evaluate(() => document.body.dataset.openworld)).toBe('7'); // entered: the world is drawn
  await page.evaluate(() =>
    (window as unknown as { __openworldFixture: (f: object) => void }).__openworldFixture({
      hero: [0, 0],
      troop: [[-1, 0], [-2, 0]],
      enemies: [[2, 0]],
    }),
  );
  await page.keyboard.press('ArrowRight');
  // The push is drawn as an animation at once (the state was final before it): the mark is up until its lunge, slide and fall are over.
  expect(await page.evaluate(() => document.body.dataset.openworldAnim)).toBe('1');
  await expect.poll(() => page.evaluate(() => document.body.dataset.openworldPush)).toBe('1');
  expect(await page.evaluate(() => document.body.dataset.openworldAt)).toBe('2,0');
  expect(await page.evaluate(() => document.body.dataset.openworldTroop)).toBe('1,0 0,0 -2,0');
  expect(await page.evaluate(() => (window as unknown as { __openworldEnemies: () => number[][] }).__openworldEnemies())).toEqual([[3, 0]]);
  expect(await page.evaluate(() => document.body.dataset.openworldBeaten)).toBe('0');
  await expect.poll(() => page.evaluate(() => document.body.dataset.openworldAnim), { timeout: 1500 }).toBeUndefined();
});

// #967: with reduced motion the push is not drawn in between: the marbles jump to their cells, as before.
test('with reduced motion the troop pushes the enemy at once, with no animation, #967', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./?bot=off&openworld=7');
  await page.locator('canvas').waitFor();
  await openModes(page);
  await page.locator('#openworld').click();
  await expect.poll(() => page.evaluate(() => document.body.dataset.openworld)).toBe('7'); // entered: the world is drawn
  await page.evaluate(() =>
    (window as unknown as { __openworldFixture: (f: object) => void }).__openworldFixture({
      hero: [0, 0],
      troop: [[-1, 0], [-2, 0]],
      enemies: [[2, 0]],
    }),
  );
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => page.evaluate(() => document.body.dataset.openworldPush)).toBe('1');
  expect(await page.evaluate(() => document.body.dataset.openworldAt)).toBe('2,0');
  expect(await page.evaluate(() => document.body.dataset.openworldAnim)).toBeUndefined();
});

// #968: the Open world is saved after a push and resumed by the menu after a reload: the hero, the troop and the enemy the
// push moved are where they were left. The save is counted on the page (openworldSaved) once it is stored.
test('the Open world is saved after a push and resumes after a reload, the troop and the enemy where they were, #968', async ({ page }) => {
  await page.goto('./?bot=off&openworld=7');
  await page.locator('canvas').waitFor();
  await openModes(page);
  await page.locator('#openworld').click();
  const at = () => page.evaluate(() => document.body.dataset.openworldAt);
  await expect.poll(at).toBe('0,0');
  await page.evaluate(() =>
    (window as unknown as { __openworldFixture: (f: object) => void }).__openworldFixture({
      hero: [0, 0],
      troop: [[-1, 0], [-2, 0]],
      enemies: [[2, 0]],
    }),
  );
  await page.keyboard.press('ArrowRight');
  await expect.poll(at).toBe('2,0');
  await expect.poll(() => page.evaluate(() => document.body.dataset.openworldSaved)).toBe('1');
  await page.reload();
  await page.locator('canvas').waitFor();
  await openModes(page);
  await page.locator('#openworld').click();
  await expect.poll(at).toBe('2,0');
  expect(await page.evaluate(() => document.body.dataset.openworldTroop)).toBe('1,0 0,0 -2,0');
  expect(await page.evaluate(() => (window as unknown as { __openworldEnemies: () => number[][] }).__openworldEnemies())).toEqual([[3, 0]]);
});

// #968: a save of another world version is not loaded: the world starts on the spawn and the stale record is deleted. The record
// is written by hand in the page's IndexedDB (the game store of the ab-alone database) at the seed's key, as an old build left it.
test('a save of another world version is ignored and deleted, the world starts on the spawn, #968', async ({ page }) => {
  await page.goto('./?bot=off&openworld=7');
  await page.locator('canvas').waitFor();
  const stale = { version: 0, seed: 7, hero: [2, 0], troop: [], fight: { removed: [], added: [], beaten: 0 }, savedAt: 1 };
  const store = () =>
    page.evaluate(
      () =>
        new Promise<unknown>((done, fail) => {
          const open = indexedDB.open('ab-alone', 1);
          open.onerror = () => fail(open.error);
          open.onsuccess = () => {
            const get = open.result.transaction('game', 'readonly').objectStore('game').get('openworld:7');
            get.onsuccess = () => {
              open.result.close();
              done(get.result ?? null);
            };
          };
        }),
    );
  await page.evaluate(
    (record) =>
      new Promise<void>((done, fail) => {
        const open = indexedDB.open('ab-alone', 1);
        open.onerror = () => fail(open.error);
        open.onsuccess = () => {
          const tx = open.result.transaction('game', 'readwrite');
          tx.objectStore('game').put(record, 'openworld:7');
          tx.oncomplete = () => {
            open.result.close();
            done();
          };
        };
      }),
    stale,
  );
  expect(await store()).toEqual(stale);
  await page.reload();
  await page.locator('canvas').waitFor();
  await openModes(page);
  await page.locator('#openworld').click();
  await expect.poll(() => page.evaluate(() => document.body.dataset.openworldAt)).toBe('0,0');
  await expect.poll(store).toBeNull();
});

// #1021: New world asks in the page before it discards the save of the world, Keep goes on with the same seed, and Discard starts
// a random one with the seed in the HUD and the URL. A reload of the seed left starts it on the spawn: its save is gone.
test('New world confirms in the page, discards the save of the world left and starts a random seed, #1021', async ({ page }) => {
  await page.goto('./?bot=off&openworld=7');
  await page.locator('canvas').waitFor();
  await openModes(page);
  await page.locator('#openworld').click();
  const at = () => page.evaluate(() => document.body.dataset.openworldAt);
  await expect.poll(at).toBe('0,0');
  await page.keyboard.press('ArrowUp');
  await expect.poll(at).not.toBe('0,0');
  await expect.poll(() => page.evaluate(() => document.body.dataset.openworldSaved)).toBe('1');
  await expect(page.locator('#openworld-seed')).toHaveText('7');
  await page.locator('#openworld-new').click();
  await expect(page.locator('#openworld-confirm')).toBeVisible();
  await page.locator('#openworld-keep').click();
  await expect(page.locator('#openworld-confirm')).toBeHidden();
  await expect(page.locator('#openworld-seed')).toHaveText('7');
  await page.locator('#openworld-new').click();
  await page.locator('#openworld-discard').click();
  await expect(page.locator('#openworld-seed')).not.toHaveText('7');
  await expect(page.locator('#openworld-seed')).toHaveText(/^\d+$/);
  await expect.poll(() => page.evaluate(() => new URL(location.href).searchParams.get('openworld'))).toBe(await page.locator('#openworld-seed').textContent());
  expect(await at()).toBe('0,0');
  await page.goto('./?bot=off&openworld=7'); // the save of seed 7 is gone: it starts on the spawn
  await page.locator('canvas').waitFor();
  await openModes(page);
  await page.locator('#openworld').click();
  await expect.poll(at).toBe('0,0');
});

// #1025: on a touch screen a touch on the left half shows the virtual joystick under the thumb; dragging right holds the right key,
// the hero walks on while the thumb is held and stops when it lifts. Touch is emulated through CDP (hasTouch).
test.describe('the touch joystick', () => {
  test.use({ hasTouch: true });
  test('a drag on the left half walks the hero right until the thumb lifts, #1025', async ({ page }) => {
    await page.goto('./?bot=off&openworld=7');
    await page.locator('canvas').waitFor();
    await openModes(page);
    await page.locator('#openworld').click();
    const at = () => page.evaluate(() => document.body.dataset.openworldAt);
    await expect.poll(at).toBe('0,0');
    const cdp = await page.context().newCDPSession(page);
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x: number, y: number) =>
      cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
    await touch('touchStart', 150, 300);
    await expect(page.locator('#joystick')).toBeVisible();
    await touch('touchMove', 200, 300); // 50 px to the right: the right key is held
    await expect.poll(at).not.toBe('0,0');
    await touch('touchEnd', 200, 300);
    await expect(page.locator('#joystick')).toBeHidden();
    const stopped = await at();
    await page.evaluate(() => new Promise((done) => setTimeout(done, 600))); // a held stick would have stepped by now
    expect(await at()).toBe(stopped);
  });
});

// #1051: the settings menu of the Open world opens on screen. The cog is at the right of the column, as in a normal game (#1032 hid
// the dock), so the menu hangs from its right edge and stays inside the window at every size.
async function openSettingsInOpenWorld(page: Page): Promise<void> {
  await page.goto('./?bot=off&openworld=7');
  await page.locator('canvas').waitFor();
  await openModes(page);
  await page.locator('#openworld').click();
  await expect.poll(() => page.evaluate(() => document.body.dataset.openworld)).toBe('7');
  await page.locator('#settings').click();
  await expect(page.locator('#settings-menu')).toBeVisible();
}
async function expectMenuOnScreen(page: Page): Promise<void> {
  const box = (await page.locator('#settings-menu').boundingBox())!;
  const innerWidth = await page.evaluate(() => window.innerWidth);
  expect(box.x, 'left edge of the settings menu').toBeGreaterThanOrEqual(0);
  expect(box.x + box.width, 'right edge of the settings menu').toBeLessThanOrEqual(innerWidth);
}
test('the Open world settings menu is on screen at 1280x720, #1051', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openSettingsInOpenWorld(page);
  await expectMenuOnScreen(page);
});
test('the Open world settings menu is on screen at 1920x1080, #1051', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openSettingsInOpenWorld(page);
  await expectMenuOnScreen(page);
});
test.describe('the Open world settings menu on a touch phone, #1051', () => {
  test.use({ hasTouch: true });
  test('is on screen at 844x390 landscape', async ({ page }) => {
    await page.setViewportSize({ width: 844, height: 390 });
    await openSettingsInOpenWorld(page);
    await expectMenuOnScreen(page);
  });
  test('stays on screen at 390x844 portrait', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openSettingsInOpenWorld(page);
    await expectMenuOnScreen(page);
  });
});

// #1026: Q and E turn the Open world camera round the hero by a step, R goes back to the default angle, and the turn is saved with
// the world, so a reload resumes it (the turn itself is unit tested in openworldview.test.ts and openworldmode.test.ts).
test('Q and E turn the Open world camera round the hero, R goes back, and the turn resumes after a reload, #1026', async ({ page }) => {
  await page.goto('./?bot=off&openworld=7');
  await page.locator('canvas').waitFor();
  await openModes(page);
  await page.locator('#openworld').click();
  const yaw = () => page.evaluate(() => document.body.dataset.openworldYaw);
  await expect.poll(yaw).toBe('0');
  await page.keyboard.press('q');
  await expect.poll(yaw).toBe('30');
  await page.keyboard.press('e');
  await page.keyboard.press('e');
  await expect.poll(yaw).toBe('-30');
  await page.keyboard.press('r');
  await expect.poll(yaw).toBe('0');
  await page.keyboard.press('q');
  await expect.poll(yaw).toBe('30');
  await expect.poll(() => page.evaluate(() => document.body.dataset.openworldSaved)).toBeDefined(); // written after the frame
  await page.reload();
  await page.locator('canvas').waitFor();
  await openModes(page);
  await page.locator('#openworld').click();
  await expect.poll(yaw).toBe('30');
});

// #1040: a step glides the hero from its cell to the next one. The cell is exact at once (`openworldAt`, the save and the push use
// it); only the drawing glides. With the slow factor of 10 the glide lasts 1.4 s, so the browser sees the hero in between.
test('a step glides the hero onto the next cell: exact at once, drawn in between, landed at the end, #1040', async ({ page }) => {
  await page.goto('./?bot=off&openworld=7');
  await page.locator('canvas').waitFor();
  await openModes(page);
  await page.locator('#openworld').click();
  await expect.poll(() => page.evaluate(() => document.body.dataset.openworld)).toBe('7');
  await page.evaluate(() => {
    (window as unknown as { __openworldFixture: (f: object) => void }).__openworldFixture({ hero: [0, 0], troop: [[-1, 0], [-2, 0]], enemies: [] });
    (window as unknown as { __openworldSlow: number }).__openworldSlow = 10;
  });
  await page.keyboard.press('ArrowRight');
  expect(await page.evaluate(() => document.body.dataset.openworldAt)).toBe('1,0');
  await expect.poll(() => page.evaluate(() => document.body.dataset.openworldGlide)).toBeDefined();
  await page.screenshot({ path: test.info().outputPath('glide-mid-step-1.png') });
  await page.waitForTimeout(500); // a second frame of the same glide, further along it
  await page.screenshot({ path: test.info().outputPath('glide-mid-step-2.png') });
  await expect.poll(() => page.evaluate(() => document.body.dataset.openworldGlide), { timeout: 5000 }).toBeUndefined();
  expect(await page.evaluate(() => document.body.dataset.openworldAt)).toBe('1,0');
  expect(await page.evaluate(() => document.body.dataset.openworldAnim)).toBeUndefined();
});

// #1065: a held arrow walks at a constant speed from cell to cell. The page records the hero's drawn place (`openworldGlide`, read after
// each frame of the page) with the frame's time; over windows of 6 frames the speed varies by under 10 %. Before the fix each cell was
// an ease-out to a stop, and the speed over such a window swung between about half and the whole of the walking speed.
test('a held arrow walks the hero at a steady speed from cell to cell, #1065', async ({ page }) => {
  await page.addInitScript(() => {
    const samples: [number, number, number][] = [];
    (window as unknown as { __walk: typeof samples }).__walk = samples;
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) =>
      raf((t) => {
        const read = performance.now(); // the clock the mode draws the glide by (not the callback's frame time, which jitters from it)
        cb(t);
        const at = document.body.dataset.openworldGlide;
        if (at) samples.push([read, ...(at.split(',').map(Number) as [number, number])]);
      });
  });
  await page.goto('./?bot=off&openworld=7');
  await page.locator('canvas').waitFor();
  await openModes(page);
  await page.locator('#openworld').click();
  await expect.poll(() => page.evaluate(() => document.body.dataset.openworld)).toBe('7');
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(2200);
  await page.keyboard.up('ArrowUp');
  const samples = await page.evaluate(() => (window as unknown as { __walk: [number, number, number][] }).__walk);
  const walking = samples.filter(([t]) => t > samples[0]![0] + 600 && t < samples.at(-1)![0] - 400); // past the start, before the stop
  // The path walked, not the chord: a hex grid zigzags going "up", and a window that spans a turn would read slower by its chord.
  const speeds: number[] = [];
  for (let i = 0; i + 6 < walking.length; i++) {
    let path = 0;
    for (let j = i; j < i + 6; j++) path += Math.hypot(walking[j + 1]![1] - walking[j]![1], walking[j + 1]![2] - walking[j]![2]);
    speeds.push(path / (walking[i + 6]![0] - walking[i]![0]));
  }
  expect(speeds.length).toBeGreaterThan(30);
  expect(Math.max(...speeds) / Math.min(...speeds)).toBeLessThan(1.1);
});

// #1043: the marbles carry a stripe that turns with the roll. The camera follows the hero, so the hero stays at the centre of the
// screen: two frames of the same glide, 0.5 s apart, differ in its centre box (the stripe turns across the marble).
test('a glide of the hero turns its stripe: two frames in between differ on the marble, #1043', async ({ page }) => {
  await page.goto('./?bot=off&openworld=7');
  await page.locator('canvas').waitFor();
  await openModes(page);
  await page.locator('#openworld').click();
  await expect.poll(() => page.evaluate(() => document.body.dataset.openworld)).toBe('7');
  await page.evaluate(() => {
    (window as unknown as { __openworldFixture: (f: object) => void }).__openworldFixture({ hero: [0, 0], troop: [[-1, 0]], enemies: [] });
    (window as unknown as { __openworldSlow: number }).__openworldSlow = 10;
  });
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => page.evaluate(() => document.body.dataset.openworldGlide)).toBeDefined();
  const first = await page.screenshot({ path: test.info().outputPath('stripe-mid-glide-1.png') });
  await page.waitForTimeout(500);
  const second = await page.screenshot({ path: test.info().outputPath('stripe-mid-glide-2.png') });
  const difference = await page.evaluate(async ([a, b]) => {
    const centre = async (base64: string) => {
      const img = new Image();
      img.src = `data:image/png;base64,${base64}`;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      return ctx.getImageData(img.width / 2 - 40, img.height / 2 - 40, 80, 80).data;
    };
    const x = await centre(a!);
    const y = await centre(b!);
    let sum = 0;
    for (let i = 0; i < x.length; i++) sum += Math.abs(x[i]! - y[i]!);
    return sum;
  }, [first.toString('base64'), second.toString('base64')] as const);
  expect(difference).toBeGreaterThan(0);
});

// #1100: a step hops. The page records the hero's drawn height (the third number of `openworldGlide`) over a slowed step: it rises
// above the height it has on its cell and is back on it at the end. Reduced motion has no glide, hence no hop.
test('a step hops the hero: it rises mid-step and lands on its cell, #1100', async ({ page }) => {
  await page.goto('./?bot=off&openworld=7');
  await page.locator('canvas').waitFor();
  await openModes(page);
  await page.locator('#openworld').click();
  await expect.poll(() => page.evaluate(() => document.body.dataset.openworld)).toBe('7');
  await page.evaluate(() => {
    (window as unknown as { __openworldFixture: (f: object) => void }).__openworldFixture({ hero: [0, 0], troop: [[-1, 0]], enemies: [] });
    (window as unknown as { __openworldSlow: number }).__openworldSlow = 10;
  });
  await page.keyboard.press('ArrowRight');
  const heights: number[] = [];
  for (let i = 0; i < 40; i++) {
    const glide = await page.evaluate(() => document.body.dataset.openworldGlide);
    if (glide) heights.push(Number(glide.split(',')[2]));
    if (i === 8) await page.screenshot({ path: test.info().outputPath('hop-mid-step.png') });
    await page.waitForTimeout(40);
  }
  expect(heights.length).toBeGreaterThan(5);
  expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(0.04); // up to 0.08 cell at mid-step
});

// #1138: the plate shows at the load, folds to a chip after 3 steps, and the chip opens it again.
test('the Open world HUD plate folds after 3 steps and the chip reopens it, #1138', async ({ page }) => {
  await page.goto('./?bot=off&openworld=7');
  await page.locator('canvas').waitFor();
  await openModes(page);
  await page.locator('#openworld').click();
  const plate = page.locator('#openworld-hud');
  const chip = page.locator('#openworld-chip');
  await expect(plate).toBeVisible();
  await expect(chip).toBeHidden();
  const at = () => page.evaluate(() => document.body.dataset.openworldAt);
  await expect.poll(at).toBe('0,0');
  for (const key of ['ArrowRight', 'ArrowLeft', 'ArrowRight']) {
    await page.keyboard.press(key);
    await page.waitForTimeout(250);
  }
  await expect(plate).toBeHidden(); // folded: out of sight
  await expect(chip).toBeVisible();
  const box = (await chip.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
  await chip.click();
  await expect(plate).toBeVisible();
  await expect(chip).toBeHidden();
});

// #1138: the HUD plate is the dark plate with rivets (four radial gradients), whatever the system theme.
test('the Open world HUD plate is dark with four rivets, #1138', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('./?bot=off&openworld=7');
  await page.locator('canvas').waitFor();
  await openModes(page);
  await page.locator('#openworld').click();
  const plate = page.locator('#openworld-hud');
  await expect(plate).toBeVisible();
  await expect(plate).toHaveCSS('background-color', 'rgb(22, 26, 29)');
  const image = await plate.evaluate((el) => getComputedStyle(el).backgroundImage);
  expect(image.match(/radial-gradient/g)).toHaveLength(4);
});
