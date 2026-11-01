import { expect, test, type Page } from '@playwright/test';

// #1412: the teleporters of the Open world. The test hook stands the hero on a far teleporter (no walk) so it is discovered, then
// back on the spawn's; the Teleport action opens the map in the choice of a teleporter, and the pick moves the hero and the troop.
type Hooks = { __openworldFixture: (f: object) => void; __openworldTeleporters: (seed: number) => number[] };
const sizes = [
  { name: 'desktop 1280 by 720', viewport: { width: 1280, height: 720 }, touch: false },
  { name: 'upright phone 390 by 844', viewport: { width: 390, height: 844 }, touch: true },
];

const open = async (page: Page): Promise<void> => {
  await page.goto('./?bot=off&openworld=7');
  await expect(page.locator('body')).toHaveAttribute('data-openworld-at', '0,0');
};
const stand = (page: Page, hero: number[]): Promise<void> =>
  page.evaluate((hero) => (window as unknown as Hooks).__openworldFixture({ hero, troop: [], enemies: [] }), hero);
/** The second teleporter of seed 7: the hero goes there, so it is discovered, and back onto the spawn's. */
const discoverOne = async (page: Page): Promise<string> => {
  const all = await page.evaluate(() => (window as unknown as Hooks).__openworldTeleporters(7));
  const far = [all[2]!, all[3]!];
  await stand(page, far);
  await stand(page, [2, -1]);
  await expect(page.locator('body')).toHaveAttribute('data-openworld-teleporters', `2,-1 ${far.join(',')}`);
  return far.join(',');
};

/** The teleporter of seed 7 nearest the spawn's. */
const nearest = async (page: Page): Promise<number[]> => {
  const all = await page.evaluate(() => (window as unknown as Hooks).__openworldTeleporters(7));
  const cells = Array.from({ length: all.length / 2 }, (_, i) => [all[2 * i]!, all[2 * i + 1]!]);
  const away = ([q, r]: number[]): number => (Math.abs(q! - 2) + Math.abs(r! + 1) + Math.abs(q! - 2 + r! + 1)) / 2;
  return cells.slice(1).sort((a, b) => away(a) - away(b))[0]!;
};

for (const { name, viewport, touch } of sizes) {
  test.describe(name, () => {
    test.use({ viewport, isMobile: touch, hasTouch: touch });

    test('the Teleport button shows on the teleporter, under the Map button, and opens the map in the choice of a teleporter', async ({ page }) => {
      await open(page);
      const button = page.locator('#openworld-teleport');
      await expect(button).toBeHidden();
      await stand(page, [1, -1]); // next to the spawn's teleporter: it is in view
      await page.screenshot({ path: `test-results/teleporter-${name.replaceAll(' ', '-')}.png` });
      await stand(page, [2, -1]);
      await expect(button).toBeVisible();
      await page.screenshot({ path: `test-results/teleport-button-${name.replaceAll(' ', '-')}.png` });
      const box = (await button.boundingBox())!;
      const map = (await page.locator('#openworld-map-button').boundingBox())!;
      expect(box.y).toBeGreaterThanOrEqual(map.y + map.height);
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
      for (const selector of ['#openworld-ship', '#openworld-hud', '#openworld-chip', '#settings', '#openworld-minimap']) {
        const other = await page.locator(selector).boundingBox();
        if (!other) continue; // not shown here
        const apart = box.x + box.width <= other.x || other.x + other.width <= box.x || box.y + box.height <= other.y || other.y + other.height <= box.y;
        expect(apart, selector).toBe(true);
      }
      await stand(page, await nearest(page)); // the nearest teleporter is discovered, for the picture of the choice
      await stand(page, [2, -1]);
      await button.click();
      await expect(page.locator('#openworld-map-note')).toHaveText('Choose a teleporter');
      for (let i = 0; i < 4; i++) await page.locator('#openworld-map').dispatchEvent('wheel', { deltaY: 400 }); // out, both in view
      await page.locator('#openworld-map canvas').evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished))); // the canvas fades in
      await page.screenshot({ path: `test-results/teleport-choice-${name.replaceAll(' ', '-')}.png` });
    });
  });
}

test('T on a teleporter opens the choice, Enter picks the ringed one: the hero and the troop move there, and it is saved', async ({ page }) => {
  await open(page);
  const far = await discoverOne(page);
  await page.keyboard.press('t');
  await expect(page.locator('#openworld-map-note')).toHaveText('Choose a teleporter');
  await page.keyboard.press('Enter');
  await expect(page.locator('#openworld-map')).toBeHidden();
  await expect(page.locator('body')).toHaveAttribute('data-openworld-at', far);
  await expect(page.locator('body')).toHaveAttribute('data-openworld-saved', /\d/);
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-openworld-at', far);
  await expect(page.locator('body')).toHaveAttribute('data-openworld-teleporters', `2,-1 ${far}`);
});

test('a click on the map picks the teleporter under it, the hero\'s own is refused', async ({ page }) => {
  await open(page);
  const near = await nearest(page);
  await stand(page, near);
  await stand(page, [2, -1]);
  await page.locator('#openworld-teleport').click();
  await expect(page.locator('#openworld-map')).toBeVisible();
  await page.mouse.click(640, 360); // the hero's own: refused, said in the caption
  await expect(page.locator('#openworld-map-note')).toHaveText('the hero stands on that teleporter');
  await page.mouse.move(640, 360);
  for (let i = 0; i < 12; i++) await page.mouse.wheel(0, 400); // out to 3 px a cell
  // Where the map draws `near`: the ground layout turned by the camera's yaw (`screenOffset` of openworldminimap.ts), 3 px a cell.
  const yaw = (Number(await page.locator('body').getAttribute('data-openworld-yaw')) * Math.PI) / 180;
  const [dq, dr] = [near[0]! - 2, near[1]! + 1];
  const [dx, dz] = [dq + dr / 2, (Math.sqrt(3) / 2) * dr];
  await page.mouse.click(640 + 3 * (dx * Math.cos(yaw) - dz * Math.sin(yaw)), 360 + 3 * (dx * Math.sin(yaw) + dz * Math.cos(yaw)));
  await expect(page.locator('#openworld-map')).toBeHidden();
  await expect(page.locator('body')).toHaveAttribute('data-openworld-at', near.join(','));
});
