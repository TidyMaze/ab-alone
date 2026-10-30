import type { Page } from '@playwright/test';

/** Pauses the page clock (page.clock) a second ahead: from now on it moves only when stepClock runs it (#891). */
export const pauseClock = async (page: Page) => page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));

/** Jumps the paused page clock `ms` forward, in jumps of 110 to 300 ms with a draw after each. Under automation the page
 * draws at most every 100 ms (drawDue, src/quality.ts): a shorter jump gets no draw and the wait for it never ends. */
export async function stepClock(page: Page, ms: number): Promise<void> {
  for (let left = ms; left > 0; left -= 300) {
    const asked = await page.evaluate(() => (window as any).__drawNext() as number);
    await page.clock.fastForward(Math.max(110, Math.min(left, 300)));
    await page.waitForFunction((n) => (window as any).__draws() > n, asked);
  }
}
