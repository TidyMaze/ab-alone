import type { Page } from '@playwright/test';

/** Opens the Advanced group of the settings menu (#1566), shut until a press: FPS, Render, Free camera, Export game, Import game
 * and Copy diagnostics are in it. The menu must be open. */
export async function openAdvanced(page: Page): Promise<void> {
  const advanced = page.locator('#settings-advanced');
  if (!(await advanced.evaluate((d) => (d as HTMLDetailsElement).open))) await advanced.locator('summary').click();
}
