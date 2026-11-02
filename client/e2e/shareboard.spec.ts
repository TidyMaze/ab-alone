import { expect, test, type Page } from '@playwright/test';

// Issue #1287, first slice: the shared ranked board opt-in. Asked at the first ranked entry, unticked; nothing reaches a relay.
// `?board` asks for the dialog under Playwright (navigator.webdriver skips it), `?net=hook` keeps the online transport off the network.
const SHOTS = process.env.SHOTS;

async function watch(page: Page): Promise<string[]> {
  const sockets: string[] = [];
  await page.routeWebSocket(/.*/, (ws) => {
    sockets.push(ws.url());
    void ws.close();
  });
  page.on('websocket', (ws) => sockets.push(ws.url()));
  return sockets;
}

test('the ranked entry asks first, joining and leaving the board are as easy, and nothing is sent', async ({ page }) => {
  const sockets = await watch(page);
  await page.goto('./?bot=off&board&net=hook');
  await page.getByRole('button', { name: 'Game modes' }).click();
  await page.getByRole('button', { name: 'Ranked' }).click();
  const dialog = page.getByRole('dialog', { name: 'Shared ranked board' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('public and permanent');
  await expect(dialog).toContainText('I understand and I am 16 or older');
  const tick = dialog.getByRole('checkbox');
  await expect(tick).not.toBeChecked();
  const join = dialog.getByRole('button', { name: 'Join the board' });
  await expect(join).toBeDisabled();
  for (const control of [tick, dialog.getByRole('textbox'), join, dialog.getByRole('button', { name: 'Keep ranked local' })]) {
    expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(24);
  }
  for (const control of [dialog.getByRole('textbox'), dialog.getByRole('button', { name: 'Keep ranked local' }), dialog.locator('#optin-tick')]) {
    expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  await dialog.getByRole('textbox').fill('A name far too long to keep');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}-optin.png` });
  await tick.check();
  await join.click();
  await expect(dialog).toBeHidden();

  await page.getByRole('button', { name: 'Game modes' }).click();
  await page.getByRole('button', { name: 'Leaderboard' }).click();
  const board = page.getByRole('dialog', { name: 'Ranked 1v1' });
  await expect(board).toContainText('You are on the shared board as "A name far too l"');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}-board.png` });
  await board.getByRole('button', { name: 'Leave the board' }).click();
  await expect(board).toContainText('You are not on the shared board');
  const kept = await page.evaluate(() => ({
    consent: localStorage.getItem('ab-alone.board-consent'),
    retire: localStorage.getItem('ab-alone.board-retire'),
  }));
  expect(JSON.parse(kept.consent!)).toEqual({ v: 1, choice: 'declined' });
  expect(JSON.parse(kept.retire!).events[0].kind).toBe('retire');
  await page.waitForTimeout(300);
  expect(sockets).toEqual([]);
});
