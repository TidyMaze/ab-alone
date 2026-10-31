import { expect, test, type Page } from '@playwright/test';

// The refined room (#1138, roomrefined.ts): six point lights at most behind ?room=refined, today's room unchanged by default.
const lights = (page: Page): Promise<number> =>
  page.evaluate(() => (window as unknown as { __renderCost: { pointLights: number } }).__renderCost.pointLights);

test('?room=refined lights the room with six point lights at most (#1138, #845)', async ({ page }) => {
  await page.goto('./?bot=on&room=refined');
  await page.locator('canvas').waitFor();
  await expect(page.locator('body')).toHaveAttribute('data-bay', 'ready');
  expect(await lights(page)).toBeLessThanOrEqual(6);
  await expect(page.locator('#hud')).toContainText('White to move');
});

test('?room=today keeps its many lights (#1138)', async ({ page }) => {
  await page.goto('./?bot=on&room=today');
  await expect(page.locator('body')).toHaveAttribute('data-bay', 'ready');
  expect(await lights(page)).toBeGreaterThan(6);
});
