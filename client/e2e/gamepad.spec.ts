import { expect, test, type Page } from '@playwright/test';

// The gamepad (#1252) on a mocked navigator.getGamepads: one pad of the standard layout, set from the test.
const A = 0, B = 1, RB = 5, START = 9, DOWN = 13;

const frames = (page: Page, n = 3): Promise<unknown> =>
  page.evaluate((n) => new Promise((done) => {
    let left = n;
    const next = (): void => void (--left <= 0 ? done(null) : requestAnimationFrame(next));
    requestAnimationFrame(next);
  }), n);
const hold = async (page: Page, buttons: number[], axes = [0, 0, 0, 0], values: Record<number, number> = {}): Promise<void> => {
  await page.evaluate(([buttons, axes, values]) => {
    const pad = (window as any).__pad;
    pad.axes = axes;
    pad.buttons.forEach((b: { pressed: boolean; value: number }, i: number) => Object.assign(b, { pressed: buttons.includes(i), value: (values as any)[i] ?? (buttons.includes(i) ? 1 : 0) }));
  }, [buttons, axes, values] as const);
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

// The Open world (#1252): the left stick walks the hero, LB and R3 turn and reset the camera, a walk onto a lair starts the fight.
test('a gamepad walks the Open world, turns its camera and enters a lair', async ({ page }) => {
  await page.addInitScript(() => {
    const pad = { connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
    (window as any).__pad = pad;
    Object.defineProperty(navigator, 'getGamepads', { value: () => [pad] });
  });
  await page.goto('./?bot=off&openworld=7');
  await page.locator('canvas').waitFor();
  await page.locator('#modes').click();
  const at = () => page.evaluate(() => document.body.dataset.openworldAt);
  await expect.poll(at).toBe('0,0');
  const yaw = () => page.evaluate(() => document.body.dataset.openworldYaw);
  await expect(page.locator('#openworld-hud .keys-hint')).toBeVisible();
  await tap(page, 4); // LB: the first press of the pad switches the help to its buttons
  await expect.poll(yaw).toBe('30');
  await expect(page.locator('#openworld-hud .pad-hint')).toBeVisible();
  await expect(page.locator('#openworld-hud .keys-hint')).toBeHidden();
  await tap(page, 11); // R3
  await expect.poll(yaw).toBe('-30');
  await hold(page, [], [0, 0, 0, 0], { 6: 1 }); // LT zooms out
  await hold(page, []);
  expect(Number(await page.evaluate(() => document.body.dataset.openworldZoom))).toBeGreaterThan(1);

  await hold(page, [], [0.9, 0, 0, 0]); // the stick walks
  await hold(page, []);
  await expect.poll(at).not.toBe('0,0');

  const lairs = (await page.evaluate(() => document.body.dataset.openworldLairs))!.split(' ');
  const [q, r] = lairs[0]!.split(',').map(Number) as [number, number];
  await page.evaluate(([q, r]) => (window as any).__openworldFixture({ hero: [q - 1, r], troop: [], enemies: [] }), [q, r]);
  await expect.poll(at).toBe(`${q - 1},${r}`);
  await hold(page, [], [0.9, -0.5, 0, 0]); // right and up, in the default camera: the east step
  await hold(page, []);
  await expect(page.locator('body')).toHaveAttribute('data-boss', /.+/);

});
