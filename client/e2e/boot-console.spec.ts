import { expect, test } from '@playwright/test';

// Boot writes no Three.js error to the console (#1505: Object3D.add called with no object).
test('the boot logs no console error', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./');
  await page.locator('canvas').waitFor();
  await page.waitForFunction(() => (window as any).__draws() > 2);
  expect(errors.filter((e) => e.includes('THREE.'))).toEqual([]);
});
