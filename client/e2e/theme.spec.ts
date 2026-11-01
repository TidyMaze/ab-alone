import { expect, test } from '@playwright/test';

// Issues #317 and #1184: the Theme setting of the cog menu cycles Dark (the default), Light, System. Dark and Light set
// data-theme on the root element, System removes it and follows the system setting. The choice survives a reload.
const LIGHT_BG = 'rgb(230, 226, 214)'; // --bg of the light theme (ui.css)
const DARK_BG = 'rgb(11, 13, 15)'; // --bg of the dark theme
const background = (page: import('@playwright/test').Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test('opens dark under a light system theme, then cycles Light, System, Dark and the choice survives a reload', async ({ page }) => {
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
  await page.reload();
  await page.locator('canvas').waitFor();
  await expect(root).toHaveAttribute('data-theme', 'light');

  await cog.click();
  await page.getByRole('button', { name: 'Theme: Light' }).click();
  await expect(root).not.toHaveAttribute('data-theme');
  await expect.poll(() => background(page)).toBe(LIGHT_BG); // System follows the light system theme
  await page.reload();
  await page.locator('canvas').waitFor();
  await expect(root).not.toHaveAttribute('data-theme'); // a stored System is kept
  await expect.poll(() => background(page)).toBe(LIGHT_BG);

  await cog.click();
  await page.getByRole('button', { name: 'Theme: System' }).click();
  await expect(root).toHaveAttribute('data-theme', 'dark');
});
