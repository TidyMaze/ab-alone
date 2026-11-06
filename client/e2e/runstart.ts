import { expect, type Page } from '@playwright/test';

/** Opens More on the start screen of a rogue-lite run (#1524), where the commanders, the ascension levels, the runes, the blueprints and the book
 * are, unless it is open. One click: no wait but the state it shows. */
export async function openMore(page: Page): Promise<void> {
  const more = page.locator('#run-map button[data-more]');
  if ((await more.getAttribute('aria-expanded')) !== 'true') await more.click();
  await expect(more).toHaveAttribute('aria-expanded', 'true');
}
