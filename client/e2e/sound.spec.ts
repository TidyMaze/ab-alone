import { expect, test, type Page } from '@playwright/test';

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
const audio = (page: Page) => page.evaluate(() => (window as any).__audio());

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
  await expect(page.locator('#sound')).toHaveAttribute('aria-pressed', 'true'); // on by default
  await loseGlass(click);
  await expect(page.locator('body')).toHaveAttribute('data-ejections', '1');
  await expect(page.locator('body')).toHaveAttribute('data-sound', 'toll');
  expect(await audio(page)).toBe('running');
});

test('a lost enemy shell clacks', async ({ page }) => {
  const click = await open(page);
  await loseShell(click);
  await expect(page.locator('#hud')).toContainText('White ejected 1/6');
  await expect(page.locator('body')).toHaveAttribute('data-sound', 'clack');
});

test('the sound toggle mutes the ejection, and the game plays on', async ({ page }) => {
  const click = await open(page);
  const toggle = page.locator('#sound');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await loseGlass(click);
  await expect(page.locator('#hud')).toContainText('Black ejected 1/6');
  await expect(page.locator('body')).toHaveAttribute('data-sound', 'none');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
});

test('the sound toggle survives a reload, and a muted page makes no audio context', async ({ page }) => {
  await open(page);
  const toggle = page.locator('#sound');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');

  await page.reload();
  const click = await open(page);
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await click([0, 2]); // a gesture on the board: still no audio context while muted
  expect(await audio(page)).toBe('none');

  await toggle.click(); // back on, the click is the gesture that starts the audio
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  expect(await audio(page)).toBe('running');
});

// Bug #146 pattern: a click right after load hits a disabled button or toggles.
test('the sound toggle is disabled or works when clicked right after load', async ({ page }) => {
  await page.goto('./?bot=off', { waitUntil: 'domcontentloaded' });
  const atClick = await page.evaluate(() => {
    const button = document.getElementById('sound') as HTMLButtonElement;
    const disabled = button.disabled;
    button.click();
    return { disabled, pressed: button.getAttribute('aria-pressed') };
  });
  expect(atClick.disabled || atClick.pressed === 'false').toBe(true);
  await expect(page.locator('#sound')).toBeEnabled();
});
