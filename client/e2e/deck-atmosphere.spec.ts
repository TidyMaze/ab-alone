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
});
