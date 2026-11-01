import { expect, type Page } from '@playwright/test';

/** Opens the mode menu (#357), where Play online, Boss fight and Daily challenge live, unless it is open already. */
export async function openModes(page: Page): Promise<void> {
  const button = page.getByRole('button', { name: 'Game modes' });
  if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click();
}

/** The invite link of the room just opened: it shows once the room's keys are made, with their fingerprint (#1323). */
export async function inviteLink(page: Page): Promise<string> {
  const invite = page.locator('#invite');
  await expect(invite).toHaveValue(/&key=[\w-]{8}$/);
  return invite.inputValue();
}
