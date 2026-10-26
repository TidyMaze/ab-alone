import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';

test('capture deck atmospheres with 3D spaceship bay lighting (#660)', async ({ page }) => {
  mkdirSync('/tmp/screenshots', { recursive: true });
  await page.setViewportSize({ width: 1280, height: 720 });

  // 1. Mess Deck (Default hauler atmosphere, warm copper)
  await page.goto('./?bot=off&deck=mess');
  await page.locator('canvas').waitFor();
  await page.waitForTimeout(600);
  await page.screenshot({ path: '/tmp/screenshots/660-deck-mess.png' });
  expect(await page.locator('canvas').isVisible()).toBe(true);

  // 2. Furnace Deck (Ember thermal glow)
  await page.goto('./?bot=off&deck=furnace');
  await page.locator('canvas').waitFor();
  await page.waitForTimeout(600);
  await page.screenshot({ path: '/tmp/screenshots/660-deck-furnace.png' });
  expect(await page.locator('canvas').isVisible()).toBe(true);

  // 3. Bridge Deck (Telemetry cyan atmosphere)
  await page.goto('./?bot=off&deck=bridge');
  await page.locator('canvas').waitFor();
  await page.waitForTimeout(600);
  await page.screenshot({ path: '/tmp/screenshots/660-deck-bridge.png' });
  expect(await page.locator('canvas').isVisible()).toBe(true);

  // 4. Smooth atmospheric fog across bay on Mess (#665)
  await page.goto('./?bot=off&deck=mess');
  await page.locator('canvas').waitFor();
  await page.waitForTimeout(600);
  await page.screenshot({ path: '/tmp/screenshots/665-smooth-fog-mess.png' });

  // 5. Clear board switches fog off completely (#665)
  await page.goto('./?bot=off&deck=mess');
  await page.locator('canvas').waitFor();
  await page.locator('#settings').click();
  await page.locator('#setting-clear-board').click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: '/tmp/screenshots/665-clear-board-fog-off.png' });
});
