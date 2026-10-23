import { expect, test, type Page } from '@playwright/test';

// Cells are axial (q, r), see docs/specs/rules.md. Black starts at r = 2..4, White at r = -2..-4.
async function open(page: Page) {
  await page.goto('/');
  await page.locator('canvas').waitFor();
  const hud = page.locator('#hud');
  await expect(hud).toContainText('Black to move');
  const click = async (...cells: [number, number][]) => {
    for (const [q, r] of cells) {
      const p = await page.evaluate(([cq, cr]) => (window as any).__cellToScreen(cq, cr), [q, r]);
      await page.mouse.click(p.x, p.y);
    }
  };
  return { hud, click };
}

test('a 2-marble inline move is played and the turn passes', async ({ page }) => {
  const { hud, click } = await open(page);
  const before = await page.screenshot();
  await click([-1, 2], [0, 2], [1, 2]); // pair on the E-W axis, then the empty cell east of it
  await expect(hud).toContainText('White to move');
  expect((await page.screenshot()).equals(before)).toBe(false);
});

test('a 3-marble broadside move is played', async ({ page }) => {
  const { hud, click } = await open(page);
  await click([-2, 2], [-1, 2], [0, 2], [-1, 1]); // trio, then a free cell NW of its middle marble
  await expect(hud).toContainText('White to move');
});

test('two marbles that are not in a line are not a group: nothing is played', async ({ page }) => {
  const { hud, click } = await open(page);
  await click([-2, 2], [-1, 3]); // the second click is refused, only (-2,2) stays selected
  await click([1, 1]); // not a neighbour of (-2,2): nothing to play
  await expect(hud).toContainText('Black to move');
  await click([0, 2], [1, 1]); // (0,2) leaves a gap with (-2,2): refused again, (1,1) plays nothing
  await expect(hud).toContainText('Black to move');
});

test('a 2v1 push is played from the start in 5 plies, no ejection is reachable that fast', async ({
  page,
}) => {
  const { hud, click } = await open(page);
  await click([0, 2], [0, 3], [0, 1]); // 1. Black pair NW to (0,1)(0,2)
  await expect(hud).toContainText('White to move');
  await click([0, -2], [0, -1]); // 2. White steps to (0,-1)
  await click([0, 1], [0, 2], [0, 0]); // 3. Black pair NW, now touching White
  await click([2, -2], [2, -1]); // 4. White plays elsewhere, leaving (0,-2) free behind its marble
  await expect(hud).toContainText('Black to move');
  const before = await page.screenshot();
  await click([0, 0], [0, 1], [0, -1]); // 5. 2v1 inline push on the White marble
  await expect(hud).toContainText('White to move');
  expect((await page.screenshot()).equals(before)).toBe(false);
});
