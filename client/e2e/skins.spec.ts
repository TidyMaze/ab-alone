import { expect, test } from '@playwright/test';

// Issue #377: the skin item of the cog menu steps through the ten dark shell skins, Leather first. The choice
// is stored, survives a reload, and the marbles are redrawn at once.
test('the shell setting steps through the skins, redraws the marbles and survives a reload, #377', async ({ page }) => {
  await page.goto('./?bot=off');
  await page.locator('canvas').waitFor();
  const cog = page.getByRole('button', { name: 'Settings' });
  await expect(cog).toBeEnabled();
  await cog.click();
  await page.getByRole('button', { name: 'Leather', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Black porcelain' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('ab-alone.shell-skin'))).toBe('obsidian');
  await page.getByRole('button', { name: 'Black porcelain' }).click();
  await expect(page.getByRole('button', { name: 'Lava', exact: true })).toBeVisible();
  await page.reload();
  await page.locator('canvas').waitFor();
  await cog.click();
  await expect(page.getByRole('button', { name: 'Lava', exact: true })).toBeVisible();
});

// Issue #377: the glass item beside the shell skin steps through the ten white glass skins, Marble first, stored
// under its own key and redrawn at once.
test('the glass setting steps through the white glass skins and survives a reload, #377', async ({ page }) => {
  await page.goto('./?bot=off');
  await page.locator('canvas').waitFor();
  const cog = page.getByRole('button', { name: 'Settings' });
  await expect(cog).toBeEnabled();
  await cog.click();
  await page.getByRole('button', { name: 'Marble', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Terracotta' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('ab-alone.glass-skin'))).toBe('frost');
  await page.reload();
  await page.locator('canvas').waitFor();
  await cog.click();
  await expect(page.getByRole('button', { name: 'Terracotta' })).toBeVisible();
});
