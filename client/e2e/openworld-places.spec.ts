import { expect, test, type Page } from '@playwright/test';
import { lowTierOnCi } from './modes';
import { shot } from './shot';

lowTierOnCi();

// #1514: the towns and dungeon gates of the Open world (docs/specs/openworld.md section 13), placed by the seed and drawn on the map with
// the towers. The test hook stands the hero near a gate of the public seed 7 (no walk), the map shows it with its icon.
type Hooks = { __openworldFixture: (f: object) => void; __openworldPlaces: (seed: number) => number[] };
const sizes = [
  { name: 'desktop 1280 by 720', viewport: { width: 1280, height: 720 }, touch: false },
  { name: 'upright phone 390 by 844', viewport: { width: 390, height: 844 }, touch: true },
];

for (const { name, viewport, touch } of sizes) {
  test.describe(name, () => {
    test.use({ viewport, isMobile: touch, hasTouch: touch });

    test('five towns and five dungeon gates stand in the world, the spawn town first, and the map draws them, #1514', async ({ page }: { page: Page }) => {
      await page.goto('./?bot=off&openworld=7');
      await expect(page.locator('body')).toHaveAttribute('data-openworld-at', '0,0');
      const places = await page.evaluate(() => (window as unknown as Hooks).__openworldPlaces(7));
      expect(places).toHaveLength(30); // ten `kind, q, r` triples
      const body = page.locator('body');
      const listed = (await body.getAttribute('data-openworld-places'))!.split(' ');
      expect(listed.filter((p) => p.startsWith('town:'))).toHaveLength(5);
      expect(listed.filter((p) => p.startsWith('dungeon:'))).toHaveLength(5);
      expect(listed[0]).toBe('town:0,0'); // the spawn clearing
      const [, q, r] = places.slice(3 * 5, 3 * 5 + 3) as [number, number, number]; // the first dungeon gate
      await page.evaluate(([q, r]) => (window as unknown as Hooks).__openworldFixture({ hero: [q, r + 3], troop: [], enemies: [] }), [q, r]);
      await page.keyboard.press('m');
      await expect(page.locator('#openworld-map')).toBeVisible();
      await shot(page, { path: `test-results/places-map-${name.replaceAll(' ', '-')}.png` });
    });
  });
}
