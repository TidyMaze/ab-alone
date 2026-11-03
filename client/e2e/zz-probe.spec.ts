import { test } from '@playwright/test';

// Temporary boot probe (#1481), not for main: the same build with and without the veiled-room skip (the bundle is patched in the route).
const url = () => `http://localhost:${process.env.E2E_PAGE_PORT}/ab-alone/`;
for (const q of ['', '&quality=low']) {
  test(`probe${q}`, async ({ browser }) => {
    for (let i = 0; i < 4; i++) {
      for (const mode of ['before', 'after']) {
        const ctx = await browser.newContext({ viewport: { width: 960, height: 540 }, serviceWorkers: 'block' });
        const page = await ctx.newPage();
        let patched = 0;
        await page.route('**/assets/index-*.js', async (route) => {
          const resp = await route.fetch();
          let body = await resp.text();
          if (mode === 'before') {
            body = body.replace(/document\.body\.dataset\.veil===`on`/g, () => (patched++, 'document.body.dataset.veil===`off`'));
          }
          await route.fulfill({ response: resp, body });
        });
        await page.addInitScript(() => {
          const w = window as any;
          w.__lt = [];
          w.__n = 0;
          w.__blk = 0;
          const P = WebGL2RenderingContext.prototype;
          const lp = P.linkProgram;
          P.linkProgram = function (pr: WebGLProgram) {
            w.__n++;
            return lp.call(this, pr);
          };
          const gp = P.getProgramParameter;
          P.getProgramParameter = function (pr: WebGLProgram, k: number) {
            const t = performance.now();
            const r = gp.call(this, pr, k);
            const d = performance.now() - t;
            if (d > 5) w.__blk += d;
            return r;
          };
          new PerformanceObserver((l) => l.getEntries().forEach((e) => w.__lt.push([Math.round(e.startTime), Math.round(e.duration)]))).observe({ type: 'longtask', buffered: true });
        });
        await page.goto(`${url()}?bot=off${q}`);
        await page.waitForFunction(() => document.body.dataset.scene === 'table-zero' && getComputedStyle(document.querySelector('canvas')!).opacity === '1', null, { timeout: 60000, polling: 50 });
        const at = await page.evaluate(() => Math.round(performance.now()));
        const programsAtVisible = await page.evaluate(() => (window as any).__n);
        await page.waitForTimeout(1500);
        const r = await page.evaluate(() => {
          const w = window as any;
          return { n: w.__n, blk: Math.round(w.__blk), lt: w.__lt.map((x: number[]) => x.join('+')).join(' ') };
        });
        console.log(`PROBE ${mode}${q} #${i} patched=${patched} canvas=${at} programsAtVisible=${programsAtVisible} programs=${r.n} blockedMs=${r.blk} longtasks=${r.lt}`);
        await ctx.close();
      }
    }
  });
}
