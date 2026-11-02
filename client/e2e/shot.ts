import type { Page } from '@playwright/test';

/** A picture kept for a person to look at (a PR screenshot, a report), no test reads it. A frame of software WebGL costs seconds on
 * the CI runner (no GPU), so it is taken only when E2E_SHOTS is set: `E2E_SHOTS=1 bun run e2e ...` (#1481). A test that reads the
 * picture calls page.screenshot itself. */
export async function shot(page: Page, options: Parameters<Page['screenshot']>[0]): Promise<void> {
  if (process.env.E2E_SHOTS) await page.screenshot(options);
}
