import { expect, test, type Page } from '@playwright/test';
import { openModes } from './modes';

// #1105, docs/specs/openworld-animation.md story 7: the Open world plate slides in on entry, folds out fast, and the New world
// confirmation slides up. Each motion is played for real: when the animation starts it is paused at half its length and the pose
// there is read (a check of the style at rest would pass with no motion at all).

type Pose = { total: number; opacity: number; transform: string; height: number };

const enter = async (page: Page) => {
  await page.goto('./?bot=off&openworld=7');
  await page.locator('canvas').waitFor();
  await openModes(page);
  await page.locator('#openworld').click();
};

const watchHalf = (page: Page) =>
  page.addInitScript(() => {
    const poses: Record<string, Pose> = {};
    (window as unknown as { __poses: Record<string, Pose> }).__poses = poses;
    document.addEventListener(
      'animationstart',
      (e) => {
        const el = e.target as HTMLElement;
        const anim = el.getAnimations().find((a) => (a as CSSAnimation).animationName === e.animationName)!;
        const total = Number(anim.effect!.getComputedTiming().duration);
        anim.pause();
        anim.currentTime = total / 2;
        const s = getComputedStyle(el);
        poses[`${el.id}:${e.animationName}`] = { total, opacity: Number(s.opacity), transform: s.transform, height: el.getBoundingClientRect().height };
        anim.finish();
      },
      true,
    );
  });

const pose = async (page: Page, name: string): Promise<Pose> => {
  await page.waitForFunction((n) => (window as unknown as { __poses: Record<string, Pose> }).__poses[n], name);
  return page.evaluate((n) => (window as unknown as { __poses: Record<string, Pose> }).__poses[n]!, name);
};

test('the plate slides in when the Open world is entered, and the confirmation slides up (#1105)', async ({ page }) => {
  await watchHalf(page);
  await enter(page);
  const plate = await pose(page, 'openworld-hud:ow-hud-in');
  expect(plate.total).toBe(200);
  expect(plate.opacity).toBeGreaterThan(0);
  expect(plate.opacity).toBeLessThan(1);
  expect(plate.transform).not.toBe('none');
  await expect(page.locator('#openworld-hud')).toHaveCSS('opacity', '1'); // it ends whole

  await page.locator('#openworld-new').click();
  const sheet = await pose(page, 'openworld-confirm:sheet-in');
  expect(sheet.total).toBe(200);
  expect(sheet.opacity).toBeGreaterThan(0);
  expect(sheet.opacity).toBeLessThan(1);
  expect(sheet.transform).not.toBe('none');
  // no layout shift: the box has the same height mid-slide and at rest
  const rest = await page.locator('#openworld-confirm').evaluate((el) => el.getBoundingClientRect().height);
  expect(Math.abs(sheet.height - rest)).toBeLessThan(1);
  await expect(page.locator('#openworld-keep')).toBeFocused();
});

test('the plate folds out on the fast token (#1105)', async ({ page }) => {
  await enter(page);
  const at = () => page.evaluate(() => document.body.dataset.openworldAt);
  await expect.poll(at).toBe('0,0');
  for (const key of ['ArrowRight', 'ArrowLeft', 'ArrowRight']) {
    await page.keyboard.press(key);
    await page.waitForTimeout(250);
  }
  await expect(page.locator('#openworld-chip')).toBeVisible(); // folded
  await expect(page.locator('#openworld-hud')).toHaveCSS('transition-duration', '0.12s, 0.12s, 0s');
});

test('Reduced motion keeps the plate and the confirmation, with no motion (#1105)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enter(page);
  await expect(page.locator('#openworld-hud')).toBeVisible();
  await expect(page.locator('#openworld-hud')).toHaveCSS('animation-duration', '0s');
  await page.locator('#openworld-new').click();
  await expect(page.locator('#openworld-confirm')).toBeVisible();
  await expect(page.locator('#openworld-confirm')).toHaveCSS('animation-duration', '0s');
});
