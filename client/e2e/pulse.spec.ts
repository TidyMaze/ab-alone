import { expect, test } from '@playwright/test';

// Task #509: the enemy shell's faint heat pulse is on only on the high tier with safe mode and reduced motion off.
// body[data-pulse] says whether it is on, window.__shellPulse() reads its glow.
const ON = { 'ab-alone.tier': 'high', 'ab-alone.safe-mode': 'off' };
const CASES: [string, Record<string, string>, 'on' | 'off'][] = [
  ['on, on the high tier with safe mode off', ON, 'on'],
  ['off under safe mode, its default', { 'ab-alone.tier': 'high' }, 'off'],
  ['off on the low tier', { ...ON, 'ab-alone.tier': 'low' }, 'off'],
  ['off under reduced motion', { ...ON, 'ab-alone.reduced-motion': 'on' }, 'off'],
];

for (const [name, stored, state] of CASES) {
  test(`the shell's heat pulse is ${name}, task #509`, async ({ page }) => {
    await page.addInitScript((s) => Object.entries(s).forEach(([k, v]) => localStorage.setItem(k, v)), stored);
    await page.goto('./?bot=off');
    await page.locator('canvas').waitFor();
    await expect(page.locator('body')).toHaveAttribute('data-pulse', state);
    const glow = () => page.evaluate(() => (window as any).__shellPulse() as number);
    if (state === 'on') await expect.poll(glow).toBeGreaterThan(0);
    else expect(await glow()).toBe(0);
  });
}
