import { expect, test } from '@playwright/test';

// Bug #839: the invite link makes the button column taller. In a short landscape window the column scrolls, and it
// stayed scrolled down after the player reached Play online: Settings and Reset view were scrolled out of the column
// and no longer answered a tap. While the invite link shows, every button at the top of the column stays clickable.
test.describe('a phone held sideways', () => {
  test.use({ viewport: { width: 568, height: 320 }, hasTouch: true, isMobile: true });

  test('Settings and Reset view stay clickable once the invite link shows, #839', async ({ page }) => {
    await page.goto('./?bot=off');
    await page.locator('canvas').waitFor();
    await page.getByRole('button', { name: 'Game modes' }).click();
    // The player scrolls the column down until Play online shows at its bottom edge, then taps it.
    await page.evaluate(() => document.getElementById('play-online')!.scrollIntoView({ block: 'end' }));
    const at = await page.getByRole('button', { name: 'Play online' }).evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await page.mouse.click(at.x, at.y);
    await expect(page.locator('#invite')).toBeVisible();

    const covered = await page.evaluate(() =>
      ['settings', 'reset-view', 'free-cam'].filter((id) => {
        const r = document.getElementById(id)!.getBoundingClientRect();
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return !document.getElementById(id)!.contains(top);
      }),
    );
    expect(covered, 'buttons with something else under their centre').toEqual([]);
  });
});
