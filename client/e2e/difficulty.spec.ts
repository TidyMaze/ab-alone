import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';

test.describe('Difficulty setting for AI and boss (#704)', () => {
  test('cycles through difficulty options and survives reload', async ({ page }) => {
    await page.goto('./?bot=off&net=hook');
    await page.locator('canvas').waitFor();
    const cog = page.locator('#settings');
    await expect(cog).toBeEnabled();
    await cog.click();

    const diffBtn = page.locator('#setting-difficulty');
    await expect(diffBtn).toBeVisible();
    await expect(diffBtn).toContainText('100%');

    mkdirSync('test-results/screenshots', { recursive: true });
    await page.screenshot({ path: 'test-results/screenshots/704-difficulty-settings.png' });

    // Normal -> Hard (200%)
    await diffBtn.click();
    await expect(diffBtn).toContainText('200%');
    expect(await page.evaluate(() => localStorage.getItem('ab-alone.difficulty'))).toBe('hard');

    // Hard -> Easy (50%)
    await diffBtn.click();
    await expect(diffBtn).toContainText('50%');
    expect(await page.evaluate(() => localStorage.getItem('ab-alone.difficulty'))).toBe('easy');

    // Reload and verify persistence
    await page.reload();
    await page.locator('canvas').waitFor();
    expect(await page.evaluate(() => localStorage.getItem('ab-alone.difficulty'))).toBe('easy');

    await cog.click();
    await expect(diffBtn).toContainText('50%');

    // Easy -> Normal (100%)
    await diffBtn.click();
    await expect(diffBtn).toContainText('100%');
    expect(await page.evaluate(() => localStorage.getItem('ab-alone.difficulty'))).toBe('normal');
  });
});
