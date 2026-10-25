import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { BLACK_WINS } from './end-games';
import { loseByRepetition, startDaily } from './fight-end';

// Bug #227: on a phone the button column covered the HUD plate and the board's top-right cells, and held
// upright the board was wider than the screen. In every state below no control covers the HUD plate or a
// cell, every control is on screen or can be scrolled into view, and a tap on any of the 61 cells reaches
// the board. Bug #234: held sideways the plate hid the board's top-left marbles, so the plate covers no
// cell either. The evaluation plate (#191) is checked like a control: it lets taps through, so it would
// hide a cell without missing a tap.

// What is wrong on the page right now, as readable lines: an empty list is a good layout.
const problems = (page: Page) =>
  page.evaluate(() => {
    type Box = { left: number; top: number; right: number; bottom: number };
    const meets = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    const onScreen = (b: Box) => b.left >= 0 && b.top >= 0 && b.right <= innerWidth && b.bottom <= innerHeight;
    const toScreen = (q: number, r: number) => (window as any).__cellToScreen(q, r) as { x: number; y: number };
    const cells: { name: string; centre: { x: number; y: number }; disc: Box }[] = [];
    for (let r = -4; r <= 4; r++) {
      for (let q = Math.max(-4, -4 - r); q <= Math.min(4, 4 - r); q++) {
        const p = toScreen(q, r);
        const east = toScreen(q + 1, r);
        const radius = 0.46 * Math.hypot(east.x - p.x, east.y - p.y); // the disc radius is 0.46, cells are 1 apart
        const disc = { left: p.x - radius, top: p.y - radius, right: p.x + radius, bottom: p.y + radius };
        cells.push({ name: `cell ${q},${r}`, centre: p, disc });
      }
    }
    const hud = document.getElementById('hud')!.getBoundingClientRect();
    const found: string[] = [];
    for (const c of cells) if (meets(hud, c.disc)) found.push(`the HUD covers ${c.name}`);
    for (const el of document.querySelectorAll('button, input, label, textarea, select, #eval')) {
      if (el.getClientRects().length === 0) continue; // hidden
      const name = el.id === 'eval' ? 'the evaluation plate' : el.textContent || el.getAttribute('aria-label')!;
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); // a scrolling column brings it into view
      const box = el.getBoundingClientRect();
      if (meets(box, hud)) found.push(`${name} covers the HUD`);
      if (!onScreen(box)) found.push(`${name} is off screen`);
      for (const c of cells) if (meets(box, c.disc)) found.push(`${name} covers ${c.name}`);
    }
    // The evaluation plate lets taps through, so it must not lie over a control either, or it hides it.
    const plate = document.getElementById('eval')!;
    if (plate.getClientRects().length > 0) {
      for (const el of document.querySelectorAll('button, input, label, textarea, select')) {
        if (el.getClientRects().length === 0) continue; // hidden
        if (meets(plate.getBoundingClientRect(), el.getBoundingClientRect())) {
          found.push(`the evaluation plate covers ${el.textContent || el.getAttribute('aria-label')}`);
        }
      }
    }
    for (const c of cells) {
      if (!onScreen(c.disc)) found.push(`${c.name} is off screen`);
      else if (document.elementFromPoint(c.centre.x, c.centre.y)?.tagName !== 'CANVAS') found.push(`a tap on ${c.name} misses the board`);
    }
    return found;
  });

// The camera matrices are updated on a rendered frame.
const frame = (page: Page) =>
  page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));

// A real mouse click on the cog, after checking the cog is the element under the pointer (what Playwright's click checks).
// Playwright's click waits for the page to paint twice before and after, each wait a frame of software WebGL (#349).
const tapCog = async (page: Page) => {
  const cog = page.getByRole('button', { name: 'Settings' });
  const { x, y, hit } = await cog.evaluate((el) => {
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); // as Playwright's click does before it taps
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    return { x, y, hit: el.contains(document.elementFromPoint(x, y)) };
  });
  expect(hit, 'the settings cog is not covered').toBe(true);
  await page.mouse.click(x, y);
};

const check = async (page: Page, testInfo: TestInfo, state: string) => {
  await frame(page);
  await page.screenshot({ path: testInfo.outputPath(`${state.replaceAll(' ', '-')}.jpg`), type: 'jpeg', quality: 70 });
  expect(await problems(page), state).toEqual([]);
  // The same check with the settings menu open (#277): the cog and the menu cover no cell, marble or target.
  await tapCog(page);
  await expect(page.getByRole('button', { name: 'Clear board' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sound' })).toBeVisible();
  await frame(page);
  expect(await problems(page), `${state}, settings menu open`).toEqual([]);
  // On a touch screen every item of the open menu is a touch target of at least 44 px (#287).
  const small = await page.evaluate(() =>
    [...document.querySelectorAll('#settings-menu button')]
      .filter((el) => navigator.maxTouchPoints > 0 && el.getClientRects().length > 0)
      .filter((el) => el.getBoundingClientRect().width < 44 || el.getBoundingClientRect().height < 44)
      .map((el) => el.textContent || el.getAttribute('aria-label')),
  );
  expect(small, `${state}, settings menu open, under 44 px`).toEqual([]);
  await tapCog(page);
  await expect(page.getByRole('button', { name: 'Clear board' })).toBeHidden();
};

// The parts of the daily result card (#196) that meet the Copy diagnostics button (#220), each scrolled into view
// first, as a scrolling column shows it.
const cardOverCorner = (page: Page) =>
  page.evaluate(() => {
    const corner = document.getElementById('copy-diagnostics')!.getBoundingClientRect();
    return ['daily-result', 'daily-copy'].filter((id) => {
      const el = document.getElementById(id)!;
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      const b = el.getBoundingClientRect();
      return b.left < corner.right && corner.left < b.right && b.top < corner.bottom && corner.top < b.bottom;
    });
  });

const sizes = [
  { name: 'a phone held upright', viewport: { width: 375, height: 812 }, mobile: true },
  { name: 'a phone held sideways', viewport: { width: 812, height: 375 }, mobile: true },
  { name: 'a desktop window', viewport: { width: 1280, height: 720 }, mobile: false },
  // Bug #246: the plate reached over the board's top-left edge in these medium windows.
  { name: 'a tablet held sideways', viewport: { width: 1024, height: 768 }, mobile: false },
  { name: 'a window 1000 by 720', viewport: { width: 1000, height: 720 }, mobile: false },
  { name: 'a window 1024 by 600', viewport: { width: 1024, height: 600 }, mobile: false },
];

for (const { name, viewport, mobile } of sizes) {
  test.describe(name, () => {
    test.skip(({ browserName }) => mobile && browserName === 'firefox', 'Firefox has no mobile emulation');
    test.use({ viewport, isMobile: mobile, hasTouch: mobile });

    // One test per state (#349): each is one page load and its checks, not the whole walk through the states.
    test('nothing covers the board or the HUD at the start, bugs #227 #234', async ({ page }, testInfo) => {
      test.slow(); // one page load and one check, with a screenshot of the WebGL page
      const hud = page.locator('#hud');
      await page.goto('./?bot=off&net=hook');
      await page.locator('canvas').waitFor();
      await expect(hud).toContainText('Black to move');
      // The plate stays top-left, 16 px from the edges (docs/specs/ui.md section 4).
      expect(await hud.boundingBox()).toMatchObject({ x: 16, y: 16 });
      await check(page, testInfo, 'at the start');
    });

    test('nothing covers the board or the HUD with the boss list open, bugs #227 #234', async ({ page }, testInfo) => {
      test.slow(); // one page load and one check, with a screenshot of the WebGL page
      await page.goto('./?bot=off&net=hook');
      await page.locator('canvas').waitFor();
      await page.getByRole('button', { name: 'Boss fight' }).click();
      await check(page, testInfo, 'with the boss list open');
    });

    test('nothing covers the board or the HUD in a boss fight, bugs #227 #234', async ({ page }, testInfo) => {
      test.slow(); // one page load, one boss pick and one check, with a screenshot of the WebGL page
      const hud = page.locator('#hud');
      await page.goto('./?bot=off&net=hook');
      await page.locator('canvas').waitFor();
      await page.getByRole('button', { name: 'Boss fight' }).click();
      await page.locator('#boss-list button').first().click();
      await expect(hud).toContainText('P1');
      await check(page, testInfo, 'in a boss fight');
    });

    test('nothing covers the board or the HUD waiting for an opponent, turned around, bugs #227 #234', async ({ page }, testInfo) => {
      test.slow(); // one page load and two checks, with screenshots of the WebGL page
      const hud = page.locator('#hud');
      await page.goto('./?bot=off&net=hook');
      await page.getByRole('button', { name: 'Play online' }).click();
      await expect(hud).toContainText('Waiting for an opponent');
      await expect(page.locator('#invite')).toBeVisible();
      await check(page, testInfo, 'waiting for an opponent');

      // Turning the device around keeps the layout right.
      await page.setViewportSize({ width: viewport.height, height: viewport.width });
      await check(page, testInfo, 'turned around');
    });

    const importBlackWins = async (page: Page) => {
      await page.goto('./?net=hook');
      await page.locator('canvas').waitFor();
      await page.locator('#import-file').setInputFiles({
        name: 'game.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify({ version: 1, mode: 'local', layout: 'standard', bot: true, moves: BLACK_WINS })),
      });
      await expect(page.locator('body')).toHaveAttribute('data-over', 'win');
      await expect(page.locator('#hud .end')).toContainText('The books balance');
    };

    test('the end banner covers neither a cell nor a button, #282', async ({ page }, testInfo) => {
      test.slow(); // a 71 ply game replayed, then one check
      await importBlackWins(page);
      await check(page, testInfo, 'with the end banner');
    });

    test('the end banner covers neither a cell nor a button turned around, #282', async ({ page }, testInfo) => {
      test.slow(); // a 71 ply game replayed, then one check on the turned device
      await importBlackWins(page);
      await page.setViewportSize({ width: viewport.height, height: viewport.width });
      await check(page, testInfo, 'with the end banner turned around');
    });

    test('the daily result card covers neither the HUD nor the board, #196', async ({ page }, testInfo) => {
      test.slow(); // eight plies played by hand, then one check
      await startDaily(page);
      await loseByRepetition(page);
      await expect(page.locator('#daily-card')).toBeVisible();
      await check(page, testInfo, 'with the daily result card');
      expect(await cardOverCorner(page), 'the card is clear of Copy diagnostics').toEqual([]);
    });

    test('the daily result card covers neither the HUD nor the board turned around, #196', async ({ page }, testInfo) => {
      test.slow(); // eight plies played by hand, then one check on the turned device
      await startDaily(page);
      await loseByRepetition(page);
      await expect(page.locator('#daily-card')).toBeVisible();
      await page.setViewportSize({ width: viewport.height, height: viewport.width });
      await check(page, testInfo, 'with the daily result card turned around');
      expect(await cardOverCorner(page), 'turned around, the card is clear of Copy diagnostics').toEqual([]);
    });
  });
}

// On a desktop the column stays where it was: top right, one button under the other.
test('on a desktop the buttons stay in a column at the top right, bug #227', async ({ page }) => {
  await page.goto('./?bot=off');
  await expect(page.locator('#hud')).toContainText('Black to move');
  const width = page.viewportSize()!.width;
  const boxes = await Promise.all(
    ['Settings', 'Reset view', 'Play online', 'Boss fight'].map((b) => page.getByRole('button', { name: b }).boundingBox()),
  );
  expect(boxes[0]!.y).toBe(16);
  for (const [i, box] of boxes.entries()) {
    expect(box!.x + box!.width).toBeCloseTo(width - 16, 0);
    if (i > 0) expect(box!.y).toBeGreaterThan(boxes[i - 1]!.y + boxes[i - 1]!.height);
  }
});

// Bug #271: at the end of a daily fight the plate gains the daily, result and score lines, and grew over the board
// or pushed the button rows onto it. Same check as above, played to the end: a draw by threefold repetition.
for (const { name, viewport } of [
  { name: 'a window 1000 by 720', viewport: { width: 1000, height: 720 } },
  { name: 'a window 1024 by 600', viewport: { width: 1024, height: 600 } },
  { name: 'a tablet held upright', viewport: { width: 768, height: 1024 } },
]) {
  test.describe(`${name}, end of a daily fight`, () => {
    test.use({ viewport });

    test('the plate and the buttons cover no cell after a defeat, bug #271', async ({ page }, testInfo) => {
      test.slow(); // boss search, eight clicks pairs and a screenshot of the WebGL page
      const hud = page.locator('#hud');
      await page.clock.setFixedTime(new Date('2026-10-25T08:00:00Z'));
      await page.goto('./?bot=off&net=hook');
      await page.locator('#daily').click();
      await expect(hud).toContainText('Daily challenge 2026-10-25 · attempt 1');
      const move = async (from: [number, number], to: [number, number]) => {
        for (const [q, r] of [from, to]) {
          const p = await page.evaluate(([cq, cr]) => (window as any).__cellToScreen(cq, cr), [q, r]);
          await page.mouse.click(p.x, p.y);
        }
      };
      // Black (0,2) to (0,1), White (0,-2) to (0,-1), and both back, twice: the start position comes back a third time.
      for (let i = 0; i < 2; i++) {
        await move([0, 2], [0, 1]);
        await move([0, -2], [0, -1]);
        await move([0, 1], [0, 2]);
        await move([0, -1], [0, -2]);
      }
      await expect(hud).toContainText('Defeat');
      await check(page, testInfo, 'after a daily defeat');
    });
  });
}
