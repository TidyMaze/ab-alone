import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';

test.describe('Colorblind and high-contrast palettes (#381)', () => {
  test('the palette setting steps through the 5 palettes, updates accent and survives reload', async ({ page }) => {
    await page.goto('./?bot=off&net=hook');
    await page.locator('canvas').waitFor();
    const cog = page.locator('#settings');
    await expect(cog).toBeEnabled();
    await cog.click();

    const paletteBtn = page.locator('#setting-palette');
    await expect(paletteBtn).toBeVisible();
    await expect(paletteBtn).toContainText('Palette: Default');

    // Default -> Protan
    await paletteBtn.click();
    await expect(paletteBtn).toContainText('Palette: Protan');
    expect(await page.evaluate(() => localStorage.getItem('ab-alone.palette'))).toBe('protan');
    expect(await page.evaluate(() => document.documentElement.dataset.palette)).toBe('protan');
    expect(await page.evaluate(() => (window as any).__palette())).toBe('protan');

    // Protan -> Deutan
    await paletteBtn.click();
    await expect(paletteBtn).toContainText('Palette: Deutan');
    expect(await page.evaluate(() => localStorage.getItem('ab-alone.palette'))).toBe('deutan');

    // Deutan -> Tritan
    await paletteBtn.click();
    await expect(paletteBtn).toContainText('Palette: Tritan');
    expect(await page.evaluate(() => localStorage.getItem('ab-alone.palette'))).toBe('tritan');

    // Tritan -> High contrast
    await paletteBtn.click();
    await expect(paletteBtn).toContainText('Palette: High contrast');
    expect(await page.evaluate(() => localStorage.getItem('ab-alone.palette'))).toBe('contrast');

    // Reload and check persistence
    await page.reload();
    await page.locator('canvas').waitFor();
    await expect(page.locator('#hud')).not.toBeEmpty();
    expect(await page.evaluate(() => localStorage.getItem('ab-alone.palette'))).toBe('contrast');
    expect(await page.evaluate(() => document.documentElement.dataset.palette)).toBe('contrast');
    expect(await page.evaluate(() => (window as any).__palette())).toBe('contrast');

    await cog.click();
    await expect(paletteBtn).toContainText('Palette: High contrast');

    // High contrast -> Default
    await paletteBtn.click();
    await expect(paletteBtn).toContainText('Palette: Default');
    expect(await page.evaluate(() => localStorage.getItem('ab-alone.palette'))).toBe('default');
  });

  test('captures screenshots for each palette', async ({ page }) => {
    mkdirSync('test-results/screenshots', { recursive: true });
    for (const pal of ['default', 'protan', 'deutan', 'tritan', 'contrast']) {
      await page.addInitScript((p) => localStorage.setItem('ab-alone.palette', p), pal);
      await page.goto('./?bot=off');
      await page.locator('canvas').waitFor();
      await page.screenshot({ path: `test-results/screenshots/palette-${pal}.png` });
    }
  });
});
