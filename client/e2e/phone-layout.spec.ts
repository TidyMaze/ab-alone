import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { BLACK_WINS } from './end-games';
import { loseByRepetition, startDaily } from './fight-end';
import { maxUiScale } from '../src/uiscale';
import { openModes } from './modes';
import { logOf } from '../src/audiologs';
import { dailyFor, dailyTitle, utcDay } from '../src/daily';

// Bug #227: on a phone the button column covered the HUD plate and the board's top-right cells, and held
// upright the board was wider than the screen. In every state below no control covers the HUD plate or a
// cell, every control is on screen or can be scrolled into view, and a tap on any of the 61 cells reaches
// the board. Bug #234: held sideways the plate hid the board's top-left marbles, so the plate covers no
// cell either. The evaluation plate (#191) is checked like a control: it lets taps through, so it would
// hide a cell without missing a tap. So is the transcript of an audio log (#516).

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
    const plates: Record<string, string> = { eval: 'the evaluation plate', transcript: 'the transcript' };
    for (const el of document.querySelectorAll('button, input, label, textarea, select, #eval, #transcript')) {
      if (el.getClientRects().length === 0) continue; // hidden
      const name = plates[el.id] ?? (el.textContent || el.getAttribute('aria-label')!);
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); // a scrolling column brings it into view
      const box = el.getBoundingClientRect();
      if (el.id !== 'hud-fold' && meets(box, hud)) found.push(`${name} covers the HUD`); // its own fold button (#957)
      if (!onScreen(box)) found.push(`${name} is off screen`);
      for (const c of cells) if (meets(box, c.disc)) found.push(`${name} covers ${c.name}`);
    }
    // The plates let taps through, so they must not lie over a control either, or they hide it.
    for (const [id, name] of Object.entries(plates)) {
      const plate = document.getElementById(id)!;
      if (plate.getClientRects().length === 0) continue; // hidden
      for (const el of document.querySelectorAll('button, input, label, textarea, select, #eval')) {
        if (el === plate || el.getClientRects().length === 0) continue; // itself, or hidden
        if (el.closest('#settings-menu')) continue; // the open settings menu floats over the plates too (#277)
        if (meets(plate.getBoundingClientRect(), el.getBoundingClientRect())) {
          found.push(`${name} covers ${plates[el.id] ?? (el.textContent || el.getAttribute('aria-label'))}`);
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
  const { x, y, hit, cover } = await cog.evaluate((el) => {
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); // as Playwright's click does before it taps
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const top = document.elementFromPoint(x, y);
    const cover = top && { tag: top.tagName, id: top.id, cls: String(top.className), rect: top.getBoundingClientRect().toJSON(), cog: r.toJSON() };
    return { x, y, hit: el.contains(top), cover };
  });
  expect(hit, `the settings cog is not covered by ${JSON.stringify(cover)}`).toBe(true);
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
  // The user's choice: the light sliders are rows of the open menu, which may lie over cells; it stays on screen.
  const open = (await problems(page)).filter((p) => !/ covers cell |^a tap on cell /.test(p));
  expect(open, `${state}, settings menu open`).toEqual([]);
  // On a touch screen every item of the open menu is a touch target of at least 44 px (#287).
  const small = await page.evaluate(() =>
    [...document.querySelectorAll('#settings-menu button')]
      .filter((el) => navigator.maxTouchPoints > 0 && el.getClientRects().length > 0)
      .filter((el) => el.getBoundingClientRect().width < 44 || el.getBoundingClientRect().height < 44)
      .map((el) => el.textContent || el.getAttribute('aria-label')),
  );
  expect(small, `${state}, settings menu open, under 44 px`).toEqual([]);
  // Held upright, or in a narrow or short window, the items show their icon only (#414); each keeps its name, for screen
  // readers and as a tooltip. The FPS switch (#426) is a short word, not an icon item.
  const items = await page.evaluate(() => {
    const upright = matchMedia('(orientation: portrait), (max-width: 1100px), (max-height: 500px)').matches;
    return [...document.querySelectorAll('#settings-menu button')]
      .filter((el) => el.getClientRects().length > 0 && el.querySelector('svg'))
      .map((el) => ({
        name: el.getAttribute('aria-label'),
        title: el.getAttribute('title'),
        labelShown: el.querySelector('span')!.getClientRects().length > 0,
        upright,
      }));
  });
  for (const item of items) {
    expect(item.name, `${state}, a settings item has a name`).toBeTruthy();
    expect(item.title, `${state}, ${item.name} has its name as a tooltip`).toBe(item.name);
    expect(item.labelShown, `${state}, ${item.name} shows its label ${item.upright ? 'held upright or in a small window' : 'in a roomy window'}`).toBe(!item.upright);
  }
  await tapCog(page);
  await expect(page.getByRole('button', { name: 'Clear board' })).toBeHidden();
};

// The volume page of the settings menu (#438): Sound shows the four sliders in place of the items; they cover no cell
// either, and on a touch screen each is a touch target of at least 44 px.
const checkVolumes = async (page: Page, state: string) => {
  await tapCog(page);
  await page.getByRole('button', { name: 'Sound' }).click();
  await expect(page.getByRole('slider', { name: 'Music' })).toBeVisible();
  await frame(page);
  expect(await problems(page), `${state}, volume sliders open`).toEqual([]);
  const small = await page.evaluate(() =>
    [...document.querySelectorAll('#settings-menu .setting-volume')]
      .filter((el) => navigator.maxTouchPoints > 0 && el.getBoundingClientRect().height < 44)
      .map((el) => el.textContent),
  );
  expect(small, `${state}, volume sliders under 44 px`).toEqual([]);
  await tapCog(page);
  await expect(page.getByRole('slider', { name: 'Music' })).toBeHidden();
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
  // Bug #614: a common Android phone, narrower: the board sits higher and the open mode menu covered its top row.
  { name: 'a phone 360 px wide held upright', viewport: { width: 360, height: 780 }, mobile: true },
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
      const hud = page.locator('#hud');
      await page.goto('./?bot=off&net=hook');
      await page.locator('canvas').waitFor();
      await expect(hud).toContainText('Black to move');
      // The plate stays top-left, 16 px from the edges (docs/specs/ui.md section 4).
      expect(await hud.boundingBox()).toMatchObject({ x: 16, y: 16 });
      await check(page, testInfo, 'at the start');
      await checkVolumes(page, 'at the start');
    });

    // UI scale (#382): a stored 200 % is applied at the cap of this window (maxUiScale), 100 % on these viewports.
    test('a stored 200 % UI scale is applied at the window cap, #382', async ({ page }) => {
      await page.addInitScript(() => localStorage.setItem('ab-alone.ui-scale', '200'));
      await page.goto('./?bot=off&net=hook');
      await page.locator('canvas').waitFor();
      await expect(page.locator('#hud')).toContainText('Black to move');
      const scale = await page.evaluate(() => document.documentElement.style.getPropertyValue('--ui-scale'));
      expect(scale).toBe(String(maxUiScale(viewport.width, viewport.height) / 100));
    });

    // The open mode menu (#357) with its boss list, its tallest state, covers no cell either. Bug #575: the Daily
    // challenge button names the boss of the day, so the menu's rows change with the date. The rows only depend on the
    // list and the widest label (bug #715): one check per boss list, on a day whose daily boss has the widest name, as
    // drawn in the button's font; main.boss.test.ts checks that every boss is named on its day. Bug #603: the boss list
    // of Fight together (#530) is checked too. The page clock moves to that day and the minute timer of the open page
    // renames the button, as it does at 00:00 UTC (bug #629).
    for (const list of ['Boss fight', 'Fight together']) {
      test(`nothing covers the board or the HUD with the mode menu and the ${list} list open, widest daily boss, bugs #227 #234 #357 #575 #603 #715`, async ({ page }, testInfo) => {
        await page.clock.install({ time: Date.parse('2026-10-23T08:00:00Z') });
        await page.goto('./?bot=off&net=hook');
        await page.locator('canvas').waitFor();
        await openModes(page);
        await page.getByRole('button', { name: 'Boss fight' }).click();
        const names = await page.locator('#boss-list button').allTextContents(); // in the order of boss_ids()
        const widest = await page.evaluate(async (all) => {
          await document.fonts.ready;
          const g = document.createElement('canvas').getContext('2d')!;
          g.font = getComputedStyle(document.querySelector('#daily span')!).font;
          return all.reduce((a, b) => (g.measureText(b).width > g.measureText(a).width ? b : a));
        }, names);
        let ms = Date.UTC(2026, 9, 23);
        while (dailyFor(utcDay(ms), names).id !== widest) ms += 86_400_000;
        const day = utcDay(ms);
        await page.clock.setSystemTime(new Date(`${day}T08:00:00Z`));
        await page.clock.fastForward(60_000); // the minute timer fires once
        await expect(page.locator('#daily')).toHaveText(dailyTitle(day, widest));
        const button = page.getByRole('button', { name: list });
        if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click(); // closes the other list
        await expect(button).toHaveAttribute('aria-expanded', 'true');
        await check(page, testInfo, `with the mode menu and the ${list} list open, daily ${widest}`);
      });
    }

    // Bug #615: Boss fight then Fight together left both boss lists open, six rows over the board. Opening one boss list
    // closes the other.
    test('opening the boss list of Fight together closes the one of Boss fight, nothing covers the board, bug #615', async ({ page }, testInfo) => {
      await page.goto('./?bot=off&net=hook');
      await page.locator('canvas').waitFor();
      await openModes(page);
      await page.getByRole('button', { name: 'Boss fight' }).click();
      await page.getByRole('button', { name: 'Fight together' }).click();
      await expect(page.locator('#coop-list')).toBeVisible();
      await expect(page.locator('#boss-list')).toBeHidden();
      await check(page, testInfo, 'after Boss fight then Fight together');
    });

    // The audio log player (#516): its transcript line and Skip log cover no cell, no control and not the HUD.
    // Bug #902: the transcript runs on the page clock, paused from Play log on and moved on to the second line, so a
    // slow frame loop never misses it (page.clock, as in newgame.spec.ts); the clock flows again for the checks.
    test('nothing covers the board or the HUD while an audio log plays, #516 #902', async ({ page }, testInfo) => {
      await page.clock.install();
      await page.goto('./?bot=off&net=hook');
      await page.locator('canvas').waitFor();
      await expect(page.locator('body')).toHaveAttribute('data-console', /^mess-house-rule /);
      await page.keyboard.press('t');
      const play = page.getByRole('button', { name: 'Play log' });
      await expect(play).toBeVisible();
      await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000)); // a short jump: few frames to draw
      await play.click();
      await page.keyboard.press('Escape');
      const second = logOf('mess').lines[1]!;
      await page.clock.fastForward(second.at * 1000); // one frame paints the line due then
      await expect(page.locator('#transcript')).toHaveText(second.text);
      await page.clock.resume();
      await check(page, testInfo, 'while an audio log plays');
    });

    test('nothing covers the board or the HUD in a boss fight, bugs #227 #234', async ({ page }, testInfo) => {
      const hud = page.locator('#hud');
      await page.goto('./?bot=off&net=hook');
      await page.locator('canvas').waitFor();
      await openModes(page);
      await page.getByRole('button', { name: 'Boss fight' }).click();
      await page.locator('#boss-list button').first().click();
      await expect(hud).toContainText('P1');
      await check(page, testInfo, 'in a boss fight');
    });

    test('nothing covers the board or the HUD waiting for an opponent, turned around, bugs #227 #234', async ({ page }, testInfo) => {
      const hud = page.locator('#hud');
      await page.goto('./?bot=off&net=hook');
      await openModes(page);
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
      await importBlackWins(page);
      await check(page, testInfo, 'with the end banner');
    });

    test('the end banner covers neither a cell nor a button turned around, #282', async ({ page }, testInfo) => {
      await importBlackWins(page);
      await page.setViewportSize({ width: viewport.height, height: viewport.width });
      await check(page, testInfo, 'with the end banner turned around');
    });

    test('the daily result card covers neither the HUD nor the board, #196', async ({ page }, testInfo) => {
      await startDaily(page);
      await loseByRepetition(page);
      await expect(page.locator('#daily-card')).toBeVisible();
      await check(page, testInfo, 'with the daily result card');
      expect(await cardOverCorner(page), 'the card is clear of Copy diagnostics').toEqual([]);
    });

    test('the daily result card covers neither the HUD nor the board turned around, #196', async ({ page }, testInfo) => {
      await startDaily(page);
      await loseByRepetition(page);
      await expect(page.locator('#daily-card')).toBeVisible();
      await page.setViewportSize({ width: viewport.height, height: viewport.width });
      await check(page, testInfo, 'with the daily result card turned around');
      expect(await cardOverCorner(page), 'turned around, the card is clear of Copy diagnostics').toEqual([]);
    });
  });
}

// #666: on a phone held upright the open mode menu has room for 12 bosses, so a new boss needs no layout change. Each
// boss list gets copies of its last entry, as #663 does on a desktop; the Daily challenge names the longest boss name.
for (const { name, viewport } of sizes.filter((s) => s.mobile && s.viewport.width < s.viewport.height)) {
  test.describe(`${name}, 12 bosses`, () => {
    test.skip(({ browserName }) => browserName === 'firefox', 'Firefox has no mobile emulation');
    test.use({ viewport, isMobile: true, hasTouch: true });

    for (const list of ['Boss fight', 'Fight together']) {
      test(`nothing covers the board or the HUD with the ${list} list of 12 bosses open, #666`, async ({ page }, testInfo) => {
        await page.clock.install({ time: Date.parse('2026-10-23T08:00:00Z') });
        await page.goto('./?bot=off&net=hook');
        await page.locator('canvas').waitFor();
        await openModes(page);
        await page.getByRole('button', { name: 'Boss fight' }).click();
        const names = await page.locator('#boss-list button').allTextContents();
        const longest = names.reduce((a, b) => (b.length > a.length ? b : a));
        let ms = Date.UTC(2026, 9, 23);
        while (dailyFor(utcDay(ms), names).id !== longest) ms += 86_400_000;
        await page.clock.setSystemTime(new Date(`${utcDay(ms)}T08:00:00Z`));
        await page.clock.fastForward(60_000); // the minute timer renames Daily challenge
        await expect(page.locator('#daily')).toHaveText(dailyTitle(utcDay(ms), longest));
        await page.evaluate(() => {
          for (const el of document.querySelectorAll('#boss-list, #coop-list')) {
            while (el.children.length < 12) el.appendChild(el.lastElementChild!.cloneNode(true));
          }
        });
        const button = page.getByRole('button', { name: list });
        if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click(); // closes the other list
        await expect(page.locator(list === 'Boss fight' ? '#boss-list' : '#coop-list').getByRole('button')).toHaveCount(12);
        await check(page, testInfo, `with the mode menu and the ${list} list of 12 bosses open`);
      });
    }
  });
}

// On a desktop the column stays where it was: top right, one button under the other.
// UI scale 200 % (#382): only a large desktop window has room for the HUD at 200 % (maxUiScale).
test.describe('a large desktop window at a 200 % UI scale', () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  test('nothing covers the board or the HUD at a 200 % UI scale, #382', async ({ page }, testInfo) => {
    await page.addInitScript(() => localStorage.setItem('ab-alone.ui-scale', '200'));
    await page.goto('./?bot=off&net=hook');
    await page.locator('canvas').waitFor();
    await expect(page.locator('#hud')).toContainText('Black to move');
    await check(page, testInfo, 'at 200 % UI scale, large desktop');
  });
});

// Bug #427: the open settings menu was clipped by the column it sits in at a 200 % UI scale (landscape), so Skin, Export
// game and Import game were hidden and the board took the click. Every row must be on screen and receive a click at its centre.
for (const { name, viewport, scale } of [
  { name: 'a large desktop window at 200 % UI scale', viewport: { width: 1920, height: 1080 }, scale: '200' },
  { name: 'a large desktop window at 100 % UI scale', viewport: { width: 1920, height: 1080 }, scale: '100' },
  { name: 'a phone held sideways at 100 % UI scale', viewport: { width: 844, height: 390 }, scale: '100' },
  { name: 'a phone held upright at 100 % UI scale', viewport: { width: 390, height: 844 }, scale: '100' },
]) {
  test(`every settings row is on screen and reachable, ${name}, bug #427`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.addInitScript((s) => localStorage.setItem('ab-alone.ui-scale', s), scale);
    await page.goto('./?bot=off&net=hook');
    await page.locator('canvas').waitFor();
    await expect(page.locator('#settings')).toBeEnabled();
    await page.locator('#settings').click();
    await expect(page.locator('#settings-menu button')).toHaveCount(17); // Render mode (#763), Difficulty (#704), Flat HUD shares Reduced motion (#391), glass shares shell (#377), Palette shares Theme (#381), Transcript shares Sound (#516), Logs shares Import (#513), Free camera (#938)
    const rows = await page.evaluate(() =>
      [...document.querySelectorAll('#settings-menu button')].map((el) => {
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        const onScreen = r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight;
        return { name: el.textContent, reachable: el.contains(hit) && onScreen };
      }),
    );
    expect(rows.filter((row) => !row.reachable).map((row) => row.name), 'rows covered or off screen').toEqual([]);
  });
}

test('on a desktop the buttons stay in a column at the top right, bug #227', async ({ page }) => {
  await page.goto('./?bot=off');
  await expect(page.locator('#hud')).toContainText('Black to move');
  const width = page.viewportSize()!.width;
  const boxes = await Promise.all(
    ['Settings', 'Reset view', 'New game', 'Game modes'].map((b) => page.getByRole('button', { name: b }).boundingBox()),
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
      const hud = page.locator('#hud');
      await page.clock.setFixedTime(new Date('2027-03-25T08:00:00Z'));
      await page.goto('./?bot=off&net=hook');
      await openModes(page);
      await page.locator('#daily').click();
      await expect(hud).toContainText('Daily challenge 2027-03-25 · attempt 1');
      await loseByRepetition(page); // against the Echo's bonus mirrors (#859), e2e/fight-end.ts
      await expect(hud).toContainText('Defeat');
      await check(page, testInfo, 'after a daily defeat');
    });
  });
}
