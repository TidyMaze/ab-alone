import { defineConfig } from '@playwright/test';

// E2E_PORT lets parallel checkouts each run their own dev server.
const port = process.env.E2E_PORT ?? '5173';

export default defineConfig({
  testDir: 'e2e',
  use: { baseURL: `http://localhost:${port}`, browserName: 'chromium' },
  webServer: {
    command: `npm run dev -- --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
