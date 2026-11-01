import { expect, test } from '@playwright/test';

// #1361: a link ?openworld=<seed> opens that world at the load, with no click on the menu.
test('?openworld=1305 opens the public world at the load, the online notice first, Stay solo goes offline', async ({ page }) => {
  const sockets: string[] = [];
  await page.routeWebSocket(/.*/, (ws) => {
    sockets.push(ws.url());
    void ws.close();
  });
  await page.goto('./?bot=off&consent&openworld=1305');
  const dialog = page.getByRole('dialog', { name: 'Online play' });
  await expect(dialog).toBeVisible();
  await expect(page.locator('body')).not.toHaveAttribute('data-openworld', /.+/); // nothing opens before the answer
  await dialog.getByRole('button', { name: 'Stay solo' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-openworld', '1305');
  await expect(page.locator('#openworld-hud')).toBeVisible();
  expect(sockets).toEqual([]);
});

test('?openworld=7 lands in the world of seed 7 with no click', async ({ page }) => {
  await page.goto('./?bot=off&openworld=7');
  await expect(page.locator('body')).toHaveAttribute('data-openworld', '7');
});

test('a bad value opens the public world, the one a player can enter', async ({ page }) => {
  await page.goto('./?bot=off&openworld=abc');
  await expect(page.locator('body')).toHaveAttribute('data-openworld', '1305');
});
