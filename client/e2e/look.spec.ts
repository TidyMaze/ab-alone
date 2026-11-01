import { expect, test, type Page } from '@playwright/test';

// The tonal look (#1138, look.ts): the board, the cells and the marbles are flat tonal materials and their maps are never
// requested; the pbr look keeps them. Both are asked for by the address.
const NOT_TONAL = /(skin-|deck-|board-|plate-)/;

async function filesLoaded(page: Page, search: string): Promise<{ files: string[]; textures: number }> {
  const files: string[] = [];
  page.on('response', (r) => {
    if (r.url().includes('/assets/') && r.url().endsWith('.ktx2')) files.push(r.url().split('/').pop()!);
  });
  await page.goto(`./?bot=on&${search}`);
  await page.locator('canvas').waitFor();
  await expect(page.locator('body')).toHaveAttribute('data-bay', 'ready');
  const textures = await page.evaluate(() => (window as unknown as { __renderCost: { textures: number } }).__renderCost.textures);
  return { files, textures };
}

test('the tonal look requests no skin, cell or plate map and draws the board (#1138)', async ({ page }) => {
  const { files } = await filesLoaded(page, 'look=tonal');
  expect(files.filter((f) => NOT_TONAL.test(f))).toEqual([]);
  await expect(page.locator('#hud')).toContainText('White to move');
});

test('the pbr look still requests the skin maps and has more textures than the tonal one (#1138)', async ({ page, browser }) => {
  const pbr = await filesLoaded(page, 'look=pbr&scene=room'); // the room's skin maps wait for the room (#1370)
  expect(pbr.files).toContain('skin-Leather027-albedo.ktx2');
  const other = await (await browser.newContext()).newPage();
  const tonal = await filesLoaded(other, 'look=tonal');
  expect(tonal.textures).toBeLessThan(pbr.textures);
});
