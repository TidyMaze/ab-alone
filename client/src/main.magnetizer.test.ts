// @vitest-environment jsdom
import * as THREE from 'three/webgpu';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import type { Axial } from './board';
import { boot, type Game } from './test/harness';

// The Magnetizer on the harness (#645, game-design.md section 7.9): the + and − glyphs over the polarized marbles,
// the ring on a fresh one, the HUD line, and the repulsions played in the engine's order. ?bot=off plays both sides
// from the fixture of the core tests: fight seed 153, quiet boss moves on the right, the player walks the centre
// column up. Turns 2 and 4 polarize its two marbles; on turn 6 the + steps next to the −, which shoves the boss column
// of 3 off at (0, -4). Two more steps of the + eject 2 more: P2.

type Pole = { cell: Axial; sign: number; fresh: boolean };
const DIRS: Axial[] = [[1, 0], [-1, 0], [1, -1], [-1, 1], [0, -1], [0, 1]];
const NW = 4;
const SE = 5;
const FIXTURE: [number, number, number][] = [
  [0, 2, NW], [4, -3, SE], [0, 1, NW], [4, -2, SE], [0, 0, NW], [4, -1, SE], [0, 3, NW], [3, -3, SE], [0, 2, NW],
  [3, -2, SE], [0, 1, NW], [4, -4, SE], [0, 1, NW], [4, -3, SE], [0, 0, NW], [3, -4, SE], [0, 0, NW], [3, -3, SE],
  [0, -1, NW],
];
const byId = (id: string): HTMLElement => document.getElementById(id)!;
const body = (): DOMStringMap => document.body.dataset;
const tell = (): string | null | undefined => byId('hud').querySelector('.boss .tell')?.textContent;
const poles = (game: Game): Pole[] => game.hook<Pole[]>('__polarities');

/** Catches the scene main.ts builds: call before boot. */
function catchScene(): () => THREE.Scene {
  let scene: THREE.Scene | null = null;
  const add = THREE.Object3D.prototype.add;
  const spy = vi.spyOn(THREE.Object3D.prototype, 'add').mockImplementation(function (this: THREE.Object3D, ...objects) {
    if (this instanceof THREE.Scene && !scene) scene = this;
    return add.apply(this, objects);
  });
  onTestFinished(() => spy.mockRestore());
  return () => scene!;
}

/** Starts the fight against The Magnetizer from the mode menu, on fight seed `seed`. */
function fightMagnetizer(game: Game, seed = 153): void {
  vi.spyOn(crypto, 'getRandomValues').mockImplementation((a) => {
    (a as Uint32Array).fill(seed);
    return a;
  });
  game.openModes();
  byId('boss-fight').click();
  [...byId('boss-list').querySelectorAll('button')].find((b) => b.textContent === 'The Magnetizer')!.click();
}

/** Plays plies `from` to `to` (excluded) of the fixture by two clicks each, the slides run to their end. */
function plies(game: Game, from: number, to: number): void {
  for (const [q, r, dir] of FIXTURE.slice(from, to)) {
    game.click(q, r);
    game.click(q + DIRS[dir]![0], r + DIRS[dir]![1]);
    for (let n = 0; n < 4; n++) game.frame(1000);
  }
}

const marbleAt = (game: Game, q: number, r: number): unknown => game.hook('__marbleTurn', q, r);

describe('main.ts The Magnetizer (#645)', () => {
  it('plays in the Furnace with its Tally line, counts the turns to a polarity and draws the glyph with its ring', async () => {
    const scene = catchScene();
    const game = await boot('?bot=off', { reducedMotion: true });
    fightMagnetizer(game);
    expect(body().boss).toBe('magnetizer');
    expect(body().deck).toBe('furnace');
    expect(game.hud()).toContain('Magnetizer: charges on file. Six out to balance the books.');
    expect(tell()).toBe('Polarity in 2 turns');
    expect(poles(game)).toEqual([]);
    plies(game, 0, 1);
    expect(tell()).toBe('Polarity in 1 turn');
    plies(game, 1, 3); // turn 2: the first polarity
    const [first] = poles(game);
    expect(poles(game)).toEqual([{ cell: first!.cell, sign: first!.sign, fresh: true }]);
    expect(Math.abs(first!.sign)).toBe(1);
    expect(tell()).toBe('Polarity in 2 turns');
    const glyphs = scene().getObjectsByProperty('type', 'Sprite') as THREE.Sprite[];
    expect(glyphs).toHaveLength(1); // a sprite always faces the camera
    expect(glyphs[0]!.material.depthTest).toBe(false); // never hidden behind a marble
    plies(game, 3, 4); // the boss ply: the ring is gone, the glyph stays
    expect(poles(game)).toEqual([{ ...first!, fresh: false }]);
    plies(game, 4, 7); // turn 4: the second polarity, the other sign
    expect(poles(game).map((p) => p.sign).sort()).toEqual([-1, 1]);
  });

  it('a + stepping next to a − shoves the boss column of 3: the pair slides apart, the last marble falls', async () => {
    const game = await boot('?bot=off');
    fightMagnetizer(game);
    plies(game, 0, 10);
    const ejections = Number(body().ejections ?? 0);
    game.click(0, 1);
    game.click(0, 0); // turn 6: the + next to the −
    expect(body().sliding).toBe('1');
    expect(marbleAt(game, 0, -4)).not.toBeNull(); // the move slides first, on the board before the repulsion
    expect(poles(game).map((p) => String(p.cell))).toContain('0,0');
    expect(body().repulsions).toBeUndefined();
    game.frame(1000); // the move slide ends: the repulsion plays
    expect(body().repulsions).toBe('1');
    expect(body().sliding).toBe('1');
    expect(Number(body().ejections)).toBe(ejections + 1);
    expect(body().ejecting).toBe('tumble');
    game.frame(1000);
    expect(body().sliding).toBeUndefined();
    expect(poles(game).filter((p) => !p.fresh).map((p) => [String(p.cell), p.sign])).toEqual(
      expect.arrayContaining([['0,-2', -1], ['0,1', 1]]),
    );
    expect(game.hud()).toContain('1/6');
  });

  it('a chain plays its repulsions one after the other, in the engine order', async () => {
    const game = await boot('?bot=off');
    fightMagnetizer(game, 82); // on this seed turn 6 sets off 2 repulsions
    plies(game, 0, 10);
    game.click(0, 1);
    game.click(0, 0);
    game.frame(1000);
    expect(body().repulsions).toBe('1');
    game.frame(1000);
    expect(body().repulsions).toBe('2');
    game.frame(1000);
    expect(body().sliding).toBeUndefined();
  });

  it('reduced motion jumps to the board after the repulsions, and 3 ejections bring P2', async () => {
    const game = await boot('?bot=off', { reducedMotion: true });
    fightMagnetizer(game);
    plies(game, 0, 11);
    expect(body().repulsions).toBeUndefined();
    expect(game.hud()).toContain('1/6');
    expect(marbleAt(game, 0, -2)).not.toBeNull();
    plies(game, 11, 19);
    expect(game.hud()).toContain('3/6');
    expect(tell()).toBe('Polarity every turn');
  });

  it('a new fight during the repulsions draws its own board', async () => {
    const game = await boot('?bot=off');
    fightMagnetizer(game);
    plies(game, 0, 10);
    game.click(0, 1);
    game.click(0, 0);
    fightMagnetizer(game); // Retry by the menu while the move slides
    game.frame(1000);
    game.frame(1000);
    expect(poles(game)).toEqual([]);
    expect(body().repulsions).toBeUndefined();
    expect(marbleAt(game, 0, 2)).not.toBeNull(); // the start position
  });

  it('a game that is no Magnetizer fight draws no polarity', async () => {
    const game = await boot('?bot=off');
    expect(poles(game)).toEqual([]);
    expect(tell()).toBeUndefined();
  });
});
