import { expect, test, type Page } from '@playwright/test';

/** Opens the mode menu (#357), where Play online, Boss fight and Daily challenge live, unless it is open already. */
export async function openModes(page: Page): Promise<void> {
  const button = page.getByRole('button', { name: 'Game modes' });
  if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click();
}

/** Shows the Open world plate (`#openworld-hud`) and clicks its button `selector`. The plate folds to its chip 8 s after the entry
 * (openworldfold.ts, #1138): on a software-GL runner the page takes longer than that to draw its first frames, so the plate is folded
 * when the test reaches it (#1436). The chip shows it again with no clock. The click itself is made once, never retried: a click
 * that was delivered but timed out on a slow runner would act twice. */
export async function showHud(page: Page, selector: string): Promise<void> {
  const chip = page.locator('#openworld-chip');
  await expect(async () => {
    if (await chip.isVisible()) await chip.click({ timeout: 5000 });
    await expect(page.locator(selector)).toBeVisible({ timeout: 1000 });
  }).toPass();
}
export async function clickHud(page: Page, selector: string): Promise<void> {
  await showHud(page, selector);
  await page.locator(selector).click();
}

/** The invite link of the room just opened: it shows once the room's keys are made, with their fingerprint (#1323). */
export async function inviteLink(page: Page): Promise<string> {
  const invite = page.locator('#invite');
  await expect(invite).toHaveValue(/&key=[\w-]{8}$/);
  return invite.inputValue();
}

/** The low tier on CI (see lowTierOnCi) for pages of a context the test opens itself (browser.newContext). */
export async function lowTierPages(...pages: Page[]): Promise<void> {
  if (process.env.CI) await Promise.all(pages.map((p) => p.addInitScript(() => localStorage.setItem('ab-alone.tier', 'low'))));
}

/** On CI the Open world pages draw on the low quality tier. CI runners have no GPU: on the high tier an idle Open world page ran at
 * 4.6 animation frames a second (one every 220 ms) on SwiftShader, against 60 on the low tier (measured at 960x540, #1436), so the
 * specs that sample frames got none and the ones that click waited seconds. A spec that needs a tier sets its own, which wins.
 * Locally (a GPU) the tier stays the detected one. Call it at the top of a spec file. */
export function lowTierOnCi(): void {
  test.beforeEach(async ({ page }) => {
    if (process.env.CI) await page.addInitScript(() => localStorage.setItem('ab-alone.tier', 'low'));
  });
}
