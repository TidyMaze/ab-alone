import { expect, test } from '@playwright/test';

// Issue #297: New game shows an icon. It keeps its old text as its accessible name and tooltip, so getByRole still finds
// it, and on a touch screen it is a target of at least 44 px. Copy diagnostics is a row of the settings list since #1032
// (an icon and its label, opened by the cog), so it is checked there. Play online shows its name again, as the other
// items of the mode menu (#839, hud-buttons.spec.ts).
const NAME = 'New game';

test('the New game icon button shows an icon and keeps its name and tooltip', async ({ page }) => {
  await page.goto('./?bot=off');
  await page.locator('canvas').waitFor();
  const button = page.getByRole('button', { name: NAME, exact: true });
  await expect(button).toBeEnabled();
  await expect(button).toHaveAttribute('title', NAME);
  await expect(button.locator('svg')).toHaveCount(1);
  await expect(button).toHaveText('');
});

test('Copy diagnostics is a settings row with its icon and its label, #1032', async ({ page }) => {
  await page.goto('./?bot=off');
  await page.locator('canvas').waitFor();
  await page.getByRole('button', { name: 'Settings' }).click();
  const copy = page.getByRole('button', { name: 'Copy diagnostics', exact: true });
  await expect(copy).toHaveAttribute('title', 'Copy diagnostics');
  await expect(copy.locator('svg')).toHaveCount(1);
  await expect(copy.locator('span')).toHaveText('Copy diagnostics');
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true });

  test('the New game icon button is a touch target of at least 44 px', async ({ page }) => {
    await page.goto('./?bot=off');
    await page.locator('canvas').waitFor();
    const button = page.getByRole('button', { name: NAME, exact: true });
    await expect(button).toBeEnabled();
    const box = await button.boundingBox();
    expect(box, NAME).not.toBeNull();
    expect(box!.width, `${NAME} width`).toBeGreaterThanOrEqual(44);
    expect(box!.height, `${NAME} height`).toBeGreaterThanOrEqual(44);
  });
});
