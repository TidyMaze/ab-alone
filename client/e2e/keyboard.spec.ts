import { expect, test } from '@playwright/test';

test('a move is played with the keyboard alone: Tab, a direction key, Enter', async ({ page }) => {
  await page.goto('./?bot=off');
  await page.locator('canvas').waitFor();
  await expect(page.locator('#hud')).toContainText('Black to move');

  const onCanvas = () => page.evaluate(() => document.activeElement?.tagName === 'CANVAS');
  for (let i = 0; i < 20 && !(await onCanvas()); i++) await page.keyboard.press('Tab'); // the page's buttons come first
  await expect(page.locator('canvas')).toBeFocused();
  await page.keyboard.press('Tab'); // selects the first legal group
  await expect(page.locator('#hud')).toContainText('group 1 of');
  expect(await page.evaluate(() => (window as any).__rings().length)).toBeGreaterThan(0);

  const mv = await page.evaluate(() => {
    const w = window as any;
    const [cell] = w.__rings();
    return w.__legal().find((m: any) => m.cells.length === 1 && m.cells[0][0] === cell[0] && m.cells[0][1] === cell[1]);
  });
  const key = ({ 4: 'q', 2: 'w', 0: 'e', 1: 'a', 3: 's', 5: 'd' } as Record<number, string>)[mv.dir]!;
  await page.keyboard.press(key);
  await expect(page.locator('#hud')).toContainText('Enter to play');
  await expect(page.locator('body')).toHaveAttribute('data-ghosts', '1');

  await page.keyboard.press('Enter');
  await expect(page.locator('#hud')).toContainText('White to move');
});
