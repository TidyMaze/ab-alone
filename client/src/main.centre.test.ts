// @vitest-environment jsdom
import { describe, expect, it, onTestFinished } from 'vitest';
import { axialTo3D } from './board';
import { middle } from './camera';
import { DUAL_CELLS } from './dual';
import { boot, type Game } from './test/harness';

// Bug #957: the board's centre sits in the middle of the window on every view a fight opens on and on Reset view, the
// HUD plate does not push it aside (#695 is gone): the player folds the plate instead. For The Dual Room the centre is
// the middle between its two rooms.

const byId = (id: string): HTMLElement => document.getElementById(id)!;
const SIZES = [
  [1280, 720], // desktop
  [375, 812], // phone upright
  [812, 375], // phone sideways
] as const;

/** Sets the window size, and puts it back when the test ends. */
function windowOf(width: number, height: number): void {
  const inner = { innerWidth, innerHeight };
  Object.assign(window, { innerWidth: width, innerHeight: height });
  onTestFinished(() => void Object.assign(window, inner));
}

/** Starts the fight against `boss` from the mode menu. */
function fight(game: Game, boss: string): void {
  game.openModes();
  byId('boss-fight').click();
  [...byId('boss-list').querySelectorAll('button')].find((b) => b.textContent === boss)!.click();
}

/** Where the axial point (q, r) is drawn in the window. */
const drawn = (game: Game, q: number, r: number): { x: number; y: number } => game.hook('__cellToScreen', q, r);

// The middle of The Dual Room's two rooms, in axial coordinates.
const { x, z } = middle(DUAL_CELLS.map(([q, r]) => axialTo3D(q, r)));
const DUAL_MIDDLE = [x - z / Math.sqrt(3), (2 * z) / Math.sqrt(3)] as const;

describe('main.ts the board centred in the window (#957)', () => {
  for (const [width, height] of SIZES)
    it(`a fight opens, and Reset view goes back, on the board centre in the middle of a ${width}x${height} window`, async () => {
      windowOf(width, height);
      const game = await boot('?bot=off');
      for (const [boss, [q, r]] of [
        ['The Choir', [0, 0]],
        ['The Pulsar', [0, 0]],
        ['The Dual Room', DUAL_MIDDLE],
      ] as const) {
        fight(game, boss);
        expect(drawn(game, q, r).x).toBeCloseTo(width / 2, 3);
        expect(drawn(game, q, r).y).toBeCloseTo(height / 2, 3);
        document.querySelector('canvas')!.dispatchEvent(new WheelEvent('wheel', { deltaY: -300 }));
        byId('reset-view').click();
        expect(drawn(game, q, r).x).toBeCloseTo(width / 2, 3);
        expect(drawn(game, q, r).y).toBeCloseTo(height / 2, 3);
      }
    });
});
