import { expect, test } from '@playwright/test';

test('mobile graphics quality adaptive tier and pixel ratio (#655)', async ({ browser }) => {
  // 1. Mobile Low Quality (budget device or low tier override)
  const lowContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
  });
  const lowPage = await lowContext.newPage();
  await lowPage.goto('./?bot=off&quality=low');
  await lowPage.locator('canvas').waitFor();
  expect(await lowPage.evaluate(() => document.body.dataset.tier)).toBe('low');
  await lowContext.close();

  // 2. Mobile High Quality (modern capable phone: DPR 2.0, high tier)
  const highContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });
  const highPage = await highContext.newPage();
  await highPage.goto('./?bot=off&quality=high&shadows=on&particles=on');
  await highPage.locator('canvas').waitFor();
  expect(await highPage.evaluate(() => document.body.dataset.tier)).toBe('high');
  expect(await highPage.evaluate(() => window.devicePixelRatio)).toBe(2);
  await highContext.close();
});
