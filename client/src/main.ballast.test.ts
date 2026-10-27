// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { Axial } from './board';
import { boot, type Game } from './test/harness';

// The Ballast Mind on the harness (#749, game-design.md section 7.5): every 3 turns it borrows an effect of another
// boss, named in the HUD during the turn before. ?bot=off plays both sides, one-marble moves, so no boss search runs.
// Fight seed 0 borrows the Magnetizer's polarity, 2 the Hull's crack, 3 the Pulsar's pulse, 4 the Chaplain's check.

type Move = { cells: Axial[]; dir: number };
const DIRS: Axial[] = [[1, 0], [-1, 0], [1, -1], [-1, 1], [0, -1], [0, 1]];
const byId = (id: string): HTMLElement => document.getElementById(id)!;
const tell = (): string => byId('hud').querySelector('.boss .tell')?.textContent ?? '';

function fightBallast(game: Game, seed: number): void {
  vi.spyOn(crypto, 'getRandomValues').mockImplementation((a) => {
    (a as Uint32Array).fill(seed);
    return a;
  });
  game.openModes();
  byId('boss-fight').click();
  [...byId('boss-list').querySelectorAll('button')].find((b) => b.textContent === 'The Ballast Mind')!.click();
}

/** Plays `n` plies, the first one-marble move of the side to move each time, the slides run to their end. */
function plies(game: Game, n: number): void {
  for (let k = 0; k < n; k++) {
    const mv = game.hook<Move[]>('__legal').find((m) => m.cells.length === 1)!;
    const [q, r] = mv.cells[0]!;
    game.click(q, r);
    game.click(q + DIRS[mv.dir]![0], r + DIRS[mv.dir]![1]);
    for (let f = 0; f < 4; f++) game.frame(1000);
  }
}

describe('main.ts The Ballast Mind announce (#749)', () => {
  it.each([
    [0, "Next turn: the Magnetizer's polarity"],
    [2, "Next turn: the Hull's crack"],
    [3, "Next turn: the Pulsar's pulse"],
    [4, "Next turn: the Chaplain's conversion check"],
  ])('fight seed %i names its effect during turn 3 only', async (seed, text) => {
    const game = await boot('?bot=off');
    fightBallast(game, seed);
    plies(game, 3);
    expect(tell()).not.toContain('Next turn');
    plies(game, 1);
    expect(tell()).toContain(text);
    plies(game, 1);
    expect(tell()).toContain(text);
    plies(game, 1);
    expect(tell()).not.toContain('Next turn');
  });

  it('plays the borrowed pulse with the Pulsar shockwave', async () => {
    const game = await boot('?bot=off');
    fightBallast(game, 3);
    plies(game, 5);
    expect(document.body.dataset.pulses).toBeUndefined();
    plies(game, 1);
    expect(document.body.dataset.pulses).toBe('1');
  });
});
