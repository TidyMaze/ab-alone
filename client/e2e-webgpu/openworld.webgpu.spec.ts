import { expect, test, type Page } from '@playwright/test';
import { openModes } from '../e2e/modes';

// #1023: the Open world on a real WebGPU adapter. The default e2e suite draws on the WebGL2 fallback, which never logged the
// "used in submit while destroyed" errors of #1015 and #1017 (#1018). This check runs the world on WebGPU, fresh page per seed,
// and fails on any console error, WebGPU warning, device uncaptured error or uncaught exception. Run it by hand:
// `bun run e2e:webgpu` (CONTRIBUTING 13). Without a GPU adapter it skips.

const DETAILED = ['prop-mountain-hi', 'prop-tree-hi', 'prop-boulder-hi', 'prop-wall-hi'];
const WARNING = /WebGPU|destroyed|Invalid/;

/** Listens to the GPU device of the page before any script runs: three's own handler reports to console.error, this one
 * keeps every uncaptured error in `window.__gpuErrors` too, whatever the console shows. */
const listenToDevice = (): void => {
  const hooks = window as unknown as { __gpuErrors: string[]; __gpuDevices: number };
  hooks.__gpuErrors = [];
  hooks.__gpuDevices = 0; // the devices listened to: zero means the listener is not attached, and the check would pass blind
  const requestDevice = GPUAdapter.prototype.requestDevice;
  GPUAdapter.prototype.requestDevice = function (this: GPUAdapter, ...args: Parameters<GPUAdapter['requestDevice']>) {
    return requestDevice.apply(this, args).then((device: GPUDevice) => {
      hooks.__gpuDevices++;
      device.addEventListener('uncapturederror', (event) => hooks.__gpuErrors.push(event.error.message));
      return device;
    });
  };
};

async function enter(page: Page): Promise<void> {
  await openModes(page);
  await page.locator('#openworld').click();
  await expect.poll(() => page.evaluate(() => document.body.dataset.openworld)).toMatch(/^\d+$/);
}

async function detailedDrawn(page: Page): Promise<number> {
  const drawn = await page.evaluate(() => JSON.parse(document.body.dataset.openworldDrawn!) as Record<string, number>);
  return DETAILED.reduce((total, key) => total + (drawn[key] ?? 0), 0);
}

/** One run on a fresh page: enter the world of `seed`, wait for the detailed models (their arrival replaces the meshes #1017
 * retires), walk fast, zoom to the widest view, turn, leave and enter again. Returns what the page reported. */
async function runWorld(page: Page, seed: string): Promise<string[]> {
  const reported: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || (message.type() === 'warning' && WARNING.test(message.text()))) reported.push(`${message.type()}: ${message.text()}`);
  });
  page.on('pageerror', (error) => reported.push(`uncaught: ${error.message}`));
  await page.addInitScript(listenToDevice);
  await page.goto(`./?bot=off&openworld=${seed}`);
  await page.locator('canvas').waitFor();
  const gpu = await page.evaluate(async () => {
    const adapter = navigator.gpu ? await navigator.gpu.requestAdapter() : null;
    return adapter ? { software: (adapter.info as { isFallbackAdapter?: boolean }).isFallbackAdapter === true } : null;
  });
  test.skip(gpu === null || gpu.software, 'no GPU adapter on this machine (headless Linux CI): the WebGPU check needs one');
  // A WebGL2 fallback would pass this check without a single WebGPU call: the canvas holds one kind of context only.
  expect(await page.evaluate(() => (document.querySelector('canvas')!.getContext('webgpu') ? 'WebGPU' : 'not WebGPU'))).toBe('WebGPU');
  await enter(page);
  await expect.poll(() => detailedDrawn(page)).toBeGreaterThan(0);
  const data = (key: 'openworldAt' | 'openworldZoom' | 'openworldYaw') => page.evaluate((k) => document.body.dataset[k], key);
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowUp'); // fast: several cells while the frames are in flight
  await expect.poll(() => data('openworldAt')).not.toBe('0,0');
  const box = (await page.locator('canvas').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 5000); // as far out as the screen allows: MAX_ZOOM is 6 on a 16:9 screen
  await expect.poll(async () => Number(await data('openworldZoom'))).toBeGreaterThan(5);
  await page.keyboard.press('q');
  await expect.poll(() => data('openworldYaw')).toBe('30');
  await page.keyboard.press('e');
  await expect.poll(() => data('openworldYaw')).toBe('0');
  await page.keyboard.press('Escape');
  await expect(page.locator('#hud')).toBeVisible();
  await enter(page);
  await page.mouse.wheel(0, -5000); // back to the closest view, then out again
  await page.mouse.wheel(0, 5000);
  await expect.poll(async () => Number(await data('openworldZoom'))).toBeGreaterThan(5);
  await page.keyboard.press('Escape');
  await expect(page.locator('#hud')).toBeVisible();
  // a frame drawn after the last change: the replaced meshes are drawn once more before the errors are read
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  const hooked = await page.evaluate(() => (window as unknown as { __gpuDevices: number }).__gpuDevices);
  expect(hooked, 'the device listener is attached before the renderer asks for its device').toBeGreaterThan(0);
  const gpuErrors = await page.evaluate(() => (window as unknown as { __gpuErrors: string[] }).__gpuErrors);
  return [...reported, ...gpuErrors.map((message) => `device: ${message}`)];
}

test('the Open world on WebGPU, seed 7: no console error or device error when walked, zoomed and left twice, #1023', async ({ page }) => {
  expect(await runWorld(page, '7')).toEqual([]);
});

test('the Open world on WebGPU, seed 1234: no console error or device error when walked, zoomed and left twice, #1023', async ({ page }) => {
  expect(await runWorld(page, '1234')).toEqual([]);
});

test('the Open world on WebGPU, a fresh random seed: no console error or device error, #1023', async ({ page }) => {
  expect(await runWorld(page, 'new')).toEqual([]);
});
