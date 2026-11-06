import { expect, test } from '@playwright/test';
import { shot } from './shot';

// The code of the Open world is a chunk of the build, loaded at the first entry (#1578): a table page does not ask for it, the first
// entry does, and a load that fails leaves a message with Retry and Reload over a page that is alive.
const CHUNK = '**/assets/openworldwire-*.js';

test('a table page asks for no Open world code, the menu entry asks for it once and opens the world', async ({ page }) => {
  const asked: string[] = [];
  page.on('request', (request) => /openworldwire-/.test(request.url()) && asked.push(request.url()));
  await page.goto('./?bot=off');
  await expect(page.locator('body')).toHaveAttribute('data-bay', 'ready');
  expect(asked).toEqual([]);
  await page.locator('#modes').click();
  await page.locator('#openworld').click();
  await expect(page.locator('body')).toHaveAttribute('data-openworld', /.+/);
  expect(asked).toHaveLength(1);
});

test('a failed load shows Retry and Reload, the table stays alive, and Retry opens the world', async ({ page }) => {
  await page.route(CHUNK, (route) => route.abort());
  await page.goto('./?bot=off');
  await expect(page.locator('body')).toHaveAttribute('data-bay', 'ready');
  await page.locator('#modes').click();
  await page.locator('#openworld').click();
  const message = page.locator('#chunk-error');
  await expect(message).toBeVisible();
  await expect(message).toContainText('The Open world could not load');
  await expect(page.locator('#loading')).toBeHidden();
  await shot(page, { path: 'test-results/chunk-error.png' });
  await expect(page.locator('body')).not.toHaveAttribute('data-openworld', /.+/);
  await page.unroute(CHUNK);
  await message.getByRole('button', { name: 'Retry' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-openworld', /.+/);
  await expect(message).toBeHidden();
});
