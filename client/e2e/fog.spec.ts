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

type Box = { x: number; y: number; w: number; h: number };

// The still-scene check's evidence: the mean difference inside a box, the bounding box of every pixel that changed,
// and a diff image (the changes amplified in red), attached to the report when the check fails.
const diffOf = (page: Page, a: Buffer, b: Buffer, box: Box) =>
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
        return { w: img.width, h: img.height, data: g.getImageData(0, 0, img.width, img.height).data };
      };
      const [A, B] = await Promise.all([load(ra as string), load(rb as string)]);
      const out = document.createElement('canvas');
      out.width = A.w;
      out.height = A.h;
      const og = out.getContext('2d')!;
      const od = og.createImageData(A.w, A.h);
      let sum = 0;
      let n = 0;
      let [x0, y0, x1, y1] = [Infinity, Infinity, -1, -1];
      for (let y = 0; y < A.h; y++) {
        for (let x = 0; x < A.w; x++) {
          const i = (y * A.w + x) * 4;
          const d = Math.abs(A.data[i]! - B.data[i]!) + Math.abs(A.data[i + 1]! - B.data[i + 1]!) + Math.abs(A.data[i + 2]! - B.data[i + 2]!);
          od.data[i] = Math.min(255, d * 4);
          od.data[i + 3] = 255;
          if (x >= bx.x && y >= bx.y && x < bx.x + bx.w && y < bx.y + bx.h) {
            sum += d;
            n++;
          }
          if (d > 48) {
            x0 = Math.min(x0, x);
            y0 = Math.min(y0, y);
            x1 = Math.max(x1, x);
            y1 = Math.max(y1, y);
          }
        }
      }
      og.putImageData(od, 0, 0);
      return {
        mean: sum / n / 3,
        changed: x1 < 0 ? null : { x0, y0, x1, y1 },
        png: out.toDataURL('image/png').split(',')[1]!,
      };
    },
    [a.toString('base64'), b.toString('base64'), box] as const,
  );

test('the fog shows at the far rim of the board and not at the near rim, bug #171', async ({ page }, testInfo) => {
  await page.goto('./?bot=off');
  await page.locator('canvas').waitFor();
  await page.addStyleTag({ content: 'body::after { display: none !important; }' });
  await expect(page.locator('#hud')).toContainText('Black to move');
  const cog = page.getByRole('button', { name: 'Settings' });
  const toggle = page.getByRole('button', { name: 'Clear board' });
  // The menu is closed for the shots, so it is in none of them: flip the setting through the cog.
  const flip = async () => {
    await cog.click();
    await toggle.click();
    await cog.click();
    await page.mouse.move(2, 2);
  };
  await page.mouse.move(2, 2); // no hover ghost
  await settle(page);

  const shot = async (name: string) => {
    await settle(page);
    return page.screenshot({ path: testInfo.outputPath(name), type: 'png' });
  };
  await expect(page.locator('body')).toHaveAttribute('data-clear', 'off');
  const fogOn = await shot('fog-on.png');
  await flip();
  await expect(page.locator('body')).toHaveAttribute('data-clear', 'on');
  const fogOff = await shot('fog-off.png');
  await flip();
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

  const still = await diffOf(page, fogOn, fogOnAgain, { x: 0, y: 0, w: size.width, h: size.height });
  if (still.mean >= 0.01) {
    await testInfo.attach('still-diff.png', { body: Buffer.from(still.png, 'base64'), contentType: 'image/png' });
    await testInfo.attach('fog-on.png', { body: fogOn, contentType: 'image/png' });
    await testInfo.attach('fog-on-again.png', { body: fogOnAgain, contentType: 'image/png' });
  }
  expect(still.mean, `changed pixels ${JSON.stringify(still.changed)}`).toBeLessThan(0.01); // still scene
  expect(await meanDiff(page, fogOn, fogOff, band(far))).toBeGreaterThan(4);
  expect(await meanDiff(page, fogOn, fogOff, band(near))).toBeLessThan(1);
});
