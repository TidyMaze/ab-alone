import { utimes } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

// Bug #185: every e2e run starts its dev server with `npm run dev`, which rebuilds the wasm package first and so
// rewrites its files even when nothing changed. A dev server that watches them reloads every page it serves: a
// second run, a dev server or a wasm build in the same checkout reloaded the pages of a run in progress, and a
// click on a page being reloaded failed with "Execution context was destroyed".
const pkg = ['abalone_wasm.js', 'abalone_wasm_bg.wasm'].map((file) => new URL(`../../crates/abalone-wasm/pkg/${file}`, import.meta.url));

test('rewriting the wasm package during a run does not reload the page under test, bug #185', async ({ page }) => {
  test.skip(!!process.env.E2E_BASE_URL, 'the live site has no dev server and no local wasm package');
  await page.goto('./?bot=off');
  await page.locator('canvas').waitFor();
  // A watching dev server reloads the page about a second after the files change: wait well past that.
  const reloaded = page.waitForEvent('framenavigated', { timeout: 5_000 }).then(
    () => true,
    () => false,
  );
  const now = new Date();
  await Promise.all(pkg.map((file) => utimes(file, now, now))); // what a rebuild does to the files the page loaded
  expect(await reloaded).toBe(false);
});
