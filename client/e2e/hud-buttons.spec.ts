import { expect, test, type Page } from '@playwright/test';
import { openModes } from './modes';

// #839: the HUD buttons look alike. Copy is styled as Reset view, and the button that opens a private game
// shows its name, in a button as tall as the other items of the mode menu.

/** The look of a button: what makes a button this style, not where it sits or how wide its name is. */
const look = (page: Page, id: string) =>
  page.locator(`#${id}`).evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      font: `${s.fontStyle} ${s.fontWeight} ${s.fontSize}/${s.lineHeight} ${s.fontFamily}`,
      color: s.color,
      background: s.backgroundColor,
      border: `${s.borderTopWidth} ${s.borderTopStyle} ${s.borderTopColor}`,
      radius: s.borderTopLeftRadius,
      padding: `${s.paddingTop} ${s.paddingRight} ${s.paddingBottom} ${s.paddingLeft}`,
      height: el.getBoundingClientRect().height,
    };
  });

test('Free camera is a settings item, not a HUD button, lit while it is on, #938', async ({ page }) => {
  await page.goto('./?bot=off');
  await page.locator('canvas').waitFor();
  await expect(page.locator('#free-cam')).toHaveCount(0);
  await expect(page.locator('#group-view button')).toHaveCount(1); // Reset view alone
  await page.locator('#settings').click();
  const item = page.getByRole('button', { name: 'Free camera' });
  await expect(item).toHaveAttribute('aria-pressed', 'false');
  await item.click();
  await expect(item).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => (window as unknown as { __freeCamActive: () => boolean }).__freeCamActive())).toBe(true);
});

test('Play online shows its name and is as tall as Fight together, #839', async ({ page }) => {
  await page.goto('./?bot=off');
  await page.locator('canvas').waitFor();
  await openModes(page);
  const play = page.getByRole('button', { name: 'Play online', exact: true });
  await expect(play).toHaveText('Play online');
  await expect(play.locator('svg')).toHaveCount(0);
  expect(await look(page, 'play-online')).toEqual(await look(page, 'fight-together'));
});

test('Copy looks like Reset view and is as tall as the link beside it, #839', async ({ page }) => {
  await page.goto('./?bot=off');
  await page.locator('canvas').waitFor();
  await openModes(page);
  await page.getByRole('button', { name: 'Play online', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Copy', exact: true })).toBeVisible();
  const copy = await look(page, 'invite-copy');
  const { height, ...rest } = await look(page, 'reset-view');
  expect({ ...copy, height: 0 }).toEqual({ ...rest, height: 0 });
  expect(copy.height).toBe((await page.locator('#invite').boundingBox())!.height);
});
