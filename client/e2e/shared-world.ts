import { test as base, expect, type Browser, type Page } from '@playwright/test';

// One Open world page for all the tests of a spec that ask for the same page (`./?bot=off&openworld=7`, the default window, no
// init script, no reload): the boot of the page (2 to 3 s of first frames on software WebGL, more on the CI runner) is paid once
// per worker, not once per test (#1481). Each test starts from the spawn: the page hook __openworldFresh opens the world again
// without reading its save. A test that reloads, resizes, emulates media or adds an init script keeps the `page` of Playwright.
// The page lives as long as the worker; a closed or crashed page is made again.
let shared: Promise<Page> | undefined;

async function boot(browser: Browser, baseURL: string | undefined, viewport: { width: number; height: number } | null): Promise<Page> {
  const context = await browser.newContext({ baseURL, viewport, serviceWorkers: 'block' });
  if (process.env.CI) await context.addInitScript(() => localStorage.setItem('ab-alone.tier', 'low')); // as lowTierOnCi (modes.ts)
  const page = await context.newPage();
  await page.goto('./?bot=off&openworld=7');
  await page.locator('canvas:not(#openworld-minimap)').waitFor();
  return page;
}

export const test = base.extend<{ world: Page }>({
  world: async ({ browser, baseURL, viewport }, use) => {
    let page = await (shared ??= boot(browser, baseURL, viewport));
    if (page.isClosed()) page = await (shared = boot(browser, baseURL, viewport));
    await page.evaluate(() => {
      delete (window as unknown as { __openworldSlow?: number }).__openworldSlow; // the slow factor a glide test set (openworldglide.ts)
      return (window as unknown as { __openworldFresh: () => Promise<void> }).__openworldFresh();
    });
    await page.keyboard.up('Shift'); // no key is left held by the test before
    await expect.poll(() => page.evaluate(() => document.body.dataset.openworldAt)).toBe('0,0');
    await use(page);
  },
});
export { expect };
