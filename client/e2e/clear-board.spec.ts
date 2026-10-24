import { expect, test } from '@playwright/test';

test('clear-board toggles, survives a reload, and the board still plays', async ({ page }) => {
  await page.goto('./?bot=off');
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

// Bug #146: main.ts awaits the wasm engine, the renderer and the textures before it attaches the
// Clear board listener. A click right after domcontentloaded must either hit a disabled button or toggle.
test('Clear board is disabled or works when clicked right after load, bug #146', async ({ page }) => {
  await page.goto('./?bot=off', { waitUntil: 'domcontentloaded' });
  const atClick = await page.evaluate(() => {
    const button = document.getElementById('clear-board') as HTMLButtonElement;
    const disabled = button.disabled;
    button.click();
    return { disabled, pressed: button.getAttribute('aria-pressed') };
  });
  expect(atClick.disabled || atClick.pressed === 'true').toBe(true);
  await expect(page.locator('#clear-board')).toBeEnabled(); // and it works once the page is ready
});
