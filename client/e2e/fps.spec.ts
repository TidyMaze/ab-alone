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
  await page.getByRole('button', { name: 'Settings' }).click(); // the clipboard is the last row of the settings list (#1032)
  await page.getByRole('button', { name: 'Copy diagnostics' }).click();
  const diagnostics = JSON.parse(await page.evaluate(() => navigator.clipboard.readText()));
  expect(diagnostics.environment.fps).toBeGreaterThan(0);
});

test('marble selection preserves framerate and causes no frame time spikes, bug #777', async ({ page }) => {
  await page.goto('./?bot=off');
  await page.locator('canvas').waitFor();
  await page.waitForTimeout(500);

  const maxFrameDelta = await page.evaluate(async () => {
    let maxDelta = 0;
    let last = performance.now();
    let tracking = true;
    const measure = (now: number) => {
      if (!tracking) return;
      const delta = now - last;
      if (delta > maxDelta) maxDelta = delta;
      last = now;
      requestAnimationFrame(measure);
    };
    requestAnimationFrame(measure);

    // Warm up 3 frames
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))));

    // Select marble (0, 4)
    (window as any).__click(0, 4);

    // Track 10 frames post-click
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => requestAnimationFrame(r));
    }
    tracking = false;
    return maxDelta;
  });

  console.log('Max frame delta during selection:', maxFrameDelta.toFixed(1), 'ms');
  expect(maxFrameDelta).toBeLessThan(60);
});
