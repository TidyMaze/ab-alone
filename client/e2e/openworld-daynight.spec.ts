import { expect, test, type Page } from '@playwright/test';
import { contrastRatio, type RGB } from '../src/contrast';
import { lowTierOnCi } from './modes';
import { shot } from './shot';

lowTierOnCi();

// #1496: the Open world goes through day, dusk and night (docs/specs/openworld.md section 11), and a lair fight entered from it is on the
// board of the phase it was entered in. The test hook `__openworldTime(ms)` sets the time of day: 0 to 6 min day, to 7.5 min dusk,
// to 10.5 min night, to 12 min dusk again. A picture of each is kept with E2E_SHOTS=1 (DAYNIGHT_SHOTS names the folder).
const MIN = 60_000;
const PHASES = [['day', 3 * MIN], ['dusk', 6.75 * MIN], ['night', 9 * MIN]] as const;
const shots = process.env.DAYNIGHT_SHOTS ?? 'test-results';

const enter = async (page: Page): Promise<void> => {
  await page.goto('./?bot=off&openworld=7');
  await page.locator('canvas:not(#openworld-minimap)').waitFor();
  await expect.poll(() => page.evaluate(() => document.body.dataset.openworld)).toBe('7');
};
const setTime = (page: Page, ms: number) => page.evaluate((t) => (window as unknown as { __openworldTime: (ms: number) => void }).__openworldTime(t), ms);
const frames = (page: Page) => page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(done)))));
/** Stands the hero next to the first lair and steps onto it: the boss fight of the lair starts. */
const intoLair = async (page: Page): Promise<void> => {
  const lairs = (await page.evaluate(() => document.body.dataset.openworldLairs))!.split(' ');
  const [q, r] = lairs[0]!.split(',').map(Number) as [number, number];
  await page.evaluate(
    ([q, r]) => (window as unknown as { __openworldFixture: (f: object) => void }).__openworldFixture({ hero: [q - 1, r], troop: [], enemies: [] }),
    [q, r],
  );
  await page.keyboard.press('ArrowRight');
};

test('the world reads day, dusk and night as the time of day is set, and starts at the start of day, #1496', async ({ page }) => {
  await enter(page);
  await expect(page.locator('body')).toHaveAttribute('data-openworld-phase', 'day');
  for (const [phase, ms] of PHASES) {
    await setTime(page, ms);
    await expect(page.locator('body')).toHaveAttribute('data-openworld-phase', phase);
    await frames(page);
    await shot(page, { path: `${shots}/world-${phase}.png` });
  }
  await setTime(page, 11 * MIN); // the dawn uses the dusk look
  await expect(page.locator('body')).toHaveAttribute('data-openworld-phase', 'dusk');
});

for (const [phase, ms] of PHASES) {
  test(`a lair entered at ${phase} starts the fight on the ${phase} board, #1496`, async ({ page }) => {
    await enter(page);
    await setTime(page, ms);
    await intoLair(page);
    await expect(page.locator('body')).toHaveAttribute('data-fight-board', phase);
    await expect(page.locator('body')).toHaveAttribute('data-boss', /.+/);
    await expect(page.locator('body')).not.toHaveAttribute('data-openworld', /.+/);
    await page.mouse.move(2, 2);
    await frames(page);
    await shot(page, { path: `${shots}/fight-${phase}.png` });
  });
}

// Each marble reads 3:1 against the cells on all three boards (art.md, the game's contrast): as the deck specs of contrast.spec.ts, the mean
// of a small box at the middle of each marble of the start position against the mean of the same box on the empty cells in the middle.
// The Echo's start: white marbles on the near rows, black on the far ones. A report as the other contrast checks: `bun run e2e:contrast`.
const NEAR: [number, number][] = [[-4, 4], [-2, 4], [0, 4], [-1, 3], [0, 2]];
const FAR: [number, number][] = [[4, -4], [2, -4], [0, -4], [1, -3], [0, -2]];
const CELLS: [number, number][] = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [-2, 0], [2, 0]];
const boxMeans = (page: Page, png: Buffer, cells: [number, number][]) =>
  page.evaluate(
    async ([b64, list]) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const g = c.getContext('2d')!;
      g.drawImage(img, 0, 0);
      const toScreen = (window as any).__cellToScreen;
      const half = Math.max(2, Math.round((toScreen(1, 0).x - toScreen(0, 0).x) * 0.08));
      return list.map(([q, r]) => {
        const p = toScreen(q, r);
        const d = g.getImageData(Math.round(p.x) - half, Math.round(p.y) - half, 2 * half, 2 * half).data;
        const sum = [0, 0, 0];
        for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) sum[k]! += d[i + k]!;
        return sum.map((s) => s / (d.length / 4)) as unknown as RGB;
      });
    },
    [png.toString('base64'), cells] as const,
  );
for (const [phase, ms] of PHASES) {
  test(`the marbles read 3:1 against the cells on the ${phase} board, #1496`, { tag: '@contrast' }, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.addInitScript(() => localStorage.setItem('ab-alone.tier', 'high'));
    await enter(page);
    await setTime(page, ms);
    await intoLair(page);
    await expect(page.locator('body')).toHaveAttribute('data-fight-board', phase);
    await page.mouse.move(2, 2); // no hover ghost
    await page.waitForTimeout(2500); // the terrace and its marbles are drawn
    const png = await page.screenshot();
    const deck = await boxMeans(page, png, CELLS);
    const mean = [0, 1, 2].map((k) => deck.reduce((s, c) => s + c[k]!, 0) / deck.length) as unknown as RGB;
    for (const [side, cells] of [['white', NEAR], ['black', FAR]] as const) {
      const ratios = (await boxMeans(page, png, cells)).map((rgb) => contrastRatio(rgb, mean));
      const line = `${phase} ${side}: ratios ${ratios.map((ratio) => ratio.toFixed(2)).join(' ')}`;
      console.log(line);
      expect(ratios.filter((ratio) => ratio < 3), line).toEqual([]);
    }
  });
}
