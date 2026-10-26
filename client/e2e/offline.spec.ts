import { readdirSync, readFileSync } from 'node:fs';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';

// The offline app (#193) exists only in the production build. Every other spec blocks service workers
// (playwright.config.ts), this one allows them. The offline test opens E2E_PREVIEW_URL: the `vite build` +
// `vite preview` server of playwright.config.ts, or the live site (E2E_BASE_URL).
test.use({ serviceWorkers: 'allow' });

// The spec never reaches Google (bug #649): the stylesheet holds the load event that page.goto waits for, and during a
// network outage of the machine the test timed out in its first step. The two Google Fonts hosts answer from here: a
// stylesheet of the two UI families, both drawn from one font file, the icon font Playwright ships in its trace viewer.
const viewer = new URL('../node_modules/playwright-core/lib/vite/traceViewer/', import.meta.url);
const fontFile = readFileSync(new URL(readdirSync(viewer).find((f) => /^codicon.*\.ttf$/.test(f))!, viewer));
const FONT_URL = 'https://fonts.gstatic.com/e2e/ui.ttf';
const stylesheet = ['Chakra Petch', 'IBM Plex Sans']
  .map((family) => `@font-face { font-family: '${family}'; src: url(${FONT_URL}) format('truetype'); }`)
  .join('\n');
const serveFonts = (context: BrowserContext): Promise<void> =>
  context.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) => {
    const css = route.request().url().startsWith('https://fonts.googleapis.com/');
    // The service worker fetches them with CORS (sw.ts), the page's font files too.
    return route.fulfill({
      contentType: css ? 'text/css' : 'font/ttf',
      headers: { 'access-control-allow-origin': '*' },
      body: css ? stylesheet : fontFile,
    });
  });

const click = async (page: Page, q: number, r: number): Promise<void> => {
  const p = await page.evaluate(([cq, cr]) => (window as any).__cellToScreen(cq, cr), [q, r]);
  await page.mouse.click(p.x, p.y);
};

test('after one visit the game loads offline and the bot answers', async ({ page, context }) => {
  await serveFonts(context);
  const url = process.env.E2E_PREVIEW_URL!;
  const withBot = url.includes('?') ? `${url}&bot=on` : `${url}?bot=on`;
  await page.goto(withBot);
  await page.locator('canvas').waitFor();
  const hud = page.locator('#hud');
  await expect(hud).toContainText('White to move');

  // The service worker precaches the build at install, then takes control of the page.
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  const root = new URL(page.url()).pathname;
  const cached = await page.evaluate(async () => {
    const names = (await caches.keys()).filter((n) => n.startsWith('ab-alone-'));
    const requests = await (await caches.open(names[0]!)).keys();
    return { names, paths: requests.map((r) => new URL(r.url).pathname), hosts: requests.map((r) => new URL(r.url).host) };
  });
  expect(cached.names).toHaveLength(1);
  const assets = ['backdrop.png', 'deck-albedo.png', 'deck-roughness.png', 'shell-normal.png'].map((t) => `${root}assets/${t}`);
  expect(cached.paths).toEqual(expect.arrayContaining([root, `${root}manifest.webmanifest`, ...assets]));
  for (const built of [/assets\/index-[\w-]+\.js$/, /assets\/bot\.worker-[\w-]+\.js$/, /assets\/abalone_wasm_bg-[\w-]+\.wasm$/]) {
    expect(cached.paths.some((p) => built.test(p))).toBe(true);
  }
  // The UI fonts (#221): the Google Fonts stylesheet and its font files are in the same cache after this one visit.
  expect(cached.hosts).toEqual(expect.arrayContaining(['fonts.googleapis.com', 'fonts.gstatic.com']));

  // The browser's HTTP cache keeps the Google Fonts stylesheet one day at most: empty it, so that offline only the
  // service worker can answer, as on a visit a few days later.
  await (await context.newCDPSession(page)).send('Network.clearBrowserCache');
  await context.unrouteAll(); // offline, the fonts come from the service worker alone
  await context.setOffline(true);
  await page.reload();
  await page.locator('canvas').waitFor();
  await expect(hud).toContainText('White to move');
  // The HUD and the buttons keep their fonts. check() alone is also true for a font the page has no face of (the
  // stylesheet failed): each family needs a loaded face too.
  const fonts = () =>
    page.evaluate(() =>
      ['Chakra Petch', 'IBM Plex Sans'].map(
        (family) => document.fonts.check(`1rem "${family}"`) && [...document.fonts].some((f) => f.family === family && f.status === 'loaded'),
      ),
    );
  await expect.poll(fonts).toEqual([true, true]);
  // The cached page loads so fast that a click can come before the first frame, and such a click is lost (bug #237).
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await click(page, 0, 2); // a Black marble
  await click(page, 0, 1); // its NW neighbour, empty at the start
  // The bot worker and its wasm come from the cache too: it answers and the turn comes back.
  await expect.poll(() => page.evaluate(() => (window as any).__plies()), { timeout: 30_000 }).toBe(2);
  await expect(hud).toContainText('White to move');
  await context.setOffline(false);
});

test('the dev server registers no service worker', async ({ page }) => {
  test.skip(!!process.env.E2E_BASE_URL, 'the live site is the production build');
  await page.goto('./?bot=off');
  await page.locator('canvas').waitFor();
  await expect(page.locator('#play-online')).toBeEnabled(); // main.ts ran to its end
  const registered = await page.evaluate(() =>
    Promise.race([
      navigator.serviceWorker.ready.then(() => 'registered'),
      new Promise((resolve) => setTimeout(() => resolve('none'), 3_000)),
    ]),
  );
  expect(registered).toBe('none');
});
