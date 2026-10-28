import { expect, test } from '@playwright/test';

// Issue #297: New game and Copy diagnostics show an icon. Each keeps its old text as its accessible name and tooltip,
// so getByRole still finds it, and on a touch screen each is a target of at least 44 px. Play online shows its name
// again, as the other items of the mode menu (#839, hud-buttons.spec.ts).
const NAMES = ['New game', 'Copy diagnostics'];

test('the two HUD icon buttons show an icon and keep their name and tooltip', async ({ page }) => {
  await page.goto('./?bot=off');
  await page.locator('canvas').waitFor();
  for (const name of NAMES) {
    const button = page.getByRole('button', { name, exact: true });
    await expect(button).toBeEnabled();
    await expect(button).toHaveAttribute('title', name);
    await expect(button.locator('svg')).toHaveCount(1);
    await expect(button).toHaveText('');
  }
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true });

  test('each icon button is a touch target of at least 44 px', async ({ page }) => {
    await page.goto('./?bot=off');
    await page.locator('canvas').waitFor();
    for (const name of NAMES) {
      const button = page.getByRole('button', { name, exact: true });
      await expect(button).toBeEnabled();
      const box = await button.boundingBox();
      expect(box, name).not.toBeNull();
      expect(box!.width, `${name} width`).toBeGreaterThanOrEqual(44);
      expect(box!.height, `${name} height`).toBeGreaterThanOrEqual(44);
    }
  });
});
