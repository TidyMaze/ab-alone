import { expect, test, type Page } from '@playwright/test';

// The gamepad (#1252) on a mocked navigator.getGamepads: one pad of the standard layout, set from the test.
const A = 0, B = 1, RB = 5, START = 9, DOWN = 13;

const frames = (page: Page, n = 3): Promise<unknown> =>
  page.evaluate((n) => new Promise((done) => {
    let left = n;
    const next = (): void => void (--left <= 0 ? done(null) : requestAnimationFrame(next));
    requestAnimationFrame(next);
  }), n);
// A held aim, LB or RB repeats after 400 ms (gamepad.ts REPEAT_DELAY), so a press is held for one frame: the game reads
// it in that frame, and a slow run of frames cannot turn one press into two (#1413).
const hold = async (page: Page, buttons: number[], axes = [0, 0, 0, 0], values: Record<number, number> = {}, n = 3): Promise<void> => {
  await page.evaluate(([buttons, axes, values]) => {
    const pad = (window as any).__pad;
    pad.axes = axes;
    pad.buttons.forEach((b: { pressed: boolean; value: number }, i: number) => Object.assign(b, { pressed: buttons.includes(i), value: (values as any)[i] ?? (buttons.includes(i) ? 1 : 0) }));
  }, [buttons, axes, values] as const);
  await frames(page, n);
};
// The press is set and released inside the page, in two consecutive frames: the game polls the pad once per frame, so it sees the
// button down in exactly one poll whatever the frame time. A press held across a Playwright round trip lasted over 400 ms on a
// software-GL runner (a frame costs about a second there) and the game repeated it: LB turned the camera 90 degrees, not 30 (#1436).
const tap = (page: Page, button: number): Promise<unknown> =>
  page.evaluate((button) => new Promise((done) => {
    const pad = (window as any).__pad;
    const set = (down: boolean): void => Object.assign(pad.buttons[button], { pressed: down, value: down ? 1 : 0 });
    requestAnimationFrame(() => {
      set(true);
      requestAnimationFrame(() => {
        set(false);
        done(null);
      });
    });
  }), button);

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
  await expect(page.locator('canvas:not(#openworld-minimap)')).toBeFocused();

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

// The Open world (#1252) on the real page: the first press of the pad switches the help to its buttons (a CSS rule that needs a
// real layout), LB turns the camera and the left stick walks the hero, through the real frame loop. R3 resetting the camera, the
// triggers' zoom and the walk onto a lair are src/main.gamepad.test.ts ("LB and RB turn the camera one step ... R3 resets it",
// "the triggers zoom the Open world", "the stick walks onto a lair"): each frame costs a second on software GL (#1436).
test('a gamepad turns the Open world camera, switches the help to its buttons and walks the hero', async ({ page }) => {
  await page.addInitScript(() => {
    const pad = { connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
    (window as any).__pad = pad;
    Object.defineProperty(navigator, 'getGamepads', { value: () => [pad] });
  });
  await page.goto('./?bot=off&openworld=7');
  await page.locator('canvas:not(#openworld-minimap)').waitFor();
  const at = () => page.evaluate(() => document.body.dataset.openworldAt);
  await expect.poll(at).toBe('0,0');
  const yaw = () => page.evaluate(() => document.body.dataset.openworldYaw);
  await expect(page.locator('#openworld-hud .keys-hint')).toBeVisible();
  await tap(page, 4); // LB: the first press of the pad switches the help to its buttons
  await expect.poll(yaw).toBe('30');
  await expect(page.locator('#openworld-hud .pad-hint')).toBeVisible();
  await expect(page.locator('#openworld-hud .keys-hint')).toBeHidden();
  await hold(page, [], [0.9, 0, 0, 0]); // the stick walks
  await hold(page, []);
  await expect.poll(at).not.toBe('0,0');
});
