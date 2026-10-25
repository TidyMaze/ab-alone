import { type Page } from '@playwright/test';

/** Opens the mode menu (#357), where Play online, Boss fight and Daily challenge live, unless it is open already. */
export async function openModes(page: Page): Promise<void> {
  const button = page.getByRole('button', { name: 'Game modes' });
  if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click();
}
