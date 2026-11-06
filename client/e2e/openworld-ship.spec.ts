import { expect, test, type Page } from '@playwright/test';
import { lowTierOnCi, openControls } from './modes';

lowTierOnCi();

// #1373: from the Open world on a phone, one visible 44 px Hub button leads to the hub, the world saved as with Esc.
const viewports = [
  { name: 'upright 390 by 844', viewport: { width: 390, height: 844 } },
  { name: 'landscape 844 by 390', viewport: { width: 844, height: 390 } },
];

async function clearOf(page: Page, selector: string): Promise<boolean> {
  return page.evaluate((s) => {
    const ship = document.getElementById('openworld-ship')!.getBoundingClientRect();
    const other = document.querySelector(s)!.getBoundingClientRect();
    return !(ship.left < other.right && other.left < ship.right && ship.top < other.bottom && other.top < ship.bottom);
  }, selector);
}

for (const { name, viewport } of viewports) {
  test.describe(name, () => {
    test.use({ viewport, isMobile: true, hasTouch: true });

    test('the Hub button is a 44 px target clear of the plate, the chip and the settings, and a tap reaches it', async ({ page }) => {
      await page.goto('./?bot=off&openworld=7');
      await expect(page.locator('body')).toHaveAttribute('data-openworld', '7');
      const ship = page.locator('#openworld-ship');
      await expect(ship).toBeVisible();
      const box = (await ship.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
      expect(box.x).toBeGreaterThan(viewport.width / 2); // not in the stick's half
      await openControls(page); // the plate folds 8 s after the entry, before a slow runner gets here (#1436); the hints are behind its summary (#1530)
      expect(await clearOf(page, '#openworld-hud')).toBe(true);
      expect(await clearOf(page, '#settings')).toBe(true);
      await expect(page.locator('#openworld-hud .tap-hint')).toBeVisible();
      await expect(page.locator('#openworld-hud .keys-hint:visible')).toHaveCount(0);
      // A trial tap checks that the button is the hit target (nothing covers it) without leaving the world: the Hub it leads to
      // is unit tested (main.openworldlink.test.ts, 'leaves the world, saved as Esc does, for the Hub'); the hub boot costs 1.4 s here (#1481).
      await ship.tap({ trial: true });
    });
  });
}
