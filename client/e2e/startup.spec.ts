import { expect, test } from '@playwright/test';

// Bug #563: under SwiftShader, the software WebGL of a browser without a GPU, the first draw of a page builds every
// shader pipeline in one GPU task of 2 to 10 s, and the page's main thread waits for it (online Hello messages too).
// A Mac has a GPU: the local e2e browser draws on it, with the same WebGL2 backend as CI. CI runners have no GPU.
test.skip(!!process.env.CI || process.platform !== 'darwin', 'only a local run on a Mac has a GPU to draw on');

test('the local e2e browser draws WebGL on the GPU and offers no WebGPU, bug #563', async ({ page }) => {
  await page.goto('./?bot=off');
  const gpu = await page.evaluate(async () => {
    const gl = document.createElement('canvas').getContext('webgl2')!;
    const info = gl.getExtension('WEBGL_debug_renderer_info')!;
    return { renderer: gl.getParameter(info.UNMASKED_RENDERER_WEBGL) as string, webgpu: !!(await (navigator as any).gpu?.requestAdapter()) };
  });
  expect(gpu.renderer).not.toContain('SwiftShader');
  expect(gpu.webgpu).toBe(false); // the page keeps the WebGL2 backend that CI tests
});

test('the first draws block the main thread for under 1.5 s, bug #563', async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).__longest = 0;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) (window as any).__longest = Math.max((window as any).__longest, e.duration);
    }).observe({ type: 'longtask', buffered: true });
  });
  await page.goto('./?bot=off');
  await page.waitForFunction(() => (window as any).__draws?.() >= 3);
  expect(await page.evaluate(() => (window as any).__longest)).toBeLessThan(1500);
});
