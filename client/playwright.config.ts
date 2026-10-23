import { defineConfig } from '@playwright/test';

// E2E_PORT lets parallel checkouts each run their own dev server.
const port = process.env.E2E_PORT ?? '5173';

// On CI, the HTML report is uploaded with test-results/ when the e2e job fails.
const reporter = process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list';

export default defineConfig({
  testDir: 'e2e',
  reporter,
  use: { baseURL: `http://localhost:${port}`, trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'firefox', use: { browserName: 'firefox' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
  webServer: {
    command: `npm run dev -- --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
