import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { parseRecorded } from '../src/test/chaplain-game';
import { openModes } from './modes';

// The boss health bar (#788): at the top centre of a boss fight, the name over one red fragment per ejection needed, one
// emptying per ejection, covering no cell, no plate and no button.

const fight = async (page: Page, boss: string, seed = 0) => {
  await page.addInitScript((s) => {
    crypto.getRandomValues = ((a: Uint32Array) => a.fill(s)) as typeof crypto.getRandomValues; // the fight seed
  }, seed);
  await page.goto('./?nodes=200');
  await page.locator('canvas').waitFor();
  await openModes(page);
  await page.getByRole('button', { name: 'Boss fight' }).click();
  await page.locator('#boss-list').getByRole('button', { name: boss }).click();
  await expect(page.locator('#boss-bar .name')).toHaveText(boss);
};

// What the bar covers: the cells (disc as in phone-layout.spec.ts), the HUD plate and every visible button.
const covered = (page: Page) =>
  page.evaluate(() => {
    type Box = { left: number; top: number; right: number; bottom: number };
    const meets = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    const bar = document.getElementById('boss-bar')!.getBoundingClientRect();
    const found: string[] = [];
    const toScreen = (q: number, r: number) => (window as any).__cellToScreen(q, r) as { x: number; y: number };
    for (let r = -4; r <= 4; r++) {
      for (let q = Math.max(-4, -4 - r); q <= Math.min(4, 4 - r); q++) {
        const p = toScreen(q, r);
        const e = toScreen(q + 1, r);
        const radius = 0.46 * Math.hypot(e.x - p.x, e.y - p.y);
        if (meets(bar, { left: p.x - radius, top: p.y - radius, right: p.x + radius, bottom: p.y + radius })) found.push(`cell ${q},${r}`);
      }
    }
    if (meets(bar, document.getElementById('hud')!.getBoundingClientRect())) found.push('the HUD');
    for (const el of document.querySelectorAll('button')) {
      if (el.getClientRects().length > 0 && meets(bar, el.getBoundingClientRect())) found.push(el.textContent || el.getAttribute('aria-label')!);
    }
    return found;
  });

const sizes = [
  { name: 'a desktop window', viewport: { width: 1280, height: 720 }, mobile: false },
  { name: 'a window 1024 by 600', viewport: { width: 1024, height: 600 }, mobile: false },
  { name: 'a phone held upright', viewport: { width: 375, height: 812 }, mobile: true },
  { name: 'a phone 360 px wide held upright', viewport: { width: 360, height: 640 }, mobile: true },
  { name: 'a phone held sideways', viewport: { width: 812, height: 375 }, mobile: true },
];
for (const { name, viewport, mobile } of sizes) {
  test.describe(name, () => {
    test.use({ viewport, isMobile: mobile, hasTouch: mobile });
    test('the bar shows 6 fragments and covers nothing, #788', async ({ page }, testInfo) => {
      await fight(page, 'The Hull');
      await expect(page.locator('#boss-bar .frag')).toHaveCount(6);
      expect(await covered(page)).toEqual([]);
      await page.screenshot({ path: testInfo.outputPath('boss-bar.png') });
    });
  });
}

test.describe('a 200 % UI scale', () => {
  test.use({ viewport: { width: 1280, height: 720 } });
  test('the bar covers no cell at the largest scale, #788', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('ab-alone.ui-scale', '200'));
    await fight(page, 'The Hull');
    const cells = (await covered(page)).filter((c) => c.startsWith('cell'));
    expect(cells).toEqual([]);
  });
});

test('The Ballast Mind needs 12 ejections, 12 fragments, #788', async ({ page }) => {
  await fight(page, 'The Ballast Mind');
  await expect(page.locator('#boss-bar .frag')).toHaveCount(12);
});

// The recorded Hull win (crates/abalone-core/tests/fixtures/hull.txt): every fragment is empty once it is won.
test('the fragments empty as the player ejects, all gone at the win, #788', async ({ page }) => {
  await fight(page, 'The Hull');
  const records = parseRecorded(readFileSync(new URL('../../crates/abalone-core/tests/fixtures/hull.txt', import.meta.url), 'utf8'));
  const empty = page.locator('#boss-bar .frag.empty');
  await expect(empty).toHaveCount(0);
  await page.evaluate((r) => (window as any).__playMoves(r), records.slice(0, 70));
  const half = await empty.count();
  expect(half).toBeGreaterThan(0);
  await page.evaluate((r) => (window as any).__playMoves(r), records.slice(70));
  await expect(empty).toHaveCount(6);
});
