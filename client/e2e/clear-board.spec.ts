import { expect, test } from '@playwright/test';

test('clear-board toggles, survives a reload, and the board still plays', async ({ page }) => {
  await page.goto('/?bot=off');
  await page.locator('canvas').waitFor();
  const body = page.locator('body');
  const toggle = page.locator('#clear-board');

  await expect(body).toHaveAttribute('data-clear', 'off');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');

  await toggle.click();
  await expect(body).toHaveAttribute('data-clear', 'on');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');

  await page.reload();
  await page.locator('canvas').waitFor();
  await expect(page.locator('#hud')).toContainText('Black to move');
  await expect(body).toHaveAttribute('data-clear', 'on');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');

  // Clicks hit nothing before the first rendered frame (the raycaster needs the updated matrices).
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  const click = async (q: number, r: number) => {
    const p = await page.evaluate(([cq, cr]) => (window as any).__cellToScreen(cq, cr), [q, r]);
    await page.mouse.click(p.x, p.y);
  };
  await click(0, 2);
  await click(0, 1);
  await expect(page.locator('#hud')).toContainText('White to move');

  await toggle.click();
  await expect(body).toHaveAttribute('data-clear', 'off');
});
