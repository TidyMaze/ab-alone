import { expect, test, type Page } from '@playwright/test';

// #1411: the map of the Open world, full screen on the cells discovered round the hero, opened and closed by the Map button, M and
// Escape, panned by a drag and zoomed by the wheel; the discovered cells are saved with the world.
const sizes = [
  { name: 'desktop 1280 by 720', viewport: { width: 1280, height: 720 }, touch: false },
  { name: 'upright phone 390 by 844', viewport: { width: 390, height: 844 }, touch: true },
  { name: 'landscape phone 844 by 390', viewport: { width: 844, height: 390 }, touch: true },
];

const pixels = (page: Page): Promise<string> => page.evaluate(() => document.querySelector<HTMLCanvasElement>('#openworld-map canvas')!.toDataURL());
const open = async (page: Page): Promise<void> => {
  await page.goto('./?bot=off&openworld=7');
  await expect(page.locator('body')).toHaveAttribute('data-openworld', '7');
};

for (const { name, viewport, touch } of sizes) {
  test.describe(name, () => {
    test.use({ viewport, isMobile: touch, hasTouch: touch });

    test('the Map button sits under the minimap, over no button, and opens the map over the whole screen', async ({ page }) => {
      await open(page);
      const button = page.locator('#openworld-map-button');
      await expect(button).toBeVisible();
      const box = (await button.boundingBox())!;
      const minimap = (await page.locator('#openworld-minimap').boundingBox())!;
      expect(box.y).toBeGreaterThanOrEqual(minimap.y + minimap.height);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
      for (const selector of ['#openworld-ship', '#openworld-hud', '#openworld-chip', '#settings']) {
        const other = await page.locator(selector).boundingBox();
        if (!other) continue; // not shown here
        const apart = box.x + box.width <= other.x || other.x + other.width <= box.x || box.y + box.height <= other.y || other.y + other.height <= box.y;
        expect(apart, selector).toBe(true);
      }
      await button.click();
      const map = page.locator('#openworld-map');
      await expect(map).toBeVisible();
      expect(await map.boundingBox()).toEqual({ x: 0, y: 0, width: viewport.width, height: viewport.height });
      await expect(button).toBeVisible(); // over the map: it closes it
      await page.screenshot({ path: `test-results/map-${name.replaceAll(' ', '-')}.png` });
      await button.click();
      await expect(map).toBeHidden();
    });
  });
}

test('M opens the map, a drag pans it, the wheel zooms it, Escape closes it and the world stays', async ({ page }) => {
  await open(page);
  await page.keyboard.press('m');
  await expect(page.locator('#openworld-map')).toBeVisible();
  const first = await pixels(page);
  await page.mouse.move(640, 360);
  await page.mouse.down();
  await page.mouse.move(800, 400, { steps: 4 });
  await page.mouse.up();
  await expect.poll(() => pixels(page)).not.toBe(first);
  const panned = await pixels(page);
  await page.mouse.wheel(0, 400);
  await expect.poll(() => pixels(page)).not.toBe(panned);
  await page.keyboard.press('ArrowRight'); // the hero stays while the map is open
  await expect(page.locator('body')).toHaveAttribute('data-openworld-at', '0,0');
  await page.keyboard.press('Escape');
  await expect(page.locator('#openworld-map')).toBeHidden();
  await expect(page.locator('body')).toHaveAttribute('data-openworld', '7');
});

test('the cells discovered are saved with the world and come back on a reload', async ({ page }) => {
  await open(page);
  await page.evaluate(() => (window as unknown as { __openworldFixture: (f: object) => void }).__openworldFixture({ hero: [30, 0], troop: [], enemies: [] }));
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('body')).not.toHaveAttribute('data-openworld-at', '30,0');
  await expect(page.locator('body')).toHaveAttribute('data-openworld-saved', /\d/);
  const discovered = Number(await page.locator('body').getAttribute('data-openworld-discovered'));
  expect(discovered).toBeGreaterThan(2 * 331); // the spawn's disc and the one round (30, 0), and the step
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-openworld', '7');
  await expect(page.locator('body')).toHaveAttribute('data-openworld-discovered', String(discovered));
});
