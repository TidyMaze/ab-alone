import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { shot } from './shot';

test.describe('Difficulty setting for AI and boss (#704)', () => {
  test('cycles through difficulty options and survives reload', async ({ page }) => {
    await page.goto('./?bot=off&net=hook');
    await page.locator('canvas').waitFor();
    const cog = page.locator('#settings');
    await expect(cog).toBeEnabled();
    await cog.click();

    const diffBtn = page.locator('#setting-difficulty');
    await expect(diffBtn).toBeVisible();
    await expect(diffBtn).toContainText('50%'); // a fresh profile plays on Easy (#1664)

    mkdirSync('test-results/screenshots', { recursive: true });
    await shot(page, { path: 'test-results/screenshots/704-difficulty-settings.png' });

    // Easy -> Normal (100%)
    await diffBtn.click();
    await expect(diffBtn).toContainText('100%');
    expect(await page.evaluate(() => localStorage.getItem('ab-alone.difficulty'))).toBe('normal');

    // Normal -> Hard (200%)
    await diffBtn.click();
    await expect(diffBtn).toContainText('200%');
    expect(await page.evaluate(() => localStorage.getItem('ab-alone.difficulty'))).toBe('hard');

    // Reload and verify persistence
    await page.reload();
    await page.locator('canvas').waitFor();
    expect(await page.evaluate(() => localStorage.getItem('ab-alone.difficulty'))).toBe('hard');

    await cog.click();
    await expect(diffBtn).toContainText('200%');

    // Hard -> Easy (50%)
    await diffBtn.click();
    await expect(diffBtn).toContainText('50%');
    expect(await page.evaluate(() => localStorage.getItem('ab-alone.difficulty'))).toBe('easy');
  });
});
