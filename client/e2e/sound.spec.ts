import { expect, test, type Page } from '@playwright/test';
import { ICONS } from '../src/icons';
import { knockPitch } from '../src/sound';

// The ejection sound (world.md section 7): the page says which sound an ejection played in
// data-sound, and window.__audio() gives the state of the audio context ('none' before one exists).
async function open(page: Page) {
  await page.goto('./?bot=off');
  await page.locator('canvas').waitFor();
  await expect(page.locator('#hud')).toContainText('Black to move');
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  return async (...cells: [number, number][]) => {
    for (const [q, r] of cells) {
      const p = await page.evaluate(([cq, cr]) => (window as any).__cellToScreen(cq, cr), [q, r]);
      await page.mouse.click(p.x, p.y);
    }
  };
}
// Sound lives in the settings menu (#284): the cog opens it, the toggle is a button named Sound.
const sound = async (page: Page) => {
  const toggle = page.getByRole('button', { name: 'Sound' });
  if (!(await toggle.isVisible())) await page.getByRole('button', { name: 'Settings' }).click();
  return toggle;
};
const audio = (page: Page) => page.evaluate(() => (window as any).__audio());
const level = (page: Page) => page.evaluate(() => (window as any).__level());

// The 3v2 push of eject.spec.ts: Black pushes the last White marble of the q = -2 column off.
async function loseGlass(click: Awaited<ReturnType<typeof open>>) {
  await click([-2, 2], [-2, 3], [-2, 4], [-2, 1]);
  await click([0, -3], [0, -2], [-1, -2]);
  await click([-2, 1], [-2, 2], [-2, 3], [-2, 0]);
  await click([-1, -2], [-1, -1], [-2, -2]);
  await click([-2, 0], [-2, 1], [-2, 2], [-2, -1]);
}

// The same push turned half a turn, sides swapped: after one waiting move of Black, White pushes
// a Black marble of the q = 2 column off.
async function loseShell(click: Awaited<ReturnType<typeof open>>) {
  await click([-2, 2], [-3, 2]); // Black waits: one marble W
  await click([2, -2], [2, -3], [2, -4], [2, -1]);
  await click([0, 3], [0, 2], [1, 2]);
  await click([2, -1], [2, -2], [2, -3], [2, 0]);
  await click([1, 2], [1, 1], [2, 2]);
  await click([2, 0], [2, -1], [2, -2], [2, 1]);
}

test('no audio before a gesture, then a lost glass marble tolls', async ({ page }) => {
  const click = await open(page);
  expect(await audio(page)).toBe('none'); // browsers block audio before a gesture
  await expect(await sound(page)).toHaveAttribute('aria-pressed', 'true'); // on by default
  await loseGlass(click);
  await expect(page.locator('body')).toHaveAttribute('data-ejections', '1');
  await expect(page.locator('body')).toHaveAttribute('data-sound', 'toll');
  expect(await audio(page)).toBe('running');
});

// #289: a move plays a knock; body[data-knock] gives its pitch (none when silent). Three marbles in
// line is the lowest knock.
test('a move plays the knock of its marbles, lower for three', async ({ page }) => {
  const click = await open(page);
  await click([-2, 2], [-2, 3], [-2, 4], [-2, 1]);
  await expect(page.locator('body')).toHaveAttribute('data-knock', String(knockPitch(3)));
});

test('a lost enemy shell clacks', async ({ page }) => {
  const click = await open(page);
  await loseShell(click);
  await expect(page.locator('#hud')).toContainText('White ejected 1/6');
  await expect(page.locator('body')).toHaveAttribute('data-sound', 'clack');
});

test('the sound toggle mutes the ejection, and the game plays on', async ({ page }) => {
  const click = await open(page);
  const toggle = await sound(page);
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await loseGlass(click);
  await expect(page.locator('#hud')).toContainText('Black ejected 1/6');
  await expect(page.locator('body')).toHaveAttribute('data-sound', 'none');
  await expect(page.locator('body')).toHaveAttribute('data-knock', 'none'); // the knock of the last move is silent too
  await (await sound(page)).click(); // the presses on the board closed the menu
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
});

test('the sound toggle survives a reload, and a muted page makes no audio context', async ({ page }) => {
  await open(page);
  const toggle = await sound(page);
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');

  await page.reload();
  const click = await open(page);
  await expect(await sound(page)).toHaveAttribute('aria-pressed', 'false');
  await click([0, 2]); // a gesture on the board: still no audio context while muted
  expect(await audio(page)).toBe('none');

  await (await sound(page)).click(); // back on, the click is the gesture that starts the audio
  await expect(await sound(page)).toHaveAttribute('aria-pressed', 'true');
  expect(await audio(page)).toBe('running');
});

test('Sound is no loose HUD button: it is in the settings menu, reachable by keyboard', async ({ page }) => {
  await open(page);
  await expect(page.locator('#online > #sound')).toHaveCount(0);
  const toggle = page.getByRole('button', { name: 'Sound' });
  await expect(toggle).toBeHidden(); // closed until the cog opens it
  await page.getByRole('button', { name: 'Settings' }).focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toBeVisible();
  await expect(toggle.locator('path')).toHaveAttribute('d', ICONS.sound); // a speaker, crossed out while off (#287)
  await toggle.focus();
  await page.keyboard.press('Enter'); // a key press is a gesture too
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(toggle.locator('path')).toHaveAttribute('d', ICONS.muted);
});

// The hum (world.md section 7) runs under every game once a gesture has made the audio context, and
// the Sound toggle fades its level out: window.__level() is the effects level, 0 when silent.
test('the hum runs after a gesture, and fades out when Sound is off', async ({ page }) => {
  const click = await open(page);
  expect(await level(page)).toBe(0); // no audio context before a gesture, so no hum
  await click([0, 2]); // a gesture on the board starts the audio, and with it the hum
  await expect.poll(() => level(page)).toBeGreaterThan(0.5);
  await (await sound(page)).click();
  await expect.poll(() => level(page)).toBeLessThan(0.01);
});

// Bug #146 pattern: a click right after load hits a disabled button or toggles.
test('the sound toggle is not clickable before it works, and works right after load', async ({ page }) => {
  await page.goto('./?bot=off', { waitUntil: 'domcontentloaded' });
  const atClick = await page.evaluate(() => {
    const cog = document.getElementById('settings') as HTMLButtonElement;
    const disabled = cog.disabled;
    cog.click();
    return { disabled, hidden: (document.getElementById('settings-menu') as HTMLElement).hidden };
  });
  expect(atClick.disabled || !atClick.hidden).toBe(true);
  await expect(page.getByRole('button', { name: 'Settings' })).toBeEnabled();
});
