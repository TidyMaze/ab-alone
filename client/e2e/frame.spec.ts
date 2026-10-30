import { expect, test, type Page } from '@playwright/test';
import { contrastRatio, type RGB } from '../src/contrast';
import { FRAME } from '../src/frame';
import { BLACK_WINS } from './end-games';
import { openModes } from './modes';

// The 61 cells sit on a hexagonal steel frame (#292, world.md section 6): a plate under them, a rim around them.
const frame = (page: Page) => page.evaluate(() => (window as any).__frame());
const rings = (page: Page) => page.evaluate(() => (window as any).__rings());
const freshDraw = async (page: Page) => {
  const n = await page.evaluate(() => (window as any).__drawNext() as number);
  await page.waitForFunction((before) => (window as any).__draws() > before, n);
};
// __cellToScreen is linear in q and r: fractional coordinates give any point of the board plane.
const clickAt = async (page: Page, q: number, r: number) => {
  const p = await page.evaluate(([cq, cr]) => (window as any).__cellToScreen(cq, cr), [q, r]);
  await page.mouse.click(p.x, p.y);
};

test('the cells sit on a steel frame that never takes a click meant for a cell, #292', async ({ page }) => {
  await page.goto('./?bot=off');
  await page.locator('canvas').waitFor();
  await expect(page.locator('#hud')).toContainText('Black to move');
  expect(await frame(page)).toMatchObject({ radius: 4, holes: 0, drawn: true });
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));

  // On the rim, straight below the Black marble on (0, 4): 0.68 past its centre, past its disc.
  const d = 0.68 / (Math.sqrt(3) / 2);
  await clickAt(page, -d / 2, 4 + d);
  expect(await rings(page)).toEqual([]);
  await clickAt(page, 0, 4);
  expect(await rings(page)).toEqual([[0, 4]]);
});

test('clear board and the low tier keep the frame, #292', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('ab-alone.tier', 'low');
    localStorage.setItem('ab-alone.clear-board', 'on');
  });
  await page.goto('./?bot=off');
  await page.locator('canvas').waitFor();
  await expect(page.locator('body')).toHaveAttribute('data-tier', 'low');
  await expect(page.locator('body')).toHaveAttribute('data-clear', 'on');
  expect(await frame(page)).toMatchObject({ radius: 4, holes: 0, drawn: true });
  await expect(page.locator('body')).toHaveAttribute('data-rim', 'near'); // the turn is game information (#300)
});

const SODIUM = 0xd9822b;
const CYAN = 0x7fd6e8;
// The middle of the rim's top on its left side at each end, clear of any marble: the side facing 150 degrees for the
// near half (+z, side 1's end), 210 degrees for the far half (-z, side 2's), on the screen.
const rimPoint = (page: Page, end: 'near' | 'far') => {
  const d = 4 * (Math.sqrt(3) / 2) + FRAME.margin + FRAME.rim / 2;
  const a = ((end === 'near' ? 150 : 210) * Math.PI) / 180;
  const r = (d * Math.sin(a)) / (Math.sqrt(3) / 2);
  return page.evaluate(([q, rr]) => (window as any).__cellToScreen(q, rr) as { x: number; y: number }, [d * Math.cos(a) - r / 2, r]);
};
const pixel = (page: Page, png: Buffer, p: { x: number; y: number }) =>
  page.evaluate(
    async ([b64, x, y]) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = document.createElement('canvas');
      [c.width, c.height] = [img.width, img.height];
      const g = c.getContext('2d')!;
      g.drawImage(img, 0, 0);
      const [r, gr, b] = g.getImageData(Math.round(x as number), Math.round(y as number), 1, 1).data;
      return [r, gr, b] as RGB;
    },
    [png.toString('base64'), p.x, p.y] as const,
  );

test('the rim half at the end of the side to move lights in its colour, then goes out at the end, #300', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('./?bot=off'); // hot-seat: Black, side 1, wears the shell and starts at the near end
  await page.locator('canvas').waitFor();
  await page.mouse.move(2, 2); // no hover ghost
  await expect(page.locator('#hud')).toContainText('Black to move'); // the flat copy stays
  await expect(page.locator('body')).toHaveAttribute('data-rim', 'near');
  expect((await frame(page)).lit).toEqual({ near: SODIUM, far: 0 });
  await expect(page.locator('body')).toHaveAttribute('data-bay', 'ready'); // the room is complete: the bay loads after the page (#661)
  await freshDraw(page);
  const blackTurn = await page.screenshot({ type: 'png' });

  await clickAt(page, 0, 2);
  await clickAt(page, 0, 1);
  await expect(page.locator('#hud')).toContainText('White to move');
  await expect(page.locator('body')).toHaveAttribute('data-rim', 'far');
  expect((await frame(page)).lit).toEqual({ near: 0, far: CYAN });

  // By place, not colour alone (world.md section 8): each half is 3:1 brighter lit than dark.
  const [near, far] = [await rimPoint(page, 'near'), await rimPoint(page, 'far')];
  await freshDraw(page);
  const whiteTurn = await page.screenshot({ type: 'png' });
  expect(Math.min(
    contrastRatio(await pixel(page, blackTurn, near), await pixel(page, whiteTurn, near)),
    contrastRatio(await pixel(page, whiteTurn, far), await pixel(page, blackTurn, far)),
  )).toBeGreaterThanOrEqual(3);

  await page.locator('#import-file').setInputFiles({
    name: 'game.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ version: 1, mode: 'local', layout: 'standard', bot: false, moves: BLACK_WINS })),
  });
  await expect(page.locator('body')).toHaveAttribute('data-over', /.+/);
  await expect(page.locator('body')).toHaveAttribute('data-rim', 'off');
  expect((await frame(page)).lit).toEqual({ near: 0, far: 0 });
});

test('against the bot the human glass moves first: the near half lights cyan, #300', async ({ page }) => {
  await page.goto('./?bot=on');
  await page.locator('canvas').waitFor();
  await expect(page.locator('#hud')).toContainText('White to move');
  await expect(page.locator('body')).toHaveAttribute('data-rim', 'near');
  expect((await frame(page)).lit).toEqual({ near: CYAN, far: 0 });
});
