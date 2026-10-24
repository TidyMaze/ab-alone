import { defineConfig } from '@playwright/test';

// E2E_PORT lets parallel checkouts each run their own dev server.
const port = process.env.E2E_PORT ?? '5173';
// E2E_BASE_URL points the suite at a running site (the nightly run uses the GitHub Pages build).
const baseURL = process.env.E2E_BASE_URL;
// The offline spec needs the production build and its service worker (#193): `vite build`, then `vite preview` on
// its own random port. The workers read the port and the URL from the environment set here.
process.env.E2E_PREVIEW_PORT ??= String(20_000 + Math.floor(Math.random() * 40_000));
const previewPort = process.env.E2E_PREVIEW_PORT;
process.env.E2E_PREVIEW_URL ??= baseURL ?? `http://localhost:${previewPort}/ab-alone/`;

// On CI, the HTML report is uploaded with test-results/ when the e2e job fails.
const reporter = process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list';

export default defineConfig({
  testDir: 'e2e',
  reporter,
  // Full traces on every run slowed the 30 s timeout tests (eject, clear-board) past their limit on CI.
  // CI runners have no GPU: every page draws with software WebGL on all cores. Two workers starved each other, a frame took
  // 1.5 s and clicks timed out (#216); one worker passes all specs (run 40103771311). Its slowest specs take 23 s, hence 60 s.
  workers: process.env.CI ? 1 : undefined,
  timeout: process.env.CI ? 60_000 : 30_000,
  // One retry on CI records a trace for the retried run only.
  retries: process.env.CI ? 1 : 0,
  // No service worker outside the offline spec: a cache left by one test must never serve another (#193).
  use: { baseURL: baseURL ?? `http://localhost:${port}`, trace: 'on-first-retry', serviceWorkers: 'block' },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'firefox', use: { browserName: 'firefox' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
  // Playwright starts the servers in this order and stops both: the dev server rebuilds the wasm package before the
  // production build reads it.
  webServer: baseURL
    ? undefined
    : [
        {
          // --mode e2e: the server does not watch files, so nothing written to the checkout reloads a page under test (#185).
          command: `bun run dev --port ${port} --strictPort --mode e2e`,
          url: `http://localhost:${port}`,
          reuseExistingServer: true,
          timeout: 120_000,
        },
        {
          command: `bunx vite build --logLevel warn && bunx vite preview --port ${previewPort} --strictPort`,
          url: process.env.E2E_PREVIEW_URL,
          reuseExistingServer: false,
          timeout: 120_000,
        },
      ],
});
