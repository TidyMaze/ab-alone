import { expect, test, type Page } from '@playwright/test';

// Bug #171: the fog was invisible. Two screenshots of the same still board, Clear board on and off,
// must differ at the far rim and match at the near rim. The CSS vignette (body::after) is hidden so
// only the scene fog is measured.
const cellToScreen = (page: Page, q: number, r: number) =>
  page.evaluate(([cq, cr]) => (window as any).__cellToScreen(cq, cr) as { x: number; y: number }, [q, r]);

const settle = (page: Page) =>
  page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));

// Mean absolute RGB difference (0 to 255) of two PNGs inside a box.
const meanDiff = (page: Page, a: Buffer, b: Buffer, box: { x: number; y: number; w: number; h: number }) =>
  page.evaluate(
    async ([ra, rb, bx]) => {
      const load = async (b64: string) => {
        const img = new Image();
        img.src = `data:image/png;base64,${b64}`;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        const g = c.getContext('2d')!;
        g.drawImage(img, 0, 0);
        return g.getImageData(bx.x, bx.y, bx.w, bx.h).data;
      };
      const [pa, pb] = await Promise.all([load(ra as string), load(rb as string)]);
      let sum = 0;
      for (let i = 0; i < pa.length; i += 4) {
        sum += Math.abs(pa[i] - pb[i]) + Math.abs(pa[i + 1] - pb[i + 1]) + Math.abs(pa[i + 2] - pb[i + 2]);
      }
      return sum / (pa.length / 4) / 3;
    },
    [a.toString('base64'), b.toString('base64'), box] as const,
  );

test('the fog shows at the far rim of the board and not at the near rim, bug #171', async ({ page }, testInfo) => {
  await page.goto('./?bot=off');
  await page.locator('canvas').waitFor();
  await page.addStyleTag({ content: 'body::after { display: none !important; }' });
  await expect(page.locator('#hud')).toContainText('Black to move');
  const toggle = page.locator('#clear-board');
  await page.mouse.move(2, 2); // no hover ghost
  await settle(page);

  const shot = async (name: string) => {
    await settle(page);
    return page.screenshot({ path: testInfo.outputPath(name), type: 'png' });
  };
  await expect(page.locator('body')).toHaveAttribute('data-clear', 'off');
  const fogOn = await shot('fog-on.png');
  await toggle.click();
  await expect(page.locator('body')).toHaveAttribute('data-clear', 'on');
  const fogOff = await shot('fog-off.png');
  await toggle.click();
  await expect(page.locator('body')).toHaveAttribute('data-clear', 'off');
  const fogOnAgain = await shot('fog-on-again.png');

  const size = page.viewportSize()!;
  const far = await Promise.all([0, 1, 2, 3, 4].map((q) => cellToScreen(page, q, -4)));
  const near = await Promise.all([-4, -3, -2, -1, 0].map((q) => cellToScreen(page, q, 4)));
  const band = (cells: { x: number; y: number }[]) => {
    const x = Math.max(0, Math.floor(Math.min(...cells.map((c) => c.x)) - 20));
    const y = Math.max(0, Math.floor(Math.min(...cells.map((c) => c.y)) - 25));
    const w = Math.min(size.width - x, Math.ceil(Math.max(...cells.map((c) => c.x)) - x + 20));
    return { x, y, w, h: 50 };
  };

  expect(await meanDiff(page, fogOn, fogOnAgain, { x: 0, y: 0, w: size.width, h: size.height })).toBeLessThan(0.01); // still scene
  expect(await meanDiff(page, fogOn, fogOff, band(far))).toBeGreaterThan(4);
  expect(await meanDiff(page, fogOn, fogOff, band(near))).toBeLessThan(1);
});
