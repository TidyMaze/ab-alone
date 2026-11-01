import { expect, test } from "@playwright/test";

test.describe("Background luminance and decor (#432)", () => {
  test("the background behind the board is lifted above the baseline", async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1470, height: 867 });
    await page.addInitScript(() => {
      localStorage.setItem("ab-alone.theme", "dark");
    });
    // The room is the Ship hub's: a 1v1 game plays on Table Zero, whose sky is Hollow Black by design (#1314).
    await page.goto("./");
    await page.locator("canvas").waitFor();
    await expect(page.locator("body")).toHaveAttribute("data-bay", "ready"); // the room is complete (#661)
    const draws = await page.evaluate(
      () => (window as any).__drawNext() as number,
    );
    await page.waitForFunction((n) => (window as any).__draws() > n, draws); // loaded geometry must also have been drawn

    const png = await page.screenshot({
      path: testInfo.outputPath("background.png"),
    });

    // Four 32×32 patches of the exposed bay floor left and right of the board, clear of the HUD, the gantries and the
    // lit corner. The old (735,120) point hits the near-black gantry rail (#888), and the floor under it is uneven
    // (hex seams, FXAA, local glow), so one small patch decided the result by under 1 %. The median of four wide
    // patches does not follow any single one.
    const patches: [number, number][] = [
      [60, 560], // left, mid-height
      [60, 650], // left, lower
      [1410, 560], // right, mid-height
      [1400, 650], // right, lower
    ];
    const size = 32;

    const lums: number[] = await page.evaluate(
      async ([b64, pts, size]) => {
        const img = new Image();
        img.src = `data:image/png;base64,${b64}`;
        await img.decode();
        const c = document.createElement("canvas");
        c.width = img.width;
        c.height = img.height;
        const g = c.getContext("2d")!;
        g.drawImage(img, 0, 0);
        // Average linear luminance, not sRGB values: gamma makes luminance(mean RGB) underestimate a textured patch.
        const lin = (v: number) =>
          (v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        return pts.map(([x, y]) => {
          const d = g.getImageData(x - size / 2, y - size / 2, size, size).data;
          let sum = 0;
          for (let i = 0; i < d.length; i += 4)
            sum +=
              0.2126 * lin(d[i]!) +
              0.7152 * lin(d[i + 1]!) +
              0.0722 * lin(d[i + 2]!);
          return sum / (d.length / 4);
        });
      },
      [png.toString("base64"), patches, size] as const,
    );
    console.log(JSON.stringify(lums));

    const sorted = [...lums].sort((a, b) => a - b);
    const floorLum = (sorted[1]! + sorted[2]!) / 2; // median of four

    // Lifted above the 0.0017 baseline of #432 (so not black), darker than the board steel (0.082). Measured 0.0069, every patch above 0.005.
    expect(floorLum).toBeGreaterThan(0.003);
    expect(floorLum).toBeLessThan(0.082);
  });
});
