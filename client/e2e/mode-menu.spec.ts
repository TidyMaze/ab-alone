import { expect, test } from '@playwright/test';

// Issue #357: Play online, Boss fight and Daily challenge live in one menu behind the Game modes button, collapsed
// by default, built like the settings menu (#277): it closes on Escape, a press outside and the button again.
const ENTRIES = ['Play online', 'Boss fight', /^Daily challenge/];

test('the mode menu is closed at the start, and its button opens and closes it', async ({ page }) => {
  await page.goto('./?bot=off');
  const button = page.getByRole('button', { name: 'Game modes' });
  await expect(button).toBeEnabled();
  await expect(button).toHaveAttribute('title', 'Game modes');
  await expect(button.locator('svg')).toHaveCount(1);
  await expect(button).toHaveAttribute('aria-expanded', 'false');
  for (const name of ENTRIES) await expect(page.getByRole('button', { name })).toBeHidden();

  await button.click();
  await expect(button).toHaveAttribute('aria-expanded', 'true');
  for (const name of ENTRIES) await expect(page.getByRole('button', { name })).toBeVisible();

  await button.click();
  await expect(button).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('button', { name: 'Boss fight' })).toBeHidden();
});

test('the mode menu closes on Escape and on a press outside, and is reachable by keyboard', async ({ page }) => {
  await page.goto('./?bot=off');
  const button = page.getByRole('button', { name: 'Game modes' });
  const online = page.getByRole('button', { name: 'Play online' });
  await expect(button).toBeEnabled();

  await button.focus();
  await page.keyboard.press('Enter');
  await expect(online).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(online).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(online).toBeHidden();
  await expect(button).toBeFocused();
  await expect(button).toHaveAttribute('aria-expanded', 'false');

  await button.click();
  await expect(online).toBeVisible();
  await page.getByRole('button', { name: 'Reset view' }).click();
  await expect(online).toBeHidden();
  await expect(button).toHaveAttribute('aria-expanded', 'false');
});

test('picking a boss closes the mode menu and keeps Retry and Goal in the column', async ({ page }) => {
  await page.goto('./?bot=off');
  const button = page.getByRole('button', { name: 'Game modes' });
  await button.click();
  await page.getByRole('button', { name: 'Boss fight' }).click();
  await page.locator('#boss-list').getByRole('button', { name: 'The Echo' }).click();
  await expect(page.locator('#hud')).toContainText('P1');
  await expect(button).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('button', { name: 'Boss fight' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Goal' })).toBeVisible();
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true });

  test('the mode button and every item of the open menu are touch targets of at least 44 px', async ({ page }) => {
    await page.goto('./?bot=off');
    await page.getByRole('button', { name: 'Game modes' }).click();
    await page.getByRole('button', { name: 'Boss fight' }).click();
    const small = await page.evaluate(() =>
      [document.getElementById('modes')!, ...document.querySelectorAll('#mode-menu button')]
        .filter((el) => el.getClientRects().length > 0)
        .filter((el) => el.getBoundingClientRect().width < 44 || el.getBoundingClientRect().height < 44)
        .map((el) => el.textContent || el.getAttribute('aria-label')),
    );
    expect(small).toEqual([]);
  });
});

// #666: on a phone held upright the open boss list has room for 12 bosses (copies of its last entry make 12, as #663
// does on a desktop): every item stays a 44 px touch target with a label of at least 12
// px, and the last boss, scrolled into view, is on screen and the element under its centre.
for (const viewport of [{ width: 360, height: 780 }, { width: 375, height: 812 }]) {
  test.describe(`on a ${viewport.width} px phone held upright`, () => {
    test.use({ viewport, hasTouch: true });

    test('12 bosses keep 44 px touch targets and readable labels, the last one reachable, #666', async ({ page }) => {
      await page.goto('./?bot=off');
      await page.getByRole('button', { name: 'Game modes' }).click();
      await page.getByRole('button', { name: 'Boss fight' }).click();
      const list = page.locator('#boss-list');
      await list.evaluate((el) => {
        while (el.children.length < 12) el.appendChild(el.lastElementChild!.cloneNode(true));
      });
      await expect(list.getByRole('button')).toHaveCount(12);
      const found = await page.evaluate(() => {
        const items = [...document.querySelectorAll('#mode-menu button')].filter((el) => el.getClientRects().length > 0);
        const last = document.querySelector('#boss-list')!.lastElementChild!;
        last.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        const b = last.getBoundingClientRect();
        return {
          small: items.filter((el) => el.getBoundingClientRect().width < 44 || el.getBoundingClientRect().height < 44).map((el) => el.textContent),
          tiny: items.filter((el) => parseFloat(getComputedStyle(el).fontSize) < 12).map((el) => el.textContent),
          lastReachable: b.left >= 0 && b.top >= 0 && b.right <= innerWidth && b.bottom <= innerHeight && document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2) === last,
        };
      });
      expect(found).toEqual({ small: [], tiny: [], lastReachable: true });
    });
  });
}

// Bug #653: on a 1280x720 window the open boss list of 7 bosses scrolled, The Rail Yard and Daily challenge below the
// fold. On a desktop window every boss and Daily challenge show without a scroll, with room for 2 more bosses than the 7
// of then: the list gets copies of its last entry up to 9 bosses in all (1 since The Magnetizer, #645).
for (const viewport of [{ width: 1280, height: 720 }, { width: 1280, height: 800 }]) {
  test(`every boss and Daily challenge fit without a scroll in a ${viewport.width}x${viewport.height} window, bug #653`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('./?bot=off');
    await page.getByRole('button', { name: 'Game modes' }).click();
    await page.getByRole('button', { name: 'Boss fight' }).click();
    const list = page.locator('#boss-list');
    await list.evaluate((el) => {
      while (el.children.length < 9) el.appendChild(el.lastElementChild!.cloneNode(true));
    });
    await expect(list.getByRole('button')).toHaveCount(9);
    const outside = await page.evaluate(() => {
      const column = document.getElementById('online')!;
      const box = column.getBoundingClientRect();
      const inside = (b: DOMRect) =>
        b.left >= Math.max(0, box.left) && b.top >= Math.max(0, box.top) && b.right <= Math.min(innerWidth, box.right) && b.bottom <= Math.min(innerHeight, box.bottom);
      const items = [...document.querySelectorAll('#boss-list button'), document.getElementById('daily')!];
      return {
        scrolls: column.scrollHeight > column.clientHeight,
        outside: items.filter((el) => !inside(el.getBoundingClientRect())).map((el) => el.textContent),
      };
    });
    expect(outside).toEqual({ scrolls: false, outside: [] });
  });
}
