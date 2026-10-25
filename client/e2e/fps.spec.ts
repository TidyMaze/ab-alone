import { expect, test } from '@playwright/test';

// The FPS readout (#426): off by default, switched on in the settings menu, kept across a reload, its last value in
// Copy diagnostics.
test('the FPS readout is off by default, shows a rate once switched on, and survives a reload', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('./?bot=off');
  await page.locator('canvas').waitFor();
  const readout = page.locator('#fps');
  await expect(readout).toBeHidden();

  await page.getByRole('button', { name: 'Settings' }).click();
  const fps = page.getByRole('button', { name: 'FPS' });
  await expect(fps).toHaveAttribute('aria-pressed', 'false');
  await fps.click();
  await expect(fps).toHaveAttribute('aria-pressed', 'true');
  await expect(readout).toBeVisible();
  await expect.poll(async () => parseInt((await readout.textContent()) ?? '0', 10), { timeout: 8000 }).toBeGreaterThan(0);

  await page.reload();
  await page.locator('canvas').waitFor();
  await expect(readout).toBeVisible();
  await page.getByRole('button', { name: 'Copy diagnostics' }).click();
  const diagnostics = JSON.parse(await page.evaluate(() => navigator.clipboard.readText()));
  expect(diagnostics.environment.fps).toBeGreaterThan(0);
});
