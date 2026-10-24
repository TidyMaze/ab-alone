import { expect, test } from '@playwright/test';

// Issue #317: the Theme setting of the cog menu cycles System (default), Dark, Light. Dark and Light set data-theme
// on the root element, System removes it and follows the system setting. The choice survives a reload.
const LIGHT_BG = 'rgb(230, 226, 214)'; // --bg of the light theme (ui.css)
const DARK_BG = 'rgb(11, 13, 15)'; // --bg of the dark theme
const background = (page: import('@playwright/test').Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test('the theme setting cycles System, Dark, Light and the choice survives a reload', async ({ page }) => {
  await page.goto('./?bot=off');
  await page.locator('canvas').waitFor();
  const root = page.locator('html');
  const cog = page.getByRole('button', { name: 'Settings' });
  await expect(cog).toBeEnabled();

  await cog.click();
  await expect(root).not.toHaveAttribute('data-theme');
  await page.getByRole('button', { name: 'Theme: System' }).click();
  await expect(root).toHaveAttribute('data-theme', 'dark');
  await expect.poll(() => background(page)).toBe(DARK_BG);

  await page.getByRole('button', { name: 'Theme: Dark' }).click();
  await expect(root).toHaveAttribute('data-theme', 'light');
  await expect.poll(() => background(page)).toBe(LIGHT_BG);

  await page.reload();
  await page.locator('canvas').waitFor();
  await expect(root).toHaveAttribute('data-theme', 'light');
  await expect.poll(() => background(page)).toBe(LIGHT_BG);

  await cog.click();
  await page.getByRole('button', { name: 'Theme: Light' }).click();
  await expect(root).not.toHaveAttribute('data-theme');
  await page.reload();
  await page.locator('canvas').waitFor();
  await expect(root).not.toHaveAttribute('data-theme');
});
