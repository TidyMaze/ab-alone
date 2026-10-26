import { expect, test } from '@playwright/test';

// The deck atmospheres themselves (data-deck per mode and boss) are checked in deck.spec.ts. There is no ?deck= URL.
test('the Mess Deck bay is complete once the page has loaded (#660)', async ({ page }) => {
  await page.goto('./?bot=off');
  await expect(page.locator('body')).toHaveAttribute('data-deck', 'mess');
  await expect(page.locator('body')).toHaveAttribute('data-bay', 'ready'); // the room is complete (#661)
});

test('the clear board setting is on after a click (#665)', async ({ page }) => {
  await page.goto('./?bot=off');
  await expect(page.locator('body')).toHaveAttribute('data-clear', 'off');
  await page.locator('#settings').click();
  await page.locator('#setting-clear-board').click();
  await expect(page.locator('body')).toHaveAttribute('data-clear', 'on');
});
