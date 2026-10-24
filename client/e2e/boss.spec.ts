import { expect, test } from '@playwright/test';

test('start The Echo, play a move, the boss replies, Retry resets the board', async ({ page }) => {
  await page.goto('./');
  await page.locator('canvas').waitFor();
  const hud = page.locator('#hud');
  const plies = () => page.evaluate(() => (window as any).__plies());
  const click = async (q: number, r: number) => {
    const p = await page.evaluate(([cq, cr]) => (window as any).__cellToScreen(cq, cr), [q, r]);
    await page.mouse.click(p.x, p.y);
  };

  await page.getByRole('button', { name: 'Boss fight' }).click();
  await page.locator('#boss-list').getByRole('button', { name: 'The Echo' }).click();
  await expect(hud).toContainText('The Echo');
  await expect(hud).toContainText('P1');
  await expect(hud).toContainText('Black to move');
  await expect(page.locator('#hud .notch.active')).toHaveText('P1');

  await click(0, 2); // a Black marble
  await click(0, 1); // its NW neighbour, empty at the start

  // The boss answers in the worker: two plies, the HUD is back on the human side.
  await expect.poll(plies, { timeout: 30_000 }).toBe(2);
  await expect(hud).toContainText('Black to move');
  await expect(hud).toContainText('The Echo');
  await page.screenshot({ path: 'test-results/boss-hud.png', clip: { x: 0, y: 0, width: 420, height: 260 } });

  await page.getByRole('button', { name: 'Retry' }).click();
  await expect.poll(plies).toBe(0);
  await expect(hud).toContainText('Black to move');
  await expect(hud).toContainText('The Echo');
  await expect(hud).toContainText('Black ejected 0/6');
});

// Bug #144: main.ts awaits the wasm engine, the renderer and the textures before it attaches the
// Boss fight listener. A click right after domcontentloaded must either hit a disabled button or open the list.
test('Boss fight is disabled or works when clicked right after load, bug #144', async ({ page }) => {
  await page.goto('./', { waitUntil: 'domcontentloaded' });
  const atClick = await page.evaluate(() => {
    const button = document.getElementById('boss-fight') as HTMLButtonElement;
    const disabled = button.disabled;
    button.click();
    return { disabled, open: !document.getElementById('boss-list')!.hidden };
  });
  expect(atClick.disabled || atClick.open).toBe(true);
  await expect(page.locator('#boss-fight')).toBeEnabled(); // and it works once the page is ready
});

// The Hull (#149): a rim cell cracks at ply 8, shows its ticks for 2 plies, then it is a hole.
test('start The Hull, play to the first wave: a cracked cell ticks down, then vanishes, #149', async ({ page }, testInfo) => {
  test.slow(); // five boss searches in the worker, then a sixth ply
  await page.goto('./');
  await page.locator('canvas').waitFor();
  const body = page.locator('body');
  const hud = page.locator('#hud');
  const plies = () => page.evaluate(() => (window as any).__plies());
  const click = async (q: number, r: number) => {
    const p = await page.evaluate(([cq, cr]) => (window as any).__cellToScreen(cq, cr), [q, r]);
    await page.mouse.click(p.x, p.y);
  };
  // A forward one-marble move (NW or NE): Black never steps back, so no position repeats.
  const advance = async () => {
    const mv = await page.evaluate(() =>
      (window as any).__legal().find((m: any) => m.cells.length === 1 && (m.dir === 4 || m.dir === 2)),
    );
    const [q, r] = mv.cells[0];
    await click(q, r);
    await click(mv.dir === 4 ? q : q + 1, r - 1);
  };

  await page.getByRole('button', { name: 'Boss fight' }).click();
  await page.locator('#boss-list').getByRole('button', { name: 'The Hull' }).click();
  await expect(hud).toContainText('The Hull');
  await expect(body).toHaveAttribute('data-cracks', '0');
  for (let n = 1; n <= 4; n++) {
    await advance();
    await expect.poll(plies, { timeout: 30_000 }).toBe(2 * n); // the boss replied
  }
  await expect(body).toHaveAttribute('data-cracks', '1');
  await expect(hud).toContainText('Rim cracks: 1 cell in 2 plies');
  await page.screenshot({ path: testInfo.outputPath('hull-cracked.png') });

  await advance();
  await expect.poll(plies, { timeout: 30_000 }).toBe(10);
  await expect(body).toHaveAttribute('data-vanished', '1');
  await expect(body).toHaveAttribute('data-cracks', '0');
  await expect(hud).not.toContainText('Rim cracks');
  await page.screenshot({ path: testInfo.outputPath('hull-vanished.png') });
});
