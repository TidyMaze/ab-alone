import { expect, test, type Page } from '@playwright/test';

// The HUD plates are bolted on the frame (ui.md 1): a rivet in each corner, 4 px inside the border, in the --edge
// colour (ui.md 2), drawn as background layers over the plate's own colour, so it takes no room.
const rivets = (page: Page, id: string) =>
  page.evaluate((id) => {
    const plate = getComputedStyle(document.getElementById(id)!);
    return {
      gradients: plate.backgroundImage.match(/radial-gradient/g)?.length ?? 0,
      size: plate.backgroundSize,
      repeat: plate.backgroundRepeat,
      position: plate.backgroundPosition,
      panel: plate.backgroundColor !== 'rgba(0, 0, 0, 0)',
    };
  }, id);

for (const [name, viewport] of [
  ['desktop', { width: 1280, height: 720 }],
  ['phone held upright', { width: 390, height: 844 }],
] as const) {
  test(`the HUD plate and the evaluation plate show their rivets, ${name}, #303`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('./?bot=off');
    await page.locator('canvas').waitFor();
    await expect(page.locator('#eval')).toBeVisible();
    for (const id of ['hud', 'eval']) {
      expect(await rivets(page, id), id).toEqual({
        gradients: 4,
        size: Array(4).fill('6px 6px').join(', '),
        repeat: Array(4).fill('no-repeat').join(', '),
        position: '4px 4px, calc(100% - 4px) 4px, 4px calc(100% - 4px), calc(100% - 4px) calc(100% - 4px)',
        panel: true,
      });
    }
  });
}
