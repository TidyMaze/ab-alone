import { defineConfig } from '@playwright/test';

// E2E_PORT lets parallel checkouts each run their own dev server.
const port = process.env.E2E_PORT ?? '5173';
// E2E_BASE_URL points the suite at a running site (the nightly run uses the GitHub Pages build).
const baseURL = process.env.E2E_BASE_URL;

// On CI, the HTML report is uploaded with test-results/ when the e2e job fails.
const reporter = process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list';

export default defineConfig({
  testDir: 'e2e',
  reporter,
  // Full traces on every run slowed the 30 s timeout tests (eject, clear-board) past their limit on CI.
  // One retry on CI records a trace for the retried run only.
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: baseURL ?? `http://localhost:${port}`, trace: 'on-first-retry' },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'firefox', use: { browserName: 'firefox' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
  webServer: baseURL
    ? undefined
    : {
        command: `npm run dev -- --port ${port} --strictPort`,
        url: `http://localhost:${port}`,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
