import { expect, test, type Page } from '@playwright/test';
import { contrastRatio, type RGB } from '../src/contrast';
import { openModes } from './modes';

// #521: the Ship entry of the mode menu draws the deck's hub map (docs/specs/game-design.md section 3.5) and the glass
// marble, which rolls one cell at a time by a click on a neighbour or an arrow key. body[data-hub] names its deck and
// cell. The spot is saved: after a reload, Ship lands on the same cell.
// #522: rolling onto a boss door or a table starts its game, and once that game is over Back to the ship puts the
// marble back on the door. The battle royale lobby is shown closed.
// #523: a lift wears an arrow toward its deck, with a bar across while it is locked. A locked lift keeps the marble out
// and Tally says one short line; a boss win opens it. body[data-lifts] lists the lifts of the deck.
// #524: rolling onto a terminal opens its lore entry in the reader; Esc leaves it to the hub on the same cell.
// #583: no game is on in the hub: the evaluation bar and Hint are hidden there.

async function ship(page: Page): Promise<void> {
  await openModes(page);
  await page.getByRole('button', { name: 'Ship' }).click();
}

/** Opens `url`, then Ship with the marble saved on `cell` of the Mess. */
async function shipAt(page: Page, url: string, cell: [number, number]): Promise<void> {
  await page.goto(url);
  await page.locator('canvas').waitFor();
  await page.evaluate((cell) => {
    localStorage.setItem('ab-alone.progress', JSON.stringify({ version: 1, deck: 'mess', cell, beaten: [] }));
  }, cell);
  await ship(page);
  await expect(page.locator('body')).toHaveAttribute('data-hub', `mess ${cell[0]},${cell[1]}`);
}

/** A mouse click on a cell, through the page's raycast. */
async function clickCell(page: Page, q: number, r: number): Promise<void> {
  const { x, y } = await page.evaluate(([q, r]) => (window as any).__cellToScreen(q, r), [q, r]);
  await page.mouse.click(x, y);
}

/** The same click without the raycast and the frames of a mouse click, to stay fast. */
async function hookClick(page: Page, q: number, r: number): Promise<void> {
  await page.evaluate(([q, r]) => (window as any).__click(q, r), [q, r]);
}

test('the marble walks the Mess past its rooms, and a reload lands it on the same cell, #521', async ({ page }) => {
  await page.goto('./?bot=off');
  await page.locator('canvas').waitFor();
  const body = page.locator('body');
  const hud = page.locator('#hud');
  await ship(page);
  await expect(body).toHaveAttribute('data-hub', 'mess 0,0');
  await expect(hud).toContainText('Ship · Mess');

  const rooms: [number, number, string][] = [
    [1, 1, 'Terminal'],
  ];
  // One mouse click, then the same click without the raycast and the frames of a mouse click (__click), to stay fast.
  await clickCell(page, 1, 0);
  await expect(body).toHaveAttribute('data-hub', 'mess 1,0');
  const path: [number, number][] = [[1, 1], [0, 2], [-1, 2]];
  for (const [q, r] of path) {
    await hookClick(page, q, r);
    await expect(body).toHaveAttribute('data-hub', `mess ${q},${r}`);
    const room = rooms.find(([rq, rr]) => rq === q && rr === r);
    if (room) {
      await expect(hud).toContainText(room[2]);
      if (await body.getAttribute('data-reading')) await page.keyboard.press('Escape');
    }
  }
  await page.keyboard.press('ArrowUp');
  await expect(body).toHaveAttribute('data-hub', 'mess 0,1');

  await page.reload();
  await page.locator('canvas').waitFor();
  await ship(page);
  await expect(body).toHaveAttribute('data-hub', 'mess 0,1');
});

test('the boss door starts the Echo, and Back to the ship after the defeat lands on the door, #522', async ({ page }, testInfo) => {
  await shipAt(page, './?bot=off', [1, 0]);
  await page.screenshot({ path: testInfo.outputPath('hub-before-door.png') });
  await hookClick(page, 2, 0);
  const body = page.locator('body');
  await expect(body).toHaveAttribute('data-boss', 'echo');
  await expect(body).not.toHaveAttribute('data-hub');
  // ?bot=off: the test plays both sides, one marble each there and back twice, a draw by repetition: a defeat.
  const moves = [[0, 2, 0, 1], [0, -2, 0, -1], [0, 1, 0, 2], [0, -1, 0, -2]];
  for (const [ply, [q, r, tq, tr]] of [...moves, ...moves].entries()) {
    await hookClick(page, q!, r!);
    await hookClick(page, tq!, tr!);
    await expect.poll(() => page.evaluate(() => (window as any).__plies())).toBe(ply + 1);
  }
  await expect(page.locator('#hud')).toContainText('Defeat');
  const back = page.getByRole('button', { name: 'Back to the ship' });
  await expect(back).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('back-to-the-ship.png') });
  await back.click();
  await expect(body).toHaveAttribute('data-hub', 'mess 2,0');
  await expect(page.locator('#hud')).toContainText('Boss door');
  await expect(back).toBeHidden();
});

test('the evaluation bar and Hint are off in the hub and back once a new game leaves it, #583', async ({ page }, testInfo) => {
  await page.goto('./?bot=off');
  await page.locator('canvas').waitFor();
  const bar = page.locator('#eval');
  const hint = page.getByRole('button', { name: 'Hint' });
  await expect(bar).toBeVisible();
  await expect(hint).toBeVisible();
  await ship(page);
  await expect(page.locator('body')).toHaveAttribute('data-hub', 'mess 0,0');
  await expect(bar).toBeHidden();
  await expect(hint).toBeHidden();
  await page.screenshot({ path: testInfo.outputPath('hub-no-eval.png') });
  await page.locator('#new-game').click(); // no move played: one press starts over
  await expect(page.locator('body')).not.toHaveAttribute('data-hub');
  await expect(bar).toBeVisible();
  await expect(bar).toHaveAttribute('data-ply', '0', { timeout: 10_000 });
  await expect(hint).toBeVisible();
});

test('the hot-seat table starts a game for two at one table, #522', async ({ page }) => {
  await shipAt(page, './', [-1, 0]);
  await hookClick(page, -1, -1);
  await expect(page.locator('body')).not.toHaveAttribute('data-hub');
  await expect(page.locator('#hud')).toContainText('Mess: two crews, one table.');
});

test('the bot table starts a game the bot answers, #522', async ({ page }) => {
  await shipAt(page, './?nodes=100', [-1, 0]);
  await hookClick(page, -2, 0);
  await expect(page.locator('#hud')).toContainText('Mess: one seat filled.');
  await hookClick(page, 0, 2); // Black (0, 2) to (0, 1)
  await hookClick(page, 0, 1);
  await expect.poll(() => page.evaluate(() => (window as any).__plies())).toBe(2); // the bot replied
});

test('the online table opens a room with its invite link, as Play online does, #522', async ({ page }) => {
  await shipAt(page, './?bot=off&net=hook', [-1, 1]);
  await hookClick(page, -2, 1);
  await expect(page.locator('#invite')).toBeVisible();
  expect(await page.locator('#invite').inputValue()).toMatch(/#room=[\w-]+$/);
  await expect(page.locator('#hud')).toContainText('You are Black');
});

test('the battle royale lobby door starts battle royale, and Back to the ship lands on the door, #593', async ({ page }, testInfo) => {
  await shipAt(page, './?bot=off', [-1, 1]);
  const body = page.locator('body');
  await hookClick(page, -2, 2);
  await expect(body).not.toHaveAttribute('data-hub');
  await expect(body).toHaveAttribute('data-royale', '1');
  await expect(page.locator('#hud')).toContainText('Battle royale');
  await page.screenshot({ path: testInfo.outputPath('royale-arena.png') });
  await page.evaluate(() => (window as any).__royale({
    seed: 7,
    rounds: [
      [0, 3, 4, -4, 8, -4, 7, -4, 6],
      [0, 3, 4, -4, 7, -4, 6, -4, 5],
      [0, 3, 4, -4, 6, -4, 5, -4, 4],
      [0, 3, 4, -3, 8, -3, 7, -3, 6],
      [0, 3, 4, -3, 7, -3, 6, -3, 5],
      [0, 3, 4, -3, 6, -3, 5, -3, 4],
      [0, 3, 4, -5, 8, -5, 7, -5, 6],
      [0, 3, 4, -5, 7, -5, 6, -5, 5],
      [0, 3, 4, -5, 6, -5, 5, -5, 4],
      [0, 2, 4, -2, 7, -2, 6, 0, 0],
      [0, 2, 4, -2, 6, -2, 5, 0, 0],
      ...Array.from({ length: 14 }, () => []),
    ],
  }));
  await expect(body).toHaveAttribute('data-over', 'win');
  const back = page.getByRole('button', { name: 'Back to the ship' });
  await expect(back).toBeVisible();
  await back.click();
  await expect(body).toHaveAttribute('data-hub', 'mess -2,2');
  await expect(page.locator('#hud')).toContainText('Battle royale lobby');
  await page.screenshot({ path: testInfo.outputPath('royale-after.png') });
});

/** The colour of the lift glyph at the centre of `cell` and of the floor next to it, after a draw that began now: under
 * automation the page skips draws (#216, #365). */
async function liftPixels(page: Page, [q, r]: [number, number], path: string): Promise<[RGB, RGB]> {
  const draws = await page.evaluate(() => (window as any).__draws() as number);
  await page.waitForFunction((n) => (window as any).__draws() > n, draws);
  const png = await page.screenshot({ path });
  // The floor 0.28 west and 0.1 north of the centre: inside the ring, clear of the arrow and the bar.
  const floor: [number, number] = [q - 0.28 + 0.1 / Math.sqrt(3), r - 0.2 / Math.sqrt(3)];
  return page.evaluate(
    async ([b64, cells]) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = document.createElement('canvas');
      [c.width, c.height] = [img.width, img.height];
      const g = c.getContext('2d')!;
      g.drawImage(img, 0, 0);
      return cells.map(([cq, cr]) => {
        const { x, y } = (window as any).__cellToScreen(cq, cr);
        const [red, green, blue] = g.getImageData(Math.round(x), Math.round(y), 1, 1).data;
        return [red, green, blue];
      }) as [RGB, RGB];
    },
    [png.toString('base64'), [[q, r], floor]] as const,
  );
}

test('a locked lift keeps the marble out with a Tally line, and a boss win opens it, #523', async ({ page }, testInfo) => {
  await shipAt(page, './?bot=off', [1, -1]);
  const body = page.locator('body');
  await expect(body).toHaveAttribute('data-lifts', 'cargo locked');
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('#hud .tally')).toHaveText("Lift to Cargo: locked. This deck's boss is still on the books.");
  await expect(body).toHaveAttribute('data-hub', 'mess 1,-1');
  const locked = await liftPixels(page, [1, -2], testInfo.outputPath('lift-locked.png'));
  expect(contrastRatio(...locked)).toBeGreaterThanOrEqual(3);

  // The win as a won fight saves it (progress.ts recordWin), then Ship again.
  await page.evaluate(() => {
    const progress = JSON.parse(localStorage.getItem('ab-alone.progress')!);
    localStorage.setItem('ab-alone.progress', JSON.stringify({ ...progress, beaten: ['echo'] }));
  });
  await ship(page);
  await expect(body).toHaveAttribute('data-lifts', 'cargo open');
  await expect(page.locator('#hud .tally')).toHaveCount(0);
  const open = await liftPixels(page, [1, -2], testInfo.outputPath('lift-open.png'));
  expect(contrastRatio(...open)).toBeGreaterThanOrEqual(3);
  await page.keyboard.press('ArrowUp');
  await expect(body).toHaveAttribute('data-hub', 'cargo -1,2');
  await expect(body).toHaveAttribute('data-lifts', 'furnace locked,mess open');
  const cargo = await liftPixels(page, [1, -2], testInfo.outputPath('cargo-locked.png')); // in the Cargo's light
  expect(contrastRatio(...cargo)).toBeGreaterThanOrEqual(3);
});

test('a terminal room opens its lore entry in the reader, and Esc gives the hub back, #524', async ({ page }, testInfo) => {
  await shipAt(page, './?bot=off', [0, 1]);
  const body = page.locator('body');
  await expect(body).toHaveAttribute('data-console', /^mess-house-rule /); // the console's web fonts are in
  await page.screenshot({ path: testInfo.outputPath('terminal-before.png') });
  await hookClick(page, 1, 1);
  await expect(body).toHaveAttribute('data-reading', 'mess-corner-table');
  await expect(page.locator('#reader')).toContainText('Galley log, unsigned');
  await expect(page.getByRole('button', { name: 'Play log' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('terminal-reader.png') });
  await page.keyboard.press('Escape');
  await expect(body).not.toHaveAttribute('data-reading');
  await expect(page.locator('#reader')).toBeHidden();
  await expect(body).toHaveAttribute('data-hub', 'mess 1,1');
  await expect(page.locator('#hud')).toContainText('Terminal');
  await page.screenshot({ path: testInfo.outputPath('terminal-after.png') });
});

test('the tension drones calm to 0 over the hub, #586', async ({ page }) => {
  await page.goto('./?nodes=100');
  await page.locator('#hud').waitFor();
  await page.evaluate(async () => {
    for (let t = 1; t <= 30; t++) {
      await (window as any).__playTurns(1, [4]);
      if ((window as any).__tension().level > 0) break;
    }
  });
  expect(await page.evaluate(() => (window as any).__tension().level)).toBeGreaterThan(0);
  await ship(page);
  await expect(page.locator('body')).toHaveAttribute('data-hub', /^mess /);
  expect(await page.evaluate(() => (window as any).__tension().level)).toBe(0);
});



