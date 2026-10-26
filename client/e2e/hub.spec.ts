import { expect, test, type Page } from '@playwright/test';
import { openModes } from './modes';

// #521: the Ship entry of the mode menu draws the deck's hub map (docs/specs/game-design.md section 3.5) and the glass
// marble, which rolls one cell at a time by a click on a neighbour or an arrow key. body[data-hub] names its deck and
// cell. The spot is saved: after a reload, Ship lands in the same room.

async function ship(page: Page): Promise<void> {
  await openModes(page);
  await page.getByRole('button', { name: 'Ship' }).click();
}

/** A mouse click on a cell, through the page's raycast. */
async function clickCell(page: Page, q: number, r: number): Promise<void> {
  const { x, y } = await page.evaluate(([q, r]) => (window as any).__cellToScreen(q, r), [q, r]);
  await page.mouse.click(x, y);
}

test('the marble walks through 6 rooms of the Mess, and a reload lands it in the same room, #521', async ({ page }) => {
  await page.goto('./?bot=off');
  await page.locator('canvas').waitFor();
  const body = page.locator('body');
  const hud = page.locator('#hud');
  await ship(page);
  await expect(body).toHaveAttribute('data-hub', 'mess 0,0');
  await expect(hud).toContainText('Ship · Mess');

  const rooms: [number, number, string][] = [
    [2, -1, 'Terminal'],
    [2, 0, 'Boss door'],
    [1, 1, 'Terminal'],
    [-2, 1, 'Online table'],
  ];
  // One mouse click, then the same click without the raycast and the frames of a mouse click (__click), to stay fast.
  await clickCell(page, 1, 0);
  await expect(body).toHaveAttribute('data-hub', 'mess 1,0');
  const path: [number, number][] = [[2, -1], [2, 0], [1, 1], [0, 2], [-1, 2], [-2, 2], [-2, 1]];
  for (const [q, r] of path) {
    await page.evaluate(([q, r]) => (window as any).__click(q, r), [q, r]);
    await expect(body).toHaveAttribute('data-hub', `mess ${q},${r}`);
    const room = rooms.find(([rq, rr]) => rq === q && rr === r);
    if (room) await expect(hud).toContainText(room[2]);
  }
  await page.keyboard.press('ArrowUp');
  await expect(body).toHaveAttribute('data-hub', 'mess -2,0');
  await expect(hud).toContainText('Bot table');
  await page.keyboard.press('ArrowUp');
  await expect(body).toHaveAttribute('data-hub', 'mess -1,-1');
  await expect(hud).toContainText('Hot-seat table');

  await page.reload();
  await page.locator('canvas').waitFor();
  await ship(page);
  await expect(body).toHaveAttribute('data-hub', 'mess -1,-1');
  await expect(hud).toContainText('Hot-seat table');
});
