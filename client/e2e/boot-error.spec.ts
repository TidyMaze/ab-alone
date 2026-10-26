import { expect, test } from '@playwright/test';

// A failed start (#737): with the wasm file blocked the page says so, with a Reload button, instead of staying blank.
test('a blocked wasm file shows the reason and a Reload button', async ({ page }) => {
  await page.route('**/*.wasm', (route) => route.abort());
  await page.goto('./?bot=off');
  const box = page.getByRole('alert');
  await expect(box).toContainText('The game could not start:');
  await expect(box.getByRole('button', { name: 'Reload' })).toBeVisible();
  await page.screenshot({ path: 'test-results/boot-error.png' });
});
