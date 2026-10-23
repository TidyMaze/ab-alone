import { expect, test } from '@playwright/test';

test('hovering a legal target of the selected marble shows a ghost, an illegal one shows none', async ({
  page,
}) => {
  await page.goto('/?bot=off');
  await page.locator('canvas').waitFor();
  await expect(page.locator('#hud')).toContainText('Black to move');

  const at = async (q: number, r: number) => {
    const p = await page.evaluate(([cq, cr]) => (window as any).__cellToScreen(cq, cr), [q, r]);
    return p as { x: number; y: number };
  };
  const ghosts = page.locator('body');

  await page.mouse.click((await at(0, 2)).x, (await at(0, 2)).y); // select a Black marble
  await page.mouse.move((await at(0, 1)).x, (await at(0, 1)).y); // legal target, empty
  await expect(ghosts).toHaveAttribute('data-ghosts', '1');

  await page.mouse.move((await at(0, -3)).x, (await at(0, -3)).y); // far away, illegal
  await expect(ghosts).toHaveAttribute('data-ghosts', '0');

  await expect(page.locator('#hud')).toContainText('Black to move'); // hovering never plays
});
