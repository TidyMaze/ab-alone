// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { Axial } from './board';
import { toxinText } from './overseer';
import { boot, type Game } from './test/harness';

// The Overseer on the harness (#635, game-design.md section 7.11): the Overseer, its 6 cores and 6 vents drawn, the
// neurotoxin line, a core pushed onto a vent that slides there then sinks into it, and the win. ?bot=off plays both
// sides from the fixture of the core tests (crates/abalone-core/src/encounter/overseer.rs): the player burns the core
// (1, 1) on (3, 1) at ply 7, then (-2, 1) on (-4, 1); the boss walks 3 marbles onto (4, -1), where they burn, then
// pushes the core (2, -1) onto it itself at ply 24: the player's 6th ejection. Each ply: the cells to click, the
// moved marbles then the target.

type Drawn = { overseer: Axial | null; cores: Axial[]; vents: Axial[] };
const FIXTURE: Axial[][] = [
  [[0, 2], [0, 1]], [[4, -3], [4, -2]], [[-1, 2], [-1, 1]], [[4, -2], [4, -1]],
  [[-1, 1], [0, 1], [1, 1]], [[4, -4], [4, -3]], [[0, 1], [1, 1], [2, 1]], [[4, -3], [4, -2]],
  [[-2, 2], [-1, 1]], [[4, -2], [4, -1]], [[-1, 3], [0, 2]], [[3, -3], [3, -2]],
  [[0, 2], [0, 1]], [[3, -2], [4, -2]], [[-1, 1], [0, 1], [-2, 1]], [[4, -2], [4, -1]],
  [[-2, 1], [-1, 1], [-3, 1]], [[0, -2], [0, -1]], [[-4, 3], [-3, 2]], [[1, -2], [1, -1]],
  [[-3, 2], [-2, 2]], [[0, -1], [1, -1], [2, -1]], [[-2, 2], [-1, 2]], [[1, -1], [2, -1], [3, -1]],
];
const byId = (id: string): HTMLElement => document.getElementById(id)!;
const body = (): DOMStringMap => document.body.dataset;
const tell = (): string | null | undefined => byId('hud').querySelector('.boss .tell')?.textContent;
const drawn = (game: Game): Drawn => game.hook<Drawn>('__overseer');

/** Starts the fight against The Overseer from the mode menu. */
function fightOverseer(game: Game): void {
  vi.spyOn(crypto, 'getRandomValues').mockImplementation((a) => {
    (a as Uint32Array).fill(153);
    return a;
  });
  game.openModes();
  byId('boss-fight').click();
  [...byId('boss-list').querySelectorAll('button')].find((b) => b.textContent === 'The Overseer')!.click();
}

/** Plays plies `from` to `to` (excluded) of the fixture by clicks, the slides and the burns run to their end. */
function plies(game: Game, from: number, to: number): void {
  for (const cells of FIXTURE.slice(from, to)) {
    for (const [q, r] of cells) game.click(q, r);
    for (let n = 0; n < 4; n++) game.frame(1000);
  }
}

describe('main.ts The Overseer (#635)', () => {
  it('plays in the Chapel with its Tally line, draws the Overseer, its cores and vents, and the neurotoxin', async () => {
    const game = await boot('?bot=off', { reducedMotion: true });
    fightOverseer(game);
    expect(body().boss).toBe('overseer');
    expect(body().deck).toBe('chapel');
    expect(game.hud()).toContain('Overseer: cores on file. Six burnt to balance the books.');
    expect(tell()).toBe(toxinText(40));
    const start = drawn(game);
    expect(start.overseer).toEqual([0, 0]);
    expect(start.cores).toHaveLength(6);
    expect(start.cores).toContainEqual([1, 1]);
    expect(start.vents).toHaveLength(6);
    expect(start.vents).toContainEqual([3, 1]);
    plies(game, 0, 2);
    expect(tell()).toBe(toxinText(39));
  });

  it('a core pushed onto a vent slides there, then sinks into it: an ejection for the player', async () => {
    const game = await boot('?bot=off');
    fightOverseer(game);
    plies(game, 0, 6);
    expect(game.hud()).toContain('1/6'); // the boss marble that walked onto (4, -1) burnt
    for (const [q, r] of FIXTURE[6]!) game.click(q, r);
    expect(body().sliding).toBe('1');
    expect(body().burns).toBeUndefined(); // the push slides first
    expect(drawn(game).cores).not.toContainEqual([2, 1]);
    game.frame(1000); // the slide ends: the core sinks into its vent
    expect(body().burns).toBe('1');
    expect(body().ejecting).toBe('tumble');
    expect(drawn(game).cores).toHaveLength(5);
    expect(game.hud()).toContain('2/6');
    plies(game, 7, 8);
    expect(body().burns).toBeUndefined(); // a ply that burns nothing
  });

  it('reduced motion fades the burns, and the boss pushing the 6th core in wins the fight for the player', async () => {
    const game = await boot('?bot=off', { reducedMotion: true });
    fightOverseer(game);
    plies(game, 0, 24);
    expect(body().burns).toBe('1');
    expect(body().ejecting).toBe('fade');
    expect(game.hud()).toContain('Victory');
    expect(drawn(game).cores).toHaveLength(3);
  });

  it('a fight with no clock draws no Overseer and no neurotoxin', async () => {
    const game = await boot('?bot=off');
    expect(drawn(game)).toEqual({ overseer: null, cores: [], vents: [] });
    expect(tell()).toBeUndefined();
  });
});
