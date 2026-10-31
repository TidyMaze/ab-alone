import { expect, test } from '@playwright/test';
import { relativeLuminance, type RGB } from '../src/contrast';

test.describe('Background luminance and decor (#432)', () => {
  test('the background behind the board is lifted above the baseline', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1470, height: 867 });
    await page.addInitScript(() => {
      localStorage.setItem('ab-alone.theme', 'dark');
    });
    await page.goto('./?bot=off');
    await page.locator('canvas').waitFor();
    await expect(page.locator('body')).toHaveAttribute('data-bay', 'ready'); // the room is complete (#661)
    const draws = await page.evaluate(() => (window as any).__drawNext() as number);
    await page.waitForFunction((n) => (window as any).__draws() > n, draws); // loaded geometry must also have been drawn

    const png = await page.screenshot({ path: testInfo.outputPath('background.png') });

    // Four corners and the exposed bay floor behind the board. The old (735,120) point now hits the near-black
    // gantry rail, not the background (#888). Small patches average its hex seams instead of choosing one pixel.
    const points: [number, number][] = [
      [20, 20], // top-left
      [1450, 20], // top-right
      [20, 847], // bottom-left
      [1450, 847], // bottom-right
      [735, 60], // exposed floor beyond the gantry
    ];

    const patches: RGB[][] = await page.evaluate(async ([b64, pts]) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const g = c.getContext('2d')!;
      g.drawImage(img, 0, 0);
      return pts.map(([x, y], i) => {
        const [offset, size] = i === 4 ? [8, 16] : [0, 1];
        const d = g.getImageData(x - offset!, y - offset!, size!, size!).data;
        return Array.from({ length: d.length / 4 }, (_, i) => [d[i * 4]!, d[i * 4 + 1]!, d[i * 4 + 2]!] as RGB);
      });
    }, [png.toString('base64'), points] as const);

    // Average linear luminance, not sRGB values: gamma makes luminance(mean RGB) underestimate a textured patch.
    const lums = patches.map((patch) => patch.reduce((sum, rgb) => sum + relativeLuminance(rgb), 0) / patch.length);
    console.log(JSON.stringify(lums));

    // Keep the original stronger 0.003 floor and 0.082 ceiling; do not weaken either luminance requirement.
    const behindBoardLum = lums[4]!;
    expect(behindBoardLum).toBeGreaterThan(0.003);
    expect(behindBoardLum).toBeLessThan(0.082);
  });
});
