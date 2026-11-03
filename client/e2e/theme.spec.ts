import { expect, test, type Page } from '@playwright/test';

// Issues #317 and #1184: the Theme setting of the cog menu cycles Dark (the default), Light, System. Dark and Light set
// data-theme on the root element, System removes it and follows the system setting. Each choice is stored, and the page
// reads the stored choice before its first paint (index.html), so a reload keeps it.
const LIGHT_BG = 'rgb(230, 226, 214)'; // --bg of the light theme (ui.css)
const DARK_BG = 'rgb(11, 13, 15)'; // --bg of the dark theme
const background = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test('opens dark under a light system theme, then cycles Light, System, Dark, each choice stored', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('./?bot=off');
  await page.locator('canvas').waitFor();
  const root = page.locator('html');
  const cog = page.getByRole('button', { name: 'Settings' });
  await expect(cog).toBeEnabled();
  await expect(root).toHaveAttribute('data-theme', 'dark');
  await expect.poll(() => background(page)).toBe(DARK_BG);

  await cog.click();
  await page.getByRole('button', { name: 'Theme: Dark' }).click();
  await expect(root).toHaveAttribute('data-theme', 'light');
  await expect.poll(() => background(page)).toBe(LIGHT_BG);
  expect(await page.evaluate(() => localStorage.getItem('ab-alone.theme'))).toBe('light');

  await page.getByRole('button', { name: 'Theme: Light' }).click(); // the menu stays open: the same row cycles on
  await expect(root).not.toHaveAttribute('data-theme');
  await expect.poll(() => background(page)).toBe(LIGHT_BG); // System follows the light system theme
  expect(await page.evaluate(() => localStorage.getItem('ab-alone.theme'))).toBe('system');

  await page.getByRole('button', { name: 'Theme: System' }).click();
  await expect(root).toHaveAttribute('data-theme', 'dark');
});

// A reload keeps the stored choice: the page reads it at load, so each stored choice is tested on one load (no reload
// steps). The init script runs before the page's own script on every load of this test.
test.describe('a stored choice is kept on a reload', () => {
  for (const [stored, attr, bg] of [
    ['light', 'light', LIGHT_BG],
    ['system', null, LIGHT_BG],
  ] as const) {
    test(`a stored ${stored} theme is applied at the load, under a light system theme`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: 'light' });
      await page.addInitScript((value) => localStorage.setItem('ab-alone.theme', value), stored);
      await page.goto('./?bot=off');
      await page.locator('canvas').waitFor();
      const root = page.locator('html');
      if (attr) await expect(root).toHaveAttribute('data-theme', attr);
      else await expect(root).not.toHaveAttribute('data-theme'); // a stored System is kept
      await expect.poll(() => background(page)).toBe(bg);
    });
  }
});
