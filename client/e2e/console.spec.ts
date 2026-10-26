import { expect, test } from '@playwright/test';

// #511: the room's console screen shows its deck's lore entry (src/lore.ts), paged for the UI scale (src/terminal.ts),
// once the web fonts are in. body[data-console] names the entry and the page shown.

test('the deck console shows the entry of the deck in play, #511', async ({ page }) => {
  await page.goto('./?bot=off');
  await page.locator('canvas').waitFor();
  const body = page.locator('body');
  await expect(body).toHaveAttribute('data-console', /^mess-house-rule 1\/\d$/);
  await page.evaluate(() => (window as unknown as { __deck: (deck: string) => void }).__deck('chapel'));
  await expect(body).toHaveAttribute('data-console', /^chapel-door 1\/\d$/);
});
