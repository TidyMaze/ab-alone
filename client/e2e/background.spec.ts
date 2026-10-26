import { expect, test } from '@playwright/test';
import { relativeLuminance, type RGB } from '../src/contrast';

test.describe('Background luminance and decor (#432)', () => {
  test('the background behind the board is lifted above the baseline', async ({ page }) => {
    await page.setViewportSize({ width: 1470, height: 867 });
    await page.addInitScript(() => {
      localStorage.setItem('ab-alone.theme', 'dark');
    });
    await page.goto('./?bot=off');
    await page.locator('canvas').waitFor();
    await expect(page.locator('body')).toHaveAttribute('data-bay', 'ready'); // the room is complete (#661)

    const png = await page.screenshot();

    // Sample points: four corners + behind the board
    const points: [number, number][] = [
      [20, 20], // top-left
      [1450, 20], // top-right
      [20, 847], // bottom-left
      [1450, 847], // bottom-right
      [735, 120], // behind board (bulkhead area)
    ];

    const colors: RGB[] = await page.evaluate(async ([b64, pts]) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const g = c.getContext('2d')!;
      g.drawImage(img, 0, 0);
      return pts.map(([x, y]) => {
        const d = g.getImageData(Math.round(x), Math.round(y), 1, 1).data;
        return [d[0]!, d[1]!, d[2]!] as RGB;
      });
    }, [png.toString('base64'), points] as const);

    const lums = colors.map((c) => ({ rgb: c, lum: relativeLuminance(c) }));

    // Behind board is lifted above the 0.0017 baseline, but darker than board steel (0.082)
    const behindBoardLum = lums[4]!.lum;
    expect(behindBoardLum).toBeGreaterThan(0.003);
    expect(behindBoardLum).toBeLessThan(0.082);
  });
});
