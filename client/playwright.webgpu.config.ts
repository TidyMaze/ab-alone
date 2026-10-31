import { defineConfig } from '@playwright/test';

// The WebGPU smoke check of the Open world (#1023). It runs by hand, never in the default e2e run: it needs a real WebGPU
// adapter, and the default suite turns WebGPU off to test the WebGL2 backend (playwright.config.ts). CONTRIBUTING 13.
// A random port, as the default suite: E2E_PORT pins one.
process.env.E2E_PORT ??= String(20_000 + Math.floor(Math.random() * 40_000));
const port = process.env.E2E_PORT;

export default defineConfig({
  testDir: 'e2e-webgpu',
  reporter: [['list']],
  // One worker: the page draws on the one GPU of the machine, two pages would share it.
  workers: 1,
  // Every test passes in under 15 s, as in the default suite (CONTRIBUTING 11): no test.slow() or test.setTimeout().
  timeout: 15_000,
  retries: 0,
  use: {
    baseURL: `http://localhost:${port}`,
    serviceWorkers: 'block',
    trace: 'off',
  },
  projects: [
    {
      name: 'webgpu',
      use: {
        // The new headless mode ('chromium' channel) has the GPU adapter of the machine (Metal on a Mac). The headless shell
        // only offers a software adapter (SwiftShader), which the test treats as no GPU.
        channel: 'chromium',
        launchOptions: { args: ['--enable-unsafe-webgpu'] },
      },
    },
  ],
  webServer: {
    command: `bun run dev --port ${port} --strictPort --mode e2e`,
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
