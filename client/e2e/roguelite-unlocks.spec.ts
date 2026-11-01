import { expect, test } from '@playwright/test';
import { openModes } from './modes';

// Unlocks between runs and the run summary of the rogue-lite run (#801, docs/specs/roguelite.md section 8) in the
// browser. The progress (an act won in an earlier run) is set in localStorage and the run over loaded through the test
// hook. Seed 3: the act 1 boss 9 is reached by 0, 2 and 6, and leads to the first fight 10 of act 2.
test('the rogue-lite run: the start shows the unlocks, a run over its summary, #801', async ({ page }) => {
  const map = page.locator('#run-map');
  await page.goto('./?bot=off');
  await page.waitForFunction(() => typeof (window as any).__run === 'function'); // the page is ready
  await page.evaluate(() => localStorage.setItem('ab-alone.roguelite', '1'));
  await openModes(page);
  await page.getByRole('button', { name: 'Rogue-lite run' }).click();
  await expect(map.locator('.run-help')).toHaveText('Special marbles in rewards: Heavy, Anchor · Spark after 2 acts won in a run');
  await map.getByRole('button', { name: /^Bulwark/ }).click();
  await expect(map.locator('.run-line')).toHaveText('Rogue-lite run · army 14 marbles, 2 Anchor · pick a fight');
  await expect(map.getByRole('button', { name: /^Volatile/ })).toBeDisabled();
  await page.screenshot({ path: 'test-results/roguelite-start-unlocks.png' });

  await page.evaluate(() => localStorage.removeItem('ab-alone.roguelite'));
  const over = { seed: 3, army: 3, path: [0, 2, 6, 9, 10], fighting: false, moves: [], end: 'lost', specials: [1, 0, 0], placed: [], reward: false, event: false, best: 0 };
  await page.evaluate((s) => (window as any).__run(s), over);
  await expect(page.locator('body')).toHaveAttribute('data-run', 'lost');
  await expect(map.locator('.run-help')).toHaveText([
    'Path: act 1 Fight, Elite, Elite, Boss · act 2 Fight',
    'Fights: 4 won, 1 lost',
    'Army at the end: 3 marbles, 1 Heavy',
    'Unlocked: Anchor marbles, Bulwark army',
  ]);
  await expect(map.locator('.run-tally')).toHaveText('Run voided. Audit reopened.');
  expect(await page.evaluate(() => localStorage.getItem('ab-alone.roguelite'))).toBe('1');
  await page.screenshot({ path: 'test-results/roguelite-summary.png' });
});
