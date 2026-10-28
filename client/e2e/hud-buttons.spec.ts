import { expect, test, type Page } from '@playwright/test';
import { openModes } from './modes';

// #839: the HUD buttons look alike. Cam and Copy are styled as Reset view, and the button that opens a private game
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

test('Cam looks like Reset view and Hint, lit while it is on, #839', async ({ page }) => {
  await page.goto('./?bot=off');
  await page.locator('canvas').waitFor();
  const cam = page.getByRole('button', { name: 'Cam' });
  await expect(cam).toBeEnabled();
  const reset = await look(page, 'reset-view');
  expect(await look(page, 'free-cam')).toEqual(reset);
  expect(await look(page, 'hint')).toEqual(reset);
  const off = await cam.evaluate((el) => getComputedStyle(el).borderTopColor);
  await cam.click();
  await expect(cam).toHaveAttribute('aria-pressed', 'true');
  expect(await cam.evaluate((el) => getComputedStyle(el).borderTopColor)).not.toBe(off); // lit like Hint
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
