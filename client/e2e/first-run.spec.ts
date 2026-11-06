import { expect, test, type Page } from '@playwright/test';

// The first run (#1521, #1523): a fresh profile gets a three-line cold open, a scripted fight ended by its first ejection, then the
// Hub with The Echo as the next goal, with no menu opened and none of the guide's five pages. `?firstrun` makes the automated browser
// a player's first launch (the other specs boot without it, so no first run covers them).

/** A click on a cell without the raycast and the frames of a mouse click, to stay fast. */
async function hookClick(page: Page, q: number, r: number): Promise<void> {
  await page.evaluate(([q, r]) => (window as any).__click(q, r), [q, r]);
}

const fits = async (page: Page, selector: string): Promise<void> => {
  const box = (await page.locator(selector).boundingBox())!;
  const { width, height } = page.viewportSize()!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(width);
  expect(box.y + box.height).toBeLessThanOrEqual(height);
};

async function firstRun(page: Page): Promise<void> {
  const started = Date.now();
  await page.goto('./?firstrun');
  await expect(page.getByRole('dialog', { name: 'Mess, deck 1' })).toBeVisible();
  await expect(page.locator('#coldopen-text p')).toHaveCount(3);
  await expect(page.locator('#guide')).toBeHidden();
  await fits(page, '#coldopen .card');
  await page.getByRole('button', { name: 'Begin', exact: true }).click();
  await expect(page.locator('body')).toHaveAttribute('data-firstrun', 'fight');
  await expect(page.locator('#coach-step')).toBeVisible();
  await expect(page.locator('#hud .tally-note')).toBeVisible();
  await fits(page, '#coach');
  expect(await page.evaluate(() => (window as any).__hint())).not.toBeNull(); // the push is shown
  await expect(page.locator('#hud')).toContainText('Mess: one seat filled. The other is counted.');
  for (const [q, r] of [[-2, -1], [-2, 0], [-2, 1], [-2, -2]]) await hookClick(page, q, r);
  await expect(page.locator('body')).toHaveAttribute('data-firstrun', 'done');
  await expect(page.locator('#hud')).toContainText('White ejected 1/6');
  await expect(page.locator('#mode-menu')).toBeHidden(); // no menu was opened on the way
  await expect(page.locator('#settings-menu')).toBeHidden();
  await fits(page, '#coach');
  await page.locator('#coach-hub').click();
  await expect(page.locator('body')).toHaveAttribute('data-hub', 'mess 0,0');
  await expect(page.locator('#hub-rail li[data-goal]')).toHaveAttribute('data-deck', 'mess');
  await expect(page.locator('#hub-labels .hub-label[data-goal]')).toHaveAttribute('data-kind', 'boss');
  expect(Date.now() - started).toBeLessThan(60_000); // #1521: within 60 s
}

test('a fresh profile reaches its first ejection with no menu opened, then the Hub shows The Echo as the goal', async ({ page }) => {
  await firstRun(page);
  await expect(page.locator('#hub-rail li[data-goal]')).toContainText('Seat: The Echo waits');
  await expect(page.locator('#guide')).toBeHidden();
  await page.reload(); // it plays once: the next launch has no cold open, and no scripted game saved
  await expect(page.locator('#settings')).toBeEnabled();
  await expect(page.locator('#coldopen')).toBeHidden();
  await expect(page.locator('body')).not.toHaveAttribute('data-firstrun', /.+/);
  expect(await page.evaluate(() => (window as any).__plies())).toBe(0);
});

test('the first run can be skipped from the cold open, to the Hub, and plays once', async ({ page }) => {
  await page.goto('./?firstrun');
  await page.getByRole('button', { name: 'Skip', exact: true }).click();
  await expect(page.locator('body')).toHaveAttribute('data-hub', 'mess 0,0');
  await page.goto('./?firstrun');
  await expect(page.locator('#coldopen')).toBeHidden();
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('every card of the first run fits the screen', async ({ page }) => {
    await firstRun(page);
  });
});
