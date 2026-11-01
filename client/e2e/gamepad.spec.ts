import { expect, test, type Page } from '@playwright/test';

// The gamepad (#1252) on a mocked navigator.getGamepads: one pad of the standard layout, set from the test.
const A = 0, B = 1, RB = 5, START = 9, DOWN = 13;

const frames = (page: Page, n = 3): Promise<unknown> =>
  page.evaluate((n) => new Promise((done) => {
    let left = n;
    const next = (): void => void (--left <= 0 ? done(null) : requestAnimationFrame(next));
    requestAnimationFrame(next);
  }), n);
const hold = async (page: Page, buttons: number[], axes = [0, 0, 0, 0]): Promise<void> => {
  await page.evaluate(([buttons, axes]) => {
    const pad = (window as any).__pad;
    pad.axes = axes;
    pad.buttons.forEach((b: { pressed: boolean; value: number }, i: number) => Object.assign(b, { pressed: buttons.includes(i), value: buttons.includes(i) ? 1 : 0 }));
  }, [buttons, axes]);
  await frames(page);
};
const tap = async (page: Page, button: number): Promise<void> => {
  await hold(page, [button]);
  await hold(page, []);
};

test('a gamepad alone plays a move: Start and B, the D-pad to the board, RB, the stick, A', async ({ page }) => {
  await page.addInitScript(() => {
    const pad = { connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
    (window as any).__pad = pad;
    Object.defineProperty(navigator, 'getGamepads', { value: () => [pad] });
  });
  await page.goto('./?bot=off');
  await expect(page.locator('#hud')).toContainText('Black to move');

  await tap(page, START);
  await expect(page.locator('#settings-menu')).toBeVisible();
  await tap(page, B);
  await expect(page.locator('#settings-menu')).toBeHidden();

  const onCanvas = () => page.evaluate(() => document.activeElement?.tagName === 'CANVAS');
  for (let i = 0; i < 40 && !(await onCanvas()); i++) await tap(page, DOWN);
  await expect(page.locator('canvas')).toBeFocused();

  await tap(page, RB);
  await expect(page.locator('#hud')).toContainText('LB RB to switch');
  const dir = await page.evaluate(() => {
    const w = window as any;
    const [cell] = w.__rings();
    return w.__legal().find((m: any) => m.cells.length === 1 && m.cells[0][0] === cell[0] && m.cells[0][1] === cell[1]).dir as number;
  });
  const angle = [0, 180, 60, 240, 120, 300][dir]! * (Math.PI / 180);
  await hold(page, [], [Math.cos(angle), -Math.sin(angle), 0, 0]);
  await hold(page, []);
  await expect(page.locator('#hud')).toContainText('A to play');
  await expect(page.locator('body')).toHaveAttribute('data-ghosts', '1');

  await tap(page, A);
  await expect(page.locator('#hud')).toContainText('White to move');
});
