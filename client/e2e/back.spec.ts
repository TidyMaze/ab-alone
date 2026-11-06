import { expect, test, type Page } from '@playwright/test';
import { openModes } from './modes';

// Browser Back and the Android Back gesture (#1564, docs/specs/ui.md section "Browser Back"): entering a mode pushes one history
// entry, Back returns to the Hub, and Back from the Hub returns to the table. The page never goes to about:blank.

const body = (page: Page) => page.locator('body');
const pick = async (page: Page, id: string): Promise<void> => {
  await openModes(page);
  await page.locator(id).click();
};

const MODES: [string, (page: Page) => Promise<void>, (page: Page) => Promise<void>][] = [
  ['Battle royale', (p) => pick(p, '#battle-royale'), (p) => expect(p.locator('#royale-hold')).toBeVisible()],
  ['Rogue-lite run', (p) => pick(p, '#roguelite'), (p) => expect(p.locator('#run-map')).toBeVisible()],
  ['Daily challenge', (p) => pick(p, '#daily'), (p) => expect(body(p)).toHaveAttribute('data-boss', /.+/)],
  ['Trainer', (p) => pick(p, '#trainer'), (p) => expect(body(p)).toHaveAttribute('data-trainer', /.+/)],
  [
    'Boss fight',
    async (p) => {
      await pick(p, '#boss-fight');
      await p.locator('#boss-list button').first().click();
    },
    (p) => expect(body(p)).toHaveAttribute('data-boss', /.+/),
  ],
  ['Open world', (p) => pick(p, '#openworld'), (p) => expect(body(p)).toHaveAttribute('data-openworld', /.+/)],
];

for (const [name, enter, shown] of MODES) {
  test(`Back from ${name} returns to the Hub, then to the table, #1564`, async ({ page }) => {
    await page.goto('./?bot=off&net=hook');
    await expect(page.locator('#hud')).toContainText('Black to move');
    await enter(page);
    await shown(page);
    await page.goBack();
    expect(page.url()).toContain('bot=off');
    await expect(page.locator('#hud')).toContainText('Hub');
    await expect(body(page)).toHaveAttribute('data-hub', /.+/);
    await page.goBack();
    expect(page.url()).toContain('bot=off');
    await expect(page.locator('#hud')).toContainText('Black to move');
    await expect(body(page)).not.toHaveAttribute('data-hub', /.*/);
  });
}

test('Back from the Hub returns to the table, and a Back on the table leaves the page, #1564', async ({ page }) => {
  await page.goto('./?bot=off&net=hook');
  await expect(page.locator('#hud')).toContainText('Black to move');
  await pick(page, '#ship');
  await expect(page.locator('#hud')).toContainText('Hub');
  await page.goBack();
  await expect(page.locator('#hud')).toContainText('Black to move');
  await page.goBack(); // the page started here: the browser's own Back
  expect(page.url()).not.toContain('bot=off');
});

test('a mode left by its own button leaves no entry to press twice, #1564', async ({ page }) => {
  await page.goto('./?bot=off&net=hook');
  await expect(page.locator('#hud')).toContainText('Black to move');
  await pick(page, '#ship');
  await page.locator('#new-game').click();
  await expect(page.locator('#hud')).toContainText('Black to move');
  await page.goBack(); // one press: the page pops the stale entry and goes on back at once
  await expect.poll(() => page.url()).not.toContain('bot=off');
});
