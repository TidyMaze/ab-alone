import { expect, test, type Page } from '@playwright/test';
import { openModes } from '../e2e/modes';

// #1023: the Open world on a real WebGPU adapter. The default e2e suite draws on the WebGL2 fallback, which never logged the
// "used in submit while destroyed" errors of #1015 and #1017 (#1018). This check runs the world on WebGPU and fails on any
// console error or uncaught exception. Run it by hand: `bun run e2e:webgpu` (CONTRIBUTING 13). Without a GPU it skips.

const DETAILED = ['prop-mountain-hi', 'prop-tree-hi', 'prop-boulder-hi', 'prop-wall-hi'];

async function enter(page: Page): Promise<void> {
  await openModes(page);
  await page.locator('#openworld').click();
  await expect.poll(() => page.evaluate(() => document.body.dataset.openworld)).toBe('7');
}

// One pass over the world: walk off the spawn cell, zoom to the widest view, turn the camera round the hero and back.
async function walkZoomTurn(page: Page): Promise<void> {
  const data = (key: 'openworldAt' | 'openworldZoom' | 'openworldYaw') => page.evaluate((k) => document.body.dataset[k], key);
  await page.keyboard.press('ArrowUp');
  await expect.poll(() => data('openworldAt')).not.toBe('0,0');
  const box = (await page.locator('canvas').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 5000); // as far out as the screen allows: MAX_ZOOM is 6 on a 16:9 screen
  await expect.poll(async () => Number(await data('openworldZoom'))).toBeGreaterThan(5);
  await page.keyboard.press('q');
  await expect.poll(() => data('openworldYaw')).toBe('30');
  await page.keyboard.press('e');
  await expect.poll(() => data('openworldYaw')).toBe('0');
}

test('the Open world draws on WebGPU with no console error: entered, walked, zoomed, turned and left twice, #1023', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(`uncaught: ${error.message}`));
  await page.goto('./?bot=off&openworld=7');
  await page.locator('canvas').waitFor();
  const gpu = await page.evaluate(async () => {
    const adapter = navigator.gpu ? await navigator.gpu.requestAdapter() : null;
    return adapter ? { software: (adapter.info as { isFallbackAdapter?: boolean }).isFallbackAdapter === true } : null;
  });
  test.skip(gpu === null || gpu.software, 'no GPU adapter on this machine (headless Linux CI): the WebGPU check needs one');
  // A WebGL2 fallback would pass this check without a single WebGPU call: the canvas holds one kind of context only.
  expect(await page.evaluate(() => (document.querySelector('canvas')!.getContext('webgpu') ? 'WebGPU' : 'not WebGPU'))).toBe('WebGPU');
  // The first entry waits for the detailed models: their arrival replaces the meshes that #1017 retires after a frame.
  await enter(page);
  await expect
    .poll(async () => {
      const drawn = await page.evaluate(() => JSON.parse(document.body.dataset.openworldDrawn!) as Record<string, number>);
      return DETAILED.reduce((total, key) => total + (drawn[key] ?? 0), 0);
    })
    .toBeGreaterThan(0);
  await walkZoomTurn(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('#hud')).toBeVisible();
  await enter(page);
  await walkZoomTurn(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('#hud')).toBeVisible();
  expect(errors).toEqual([]);
});
