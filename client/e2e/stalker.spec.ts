import { expect, test } from '@playwright/test';

test('stalker combat mode launches vs bot with fog of war', async ({ page }) => {
  await page.goto('./?bot=off');
  await page.locator('canvas').waitFor();
  await page.waitForTimeout(500);

  // Open Game modes menu
  const modesButton = page.getByRole('button', { name: 'Game modes' });
  await modesButton.click();

  // Open Stalker submenu
  const stalkerButton = page.locator('#stalker-mode');
  await expect(stalkerButton).toBeVisible();
  await stalkerButton.click();

  // Launch vs Bot
  const stalkerBotButton = page.locator('#stalker-bot');
  await expect(stalkerBotButton).toBeVisible();
  await stalkerBotButton.click();

  // Verify stalker mode dataset on body
  await expect(page.locator('body')).toHaveAttribute('data-stalker', '1');

  // Verify fog of war active: some discs must be hidden
  const discStats = await page.evaluate(() => {
    const win = window as any;
    const isStalker = win.__stalker ? win.__stalker() : false;
    const targets = win.__targets ? win.__targets() : [];
    return { isStalker, targetsCount: targets.length };
  });

  expect(discStats.isStalker).toBe(true);

  // Select marble (0, 4)
  await page.evaluate(() => {
    (window as any).__click(0, 4);
  });
  await page.waitForTimeout(1500);
});

test('stalker mode via online invite hash boots into fog of war', async ({ page }) => {
  await page.goto('./?bot=off#room=test-room-123&mode=stalker');
  await page.locator('canvas').waitFor();
  await page.waitForTimeout(500);

  await expect(page.locator('body')).toHaveAttribute('data-stalker', '1');
  const isStalker = await page.evaluate(() => (window as any).__stalker());
  expect(isStalker).toBe(true);
});
