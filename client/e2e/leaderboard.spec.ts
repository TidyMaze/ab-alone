import { expect, test } from '@playwright/test';

// Issue #1287: the Leaderboard entry of the mode menu shows the player among the opponents of settled 1v1 matches.
test('the leaderboard shows my position among the opponents I met, my row highlighted', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('ab-alone.ranked', JSON.stringify({ version: 1, rating1v1: 1250, ratingRoyale: 1200, matches: [] }));
    localStorage.setItem(
      'ab-alone.ranked.rivals',
      JSON.stringify({
        version: 1,
        rivals: [
          { pub: 'a1b2c3d4', rating: 1710, timestamp: 1 },
          { pub: 'e5f6a7b8', rating: 1420, timestamp: 2 },
          { pub: 'c9d0e1f2', rating: 1010, timestamp: 3 },
        ],
      }),
    );
  });
  await page.goto('./?bot=off');
  await page.getByRole('button', { name: 'Game modes' }).click();
  await page.getByRole('button', { name: 'Leaderboard' }).click();
  const board = page.getByRole('dialog', { name: 'Ranked 1v1' });
  await expect(board).toBeVisible();
  await expect(board).toContainText('Your position: 3 of 4');
  await expect(board.locator('tr[data-me]')).toContainText('You');
  await page.keyboard.press('Escape');
  await expect(board).toBeHidden();
});
