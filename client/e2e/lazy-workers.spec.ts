import { expect, test, type Page } from '@playwright/test';

// #1579: each bot worker loads its own copy of the engine (edgefall_wasm_bg.wasm, 672 KB). The page starts the analysis worker when the
// evaluation bar asks for a score and the bot worker when the bot is asked a move, so the Hub loads the engine once (the page's) and the
// hot-seat board twice (the page's and the analysis worker's). The context sees the workers' requests too.
async function wasmRequests(page: Page, url: string): Promise<number> {
  let count = 0;
  page.context().on('request', (r) => /edgefall_wasm_bg.*\.wasm/.test(r.url()) && count++);
  await page.goto(url);
  await page.waitForFunction(() => document.body.dataset.hub !== undefined || document.getElementById('eval')?.dataset.ply !== undefined, null, { timeout: 10_000 });
  await page.waitForTimeout(500); // a worker that was going to load its engine has asked by now
  return count;
}

test('the Hub loads the engine once', async ({ page }) => {
  expect(await wasmRequests(page, '/')).toBe(1);
});

test('the hot-seat board loads it twice: the page and the analysis worker', async ({ page }) => {
  expect(await wasmRequests(page, '/?bot=off')).toBe(2);
});
