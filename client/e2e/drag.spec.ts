import { expect, test } from '@playwright/test';

// The drag play (#794): press on a marble, pass over the group, release past it toward the direction of a move.
test('a drag over two marbles and out toward a direction plays the move; a drag off the marbles orbits', async ({ page }) => {
  await page.goto('./?bot=off');
  await page.locator('canvas').waitFor();
  await expect(page.locator('#hud')).toContainText('Black to move');

  const at = (q: number, r: number) => page.evaluate(([a, b]) => (window as any).__cellToScreen(a, b) as { x: number; y: number }, [q, r]);
  const mv = await page.evaluate(() => (window as any).__legal().find((m: any) => m.cells.length === 2));
  const [a, b] = mv.cells as [number, number][];
  const steps = [[1, 0], [-1, 0], [1, -1], [-1, 1], [0, -1], [0, 1]][mv.dir]!;
  const out = await at((a[0] + b[0]) / 2 + 1.5 * steps[0]!, (a[1] + b[1]) / 2 + 1.5 * steps[1]!);

  const first = await at(a[0], a[1]);
  const second = await at(b[0], b[1]);
  await page.mouse.move(first.x, first.y);
  await page.mouse.down();
  await page.mouse.move(second.x, second.y, { steps: 6 });
  expect(await page.evaluate(() => (window as any).__rings().length)).toBe(2);
  await page.mouse.move(out.x, out.y, { steps: 6 });
  await page.mouse.up();
  await expect(page.locator('#hud')).toContainText('White to move');
  expect(await page.evaluate(() => (window as any).__plies())).toBe(1);

  // The camera orbit still starts off the marbles.
  const corner = await at(4, -4);
  await page.mouse.move(5, 5);
  await page.mouse.down();
  await page.mouse.move(120, 40, { steps: 5 });
  await page.mouse.up();
  const turned = await at(4, -4);
  expect(Math.hypot(turned.x - corner.x, turned.y - corner.y)).toBeGreaterThan(20);
});
