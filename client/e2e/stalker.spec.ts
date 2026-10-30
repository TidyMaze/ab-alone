import { expect, test } from '@playwright/test';
import { HIDDEN, PLIES, SEEN } from '../src/test/stalker-game';
import { openModes } from './modes';

// Stalker against the bot (#998, game-design.md section 3.8): after the four plies of src/test/stalker-game.ts, loaded
// by the __playMoves hook, White's marble 2 cells from Black's is drawn and the one 3 cells away is not.
test('Stalker draws an enemy marble 2 cells away, not one 3 cells away, #998', async ({ page }) => {
  await page.goto('./?bot=on'); // a query: no landing on the Ship hub (#602)
  await page.locator('canvas').waitFor();
  await openModes(page);
  await page.getByRole('button', { name: 'Stalker' }).click();
  await expect(page.locator('#hud')).toContainText('Stalker: the bot is not fogged');
  const shown = await page.evaluate(([plies, seen, hidden]) => {
    const w = window as any;
    w.__playMoves(plies as number[][]);
    const at = ([q, r]: [number, number]) => w.__marbleTurn(q, r) !== null;
    return { drawn: w.__stalker().drawn as [number, number][], seen: at(seen as [number, number]), hidden: at(hidden as [number, number]) };
  }, [PLIES, SEEN, HIDDEN] as const);
  expect(shown.drawn).toContainEqual(SEEN);
  expect(shown.drawn).not.toContainEqual(HIDDEN);
  expect(shown).toMatchObject({ seen: true, hidden: false });
});
