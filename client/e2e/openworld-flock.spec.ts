import { expect, test } from '@playwright/test';
import { lowTierOnCi } from './modes';
import { shot } from './shot';

lowTierOnCi();

// #1504: the troop is 15 marbles that flock round the hero. The hero walks east; the troop stays 15 distinct cells, none on the hero,
// all within 5 cells of it, spread over rows (not the old one-file trail).
test('15 followers flock round the hero as it walks', async ({ page }) => {
  await page.goto('./?bot=off&openworld=7');
  const body = page.locator('body');
  await expect(body).toHaveAttribute('data-openworld-at', '0,0');
  const cells = async (): Promise<number[][]> => ((await body.getAttribute('data-openworld-troop')) ?? '').split(' ').map((c) => c.split(',').map(Number));
  expect(await cells()).toHaveLength(15);
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight');
  const at = ((await body.getAttribute('data-openworld-at')) ?? '').split(',').map(Number);
  const troop = await cells();
  expect(troop).toHaveLength(15);
  expect(new Set(troop.map((c) => c.join(','))).size).toBe(15);
  const far = ([q, r]: number[]): number => Math.max(Math.abs(q! - at[0]!), Math.abs(r! - at[1]!), Math.abs(q! - at[0]! + r! - at[1]!));
  expect(troop.every((c) => far(c) >= 1 && far(c) <= 5)).toBe(true);
  expect(new Set(troop.map((c) => c[1])).size).toBeGreaterThan(2);
  await shot(page, { path: 'test-results/openworld-flock.png' });
});
