import { expect, test } from '@playwright/test';

// Daily challenge (#195): the UTC date gives the boss and the seed, the same for every load of the
// day, and each start counts one attempt of the day in localStorage. The clock is fixed by page.clock.
test('the daily challenge keeps its boss and seed all day, counts attempts, and changes at 00:00 UTC, #195', async ({
  page,
}, testInfo) => {
  test.slow(); // boss searches in the worker
  const hud = page.locator('#hud');
  const daily = page.locator('#daily');
  const fight = () => page.evaluate(() => (window as any).__fight());
  const history = () => page.evaluate(() => (window as any).__history()) as Promise<number[][]>;
  const load = async (time: string) => {
    await page.clock.setFixedTime(new Date(time));
    await page.goto('./');
    await expect(daily).toBeEnabled();
  };
  const click = async (q: number, r: number) => {
    const p = await page.evaluate(([cq, cr]) => (window as any).__cellToScreen(cq, cr), [q, r]);
    await page.mouse.click(p.x, p.y);
  };
  // The first forward one-marble move (NW or NE), then the boss reply.
  const advance = async () => {
    const mv = await page.evaluate(() =>
      (window as any).__legal().find((m: any) => m.cells.length === 1 && (m.dir === 4 || m.dir === 2)),
    );
    const [q, r] = mv.cells[0];
    await click(q, r);
    await click(mv.dir === 4 ? q : q + 1, r - 1);
    await expect.poll(async () => (await history()).length, { timeout: 30_000 }).toBe(2);
  };

  await load('2026-10-25T08:00:00Z');
  await expect(daily).toHaveText(/^Daily challenge 2026-10-25: The /);
  const title = (await daily.textContent())!;
  const name = title.split(': ')[1]!;
  await daily.click();
  await expect(hud).toContainText(name);
  await expect(hud).toContainText('Daily challenge 2026-10-25 · attempt 1');
  const first = await fight();
  expect(first.daily).toEqual({ day: '2026-10-25', attempt: 1 });
  await advance();
  const played = await history();
  await page.screenshot({ path: testInfo.outputPath('daily-attempt-1.png') });

  // Retry counts one more attempt, and the same seed gives the same boss reply to the same move.
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(hud).toContainText('Daily challenge 2026-10-25 · attempt 2');
  expect(await fight()).toEqual({ ...first, daily: { day: '2026-10-25', attempt: 2 } });
  await advance();
  expect(await history()).toEqual(played);

  // A second load the same day, a second before midnight: the same boss and seed, attempt 3.
  await load('2026-10-25T23:59:59Z');
  await expect(daily).toHaveText(title);
  await daily.click();
  await expect(hud).toContainText('Daily challenge 2026-10-25 · attempt 3');
  expect(await fight()).toEqual({ ...first, daily: { day: '2026-10-25', attempt: 3 } });

  // 00:00 UTC: a new day and a new seed (the boss may be the same), the counter starts again.
  await load('2026-10-26T00:00:00Z');
  await expect(daily).toHaveText(/^Daily challenge 2026-10-26: The /);
  await daily.click();
  await expect(hud).toContainText('Daily challenge 2026-10-26 · attempt 1');
  const next = await fight();
  expect(next.seed).not.toBe(first.seed);
  expect(next.daily).toEqual({ day: '2026-10-26', attempt: 1 });
  await page.screenshot({ path: testInfo.outputPath('daily-next-day.png') });
});

test('a plain boss fight shows no daily line and does not count a daily attempt, #195', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-25T08:00:00Z'));
  await page.goto('./');
  await page.getByRole('button', { name: 'Boss fight' }).click();
  await page.locator('#boss-list').getByRole('button', { name: 'The Echo' }).click();
  await expect(page.locator('#hud')).toContainText('The Echo');
  await expect(page.locator('#hud')).not.toContainText('Daily challenge');
  await page.getByRole('button', { name: 'Retry' }).click();
  await page.locator('#daily').click();
  await expect(page.locator('#hud')).toContainText('Daily challenge 2026-10-25 · attempt 1');
});
